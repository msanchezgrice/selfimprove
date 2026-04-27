/**
 * High-fidelity PostHog client for the funnel layer.
 *
 * Replaces the per-event poll path that was minting one signal per event
 * firing. This client talks to the **HogQL Query API** directly so we get
 * aggregate counts, conversion rates, and trends in one round-trip per
 * project — not 50 rows of "Event X detected" per hour.
 *
 * Why HogQL over `/api/event/`? With 200+ events/day, the event endpoint
 * paginates and rate-limits. HogQL queries return aggregates server-side
 * and cost one request per metric. For a landing page funnel with 25
 * stops, the entire daily rollup is one HogQL call.
 *
 * Auth: Personal API token stored on `posthog_subscriptions.metadata.api_key`
 * or per-project in `project_settings.posthog_api_key`. The latter is what
 * the legacy poller used; we keep using it for backwards compatibility.
 *
 * No third-party SDK on purpose. The `@posthog/node` SDK is for sending
 * events, not querying. We're querying.
 */

export type PostHogConfig = {
  host: string
  apiKey: string
  projectId: string
}

export type EventCount = {
  eventName: string
  count: number
  earliest: string | null
  latest: string | null
}

export type EventCountWindow = {
  windowDays: number
  rows: EventCount[]
}

export type FunnelStepResult = {
  stepIndex: number
  eventName: string
  count: number
  conversionFromPrevious: number | null
  averageSecondsFromPrevious: number | null
}

export type FunnelResult = {
  steps: FunnelStepResult[]
  totalReached: number
  windowStart: string
  windowEnd: string
}

const DEFAULT_HOST = 'https://us.posthog.com'

/**
 * Run a HogQL query and return the rows.
 * Docs: https://posthog.com/docs/api/queries
 */
export async function runHogQL(
  config: PostHogConfig,
  query: string,
  options: { timeoutMs?: number } = {},
): Promise<{ columns: string[]; rows: unknown[][] }> {
  const url = `${config.host.replace(/\/$/, '')}/api/projects/${config.projectId}/query/`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: { kind: 'HogQLQuery', query },
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`PostHog HogQL ${res.status}: ${body.slice(0, 400)}`)
    }

    const json = (await res.json()) as { columns?: string[]; results?: unknown[][] }
    return {
      columns: json.columns ?? [],
      rows: json.results ?? [],
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Fetch event counts grouped by event name over the trailing N days.
 * One HogQL call returns the full distribution. Empty events list means
 * "all events"; otherwise filters to the named ones.
 */
export async function getEventCounts(
  config: PostHogConfig,
  windowDays: number,
  events: string[] = [],
): Promise<EventCountWindow> {
  const filter =
    events.length > 0
      ? `and event in (${events.map((e) => `'${escapeSqlLiteral(e)}'`).join(',')})`
      : ''

  const query = `
    select
      event as event_name,
      count() as cnt,
      min(timestamp) as earliest,
      max(timestamp) as latest
    from events
    where timestamp > now() - interval ${Math.max(1, Math.min(90, windowDays))} day
      and event not like '$%'
      ${filter}
    group by event
    order by cnt desc
    limit 200
  `

  const result = await runHogQL(config, query)
  const rows: EventCount[] = result.rows.map((row) => ({
    eventName: String(row[0] ?? ''),
    count: Number(row[1] ?? 0),
    earliest: row[2] ? String(row[2]) : null,
    latest: row[3] ? String(row[3]) : null,
  }))

  return { windowDays, rows }
}

/**
 * Compute conversion-rate trend by comparing the trailing 7 days against
 * the prior 7 days for each event. Returns event_name → trend_pct (e.g.
 * 0.15 for +15%). One HogQL roundtrip.
 */
export async function getEventTrendsWeekOverWeek(
  config: PostHogConfig,
): Promise<Map<string, { current: number; previous: number; trendPct: number }>> {
  const query = `
    select
      event,
      countIf(timestamp > now() - interval 7 day) as current,
      countIf(timestamp > now() - interval 14 day and timestamp <= now() - interval 7 day) as previous
    from events
    where timestamp > now() - interval 14 day
      and event not like '$%'
    group by event
    having current > 0 or previous > 0
    order by current desc
    limit 300
  `

  const result = await runHogQL(config, query)
  const map = new Map<string, { current: number; previous: number; trendPct: number }>()

  for (const row of result.rows) {
    const eventName = String(row[0] ?? '')
    const current = Number(row[1] ?? 0)
    const previous = Number(row[2] ?? 0)
    const trendPct = previous === 0 ? (current > 0 ? 1 : 0) : (current - previous) / previous
    map.set(eventName, { current, previous, trendPct })
  }

  return map
}

/**
 * Run a multi-step funnel via HogQL. We avoid PostHog's `/insight/funnel/`
 * endpoint because its time-window filtering is awkward and it returns
 * pre-formatted UI data; HogQL gives us first-class numbers.
 *
 * The funnel is computed as: distinct persons who fired step[0], then
 * fired step[1] *after* step[0], then step[2] after step[1], etc, all
 * within the same window.
 */
export async function getFunnel(
  config: PostHogConfig,
  steps: string[],
  windowDays: number,
): Promise<FunnelResult> {
  if (steps.length < 2) {
    throw new Error('A funnel requires at least 2 steps')
  }
  const stepConditions = steps
    .map((step, i) => `countIf(event = '${escapeSqlLiteral(step)}') > 0 as step_${i}`)
    .join(',\n      ')

  const query = `
    with per_user as (
      select
        distinct_id,
        ${stepConditions}
      from events
      where timestamp > now() - interval ${Math.max(1, Math.min(90, windowDays))} day
      group by distinct_id
    )
    select
      ${steps.map((_, i) => `countIf(${steps.slice(0, i + 1).map((__, j) => `step_${j}`).join(' and ')}) as reached_${i}`).join(',\n      ')}
    from per_user
  `

  const result = await runHogQL(config, query)
  const counts = (result.rows[0] ?? []).map((value) => Number(value ?? 0))

  const stepResults: FunnelStepResult[] = steps.map((eventName, i) => {
    const count = counts[i] ?? 0
    const previous = i > 0 ? counts[i - 1] ?? 0 : count
    const conversionFromPrevious = i === 0 ? null : previous === 0 ? 0 : count / previous
    return {
      stepIndex: i,
      eventName,
      count,
      conversionFromPrevious,
      averageSecondsFromPrevious: null, // future: separate query
    }
  })

  const now = new Date()
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)

  return {
    steps: stepResults,
    totalReached: counts[counts.length - 1] ?? 0,
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
  }
}

/**
 * Create or replace a HogQL Alert that fires a webhook into our app
 * whenever a metric breaches a threshold. Used during onboarding.
 *
 * Returns the alert id so the caller can persist it on
 * `posthog_subscriptions.hogql_alert_ids`.
 *
 * NOTE: PostHog's HogQL Alerts endpoint expects an `insight` to attach to.
 * We create a one-off Trends insight per alert so the alert has something
 * to evaluate. The insight is private (not shown in the dashboard list)
 * and tagged `selfimprove:funnel-alert` so we can clean them up later.
 */
export async function createHogQLAlert(
  config: PostHogConfig,
  args: {
    name: string
    eventName: string
    /** Trigger when count over the window deviates by more than this fraction. */
    deltaThreshold?: number
    /** Window for the rolling count. Default: 24h. */
    windowMinutes?: number
    /** Webhook URL the alert posts to. Auth happens via the shared secret. */
    webhookUrl: string
    /**
     * PostHog subscribed_users IDs. Required by the PostHog Alerts API.
     * Empty array => attempt to use the API key's owner (auto-discovered
     * by `/api/users/@me/`).
     */
    subscribedUserIds?: number[]
  },
): Promise<{ alertId: string; insightId: string } | null> {
  // Resolve a subscriber list (PostHog requires at least one).
  let subscribedUsers = args.subscribedUserIds ?? []
  if (subscribedUsers.length === 0) {
    subscribedUsers = await resolveDefaultSubscribers(config)
  }
  if (subscribedUsers.length === 0) {
    throw new Error(
      'PostHog alerts require at least one subscribed user; could not auto-resolve the API key owner.',
    )
  }

  const insightUrl = `${config.host.replace(/\/$/, '')}/api/projects/${config.projectId}/insights/`
  const insightRes = await fetch(insightUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `selfimprove:funnel-alert:${args.eventName}`,
      query: {
        kind: 'TrendsQuery',
        series: [{ kind: 'EventsNode', event: args.eventName, math: 'total' }],
        interval: 'hour',
        dateRange: { date_from: '-24h', date_to: null },
      },
      tags: ['selfimprove', 'funnel-alert'],
      saved: false,
    }),
  })
  if (!insightRes.ok) {
    throw new Error(`insight create ${insightRes.status}: ${(await insightRes.text()).slice(0, 300)}`)
  }
  const insight = (await insightRes.json()) as { id?: number; short_id?: string }
  const insightId = typeof insight.id === 'number' ? insight.id : null
  if (!insightId) {
    throw new Error('insight create returned no id')
  }

  const alertUrl = `${config.host.replace(/\/$/, '')}/api/projects/${config.projectId}/alerts/`
  const delta = Math.abs(args.deltaThreshold ?? 0.2)
  const alertRes = await fetch(alertUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: args.name,
      insight: insightId,
      subscribed_users: subscribedUsers,
      condition: { type: 'relative_decrease' },
      threshold: {
        configuration: {
          type: 'percentage',
          bounds: { lower: -delta, upper: null },
        },
      },
      // PostHog Alerts require an alert-config-type for Trends insights —
      // pin to series 0 (the only series we created).
      config: { type: 'TrendsAlertConfig', series_index: 0 },
      enabled: true,
      calculation_interval: 'daily',
    }),
  })
  if (!alertRes.ok) {
    throw new Error(`alert create ${alertRes.status}: ${(await alertRes.text()).slice(0, 300)}`)
  }
  const alert = (await alertRes.json()) as { id?: string }
  if (!alert.id) throw new Error('alert create returned no id')

  return { alertId: alert.id, insightId: String(insightId) }
}

/**
 * Pull the API-key owner's user id so we can subscribe them to the alert.
 * PostHog returns the owner of a personal API key from `/api/users/@me/`.
 */
async function resolveDefaultSubscribers(config: PostHogConfig): Promise<number[]> {
  try {
    const res = await fetch(`${config.host.replace(/\/$/, '')}/api/users/@me/`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    })
    if (!res.ok) return []
    const json = (await res.json()) as { id?: number }
    return typeof json.id === 'number' ? [json.id] : []
  } catch {
    return []
  }
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

// ---------------------------------------------------------------------------
// PostHog Insights — saved charts the user already curates
// ---------------------------------------------------------------------------

export type PostHogInsight = {
  id: number
  short_id: string
  name: string
  description: string | null
  query?: { kind?: string } | null
  filters?: { insight?: string } | null
  saved: boolean
  created_at: string
  updated_at: string
  tags?: string[]
}

export type InsightKind = 'TRENDS' | 'FUNNELS' | 'RETENTION' | 'PATHS' | 'STICKINESS' | 'LIFECYCLE' | 'OTHER'

export type InsightWithKind = PostHogInsight & { kind: InsightKind }

/**
 * List the user's saved PostHog Insights for a project.
 * We use this once per project to bootstrap the metric set: every saved
 * Funnel/Trend/Retention becomes a `metric_definitions` row that the
 * rollup can read week-over-week.
 *
 * Filters out the `selfimprove:funnel-alert` insights this app creates
 * itself so we don't recursively re-ingest our own alerts.
 */
export async function listInsights(
  config: PostHogConfig,
  options: { limit?: number } = {},
): Promise<InsightWithKind[]> {
  const limit = options.limit ?? 50
  const url = `${config.host.replace(/\/$/, '')}/api/projects/${config.projectId}/insights/?limit=${limit}&saved=true`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  })
  if (!res.ok) {
    throw new Error(`PostHog list insights ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const json = (await res.json()) as { results?: PostHogInsight[] }
  const results = json.results ?? []
  return results
    .filter((insight) => !insight.tags?.includes('selfimprove'))
    .map((insight) => ({
      ...insight,
      kind: classifyInsightKind(insight),
    }))
}

function classifyInsightKind(insight: PostHogInsight): InsightKind {
  const queryKind = insight.query?.kind?.toUpperCase()
  const filterInsight = insight.filters?.insight?.toUpperCase()
  const candidate = (queryKind ?? filterInsight ?? 'OTHER') as string
  if (candidate.includes('FUNNEL')) return 'FUNNELS'
  if (candidate.includes('TREND')) return 'TRENDS'
  if (candidate.includes('RETENTION')) return 'RETENTION'
  if (candidate.includes('PATH')) return 'PATHS'
  if (candidate.includes('STICKINESS')) return 'STICKINESS'
  if (candidate.includes('LIFECYCLE')) return 'LIFECYCLE'
  return 'OTHER'
}

export type InsightSnapshot = {
  shortId: string
  name: string
  kind: InsightKind
  /** Numerical "headline" value of the insight for trend detection. */
  headlineValue: number | null
  /** Per-series last-period values (Trends) or per-step counts (Funnels). */
  series: Array<{ label: string; value: number }>
  /** Raw JSON for callers that want to dig deeper. */
  raw: unknown
}

/**
 * Fetch the latest computed value(s) for one insight.
 * For Trends: returns the last bucket of each series.
 * For Funnels: returns per-step counts and the bottom-step conversion.
 * For Retention/Paths/etc: returns whatever PostHog gives us with a
 * best-effort headline.
 */
export async function getInsightSnapshot(
  config: PostHogConfig,
  shortId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<InsightSnapshot | null> {
  // Default to cached values (~1s) instead of force-blocking refresh (~20s).
  // The daily pipeline only needs day-granularity freshness; PostHog already
  // re-computes saved insights on its own cadence. Pass forceRefresh:true
  // when the caller really needs an up-to-the-second value.
  const refresh = options.forceRefresh ? '?refresh=force_blocking' : ''
  const url = `${config.host.replace(/\/$/, '')}/api/projects/${config.projectId}/insights/${shortId}/${refresh}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  })
  if (!res.ok) {
    console.warn(`[posthog/getInsightSnapshot] ${res.status} for ${shortId}: ${(await res.text()).slice(0, 200)}`)
    return null
  }
  const insight = (await res.json()) as PostHogInsight & {
    result?: unknown
    last_refresh?: string
  }
  const kind = classifyInsightKind(insight)
  const result = insight.result as unknown as
    | Array<{ label: string; count: number; data?: number[]; days?: string[] }>
    | undefined

  if (!result || !Array.isArray(result)) {
    return {
      shortId,
      name: insight.name,
      kind,
      headlineValue: null,
      series: [],
      raw: insight.result,
    }
  }

  const series = result.map((entry) => {
    const lastBucket =
      Array.isArray(entry.data) && entry.data.length > 0 ? entry.data[entry.data.length - 1] : entry.count
    return {
      label: entry.label,
      value: Number(lastBucket ?? 0),
    }
  })

  let headline: number | null = null
  if (kind === 'FUNNELS') {
    // Bottom step count.
    headline = series.length > 0 ? series[series.length - 1].value : null
  } else if (kind === 'TRENDS') {
    // Sum across series for the last bucket.
    headline = series.reduce((s, e) => s + e.value, 0)
  } else {
    headline = series[0]?.value ?? null
  }

  return {
    shortId,
    name: insight.name,
    kind,
    headlineValue: headline,
    series,
    raw: insight.result,
  }
}
