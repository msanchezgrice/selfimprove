import { describe, expect, it } from 'vitest'

import robots from './robots'
import sitemap from './sitemap'
import { SITE_URL } from '@/lib/site-config'

describe('public SEO metadata', () => {
  it('publishes a crawlable robots policy with a sitemap', () => {
    const result = robots()
    expect(result.rules).toEqual({
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/onboarding', '/auth/'],
    })
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`)
  })

  it('lists the actual public routes and excludes authenticated surfaces', () => {
    const urls = sitemap().map((entry) => entry.url)
    expect(urls).toEqual(
      expect.arrayContaining([
        SITE_URL,
        `${SITE_URL}/pricing`,
        `${SITE_URL}/docs`,
        `${SITE_URL}/blog`,
        `${SITE_URL}/privacy`,
        `${SITE_URL}/terms`,
      ]),
    )
    expect(urls.some((url) => url.includes('/dashboard'))).toBe(false)
  })
})
