import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedProjectSignals } from '@/lib/ai/cold-start'
import { runProjectEnrichment } from '@/lib/ai/project-enrichment'
import { verifySecret } from '@/lib/auth/verify-secret'

/**
 * Weekly site-scan cron.
 *
 * Unlike the codebase scan (which enqueues a `build_jobs` row and
 * completes through the worker + job-complete webhook), the site scan is
 * synchronous: `seedProjectSignals` writes signals directly. To still
 * close the loop with the project-enrichment skill, we fire enrichment
 * in an `after()` block per project that produced signals. Errors are
 * logged, never thrown — the scan itself is the primary product.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader || !verifySecret(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, site_url')
    .eq('status', 'active')
    .not('site_url', 'is', null)

  if (!projects) return NextResponse.json({ scanned: 0 })

  const enrichCandidates: string[] = []
  let scanned = 0
  for (const project of projects) {
    if (!project.site_url) continue
    try {
      const count = await seedProjectSignals(project.id, project.site_url)
      scanned += 1
      if (typeof count === 'number' && count > 0) {
        enrichCandidates.push(project.id)
      } else if (count == null) {
        // Legacy return shape. Run enrichment anyway — idempotent enough.
        enrichCandidates.push(project.id)
      }
    } catch { /* skip on error */ }
  }

  if (enrichCandidates.length > 0) {
    after(async () => {
      for (const projectId of enrichCandidates) {
        try {
          await runProjectEnrichment({ projectId })
        } catch (err) {
          console.error('[site-scan] enrichment failed', {
            projectId,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    })
  }

  return NextResponse.json({
    scanned,
    total: projects.length,
    enrichment_queued: enrichCandidates.length,
  })
}
