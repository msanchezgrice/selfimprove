import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runBacktest } from '@/lib/brain/backtest'

/**
 * Replay historical signals through the v1.1.5 pipeline and return the
 * weekly snapshots so the user can see what the new logic *would have*
 * produced. Read-only; safe on production data.
 *
 * GET /api/projects/[id]/backtest?weeks=8&asOf=2026-04-27T12:00:00Z
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const url = new URL(req.url)
  const weeks = parseIntOrDefault(url.searchParams.get('weeks'), 8)
  const asOfRaw = url.searchParams.get('asOf')
  const asOf = asOfRaw ? new Date(asOfRaw) : undefined

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: project } = await supabase.from('projects').select('id').eq('id', id).single()
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const result = await runBacktest(admin, id, { weeks, asOf })

  return NextResponse.json(result)
}

function parseIntOrDefault(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}
