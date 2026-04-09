import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGitHubToken } from '@/lib/github/get-token'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get the GitHub provider token (session first, then DB fallback)
  const providerToken = await getGitHubToken()

  if (!providerToken) {
    return NextResponse.json({ error: 'No GitHub token. Please re-login with GitHub.' }, { status: 400 })
  }

  try {
    // Fetch user's repos from GitHub API
    const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30&type=all', {
      headers: {
        'Authorization': `Bearer ${providerToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SelfImprove-App',
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch repos' }, { status: response.status })
    }

    const repos = await response.json()

    // Return simplified repo list
    const simplified = repos.map((repo: Record<string, unknown>) => ({
      full_name: repo.full_name,
      name: repo.name,
      html_url: repo.html_url,
      description: repo.description,
      language: repo.language,
      default_branch: repo.default_branch,
      private: repo.private,
      updated_at: repo.updated_at,
    }))

    return NextResponse.json({ repos: simplified })
  } catch {
    return NextResponse.json({ error: 'GitHub API error' }, { status: 500 })
  }
}
