import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyColdStartCluster } from '@/lib/brain/cold-start-cluster'
import { rollupProjectFunnel } from '@/lib/brain/funnel-rollup'
import { rerankProjectRoadmap } from '@/lib/brain/rerank'
import { registerPostHogInsights } from '@/lib/brain/register-insights'
import { ensureBottomFunnelAlerts } from '@/lib/brain/posthog-alerts'
import type { PosthogSubscriptionRow } from '@/lib/types/database'

/**
 * Session-authenticated one-shot bootstrap for a project's brain.
 *
 * Runs the v1.1.5 pipeline in series, uses the user's session for
 * authorization (the project must belong to an org the user is a member of),
 * and returns a summary so the UI can refresh and tell the user what
 * changed.
 *
 *   POST /api/projects/[id]/bootstrap-brain
 *   body: { dryRun?: boolean }
 *
 * Steps:
 *   1. Cold-start clustering — link existing roadmap_items to clusters.
 *   2. Roadmap recycle — auto-dismiss stale items (> 14d, no PRD, no PR).
 *   3. Funnel rollup — pull HogQL counts/trends, mint anomalies + signals,
 *      bootstrap funnel-clusters, ingest registered PostHog Insights.
 *   4. Register PostHog Insights — auto-discover saved Funnels/Trends/Retention
 *      and add them as metric_definitions so future rollups include them.
 *   5. Ensure bottom-funnel alerts — create HogQL Alerts in PostHog so the
 *      webhook delivers conversion-critical movements in near real time.
 *   6. Daily rerank — refresh cluster scores, rotate roadmap.
 *
 * Idempotent: every step uses upsert / no-clobber semantics. Safe to run
 * repeatedly. Each step's errors are captured but don't stop the others.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Two ways to authenticate:
  //   1. User session (normal UI button).
  //   2. CRON_SECRET bearer (admin/CI/one-shot bootstrap from a script or cron).
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isAdmin =
    typeof cronSecret === 'string' && cronSecret.length > 0 && authHeader === `Bearer ${cronSecret}`

  let project: { id: string; name: string; slug: string } | null = null

  if (!isAdmin) {
    const supabaseSession = await createClient()
    const {
      data: { user },
    } = await supabaseSession.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data } = await supabaseSession
      .from('projects')
      .select('id, name, slug')
      .eq('id', id)
      .single()
    project = (data as { id: string; name: string; slug: string } | null) ?? null
  } else {
    // Admin path: just look the project up, no per-user filtering.
    const tmpAdmin = createAdminClient()
    const { data } = await tmpAdmin
      .from('projects')
      .select('id, name, slug')
      .eq('id', id)
      .single()
    project = (data as { id: string; name: string; slug: string } | null) ?? null
  }

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean }
  const dryRun = body.dryRun === true

  // All write paths use the admin client (RLS would block service-account-style
  // writes from cross-cutting helpers; the user's session-level access was
  // already verified above).
  const admin = createAdminClient()

  const startedAt = Date.now()

  // ---- Step 1: cold-start clustering ----
  const coldStart = await safeRun(() =>
    applyColdStartCluster(admin, id, { dryRun }),
  )

  // ---- Step 2: roadmap recycle (skip on dryRun) ----
  const recycle: { dismissed: number; eligible: number } = { dismissed: 0, eligible: 0 }
  if (!dryRun) {
    try {
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const { data: stale } = await admin
        .from('roadmap_items')
        .select('id')
        .eq('project_id', id)
        .eq('stage', 'roadmap')
        .eq('status', 'proposed')
        .lt('updated_at', cutoff)
        .is('pr_url', null)
        .is('prd_content', null)
      const staleIds = (stale ?? []).map((row: { id: string }) => row.id)
      recycle.eligible = staleIds.length
      if (staleIds.length > 0) {
        const { error } = await admin
          .from('roadmap_items')
          .update({
            status: 'dismissed',
            dismiss_reason: 'auto-dismissed by bootstrap-brain (stale > 14d)',
          })
          .in('id', staleIds)
        if (!error) recycle.dismissed = staleIds.length
      }
    } catch (err) {
      // Non-fatal; record into the response.
      console.warn('[bootstrap-brain] recycle failed', err)
    }
  }

  // ---- Step 3: funnel rollup (only if PostHog is wired) ----
  const { data: subRow } = await admin
    .from('posthog_subscriptions')
    .select('id, posthog_host, posthog_project_id, metadata, status')
    .eq('project_id', id)
    .maybeSingle()
  const sub = subRow as PosthogSubscriptionRow | null
  const apiKey = (sub?.metadata as { api_key?: string } | null)?.api_key

  let rollup: Awaited<ReturnType<typeof rollupProjectFunnel>> | { skipped: string } = {
    skipped: 'no posthog_subscriptions row',
  }
  if (sub && apiKey) {
    rollup = await safeRun(() =>
      rollupProjectFunnel(admin, id, { source: 'manual', dryRun }),
    )
  }

  // ---- Step 4: register PostHog Insights ----
  let insights: Awaited<ReturnType<typeof registerPostHogInsights>> | { skipped: string } = {
    skipped: 'no posthog config',
  }
  if (sub && apiKey) {
    insights = await safeRun(() =>
      registerPostHogInsights(admin, id, {
        host: sub.posthog_host,
        apiKey,
        projectId: sub.posthog_project_id,
      }),
    )
  }

  // ---- Step 5: ensure bottom-funnel alerts (skip on dryRun) ----
  let alerts: Awaited<ReturnType<typeof ensureBottomFunnelAlerts>> | { skipped: string } = {
    skipped: 'dryRun',
  }
  if (!dryRun && sub && apiKey) {
    alerts = await safeRun(() => ensureBottomFunnelAlerts(admin, id, {}))
  }

  // ---- Step 6: rerank ----
  const rerank = await safeRun(() => rerankProjectRoadmap(admin, id, { dryRun }))

  // ---- Final state for UI ----
  const [{ count: roadmapCount }, { count: clusterCount }, { count: anomalyCount }, focusPage] =
    await Promise.all([
      admin
        .from('roadmap_items')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', id)
        .eq('stage', 'roadmap')
        .in('status', ['proposed', 'approved', 'building']),
      admin
        .from('opportunity_clusters')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', id)
        .eq('status', 'active'),
      admin
        .from('funnel_anomalies')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', id)
        .eq('status', 'open'),
      admin
        .from('brain_pages')
        .select('slug')
        .eq('project_id', id)
        .eq('kind', 'current_focus')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  return NextResponse.json({
    project: { id: project.id, name: project.name, slug: project.slug },
    dryRun,
    steps: {
      coldStart,
      recycle,
      rollup,
      insights,
      alerts,
      rerank,
    },
    finalState: {
      roadmapCount: roadmapCount ?? 0,
      clusterCount: clusterCount ?? 0,
      openAnomalies: anomalyCount ?? 0,
      currentFocus: (focusPage.data as { slug: string } | null)?.slug ?? null,
    },
    durationMs: Date.now() - startedAt,
  })
}

async function safeRun<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn()
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
