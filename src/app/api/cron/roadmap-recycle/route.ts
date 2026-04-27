import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifySecret } from '@/lib/auth/verify-secret'

/**
 * Daily roadmap-recycle cron.
 *
 * Without recycling, `autoPromoteBriefs` freezes the roadmap at 25 items
 * forever — items go in, never come out. This cron auto-dismisses any
 * roadmap-stage item that:
 *   - is `proposed` (never approved or built)
 *   - has not been touched in `staleDays` days
 *   - has no PR and no PRD content
 *
 * Frees up cap slots so fresher briefs can be promoted on the next sweep.
 *
 * Conservative defaults: only items >= 14 days old are eligible. The
 * dismiss reason is recorded so the founder can resurrect anything by
 * setting status back to 'proposed'.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader || !verifySecret(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const staleDays = parseIntOrDefault(url.searchParams.get('staleDays'), 14)
  const dryRun = url.searchParams.get('dryRun') === '1'

  const supabase = createAdminClient()

  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString()

  // Find candidates per project.
  const { data: candidates, error } = await supabase
    .from('roadmap_items')
    .select('id, project_id, title, updated_at, prd_content, pr_url')
    .eq('stage', 'roadmap')
    .eq('status', 'proposed')
    .lt('updated_at', cutoff)
    .is('pr_url', null)
    .limit(500)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Items with PRD content but no movement aren't "stale" the same way —
  // someone wrote the PRD and is presumably going to act on it. Skip those.
  const eligible = (candidates ?? []).filter((row) => !row.prd_content)
  const eligibleIds = eligible.map((row) => row.id)

  if (dryRun || eligibleIds.length === 0) {
    return NextResponse.json({
      dryRun,
      candidates: candidates?.length ?? 0,
      eligible: eligible.length,
      sample: eligible.slice(0, 8).map((row) => ({ id: row.id, title: row.title, project_id: row.project_id })),
    })
  }

  const dismissReason = `auto-dismissed by /api/cron/roadmap-recycle (stale > ${staleDays}d, no PRD, no PR)`
  const { error: updateError } = await supabase
    .from('roadmap_items')
    .update({ status: 'dismissed', dismiss_reason: dismissReason })
    .in('id', eligibleIds)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Group by project for the response summary.
  const byProject = new Map<string, number>()
  for (const row of eligible) {
    byProject.set(row.project_id, (byProject.get(row.project_id) ?? 0) + 1)
  }

  return NextResponse.json({
    staleDays,
    dismissed: eligibleIds.length,
    candidates: candidates?.length ?? 0,
    perProject: Array.from(byProject.entries()).map(([projectId, count]) => ({ projectId, count })),
  })
}

function parseIntOrDefault(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}
