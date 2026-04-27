import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  RoadmapItemRow,
  SignalRow,
} from '@/lib/types/database'

import {
  classifyEvent,
  funnelClusterSlug,
  inferUpstream,
  type EventTrend,
  type FunnelStopRow as PureFunnelStopRow,
  type FunnelStopUpdate,
} from './funnel'
import {
  buildFunnelStopUpdate,
  detectAnomaly,
  type AnomalyDecision,
} from './funnel'
import { decideFocus } from './auto-focus'
import { dedupAgainstHistory, TITLE_DEDUP_THRESHOLD } from './preflight'

/**
 * Backtest harness.
 *
 * Replays historical analytics signals through the v1.1.5 pipeline at
 * synthetic checkpoints, so the user can see what the new ranking and
 * filing logic *would have* produced if it had been live.
 *
 * Inputs (read-only, never mutates):
 *   - All historical signals for a project
 *   - All historical roadmap_items (for the dedup baseline)
 *
 * Output: a series of weekly snapshots showing:
 *   - Funnel state at that point in time (counts, rates, trend)
 *   - Anomalies detected at that checkpoint
 *   - Auto-focus decision
 *   - Roadmap items that would have survived dedup vs. been dropped
 *
 * Pure on the inside: the harness can run with no live PostHog by
 * deriving counts directly from the historical `signals` table (each
 * legacy `analytics` signal acts as a "this event fired once" record).
 *
 * Usage: `await runBacktest(supabase, projectId, { weeks: 8 })`.
 */

export type BacktestCheckpoint = {
  windowEnd: string
  windowStart: string
  totalEventsObserved: number
  funnelStops: PureFunnelStopRow[]
  anomalies: Array<{ stopEvent: string; decision: AnomalyDecision }>
  focus: ReturnType<typeof decideFocus>
  realRoadmapItems: Array<{ id: string; title: string; created_at: string; cluster: string | null }>
  dedupReport: {
    proposed: number
    survived: number
    droppedAgainstHistory: number
    droppedInBatch: number
  }
}

export type BacktestResult = {
  projectId: string
  windowDays: number
  checkpoints: BacktestCheckpoint[]
  comparison: BacktestComparison
}

export type BacktestComparison = {
  realItemsTotal: number
  realItemsAfterDedup: number
  dropRatePct: number
  topClustersByVolume: Array<{ slug: string; titles: number }>
  /** What the system "would have" focused on each week. */
  focusTrajectory: Array<{ weekEnd: string; mode: string; confidence: number }>
}

export type BacktestOptions = {
  /** Number of trailing weekly checkpoints to compute. Default 8. */
  weeks?: number
  /** Use only signals up to this date for the latest checkpoint. Defaults to now. */
  asOf?: Date
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

/**
 * Run the backtest. Reads historical signals + roadmap_items, replays
 * them in week-sized windows, and returns the per-week snapshot.
 *
 * No DB writes. Safe to run on production data.
 */
export async function runBacktest(
  supabase: SupabaseClient,
  projectId: string,
  options: BacktestOptions = {},
): Promise<BacktestResult> {
  const weeks = options.weeks ?? 8
  const asOf = options.asOf ?? new Date()
  const windowDays = weeks * 7

  // Load all historical analytics signals + roadmap items in two queries.
  const since = new Date(asOf.getTime() - windowDays * DAY_MS).toISOString()

  const [signalsRes, roadmapRes] = await Promise.all([
    supabase
      .from('signals')
      .select('id, type, content, title, metadata, weight, created_at')
      .eq('project_id', projectId)
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
    supabase
      .from('roadmap_items')
      .select('id, title, opportunity_cluster_id, created_at')
      .eq('project_id', projectId)
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
  ])

  const signals = (signalsRes.data ?? []) as Pick<
    SignalRow,
    'id' | 'type' | 'content' | 'title' | 'metadata' | 'weight' | 'created_at'
  >[]
  const roadmapItems = (roadmapRes.data ?? []) as Array<
    Pick<RoadmapItemRow, 'id' | 'title' | 'opportunity_cluster_id' | 'created_at'>
  >

  // Bin signals by event_name for fast count lookups.
  const eventCountsByDay = bucketEventsByDay(signals)

  // Step through one week at a time.
  const checkpoints: BacktestCheckpoint[] = []
  let priorStops: PureFunnelStopRow[] = []

  for (let w = weeks - 1; w >= 0; w--) {
    const windowEnd = new Date(asOf.getTime() - w * WEEK_MS)
    const windowStart = new Date(windowEnd.getTime() - WEEK_MS)
    const checkpoint = computeCheckpoint({
      windowStart,
      windowEnd,
      eventCountsByDay,
      priorStops,
      projectId,
      signals,
      roadmapItems,
    })
    checkpoints.push(checkpoint)
    priorStops = checkpoint.funnelStops
  }

  return {
    projectId,
    windowDays,
    checkpoints,
    comparison: summarizeComparison(checkpoints, roadmapItems),
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function bucketEventsByDay(
  signals: Array<Pick<SignalRow, 'metadata' | 'created_at' | 'type'>>,
): Map<string, Map<string, number>> {
  const byDay = new Map<string, Map<string, number>>()
  for (const signal of signals) {
    if (signal.type !== 'analytics') continue
    const eventName =
      (signal.metadata as { event_name?: string } | null)?.event_name ?? null
    if (!eventName || eventName.startsWith('$')) continue
    const day = signal.created_at.slice(0, 10)
    let dayMap = byDay.get(day)
    if (!dayMap) {
      dayMap = new Map()
      byDay.set(day, dayMap)
    }
    dayMap.set(eventName, (dayMap.get(eventName) ?? 0) + 1)
  }
  return byDay
}

function countEventsInWindow(
  byDay: Map<string, Map<string, number>>,
  windowStart: Date,
  windowEnd: Date,
): Map<string, number> {
  const counts = new Map<string, number>()
  let cursor = new Date(windowStart.getTime())
  while (cursor < windowEnd) {
    const day = cursor.toISOString().slice(0, 10)
    const dayMap = byDay.get(day)
    if (dayMap) {
      for (const [event, n] of dayMap) {
        counts.set(event, (counts.get(event) ?? 0) + n)
      }
    }
    cursor = new Date(cursor.getTime() + DAY_MS)
  }
  return counts
}

function computeCheckpoint(args: {
  windowStart: Date
  windowEnd: Date
  eventCountsByDay: Map<string, Map<string, number>>
  priorStops: PureFunnelStopRow[]
  projectId: string
  signals: Array<Pick<SignalRow, 'id' | 'type' | 'metadata' | 'created_at'>>
  roadmapItems: Array<Pick<RoadmapItemRow, 'id' | 'title' | 'opportunity_cluster_id' | 'created_at'>>
}): BacktestCheckpoint {
  const {
    windowStart,
    windowEnd,
    eventCountsByDay,
    priorStops,
    projectId,
    roadmapItems,
  } = args

  const counts7d = countEventsInWindow(eventCountsByDay, windowStart, windowEnd)
  const counts28dStart = new Date(windowEnd.getTime() - 4 * WEEK_MS)
  const counts28d = countEventsInWindow(eventCountsByDay, counts28dStart, windowEnd)
  const counts24hStart = new Date(windowEnd.getTime() - DAY_MS)
  const counts24h = countEventsInWindow(eventCountsByDay, counts24hStart, windowEnd)

  // Trends: this week vs prior week.
  const priorWeekStart = new Date(windowStart.getTime() - WEEK_MS)
  const counts7dPrev = countEventsInWindow(eventCountsByDay, priorWeekStart, windowStart)

  const trends = new Map<string, EventTrend>()
  for (const [event, current] of counts7d) {
    const previous = counts7dPrev.get(event) ?? 0
    const trendPct = previous === 0 ? (current > 0 ? 1 : 0) : (current - previous) / previous
    trends.set(event, { current, previous, trendPct })
  }
  for (const [event, previous] of counts7dPrev) {
    if (!trends.has(event)) {
      trends.set(event, { current: 0, previous, trendPct: -1 })
    }
  }

  const totalEventsObserved = [...counts7d.values()].reduce((s, n) => s + n, 0)
  const allEventNames = [...counts28d.keys()]

  // Build funnel-stop updates and detect anomalies vs prior checkpoint.
  const priorByEvent = new Map(priorStops.map((row) => [row.event_name, row]))
  const stops: PureFunnelStopRow[] = []
  const anomalies: BacktestCheckpoint['anomalies'] = []

  for (const eventName of allEventNames) {
    if ((counts28d.get(eventName) ?? 0) < 5) continue
    const upstream = inferUpstream(eventName, allEventNames)
    const update: FunnelStopUpdate = buildFunnelStopUpdate({
      eventName,
      count24h: counts24h.get(eventName) ?? 0,
      count7d: counts7d.get(eventName) ?? 0,
      count28d: counts28d.get(eventName) ?? 0,
      trend: trends.get(eventName) ?? null,
      upstreamEvent: upstream,
      upstreamCount7d: upstream ? counts7d.get(upstream) ?? 0 : null,
      upstreamCount28d: upstream ? counts28d.get(upstream) ?? 0 : null,
      upstreamTrend: upstream ? trends.get(upstream) ?? null : null,
      lastObserved: windowEnd.toISOString(),
    })

    const stopRow: PureFunnelStopRow = {
      id: `bt-${projectId}-${eventName}`,
      event_name: eventName,
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
    }
    stops.push(stopRow)

    const prior = priorByEvent.get(eventName) ?? null
    const decision = detectAnomaly(prior, update)
    if (decision) anomalies.push({ stopEvent: eventName, decision })
  }

  // Auto-focus from the funnel state we just constructed (no real anomalies
  // table yet — synthesize a minimal anomaly stream from the decisions).
  const synthAnomalies = anomalies.map(({ stopEvent, decision }) => ({
    id: `bt-anom-${stopEvent}`,
    project_id: projectId,
    funnel_stop_id: stops.find((s) => s.event_name === stopEvent)?.id ?? '',
    kind: decision.kind,
    baseline: decision.baseline,
    observed: decision.observed,
    delta_pct: decision.deltaPct,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    severity: decision.severity,
    status: 'open' as const,
    resolved_at: null,
    resolution_note: null,
    source: 'backtest' as const,
    signal_id: null,
    metadata: {},
    created_at: windowEnd.toISOString(),
    updated_at: windowEnd.toISOString(),
  }))
  const focus = decideFocus(stops as Parameters<typeof decideFocus>[0], synthAnomalies as Parameters<typeof decideFocus>[1])

  // Real roadmap items minted in this window (for dedup vs current logic).
  const itemsInWindow = roadmapItems.filter((row) => {
    const t = new Date(row.created_at).getTime()
    return t >= windowStart.getTime() && t < windowEnd.getTime()
  })
  const itemsBeforeWindow = roadmapItems.filter(
    (row) => new Date(row.created_at).getTime() < windowStart.getTime(),
  )

  // Replay dedup: if v1.1.5 had been live, what would have survived?
  const dedup = dedupAgainstHistory(
    itemsInWindow.map((row) => ({ title: row.title, id: row.id })),
    itemsBeforeWindow.map((row) => ({ id: row.id, title: row.title, created_at: row.created_at })),
    TITLE_DEDUP_THRESHOLD,
  )
  const droppedInBatch = dedup.dropped.filter((d) => d.matchedId === 'in-batch').length
  const droppedAgainstHistory = dedup.dropped.length - droppedInBatch

  return {
    windowEnd: windowEnd.toISOString(),
    windowStart: windowStart.toISOString(),
    totalEventsObserved,
    funnelStops: stops,
    anomalies,
    focus,
    realRoadmapItems: itemsInWindow.map((row) => ({
      id: row.id,
      title: row.title,
      created_at: row.created_at,
      cluster: null,
    })),
    dedupReport: {
      proposed: itemsInWindow.length,
      survived: dedup.kept.length,
      droppedAgainstHistory,
      droppedInBatch,
    },
  }
}

function summarizeComparison(
  checkpoints: BacktestCheckpoint[],
  realRoadmapItems: Array<{ title: string }>,
): BacktestComparison {
  const realItemsTotal = realRoadmapItems.length
  const realItemsAfterDedup = checkpoints.reduce(
    (sum, cp) => sum + cp.dedupReport.survived,
    0,
  )

  // What clusters would the items have landed in?
  const titleVolumeBySlug = new Map<string, number>()
  for (const cp of checkpoints) {
    for (const item of cp.realRoadmapItems) {
      const slug = funnelClusterSlug(deriveSlugHint(item.title))
      titleVolumeBySlug.set(slug, (titleVolumeBySlug.get(slug) ?? 0) + 1)
    }
  }
  const topClustersByVolume = [...titleVolumeBySlug.entries()]
    .map(([slug, titles]) => ({ slug, titles }))
    .sort((a, b) => b.titles - a.titles)
    .slice(0, 5)

  return {
    realItemsTotal,
    realItemsAfterDedup,
    dropRatePct: realItemsTotal === 0 ? 0 : 1 - realItemsAfterDedup / realItemsTotal,
    topClustersByVolume,
    focusTrajectory: checkpoints.map((cp) => ({
      weekEnd: cp.windowEnd,
      mode: cp.focus.mode,
      confidence: cp.focus.confidence,
    })),
  }
}

function deriveSlugHint(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('preview')) return 'preview-conversion'
  if (lower.includes('pricing') || lower.includes('purchase')) return 'pricing-conversion'
  if (lower.includes('onboarding')) return 'onboarding-friction'
  if (lower.includes('email')) return 'email-engagement'
  if (lower.includes('refine')) return 'refine-conversion'
  if (lower.includes('funnel') || lower.includes('attribution')) return 'funnel-instrumentation'
  if (lower.includes('error') || lower.includes('failure')) return 'error-recovery'
  if (lower.includes('landing')) return 'landing-conversion'
  return 'general'
}
