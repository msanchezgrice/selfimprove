import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callClaude } from '@/lib/ai/call-claude'

interface ProductContext {
  description: string
  target_users: string
  features: string
  priority_suggestion: string
}

const PRODUCT_CONTEXT_SCHEMA = {
  type: 'object' as const,
  properties: {
    description: { type: 'string', description: 'One paragraph describing what the product does' },
    target_users: { type: 'string', description: 'Who the target users are' },
    features: { type: 'string', description: 'Comma-separated list of main features detected' },
    priority_suggestion: { type: 'string', enum: ['bugs', 'ux', 'features', 'balanced'], description: 'Suggested priority based on product maturity' },
  },
  required: ['description', 'target_users', 'features', 'priority_suggestion'],
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Get project details
  const { data: project } = await admin
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const signals: string[] = []

  // 1. Crawl the site URL if available
  if (project.site_url) {
    try {
      const response = await fetch(project.site_url, {
        headers: { 'User-Agent': 'SelfImprove-Bot/1.0' },
        signal: AbortSignal.timeout(10000),
      })
      const html = await response.text()

      // Extract useful text
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)

      signals.push(`SITE TITLE: ${titleMatch?.[1] || 'Unknown'}`)
      signals.push(`SITE DESCRIPTION: ${descMatch?.[1] || 'None'}`)
      signals.push(`SITE H1: ${h1Match?.[1] || 'None'}`)

      // Extract visible text (rough — strip tags)
      const textContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000)
      signals.push(`SITE TEXT (first 3000 chars): ${textContent}`)
    } catch {
      signals.push('SITE: Could not fetch')
    }
  }

  // 2. Read GitHub repo README + package.json if repo connected
  if (project.repo_url) {
    const { data: { session } } = await supabase.auth.getSession()
    const providerToken = session?.provider_token

    if (providerToken) {
      // Extract owner/repo from URL
      const repoMatch = project.repo_url.match(/github\.com\/([^/]+\/[^/]+)/)
      if (repoMatch) {
        const repoFullName = repoMatch[1].replace(/\.git$/, '')

        // Fetch README
        try {
          const readmeRes = await fetch(`https://api.github.com/repos/${repoFullName}/readme`, {
            headers: {
              'Authorization': `Bearer ${providerToken}`,
              'Accept': 'application/vnd.github.v3.raw',
              'User-Agent': 'SelfImprove-App',
            },
          })
          if (readmeRes.ok) {
            const readme = await readmeRes.text()
            signals.push(`README (first 3000 chars): ${readme.slice(0, 3000)}`)
          }
        } catch { /* ignore */ }

        // Fetch package.json
        try {
          const pkgRes = await fetch(`https://api.github.com/repos/${repoFullName}/contents/package.json`, {
            headers: {
              'Authorization': `Bearer ${providerToken}`,
              'Accept': 'application/vnd.github.v3.raw',
              'User-Agent': 'SelfImprove-App',
            },
          })
          if (pkgRes.ok) {
            const pkgText = await pkgRes.text()
            const pkg = JSON.parse(pkgText)
            signals.push(`PACKAGE.JSON description: ${pkg.description || 'None'}`)
            signals.push(`PACKAGE.JSON dependencies: ${Object.keys(pkg.dependencies || {}).join(', ')}`)
          }
        } catch { /* ignore */ }

        // Fetch repo file tree (top-level + src/app)
        try {
          const treeRes = await fetch(`https://api.github.com/repos/${repoFullName}/git/trees/HEAD?recursive=1`, {
            headers: {
              'Authorization': `Bearer ${providerToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'SelfImprove-App',
            },
          })
          if (treeRes.ok) {
            const tree = await treeRes.json()
            // Extract page routes (files named page.tsx/page.js in app directory)
            const routes = tree.tree
              ?.filter((f: { type: string; path: string }) => f.type === 'blob' && /app\/.*page\.(tsx?|jsx?)$/.test(f.path))
              .map((f: { path: string }) => f.path)
              .slice(0, 30)
            if (routes?.length > 0) {
              signals.push(`DETECTED ROUTES: ${routes.join(', ')}`)
            }
          }
        } catch { /* ignore */ }
      }
    }
  }

  if (signals.length === 0) {
    return NextResponse.json({ error: 'No data available to analyze' }, { status: 400 })
  }

  // 3. Call Claude to synthesize product context
  try {
    const context = await callClaude<ProductContext>({
      prompt: `Analyze the following data about a software product and extract key information.

${signals.join('\n\n')}

Based on this information:
1. Write a concise 1-2 sentence product description
2. Identify the target users
3. List the main features (comma-separated)
4. Suggest what should be prioritized: "bugs" (if the product seems early/unstable), "ux" (if it seems functional but rough), "features" (if it seems polished but missing features), or "balanced"`,
      system: 'You are a product analyst. Extract factual product information from technical signals. Be concise and specific.',
      schema: PRODUCT_CONTEXT_SCHEMA,
      schemaName: 'product_context',
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 1024,
    })

    return NextResponse.json(context)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 }
    )
  }
}
