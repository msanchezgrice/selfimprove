import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGitHubToken } from '@/lib/github/get-token'
import { reviewPR, type PRDiff } from '@/lib/ai/approval-agent'
import type { ProjectSettingsRow } from '@/lib/types/database'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = await getGitHubToken()
  if (!token) return NextResponse.json({ error: 'No GitHub token' }, { status: 400 })

  const admin = createAdminClient()

  // Get item + project
  const { data: item } = await admin
    .from('roadmap_items')
    .select('id, pr_url, pr_number, project_id, projects(repo_url)')
    .eq('id', id)
    .single()

  if (!item?.pr_number) return NextResponse.json({ error: 'No PR to review' }, { status: 400 })

  const project = item.projects as unknown as { repo_url: string | null }
  if (!project?.repo_url) return NextResponse.json({ error: 'No repo' }, { status: 400 })

  const repoMatch = project.repo_url.match(/github\.com\/([^/]+\/[^/]+)/)
  if (!repoMatch) return NextResponse.json({ error: 'Invalid repo URL' }, { status: 400 })
  const repo = repoMatch[1].replace(/\.git$/, '')

  // Fetch PR diff from GitHub
  const diffRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${item.pr_number}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3.diff',
      'User-Agent': 'SelfImprove-App',
    },
  })

  if (!diffRes.ok) return NextResponse.json({ error: 'Failed to fetch PR diff' }, { status: 500 })
  const diffContent = await diffRes.text()

  // Fetch PR file stats
  const filesRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${item.pr_number}/files`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'SelfImprove-App',
    },
  })

  const files = filesRes.ok ? await filesRes.json() as Array<{ filename: string; additions: number; deletions: number }> : []

  const diff: PRDiff = {
    filesChanged: files.length,
    linesAdded: files.reduce((s, f) => s + f.additions, 0),
    linesRemoved: files.reduce((s, f) => s + f.deletions, 0),
    filePaths: files.map(f => f.filename),
    hasTests: files.some(f => f.filename.includes('test') || f.filename.includes('spec')),
    diffContent,
  }

  // Get project settings
  const { data: settings } = await admin
    .from('project_settings')
    .select('*')
    .eq('project_id', item.project_id)
    .single()

  if (!settings) return NextResponse.json({ error: 'No settings' }, { status: 400 })

  // Run approval agent
  const assessment = await reviewPR(diff, settings as ProjectSettingsRow)

  // Post review as GitHub PR comment
  const commentBody = `## SelfImprove AI Review

**Decision:** ${assessment.decision.toUpperCase()}
**Risk Score:** ${assessment.combinedScore}/100 (mechanical: ${assessment.mechanicalScore}, semantic: ${assessment.semanticScore})

${assessment.reasons.length > 0 ? `### Concerns\n${assessment.reasons.map(r => `- ${r}`).join('\n')}` : ''}

${assessment.suggestions.length > 0 ? `### Suggestions\n${assessment.suggestions.map(s => `- ${s}`).join('\n')}` : ''}

---
*Reviewed by [SelfImprove](https://selfimprove-iota.vercel.app) Approval Agent*`

  await fetch(`https://api.github.com/repos/${repo}/issues/${item.pr_number}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'SelfImprove-App',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: commentBody }),
  })

  // Update build status based on decision
  const newStatus = assessment.decision === 'approve' ? 'reviewed_approved' : assessment.decision === 'reject' ? 'reviewed_rejected' : 'reviewed_flagged'
  await admin.from('roadmap_items').update({ build_status: newStatus }).eq('id', id)

  return NextResponse.json({ assessment, status: newStatus })
}
