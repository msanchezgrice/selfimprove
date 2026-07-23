import type { Metadata } from 'next'

import MarketingNav from '@/app/_components/marketing-nav'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Ships Itself collects, uses, and protects product and account data.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 py-20 text-[#4f4a46]">
        <h1 className="text-4xl font-bold text-[#1a1a2e]">Privacy Policy</h1>
        <p className="mt-3 text-sm text-[#8b8680]">Effective July 16, 2026</p>
        <div className="mt-10 space-y-8 leading-7">
          <section><h2 className="text-xl font-semibold text-[#1a1a2e]">Information we collect</h2><p className="mt-2">We collect account identifiers from the sign-in provider you choose, project configuration you submit, feedback and product signals sent to your projects, and operational data needed to secure and improve the service.</p></section>
          <section><h2 className="text-xl font-semibold text-[#1a1a2e]">How we use information</h2><p className="mt-2">We use this information to authenticate users, operate project workspaces, analyze product signals, generate roadmap suggestions, provide requested automation, process subscriptions, prevent abuse, and diagnose reliability issues.</p></section>
          <section><h2 className="text-xl font-semibold text-[#1a1a2e]">Service providers</h2><p className="mt-2">Ships Itself relies on infrastructure and subprocessors for authentication and data storage, hosting, email delivery, payment processing, analytics, and AI-assisted analysis. Those providers process data only as needed to deliver their services.</p></section>
          <section><h2 className="text-xl font-semibold text-[#1a1a2e]">Your choices</h2><p className="mt-2">You can disconnect integrations and stop sending new signals at any time. Requests to access or delete account data can be submitted through the project repository until a dedicated support domain is published.</p></section>
          <section><h2 className="text-xl font-semibold text-[#1a1a2e]">Changes</h2><p className="mt-2">We may update this policy as the product changes. The effective date above will be revised when material changes are published.</p></section>
        </div>
      </main>
    </div>
  )
}
