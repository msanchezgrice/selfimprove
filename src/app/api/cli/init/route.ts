import { NextResponse } from 'next/server'
import { authenticateApiKey, getGitHubTokenFromApiKey } from '@/lib/auth/api-key'
import { createAdminClient } from '@/lib/supabase/admin'
import { queueScanJob } from '@/lib/ai/queue-build'
import { seedProjectSignals } from '@/lib/ai/cold-start'
import { importGitHubIssues } from '@/lib/ai/import-github-issues'

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) {
    return NextResponse.json({
      error: 'Authentication required. Pass your API key as: Authorization: Bearer si_...',
      help: 'Get your API key at https://selfimprove-iota.vercel.app/dashboard/settings (Team & Billing tab)',
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

  // Fire background tasks
  const githubToken = await getGitHubTokenFromApiKey(request)

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
    project_id: project.id,
    slug: project.slug,
    dashboard_url: dashboardUrl,
    widget_snippet: widgetSnippet,
    agent_instructions: agentInstructions,
    next_steps: [
      `Add the widget to your HTML: ${widgetSnippet}`,
      `Create SELFIMPROVE.md in your repo root with the agent instructions above`,
      `Visit ${dashboardUrl} to see your roadmap (first items appear within minutes)`,
    ],
    scans: {
      site_scan: site_url ? 'queued' : 'skipped (no site_url)',
      codebase_scan: repo_url && githubToken ? 'queued' : 'skipped (no repo or token)',
      github_issues: repo_url && githubToken ? 'importing' : 'skipped',
    },
  })
}
