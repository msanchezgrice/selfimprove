import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canUseFeature } from '@/lib/stripe/tier-enforcement'
import { checkDailyCap } from '@/lib/ai/daily-cap'
import type { TierName } from '@/lib/constants/tiers'

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<'/api/roadmap/[id]/implement'>,
) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get roadmap item + project + org
  const { data: item } = await supabase
    .from('roadmap_items')
    .select('id, project_id, title, status, prd_content')
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

  // Get project + org for tier check
  const { data: project } = await supabase
    .from('projects')
    .select('id, org_id, repo_url, orgs(tier)')
    .eq('id', item.project_id)
    .single()

  if (!project?.repo_url) {
    return NextResponse.json(
      { error: 'No repository connected' },
      { status: 400 },
    )
  }

  const org = project.orgs as unknown as { tier: TierName }
  const tierCheck = canUseFeature(org.tier, 'autoImplement')
  if (!tierCheck.allowed) {
    return NextResponse.json(
      { error: tierCheck.reason, upgradeRequired: tierCheck.upgradeRequired },
      { status: 403 },
    )
  }

  // Get settings for daily cap
  const { data: settings } = await supabase
    .from('project_settings')
    .select('safety_daily_cap, automation_implement_enabled')
    .eq('project_id', item.project_id)
    .single()

  if (!settings?.automation_implement_enabled) {
    return NextResponse.json(
      { error: 'Auto-implement is disabled in project settings' },
      { status: 400 },
    )
  }

  const capCheck = await checkDailyCap(
    item.project_id,
    settings.safety_daily_cap,
  )
  if (!capCheck.allowed) {
    return NextResponse.json(
      {
        error: `Daily improvement cap reached (${capCheck.used}/${settings.safety_daily_cap})`,
        used: capCheck.used,
        remaining: capCheck.remaining,
      },
      { status: 429 },
    )
  }

  // Create shipped_change record in pending state
  const adminSupabase = createAdminClient()
  const { data: change } = await adminSupabase
    .from('shipped_changes')
    .insert({
      project_id: item.project_id,
      roadmap_item_id: item.id,
      approval_method: 'manual',
      status: 'pending_review',
    })
    .select('id')
    .single()

  // Update roadmap item status to building
  await adminSupabase
    .from('roadmap_items')
    .update({ status: 'building' })
    .eq('id', item.id)

  // TODO: Trigger Claude Code remote on customer's repo
  // This will be a webhook/queue-based system:
  // 1. POST to Claude Code API with repo_url + PRD content
  // 2. Claude Code creates a branch + PR
  // 3. Webhook callback hits /api/webhooks/implement with PR details
  // 4. Approval agent reviews the PR
  // For now, return the change record ID for tracking

  return NextResponse.json({
    changeId: change?.id,
    status: 'pending_review',
    message: `Implementation started for "${item.title}"`,
  })
}
