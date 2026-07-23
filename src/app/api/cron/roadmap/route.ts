import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { runDailyPipeline } from '@/lib/brain/daily-pipeline'
import { verifySecret } from '@/lib/auth/verify-secret'

/**
 * Daily brain pipeline cron.
 *
 * Calls the SAME orchestrator the manual "Refresh now" button uses, so
 * there's exactly one code path the user has to reason about:
 *
 *   rollup → synthesize → cluster → recycle → rerank → register/alert → PRD
 *
 * Runs daily at 7am UTC (vercel.json). Safe to run more often — every step
 * is idempotent.
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader || !verifySecret(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // All active projects.
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('status', 'active')
    .order('updated_at', { ascending: true })
    .limit(200)

  const ids = (projects ?? []).map((p: { id: string }) => p.id)
  const summaries: Array<{ projectId: string; durationMs: number }> = []
  const errors: string[] = []

  const loopStarted = Date.now()
  let timedOut = false
  for (const projectId of ids) {
    if (Date.now() - loopStarted > 260_000) { timedOut = true; break }
    try {
      const result = await runDailyPipeline(supabase, projectId, { source: 'cron' })
      summaries.push({ projectId, durationMs: result.durationMs })
    } catch (err) {
      errors.push(
        `${projectId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return NextResponse.json({
    processed: summaries.length,
    timedOut,
    total: ids.length,
    summaries,
    errors,
  })
}
