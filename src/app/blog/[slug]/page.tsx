import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import MarketingNav from '@/app/_components/marketing-nav'
import { BLOG_POSTS, getBlogPost } from '@/lib/blog-posts'

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = getBlogPost((await params).slug)
  if (!post) return {}
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: 'article', publishedTime: post.publishedAt },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = getBlogPost((await params).slug)
  if (!post) notFound()

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/blog" className="text-sm font-semibold text-[#0d9488]">← All articles</Link>
        <p className="mt-10 text-sm text-[#8b8680]">{post.publishedAt} · {post.readingTime}</p>
        <h1 className="mt-3 text-4xl font-bold leading-tight text-[#1a1a2e]">{post.title}</h1>
        <p className="mt-5 text-xl leading-8 text-[#6b6560]">{post.description}</p>
        <div className="mt-12 space-y-10">
          {post.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-2xl font-semibold text-[#1a1a2e]">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-4 text-base leading-8 text-[#4f4a46]">{paragraph}</p>)}
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
