import type { SupabaseClient } from '@supabase/supabase-js'

import { funnelClusterSlug } from './funnel'
import {
  buildFunnelStopUpdate,
  detectAnomaly,
  inferUpstream,
  type AnomalyDecision,
  type FunnelStopRow as PureFunnelStopRow,
  type FunnelStopUpdate,
} from './funnel'
import {
  getEventCounts,
  getEventTrendsWeekOverWeek,
  getInsightSnapshot,
  type PostHogConfig,
} from '@/lib/posthog/client'
import type {
  FunnelAnomalyInsert,
  FunnelStopInsert,
  FunnelStopRow,
  OpportunityClusterRow,
  PosthogSubscriptionRow,
  ProjectSettingsRow,
  SignalInsert,
} from '@/lib/types/database'

/**
 * Project-level funnel rollup. One PostHog round-trip per project, then
 * per-event upserts + anomaly detection + signal minting + cluster
 * bootstrapping. Used by:
 *   - /api/cron/funnel-rollup        (daily, via vercel cron)
 *   - /api/webhooks/posthog          (real-time, on alert payloads)
 *   - scripts/backfill-funnel.ts     (one-shot for historical data)
 *
 * Source-of-truth for the rollup behaviour. The cron and webhook are thin
 * wrappers; the routine here is what actually does the work.
 */

export type RollupResult = {
  projectId: string
  stopsTouched: number
  stopsCreated: number
  anomaliesMinted: number
  signalsMinted: number
  clustersCreated: number
  totalEventsConsidered: number
  windowDays: number
  errors: string[]
}

export type RollupOptions = {
  /** Trailing window for the count_7d / trend computations. Default 7. */
  windowDays?: number
  /** Source label written onto funnel_anomalies.source. Defaults to 'cron'. */
  source?: 'cron' | 'webhook' | 'backtest' | 'manual'
  /** Skip signal/cluster minting (used by the backtest harness). */
  dryRun?: boolean
}

const DEFAULT_WINDOW_DAYS = 7
const COUNT_FLOOR = 5 // ignore events that fired fewer than this many times in 28d

export async function rollupProjectFunnel(
  supabase: SupabaseClient,
  projectId: string,
  options: RollupOptions = {},
): Promise<RollupResult> {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS
  const source = options.source ?? 'cron'
  const result: RollupResult = {
    projectId,
    stopsTouched: 0,
    stopsCreated: 0,
    anomaliesMinted: 0,
    signalsMinted: 0,
    clustersCreated: 0,
    totalEventsConsidered: 0,
    windowDays,
    errors: [],
  }

  const config = await loadPostHogConfig(supabase, projectId)
  if (!config) {
    result.errors.push('No PostHog config (subscription or project_settings.posthog_api_key)')
    return result
  }

  // ---- Pull counts + trends in parallel from PostHog ----
  let counts28d: Awaited<ReturnType<typeof getEventCounts>>
  let counts7d: Awaited<ReturnType<typeof getEventCounts>>
  let counts24h: Awaited<ReturnType<typeof getEventCounts>>
  let trends: Awaited<ReturnType<typeof getEventTrendsWeekOverWeek>>
  try {
    ;[counts28d, counts7d, counts24h, trends] = await Promise.all([
      getEventCounts(config, 28),
      getEventCounts(config, 7),
      getEventCounts(config, 1),
      getEventTrendsWeekOverWeek(config),
    ])
  } catch (err) {
    result.errors.push(`PostHog fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    return result
  }

  result.totalEventsConsidered = counts28d.rows.length

  // ---- Build maps ----
  const countMap = (
    src: { eventName: string; count: number }[],
  ): Map<string, number> => {
    const map = new Map<string, number>()
    for (const row of src) map.set(row.eventName, row.count)
    return map
  }
  const m28 = countMap(counts28d.rows)
  const m7 = countMap(counts7d.rows)
  const m24 = countMap(counts24h.rows)
  const lastObservedMap = new Map<string, string | null>()
  for (const row of counts7d.rows) lastObservedMap.set(row.eventName, row.latest)

  // ---- Load existing funnel_stops for this project (single query) ----
  const { data: priorRowsRaw } = await supabase
    .from('funnel_stops')
    .select('*')
    .eq('project_id', projectId)
  const priorRows = (priorRowsRaw ?? []) as FunnelStopRow[]
  const priorByEvent = new Map<string, FunnelStopRow>()
  for (const row of priorRows) priorByEvent.set(row.event_name, row)

  // ---- Construct updates per event ----
  const allEventNames = counts28d.rows
    .filter((row) => (m28.get(row.eventName) ?? 0) >= COUNT_FLOOR)
    .map((row) => row.eventName)

  const updates: FunnelStopUpdate[] = []
  for (const eventName of allEventNames) {
    const upstream = inferUpstream(eventName, allEventNames)
    const update = buildFunnelStopUpdate({
      eventName,
      count24h: m24.get(eventName) ?? 0,
      count7d: m7.get(eventName) ?? 0,
      count28d: m28.get(eventName) ?? 0,
      trend: trends.get(eventName) ?? null,
      upstreamEvent: upstream,
      upstreamCount7d: upstream ? m7.get(upstream) ?? 0 : null,
      upstreamCount28d: upstream ? m28.get(upstream) ?? 0 : null,
      upstreamTrend: upstream ? trends.get(upstream) ?? null : null,
      lastObserved: lastObservedMap.get(eventName) ?? null,
    })
    updates.push(update)
  }

  // ---- Upsert funnel_stops + detect anomalies ----
  const decisions: Array<{ stopId: string; update: FunnelStopUpdate; decision: AnomalyDecision }> =
    []

  const now = new Date().toISOString()
  for (const update of updates) {
    const prior = priorByEvent.get(update.eventName) ?? null
    const insert: FunnelStopInsert = {
      project_id: projectId,
      event_name: update.eventName,
      upstream_event: update.upstreamEvent,
      funnel_role: update.role,
      count_24h: update.count24h,
      count_7d: update.count7d,
      count_28d: update.count28d,
      rate_vs_upstream_7d: update.rateVsUpstream7d,
      rate_vs_upstream_28d: update.rateVsUpstream28d,
      trend_count_7d: update.trendCount7d,
      trend_rate_7d: update.trendRate7d,
      last_observed: update.lastObserved,
      last_rolled_up_at: now,
    }

    let stopId: string | null = null
    if (prior) {
      const { data, error } = await supabase
        .from('funnel_stops')
        .update(insert)
        .eq('id', prior.id)
        .select('id')
        .single()
      if (error) {
        result.errors.push(`update funnel_stop ${update.eventName}: ${error.message}`)
        continue
      }
      stopId = (data as { id: string } | null)?.id ?? prior.id
      result.stopsTouched += 1
    } else {
      const { data, error } = await supabase
        .from('funnel_stops')
        .insert(insert)
        .select('id')
        .single()
      if (error) {
        result.errors.push(`insert funnel_stop ${update.eventName}: ${error.message}`)
        continue
      }
      stopId = (data as { id: string } | null)?.id ?? null
      if (stopId) {
        result.stopsCreated += 1
        result.stopsTouched += 1
      }
    }
    if (!stopId) continue

    // Compare against prior snapshot (the row before we just updated it).
    const decision = detectAnomaly(prior as PureFunnelStopRow | null, update)
    if (decision) {
      decisions.push({ stopId, update, decision })
    }
  }

  if (options.dryRun) {
    return result
  }

  // ---- Mint signals + anomaly rows + bootstrap clusters ----
  await Promise.all([
    mintAnomalies({ supabase, projectId, decisions, source, result }),
    bootstrapClustersForFunnel({ supabase, projectId, updates, result }),
  ])

  // ---- v1.1.5: ingest user-curated PostHog Insights as additional metrics ----
  // Each metric_definitions row of kind=posthog_insight gets snapshotted and
  // folded into funnel_stops with metric_kind='posthog_insight'. Subsequent
  // rollups detect trends on those rows the same way as event counts.
  await rollupInsights({ supabase, projectId, config, result })

  // ---- Bookkeeping on the subscription row ----
  await supabase
    .from('posthog_subscriptions')
    .update({ last_rollup_at: now })
    .eq('project_id', projectId)

  return result
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function loadPostHogConfig(
  supabase: SupabaseClient,
  projectId: string,
): Promise<PostHogConfig | null> {
  const { data: subRow } = await supabase
    .from('posthog_subscriptions')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  const sub = (subRow as PosthogSubscriptionRow | null) ?? null

  if (sub) {
    const apiKey = (sub.metadata as { api_key?: string } | null)?.api_key
    if (apiKey && sub.posthog_project_id) {
      return {
        host: sub.posthog_host || 'https://us.posthog.com',
        apiKey,
        projectId: sub.posthog_project_id,
      }
    }
  }

  // Fallback to legacy posthog_api_key on project_settings.
  const { data: settingsRow } = await supabase
    .from('project_settings')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  const settings = (settingsRow as ProjectSettingsRow | null) ?? null
  if (!settings || !settings.posthog_api_key) return null

  // Legacy path doesn't carry posthog_project_id; assume the api key is a
  // project-scoped token and the user's PostHog project id is in metadata.
  const inferred =
    (settings as ProjectSettingsRow & { metadata?: { posthog_project_id?: string } }).metadata
      ?.posthog_project_id

  if (!inferred) {
    console.warn(
      '[funnel-rollup] legacy posthog_api_key without posthog_project_id; cannot HogQL query',
      { projectId },
    )
    return null
  }

  return {
    host: 'https://us.posthog.com',
    apiKey: settings.posthog_api_key,
    projectId: inferred,
  }
}

async function mintAnomalies(args: {
  supabase: SupabaseClient
  projectId: string
  decisions: Array<{ stopId: string; update: FunnelStopUpdate; decision: AnomalyDecision }>
  source: 'cron' | 'webhook' | 'backtest' | 'manual'
  result: RollupResult
}): Promise<void> {
  const { supabase, projectId, decisions, source, result } = args
  if (decisions.length === 0) return

  const now = new Date()
  const windowEnd = now.toISOString()
  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  for (const { stopId, update, decision } of decisions) {
    // 1. Insert the signal first so the anomaly row can FK to it.
    const signalInsert: SignalInsert = {
      project_id: projectId,
      type: 'funnel_anomaly',
      content: decision.reason,
      title: anomalyTitle(update.eventName, decision),
      metadata: {
        event_name: update.eventName,
        upstream_event: update.upstreamEvent,
        funnel_role: update.role,
        kind: decision.kind,
        baseline: decision.baseline,
        observed: decision.observed,
        delta_pct: decision.deltaPct,
        severity: decision.severity,
        funnel_stop_id: stopId,
        source: 'funnel_rollup',
      },
      weight: decision.severity,
    }
    const { data: signalRow, error: signalErr } = await supabase
      .from('signals')
      .insert(signalInsert)
      .select('id')
      .single()
    if (signalErr || !signalRow) {
      result.errors.push(`mint signal for ${update.eventName}: ${signalErr?.message ?? 'unknown'}`)
      continue
    }
    result.signalsMinted += 1

    // 2. Insert the anomaly row.
    const anomalyInsert: FunnelAnomalyInsert = {
      project_id: projectId,
      funnel_stop_id: stopId,
      kind: decision.kind,
      baseline: decision.baseline,
      observed: decision.observed,
      delta_pct: decision.deltaPct,
      window_start: windowStart,
      window_end: windowEnd,
      severity: decision.severity,
      source,
      signal_id: (signalRow as { id: string }).id,
    }
    const { error: anomalyErr } = await supabase.from('funnel_anomalies').insert(anomalyInsert)
    if (anomalyErr) {
      result.errors.push(`mint anomaly for ${update.eventName}: ${anomalyErr.message}`)
      continue
    }
    result.anomaliesMinted += 1
  }
}

function anomalyTitle(eventName: string, decision: AnomalyDecision): string {
  const arrow = decision.deltaPct >= 0 ? '↑' : '↓'
  const pct = Math.round(Math.abs(decision.deltaPct) * 100)
  const kindLabel =
    decision.kind === 'rate_drop' || decision.kind === 'rate_spike'
      ? 'rate'
      : decision.kind === 'first_seen'
      ? 'new'
      : 'count'
  return `${eventName} ${kindLabel} ${arrow} ${pct}%`
}

/**
 * For a funnel layer that's never been bootstrapped, create one cluster
 * per role-classified stop so the filing resolver has somewhere to file.
 *
 * Idempotent: each call checks `opportunity_clusters.slug` first and only
 * inserts the missing ones.
 */
/**
 * Pull each user-curated PostHog Insight, snapshot it, and persist it as
 * a row in `funnel_stops` with `metric_kind='posthog_insight'`. Trend
 * detection on these rows is the same WoW logic the event flow uses.
 */
async function rollupInsights(args: {
  supabase: SupabaseClient
  projectId: string
  config: PostHogConfig
  result: RollupResult
}): Promise<void> {
  const { supabase, projectId, config, result } = args

  const { data: definitions } = await supabase
    .from('metric_definitions')
    .select('slug, posthog_insight_short_id, display_name, metric_kind, status')
    .eq('project_id', projectId)
    .eq('metric_kind', 'posthog_insight')
    .eq('status', 'active')

  if (!definitions || definitions.length === 0) return

  const now = new Date().toISOString()

  // Insight snapshots are the slowest part of the rollup (~1-20s per call).
  // We only re-pull insights whose last snapshot is older than this many ms.
  // Daily-granularity is fine since PostHog itself re-computes saved
  // insights on its own cadence.
  const INSIGHT_FRESHNESS_MS = 12 * 60 * 60 * 1000

  for (const def of definitions as Array<{
    slug: string
    posthog_insight_short_id: string | null
    display_name: string
  }>) {
    if (!def.posthog_insight_short_id) continue

    const eventName = `insight:${def.slug}`
    const { data: existing } = await supabase
      .from('funnel_stops')
      .select('count_7d, count_28d, last_observed')
      .eq('project_id', projectId)
      .eq('event_name', eventName)
      .maybeSingle()

    const previous = (existing as { count_7d: number; count_28d: number; last_observed: string | null } | null)
    const lastObservedMs = previous?.last_observed
      ? Date.parse(previous.last_observed)
      : null
    const isFresh =
      lastObservedMs !== null && Date.now() - lastObservedMs < INSIGHT_FRESHNESS_MS
    if (isFresh) continue // already snapshotted today; skip the slow call

    let snapshot: Awaited<ReturnType<typeof getInsightSnapshot>> = null
    try {
      snapshot = await getInsightSnapshot(config, def.posthog_insight_short_id)
    } catch (err) {
      result.errors.push(
        `insight ${def.slug}: ${err instanceof Error ? err.message : String(err)}`,
      )
      continue
    }
    if (!snapshot || snapshot.headlineValue == null) continue

    const current = Math.round(snapshot.headlineValue)
    const previous7d = previous?.count_7d ?? 0
    const trend = previous7d > 0 ? (current - previous7d) / previous7d : current > 0 ? 1 : 0

    const insertOrUpdate = {
      project_id: projectId,
      event_name: eventName,
      upstream_event: null,
      funnel_role: 'event',
      metric_kind: 'posthog_insight',
      count_24h: current,
      count_7d: current,
      count_28d: previous?.count_28d ?? current,
      rate_vs_upstream_7d: null,
      rate_vs_upstream_28d: null,
      trend_count_7d: trend,
      trend_rate_7d: null,
      last_observed: now,
      last_rolled_up_at: now,
      metadata: {
        insight_short_id: def.posthog_insight_short_id,
        insight_kind: snapshot.kind,
        display_name: def.display_name ?? snapshot.name,
        series: snapshot.series.slice(0, 8),
      },
    }

    if (existing) {
      const { error } = await supabase
        .from('funnel_stops')
        .update(insertOrUpdate)
        .eq('project_id', projectId)
        .eq('event_name', eventName)
      if (error) {
        result.errors.push(`insight update ${def.slug}: ${error.message}`)
      } else {
        result.stopsTouched += 1
      }
    } else {
      const { error } = await supabase.from('funnel_stops').insert(insertOrUpdate)
      if (error) {
        result.errors.push(`insight insert ${def.slug}: ${error.message}`)
      } else {
        result.stopsCreated += 1
        result.stopsTouched += 1
      }
    }
  }
}

async function bootstrapClustersForFunnel(args: {
  supabase: SupabaseClient
  projectId: string
  updates: FunnelStopUpdate[]
  result: RollupResult
}): Promise<void> {
  const { supabase, projectId, updates, result } = args

  // Only bootstrap clusters for stops that are interesting on their own:
  // bottom-of-funnel, error, or middle (skip top/event/engagement).
  const candidates = updates.filter(
    (u) => u.role === 'bottom' || u.role === 'middle' || u.role === 'error',
  )
  if (candidates.length === 0) return

  const slugs = candidates.map((u) => funnelClusterSlug(u.eventName))
  const { data: existingRows } = await supabase
    .from('opportunity_clusters')
    .select('slug')
    .eq('project_id', projectId)
    .in('slug', slugs)
  const existingSlugs = new Set((existingRows ?? []).map((r: { slug: string }) => r.slug))

  for (const u of candidates) {
    const slug = funnelClusterSlug(u.eventName)
    if (existingSlugs.has(slug)) continue

    const primaryNeed =
      u.role === 'bottom' ? 'conversion' : u.role === 'error' ? 'ux_quality' : 'conversion'
    const title =
      u.role === 'bottom'
        ? `Convert: ${u.eventName}`
        : u.role === 'error'
        ? `Error: ${u.eventName}`
        : `Funnel step: ${u.eventName}`

    const insert = {
      project_id: projectId,
      slug,
      title,
      theme: u.role === 'error' ? 'error' : 'funnel',
      primary_need: primaryNeed,
      need_vector: { [primaryNeed]: 1 },
      latest_brief_md: '',
      metadata: {
        bootstrap_source: 'funnel-rollup',
        funnel_role: u.role,
        event_name: u.eventName,
        upstream_event: u.upstreamEvent,
      },
    } satisfies Pick<
      OpportunityClusterRow,
      'project_id' | 'slug' | 'title' | 'theme' | 'primary_need' | 'need_vector' | 'latest_brief_md' | 'metadata'
    >

    const { error } = await supabase.from('opportunity_clusters').insert(insert)
    if (error) {
      result.errors.push(`bootstrap cluster ${slug}: ${error.message}`)
      continue
    }
    result.clustersCreated += 1
  }
}
