import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { compactPageVersions } from '@/lib/brain/compaction'
import { verifySecret } from '@/lib/auth/verify-secret'

/**
 * Monthly brain compaction cron.
 *
 * Prunes `brain_page_versions` older than 60 days while keeping at least
 * the last 5 versions per page. Deletes the chunks that referenced the
 * pruned versions so retrieval doesn't surface stale text.
 *
 * Supports `?dryRun=1` for a cost estimate without mutating anything.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader || !verifySecret(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const olderThanDays = parseIntOrDefault(url.searchParams.get('olderThanDays'), 60)
  const keepMin = parseIntOrDefault(url.searchParams.get('keepMin'), 5)

  const supabase = createAdminClient()
  const result = await compactPageVersions(supabase, {
    dryRun,
    olderThanDays,
    keepMin,
  })

  return NextResponse.json(result)
}

function parseIntOrDefault(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}
