import type { SupabaseClient } from '@supabase/supabase-js'

import type { BrainRunRow, BrainTaskType } from '@/lib/types/database'

import type { ResolvedContext } from './resolve-context'

export type BrainRunHandle = {
  id: string | null
  taskType: BrainTaskType
  skillSlug: string
  projectId: string
  writesPlanned: string[]
  writesCompleted: string[]
  startedAt: string
  persisted: boolean
}

export type StartRunInput = {
  projectId: string
  taskType: BrainTaskType
  skillSlug: string
  context?: ResolvedContext | null
  inputSummary?: Record<string, unknown>
  writesPlanned?: string[]
}

export type CompleteRunInput = {
  resultSummary?: Record<string, unknown>
  additionalWritesCompleted?: string[]
}

/**
 * Start a `brain_runs` row for an AI task.
 *
 * Never throws: run logging is observability, not a hard requirement. If the
 * insert fails (permission, offline, migration out of date) we return a
 * handle with `persisted: false` so callers can still track writes locally
 * and we do not lose the actual product work.
 */
export async function startBrainRun(
  supabase: SupabaseClient,
  input: StartRunInput,
): Promise<BrainRunHandle> {
  const startedAt = new Date().toISOString()
  const resolvedContextPayload = input.context
    ? input.context.pages.map((entry) => ({
        kind: entry.kind,
        priority: entry.priority,
        required: entry.required,
        missing: entry.missing,
        page_id: entry.page?.id ?? null,
        version_id: entry.version?.id ?? null,
      }))
    : []

  const writesPlanned = [...(input.writesPlanned ?? [])]

  const { data, error } = await supabase
    .from('brain_runs')
    .insert({
      project_id: input.projectId,
      task_type: input.taskType,
      skill_slug: input.skillSlug,
      status: 'running',
      resolved_context: resolvedContextPayload,
      input_summary: input.inputSummary ?? {},
      writes_planned: writesPlanned,
      writes_completed: [],
      started_at: startedAt,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.warn('[brain/runs] failed to start run', {
      taskType: input.taskType,
      skill: input.skillSlug,
      error: error?.message,
    })
    return {
      id: null,
      taskType: input.taskType,
      skillSlug: input.skillSlug,
      projectId: input.projectId,
      writesPlanned,
      writesCompleted: [],
      startedAt,
      persisted: false,
    }
  }

  return {
    id: (data as { id: string }).id,
    taskType: input.taskType,
    skillSlug: input.skillSlug,
    projectId: input.projectId,
    writesPlanned,
    writesCompleted: [],
    startedAt,
    persisted: true,
  }
}

/** Record that a planned write succeeded, so partial failures are inspectable. */
export function recordWriteCompleted(handle: BrainRunHandle, write: string): void {
  handle.writesCompleted.push(write)
}

export async function completeBrainRun(
  supabase: SupabaseClient,
  handle: BrainRunHandle,
  input: CompleteRunInput = {},
): Promise<void> {
  const writesCompleted = [
    ...handle.writesCompleted,
    ...(input.additionalWritesCompleted ?? []),
  ]

  if (!handle.persisted || !handle.id) return

  const { error } = await supabase
    .from('brain_runs')
    .update({
      status: 'completed',
      result_summary: input.resultSummary ?? {},
      writes_completed: writesCompleted,
      completed_at: new Date().toISOString(),
    })
    .eq('id', handle.id)

  if (error) {
    console.warn('[brain/runs] failed to complete run', {
      runId: handle.id,
      error: error.message,
    })
  }
}

export async function failBrainRun(
  supabase: SupabaseClient,
  handle: BrainRunHandle,
  error: Error | string,
): Promise<void> {
  if (!handle.persisted || !handle.id) return

  const message = error instanceof Error ? error.message : String(error)

  const { error: updateError } = await supabase
    .from('brain_runs')
    .update({
      status: 'failed',
      error: message,
      writes_completed: handle.writesCompleted,
      completed_at: new Date().toISOString(),
    })
    .eq('id', handle.id)

  if (updateError) {
    console.warn('[brain/runs] failed to mark run as failed', {
      runId: handle.id,
      error: updateError.message,
    })
  }
}

/**
 * Fetch the N most recent completed runs for a task. Useful for the
 * check-resolvable audit and for surfacing "what happened last time" in
 * dashboards.
 */
export async function recentBrainRuns(
  supabase: SupabaseClient,
  projectId: string,
  taskType: BrainTaskType,
  limit = 5,
): Promise<BrainRunRow[]> {
  const { data } = await supabase
    .from('brain_runs')
    .select('*')
    .eq('project_id', projectId)
    .eq('task_type', taskType)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as BrainRunRow[]
}
