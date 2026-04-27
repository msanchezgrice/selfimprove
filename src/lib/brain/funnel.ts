/**
 * Pure helpers for the funnel layer:
 *   - classify event names into funnel roles (top / middle / bottom / error / engagement)
 *   - compute trends from rolling counts
 *   - detect anomalies worth minting a signal for
 *
 * No DB, no network. The rollup cron and the webhook both call into here so
 * the anomaly logic stays unit-testable and identical across paths.
 */

import { computeFreshnessScore } from './ranking'

export type FunnelRole = 'top' | 'middle' | 'bottom' | 'error' | 'engagement' | 'event'

export type EventCount = {
  eventName: string
  count: number
  earliest: string | null
  latest: string | null
}

export type EventTrend = {
  current: number
  previous: number
  trendPct: number
}

export type FunnelStopUpdate = {
  eventName: string
  role: FunnelRole
  upstreamEvent: string | null
  count24h: number
  count7d: number
  count28d: number
  /** Upstream's 7d count, carried through from the rollup so detectAnomaly can guard against tiny denominators. */
  upstreamCount7d: number | null
  rateVsUpstream7d: number | null
  rateVsUpstream28d: number | null
  trendCount7d: number | null
  trendRate7d: number | null
  lastObserved: string | null
}

export type FunnelStopRow = {
  id: string
  event_name: string
  upstream_event: string | null
  funnel_role: FunnelRole
  count_24h: number
  count_7d: number
  count_28d: number
  rate_vs_upstream_7d: number | null
  rate_vs_upstream_28d: number | null
  trend_count_7d: number | null
  trend_rate_7d: number | null
  last_observed: string | null
}

export type AnomalyDecision = {
  kind:
    | 'rate_drop'
    | 'rate_spike'
    | 'count_drop'
    | 'count_spike'
    | 'count_trend'
    | 'rate_trend'
    | 'distribution_shift'
    | 'cohort_regression'
    | 'first_seen'
    | 'new_event'
  baseline: number
  observed: number
  deltaPct: number
  severity: 1 | 2 | 3 | 4 | 5
  reason: string
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Heuristic classifier for funnel role from an event name.
 *
 * The heuristic is surprisingly stable for product analytics: most teams
 * name events `<surface>_<verb>(_<state>?)`, and the verb maps to role.
 * For unrecognized events we return 'event' which the cron treats as
 * not-yet-classified — the user can manually edit
 * `funnel_stops.funnel_role` later or the agent can refine over time.
 */
export function classifyEvent(eventName: string): FunnelRole {
  const e = eventName.toLowerCase()

  if (e.includes('error') || e.includes('failed') || e.includes('crash')) return 'error'
  if (e.includes('purchase') && e.includes('completed')) return 'bottom'
  if (e.includes('checkout') && e.includes('completed')) return 'bottom'
  if (e.endsWith('_signed_up_completed') || e.endsWith('_signup_completed') || e.endsWith('_sign_up_completed')) return 'bottom'
  if (e.includes('subscribed') || e.includes('paid')) return 'bottom'

  if (e.endsWith('_clicked') || e.endsWith('_played') || e.endsWith('_completed')) return 'middle'
  if (e.endsWith('_opened') || e.endsWith('_started')) return 'middle'

  if (e.endsWith('_viewed') || e.endsWith('_visited') || e.endsWith('_landing')) return 'top'

  if (e.startsWith('email_') || e.startsWith('email')) return 'engagement'
  if (e.includes('repeat') || e.includes('retention')) return 'engagement'

  return 'event'
}

/**
 * Inferred upstream event for rate computation. Returns null when there's
 * no obvious upstream pair (for top-of-funnel and isolated events).
 *
 * The inference is name-pattern based: same prefix, demoting one role
 * along (top → middle → bottom). When a same-prefix candidate exists in
 * the corpus, prefer it; otherwise fall back to the next role-class up.
 */
export function inferUpstream(
  eventName: string,
  allEvents: string[],
): string | null {
  const role = classifyEvent(eventName)
  if (role === 'top') return null

  const lower = eventName.toLowerCase()
  const prefix = lower.split('_').slice(0, -1).join('_')

  // Same-prefix pair (e.g. landing_cta_clicked → landing_page_viewed).
  if (prefix.length > 0) {
    const samePrefix = allEvents
      .filter((other) => other !== eventName && other.toLowerCase().startsWith(prefix))
      .map((other) => ({ name: other, role: classifyEvent(other) }))
      .filter((other) => roleRank(other.role) < roleRank(role))
      .sort((a, b) => roleRank(b.role) - roleRank(a.role))
    if (samePrefix.length > 0) return samePrefix[0].name
  }

  // Cross-prefix fallback: any event one role tier above.
  const oneTierUp = allEvents
    .map((other) => ({ name: other, role: classifyEvent(other) }))
    .filter((other) => other.name !== eventName && roleRank(other.role) === roleRank(role) - 1)
  if (oneTierUp.length === 1) return oneTierUp[0].name

  return null
}

function roleRank(role: FunnelRole): number {
  if (role === 'top') return 0
  if (role === 'middle') return 1
  if (role === 'bottom') return 2
  if (role === 'engagement') return 3
  if (role === 'error') return 4
  return 5
}

/** Slug for the cluster auto-created from a funnel stop. */
export function funnelClusterSlug(eventName: string): string {
  const lower = eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `funnel-${lower}`
}

// ---------------------------------------------------------------------------
// Rollup
// ---------------------------------------------------------------------------

/**
 * Build a `FunnelStopUpdate` for one event from PostHog count windows + trend.
 * `eventCounts7d` and `eventCounts28d` are maps of event_name → count.
 */
export function buildFunnelStopUpdate(args: {
  eventName: string
  count24h: number
  count7d: number
  count28d: number
  trend: EventTrend | null
  upstreamEvent: string | null
  upstreamCount7d: number | null
  upstreamCount28d: number | null
  upstreamTrend: EventTrend | null
  lastObserved: string | null
}): FunnelStopUpdate {
  const role = classifyEvent(args.eventName)

  const rateVsUpstream7d =
    args.upstreamEvent && args.upstreamCount7d && args.upstreamCount7d > 0
      ? Math.min(2, args.count7d / args.upstreamCount7d)
      : null
  const rateVsUpstream28d =
    args.upstreamEvent && args.upstreamCount28d && args.upstreamCount28d > 0
      ? Math.min(2, args.count28d / args.upstreamCount28d)
      : null

  const trendCount7d = args.trend ? args.trend.trendPct : null

  // Rate trend: compare current rate vs previous rate for the same upstream.
  // Need both this stop's trend and the upstream's trend to compute.
  let trendRate7d: number | null = null
  if (args.trend && args.upstreamTrend) {
    const currentRate =
      args.upstreamTrend.current > 0 ? args.trend.current / args.upstreamTrend.current : null
    const previousRate =
      args.upstreamTrend.previous > 0 ? args.trend.previous / args.upstreamTrend.previous : null
    if (currentRate != null && previousRate != null && previousRate !== 0) {
      trendRate7d = (currentRate - previousRate) / previousRate
    }
  }

  return {
    eventName: args.eventName,
    role,
    upstreamEvent: args.upstreamEvent,
    count24h: args.count24h,
    count7d: args.count7d,
    count28d: args.count28d,
    upstreamCount7d: args.upstreamCount7d,
    rateVsUpstream7d,
    rateVsUpstream28d,
    trendCount7d,
    trendRate7d,
    lastObserved: args.lastObserved,
  }
}

// ---------------------------------------------------------------------------
// Anomaly detection
// ---------------------------------------------------------------------------

// "Anomaly" thresholds — loud signals that demand attention.
const COUNT_DROP_THRESHOLD = 0.2 // 20% week-over-week
const COUNT_SPIKE_THRESHOLD = 0.5
const RATE_DROP_THRESHOLD = 0.15 // 15% relative change in conversion rate
const RATE_SPIKE_THRESHOLD = 0.25

// "Trend" thresholds — quieter signals worth surfacing as low-severity
// evidence even if they don't cross the anomaly bar. The brain reasons
// over them; the dashboard de-emphasizes them.
const COUNT_TREND_THRESHOLD = 0.07 // 7% week-over-week count move
const RATE_TREND_THRESHOLD = 0.07 // 7% relative conversion-rate move

const MIN_BASELINE_COUNT = 25 // ignore tiny populations

/**
 * Detect whether an updated funnel stop has moved enough since the last
 * snapshot to warrant minting a new signal.
 *
 * Comparison is against the existing `funnel_stops` row's prior trend
 * fields when available; otherwise against fresh PostHog 14-day numbers.
 *
 * Returns null when the stop didn't move enough — no anomaly, no signal.
 */
export function detectAnomaly(
  prior: FunnelStopRow | null,
  next: FunnelStopUpdate,
): AnomalyDecision | null {
  // First-ever observation of this event.
  if (!prior) {
    if (next.count7d >= MIN_BASELINE_COUNT) {
      return {
        kind: 'first_seen',
        baseline: 0,
        observed: next.count7d,
        deltaPct: 1,
        severity: 1,
        reason: `First observation: ${next.eventName} fired ${next.count7d} times in the last 7d.`,
      }
    }
    return null
  }

  // Count move. Anomaly first; if nothing breaches the loud threshold,
  // fall through to trend-class signal at lower severity.
  if (next.trendCount7d != null && Math.abs(next.trendCount7d) >= COUNT_TREND_THRESHOLD) {
    const baseline = prior.count_7d
    if (baseline >= MIN_BASELINE_COUNT) {
      const move = next.trendCount7d
      const isDrop = move < 0
      const mag = Math.abs(move)

      // Anomaly tier: loud and severe.
      if (isDrop && mag >= COUNT_DROP_THRESHOLD) {
        return {
          kind: 'count_drop',
          baseline,
          observed: next.count7d,
          deltaPct: move,
          severity: severityFor(mag, [0.2, 0.35, 0.5, 0.7]),
          reason: `${next.eventName} count fell ${pct(move)} week-over-week (${baseline} → ${next.count7d}).`,
        }
      }
      if (!isDrop && mag >= COUNT_SPIKE_THRESHOLD) {
        return {
          kind: 'count_spike',
          baseline,
          observed: next.count7d,
          deltaPct: move,
          severity: severityFor(mag, [0.5, 1.0, 2.0, 4.0]),
          reason: `${next.eventName} count spiked ${pct(move)} week-over-week (${baseline} → ${next.count7d}).`,
        }
      }

      // Trend tier: quiet, lower severity. Still surfaces as a signal.
      return {
        kind: 'count_trend',
        baseline,
        observed: next.count7d,
        deltaPct: move,
        severity: severityFor(mag, [0.07, 0.10, 0.13, 0.17]),
        reason: `${next.eventName} count ${isDrop ? 'down' : 'up'} ${pct(move)} week-over-week (${baseline} → ${next.count7d}).`,
      }
    }
  }

  // Rate move (more important than count moves when an upstream exists).
  if (
    next.upstreamEvent &&
    next.trendRate7d != null &&
    Math.abs(next.trendRate7d) >= RATE_TREND_THRESHOLD
  ) {
    const baseline = prior.rate_vs_upstream_7d ?? null
    const observed = next.rateVsUpstream7d ?? null
    if (baseline != null && observed != null && (next.upstreamCount7d ?? 0) >= MIN_BASELINE_COUNT) {
      const move = next.trendRate7d
      const isDrop = move < 0
      const mag = Math.abs(move)

      // Anomaly tier.
      if (isDrop && mag >= RATE_DROP_THRESHOLD) {
        return {
          kind: 'rate_drop',
          baseline,
          observed,
          deltaPct: move,
          severity: severityFor(mag, [0.15, 0.25, 0.4, 0.6]),
          reason: `${next.eventName}/${next.upstreamEvent} conversion fell ${pct(move)} (${ratePct(baseline)} → ${ratePct(observed)}).`,
        }
      }
      if (!isDrop && mag >= RATE_SPIKE_THRESHOLD) {
        return {
          kind: 'rate_spike',
          baseline,
          observed,
          deltaPct: move,
          severity: severityFor(mag, [0.25, 0.5, 1.0, 2.0]),
          reason: `${next.eventName}/${next.upstreamEvent} conversion spiked ${pct(move)} (${ratePct(baseline)} → ${ratePct(observed)}).`,
        }
      }

      // Trend tier.
      return {
        kind: 'rate_trend',
        baseline,
        observed,
        deltaPct: move,
        severity: severityFor(mag, [0.07, 0.10, 0.13, 0.16]),
        reason: `${next.eventName}/${next.upstreamEvent} conversion ${isDrop ? 'down' : 'up'} ${pct(move)} (${ratePct(baseline)} → ${ratePct(observed)}).`,
      }
    }
  }

  return null
}

/** Use the freshness curve from ranking.ts to weight an anomaly's signal. */
export function anomalyWeight(decision: AnomalyDecision, observedAt: string | null = null): number {
  // Severity 1-5 maps to base weight 1-5; freshness penalises stale moves.
  const freshness = computeFreshnessScore(observedAt)
  return Math.max(1, Math.round(decision.severity * (0.5 + freshness / 200)))
}

function severityFor(delta: number, thresholds: [number, number, number, number]): 1 | 2 | 3 | 4 | 5 {
  if (delta < thresholds[0]) return 1
  if (delta < thresholds[1]) return 2
  if (delta < thresholds[2]) return 3
  if (delta < thresholds[3]) return 4
  return 5
}

function pct(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(1)}%`
}

function ratePct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
