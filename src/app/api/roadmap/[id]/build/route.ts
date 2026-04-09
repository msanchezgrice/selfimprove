import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGitHubToken } from '@/lib/github/get-token'
import { queueImplementJob } from '@/lib/ai/queue-build'

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

  const admin = createAdminClient()
  const { data: fullItem } = await admin
    .from('roadmap_items')
    .select('project_id, title, prd_content, projects(repo_url)')
    .eq('id', id)
    .single()

  if (!fullItem?.prd_content) {
    return NextResponse.json({ error: 'No PRD' }, { status: 400 })
  }

  const project = fullItem.projects as unknown as { repo_url: string | null }
  if (!project?.repo_url) {
    return NextResponse.json({ error: 'No repo' }, { status: 400 })
  }

  // Build the prompt from PRD
  const prd = fullItem.prd_content as Record<string, unknown>
  const prompt = `Implement this feature: ${fullItem.title}\n\n${prd.problem || ''}\n\nSolution: ${prd.solution || ''}\n\nAcceptance Criteria:\n${((prd.acceptance_criteria as string[]) || []).join('\n')}`

  await queueImplementJob(id, fullItem.project_id, project.repo_url, token, prompt)
  await admin.from('roadmap_items').update({ build_status: 'queued' }).eq('id', id)

  return NextResponse.json({
    status: 'queued',
    message: 'Build job queued',
  })
}
