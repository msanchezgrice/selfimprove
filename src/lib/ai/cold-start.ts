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
  seoHints: string[]
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
    seoHints: [],
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

    // -----------------------------------------------------------------------
    // Performance checks
    // -----------------------------------------------------------------------
    if (!html.includes('loading="lazy"') && html.includes('<img')) {
      analysis.performanceHints.push('Images found without lazy loading')
    }
    if (!html.includes('<link rel="preconnect"') && !html.includes('<link rel="dns-prefetch"')) {
      analysis.performanceHints.push('No resource preconnection hints found')
    }
    if (html.length > 500000) {
      analysis.performanceHints.push('Large initial HTML payload (>500KB)')
    }
    // Heuristic for total page weight: HTML > 500KB likely means > 2MB with resources
    if (html.length > 500000) {
      analysis.performanceHints.push('Page likely exceeds 2MB total weight including resources')
    }
    // Render-blocking scripts in <head>
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
    if (headMatch) {
      const headContent = headMatch[1]
      const blockingScripts = headContent.match(/<script(?![^>]*\b(async|defer)\b)[^>]*src=/gi)
      if (blockingScripts && blockingScripts.length > 0) {
        analysis.performanceHints.push(
          `${blockingScripts.length} render-blocking script(s) in <head> without async/defer`
        )
      }
    }
    // Unoptimized images: img without width/height
    const imgsWithoutDimensions = (html.match(/<img(?![^>]*width=)(?![^>]*height=)[^>]*>/gi) || []).length
    if (imgsWithoutDimensions > 0) {
      analysis.performanceHints.push(
        `${imgsWithoutDimensions} image(s) missing explicit width/height attributes (causes layout shift)`
      )
    }
    // No next/image usage in a Next.js app
    if (analysis.framework === 'Next.js' && !html.includes('__next/image') && !html.includes('/_next/image')) {
      analysis.performanceHints.push('Next.js app not using next/image for image optimization')
    }
    // Missing font optimization
    if (!html.includes('font-display') && !html.includes('next/font') && !html.includes('__next_font')) {
      analysis.performanceHints.push('No font-display: swap or next/font usage detected — fonts may block rendering')
    }

    // -----------------------------------------------------------------------
    // Security checks (enhanced)
    // -----------------------------------------------------------------------
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
    // Mixed content: http:// resources on https:// page
    if (siteUrl.startsWith('https://')) {
      const mixedContentMatches = html.match(/(?:src|href|action)=["']http:\/\/[^"']+["']/gi)
      if (mixedContentMatches && mixedContentMatches.length > 0) {
        analysis.securityHints.push(
          `${mixedContentMatches.length} mixed content reference(s) loading HTTP resources on HTTPS page`
        )
      }
    }
    // Inline scripts without nonce (CSP concern)
    const inlineScripts = html.match(/<script(?![^>]*\bsrc=)[^>]*>/gi) || []
    const inlineScriptsWithoutNonce = inlineScripts.filter(tag => !tag.includes('nonce='))
    if (inlineScriptsWithoutNonce.length > 0) {
      analysis.securityHints.push(
        `${inlineScriptsWithoutNonce.length} inline script(s) without nonce attribute (CSP concern)`
      )
    }
    // Exposed API keys in HTML source
    const apiKeyPatterns = /(?:sk_live_|pk_live_|sk_test_|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})/g
    const exposedKeys = html.match(apiKeyPatterns)
    if (exposedKeys && exposedKeys.length > 0) {
      analysis.securityHints.push(
        `${exposedKeys.length} potential API key(s) exposed in HTML source`
      )
    }

    // -----------------------------------------------------------------------
    // Accessibility checks
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // SEO checks
    // -----------------------------------------------------------------------
    // Open Graph tags
    if (!html.includes('og:title') && !html.includes('og:description')) {
      analysis.seoHints.push('Missing Open Graph meta tags (og:title, og:description)')
    }
    // Canonical URL
    if (!html.includes('rel="canonical"') && !html.includes("rel='canonical'")) {
      analysis.seoHints.push('Missing canonical URL — search engines may index duplicate pages')
    }
    // Structured data (JSON-LD)
    if (!html.includes('application/ld+json')) {
      analysis.seoHints.push('No JSON-LD structured data found')
    }
    // Heading hierarchy: h1 check
    const h1Matches = html.match(/<h1[\s>]/gi) || []
    if (h1Matches.length === 0) {
      analysis.seoHints.push('No <h1> element found — important for SEO heading hierarchy')
    } else if (h1Matches.length > 1) {
      analysis.seoHints.push(`${h1Matches.length} <h1> elements found — best practice is exactly one per page`)
    }

    // -----------------------------------------------------------------------
    // Agent readiness checks (inspired by launchready)
    // -----------------------------------------------------------------------
    if (!html.includes('robots') && !html.includes('sitemap')) {
      analysis.agentReadiness.push('No robots.txt or sitemap references found')
    }
    if (!html.includes('api') && !html.includes('graphql')) {
      analysis.agentReadiness.push('No API endpoints detected in page source')
    }
    if (html.includes('.well-known')) {
      analysis.agentReadiness.push('Has .well-known directory (good for agent discovery)')
    }
    // Semantic HTML landmarks
    const hasMain = /<main[\s>]/i.test(html)
    const hasNav = /<nav[\s>]/i.test(html)
    const hasHeader = /<header[\s>]/i.test(html)
    const hasFooter = /<footer[\s>]/i.test(html)
    const landmarkCount = [hasMain, hasNav, hasHeader, hasFooter].filter(Boolean).length
    if (landmarkCount < 3) {
      const missingLandmarks: string[] = []
      if (!hasMain) missingLandmarks.push('main')
      if (!hasNav) missingLandmarks.push('nav')
      if (!hasHeader) missingLandmarks.push('header')
      if (!hasFooter) missingLandmarks.push('footer')
      analysis.agentReadiness.push(
        `Missing semantic HTML landmarks: ${missingLandmarks.join(', ')} — reduces agent navigability`
      )
    }
    // data-testid attributes (testability)
    if (!html.includes('data-testid')) {
      analysis.agentReadiness.push('No data-testid attributes found — reduces automated testability')
    }

    // -----------------------------------------------------------------------
    // Side-fetches: sitemap, robots.txt, llms.txt, agents.md, OpenAPI spec
    // -----------------------------------------------------------------------
    const sideFetches = await Promise.allSettled([
      fetch(new URL('/sitemap.xml', siteUrl).href, { signal: AbortSignal.timeout(5000) }),
      fetch(new URL('/robots.txt', siteUrl).href, { signal: AbortSignal.timeout(5000) }),
      fetch(new URL('/llms.txt', siteUrl).href, { signal: AbortSignal.timeout(5000) }),
      fetch(new URL('/agents.md', siteUrl).href, { signal: AbortSignal.timeout(5000) }),
      fetch(new URL('/openapi.json', siteUrl).href, { signal: AbortSignal.timeout(5000) }),
      fetch(new URL('/swagger.json', siteUrl).href, { signal: AbortSignal.timeout(5000) }),
    ])

    // sitemap
    if (sideFetches[0].status === 'fulfilled' && sideFetches[0].value.ok) {
      analysis.hasSitemap = true
    }
    // robots.txt
    if (sideFetches[1].status === 'fulfilled' && sideFetches[1].value.ok) {
      analysis.hasRobotsTxt = true
    }
    // llms.txt
    if (sideFetches[2].status !== 'fulfilled' || !sideFetches[2].value.ok) {
      analysis.agentReadiness.push('No /llms.txt found — LLM agents cannot discover site capabilities')
    }
    // agents.md
    if (sideFetches[3].status !== 'fulfilled' || !sideFetches[3].value.ok) {
      analysis.agentReadiness.push('No /agents.md found — AI agents have no instruction file')
    }
    // OpenAPI / Swagger spec
    const hasOpenApi = (sideFetches[4].status === 'fulfilled' && sideFetches[4].value.ok) ||
      (sideFetches[5].status === 'fulfilled' && sideFetches[5].value.ok)
    if (!hasOpenApi) {
      analysis.agentReadiness.push('No OpenAPI/Swagger spec found at /openapi.json or /swagger.json')
    }

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

  if (analysis.seoHints.length > 0) {
    signals.push({
      title: 'SEO improvements needed',
      content: `Site analysis found ${analysis.seoHints.length} SEO issue(s):\n${analysis.seoHints.map(h => `- ${h}`).join('\n')}`,
      metadata: { category: 'seo', hints: analysis.seoHints },
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
