import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createGitHubIssue } from '@/lib/ai/github-issue'
import { getGitHubToken } from '@/lib/github/get-token'
import { implementRoadmapItem } from '@/lib/ai/implement'

export async function PATCH(
  req: Request,
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

  // Verify user has access to this roadmap item's project
  const { data: item } = await supabase
    .from('roadmap_items')
    .select('id, project_id')
    .eq('id', id)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()

  // Allow updating: status, dismiss_reason, feedback_up, feedback_down, rank
  const allowedFields = [
    'status',
    'dismiss_reason',
    'feedback_up',
    'feedback_down',
    'rank',
  ] as const

  const updates: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('roadmap_items')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Auto-create GitHub Issue when approved
  let githubIssue: { url: string; number: number } | null = null
  if (updates.status === 'approved') {
    const providerToken = await getGitHubToken()
    if (providerToken) {
      try {
        githubIssue = await createGitHubIssue(id, providerToken)
      } catch (err) {
        console.error('[approve] GitHub issue creation failed:', err)
      }
    } else {
      console.warn('[approve] No GitHub provider token — issue not created')
    }

    if (!githubIssue) {
      // build_status not yet set by createGitHubIssue, set it directly
      await admin.from('roadmap_items').update({ build_status: 'approved' }).eq('id', id)
    }

    // Auto-implement if enabled and PRD exists
    if (providerToken) {
      const { data: settings } = await admin
        .from('project_settings')
        .select('automation_implement_enabled')
        .eq('project_id', item.project_id)
        .single()

      if (settings?.automation_implement_enabled) {
        const { data: fullItem } = await admin
          .from('roadmap_items')
          .select('prd_content')
          .eq('id', id)
          .single()

        if (fullItem?.prd_content) {
          after(async () => {
            try {
              await implementRoadmapItem(id, providerToken!)
            } catch (err) {
              console.error('[after/implement] Failed:', err)
            }
          })
        }
      }
    }
  }

  return NextResponse.json({ id, ...updates, githubIssue })
}
