import type { Metadata } from 'next'

import MarketingNav from '@/app/_components/marketing-nav'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms governing access to and use of Ships Itself.',
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 py-20 text-[#4f4a46]">
        <h1 className="text-4xl font-bold text-[#1a1a2e]">Terms of Service</h1>
        <p className="mt-3 text-sm text-[#8b8680]">Effective July 16, 2026</p>
        <div className="mt-10 space-y-8 leading-7">
          <section><h2 className="text-xl font-semibold text-[#1a1a2e]">Using Ships Itself</h2><p className="mt-2">You must have authority to connect each repository, website, analytics property, and data source you add. You are responsible for activity performed through your account and for keeping credentials secure.</p></section>
          <section><h2 className="text-xl font-semibold text-[#1a1a2e]">AI-generated output</h2><p className="mt-2">Roadmap suggestions, analysis, code, and other AI-generated output may be incomplete or incorrect. Review output, tests, permissions, and deployment impact before approving or shipping changes.</p></section>
          <section><h2 className="text-xl font-semibold text-[#1a1a2e]">Subscriptions</h2><p className="mt-2">Paid plans renew monthly until cancelled. Plan limits and current prices are shown on the pricing page and at checkout. Trial eligibility may be limited to organizations without an existing subscription.</p></section>
          <section><h2 className="text-xl font-semibold text-[#1a1a2e]">Acceptable use</h2><p className="mt-2">Do not use the service to access systems without permission, distribute malicious code, violate privacy rights, or interfere with the service or other users.</p></section>
          <section><h2 className="text-xl font-semibold text-[#1a1a2e]">Availability and liability</h2><p className="mt-2">The service is provided as available and may change during its early-access period. To the extent permitted by law, Ships Itself is not liable for indirect or consequential losses arising from use of the service.</p></section>
        </div>
      </main>
    </div>
  )
}
