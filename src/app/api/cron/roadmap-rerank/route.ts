import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { rerankProjectRoadmap } from '@/lib/brain/rerank'
import { verifySecret } from '@/lib/auth/verify-secret'

/**
 * Daily roadmap rerank.
 *
 * Distinct from the hourly /api/cron/roadmap (which generates briefs from
 * the model and respects a 6h cooldown). This route:
 *
 *   1. Recomputes every active cluster's focus-weighted score against the
 *      project's persisted current_focus.
 *   2. Demotes roadmap-stage items that have gone stale (>=14d, no PRD,
 *      no PR), freeing cap slots.
 *   3. Promotes the top briefs that meet the confidence + cluster floors
 *      into the freed slots.
 *
 * Pure deterministic. No model call. Always safe to run.
 *
 * Query params:
 *   ?dryRun=1                    — return what would change without writing
 *   ?cap=N                       — override the 25 cap
 *   ?demoteAfterDays=N           — override the 14d staleness window
 *   ?promotionConfidenceFloor=N  — override the 70% confidence floor
 *   ?promotionFocusFloor=N       — override the 50 cluster score floor
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader || !verifySecret(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const cap = parseIntOrNull(url.searchParams.get('cap'))
  const demoteAfterDays = parseIntOrNull(url.searchParams.get('demoteAfterDays'))
  const promotionConfidenceFloor = parseIntOrNull(url.searchParams.get('promotionConfidenceFloor'))
  const promotionFocusFloor = parseIntOrNull(url.searchParams.get('promotionFocusFloor'))

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
  const results: Array<Awaited<ReturnType<typeof rerankProjectRoadmap>>> = []

  for (const project of projects) {
    try {
      const result = await rerankProjectRoadmap(supabase, project.id, {
        ...(dryRun ? { dryRun } : {}),
        ...(cap != null ? { cap } : {}),
        ...(demoteAfterDays != null ? { demoteAfterDays } : {}),
        ...(promotionConfidenceFloor != null ? { promotionConfidenceFloor } : {}),
        ...(promotionFocusFloor != null ? { promotionFocusFloor } : {}),
      })
      results.push(result)
      processed += 1
    } catch (err) {
      errors.push(`${project.id}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return NextResponse.json({ dryRun, processed, total: projects.length, results, errors })
}

function parseIntOrNull(raw: string | null): number | null {
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}
