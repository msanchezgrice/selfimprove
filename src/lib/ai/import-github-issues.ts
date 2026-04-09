import { createAdminClient } from '@/lib/supabase/admin'
import { SIGNAL_WEIGHTS } from '@/lib/constants/signal-weights'

interface GitHubIssue {
  number: number
  title: string
  body: string | null
  labels: Array<{ name: string }>
  state: string
  html_url: string
  created_at: string
  comments: number
  pull_request?: unknown
}

export async function importGitHubIssues(
  projectId: string,
  repoFullName: string,
  githubToken: string,
): Promise<number> {
  // Fetch open issues (up to 50)
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/issues?state=open&per_page=50&sort=updated`,
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'SelfImprove-App',
      },
    },
  )

  if (!response.ok) return 0

  const issues: GitHubIssue[] = await response.json()

  // Filter out PRs (GitHub API returns PRs as issues too)
  const realIssues = issues.filter((i) => !('pull_request' in i && i.pull_request))

  if (realIssues.length === 0) return 0

  const supabase = createAdminClient()

  const signals = realIssues.map((issue) => {
    // Determine signal type from labels
    const labels = issue.labels.map((l) => l.name.toLowerCase())
    let type: 'feedback' | 'error' | 'builder' = 'feedback'
    if (labels.some((l) => l.includes('bug') || l.includes('error'))) {
      type = 'error'
    } else if (
      labels.some((l) => l.includes('infra') || l.includes('chore') || l.includes('tech'))
    ) {
      type = 'builder'
    }

    return {
      project_id: projectId,
      type,
      title: `GitHub #${issue.number}: ${issue.title}`,
      content: issue.body?.slice(0, 2000) || issue.title,
      metadata: {
        source: 'github_issues',
        issue_number: issue.number,
        issue_url: issue.html_url,
        labels: issue.labels.map((l) => l.name),
        comments: issue.comments,
        created_at: issue.created_at,
      },
      weight: SIGNAL_WEIGHTS[type] ?? 1,
    }
  })

  await supabase.from('signals').insert(signals)
  return signals.length
}
