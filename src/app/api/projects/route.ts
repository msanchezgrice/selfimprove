import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedProjectSignals } from '@/lib/ai/cold-start'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, slug, org_id, repo_url, site_url, framework, description, settings } = body

  if (!name || !org_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify user is member of this org
  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('org_members')
    .select('id')
    .eq('org_id', org_id)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this org' }, { status: 403 })
  }

  // Create project using admin client (bypasses RLS)
  const projectSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const { data: project, error } = await admin
    .from('projects')
    .insert({
      org_id,
      name,
      slug: projectSlug,
      repo_url: repo_url || null,
      site_url: site_url || null,
      framework: framework || null,
      description: description || null,
      allowed_domains: site_url ? [new URL(site_url).hostname] : [],
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update project_settings if custom settings provided
  if (settings && project) {
    await admin
      .from('project_settings')
      .update(settings)
      .eq('project_id', project.id)
  }

  // Trigger cold-start analysis (non-blocking)
  if (site_url) {
    seedProjectSignals(project.id, site_url).catch(() => {})
  }

  return NextResponse.json({ id: project.id })
}
