import type { Metadata } from 'next'
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import MarketingNav from "@/app/_components/marketing-nav";
import { TIERS } from "@/lib/constants/tiers";

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Simple, transparent pricing for SelfImprove. Start free with 1 project and 100 signals/month. Upgrade to Pro or Autonomous as your product grows.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing | SelfImprove',
    description:
      'Simple, transparent pricing for SelfImprove. Start free with 1 project, upgrade when ready. No per-seat charges, cancel anytime.',
    url: '/pricing',
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "Unlimited";
  return n.toLocaleString();
}

function price(cents: number): string {
  return `$${cents / 100}`;
}

/* ------------------------------------------------------------------ */
/*  Tier card data                                                     */
/* ------------------------------------------------------------------ */

interface TierCard {
  key: keyof typeof TIERS;
  cta: string;
  ctaHref: string;
  highlighted: boolean;
  features: string[];
}

const cards: TierCard[] = [
  {
    key: "free",
    cta: "Get Started Free",
    ctaHref: "/login",
    highlighted: false,
    features: [
      `${fmt(TIERS.free.maxProjects)} project`,
      `${fmt(TIERS.free.maxSignalsPerMonth)} signals/month`,
      "AI roadmap generation",
      "Feedback widget",
      "Community support",
    ],
  },
  {
    key: "pro",
    cta: "Start Pro Trial",
    ctaHref: "/login?plan=pro",
    highlighted: true,
    features: [
      `${fmt(TIERS.pro.maxProjects)} projects`,
      `${fmt(TIERS.pro.maxSignalsPerMonth)} signals/month`,
      "Everything in Free, plus:",
      "Auto-implement",
      `Voice companion (${fmt(TIERS.pro.voiceCompanionLimit)}/mo)`,
      "PostHog integration",
      "Sentry integration",
      "Priority support",
    ],
  },
  {
    key: "autonomous",
    cta: "Go Autonomous",
    ctaHref: "/login?plan=autonomous",
    highlighted: false,
    features: [
      `${fmt(TIERS.autonomous.maxProjects)} projects`,
      `${fmt(TIERS.autonomous.maxSignalsPerMonth)} signals`,
      "Everything in Pro, plus:",
      "Auto-approve PRs",
      "Auto-merge low-risk",
      `Voice companion (${fmt(TIERS.autonomous.voiceCompanionLimit)}/mo)`,
      "Dedicated support",
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Feature comparison table rows                                      */
/* ------------------------------------------------------------------ */

type CellValue = string | boolean;

interface CompRow {
  label: string;
  free: CellValue;
  pro: CellValue;
  autonomous: CellValue;
}

const comparisonRows: CompRow[] = [
  { label: "Projects", free: "1", pro: "3", autonomous: "Unlimited" },
  { label: "Signals / mo", free: "100", pro: "10,000", autonomous: "Unlimited" },
  { label: "Feedback Widget", free: true, pro: true, autonomous: true },
  { label: "Voice Companion", free: false, pro: "100 / mo", autonomous: "500 / mo" },
  { label: "AI Roadmap", free: true, pro: true, autonomous: true },
  { label: "PRD Generation", free: true, pro: true, autonomous: true },
  { label: "Auto-Implement", free: false, pro: true, autonomous: true },
  { label: "Auto-Approve", free: false, pro: false, autonomous: true },
  { label: "Auto-Merge", free: false, pro: false, autonomous: true },
  { label: "PostHog", free: false, pro: true, autonomous: true },
  { label: "Sentry", free: false, pro: true, autonomous: true },
  {
    label: "Support Level",
    free: "Community",
    pro: "Priority",
    autonomous: "Dedicated",
  },
];

/* ------------------------------------------------------------------ */
/*  FAQ data                                                           */
/* ------------------------------------------------------------------ */

const faqs = [
  {
    q: "Can I switch plans anytime?",
    a: "Yes. You can upgrade, downgrade, or cancel at any time. Changes take effect at the start of your next billing cycle.",
  },
  {
    q: "What happens when I hit my signal limit?",
    a: "New signals stop being accepted for the remainder of the billing period. No data is lost \u2014 your existing signals and roadmap remain fully accessible.",
  },
  {
    q: "Do I need a credit card for Free?",
    a: "No. The Free plan requires no payment information. Just sign up and start collecting feedback.",
  },
  {
    q: "Can I self-host?",
    a: "Not yet. Self-hosting is planned for an upcoming enterprise tier. Reach out if you\u2019d like early access.",
  },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function CompCell({ value }: { value: CellValue }) {
  if (value === true) {
    return (
      <td className="px-4 py-3 text-center">
        <Check className="mx-auto h-5 w-5 text-[#0d9488]" />
      </td>
    );
  }
  if (value === false) {
    return (
      <td className="px-4 py-3 text-center">
        <Minus className="mx-auto h-5 w-5 text-[#e8e4de]" />
      </td>
    );
  }
  return (
    <td className="px-4 py-3 text-center text-sm text-[#1a1a2e]">{value}</td>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#faf8f5]">
      <MarketingNav />

      {/* Hero */}
      <section className="px-6 pb-16 pt-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-[#1a1a2e] sm:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-[#8b8680]">
          Start free, upgrade when you&apos;re ready.
        </p>
      </section>

      {/* Tier cards */}
      <section className="mx-auto grid w-full max-w-5xl gap-8 px-6 pb-24 md:grid-cols-3">
        {cards.map((card) => {
          const tier = TIERS[card.key];
          const isHighlighted = card.highlighted;

          return (
            <div
              key={card.key}
              className={`relative flex flex-col rounded-xl bg-white p-8 ${
                isHighlighted
                  ? "border-2 border-[#0d9488] shadow-lg"
                  : "border border-[#e8e4de]"
              }`}
            >
              {isHighlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0d9488] px-3 py-0.5 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}

              <h2 className="text-lg font-semibold text-[#1a1a2e]">
                {tier.name}
              </h2>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-[#1a1a2e]">
                  {price(tier.price)}
                </span>
                <span className="text-sm text-[#8b8680]">/mo</span>
              </div>

              <ul className="mt-8 flex flex-1 flex-col gap-3">
                {card.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#1a1a2e]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0d9488]" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={card.ctaHref}
                className={`mt-8 block rounded-lg py-2.5 text-center text-sm font-medium transition-colors ${
                  isHighlighted
                    ? "bg-[#0d9488] text-white hover:bg-[#0d9488]/90"
                    : "border border-[#e8e4de] text-[#1a1a2e] hover:border-[#0d9488] hover:text-[#0d9488]"
                }`}
              >
                {card.cta}
              </Link>
            </div>
          );
        })}
      </section>

      {/* Feature comparison table */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <h2 className="mb-8 text-center text-2xl font-bold text-[#1a1a2e]">
          Feature comparison
        </h2>

        <div className="overflow-x-auto rounded-xl border border-[#e8e4de] bg-white">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#e8e4de]">
                <th className="px-4 py-3 text-sm font-medium text-[#8b8680]">
                  Feature
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-[#8b8680]">
                  Free
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-[#0d9488]">
                  Pro
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-[#8b8680]">
                  Autonomous
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row, i) => (
                <tr
                  key={row.label}
                  className={
                    i < comparisonRows.length - 1
                      ? "border-b border-[#e8e4de]"
                      : ""
                  }
                >
                  <td className="px-4 py-3 text-sm font-medium text-[#1a1a2e]">
                    {row.label}
                  </td>
                  <CompCell value={row.free} />
                  <CompCell value={row.pro} />
                  <CompCell value={row.autonomous} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto w-full max-w-3xl px-6 pb-24">
        <h2 className="mb-8 text-center text-2xl font-bold text-[#1a1a2e]">
          Frequently asked questions
        </h2>

        <div className="flex flex-col gap-6">
          {faqs.map((faq) => (
            <div
              key={faq.q}
              className="rounded-xl border border-[#e8e4de] bg-white p-6"
            >
              <h3 className="font-semibold text-[#1a1a2e]">{faq.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#8b8680]">
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e8e4de] bg-white px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <Link href="/" className="text-lg font-bold text-[#1a1a2e]">
            Self<span className="text-[#0d9488]">Improve</span>
          </Link>
          <div className="flex gap-8 text-sm text-[#8b8680]">
            <Link href="/pricing" className="hover:text-[#1a1a2e]">
              Pricing
            </Link>
            <Link href="/docs" className="hover:text-[#1a1a2e]">
              Docs
            </Link>
            <Link href="/login" className="hover:text-[#1a1a2e]">
              Sign in
            </Link>
          </div>
          <p className="text-xs text-[#8b8680]">
            &copy; {new Date().getFullYear()} SelfImprove. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
