import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { runImpactReview } from '@/lib/ai/impact-review'
import { verifySecret } from '@/lib/auth/verify-secret'

/**
 * Daily impact-review sweep.
 *
 * Scans for roadmap items that have:
 *   - a linked `shipped_changes` row in `merged` status,
 *   - at least one entry in `impact_actuals`,
 *   - and `estimate_accuracy is null` (never reviewed yet).
 *
 * For each match, runs the deterministic classifier + model review, updates
 * `opportunity_clusters` scores, and writes a `brain_runs` row.
 *
 * Per-item failures are captured, not thrown, so one bad review cannot
 * starve the rest of the sweep. Run limit is capped to protect the worker
 * budget.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader || !verifySecret(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: candidates } = await supabase
    .from('roadmap_items')
    .select('id, project_id, impact_actuals, estimate_accuracy')
    .is('estimate_accuracy', null)
    .not('impact_actuals', 'is', null)
    .limit(50)

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ processed: 0, total: 0 })
  }

  // Only review items that actually have an `impact_actuals` entry. The `not is`
  // filter above eliminates nulls but not empty arrays.
  const withActuals = candidates.filter((row) => {
    const actuals = row.impact_actuals as unknown[] | null
    return Array.isArray(actuals) && actuals.length > 0
  })

  let processed = 0
  const errors: string[] = []
  const verdicts: Array<{
    roadmapItemId: string
    verdict: string
    accuracyScore: number | null
    runId: string | null
  }> = []

  for (const row of withActuals) {
    try {
      const result = await runImpactReview({ roadmapItemId: row.id })
      processed += 1
      verdicts.push({
        roadmapItemId: row.id,
        verdict: result.verdict,
        accuracyScore: result.accuracyScore,
        runId: result.runId,
      })
    } catch (err) {
      errors.push(
        `${row.id}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    }
  }

  return NextResponse.json({
    processed,
    candidates: withActuals.length,
    total: candidates.length,
    verdicts,
    errors,
  })
}
