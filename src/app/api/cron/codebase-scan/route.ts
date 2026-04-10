import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { queueScanJob } from '@/lib/ai/queue-build'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Get projects with repos and stored GitHub tokens
  const { data: projects } = await supabase
    .from('projects')
    .select('id, repo_url, org_id')
    .eq('status', 'active')
    .not('repo_url', 'is', null)

  if (!projects) return NextResponse.json({ queued: 0 })

  let queued = 0
  for (const project of projects) {
    if (!project.repo_url) continue

    // Get GitHub token from org owner
    const { data: member } = await supabase
      .from('org_members')
      .select('github_token')
      .eq('org_id', project.org_id)
      .eq('role', 'owner')
      .not('github_token', 'is', null)
      .limit(1)
      .single()

    if (!member?.github_token) continue

    // Check if there's already a recent scan job (within last 6 days)
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('build_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('job_type', 'scan')
      .gte('created_at', sixDaysAgo)

    if (count && count > 0) continue // Already scanned recently

    try {
      await queueScanJob(project.id, project.repo_url, member.github_token)
      queued++
    } catch {}
  }

  return NextResponse.json({ queued, checked: projects.length })
}
