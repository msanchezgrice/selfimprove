import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySecret } from '@/lib/auth/verify-secret'

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader || !verifySecret(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Find all roadmap items with PRs that aren't shipped yet
  const { data: items } = await supabase
    .from('roadmap_items')
    .select('id, pr_number, pr_url, status, build_status, project_id, projects(repo_url, org_id)')
    .not('pr_number', 'is', null)
    .not('status', 'eq', 'shipped')
    .not('status', 'eq', 'dismissed')
    .not('status', 'eq', 'archived')

  if (!items || items.length === 0) {
    return NextResponse.json({ synced: 0 })
  }

  let synced = 0

  for (const item of items) {
    const project = item.projects as unknown as { repo_url: string | null; org_id: string }
    if (!project?.repo_url || !item.pr_number) continue

    const repoMatch = project.repo_url.match(/github\.com\/([^/]+\/[^/]+)/)
    if (!repoMatch) continue
    const repo = repoMatch[1].replace(/\.git$/, '')

    // Get the GitHub token for this project's org owner
    const { data: member } = await supabase
      .from('org_members')
      .select('github_token')
      .eq('org_id', project.org_id)
      .eq('role', 'owner')
      .not('github_token', 'is', null)
      .limit(1)
      .single()

    if (!member?.github_token) continue

    // Check PR status on GitHub
    try {
      const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${item.pr_number}`, {
        headers: {
          Authorization: `Bearer ${member.github_token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'SelfImprove-App',
        },
      })

      if (!prRes.ok) continue

      const pr = await prRes.json()

      if (pr.merged) {
        // PR was merged — mark as shipped
        await supabase
          .from('roadmap_items')
          .update({ status: 'shipped', build_status: 'merged' })
          .eq('id', item.id)
        synced++
      } else if (pr.state === 'closed' && !pr.merged) {
        // PR was closed without merging — reset to approved
        await supabase
          .from('roadmap_items')
          .update({ build_status: 'approved' })
          .eq('id', item.id)
        synced++
      } else if (pr.state === 'open' && item.build_status !== 'pr_created' && !item.build_status?.startsWith('reviewed')) {
        // PR is open — make sure status reflects it
        await supabase
          .from('roadmap_items')
          .update({ build_status: 'pr_created' })
          .eq('id', item.id)
        synced++
      }
    } catch {
      // Skip on error
    }
  }

  return NextResponse.json({ synced, checked: items.length })
}
