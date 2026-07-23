import type { Metadata } from 'next'
import Link from 'next/link'

import MarketingNav from '@/app/_components/marketing-nav'
import { BLOG_POSTS } from '@/lib/blog-posts'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Practical notes on user feedback, product signals, roadmaps, and safe AI automation.',
  alternates: { canonical: '/blog' },
}

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <MarketingNav />
      <main className="mx-auto max-w-4xl px-6 py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0d9488]">Ships Itself blog</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#1a1a2e]">Build from evidence</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-[#6b6560]">Practical product-management systems for small teams and independent developers.</p>
        <div className="mt-12 grid gap-6">
          {BLOG_POSTS.map((post) => (
            <article key={post.slug} className="rounded-2xl border border-[#e8e4de] bg-white p-7">
              <p className="text-xs font-medium uppercase tracking-wide text-[#8b8680]">{post.readingTime}</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#1a1a2e]">
                <Link className="hover:text-[#0d9488]" href={`/blog/${post.slug}`}>{post.title}</Link>
              </h2>
              <p className="mt-3 leading-7 text-[#6b6560]">{post.description}</p>
              <Link className="mt-5 inline-block text-sm font-semibold text-[#0d9488]" href={`/blog/${post.slug}`}>Read article →</Link>
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}
