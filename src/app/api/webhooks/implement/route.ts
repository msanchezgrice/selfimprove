import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { reviewPR, type PRDiff } from '@/lib/ai/approval-agent'
import { notifyPRCreated } from '@/lib/notifications'
import type { ProjectSettingsRow } from '@/lib/types/database'

interface ImplementWebhookPayload {
  change_id: string
  project_id: string
  pr_url: string
  pr_number: number
  diff: {
    files_changed: number
    lines_added: number
    lines_removed: number
    file_paths: string[]
    has_tests: boolean
    content: string
  }
}

export async function POST(request: Request) {
  // Verify webhook secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.IMPLEMENT_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = (await request.json()) as ImplementWebhookPayload
  const supabase = createAdminClient()

  // Update shipped_change with PR details
  await supabase
    .from('shipped_changes')
    .update({
      pr_url: payload.pr_url,
      pr_number: payload.pr_number,
    })
    .eq('id', payload.change_id)

  // Notify about PR creation (fire-and-forget)
  const { data: changeForNotify } = await supabase
    .from('shipped_changes')
    .select('roadmap_item_id, roadmap_items(title)')
    .eq('id', payload.change_id)
    .single()
  if (changeForNotify?.roadmap_items) {
    const itemTitle = (changeForNotify.roadmap_items as unknown as { title: string }).title
    notifyPRCreated(payload.project_id, payload.pr_url, itemTitle).catch(() => {})
  }

  // Get project settings for approval thresholds
  const { data: settings } = await supabase
    .from('project_settings')
    .select('*')
    .eq('project_id', payload.project_id)
    .single()

  if (!settings) {
    return NextResponse.json(
      { error: 'Project settings not found' },
      { status: 400 },
    )
  }

  // Run approval agent
  const diff: PRDiff = {
    filesChanged: payload.diff.files_changed,
    linesAdded: payload.diff.lines_added,
    linesRemoved: payload.diff.lines_removed,
    filePaths: payload.diff.file_paths,
    hasTests: payload.diff.has_tests,
    diffContent: payload.diff.content,
  }

  const assessment = await reviewPR(diff, settings as ProjectSettingsRow)

  // Determine status based on assessment decision + project settings
  let newStatus: string
  let approvalMethod = 'manual'

  if (assessment.decision === 'approve') {
    if (settings.automation_auto_merge) {
      newStatus = 'merged'
      approvalMethod = 'auto_merged'
    } else if (settings.automation_auto_approve) {
      newStatus = 'approved'
      approvalMethod = 'auto_approved'
    } else {
      newStatus = 'approved'
      approvalMethod = 'manual'
    }
  } else {
    // 'flag' or 'reject' both require manual review
    newStatus = 'pending_review'
    approvalMethod = 'manual'
  }

  await supabase
    .from('shipped_changes')
    .update({
      risk_score: assessment.combinedScore,
      approval_method: approvalMethod,
      status: newStatus,
    })
    .eq('id', payload.change_id)

  // If auto-merged, update roadmap item to shipped
  if (newStatus === 'merged') {
    const { data: change } = await supabase
      .from('shipped_changes')
      .select('roadmap_item_id')
      .eq('id', payload.change_id)
      .single()

    if (change) {
      await supabase
        .from('roadmap_items')
        .update({ status: 'shipped' })
        .eq('id', change.roadmap_item_id)
    }
  }

  return NextResponse.json({
    assessment,
    status: newStatus,
    approvalMethod,
  })
}
