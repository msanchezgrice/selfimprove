import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedProjectSignals } from '@/lib/ai/cold-start'
import { generateRoadmap } from '@/lib/ai/generate-roadmap'
import { importGitHubIssues } from '@/lib/ai/import-github-issues'
import { getGitHubToken } from '@/lib/github/get-token'
import { queueScanJob } from '@/lib/ai/queue-build'

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
  // After seeding signals, also generate the initial roadmap
  if (site_url) {
    seedProjectSignals(project.id, site_url)
      .then((count) => {
        if (count > 0) {
          return generateRoadmap(project.id)
        }
      })
      .catch(() => {})
  }

  // Import GitHub Issues as signals if repo_url is provided (non-blocking)
  if (repo_url) {
    const providerToken = await getGitHubToken()
    if (providerToken) {
      const repoMatch = repo_url.match(/github\.com\/([^/]+\/[^/]+)/)
      if (repoMatch) {
        const repoName = repoMatch[1].replace(/\.git$/, '')
        importGitHubIssues(project.id, repoName, providerToken).catch(() => {})
      }

      // Queue a codebase scan job (non-blocking)
      queueScanJob(project.id, repo_url, providerToken).catch(() => {})
    }
  }

  return NextResponse.json({ id: project.id })
}
