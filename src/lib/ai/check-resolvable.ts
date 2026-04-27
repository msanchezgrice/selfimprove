import { createAdminClient } from '@/lib/supabase/admin'
import type {
  BrainRunRow,
  ResolverAuditFix,
  ResolverAuditIssue,
  ResolverTriggerRow,
} from '@/lib/types/database'

import { BRAIN_SKILLS, type BrainSkill } from '@/lib/brain/design'
import {
  formatResolvedContextForPrompt,
  resolveContextForTask,
} from '@/lib/brain/resolve-context'
import {
  completeBrainRun,
  failBrainRun,
  recordWriteCompleted,
  startBrainRun,
} from '@/lib/brain/runs'
import {
  DEFAULT_TRIGGER_CORPUS,
  evaluateTriggerCorpus,
  summarizeTriggerEval,
  type TriggerEvalCase,
  type TriggerEvalResult,
} from '@/lib/brain/trigger-eval'

import { callClaude } from './call-claude'

/**
 * `check-resolvable` runner.
 *
 * Implements docs/brain/skills/check-resolvable.md. Runs deterministic
 * reachability + overlap audits against the skill registry and
 * `resolver_triggers`, inspects recent `brain_runs` for misrouting signal,
 * then asks the model to propose markdown-only fixes for the ambiguous
 * cases. Writes a `resolver_audits` row with the full issue + fix list.
 */

export type ResolverAuditInput = {
  projectId: string
  /** How far back to scan brain_runs for misrouting evidence. Default: 7 days. */
  windowDays?: number
  /** Skip the model step and return only deterministic issues. */
  deterministicOnly?: boolean
  /** Override the hand-curated phrase corpus. Defaults to DEFAULT_TRIGGER_CORPUS. */
  triggerCorpus?: TriggerEvalCase[]
  model?: string
}

export type ResolverAuditResult = {
  auditId: string | null
  runId: string | null
  issues: ResolverAuditIssue[]
  fixes: ResolverAuditFix[]
  summary: string
  /** Trigger-eval outcome surface so callers can render a pass/fail table. */
  triggerEval: {
    results: TriggerEvalResult[]
    pass: number
    total: number
    pass_rate: number
  }
}

export type AuditInputBundle = {
  skills: BrainSkill[]
  triggers: Pick<
    ResolverTriggerRow,
    'resolver_type' | 'trigger_phrase' | 'trigger_kind' | 'target_skill_slug' | 'priority' | 'status'
  >[]
  recentRuns: Pick<BrainRunRow, 'status' | 'error' | 'skill_slug' | 'task_type' | 'created_at'>[]
}

/**
 * Pure deterministic audit. Exported so the tests can exercise every branch
 * without the DB. Returns both `issues` (what's wrong) and `fixes`
 * (candidate markdown-only fixes a maintainer can apply).
 */
export function auditResolverHealth(input: AuditInputBundle): {
  issues: ResolverAuditIssue[]
  fixes: ResolverAuditFix[]
} {
  const activeTriggers = input.triggers.filter((trigger) => trigger.status !== 'retired')
  const skillSlugs = new Set(input.skills.map((skill) => skill.slug))
  const triggersBySkill = new Map<string, typeof activeTriggers>()
  for (const trigger of activeTriggers) {
    const existing = triggersBySkill.get(trigger.target_skill_slug) ?? []
    existing.push(trigger)
    triggersBySkill.set(trigger.target_skill_slug, existing)
  }

  const issues: ResolverAuditIssue[] = []
  const fixes: ResolverAuditFix[] = []

  // 1. Dark capabilities: skill exists, zero triggers point at it.
  for (const skill of input.skills) {
    const matches = triggersBySkill.get(skill.slug) ?? []
    if (matches.length === 0) {
      issues.push({
        kind: 'dark_capability',
        description: `Skill \`${skill.slug}\` has zero triggers in resolver_triggers. No user prompt, cron, or webhook can reach it.`,
        evidence: { task_type: skill.taskType, name: skill.name },
      })
      fixes.push({
        kind: 'add_trigger',
        target: skill.slug,
        proposal: `Add at least one user_phrase trigger referencing \`${skill.slug}\` in resolver_triggers (e.g. "${skill.name.toLowerCase()}"). See docs/brain/RESOLVER.md.`,
      })
    }
  }

  // 2. Unmatched target: trigger points at an unknown skill slug.
  for (const trigger of activeTriggers) {
    if (!skillSlugs.has(trigger.target_skill_slug)) {
      issues.push({
        kind: 'unmatched',
        description: `Trigger \`${trigger.trigger_phrase}\` (${trigger.resolver_type}) targets unknown skill \`${trigger.target_skill_slug}\`.`,
        evidence: { trigger_phrase: trigger.trigger_phrase, resolver_type: trigger.resolver_type },
      })
      fixes.push({
        kind: 'remove_trigger',
        target: trigger.trigger_phrase,
        proposal: `Remove or repoint trigger \`${trigger.trigger_phrase}\` — no skill with slug \`${trigger.target_skill_slug}\` is registered.`,
      })
    }
  }

  // 3. Overlapping triggers: same phrase -> multiple skills in the same
  // resolver lane; the one with higher priority silently wins.
  const byPhrase = new Map<string, typeof activeTriggers>()
  for (const trigger of activeTriggers) {
    const key = `${trigger.resolver_type}::${trigger.trigger_phrase.toLowerCase()}`
    const list = byPhrase.get(key) ?? []
    list.push(trigger)
    byPhrase.set(key, list)
  }
  for (const [key, list] of byPhrase) {
    const distinctSkills = new Set(list.map((trigger) => trigger.target_skill_slug))
    if (distinctSkills.size > 1) {
      issues.push({
        kind: 'overlap',
        description: `Trigger \`${key}\` maps to multiple skills: ${[...distinctSkills].join(', ')}. The highest-priority mapping silently wins.`,
        evidence: { phrase: key, skills: [...distinctSkills] },
      })
      fixes.push({
        kind: 'change_priority',
        target: key,
        proposal: `Disambiguate trigger \`${key}\` by lowering priority on the losing skill or retiring it. See the filing rules overlap guidance.`,
      })
    }
  }

  // 4. Misrouting evidence from recent runs: failed runs with "no skill"
  // or unknown-task errors, and any skill_slug on a brain_run that is not
  // in the current registry.
  for (const run of input.recentRuns) {
    if (run.skill_slug && !skillSlugs.has(run.skill_slug)) {
      issues.push({
        kind: 'unmatched',
        description: `brain_runs row references retired or renamed skill \`${run.skill_slug}\`.`,
        evidence: { task_type: run.task_type, at: run.created_at },
      })
    }
    if (run.status === 'failed' && run.error && /no skill|unknown task|not resolvable/i.test(run.error)) {
      issues.push({
        kind: 'false_negative',
        description: `Recent run failed to resolve a skill: ${run.error}`,
        evidence: { task_type: run.task_type, at: run.created_at },
      })
    }
  }

  return { issues, fixes }
}

const AUDIT_SCHEMA = {
  type: 'object' as const,
  properties: {
    summary: { type: 'string' },
    additional_fixes: {
      type: 'array',
      description:
        'Model-proposed markdown-only fixes on top of the deterministic ones. Only include when there is clear evidence the same misrouting will recur.',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['add_trigger', 'remove_trigger', 'change_priority', 'add_fallback', 'edit_skill'],
          },
          target: { type: 'string' },
          proposal: { type: 'string' },
        },
        required: ['kind', 'target', 'proposal'],
      },
    },
  },
  required: ['summary', 'additional_fixes'],
}

export async function runResolverAudit(
  input: ResolverAuditInput,
): Promise<ResolverAuditResult> {
  const supabase = createAdminClient()
  const windowDays = input.windowDays ?? 7
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
  const windowEnd = new Date()

  const { data: triggerRows } = await supabase
    .from('resolver_triggers')
    .select('resolver_type, trigger_phrase, trigger_kind, target_skill_slug, priority, status')
  const triggers =
    (triggerRows ?? []) as AuditInputBundle['triggers']

  const { data: runRows } = await supabase
    .from('brain_runs')
    .select('status, error, skill_slug, task_type, created_at')
    .eq('project_id', input.projectId)
    .gte('created_at', windowStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(500)
  const recentRuns = (runRows ?? []) as AuditInputBundle['recentRuns']

  const { issues, fixes } = auditResolverHealth({
    skills: BRAIN_SKILLS,
    triggers,
    recentRuns,
  })

  // v1.1: run trigger evals against the hand-curated corpus so false
  // negatives / false positives land in the audit output. See
  // docs/brain/project-brain-v1.md > Resolver Hygiene item 1.
  const triggerEvalResults = evaluateTriggerCorpus(
    triggers,
    input.triggerCorpus ?? DEFAULT_TRIGGER_CORPUS,
  )
  const triggerEvalSummary = summarizeTriggerEval(triggerEvalResults)

  for (const result of triggerEvalResults) {
    if (result.outcome === 'pass') continue
    issues.push({
      kind: result.outcome === 'false_positive' ? 'false_positive' : 'false_negative',
      description: `Trigger eval "${result.case.phrase}" (expects ${result.case.expectedSkill}): ${result.note}`,
      evidence: {
        case_id: result.case.id,
        matched_skill: result.matchedSkill,
        matched_phrase: result.matchedTriggerPhrase,
        score: result.matchScore,
      },
    })
    if (result.outcome === 'false_negative') {
      fixes.push({
        kind: 'add_trigger',
        target: result.case.expectedSkill,
        proposal: `Add a trigger for "${result.case.phrase}" -> \`${result.case.expectedSkill}\` (no active trigger above threshold).`,
      })
    }
  }

  const context = await resolveContextForTask(supabase, input.projectId, 'audit_resolver')
  const brainContextBlock = formatResolvedContextForPrompt(context)

  const run = await startBrainRun(supabase, {
    projectId: input.projectId,
    taskType: 'audit_resolver',
    skillSlug: 'check-resolvable',
    context,
    inputSummary: {
      window_days: windowDays,
      triggers: triggers.length,
      runs_in_window: recentRuns.length,
      issues_before_model: issues.length,
      trigger_eval: {
        total: triggerEvalSummary.total,
        pass: triggerEvalSummary.pass,
        false_negative: triggerEvalSummary.false_negative,
        false_positive: triggerEvalSummary.false_positive,
        pass_rate: triggerEvalSummary.pass_rate,
      },
    },
    writesPlanned: ['resolver_audits'],
  })

  try {
    let modelSummary = `Deterministic audit found ${issues.length} issue(s) and ${fixes.length} candidate fix(es).`
    const additionalFixes: ResolverAuditFix[] = []

    if (!input.deterministicOnly && issues.length > 0) {
      const prompt = buildAuditPrompt({
        skills: BRAIN_SKILLS,
        triggers,
        recentRuns,
        issues,
        brainContextBlock,
      })

      const modelOut = await callClaude<{
        summary: string
        additional_fixes: ResolverAuditFix[]
      }>({
        prompt,
        system:
          'You are running the check-resolvable skill. Only propose fixes when there is evidence the same misrouting will recur. Prefer markdown-only edits (trigger examples, priority changes, fallback paths).',
        schema: AUDIT_SCHEMA,
        schemaName: 'resolver_audit',
        schemaDescription: 'Summarize resolver drift and propose markdown-only fixes.',
        model: input.model ?? 'claude-sonnet-4-6',
        maxTokens: 2048,
      })

      modelSummary = modelOut.summary
      for (const fix of modelOut.additional_fixes) {
        additionalFixes.push(fix)
      }
    }

    const allFixes = [...fixes, ...additionalFixes]

    const { data: auditRow } = await supabase
      .from('resolver_audits')
      .insert({
        project_id: input.projectId,
        audit_type: 'check_resolvable',
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        issues_found: issues,
        suggested_fixes: allFixes,
        applied_changes: [],
        summary: modelSummary,
        run_id: run.id,
      })
      .select('id')
      .single()

    if (auditRow) recordWriteCompleted(run, 'resolver_audits')

    await completeBrainRun(supabase, run, {
      resultSummary: {
        audit_id: (auditRow as { id: string } | null)?.id ?? null,
        issues_count: issues.length,
        fixes_count: allFixes.length,
        window_days: windowDays,
        trigger_eval_pass_rate: triggerEvalSummary.pass_rate,
      },
    })

    return {
      auditId: (auditRow as { id: string } | null)?.id ?? null,
      runId: run.id,
      issues,
      fixes: allFixes,
      summary: modelSummary,
      triggerEval: {
        results: triggerEvalResults,
        pass: triggerEvalSummary.pass,
        total: triggerEvalSummary.total,
        pass_rate: triggerEvalSummary.pass_rate,
      },
    }
  } catch (err) {
    await failBrainRun(supabase, run, err instanceof Error ? err : String(err))
    throw err
  }
}

type AuditPromptArgs = {
  skills: BrainSkill[]
  triggers: AuditInputBundle['triggers']
  recentRuns: AuditInputBundle['recentRuns']
  issues: ResolverAuditIssue[]
  brainContextBlock: string
}

function buildAuditPrompt(args: AuditPromptArgs): string {
  const { skills, triggers, recentRuns, issues, brainContextBlock } = args

  const skillLines = skills
    .map((skill) => `- \`${skill.slug}\` (${skill.taskType}) — ${skill.description}`)
    .join('\n')
  const triggerLines = triggers
    .slice(0, 100)
    .map(
      (trigger) =>
        `- [${trigger.status}] ${trigger.resolver_type}/${trigger.trigger_kind}: "${trigger.trigger_phrase}" -> \`${trigger.target_skill_slug}\` (p${trigger.priority})`,
    )
    .join('\n')
  const runLines = recentRuns
    .slice(0, 40)
    .map(
      (run) =>
        `- [${run.status}] ${run.task_type} via \`${run.skill_slug}\` @ ${run.created_at}${run.error ? ` — error: ${run.error}` : ''}`,
    )
    .join('\n')
  const issueLines = issues
    .map((issue) => `- [${issue.kind}] ${issue.description}`)
    .join('\n')

  return `You are running the check-resolvable skill.
Follow docs/brain/skills/check-resolvable.md. Propose markdown-only fixes first. Do NOT invent new code paths.

${brainContextBlock ? `${brainContextBlock}\n\n` : ''}## Skill Registry
${skillLines}

## Active Triggers (truncated)
${triggerLines || '_none_'}

## Recent brain_runs (truncated)
${runLines || '_none_'}

## Deterministic Issues Found
${issueLines || '- none'}

Respond with a concise summary and only ADDITIONAL fixes beyond the deterministic list. Do not duplicate the deterministic fixes — they are already recorded.`
}
