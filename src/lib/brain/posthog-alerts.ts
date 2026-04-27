import type { SupabaseClient } from '@supabase/supabase-js'

import { createHogQLAlert, type PostHogConfig } from '@/lib/posthog/client'
import type { PosthogSubscriptionRow, FunnelStopRow } from '@/lib/types/database'

/**
 * Create one HogQL Alert per bottom-of-funnel event for a project so
 * conversion-critical movements deliver in real time via the webhook
 * (instead of waiting for the daily rollup cron).
 *
 * Idempotent: alert ids accumulated on
 * `posthog_subscriptions.hogql_alert_ids` are checked first; never creates
 * the same alert twice.
 *
 * The webhook target is `${publicAppUrl}/api/webhooks/posthog?project=<id>`
 * with HMAC signature against `posthog_subscriptions.secret`.
 */

export type AlertCreationResult = {
  projectId: string
  attempted: number
  created: number
  skipped: number
  errors: string[]
  alertIds: string[]
}

export async function ensureBottomFunnelAlerts(
  supabase: SupabaseClient,
  projectId: string,
  options: {
    publicAppUrl?: string
    /** Cap on alerts created in one call. PostHog has rate limits. */
    maxNew?: number
    /** Override which event names to alert on. Defaults to bottom-role stops. */
    eventNames?: string[]
  } = {},
): Promise<AlertCreationResult> {
  const result: AlertCreationResult = {
    projectId,
    attempted: 0,
    created: 0,
    skipped: 0,
    errors: [],
    alertIds: [],
  }

  const publicAppUrl =
    options.publicAppUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_BASE_URL ??
    'http://localhost:3000'
  const maxNew = options.maxNew ?? 3

  const { data: subRow } = await supabase
    .from('posthog_subscriptions')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  const sub = subRow as PosthogSubscriptionRow | null
  if (!sub) {
    result.errors.push('No posthog_subscriptions row for this project.')
    return result
  }
  const apiKey = (sub.metadata as { api_key?: string } | null)?.api_key
  if (!apiKey) {
    result.errors.push('Subscription has no api_key in metadata.')
    return result
  }

  const config: PostHogConfig = {
    host: sub.posthog_host,
    apiKey,
    projectId: sub.posthog_project_id,
  }

  // Resolve which events to alert on.
  let eventNames = options.eventNames ?? null
  if (!eventNames) {
    const { data: bottomStops } = await supabase
      .from('funnel_stops')
      .select('event_name, count_28d')
      .eq('project_id', projectId)
      .eq('funnel_role', 'bottom')
      .order('count_28d', { ascending: false })
      .limit(5)
    eventNames = (bottomStops as Pick<FunnelStopRow, 'event_name' | 'count_28d'>[] | null)?.map(
      (row) => row.event_name,
    ) ?? []
  }

  if (eventNames.length === 0) {
    return result
  }

  const existingIds = new Set<string>(
    Array.isArray(sub.hogql_alert_ids)
      ? (sub.hogql_alert_ids as Array<{ event_name?: string }>)
          .map((entry) => entry.event_name)
          .filter((value): value is string => typeof value === 'string')
      : [],
  )

  const newAlertIds: Array<{ event_name: string; alert_id: string; insight_id: string }> = []

  const webhookUrl = `${publicAppUrl.replace(/\/$/, '')}/api/webhooks/posthog?project=${projectId}`

  for (const eventName of eventNames.slice(0, maxNew)) {
    if (existingIds.has(eventName)) {
      result.skipped += 1
      continue
    }
    result.attempted += 1
    try {
      const alert = await createHogQLAlert(config, {
        name: `selfimprove:funnel-alert:${eventName}`,
        eventName,
        webhookUrl,
        deltaThreshold: 0.2,
        windowMinutes: 1440,
      })
      if (!alert) {
        result.errors.push(`createHogQLAlert returned null for ${eventName}`)
        continue
      }
      newAlertIds.push({
        event_name: eventName,
        alert_id: alert.alertId,
        insight_id: alert.insightId,
      })
      result.created += 1
      result.alertIds.push(alert.alertId)
    } catch (err) {
      result.errors.push(
        `${eventName}: ${err instanceof Error ? err.message.slice(0, 250) : String(err)}`,
      )
    }
  }

  if (newAlertIds.length > 0) {
    const merged = [
      ...((sub.hogql_alert_ids as Array<{ event_name: string; alert_id: string; insight_id: string }> | null) ?? []),
      ...newAlertIds,
    ]
    const { error } = await supabase
      .from('posthog_subscriptions')
      .update({ hogql_alert_ids: merged })
      .eq('id', sub.id)
    if (error) {
      result.errors.push(`update subscription alert_ids: ${error.message}`)
    }
  }

  return result
}
