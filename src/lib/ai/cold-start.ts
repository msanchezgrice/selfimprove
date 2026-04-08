import { createAdminClient } from '@/lib/supabase/admin'
import { SIGNAL_WEIGHTS } from '@/lib/constants/signal-weights'

interface SiteAnalysis {
  title: string
  description: string
  framework: string | null
  hasAnalytics: boolean
  hasErrorTracking: boolean
  hasSitemap: boolean
  hasRobotsTxt: boolean
  performanceHints: string[]
  securityHints: string[]
  accessibilityHints: string[]
  agentReadiness: string[]
}

export async function analyzeSite(siteUrl: string): Promise<SiteAnalysis> {
  const analysis: SiteAnalysis = {
    title: '',
    description: '',
    framework: null,
    hasAnalytics: false,
    hasErrorTracking: false,
    hasSitemap: false,
    hasRobotsTxt: false,
    performanceHints: [],
    securityHints: [],
    accessibilityHints: [],
    agentReadiness: [],
  }

  try {
    // Fetch the homepage
    const response = await fetch(siteUrl, {
      headers: { 'User-Agent': 'SelfImprove-Bot/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    const html = await response.text()

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch) analysis.title = titleMatch[1].trim()

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    if (descMatch) analysis.description = descMatch[1].trim()

    // Framework detection
    if (html.includes('__next') || html.includes('_next/static')) analysis.framework = 'Next.js'
    else if (html.includes('__nuxt')) analysis.framework = 'Nuxt'
    else if (html.includes('__svelte') || html.includes('svelte')) analysis.framework = 'SvelteKit'
    else if (html.includes('data-reactroot') || html.includes('_react')) analysis.framework = 'React'
    else if (html.includes('ng-version') || html.includes('ng-app')) analysis.framework = 'Angular'
    else if (html.includes('data-v-') || html.includes('__vue')) analysis.framework = 'Vue'

    // Analytics detection
    analysis.hasAnalytics = /posthog|google-analytics|gtag|analytics|segment|mixpanel|amplitude/i.test(html)

    // Error tracking detection
    analysis.hasErrorTracking = /sentry|bugsnag|datadog|rollbar|logrocket/i.test(html)

    // Performance hints
    if (!html.includes('loading="lazy"') && html.includes('<img')) {
      analysis.performanceHints.push('Images found without lazy loading')
    }
    if (!html.includes('<link rel="preconnect"') && !html.includes('<link rel="dns-prefetch"')) {
      analysis.performanceHints.push('No resource preconnection hints found')
    }
    if (html.length > 500000) {
      analysis.performanceHints.push('Large initial HTML payload (>500KB)')
    }

    // Security hints
    const headers = response.headers
    if (!headers.get('strict-transport-security')) {
      analysis.securityHints.push('Missing Strict-Transport-Security header')
    }
    if (!headers.get('x-content-type-options')) {
      analysis.securityHints.push('Missing X-Content-Type-Options header')
    }
    if (!headers.get('content-security-policy')) {
      analysis.securityHints.push('No Content-Security-Policy header')
    }

    // Accessibility hints
    if (!html.includes('lang=')) {
      analysis.accessibilityHints.push('Missing lang attribute on <html>')
    }
    const imgWithoutAlt = (html.match(/<img(?![^>]*alt=)/gi) || []).length
    if (imgWithoutAlt > 0) {
      analysis.accessibilityHints.push(`${imgWithoutAlt} image(s) missing alt text`)
    }
    if (!html.includes('aria-') && !html.includes('role=')) {
      analysis.accessibilityHints.push('No ARIA attributes or roles detected')
    }

    // Agent readiness (from launch-ready patterns)
    if (!html.includes('robots') && !html.includes('sitemap')) {
      analysis.agentReadiness.push('No robots.txt or sitemap references found')
    }
    if (!html.includes('api') && !html.includes('graphql')) {
      analysis.agentReadiness.push('No API endpoints detected in page source')
    }
    if (html.includes('.well-known')) {
      analysis.agentReadiness.push('Has .well-known directory (good for agent discovery)')
    }

    // Check sitemap
    try {
      const sitemapUrl = new URL('/sitemap.xml', siteUrl).href
      const sitemapRes = await fetch(sitemapUrl, { signal: AbortSignal.timeout(5000) })
      analysis.hasSitemap = sitemapRes.ok
    } catch { /* ignore */ }

    // Check robots.txt
    try {
      const robotsUrl = new URL('/robots.txt', siteUrl).href
      const robotsRes = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) })
      analysis.hasRobotsTxt = robotsRes.ok
    } catch { /* ignore */ }

  } catch {
    // Site unreachable — return empty analysis
  }

  return analysis
}

export async function seedProjectSignals(projectId: string, siteUrl: string): Promise<number> {
  const analysis = await analyzeSite(siteUrl)
  const signals: Array<{ title: string; content: string; metadata: Record<string, unknown> }> = []

  // Convert analysis findings into builder signals
  if (analysis.performanceHints.length > 0) {
    signals.push({
      title: 'Performance improvements detected',
      content: `Site analysis found ${analysis.performanceHints.length} performance issue(s):\n${analysis.performanceHints.map(h => `- ${h}`).join('\n')}`,
      metadata: { category: 'performance', hints: analysis.performanceHints },
    })
  }

  if (analysis.securityHints.length > 0) {
    signals.push({
      title: 'Security headers missing',
      content: `Site analysis found ${analysis.securityHints.length} security issue(s):\n${analysis.securityHints.map(h => `- ${h}`).join('\n')}`,
      metadata: { category: 'security', hints: analysis.securityHints },
    })
  }

  if (analysis.accessibilityHints.length > 0) {
    signals.push({
      title: 'Accessibility improvements needed',
      content: `Site analysis found ${analysis.accessibilityHints.length} accessibility issue(s):\n${analysis.accessibilityHints.map(h => `- ${h}`).join('\n')}`,
      metadata: { category: 'accessibility', hints: analysis.accessibilityHints },
    })
  }

  if (!analysis.hasAnalytics) {
    signals.push({
      title: 'No analytics detected',
      content: 'No analytics provider (PostHog, Google Analytics, Segment, etc.) detected on the site. Consider adding analytics to understand user behavior.',
      metadata: { category: 'infrastructure' },
    })
  }

  if (!analysis.hasErrorTracking) {
    signals.push({
      title: 'No error tracking detected',
      content: 'No error tracking service (Sentry, Bugsnag, etc.) detected. Consider adding error tracking to catch production issues.',
      metadata: { category: 'infrastructure' },
    })
  }

  if (analysis.agentReadiness.length > 0) {
    signals.push({
      title: 'Agent readiness assessment',
      content: `Site agent readiness findings:\n${analysis.agentReadiness.map(h => `- ${h}`).join('\n')}`,
      metadata: { category: 'agent-readiness', hints: analysis.agentReadiness },
    })
  }

  if (!analysis.hasSitemap) {
    signals.push({
      title: 'Missing sitemap.xml',
      content: 'No sitemap.xml found. A sitemap helps search engines and AI agents discover your content.',
      metadata: { category: 'seo' },
    })
  }

  if (signals.length === 0) return 0

  const supabase = createAdminClient()
  const inserts = signals.map(s => ({
    project_id: projectId,
    type: 'builder' as const,
    title: s.title,
    content: s.content,
    metadata: { ...s.metadata, source: 'cold-start-analysis', site_url: siteUrl },
    weight: SIGNAL_WEIGHTS.builder,
  }))

  await supabase.from('signals').insert(inserts)
  return signals.length
}
