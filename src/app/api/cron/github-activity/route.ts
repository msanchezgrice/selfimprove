import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SIGNAL_WEIGHTS } from '@/lib/constants/signal-weights'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, repo_url, org_id')
    .eq('status', 'active')
    .not('repo_url', 'is', null)

  if (!projects) return NextResponse.json({ imported: 0 })

  let totalImported = 0
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  for (const project of projects) {
    if (!project.repo_url) continue

    const repoMatch = project.repo_url.match(/github\.com\/([^/]+\/[^/]+)/)
    if (!repoMatch) continue
    const repo = repoMatch[1].replace(/\.git$/, '')

    // Get GitHub token
    const { data: member } = await supabase
      .from('org_members')
      .select('github_token')
      .eq('org_id', project.org_id)
      .eq('role', 'owner')
      .not('github_token', 'is', null)
      .limit(1)
      .single()

    if (!member?.github_token) continue

    try {
      // Fetch recent issues (created in last 24h)
      const issuesRes = await fetch(
        `https://api.github.com/repos/${repo}/issues?state=open&since=${oneDayAgo}&per_page=20&sort=created`,
        {
          headers: {
            Authorization: `Bearer ${member.github_token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'SelfImprove-App',
          },
        }
      )

      if (!issuesRes.ok) continue
      const issues = await issuesRes.json()

      // Filter: only new issues (not PRs), created after our cutoff
      const newIssues = issues.filter((i: any) =>
        !i.pull_request &&
        new Date(i.created_at) > new Date(oneDayAgo)
      )

      if (newIssues.length === 0) continue

      // Check which issues we've already imported (by checking metadata)
      const { data: existingSignals } = await supabase
        .from('signals')
        .select('metadata')
        .eq('project_id', project.id)
        .eq('type', 'feedback')

      const existingIssueNumbers = new Set(
        (existingSignals || [])
          .map(s => (s.metadata as any)?.issue_number)
          .filter(Boolean)
      )

      const signals = newIssues
        .filter((i: any) => !existingIssueNumbers.has(i.number))
        .map((issue: any) => {
          const labels = (issue.labels || []).map((l: any) => l.name?.toLowerCase())
          let type: 'feedback' | 'error' | 'builder' = 'feedback'
          if (labels.some((l: string) => l.includes('bug') || l.includes('error'))) type = 'error'
          else if (labels.some((l: string) => l.includes('chore') || l.includes('infra'))) type = 'builder'

          return {
            project_id: project.id,
            type,
            title: `GitHub #${issue.number}: ${issue.title}`,
            content: issue.body?.slice(0, 2000) || issue.title,
            metadata: {
              source: 'github_activity',
              issue_number: issue.number,
              issue_url: issue.html_url,
              labels: issue.labels?.map((l: any) => l.name) || [],
              author: issue.user?.login,
            },
            weight: SIGNAL_WEIGHTS[type] ?? 1,
          }
        })

      if (signals.length > 0) {
        await supabase.from('signals').insert(signals)
        totalImported += signals.length
      }
    } catch {}
  }

  return NextResponse.json({ imported: totalImported, projects: projects.length })
}
