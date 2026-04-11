import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generatePRD } from '@/lib/ai/generate-prd'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit: 3 requests per hour per user
  const { allowed, resetIn } = checkRateLimit(
    `backfill-prds:${user.id}`, 3, 60 * 60 * 1000
  )
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retry_after_ms: resetIn },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(resetIn / 1000)) } }
    )
  }

  const admin = createAdminClient()

  // Verify user belongs to an org
  const { data: membership } = await admin
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Verify project belongs to user's org
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .single()
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const { data: items } = await admin
    .from('roadmap_items')
    .select('id, title')
    .eq('project_id', id)
    .is('prd_content', null)
    .order('rank', { ascending: true })
    .limit(10)

  if (!items || items.length === 0) {
    return NextResponse.json({ message: 'All items have PRDs', generated: 0 })
  }

  let generated = 0
  for (const item of items) {
    try {
      await generatePRD(item.id)
      generated++
    } catch (err) {
      console.error(`[backfill-prds] Failed for ${item.id}:`, err)
    }
  }

  return NextResponse.json({ generated, total: items.length })
}
