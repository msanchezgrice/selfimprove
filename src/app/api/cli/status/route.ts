import { NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/auth/api-key'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://selfimprove-iota.vercel.app'

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const url = new URL(request.url)
  const projectId = url.searchParams.get('project_id')

  if (!projectId) {
    // List all projects
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, slug, status, repo_url, site_url')
      .eq('org_id', auth.orgId)
    return NextResponse.json({ projects })
  }

  // Get project details — scoped to authenticated org
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('org_id', auth.orgId)
    .single()

  const { count: signalCount } = await supabase
    .from('signals')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  const { count: briefCount } = await supabase
    .from('roadmap_items')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('stage', 'brief')

  const { count: roadmapCount } = await supabase
    .from('roadmap_items')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('stage', 'roadmap')

  const { data: pendingJobs } = await supabase
    .from('build_jobs')
    .select('id, job_type, status')
    .eq('project_id', projectId)
    .in('status', ['pending', 'running'])

  return NextResponse.json({
    project,
    signals: signalCount,
    briefs: briefCount,
    roadmap_items: roadmapCount,
    pending_jobs: pendingJobs,
    dashboard_url: `${APP_URL}/dashboard/${project?.slug}/roadmap`,
  })
}
