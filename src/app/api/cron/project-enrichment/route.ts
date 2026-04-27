import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { runProjectEnrichment } from '@/lib/ai/project-enrichment'
import { verifySecret } from '@/lib/auth/verify-secret'

/**
 * Nightly project-enrichment sweep.
 *
 * Picks active projects that have fresh evidence (unprocessed signals, recent
 * shipped changes, or stale brain pages) and runs the `project-enrichment`
 * skill. Writes `brain_pages`, `brain_page_versions`, `brain_page_sources`,
 * `brain_chunks`, and `opportunity_clusters` — the bottom half of the
 * `signals -> project memory -> opportunity clusters` pipeline.
 *
 * Per-project failures are captured, not thrown, so one bad project cannot
 * starve the rest of the sweep.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader || !verifySecret(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Active projects only; archived/paused projects are out of scope.
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('status', 'active')
    .limit(200)

  if (!projects || projects.length === 0) {
    return NextResponse.json({ processed: 0, total: 0 })
  }

  // Narrow to projects with fresh evidence: a recent signal or a recent
  // shipped change in the last 36 hours. This matches the spec's nightly
  // recompaction cadence without re-enriching every single project every day.
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()
  const toProcess: string[] = []
  for (const project of projects) {
    const [{ count: freshSignals }, { count: freshShipped }] = await Promise.all([
      supabase
        .from('signals')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .gte('created_at', since),
      supabase
        .from('shipped_changes')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .gte('created_at', since),
    ])
    if ((freshSignals ?? 0) > 0 || (freshShipped ?? 0) > 0) {
      toProcess.push(project.id)
    }
  }

  let processed = 0
  const errors: string[] = []
  const summaries: Array<{
    projectId: string
    pagesUpdated: number
    clustersUpdated: number
    runId: string | null
  }> = []

  for (const projectId of toProcess) {
    try {
      const result = await runProjectEnrichment({ projectId })
      processed += 1
      summaries.push({
        projectId,
        pagesUpdated: result.pagesUpdated,
        clustersUpdated: result.clustersUpdated,
        runId: result.runId,
      })
    } catch (err) {
      errors.push(
        `${projectId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    }
  }

  return NextResponse.json({
    processed,
    candidates: toProcess.length,
    total: projects.length,
    summaries,
    errors,
  })
}
