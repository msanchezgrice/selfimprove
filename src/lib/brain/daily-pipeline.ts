import type { SupabaseClient } from '@supabase/supabase-js'

import { applyColdStartCluster } from './cold-start-cluster'
import { rollupProjectFunnel } from './funnel-rollup'
import { rerankProjectRoadmap } from './rerank'
import { registerPostHogInsights } from './register-insights'
import { ensureBottomFunnelAlerts } from './posthog-alerts'
import { generateRoadmap } from '@/lib/ai/generate-roadmap'
import { generatePRD } from '@/lib/ai/generate-prd'
import type { PosthogSubscriptionRow } from '@/lib/types/database'

/**
 * Single daily pipeline for one project.
 *
 * Runs the full v1.1.5 chain in series:
 *   1. funnel rollup       (PostHog → funnel_stops + anomalies + signals)
 *   2. signal triage       (LLM: unprocessed signals → briefs/items)
 *   3. cold-start cluster  (file unfiled items — no-op when caught up)
 *   4. recycle             (auto-dismiss > 14d stale items)
 *   5. rerank              (focus-weighted reorder of the top-N roadmap)
 *   6. register insights   (mirror saved PostHog Insights as metric_definitions)
 *   7. ensure alerts       (idempotent HogQL alert creation)
 *   8. generate PRDs       (for any newly-promoted items that don't have one)
 *
 * Steps are isolated — one failure doesn't stop the others. Idempotent.
 *
 * This is the ONE code path used by:
 *   - the daily cron (/api/cron/roadmap)
 *   - the manual "Refresh now" button (/api/projects/[id]/bootstrap-brain)
 *   - tests
 *
 * Two buttons / two flows are confusing. There is exactly one pipeline.
 */
export async function runDailyPipeline(
  supabase: SupabaseClient,
  projectId: string,
  options: {
    /** Skip writes; useful for backtests. */
    dryRun?: boolean
    /** Skip the LLM synthesis pass (cheaper "deterministic-only" mode). */
    skipSynthesis?: boolean
    /**
     * Fast mode: skip the slowest LLM steps (synthesis + PRD backfill) so
     * the manual "Refresh now" button returns in seconds instead of minutes.
     * The daily cron uses fast=false for the full pipeline; the button uses
     * fast=true and lets the next cron pick up any deferred work.
     */
    fast?: boolean
    /** What to label the funnel-anomaly source as (cron, manual, webhook…). */
    source?: 'cron' | 'manual' | 'webhook' | 'backtest'
  } = {},
): Promise<DailyPipelineResult> {
  const startedAt = Date.now()
  const dryRun = options.dryRun === true
  const fast = options.fast === true
  const skipSynthesis = options.skipSynthesis === true || fast
  const source = options.source ?? 'cron'

  const result: DailyPipelineResult = {
    projectId,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: 0,
    steps: {},
    finalState: null,
    errors: [],
  }

  // 1. Funnel rollup (only if PostHog is wired)
  const { data: subRow } = await supabase
    .from('posthog_subscriptions')
    .select('id, posthog_host, posthog_project_id, metadata, status')
    .eq('project_id', projectId)
    .maybeSingle()
  const sub = subRow as PosthogSubscriptionRow | null
  const apiKey = (sub?.metadata as { api_key?: string } | null)?.api_key

  if (sub && apiKey) {
    result.steps.rollup = await safeRun(() =>
      rollupProjectFunnel(supabase, projectId, { source, dryRun }),
    )
  } else {
    result.steps.rollup = { skipped: 'no posthog_subscriptions row' }
  }

  // 2. Signal triage (LLM synthesis: signals → briefs)
  if (!skipSynthesis && !dryRun) {
    result.steps.synthesis = await safeRun(async () => {
      const out = await generateRoadmap(projectId)
      return {
        generationId: out.generationId,
        itemsAdded: out.items?.length ?? 0,
        clustersTouched: out.clustersTouched ?? 0,
        cooldownSkip: out.cooldownSkip ?? null,
        dedupReport: out.dedupReport ?? null,
      }
    })
  } else {
    result.steps.synthesis = { skipped: dryRun ? 'dryRun' : 'skipSynthesis' }
  }

  // 3. Cold-start cluster (file any unfiled items)
  result.steps.coldStart = await safeRun(() =>
    applyColdStartCluster(supabase, projectId, { dryRun }),
  )

  // 4. Recycle stale (skip on dryRun)
  if (!dryRun) {
    result.steps.recycle = await safeRun(async () => {
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const { data: stale } = await supabase
        .from('roadmap_items')
        .select('id')
        .eq('project_id', projectId)
        .eq('stage', 'roadmap')
        .eq('status', 'proposed')
        .lt('updated_at', cutoff)
        .is('pr_url', null)
        .is('prd_content', null)
      const ids = (stale ?? []).map((r: { id: string }) => r.id)
      if (ids.length > 0) {
        await supabase
          .from('roadmap_items')
          .update({
            status: 'dismissed',
            dismiss_reason: 'auto-dismissed by daily-pipeline (stale > 14d)',
          })
          .in('id', ids)
      }
      return { eligible: ids.length, dismissed: ids.length }
    })
  } else {
    result.steps.recycle = { skipped: 'dryRun' }
  }

  // 5. Rerank
  result.steps.rerank = await safeRun(() =>
    rerankProjectRoadmap(supabase, projectId, { dryRun }),
  )

  // 6 + 7. Insight registration + alert ensure (only if PostHog is wired)
  if (sub && apiKey && !dryRun) {
    result.steps.insights = await safeRun(() =>
      registerPostHogInsights(supabase, projectId, {
        host: sub.posthog_host,
        apiKey,
        projectId: sub.posthog_project_id,
      }),
    )
    result.steps.alerts = await safeRun(() =>
      ensureBottomFunnelAlerts(supabase, projectId, {}),
    )
  } else {
    result.steps.insights = { skipped: dryRun ? 'dryRun' : 'no posthog config' }
    result.steps.alerts = { skipped: dryRun ? 'dryRun' : 'no posthog config' }
  }

  // 8. PRD backfill for newly-promoted items missing a spec.
  // We only generate at most a handful per run to keep the daily duration
  // bounded — anything still missing on the next day's run will get picked up.
  // Fast mode skips this entirely (PRD generation is slow LLM work; the next
  // cron will catch up). Each item still auto-generates its own PRD on first
  // open if needed.
  if (!dryRun && !fast) {
    result.steps.prdBackfill = await safeRun(async () => {
      const { data: needsPrd } = await supabase
        .from('roadmap_items')
        .select('id')
        .eq('project_id', projectId)
        .eq('stage', 'roadmap')
        .in('status', ['proposed', 'approved'])
        .is('prd_content', null)
        .order('rank', { ascending: true })
        .limit(5)
      const generated: string[] = []
      const errors: string[] = []
      for (const row of (needsPrd ?? []) as Array<{ id: string }>) {
        try {
          await generatePRD(row.id)
          generated.push(row.id)
        } catch (err) {
          errors.push(`${row.id}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      return { attempted: needsPrd?.length ?? 0, generated: generated.length, errors }
    })
  } else {
    result.steps.prdBackfill = { skipped: dryRun ? 'dryRun' : 'fast' }
  }

  // Final-state snapshot for the UI's "what changed" indicator.
  const [{ count: roadmapCount }, { count: clusterCount }, { count: anomalyCount }, focusPage, latestAnomaly] =
    await Promise.all([
      supabase
        .from('roadmap_items')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('stage', 'roadmap')
        .in('status', ['proposed', 'approved', 'building']),
      supabase
        .from('opportunity_clusters')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('status', 'active'),
      supabase
        .from('funnel_anomalies')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('status', 'open'),
      supabase
        .from('brain_pages')
        .select('slug')
        .eq('project_id', projectId)
        .eq('kind', 'current_focus')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('funnel_anomalies')
        .select('created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  result.finalState = {
    roadmapCount: roadmapCount ?? 0,
    clusterCount: clusterCount ?? 0,
    openAnomalies: anomalyCount ?? 0,
    currentFocus: (focusPage.data as { slug: string } | null)?.slug ?? null,
    lastSignalAt:
      (latestAnomaly.data as { created_at: string } | null)?.created_at ?? null,
  }

  result.durationMs = Date.now() - startedAt
  return result
}

export type DailyPipelineResult = {
  projectId: string
  startedAt: string
  durationMs: number
  steps: Record<string, unknown>
  finalState: {
    roadmapCount: number
    clusterCount: number
    openAnomalies: number
    currentFocus: string | null
    lastSignalAt: string | null
  } | null
  errors: string[]
}

async function safeRun<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn()
  } catch (err) {
    return { error: err instanceof Error ? err.message.slice(0, 300) : String(err) }
  }
}
