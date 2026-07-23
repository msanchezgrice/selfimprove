export type BlogPost = {
  slug: string
  title: string
  description: string
  publishedAt: string
  readingTime: string
  sections: Array<{ heading: string; paragraphs: string[] }>
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'turn-user-feedback-into-a-roadmap',
    title: 'How to turn scattered user feedback into a roadmap',
    description: 'A practical workflow for converting noisy feedback into evidence-backed product priorities.',
    publishedAt: '2026-07-16',
    readingTime: '6 min read',
    sections: [
      {
        heading: 'Collect signals, not feature votes',
        paragraphs: [
          'A request is one signal, not a roadmap item. Preserve the user context, the problem they were trying to solve, and where they encountered friction. That evidence is more durable than the requested solution.',
          'Combine direct feedback with support conversations, errors, and behavioral analytics. Repeated problems across independent sources deserve more weight than a single loud request.',
        ],
      },
      {
        heading: 'Group by underlying job',
        paragraphs: [
          'Cluster signals around the job the user is trying to complete. Two requests that sound different can point to the same broken workflow. A useful cluster has a clear problem statement, affected audience, evidence count, and expected outcome.',
        ],
      },
      {
        heading: 'Rank with explicit assumptions',
        paragraphs: [
          'Score impact, reach, confidence, and effort separately. Keep the evidence beside the score so a teammate can challenge the assumptions. The goal is not a perfect number; it is a transparent decision.',
        ],
      },
    ],
  },
  {
    slug: 'product-signals-for-solo-founders',
    title: 'The product signals solo founders should watch',
    description: 'A small, useful signal stack for learning what users need without building an analytics warehouse.',
    publishedAt: '2026-07-16',
    readingTime: '5 min read',
    sections: [
      {
        heading: 'Start with the decision',
        paragraphs: [
          'Instrumentation is only valuable when it changes a decision. Pick the next decision—improve activation, remove a failure point, or increase retention—then collect the smallest set of signals that can inform it.',
        ],
      },
      {
        heading: 'Use three complementary sources',
        paragraphs: [
          'Direct feedback explains intent, product analytics shows behavior, and error tracking exposes technical friction. Any one source can mislead; agreement across two or three is a much stronger prioritization signal.',
        ],
      },
      {
        heading: 'Review on a cadence',
        paragraphs: [
          'A weekly review is enough for most early products. Look for new clusters, changes in frequency, and evidence that a shipped fix actually improved the target behavior.',
        ],
      },
    ],
  },
  {
    slug: 'safe-ai-product-automation',
    title: 'A safer path to AI-assisted product automation',
    description: 'How to add AI implementation gradually with review gates, limits, and evidence.',
    publishedAt: '2026-07-16',
    readingTime: '7 min read',
    sections: [
      {
        heading: 'Automate analysis before deployment',
        paragraphs: [
          'Start by asking AI to summarize signals, draft acceptance criteria, and propose a scoped change. These outputs are reversible and easy to review. Production mutations should come later.',
        ],
      },
      {
        heading: 'Keep risk limits concrete',
        paragraphs: [
          'Define blocked paths, maximum files and lines changed, required tests, and a daily execution cap. A vague instruction to be careful is not a safety system.',
        ],
      },
      {
        heading: 'Earn higher autonomy',
        paragraphs: [
          'Measure whether proposed changes pass tests, survive review, and improve the intended user outcome. Expand autonomy only for repeatable low-risk work with a clear rollback path.',
        ],
      },
    ],
  },
]

export function getBlogPost(slug: string) {
  return BLOG_POSTS.find((post) => post.slug === slug)
}
