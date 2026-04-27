import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  runProjectEnrichment,
  type ScanFinding,
} from '@/lib/ai/project-enrichment'
import { verifySecret } from '@/lib/auth/verify-secret'

/**
 * Job-complete webhook.
 *
 * Called by the worker after a `build_jobs` row transitions to `completed`.
 * When the completed job is a codebase/site scan, this route triggers
 * `runProjectEnrichment({ projectId, scanFindings })` eagerly so the
 * findings get diarized into `brain_pages` + `opportunity_clusters` without
 * waiting for the nightly sweep.
 *
 * Auth: timing-safe `Authorization: Bearer ${CRON_SECRET}` — same secret
 * the worker already uses to call other Next.js endpoints.
 *
 * Body supports two shapes:
 *   1. `{ jobId: string }` — the worker callback. Loads the job, checks
 *      type, and forwards to the right eager post-processing.
 *   2. `{ projectId: string, trigger: 'site_scan' | 'manual' }` — ops or
 *      the site-scan cron firing enrichment without a build_jobs row.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader || !verifySecret(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { jobId?: string; projectId?: string; trigger?: 'site_scan' | 'manual' }
    | null

  if (body && typeof body.projectId === 'string' && !body.jobId) {
    const trigger = body.trigger ?? 'manual'
    try {
      const result = await runProjectEnrichment({ projectId: body.projectId })
      return NextResponse.json({ status: 'enriched', trigger, result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json(
        { status: 'enrichment_failed', trigger, error: message },
        { status: 500 },
      )
    }
  }

  if (!body || typeof body.jobId !== 'string') {
    return NextResponse.json(
      { error: 'Either { jobId } or { projectId, trigger } is required' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()
  const { data: job } = await supabase
    .from('build_jobs')
    .select('id, project_id, job_type, status, result, roadmap_item_id')
    .eq('id', body.jobId)
    .single()

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.status !== 'completed') {
    return NextResponse.json(
      { status: 'skipped', reason: `job ${body.jobId} is in status ${job.status}` },
      { status: 202 },
    )
  }

  // Only scan jobs currently trigger enrichment; implement jobs feed the
  // shipped_changes path, which is handled by /api/cron/impact-review.
  if (job.job_type !== 'scan') {
    return NextResponse.json({ status: 'skipped', reason: 'not a scan job' })
  }

  const scanFindings = extractScanFindings(job.result as Record<string, unknown> | null)

  try {
    const result = await runProjectEnrichment({
      projectId: job.project_id,
      scanFindings,
    })
    return NextResponse.json({
      status: 'enriched',
      jobId: job.id,
      result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[webhooks/job-complete] enrichment failed', {
      jobId: job.id,
      projectId: job.project_id,
      error: message,
    })
    return NextResponse.json({ status: 'enrichment_failed', error: message }, { status: 500 })
  }
}

function extractScanFindings(
  result: Record<string, unknown> | null,
): ScanFinding[] {
  if (!result) return []
  const raw = result.findings
  if (!Array.isArray(raw)) return []
  const findings: ScanFinding[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const summary =
      (record.title as string | undefined) ??
      (record.description as string | undefined) ??
      ''
    if (!summary) continue
    findings.push({
      summary: summary.slice(0, 480),
      area: (record.category as string | undefined) ?? (record.area as string | undefined) ?? 'unknown',
      severity:
        record.severity === 'high' || record.severity === 'medium' || record.severity === 'low'
          ? record.severity
          : undefined,
      citation: record.file ? String(record.file) : undefined,
      excerpt:
        typeof record.description === 'string'
          ? (record.description as string).slice(0, 1200)
          : undefined,
    })
  }
  return findings
}
