import type { MetadataRoute } from 'next'

import { BLOG_POSTS } from '@/lib/blog-posts'
import { SITE_URL } from '@/lib/site-config'

export const revalidate = 86400

export default function sitemap(): MetadataRoute.Sitemap {
  const updatedAt = new Date('2026-07-16T00:00:00.000Z')
  const publicRoutes = ['', '/pricing', '/docs', '/blog', '/privacy', '/terms']

  return [
    ...publicRoutes.map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: updatedAt,
      changeFrequency: path === '/blog' ? 'weekly' as const : 'monthly' as const,
      priority: path === '' ? 1 : path === '/pricing' ? 0.9 : 0.7,
    })),
    ...BLOG_POSTS.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.publishedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
}
