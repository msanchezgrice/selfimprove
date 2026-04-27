import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGitHubToken } from '@/lib/github/get-token'
import { runImplementationBrief } from '@/lib/ai/implementation-brief'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user has access to this roadmap item
  const { data: item } = await supabase
    .from('roadmap_items')
    .select('id, prd_content')
    .eq('id', id)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!item.prd_content) {
    return NextResponse.json(
      { error: 'PRD must be generated first' },
      { status: 400 },
    )
  }

  const token = await getGitHubToken()
  if (!token) {
    return NextResponse.json({ error: 'No GitHub token' }, { status: 400 })
  }

  // v1.1: the implementation-brief skill owns the PRD -> build_jobs transition.
  // It resolves repo_map + safety_rules, generates a structured execution
  // packet, clamps it against project safety caps, and emits the build_jobs row.
  try {
    const result = await runImplementationBrief({
      roadmapItemId: id,
      approvalMode: 'manual',
      githubToken: token,
    })

    if (!result.buildJobId) {
      return NextResponse.json(
        {
          error:
            'Implementation packet was generated but the build job could not be enqueued (check repo_url and GitHub token).',
          packet: result.packet,
          runId: result.runId,
        },
        { status: 500 },
      )
    }

    const admin = createAdminClient()
    await admin.from('roadmap_items').update({ build_status: 'queued' }).eq('id', id)

    return NextResponse.json({
      status: 'queued',
      message: 'Build job queued',
      buildJobId: result.buildJobId,
      runId: result.runId,
      packet: result.packet,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
