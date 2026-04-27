import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { runResolverAudit } from '@/lib/ai/check-resolvable'
import { verifySecret } from '@/lib/auth/verify-secret'

/**
 * Weekly resolver audit.
 *
 * Per docs/brain/project-brain-v1.md > Resolver Hygiene: routing decays
 * unless maintained. This route runs the `check-resolvable` skill on every
 * active project once a week, surfacing dark capabilities, overlapping
 * triggers, and unreachable skills into `resolver_audits` with proposed
 * markdown-only fixes.
 *
 * Per-project failures are logged, not thrown.
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
    .select('id')
    .eq('status', 'active')
    .limit(200)

  if (!projects || projects.length === 0) {
    return NextResponse.json({ processed: 0, total: 0 })
  }

  let processed = 0
  const errors: string[] = []
  const audits: Array<{
    projectId: string
    issues: number
    fixes: number
    auditId: string | null
    runId: string | null
  }> = []

  for (const project of projects) {
    try {
      const result = await runResolverAudit({ projectId: project.id, windowDays: 7 })
      processed += 1
      audits.push({
        projectId: project.id,
        issues: result.issues.length,
        fixes: result.fixes.length,
        auditId: result.auditId,
        runId: result.runId,
      })
    } catch (err) {
      errors.push(
        `${project.id}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    }
  }

  return NextResponse.json({
    processed,
    total: projects.length,
    audits,
    errors,
  })
}
