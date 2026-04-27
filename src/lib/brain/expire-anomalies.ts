import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Auto-expire stale open funnel_anomalies for a project.
 *
 * The rollup mints anomalies whenever a count or rate moves enough to
 * matter. Without expiry they stack forever — myforeversongs hit 1,000+
 * "open" anomalies in a few hours of polling because re-occurrences of
 * the same drop kept minting fresh rows.
 *
 * Rule:
 *   For each (project_id, funnel_stop_id) pair, keep the most recent
 *   open anomaly. Older open ones get status='expired' with metadata
 *   noting they were superseded. Their linked signals (signals.payload
 *   has the funnel_anomaly_id) flip to processed=true so synthesis
 *   doesn't re-triage them.
 *
 * Plus a hard age cap: any open anomaly older than
 * project_settings.anomaly_auto_resolve_days expires too, regardless
 * of whether a newer one exists.
 *
 * Idempotent. Safe to run from the daily pipeline.
 */
export async function expireStaleAnomalies(
  supabase: SupabaseClient,
  projectId: string,
  options: { ageCapDays?: number; dryRun?: boolean } = {},
): Promise<ExpireAnomaliesResult> {
  const result: ExpireAnomaliesResult = {
    projectId,
    consideredOpen: 0,
    supersededExpired: 0,
    ageCappedExpired: 0,
    signalsProcessed: 0,
    errors: [],
  }

  // Resolve the age cap. Caller wins, then project_settings, then 14d.
  let ageCapDays = options.ageCapDays ?? null
  if (ageCapDays === null) {
    const { data: settings } = await supabase
      .from('project_settings')
      .select('anomaly_auto_resolve_days')
      .eq('project_id', projectId)
      .maybeSingle()
    ageCapDays =
      (settings as { anomaly_auto_resolve_days?: number } | null)
        ?.anomaly_auto_resolve_days ?? 14
  }

  const { data: openRows, error } = await supabase
    .from('funnel_anomalies')
    .select('id, funnel_stop_id, signal_id, created_at')
    .eq('project_id', projectId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) {
    result.errors.push(`load anomalies: ${error.message}`)
    return result
  }

  type Row = {
    id: string
    funnel_stop_id: string
    signal_id: string | null
    created_at: string
  }
  const open = (openRows ?? []) as Row[]
  result.consideredOpen = open.length
  if (open.length === 0) return result

  // Group by funnel_stop_id; the first item (newest) wins.
  const seen = new Set<string>()
  const supersededIds: string[] = []
  for (const row of open) {
    if (seen.has(row.funnel_stop_id)) {
      supersededIds.push(row.id)
      continue
    }
    seen.add(row.funnel_stop_id)
  }

  // Apply hard age cap to whatever survived the supersede pass.
  const ageCapMs = ageCapDays * 24 * 60 * 60 * 1000
  const ageCapCutoff = Date.now() - ageCapMs
  const supersededSet = new Set(supersededIds)
  const ageCappedIds = open
    .filter(
      (row) =>
        !supersededSet.has(row.id) &&
        Date.parse(row.created_at) < ageCapCutoff,
    )
    .map((row) => row.id)

  result.supersededExpired = supersededIds.length
  result.ageCappedExpired = ageCappedIds.length

  if (options.dryRun) return result

  const allToExpire = [...supersededIds, ...ageCappedIds]
  if (allToExpire.length === 0) return result

  // Chunk to keep each PATCH request bodies sane. 100 IDs per chunk is well
  // under PostgREST's defaults; 944 in one shot returns Bad Request.
  const CHUNK_SIZE = 100
  const expiredAtIso = new Date().toISOString()
  for (let i = 0; i < allToExpire.length; i += CHUNK_SIZE) {
    const chunk = allToExpire.slice(i, i + CHUNK_SIZE)
    const { error: updErr } = await supabase
      .from('funnel_anomalies')
      .update({
        status: 'expired',
        metadata: {
          auto_expired_at: expiredAtIso,
          reason: 'auto-expired by daily pipeline',
        },
      })
      .in('id', chunk)
    if (updErr) {
      result.errors.push(`update anomalies (chunk ${i / CHUNK_SIZE}): ${updErr.message}`)
    }
  }

  // Flip the linked signals to processed=true so synthesis stops re-triaging.
  const expiredSet = new Set(allToExpire)
  const expiredSignalIds = open
    .filter((row) => expiredSet.has(row.id))
    .map((row) => row.signal_id)
    .filter((id): id is string => typeof id === 'string')

  for (let i = 0; i < expiredSignalIds.length; i += CHUNK_SIZE) {
    const chunk = expiredSignalIds.slice(i, i + CHUNK_SIZE)
    const { error: sigErr } = await supabase
      .from('signals')
      .update({ processed: true })
      .in('id', chunk)
      .eq('processed', false)
    if (sigErr) {
      result.errors.push(`process signals (chunk ${i / CHUNK_SIZE}): ${sigErr.message}`)
    } else {
      result.signalsProcessed += chunk.length
    }
  }

  return result
}

export type ExpireAnomaliesResult = {
  projectId: string
  consideredOpen: number
  supersededExpired: number
  ageCappedExpired: number
  signalsProcessed: number
  errors: string[]
}
