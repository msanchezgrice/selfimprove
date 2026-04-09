import { getUser } from '@/lib/supabase/auth-helpers'

export default async function Home() {
  const user = await getUser()
  return (
    <>
      {/* ===== FIXED NAV ===== */}
      <nav
        className="fixed top-0 w-full z-50 py-4 border-b border-border"
        style={{
          background: "rgba(250, 248, 245, 0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <div className="max-w-[1120px] mx-auto px-6 flex justify-between items-center">
          <a href="/" className="text-lg font-bold tracking-tight text-text no-underline">
            Self<span className="text-accent">Improve</span>
          </a>
          <div className="flex gap-8 items-center max-sm:gap-4">
            <a
              href="#how"
              className="text-text-secondary text-sm font-medium no-underline hover:text-text transition-colors hidden sm:inline"
            >
              How it works
            </a>
            <a
              href="#pricing"
              className="text-text-secondary text-sm font-medium no-underline hover:text-text transition-colors hidden sm:inline"
            >
              Pricing
            </a>
            <a
              href="#"
              className="text-text-secondary text-sm font-medium no-underline hover:text-text transition-colors hidden sm:inline"
            >
              Docs
            </a>
            {user ? (
              <a
                href="/dashboard"
                className="bg-accent text-white px-[18px] py-2 rounded-lg text-sm font-semibold no-underline hover:bg-accent-hover transition-colors"
              >
                Dashboard
              </a>
            ) : (
              <>
                <a
                  href="/login"
                  className="text-text-secondary text-sm font-medium no-underline hover:text-text transition-colors hidden sm:inline"
                >
                  Log in
                </a>
                <a
                  href="/login"
                  className="bg-accent text-white px-[18px] py-2 rounded-lg text-sm font-semibold no-underline hover:bg-accent-hover transition-colors"
                >
                  Get Started
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ===== HERO ===== */}
      <section className="pt-[160px] pb-[100px] px-6 text-center max-w-[820px] mx-auto max-md:pt-[130px] max-md:pb-[60px]">
        <div
          className="inline-block px-3.5 py-1.5 rounded-[20px] text-[13px] font-medium text-accent mb-7"
          style={{
            background: "var(--accent-glow)",
            border: "1px solid rgba(13, 148, 136, 0.25)",
            letterSpacing: "0.2px",
          }}
        >
          AI Product Manager for developers
        </div>

        <h1
          className="font-extrabold leading-[1.08] mb-5 text-text"
          style={{
            fontSize: "clamp(40px, 6vw, 64px)",
            letterSpacing: "-2px",
          }}
        >
          You built your v1.
          <br />
          Now make it{" "}
          <span className="text-accent">actually work.</span>
        </h1>

        <p className="text-[19px] text-text-secondary max-w-[580px] mx-auto mb-10 leading-relaxed">
          SelfImprove watches your users, builds your roadmap, and ships the
          fixes. The AI product manager for developers who built something — and
          need what comes next.
        </p>

        <div className="flex gap-3.5 justify-center flex-wrap mb-4">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-accent text-white rounded-[10px] text-base font-semibold no-underline hover:bg-accent-hover transition-all hover:-translate-y-px"
          >
            Get Started Free &rarr;
          </a>
          <a
            href="#how"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-surface text-text border border-border rounded-[10px] text-base font-medium no-underline hover:border-accent hover:text-accent transition-all"
          >
            See how it works
          </a>
        </div>

        <p className="text-[13px] text-text-secondary mt-2">
          No credit card required &middot; Free forever tier
        </p>

        {/* ===== LIVE ROADMAP PREVIEW ===== */}
        <div className="max-w-[680px] mx-auto mt-[60px] bg-surface border border-border rounded-[14px] overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.06)] text-left">
          <div className="px-5 py-3.5 flex justify-between items-center border-b border-border text-[13px] text-text-secondary">
            <span>
              <strong className="text-text font-semibold">Live Roadmap</strong>{" "}
              &middot; AI-Generated
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-green">
              <span
                className="w-1.5 h-1.5 bg-green rounded-full inline-block"
                style={{ animation: "pulse-dot 2s infinite" }}
              />
              Synced
            </span>
          </div>

          {/* Item 1 */}
          <div className="grid items-center gap-4 px-5 py-4 border-b border-border hover:bg-bg transition-colors" style={{ gridTemplateColumns: "36px 1fr auto auto" }}>
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-[13px] font-bold text-accent"
              style={{ background: "var(--accent-glow)" }}
            >
              1
            </div>
            <div>
              <div className="text-sm font-semibold text-text">
                Fix checkout flow — users drop at payment step
              </div>
              <div className="text-[12px] text-text-secondary italic">
                &ldquo;It just hangs&rdquo; — voice transcript, 3 users
              </div>
            </div>
            <span
              className="text-[11px] px-2.5 py-[3px] rounded-md font-semibold uppercase"
              style={{
                background: "rgba(220, 38, 38, 0.08)",
                color: "var(--red)",
                letterSpacing: "0.5px",
              }}
            >
              Bug
            </span>
            <span className="text-xl font-extrabold text-text font-mono">
              9.2
            </span>
          </div>

          {/* Item 2 */}
          <div className="grid items-center gap-4 px-5 py-4 border-b border-border hover:bg-bg transition-colors" style={{ gridTemplateColumns: "36px 1fr auto auto" }}>
            <div className="w-7 h-7 bg-bg rounded-md flex items-center justify-center text-[13px] font-bold text-text-secondary">
              2
            </div>
            <div>
              <div className="text-sm font-semibold text-text">
                Add dark mode toggle
              </div>
              <div className="text-[12px] text-text-secondary italic">
                &ldquo;Would love dark mode&rdquo; — 5 feedback signals
              </div>
            </div>
            <span
              className="text-[11px] px-2.5 py-[3px] rounded-md font-semibold uppercase"
              style={{
                background: "rgba(13, 148, 136, 0.08)",
                color: "var(--accent)",
                letterSpacing: "0.5px",
              }}
            >
              Feature
            </span>
            <span className="text-xl font-extrabold text-text font-mono">
              7.8
            </span>
          </div>

          {/* Item 3 */}
          <div className="grid items-center gap-4 px-5 py-4 hover:bg-bg transition-colors" style={{ gridTemplateColumns: "36px 1fr auto auto" }}>
            <div className="w-7 h-7 bg-bg rounded-md flex items-center justify-center text-[13px] font-bold text-text-secondary">
              3
            </div>
            <div>
              <div className="text-sm font-semibold text-text">
                Simplify onboarding — 40% abandon at step 3
              </div>
              <div className="text-[12px] text-text-secondary italic">
                42% drop-off at &ldquo;connect account&rdquo; — PostHog funnel
              </div>
            </div>
            <span
              className="text-[11px] px-2.5 py-[3px] rounded-md font-semibold uppercase"
              style={{
                background: "rgba(217, 119, 6, 0.08)",
                color: "var(--orange)",
                letterSpacing: "0.5px",
              }}
            >
              UX
            </span>
            <span className="text-xl font-extrabold text-text font-mono">
              8.5
            </span>
          </div>
        </div>
      </section>

      {/* ===== PROBLEM ===== */}
      <section className="py-[100px] px-6 bg-surface-2 border-t border-b border-border">
        <div className="max-w-[1040px] mx-auto">
          <p
            className="text-[13px] font-semibold uppercase text-accent mb-3"
            style={{ letterSpacing: "1.5px" }}
          >
            The Problem
          </p>
          <h2
            className="font-extrabold leading-[1.15] mb-4 text-text"
            style={{
              fontSize: "clamp(28px, 4vw, 40px)",
              letterSpacing: "-1px",
            }}
          >
            Your users know what&apos;s broken.
            <br />
            You&apos;re guessing.
          </h2>
          <p className="text-[17px] text-text-secondary max-w-[560px] leading-relaxed">
            You shipped your app. But is it working for users? Are they hitting
            bugs? Dropping off? You have no idea — and no product team to figure
            it out.
          </p>

          <div className="grid grid-cols-2 gap-12 items-center mt-12 max-md:grid-cols-1">
            {/* Problems list */}
            <ul className="list-none flex flex-col gap-5">
              {[
                {
                  icon: "\u26A0\uFE0F",
                  text: "Building blind — users hit bugs and leave silently. You never hear about it.",
                },
                {
                  icon: "\uD83C\uDFAF",
                  text: "Guessing priorities — you don't know what to fix first, so you fix what's loudest.",
                },
                {
                  icon: "\uD83D\uDCCB",
                  text: "Never-ending backlog — tickets pile up but nothing gets triaged or ranked by impact.",
                },
                {
                  icon: "\uD83D\uDE80",
                  text: "Shipping wrong things — you build features nobody asked for while real problems fester.",
                },
              ].map((item) => (
                <li
                  key={item.text}
                  className="flex gap-3.5 items-start text-[15px] text-text-secondary leading-[1.55]"
                >
                  <span className="shrink-0 w-6 h-6 flex items-center justify-center text-base mt-0.5">
                    {item.icon}
                  </span>
                  {item.text}
                </li>
              ))}
            </ul>

            {/* Solution stat card */}
            <div className="bg-surface border border-border rounded-[14px] p-10 text-center">
              <div className="text-[64px] font-extrabold text-accent leading-none font-mono">
                80%
              </div>
              <div className="text-[15px] text-text-secondary mt-2">
                of software cost is maintenance.
                <br />
                SelfImprove handles it.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how" className="py-[100px] px-6">
        <div className="max-w-[1040px] mx-auto">
          <p
            className="text-[13px] font-semibold uppercase text-accent mb-3"
            style={{ letterSpacing: "1.5px" }}
          >
            How It Works
          </p>
          <h2
            className="font-extrabold leading-[1.15] mb-4 text-text"
            style={{
              fontSize: "clamp(28px, 4vw, 40px)",
              letterSpacing: "-1px",
            }}
          >
            From signal to shipped in four steps
          </h2>
          <p className="text-[17px] text-text-secondary max-w-[560px] leading-relaxed">
            Connect once. SelfImprove runs forever.
          </p>

          <div className="grid grid-cols-4 gap-6 mt-14 max-md:grid-cols-2 max-[480px]:grid-cols-1">
            {[
              {
                num: 1,
                title: "Collect",
                desc: "Widget collects feedback, voice, analytics, and errors. Users tag issues — bug, confusing, slow — in one click.",
              },
              {
                num: 2,
                title: "Analyze",
                desc: "AI groups signals, weighs by type, and deduplicates. Every signal gets categorized, scored, and linked to evidence.",
              },
              {
                num: 3,
                title: "Prioritize",
                desc: "Generates a live roadmap with ROI scores and evidence trails. Stack-ranked so you always know what matters most.",
              },
              {
                num: 4,
                title: "Ship",
                desc: "Auto-implements changes via your coding agent. Reviews for safety, creates PRs, and merges — while you sleep.",
              },
            ].map((step) => (
              <div
                key={step.num}
                className="bg-surface border border-border rounded-[14px] px-6 py-8"
              >
                <div className="w-8 h-8 bg-accent text-white rounded-lg flex items-center justify-center text-[15px] font-bold mb-5">
                  {step.num}
                </div>
                <h3 className="text-[17px] font-bold mb-2 text-text">
                  {step.title}
                </h3>
                <p className="text-sm text-text-secondary leading-[1.55]">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES GRID ===== */}
      <section id="features" className="py-[100px] px-6 bg-surface-2 border-t border-b border-border">
        <div className="max-w-[1040px] mx-auto">
          <p
            className="text-[13px] font-semibold uppercase text-accent mb-3"
            style={{ letterSpacing: "1.5px" }}
          >
            Features
          </p>
          <h2
            className="font-extrabold leading-[1.15] mb-4 text-text"
            style={{
              fontSize: "clamp(28px, 4vw, 40px)",
              letterSpacing: "-1px",
            }}
          >
            Everything a PM does. Automated.
          </h2>
          <p className="text-[17px] text-text-secondary max-w-[560px] leading-relaxed">
            The full loop: signals in, improvements out.
          </p>

          <div className="grid grid-cols-3 gap-5 mt-14 max-md:grid-cols-1">
            {[
              {
                icon: "\uD83D\uDCE1",
                title: "Smart Signal Collection",
                desc: "One-click feedback widget, voice companion, analytics integration, and error tracking — all feeding one system.",
              },
              {
                icon: "\uD83E\uDDED",
                title: "AI Roadmap Engine",
                desc: "Live, stack-ranked roadmap with ROI scores. Every item has an evidence trail, thinking trace, and full PRD.",
              },
              {
                icon: "\uD83D\uDCDD",
                title: "PRD Generation",
                desc: "Automatically writes product requirements grounded in your actual codebase and user signals.",
              },
              {
                icon: "\uD83D\uDE80",
                title: "Auto-Implement",
                desc: "One click creates a PR via your coding agent. Full autonomous mode approves, builds, tests, and merges.",
              },
              {
                icon: "\uD83D\uDEE1\uFE0F",
                title: "Safety Guardrails",
                desc: "Configurable risk thresholds, daily improvement caps, and full audit trails for every automated change.",
              },
              {
                icon: "\uD83C\uDFA4",
                title: "Voice Companion",
                desc: "AI observer that listens during real sessions. Catches frustrations and feature requests users won't type.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-surface border border-border rounded-[14px] px-6 py-7 transition-colors hover:border-accent"
              >
                <div className="text-2xl mb-4">{feature.icon}</div>
                <h3 className="text-base font-bold mb-1.5 text-text">
                  {feature.title}
                </h3>
                <p className="text-sm text-text-secondary leading-[1.55]">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== AGENT INSTRUCTIONS CTA ===== */}
      <section className="py-[100px] px-6">
        <div className="max-w-[1040px] mx-auto">
          <p
            className="text-[13px] font-semibold uppercase text-accent mb-3"
            style={{ letterSpacing: "1.5px" }}
          >
            Your New AI Team Member
          </p>
          <h2
            className="font-extrabold leading-[1.15] mb-4 text-text"
            style={{
              fontSize: "clamp(28px, 4vw, 40px)",
              letterSpacing: "-1px",
            }}
          >
            Give your AI PM its instructions
          </h2>
          <p className="text-[17px] text-text-secondary max-w-[560px] leading-relaxed mb-10">
            Configure how SelfImprove prioritizes, what it can auto-merge, and
            how aggressive it should be.
          </p>

          <div
            className="bg-[#1a1a2e] rounded-[14px] p-8 font-mono text-sm leading-relaxed overflow-x-auto"
            style={{ color: "#e2e0dc" }}
          >
            <div className="text-text-secondary mb-4">
              <span style={{ color: "#8b8680" }}>// selfimprove.config.ts</span>
            </div>
            <pre className="whitespace-pre-wrap">
              <span style={{ color: "#c792ea" }}>export default</span>{" "}
              {"{\n"}
              {"  "}
              <span style={{ color: "#82aaff" }}>project</span>
              {": "}
              <span style={{ color: "#c3e88d" }}>&quot;my-saas-app&quot;</span>
              {",\n"}
              {"  "}
              <span style={{ color: "#82aaff" }}>signals</span>
              {": ["}
              <span style={{ color: "#c3e88d" }}>&quot;widget&quot;</span>
              {", "}
              <span style={{ color: "#c3e88d" }}>&quot;voice&quot;</span>
              {", "}
              <span style={{ color: "#c3e88d" }}>&quot;posthog&quot;</span>
              {", "}
              <span style={{ color: "#c3e88d" }}>&quot;sentry&quot;</span>
              {"],\n"}
              {"  "}
              <span style={{ color: "#82aaff" }}>autoMerge</span>
              {": {\n"}
              {"    "}
              <span style={{ color: "#82aaff" }}>enabled</span>
              {": "}
              <span style={{ color: "#f78c6c" }}>true</span>
              {",\n"}
              {"    "}
              <span style={{ color: "#82aaff" }}>riskThreshold</span>
              {": "}
              <span style={{ color: "#c3e88d" }}>&quot;low&quot;</span>
              {",\n"}
              {"    "}
              <span style={{ color: "#82aaff" }}>dailyCap</span>
              {": "}
              <span style={{ color: "#f78c6c" }}>5</span>
              {",\n"}
              {"  },\n"}
              {"  "}
              <span style={{ color: "#82aaff" }}>priority</span>
              {": "}
              <span style={{ color: "#c3e88d" }}>&quot;roi-weighted&quot;</span>
              {",\n"}
              {"  "}
              <span style={{ color: "#82aaff" }}>agent</span>
              {": "}
              <span style={{ color: "#c3e88d" }}>&quot;claude-code&quot;</span>
              {",\n}"}
            </pre>
          </div>

          <div className="mt-10">
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-accent text-white rounded-[10px] text-base font-semibold no-underline hover:bg-accent-hover transition-all hover:-translate-y-px"
            >
              Start Building &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* ===== SOCIAL PROOF / TESTIMONIALS ===== */}
      <section className="py-[100px] px-6 bg-surface-2 border-t border-b border-border">
        <div className="max-w-[1040px] mx-auto">
          <p
            className="text-[13px] font-semibold uppercase text-accent mb-3 text-center"
            style={{ letterSpacing: "1.5px" }}
          >
            Trusted by Developers
          </p>
          <h2
            className="font-extrabold leading-[1.15] mb-14 text-text text-center"
            style={{
              fontSize: "clamp(28px, 4vw, 40px)",
              letterSpacing: "-1px",
            }}
          >
            Developers ship faster with SelfImprove
          </h2>

          <div className="grid grid-cols-3 gap-5 max-md:grid-cols-1">
            {[
              {
                quote:
                  "I shipped my SaaS in a weekend with Cursor. SelfImprove told me what was actually broken — users were dropping off at step 3 and I had no idea.",
                name: "Alex Chen",
                role: "Indie Developer",
                avatar: "AC",
              },
              {
                quote:
                  "It's like having a product manager that never sleeps. The roadmap updates itself and the PRs are surprisingly good. Saved me 10+ hours a week.",
                name: "Sarah Kim",
                role: "Solo SaaS Founder",
                avatar: "SK",
              },
              {
                quote:
                  "The autonomous mode is wild. I woke up to three merged PRs that fixed real user-reported bugs. All with evidence trails and test coverage.",
                name: "Marcus Johnson",
                role: "Full-Stack Developer",
                avatar: "MJ",
              },
            ].map((testimonial) => (
              <div
                key={testimonial.name}
                className="bg-surface border border-border rounded-[14px] p-7 flex flex-col"
              >
                <p className="text-[15px] text-text-secondary leading-[1.6] flex-1 mb-6">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3 pt-5 border-t border-border">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-accent"
                    style={{
                      background: "var(--accent-glow)",
                      border: "2px solid var(--accent)",
                    }}
                  >
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-text">
                      {testimonial.name}
                    </div>
                    <div className="text-[13px] text-text-secondary">
                      {testimonial.role}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="py-[100px] px-6 text-center">
        <div className="max-w-[1040px] mx-auto">
          <p
            className="text-[13px] font-semibold uppercase text-accent mb-3"
            style={{ letterSpacing: "1.5px" }}
          >
            Pricing
          </p>
          <h2
            className="font-extrabold leading-[1.15] mb-4 text-text"
            style={{
              fontSize: "clamp(28px, 4vw, 40px)",
              letterSpacing: "-1px",
            }}
          >
            Start free. Scale as you grow.
          </h2>
          <p className="text-[17px] text-text-secondary max-w-[560px] mx-auto leading-relaxed">
            Simple pricing. No per-seat charges. Cancel anytime.
          </p>

          <div className="grid grid-cols-3 gap-5 mt-14 text-left max-md:grid-cols-1">
            {/* Free */}
            <div className="bg-surface border border-border rounded-[14px] p-9 flex flex-col">
              <h3 className="text-lg font-bold text-text mb-1">Free</h3>
              <div className="text-[40px] font-extrabold font-mono my-3 text-text">
                $0<span className="text-base font-medium text-text-secondary"> /mo</span>
              </div>
              <p className="text-[13px] text-text-secondary mb-6">
                For solo devs testing the waters.
              </p>
              <ul className="list-none flex flex-col gap-2.5 mb-7 flex-1">
                {["1 project", "Live stack-ranked roadmap", "Feedback widget", "Full PRDs with evidence", "Up to 100 signals/month"].map(
                  (item) => (
                    <li
                      key={item}
                      className="text-sm text-text-secondary flex items-start gap-2 leading-[1.4]"
                    >
                      <span className="text-accent font-bold font-mono shrink-0">
                        +
                      </span>
                      {item}
                    </li>
                  )
                )}
              </ul>
              <a
                href="/dashboard"
                className="flex justify-center items-center px-7 py-3.5 bg-surface text-text border border-border rounded-[10px] text-base font-medium no-underline hover:border-accent hover:text-accent transition-all"
              >
                Get started free
              </a>
            </div>

            {/* Pro */}
            <div
              className="bg-surface border-2 border-accent rounded-[14px] p-9 flex flex-col relative"
              style={{
                boxShadow: "0 4px 24px rgba(13, 148, 136, 0.15)",
              }}
            >
              <span
                className="absolute -top-[11px] left-1/2 -translate-x-1/2 bg-accent text-white text-[11px] font-bold uppercase px-3.5 py-1 rounded-md"
                style={{ letterSpacing: "0.8px" }}
              >
                Most popular
              </span>
              <h3 className="text-lg font-bold text-text mb-1">Pro</h3>
              <div className="text-[40px] font-extrabold font-mono my-3 text-text">
                $49<span className="text-base font-medium text-text-secondary"> /mo</span>
              </div>
              <p className="text-[13px] text-text-secondary mb-6">
                Roadmap + one-click implement + analytics.
              </p>
              <ul className="list-none flex flex-col gap-2.5 mb-7 flex-1">
                {[
                  "3 projects",
                  "Everything in Free",
                  "One-click implement (creates PRs)",
                  "Voice companion",
                  "PostHog + Sentry integration",
                  "10,000 signals/month",
                ].map((item) => (
                  <li
                    key={item}
                    className="text-sm text-text-secondary flex items-start gap-2 leading-[1.4]"
                  >
                    <span className="text-accent font-bold font-mono shrink-0">
                      +
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="/dashboard"
                className="flex justify-center items-center px-7 py-3.5 bg-accent text-white rounded-[10px] text-base font-semibold no-underline hover:bg-accent-hover transition-all"
              >
                Start 14-day trial
              </a>
            </div>

            {/* Autonomous */}
            <div className="bg-surface border border-border rounded-[14px] p-9 flex flex-col">
              <h3 className="text-lg font-bold text-text mb-1">Autonomous</h3>
              <div className="text-[40px] font-extrabold font-mono my-3 text-text">
                $199<span className="text-base font-medium text-text-secondary"> /mo</span>
              </div>
              <p className="text-[13px] text-text-secondary mb-6">
                Full self-improving software.
              </p>
              <ul className="list-none flex flex-col gap-2.5 mb-7 flex-1">
                {[
                  "Unlimited projects",
                  "Everything in Pro",
                  "Autonomous approval + merge",
                  "Configurable risk thresholds",
                  "Daily improvement cap",
                  "Full audit trail",
                ].map((item) => (
                  <li
                    key={item}
                    className="text-sm text-text-secondary flex items-start gap-2 leading-[1.4]"
                  >
                    <span className="text-accent font-bold font-mono shrink-0">
                      +
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="/dashboard"
                className="flex justify-center items-center px-7 py-3.5 bg-surface text-text border border-border rounded-[10px] text-base font-medium no-underline hover:border-accent hover:text-accent transition-all"
              >
                Start 14-day trial
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-[120px] px-6 text-center">
        <h2
          className="font-extrabold mb-4 text-text"
          style={{
            fontSize: "clamp(28px, 4vw, 44px)",
            letterSpacing: "-1px",
          }}
        >
          Ready to stop guessing?
        </h2>
        <p className="text-[17px] text-text-secondary max-w-[480px] mx-auto mb-9 leading-relaxed">
          Free for 1 project. Setup takes 5 minutes. First roadmap items appear
          within 24 hours.
        </p>
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 px-7 py-3.5 bg-accent text-white rounded-[10px] text-base font-semibold no-underline hover:bg-accent-hover transition-all hover:-translate-y-px"
        >
          Get Started Free &rarr;
        </a>
        <p className="text-[13px] text-text-secondary mt-4">
          No credit card required
        </p>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-border py-10 px-6 text-center text-[13px] text-text-secondary">
        <div className="max-w-[1040px] mx-auto">
          <div className="mb-4">
            <span className="text-base font-bold text-text tracking-tight">
              Self<span className="text-accent">Improve</span>
            </span>
          </div>
          <div className="flex justify-center gap-6 mb-6 flex-wrap">
            <a
              href="#how"
              className="text-text-secondary no-underline hover:text-text transition-colors"
            >
              Product
            </a>
            <a
              href="#pricing"
              className="text-text-secondary no-underline hover:text-text transition-colors"
            >
              Pricing
            </a>
            <a
              href="#"
              className="text-text-secondary no-underline hover:text-text transition-colors"
            >
              Docs
            </a>
            <a
              href="#"
              className="text-text-secondary no-underline hover:text-text transition-colors"
            >
              GitHub
            </a>
          </div>
          <p>&copy; 2026 SelfImprove. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}
