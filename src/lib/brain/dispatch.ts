import type { SupabaseClient } from '@supabase/supabase-js'

import type { BrainTaskType, ResolverTriggerRow } from '@/lib/types/database'

import { BRAIN_SKILLS } from './design'
import {
  matchPhrase,
  TRIGGER_MATCH_THRESHOLD,
  type ActiveTrigger,
} from './trigger-eval'

/**
 * Free-text prompt → skill dispatcher.
 *
 * The spec's Resolver Hygiene item 3 says:
 *   "Logging unmatched prompts and wrong-skill matches through brain_runs."
 *
 * There isn't yet a chat/CLI surface that routes free-text user input to
 * skills in this codebase — most invocations are hardcoded in API routes.
 * This module gives any future surface (CLI, chat, webhook) a single entry
 * point that (a) uses the live `resolver_triggers` table, (b) falls back
 * to the typed `BRAIN_SKILLS` registry, and (c) always records a
 * `brain_runs` row so misses are visible to `check-resolvable`.
 *
 * Matching is deliberately read-only here — it does NOT invoke the skill.
 * That's a downstream concern (which runner to call, what inputs, etc.);
 * this module answers "given this prompt, which skill did we route to".
 */

export type DispatchInput = {
  projectId: string
  phrase: string
  resolverType?: 'skill' | 'filing' | 'context' | 'action'
  /** Optional actor label for the brain_runs row (e.g. 'cli', 'chat', 'api'). */
  actor?: string
  threshold?: number
}

export type DispatchDecision = {
  matched: boolean
  skillSlug: string | null
  taskType: BrainTaskType | null
  triggerPhrase: string | null
  score: number
  reason: string
  runId: string | null
}

export async function dispatchPrompt(
  supabase: SupabaseClient,
  input: DispatchInput,
): Promise<DispatchDecision> {
  const threshold = input.threshold ?? TRIGGER_MATCH_THRESHOLD
  const resolverType = input.resolverType ?? 'skill'

  const { data: triggerRows } = await supabase
    .from('resolver_triggers')
    .select('resolver_type, trigger_phrase, trigger_kind, target_skill_slug, priority, status')
  const triggers = ((triggerRows ?? []) as ActiveTrigger[]).filter(
    (trigger) => trigger.resolver_type === resolverType,
  )

  const match = matchPhrase(input.phrase, triggers, resolverType, threshold)

  if (!match) {
    const decision: DispatchDecision = {
      matched: false,
      skillSlug: null,
      taskType: null,
      triggerPhrase: null,
      score: 0,
      reason: `No active trigger matched "${input.phrase}" above threshold ${threshold}.`,
      runId: null,
    }
    decision.runId = await recordDispatchRun(supabase, input, decision)
    return decision
  }

  const registered = BRAIN_SKILLS.find((skill) => skill.slug === match.skill)
  const taskType = registered?.taskType ?? null

  const decision: DispatchDecision = {
    matched: true,
    skillSlug: match.skill,
    taskType,
    triggerPhrase: match.phrase,
    score: match.score,
    reason: registered
      ? `Routed to \`${match.skill}\` via "${match.phrase}" (${match.exact ? 'exact' : `cosine ${match.score.toFixed(2)}`}).`
      : `Trigger points at unknown skill \`${match.skill}\`.`,
    runId: null,
  }
  decision.runId = await recordDispatchRun(supabase, input, decision)
  return decision
}

/**
 * Record the dispatch into `brain_runs` so the resolver audit can see it.
 *
 * Matched dispatches land with `task_type` = the registered skill's type
 * and `status='completed'`. Unmatched or mis-targeted ones land with
 * `task_type='audit_resolver'` and `status='failed'` so the existing
 * false-negative detector in `check-resolvable.ts` picks them up.
 */
async function recordDispatchRun(
  supabase: SupabaseClient,
  input: DispatchInput,
  decision: DispatchDecision,
): Promise<string | null> {
  const now = new Date().toISOString()
  const matched = decision.matched && decision.taskType !== null

  const payload = {
    project_id: input.projectId,
    task_type: matched ? decision.taskType : ('audit_resolver' as BrainTaskType),
    skill_slug: decision.skillSlug ?? 'dispatch:unmatched',
    status: matched ? 'completed' : 'failed',
    resolved_context: [],
    input_summary: {
      dispatch: {
        phrase: input.phrase,
        resolver_type: input.resolverType ?? 'skill',
        actor: input.actor ?? 'unknown',
        threshold: input.threshold ?? TRIGGER_MATCH_THRESHOLD,
      },
    },
    result_summary: {
      matched: decision.matched,
      skill_slug: decision.skillSlug,
      trigger_phrase: decision.triggerPhrase,
      score: decision.score,
    },
    writes_planned: [],
    writes_completed: [],
    error: matched ? null : decision.reason,
    started_at: now,
    completed_at: now,
  }

  const { data, error } = await supabase
    .from('brain_runs')
    .insert(payload)
    .select('id')
    .single()

  if (error || !data) {
    console.warn('[brain/dispatch] could not record dispatch run', {
      error: error?.message,
    })
    return null
  }
  return (data as { id: string }).id
}
