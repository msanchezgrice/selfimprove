import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { rollupProjectFunnel } from '@/lib/brain/funnel-rollup'
import { runAutoFocus } from '@/lib/brain/auto-focus'
import { verifySecret } from '@/lib/auth/verify-secret'

/**
 * Daily funnel rollup cron.
 *
 * For every active project that has either a `posthog_subscriptions` row or
 * a legacy `project_settings.posthog_api_key`, runs `rollupProjectFunnel`:
 *   - Pulls 24h / 7d / 28d event counts + week-over-week trends from PostHog (HogQL).
 *   - Upserts `funnel_stops` per event.
 *   - Detects rate / count anomalies and mints `funnel_anomalies` + `signals(type=funnel_anomaly)`.
 *   - Bootstraps `opportunity_clusters` for any new bottom/middle/error stops.
 *
 * Idempotent. Safe to run several times a day.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader || !verifySecret(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Active projects that might have funnel data.
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('status', 'active')
    .limit(200)

  if (!projects || projects.length === 0) {
    return NextResponse.json({ processed: 0, total: 0 })
  }

  let processed = 0
  const errors: string[] = []
  const summaries: Array<{
    projectId: string
    stopsTouched: number
    stopsCreated: number
    anomaliesMinted: number
    signalsMinted: number
    clustersCreated: number
  }> = []

  for (const project of projects) {
    try {
      const result = await rollupProjectFunnel(supabase, project.id)
      processed += 1
      summaries.push({
        projectId: project.id,
        stopsTouched: result.stopsTouched,
        stopsCreated: result.stopsCreated,
        anomaliesMinted: result.anomaliesMinted,
        signalsMinted: result.signalsMinted,
        clustersCreated: result.clustersCreated,
      })
      if (result.errors.length > 0) {
        errors.push(`${project.id}: ${result.errors.join(' | ')}`)
      }
      // Auto-focus piggybacks on the rollup: anomalies were just refreshed,
      // so pick the focus mode they imply (unless the user set one manually).
      if (result.anomaliesMinted > 0 || result.stopsCreated > 0) {
        try {
          await runAutoFocus(supabase, project.id)
        } catch (err) {
          errors.push(
            `${project.id} auto-focus: ${err instanceof Error ? err.message : 'Unknown error'}`,
          )
        }
      }
    } catch (err) {
      errors.push(
        `${project.id}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    }
  }

  return NextResponse.json({
    processed,
    total: projects.length,
    summaries,
    errors,
  })
}
