import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const body = await request.json()
  const { repo_url, site_url, framework, settings } = body

  const admin = createAdminClient()

  // Verify user has access to this project via org membership
  const { data: project } = await admin
    .from('projects')
    .select('id, org_id')
    .eq('id', id)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const { data: membership } = await admin
    .from('org_members')
    .select('id')
    .eq('org_id', project.org_id)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this org' }, { status: 403 })
  }

  // Update project fields
  const updates: Record<string, unknown> = {}
  if (repo_url !== undefined) updates.repo_url = repo_url
  if (site_url !== undefined) {
    updates.site_url = site_url
    if (site_url) {
      try {
        updates.allowed_domains = [new URL(site_url).hostname]
      } catch {
        // invalid URL, skip allowed_domains update
      }
    }
  }
  if (framework !== undefined) updates.framework = framework

  if (Object.keys(updates).length > 0) {
    const { error } = await admin
      .from('projects')
      .update(updates)
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Update project_settings if provided (allowlisted fields only)
  if (settings) {
    const allowedFields = [
      'widget_position', 'widget_color', 'widget_label',
      'allowed_domains', 'voice_enabled',
      'automation_implement_enabled', 'automation_auto_merge',
      'posthog_api_key', 'posthog_host',
    ]
    const sanitized = Object.fromEntries(
      Object.entries(settings).filter(([key]) => allowedFields.includes(key))
    )
    if (Object.keys(sanitized).length > 0) {
      await admin.from('project_settings').update(sanitized).eq('project_id', id)
    }
  }

  return NextResponse.json({ id })
}
