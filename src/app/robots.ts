import { MetadataRoute } from 'next'

const siteUrl = 'https://selfimprove-iota.vercel.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/onboarding/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
