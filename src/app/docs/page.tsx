import type { Metadata } from 'next'

import MarketingNav from '@/app/_components/marketing-nav'

export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Set up Ships Itself, collect product signals, and review an evidence-backed roadmap.',
  alternates: { canonical: '/docs' },
}

const steps = [
  ['Create a project', 'Sign in with GitHub or Google, name the product, and optionally connect its repository and live URL.'],
  ['Install the widget', 'Copy the script shown during onboarding into the root layout of your application. Its project ID routes feedback to the correct workspace.'],
  ['Collect signals', 'Direct feedback enters the signals inbox. Paid plans can also connect product analytics and error data.'],
  ['Review the roadmap', 'Ships Itself groups related evidence and proposes prioritized roadmap items. Review the evidence and acceptance criteria before approving work.'],
]

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <MarketingNav />
      <main className="mx-auto max-w-4xl px-6 py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0d9488]">Documentation</p>
        <h1 className="mt-3 text-4xl font-bold text-[#1a1a2e]">From signup to your first roadmap</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-[#6b6560]">The shortest working path through Ships Itself. Automation remains review-first unless your plan and project safety settings explicitly enable more.</p>
        <div className="mt-12 space-y-5">
          {steps.map(([title, body], index) => (
            <section key={title} className="rounded-2xl border border-[#e8e4de] bg-white p-6">
              <p className="text-xs font-bold uppercase tracking-wide text-[#0d9488]">Step {index + 1}</p>
              <h2 className="mt-2 text-xl font-semibold text-[#1a1a2e]">{title}</h2>
              <p className="mt-2 leading-7 text-[#6b6560]">{body}</p>
            </section>
          ))}
        </div>
        <section className="mt-12 rounded-2xl bg-[#1a1a2e] p-7 text-white">
          <h2 className="text-xl font-semibold">Widget snippet</h2>
          <pre className="mt-4 overflow-x-auto text-sm text-[#d1fae5]"><code>{'<script src="https://shipsitself.com/widget.js" data-project="YOUR_PROJECT_ID"></script>'}</code></pre>
        </section>
      </main>
    </div>
  )
}
