import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runDailyPipeline } from '@/lib/brain/daily-pipeline'

/**
 * Manual "Refresh now" trigger for one project's brain pipeline.
 *
 *   POST /api/projects/[id]/bootstrap-brain
 *   body: { dryRun?: boolean, skipSynthesis?: boolean }
 *
 * Runs the SAME daily pipeline as the cron — there's only one code path to
 * reason about. See src/lib/brain/daily-pipeline.ts.
 *
 * Auth:
 *   1. User session (the project must be in an org the user can access).
 *   2. Bearer CRON_SECRET (admin / scripted).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isAdmin =
    typeof cronSecret === 'string' && cronSecret.length > 0 && authHeader === `Bearer ${cronSecret}`

  let project: { id: string; name: string; slug: string } | null = null

  if (!isAdmin) {
    const supabaseSession = await createClient()
    const {
      data: { user },
    } = await supabaseSession.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data } = await supabaseSession
      .from('projects')
      .select('id, name, slug')
      .eq('id', id)
      .single()
    project = (data as { id: string; name: string; slug: string } | null) ?? null
  } else {
    const tmpAdmin = createAdminClient()
    const { data } = await tmpAdmin
      .from('projects')
      .select('id, name, slug')
      .eq('id', id)
      .single()
    project = (data as { id: string; name: string; slug: string } | null) ?? null
  }

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    dryRun?: boolean
    skipSynthesis?: boolean
    /** Default true for the manual button — skip slow LLM steps. */
    fast?: boolean
  }

  const admin = createAdminClient()
  const result = await runDailyPipeline(admin, id, {
    dryRun: body.dryRun === true,
    skipSynthesis: body.skipSynthesis === true,
    // The button defaults to fast=true (skips PRD backfill so it returns in
    // seconds). Pass {"fast": false} from a script to run the full pipeline.
    fast: body.fast !== false,
    source: 'manual',
  })

  return NextResponse.json({
    project,
    ...result,
  })
}
