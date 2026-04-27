import { cosineSimilarity, termFrequency, tokenize } from '@/lib/ai/dedup-signals'

import type { ResolverTriggerRow } from '@/lib/types/database'

/**
 * Trigger evaluation — Resolver Hygiene item 1 from project-brain-v1.md.
 *
 *   "Trigger evals for real user/task phrasing."
 *
 * Given the current `resolver_triggers` table and a small corpus of
 * "real user phrasing → expected skill" pairs, this module simulates the
 * skill-router match and flags false negatives / false positives so
 * `check-resolvable` can surface them into `resolver_audits`.
 *
 * The matcher is intentionally simple (exact + cosine) so it's predictable.
 * The source-of-truth for how an agent surface dispatches user input is
 * a separate concern — this is the test harness, not the router.
 */

export type TriggerEvalCase = {
  id: string
  phrase: string
  expectedSkill: string
  resolverType: 'skill' | 'filing' | 'context' | 'action'
  /** Optional kind hint for the dispatcher: 'user_phrase' (default), 'cron', 'webhook'. */
  triggerKind?: 'user_phrase' | 'cron' | 'webhook' | 'policy'
  /** One-line rationale for why this case exists. Shown in audit output. */
  why?: string
}

export type TriggerEvalResult = {
  case: TriggerEvalCase
  matchedSkill: string | null
  matchedTriggerPhrase: string | null
  matchScore: number
  outcome: 'pass' | 'false_negative' | 'false_positive' | 'ambiguous'
  note: string
}

export type ActiveTrigger = Pick<
  ResolverTriggerRow,
  'resolver_type' | 'trigger_phrase' | 'trigger_kind' | 'target_skill_slug' | 'priority' | 'status'
>

/** Minimum similarity before a phrase is considered a match. */
export const TRIGGER_MATCH_THRESHOLD = 0.6

/**
 * Default hand-curated corpus. Covers the phrasings called out in
 * docs/brain/RESOLVER.md plus a small set of paraphrases per skill so we
 * catch routing drift when someone renames a skill or retires a trigger.
 *
 * Keep this list small and diverse. The goal is not "every possible phrase"
 * — it's "one or two representative phrasings per skill family".
 */
export const DEFAULT_TRIGGER_CORPUS: TriggerEvalCase[] = [
  // roadmap-synthesis
  { id: 'rs-1', phrase: 'refresh the roadmap', expectedSkill: 'roadmap-synthesis', resolverType: 'skill', why: 'primary phrasing from RESOLVER.md' },
  { id: 'rs-2', phrase: 'what should we build next?', expectedSkill: 'roadmap-synthesis', resolverType: 'skill' },
  { id: 'rs-3', phrase: 'rerank the backlog', expectedSkill: 'roadmap-synthesis', resolverType: 'skill' },
  { id: 'rs-4', phrase: 'update the ranked roadmap', expectedSkill: 'roadmap-synthesis', resolverType: 'skill', why: 'paraphrase' },

  // prd-author
  { id: 'prd-1', phrase: 'expand this into a PRD', expectedSkill: 'prd-author', resolverType: 'skill' },
  { id: 'prd-2', phrase: 'make this implementation-ready', expectedSkill: 'prd-author', resolverType: 'skill' },
  { id: 'prd-3', phrase: 'draft a product requirements doc', expectedSkill: 'prd-author', resolverType: 'skill', why: 'paraphrase' },

  // project-enrichment
  { id: 'pe-1', phrase: 'ingest this feedback batch', expectedSkill: 'project-enrichment', resolverType: 'skill' },
  { id: 'pe-2', phrase: 'refresh repo understanding', expectedSkill: 'project-enrichment', resolverType: 'skill' },
  { id: 'pe-3', phrase: 'pull in the latest scans', expectedSkill: 'project-enrichment', resolverType: 'skill' },
  { id: 'pe-4', phrase: 'scan.codebase.completed', expectedSkill: 'project-enrichment', resolverType: 'skill', triggerKind: 'webhook' },

  // impact-review
  { id: 'ir-1', phrase: 'did this ship work?', expectedSkill: 'impact-review', resolverType: 'skill' },
  { id: 'ir-2', phrase: 'was the forecast right', expectedSkill: 'impact-review', resolverType: 'skill' },
  { id: 'ir-3', phrase: 'shipped_change.metrics_ready', expectedSkill: 'impact-review', resolverType: 'skill', triggerKind: 'webhook' },

  // implementation-brief
  { id: 'ib-1', phrase: 'implement this', expectedSkill: 'implementation-brief', resolverType: 'skill' },
  { id: 'ib-2', phrase: 'queue the build', expectedSkill: 'implementation-brief', resolverType: 'skill' },
  { id: 'ib-3', phrase: 'roadmap_item.approved', expectedSkill: 'implementation-brief', resolverType: 'skill', triggerKind: 'webhook' },

  // check-resolvable
  { id: 'cr-1', phrase: 'audit the resolver', expectedSkill: 'check-resolvable', resolverType: 'skill' },
  { id: 'cr-2', phrase: "why didn't the right skill fire?", expectedSkill: 'check-resolvable', resolverType: 'skill' },
  { id: 'cr-3', phrase: 'find dark capabilities', expectedSkill: 'check-resolvable', resolverType: 'skill' },
]

/**
 * Simulate dispatch of a single phrase against the active trigger table.
 *
 * Match strategy (deterministic):
 *   1. Filter triggers by resolver_type and non-retired status.
 *   2. Consider a trigger a candidate if:
 *        - its phrase equals the input (case-insensitive), or
 *        - cosine similarity between phrase token frequencies >= threshold.
 *   3. Among candidates, prefer exact matches; then the highest cosine;
 *      then the lowest `priority` value (lower = higher urgency).
 *   4. Return the winning skill + matched phrase + score.
 */
export function matchPhrase(
  phrase: string,
  triggers: ActiveTrigger[],
  resolverType: ActiveTrigger['resolver_type'] = 'skill',
  threshold: number = TRIGGER_MATCH_THRESHOLD,
): { skill: string; phrase: string; score: number; exact: boolean } | null {
  const active = triggers.filter((trigger) => trigger.resolver_type === resolverType && trigger.status !== 'retired')
  if (active.length === 0) return null

  const normalizedInput = phrase.trim().toLowerCase()
  const inputTokens = tokenize(phrase)
  const inputTf = termFrequency(inputTokens)

  type Candidate = { trigger: ActiveTrigger; score: number; exact: boolean }
  const candidates: Candidate[] = []

  for (const trigger of active) {
    const triggerNormalized = trigger.trigger_phrase.trim().toLowerCase()
    if (triggerNormalized === normalizedInput) {
      candidates.push({ trigger, score: 1, exact: true })
      continue
    }
    const tokens = tokenize(trigger.trigger_phrase)
    if (tokens.length === 0 || inputTokens.length === 0) continue
    const score = cosineSimilarity(inputTf, termFrequency(tokens))
    if (score >= threshold) {
      candidates.push({ trigger, score, exact: false })
    }
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1
    if (a.score !== b.score) return b.score - a.score
    return a.trigger.priority - b.trigger.priority
  })

  const winner = candidates[0]
  return {
    skill: winner.trigger.target_skill_slug,
    phrase: winner.trigger.trigger_phrase,
    score: winner.score,
    exact: winner.exact,
  }
}

/** Run the full corpus against the active trigger set. Pure. */
export function evaluateTriggerCorpus(
  triggers: ActiveTrigger[],
  corpus: TriggerEvalCase[] = DEFAULT_TRIGGER_CORPUS,
  threshold: number = TRIGGER_MATCH_THRESHOLD,
): TriggerEvalResult[] {
  return corpus.map((entry) => {
    const match = matchPhrase(entry.phrase, triggers, entry.resolverType, threshold)
    if (!match) {
      return {
        case: entry,
        matchedSkill: null,
        matchedTriggerPhrase: null,
        matchScore: 0,
        outcome: 'false_negative',
        note: `No active trigger matched "${entry.phrase}" above threshold ${threshold}.`,
      }
    }
    if (match.skill === entry.expectedSkill) {
      return {
        case: entry,
        matchedSkill: match.skill,
        matchedTriggerPhrase: match.phrase,
        matchScore: match.score,
        outcome: 'pass',
        note: match.exact
          ? 'Exact-phrase match.'
          : `Cosine match @ ${match.score.toFixed(2)}.`,
      }
    }
    // A trigger matched but routed to the wrong skill: spec calls that a
    // false positive (the wrong skill fires).
    return {
      case: entry,
      matchedSkill: match.skill,
      matchedTriggerPhrase: match.phrase,
      matchScore: match.score,
      outcome: 'false_positive',
      note: `Expected ${entry.expectedSkill}, routed to ${match.skill} via "${match.phrase}".`,
    }
  })
}

/** Summary counters for the result set. */
export function summarizeTriggerEval(results: TriggerEvalResult[]): {
  total: number
  pass: number
  false_negative: number
  false_positive: number
  ambiguous: number
  pass_rate: number
} {
  const counts = { pass: 0, false_negative: 0, false_positive: 0, ambiguous: 0 }
  for (const result of results) counts[result.outcome] += 1
  const total = results.length
  const pass_rate = total === 0 ? 0 : counts.pass / total
  return {
    total,
    pass: counts.pass,
    false_negative: counts.false_negative,
    false_positive: counts.false_positive,
    ambiguous: counts.ambiguous,
    pass_rate,
  }
}
