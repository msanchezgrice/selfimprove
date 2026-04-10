import { NextResponse } from 'next/server'
import { authenticateApiKey, getGitHubTokenFromApiKey } from '@/lib/auth/api-key'
import { createAdminClient } from '@/lib/supabase/admin'
import { queueScanJob } from '@/lib/ai/queue-build'
import { seedProjectSignals } from '@/lib/ai/cold-start'
import { importGitHubIssues } from '@/lib/ai/import-github-issues'
import crypto from 'crypto'

async function authenticateGitHub(token: string): Promise<{ userId: string; orgId: string; githubToken: string; loginUrl: string | null; isNewUser: boolean } | null> {
  // Verify the GitHub token by calling GitHub API
  const ghRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'SelfImprove-App' },
  })
  if (!ghRes.ok) return null

  const ghUser = await ghRes.json()
  const displayName = ghUser.name || ghUser.login

  // Get the user's verified emails (handles private email settings)
  let email = ghUser.email
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'SelfImprove-App' },
    })
    if (emailsRes.ok) {
      const emails = await emailsRes.json()
      const primary = emails.find((e: { primary: boolean; verified: boolean; email: string }) => e.primary && e.verified)
      email = primary?.email || emails[0]?.email
    }
  }
  if (!email) email = `${ghUser.login}@users.noreply.github.com`

  const supabase = createAdminClient()

  // Check if user already exists by email (check all known emails)
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === email)

  let userId: string
  let orgId: string

  if (existingUser) {
    userId = existingUser.id

    // Get their org
    const { data: membership } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .single()

    if (!membership) return null
    orgId = membership.org_id

    // Update GitHub token
    await supabase
      .from('org_members')
      .update({ github_token: token })
      .eq('user_id', userId)

    return { userId, orgId, githubToken: token, loginUrl: null, isNewUser: false }
  }

  // New user — create via Supabase admin API
  {
    const { data: newUser, error: userError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: displayName, avatar_url: ghUser.avatar_url, provider: 'github' },
    })

    if (userError || !newUser.user) return null
    userId = newUser.user.id

    // Create org + membership
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const { data: org } = await supabase
      .from('orgs')
      .insert({ name: `${displayName}'s Team`, slug: `${slug}-${Date.now()}` })
      .select('id')
      .single()

    if (!org) return null
    orgId = org.id

    await supabase
      .from('org_members')
      .insert({ org_id: orgId, user_id: userId, role: 'owner', github_token: token })

    // Generate API key for future use
    const apiKey = `si_${crypto.randomBytes(24).toString('hex')}`
    await supabase
      .from('org_members')
      .update({ api_key: apiKey })
      .eq('user_id', userId)

    // Generate magic login link so user can access dashboard without separate signup
    let loginUrl: string | null = null
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkData?.properties?.action_link) {
      loginUrl = linkData.properties.action_link
    }

    return { userId, orgId, githubToken: token, loginUrl, isNewUser: true }
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  let auth: { userId?: string; orgId: string } | null = null
  let githubToken: string | null = null
  let loginUrl: string | null = null
  let isNewUser = false

  if (bearerToken?.startsWith('si_')) {
    auth = await authenticateApiKey(request)
    githubToken = await getGitHubTokenFromApiKey(request)
  } else if (bearerToken?.startsWith('gho_') || bearerToken?.startsWith('ghp_') || bearerToken?.startsWith('github_pat_')) {
    const ghAuth = await authenticateGitHub(bearerToken)
    if (ghAuth) {
      auth = { orgId: ghAuth.orgId }
      githubToken = ghAuth.githubToken
      loginUrl = ghAuth.loginUrl
      isNewUser = ghAuth.isNewUser
    }
  }

  if (!auth) {
    return NextResponse.json({
      error: 'Authentication required.',
      options: [
        'Pass your GitHub token: Authorization: Bearer ghp_... (auto-creates account)',
        'Or your SelfImprove API key: Authorization: Bearer si_...',
        'Get a GitHub token by running: gh auth token',
      ],
    }, { status: 401 })
  }

  const body = await request.json()
  const { repo_url, site_url, name, framework, priority } = body

  if (!repo_url && !name) {
    return NextResponse.json({
      error: 'Provide at least repo_url or name',
      example: {
        repo_url: 'https://github.com/owner/repo',
        site_url: 'https://your-site.com',
        name: 'My Project',
        framework: 'nextjs',
        priority: 'balanced',
      },
    }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Derive project name from repo if not provided
  const projectName = name || repo_url?.split('/').pop()?.replace(/\.git$/, '') || 'My Project'
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  // Check for duplicate
  const { data: existing } = await supabase
    .from('projects')
    .select('id, slug')
    .eq('org_id', auth.orgId)
    .eq('slug', slug)
    .single()

  if (existing) {
    return NextResponse.json({
      message: 'Project already exists',
      project_id: existing.id,
      slug: existing.slug,
      dashboard_url: `https://selfimprove-iota.vercel.app/dashboard/${existing.slug}/roadmap`,
      widget_snippet: `<script src="https://selfimprove-iota.vercel.app/widget.js" data-project="${existing.id}"></script>`,
    })
  }

  // Create project
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      org_id: auth.orgId,
      name: projectName,
      slug,
      repo_url: repo_url || null,
      site_url: site_url || null,
      framework: framework || null,
      allowed_domains: site_url ? [new URL(site_url).hostname] : [],
    })
    .select('id, slug')
    .single()

  if (error || !project) {
    return NextResponse.json({ error: error?.message || 'Failed to create project' }, { status: 500 })
  }

  // Update settings if priority specified
  if (priority) {
    await supabase
      .from('project_settings')
      .update({ automation_roi_focus: priority })
      .eq('project_id', project.id)
  }

  // Fire background tasks (githubToken already set from auth above)

  if (site_url) {
    seedProjectSignals(project.id, site_url).catch(() => {})
  }

  if (repo_url && githubToken) {
    const repoMatch = repo_url.match(/github\.com\/([^/]+\/[^/]+)/)
    if (repoMatch) {
      const repoName = repoMatch[1].replace(/\.git$/, '')
      importGitHubIssues(project.id, repoName, githubToken).catch(() => {})
      queueScanJob(project.id, repo_url, githubToken).catch(() => {})
    }
  }

  const dashboardUrl = `https://selfimprove-iota.vercel.app/dashboard/${project.slug}/roadmap`
  const widgetSnippet = `<script src="https://selfimprove-iota.vercel.app/widget.js" data-project="${project.id}"></script>`

  const agentInstructions = `## SelfImprove Integration
This project uses SelfImprove for AI product management.
Dashboard: ${dashboardUrl}
Widget: https://selfimprove-iota.vercel.app/widget.js (project: ${project.id})
Signals API: https://selfimprove-iota.vercel.app/api/signals

### For coding agents
- A feedback widget collects user signals from the live site
- Signals feed an AI-generated product roadmap with PRDs
- When implementing features, check the roadmap for acceptance criteria
- POST feedback to /api/signals with {project_id: "${project.id}", type: "feedback", content: "..."}`

  return NextResponse.json({
    success: true,
    is_new_user: isNewUser,
    project_id: project.id,
    slug: project.slug,
    dashboard_url: loginUrl ? `${loginUrl}&redirect_to=${encodeURIComponent(`/dashboard/${project.slug}/roadmap`)}` : dashboardUrl,
    login_url: loginUrl || null,
    widget_snippet: widgetSnippet,
    agent_instructions: agentInstructions,
    next_steps: [
      loginUrl
        ? `Open this URL to sign in and view your dashboard (one-time magic link): ${loginUrl}&redirect_to=${encodeURIComponent(`/dashboard/${project.slug}/roadmap`)}`
        : `Visit ${dashboardUrl} to see your roadmap`,
      'First roadmap items appear within minutes from scans',
    ],
    scans: {
      site_scan: site_url ? 'queued' : 'skipped (no site_url)',
      codebase_scan: repo_url && githubToken ? 'queued' : 'skipped (no repo or token)',
      github_issues: repo_url && githubToken ? 'importing' : 'skipped',
    },
  })
}
