import Link from 'next/link'

/**
 * Dashboard UX evolution — before/after for every state after Project Brain
 * v1.1 ingests. Pure server-rendered mockup, no DB.
 *
 * Two jobs:
 *   1. Show the transitions at comfortable reading size.
 *   2. Put an argument next to every change with an audience tag and a
 *      recommendation, so we can cut agent-internal signal out of the
 *      founder UI. Given the &ldquo;agent on top&rdquo; framing, most of
 *      these belong in /brain-v1/runtime, not the main dashboard.
 */

const tone = {
  teal: '#0d9488',
  indigo: '#6366f1',
  amber: '#d97706',
  green: '#059669',
  red: '#dc2626',
  violet: '#8b5cf6',
  slate: '#64748b',
} as const

export const metadata = { title: 'Dashboard evolution — Project Brain v1.1' }

type Audience = 'founder' | 'agent' | 'ops' | 'debug'
type Ship = 'ship' | 'hide' | 'runtime' | 'conditional'

const AUD: Record<Audience, { label: string; color: string; who: string }> = {
  founder: { label: 'FOUNDER', color: tone.teal, who: 'The person running the product. Checks weekly. Needs minimal, trust-building signals.' },
  agent: { label: 'AGENT', color: tone.violet, who: 'The always-on Head of Product agent. Reads this as context. UI presence optional.' },
  ops: { label: 'OPS', color: tone.amber, who: 'Maintainer fixing resolver drift. Rare visit. Lives in /brain-v1/runtime.' },
  debug: { label: 'DEBUG', color: tone.red, who: 'Only visible when something breaks. Hidden in steady state.' },
}

const SHIP: Record<Ship, { label: string; color: string; bg: string }> = {
  ship: { label: 'Ship to dashboard', color: tone.teal, bg: 'rgba(13,148,136,0.10)' },
  hide: { label: 'Hide from dashboard', color: tone.slate, bg: 'rgba(100,116,139,0.10)' },
  runtime: { label: 'Move to /runtime', color: tone.amber, bg: 'rgba(217,119,6,0.10)' },
  conditional: { label: 'Show on condition', color: tone.indigo, bg: 'rgba(99,102,241,0.10)' },
}

type Change = {
  title: string
  body: string
  argument: string
  audience: Audience
  ship: Ship
}

export default function DashboardEvolutionPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      <Hero />
      <Legend />
      <Summary />
      <Sections />
      <Footer />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <header className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
      <div className="mx-auto max-w-[88rem] px-6 pb-14 pt-14 lg:px-14">
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone.teal, animation: 'pulse-dot 2s ease-in-out infinite' }} />
            <span>Dashboard UX · evolution</span>
          </span>
          <Link href="/proposals" className="hover:opacity-70">Proposals catalogue</Link>
          <Link href="/brain-v1" className="hover:opacity-70">Spec walkthrough</Link>
          <Link href="/brain-v1/runtime" className="hover:opacity-70">Live runtime</Link>
        </nav>

        <h1
          className="mt-10 max-w-[22ch] text-5xl font-semibold leading-[0.95] tracking-tight lg:text-7xl"
          style={{ color: 'var(--text)' }}
        >
          Before:<br />
          <span style={{ color: 'var(--text-secondary)' }}>a flat list.</span><br />
          After: <span style={{ color: tone.teal }}>a brain.</span>
        </h1>

        <p className="mt-8 max-w-2xl text-lg leading-7" style={{ color: 'var(--text)' }}>
          The current dashboard shows roadmap items as a table with per-item
          scores. After Project Brain v1.1 ships, the surfaces get four new
          signals: focus mode, cluster linkage, next-action hints, run activity.
          Every tab changes a little. No tab gets replaced.
        </p>

        <p className="mt-5 max-w-2xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          Every change below carries an <span className="font-semibold" style={{ color: 'var(--text)' }}>audience tag</span>
          {' '}and a ship recommendation. Since the spec assumes an always-on agent
          sitting on top, most of this data is agent-internal. The founder
          should see the smallest possible surface that still lets them steer.
        </p>

        <div className="mt-10 flex flex-wrap gap-3 text-xs">
          <JumpLink href="#chrome">Sidebar + chrome</JumpLink>
          <JumpLink href="#signals">Signals tab</JumpLink>
          <JumpLink href="#clusters">Clusters tab (new)</JumpLink>
          <JumpLink href="#roadmap">Roadmap tab</JumpLink>
          <JumpLink href="#building">Building tab</JumpLink>
          <JumpLink href="#shipped">Shipped tab</JumpLink>
          <JumpLink href="#item-detail">Item drawer</JumpLink>
        </div>
      </div>
    </header>
  )
}

function JumpLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-full border px-3 py-1.5 font-mono hover:opacity-80"
      style={{ borderColor: 'var(--border)', color: 'var(--text)', backgroundColor: 'var(--surface)' }}
    >
      {children}
    </a>
  )
}

// ---------------------------------------------------------------------------
// Legend — audiences + ship recommendations
// ---------------------------------------------------------------------------

function Legend() {
  return (
    <section className="border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="mx-auto max-w-[88rem] px-6 py-10 lg:px-14">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--text-secondary)' }}>
              Audiences
            </h3>
            <ul className="mt-4 space-y-2">
              {(Object.keys(AUD) as Audience[]).map((a) => (
                <li key={a} className="flex items-start gap-3 text-sm">
                  <AudienceBadge audience={a} />
                  <span style={{ color: 'var(--text-secondary)' }}>{AUD[a].who}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--text-secondary)' }}>
              Ship recommendation
            </h3>
            <ul className="mt-4 space-y-2">
              {(Object.keys(SHIP) as Ship[]).map((s) => (
                <li key={s} className="flex items-start gap-3 text-sm">
                  <ShipBadge ship={s} />
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {s === 'ship' && 'Appears in the main dashboard UI.'}
                    {s === 'hide' && 'Not in any UI. Agent reads the row directly.'}
                    {s === 'runtime' && 'Lives at /brain-v1/runtime only. Maintainer surface.'}
                    {s === 'conditional' && 'Hidden in steady state. Surfaces on error / over-cap / drift.'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function AudienceBadge({ audience }: { audience: Audience }) {
  const a = AUD[audience]
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
      style={{ backgroundColor: `${a.color}18`, color: a.color }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: a.color }} />
      {a.label}
    </span>
  )
}

function ShipBadge({ ship }: { ship: Ship }) {
  const s = SHIP[ship]
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Summary (TL;DR count)
// ---------------------------------------------------------------------------

function Summary() {
  const all = ALL_CHANGES
  const byShip: Record<Ship, number> = { ship: 0, hide: 0, runtime: 0, conditional: 0 }
  for (const c of all) byShip[c.ship] += 1
  return (
    <section className="border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="mx-auto max-w-[88rem] px-6 py-12 lg:px-14">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: tone.teal }}>
            TL;DR
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl" style={{ color: 'var(--text)' }}>
            Most of this data belongs under the agent, not the founder.
          </h2>
          <p className="mt-4 text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
            Of {all.length} proposed UI changes: <b style={{ color: tone.teal }}>{byShip.ship}</b> ship to the founder dashboard,{' '}
            <b style={{ color: tone.indigo }}>{byShip.conditional}</b> only appear on error / over-cap / drift,{' '}
            <b style={{ color: tone.amber }}>{byShip.runtime}</b> live at <code>/brain-v1/runtime</code>, and{' '}
            <b style={{ color: tone.slate }}>{byShip.hide}</b> are agent-internal with no UI at all.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          <SummaryCard label="Ship" value={byShip.ship} total={all.length} color={tone.teal} />
          <SummaryCard label="Conditional" value={byShip.conditional} total={all.length} color={tone.indigo} />
          <SummaryCard label="Runtime only" value={byShip.runtime} total={all.length} color={tone.amber} />
          <SummaryCard label="Agent-internal" value={byShip.hide} total={all.length} color={tone.slate} />
        </div>
      </div>
    </section>
  )
}

function SummaryCard({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100)
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color }}>
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-4xl font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{value}</span>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>of {total}</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--surface-2)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function Sections() {
  return (
    <div>
      <ChromeSection />
      <SignalsSection />
      <ClustersSection />
      <RoadmapSection />
      <BuildingSection />
      <ShippedSection />
      <ItemDetailSection />
    </div>
  )
}

function SectionFrame({
  id,
  eyebrow,
  title,
  sub,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  sub: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="border-b scroll-mt-6" style={{ borderColor: 'var(--border)' }}>
      <div className="mx-auto max-w-[88rem] px-6 py-20 lg:px-14">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: tone.teal }}>
            {eyebrow}
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl" style={{ color: 'var(--text)' }}>
            {title}
          </h2>
          <p className="mt-3 text-base leading-7" style={{ color: 'var(--text-secondary)' }}>{sub}</p>
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  )
}

function BeforeAfter({ before, after }: { before: React.ReactNode; after: React.ReactNode }) {
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <div>
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--text-secondary)' }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--border)' }} />
          Before
        </div>
        {before}
      </div>
      <div>
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: tone.teal }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: tone.teal }} />
          After v1.1
        </div>
        {after}
      </div>
    </div>
  )
}

function ChangesWithArguments({ changes }: { changes: Change[] }) {
  return (
    <div className="mt-12">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--text-secondary)' }}>
          What changes · why surface it
        </div>
        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {changes.length} items
        </div>
      </div>
      <ul className="mt-5 divide-y" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        {changes.map((c) => (
          <li key={c.title} className="grid gap-6 py-6 lg:grid-cols-[20rem_1fr] lg:gap-10">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <AudienceBadge audience={c.audience} />
                <ShipBadge ship={c.ship} />
              </div>
              <h4 className="mt-3 text-base font-semibold leading-6" style={{ color: 'var(--text)' }}>
                {c.title}
              </h4>
              <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                {c.body}
              </p>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: AUD[c.audience].color }}>
                Argument
              </div>
              <p className="mt-2 max-w-prose text-sm leading-6" style={{ color: 'var(--text)' }}>
                {c.argument}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 1 — Chrome
// ---------------------------------------------------------------------------

const CHROME_CHANGES: Change[] = [
  {
    title: 'Focus badge (top right)',
    body: 'Click → focus-mode picker. Loads first for every roadmap + PRD run.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'This is the one knob the founder actually wants to turn. Everything downstream bends around it — ranking, PRD framing, impact review. Without it, the whole dominant-need system is dormant. Must be on the main chrome.',
  },
  {
    title: 'Brain health pill',
    body: 'Composite score of run pass rate, trigger evals, stale pages, enrichment freshness.',
    audience: 'founder',
    ship: 'conditional',
    argument:
      'A single scalar is a reasonable trust signal. But surfacing it in the chrome at all times trains the founder to optimize it, which is the agent\'s job, not theirs. Show only when it dips below threshold (e.g. 60). Otherwise collapse into /brain-v1/runtime.',
  },
  {
    title: 'Last run status chip',
    body: 'Live status of the most recent brain_run. Turns amber on failed.',
    audience: 'debug',
    ship: 'conditional',
    argument:
      'In steady state this is noise — "last run 2m ago, completed". Useful only when a run is stuck or failed. Show only when status !== completed for >1 minute. Otherwise invisible.',
  },
  {
    title: 'Sidebar: Clusters',
    body: 'New top-level item between Signals and Settings.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'Clusters are the new product backlog. If the nav hides them, the founder never forms the mental model that the agent is organizing their work along theme lines. Make it first-class.',
  },
  {
    title: 'Sidebar: Brain',
    body: 'Cross-link into /brain-v1/runtime.',
    audience: 'ops',
    ship: 'runtime',
    argument:
      'Nobody goes here except to debug drift. Putting it in the primary nav signals "this is important" when it mostly is not. Better as a footer link or a Settings subsection.',
  },
  {
    title: 'Stale page indicator (amber dot)',
    body: 'Next to "Brain" when downstream pages need re-enrichment.',
    audience: 'agent',
    ship: 'hide',
    argument:
      'The nightly enrichment cron handles stale pages automatically. Surfacing the count to the founder adds todo-list anxiety for a thing they can\'t act on. Keep it inside /brain-v1/runtime only.',
  },
]

function ChromeSection() {
  return (
    <SectionFrame
      id="chrome"
      eyebrow="Global chrome"
      title="Sidebar + app header gain a brain"
      sub="Three new persistent signals would live outside the tab content. Only one belongs in the chrome by default."
    >
      <BeforeAfter
        before={<ChromeMockup state="before" />}
        after={<ChromeMockup state="after" />}
      />
      <ChangesWithArguments changes={CHROME_CHANGES} />
    </SectionFrame>
  )
}

// ---------------------------------------------------------------------------
// Section 2 — Signals
// ---------------------------------------------------------------------------

const SIGNALS_CHANGES: Change[] = [
  {
    title: 'New: Cluster column',
    body: 'The cluster slug a signal was filed onto, or "unfiled" below threshold.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'Useful because it helps the founder see which theme a raw piece of user evidence belongs to. It builds the intuition that clusters are real. One column, default visible.',
  },
  {
    title: 'New: Filing score column',
    body: 'Cosine similarity at which the filing attached.',
    audience: 'agent',
    ship: 'runtime',
    argument:
      'A 0.71 cosine score means nothing to the founder. Only the maintainer looking for "why is this signal attached to the wrong cluster" needs it. Move to /brain-v1/runtime detail view.',
  },
  {
    title: 'Polarity badge (supports / contradicts)',
    body: 'Contradicting signals visibly weaken a cluster.',
    audience: 'founder',
    ship: 'conditional',
    argument:
      'Actually useful when a signal contradicts — "3 users said the opposite". But most signals are supports, so a badge per row is noise. Show only when polarity !== supports.',
  },
  {
    title: 'Filing summary header',
    body: '"18 signals filed to 4 clusters · 3 unfiled pending synthesis"',
    audience: 'founder',
    ship: 'ship',
    argument:
      'One-line trust signal: the system is ingesting evidence. Keeps the founder confident the pipeline is working without forcing them to verify it themselves. Keep, make it quiet.',
  },
  {
    title: 'Dedup group hint',
    body: 'Inline badge when a signal was merged into a representative.',
    audience: 'agent',
    ship: 'hide',
    argument:
      'Dedup is internal bookkeeping. The agent already handles this. Showing "this is 1 of 4 merged" trains the founder to verify the dedup, which is the wrong workflow.',
  },
  {
    title: 'Processed timestamp',
    body: 'When this signal was last run through the filing resolver.',
    audience: 'debug',
    ship: 'hide',
    argument:
      'Only matters when filing is broken. Debug detail. Keep in the DB; don\'t surface.',
  },
]

function SignalsSection() {
  return (
    <SectionFrame
      id="signals"
      eyebrow="Signals tab"
      title="Every signal carries its filing decision"
      sub="The filing resolver tags each signal. Most of that metadata is agent-internal — the founder only needs the cluster link and a one-line summary."
    >
      <BeforeAfter
        before={<SignalsMockup state="before" />}
        after={<SignalsMockup state="after" />}
      />
      <ChangesWithArguments changes={SIGNALS_CHANGES} />
    </SectionFrame>
  )
}

// ---------------------------------------------------------------------------
// Section 3 — Clusters
// ---------------------------------------------------------------------------

const CLUSTERS_CHANGES: Change[] = [
  {
    title: 'Tab position (between Signals and Briefs)',
    body: 'New top-level tab. Clusters are upstream of Briefs.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'This is the primary product backlog surface. Must be a tab. Anything less hides the shift from "flat roadmap" to "maintained opportunity layer".',
  },
  {
    title: 'Five score pills per row',
    body: 'evidence / freshness / confidence / effort / focus-weighted.',
    audience: 'agent',
    ship: 'runtime',
    argument:
      'Five numbers per row means the founder reads none of them. The agent uses all five to rank. For the UI: show ONLY focus-weighted as a single bar, expand on click to reveal the rest.',
  },
  {
    title: 'Next-action chip',
    body: '→ allow_prd, → refresh_brief, → queue_build, → request_approval',
    audience: 'founder',
    ship: 'ship',
    argument:
      'The biggest UX win on this tab. Tells the founder what the system is about to do without them reading any resolver code. Keep prominent.',
  },
  {
    title: 'Brief preview (latest_brief_md snippet)',
    body: 'First line or two of the maintained cluster brief.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'Without a snippet, the cluster is just a slug + scores. The snippet tells the story. Strong product value.',
  },
  {
    title: 'Bulk actions (snooze / archive / merge / split)',
    body: 'Operate on multiple clusters at once.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'Essential once the backlog grows to 50+ clusters. Without it the founder can\'t curate. Ship from day one even if lists are short.',
  },
  {
    title: 'Empty state CTA',
    body: 'Fires /api/cron/project-enrichment on click.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'Day-1 onboarding is brittle without this. Otherwise the tab just says "nothing here" and the founder has no path forward. Keep.',
  },
]

function ClustersSection() {
  return (
    <SectionFrame
      id="clusters"
      eyebrow="New tab"
      title="Clusters — the canonical long backlog"
      sub="This tab didn't exist. Now it's the primary place to inspect and maintain product opportunities. Most pills should collapse by default."
    >
      <ClustersMockup />
      <ChangesWithArguments changes={CLUSTERS_CHANGES} />
    </SectionFrame>
  )
}

// ---------------------------------------------------------------------------
// Section 4 — Roadmap
// ---------------------------------------------------------------------------

const ROADMAP_CHANGES: Change[] = [
  {
    title: 'Group-by-cluster toggle (default ON)',
    body: 'Collapse / expand clusters. Flat mode still available.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'The current flat list has no narrative — "why are these 25 items related to each other" is invisible. Grouping makes the theme structure obvious. Biggest single UX improvement.',
  },
  {
    title: 'Cluster header row',
    body: 'Cluster title, focus-weighted score, "why now" snippet.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'Pairs with grouping. Without it, groups are just labels. With it, each group gets a thesis the founder can accept or reject.',
  },
  {
    title: 'Focus-weighted rank (default sort)',
    body: 'Replaces raw ROI as primary. Raw ROI demoted to secondary column.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'If focus is set, the ordering must reflect it. Otherwise the focus picker is cosmetic. Default sort here is the test.',
  },
  {
    title: 'Next-action pill per item',
    body: 'From the action resolver.',
    audience: 'founder',
    ship: 'ship',
    argument:
      '"This cluster\'s next item will auto-queue a build" — visible to the founder BEFORE it happens, not after. High transparency, high trust. Ship.',
  },
  {
    title: 'Confidence sparkline (20 snapshots)',
    body: 'Tiny SVG trajectory next to the bar.',
    audience: 'agent',
    ship: 'runtime',
    argument:
      'The trajectory is interesting once. Per-row it becomes visual noise. Move to the cluster detail page (D1) where it has space. The agent consumes the raw snapshot table.',
  },
  {
    title: '"Unassigned" bucket',
    body: 'Roadmap items with opportunity_cluster_id IS NULL.',
    audience: 'founder',
    ship: 'conditional',
    argument:
      'Show only when N > 0. A perpetual empty "Unassigned" bucket is visual clutter. If N > 0, it\'s a loud hint to run enrichment.',
  },
]

function RoadmapSection() {
  return (
    <SectionFrame
      id="roadmap"
      eyebrow="Roadmap tab"
      title="Items become projections, grouped by cluster"
      sub="The current table is 25 flat rows. The new view is a ranked slice of the cluster layer — items under their cluster with a next-action hint."
    >
      <BeforeAfter
        before={<RoadmapMockup state="before" />}
        after={<RoadmapMockup state="after" />}
      />
      <ChangesWithArguments changes={ROADMAP_CHANGES} />
    </SectionFrame>
  )
}

// ---------------------------------------------------------------------------
// Section 5 — Building
// ---------------------------------------------------------------------------

const BUILDING_CHANGES: Change[] = [
  {
    title: 'Blast radius pill',
    body: 'small / medium / large from the packet.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'Safety signal the founder wants to see at a glance. "Is what\'s shipping right now safe?" Must be visible.',
  },
  {
    title: 'Files touched count (vs. max_files cap)',
    body: 'Red when over cap.',
    audience: 'founder',
    ship: 'conditional',
    argument:
      'The number itself is only meaningful when it violates the cap. "3 / 10" is filler; "14 / 10" is an alarm. Show only when >= 80% of cap.',
  },
  {
    title: 'Approval mode badge',
    body: 'manual / auto_approved / auto_merged.',
    audience: 'agent',
    ship: 'hide',
    argument:
      'The founder set this in settings. Echoing it on every build row is restating the policy, not reporting a state. Hide.',
  },
  {
    title: 'Linked brain_run → trace viewer',
    body: 'Click → the implementation-brief run that generated this packet.',
    audience: 'debug',
    ship: 'runtime',
    argument:
      'Debug artifact. When a build goes weird, this is where the founder ends up — but only then. Leave in the runtime dashboard.',
  },
  {
    title: 'Expand row → inline packet',
    body: 'Required files list, test plan, rollback.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'This is what the coding agent is about to do. Inline expansion keeps it one click away. Strong transparency. Ship.',
  },
  {
    title: 'Policy block banner (request_approval)',
    body: 'When safety caps, blocked paths, or flags triggered.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'Hard block. Loud red banner, one sentence, one CTA (Review / Override). Ships.',
  },
]

function BuildingSection() {
  return (
    <SectionFrame
      id="building"
      eyebrow="Building tab"
      title="Each build shows its implementation packet"
      sub="Today the row is just a status. After v1.1 the founder can see what the coding agent is about to do — but only when it matters."
    >
      <BeforeAfter
        before={<BuildingMockup state="before" />}
        after={<BuildingMockup state="after" />}
      />
      <ChangesWithArguments changes={BUILDING_CHANGES} />
    </SectionFrame>
  )
}

// ---------------------------------------------------------------------------
// Section 6 — Shipped
// ---------------------------------------------------------------------------

const SHIPPED_CHANGES: Change[] = [
  {
    title: 'Verdict column (confirmed / underperformed / inconclusive)',
    body: 'From the deterministic impact classifier.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'The whole point of the learning loop. Without surfacing the verdict the founder never sees whether the system is getting better. Must ship.',
  },
  {
    title: 'Accuracy score (0-1)',
    body: 'Aggregate from classifyImpact.',
    audience: 'agent',
    ship: 'conditional',
    argument:
      'A bare number without a mental model is confusing (what is 0.68?). Show on row hover or expand, not as a default column. The agent uses it directly.',
  },
  {
    title: 'Per-metric drill-down (expand row)',
    body: 'baseline / predicted / actual / delta for each metric.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'The verdict is useless without evidence. Expanding a shipped row to see the actuals closes the "why did it underperform" loop. Keep but keep collapsed by default.',
  },
  {
    title: '"Why" reasoning',
    body: 'The model\'s explanation from the impact-review run.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'Pairs with the verdict. The verdict without the reason is a judgment without a hearing. Include in the expand, not the row.',
  },
  {
    title: 'Cluster rescore delta',
    body: '"Cluster confidence +8, focus 68 → 74"',
    audience: 'agent',
    ship: 'hide',
    argument:
      'Internal bookkeeping. The founder sees the verdict; the agent updates the cluster. Showing the math to the founder invites second-guessing of a correct mechanical process.',
  },
  {
    title: 'Proposed changes banner',
    body: 'When the model proposed a skill / trigger / page change.',
    audience: 'ops',
    ship: 'runtime',
    argument:
      'Maintainer surface. The founder shouldn\'t edit resolver rules or skill files. Move to /brain-v1/runtime where the apply endpoint (u11) already lives.',
  },
]

function ShippedSection() {
  return (
    <SectionFrame
      id="shipped"
      eyebrow="Shipped tab"
      title="The learning loop lands here"
      sub="Shipped items pair with actuals. The founder sees verdict + reasoning; everything else stays out of the dashboard."
    >
      <BeforeAfter
        before={<ShippedMockup state="before" />}
        after={<ShippedMockup state="after" />}
      />
      <ChangesWithArguments changes={SHIPPED_CHANGES} />
    </SectionFrame>
  )
}

// ---------------------------------------------------------------------------
// Section 7 — Item drawer
// ---------------------------------------------------------------------------

const ITEM_CHANGES: Change[] = [
  {
    title: 'Cluster panel',
    body: 'Cluster slug, brief, focus-weighted rank.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'Every roadmap item derives from a cluster. The drawer has to establish that up front. Ship.',
  },
  {
    title: 'Sources panel',
    body: 'Signals attached to this cluster, with filing scores.',
    audience: 'founder',
    ship: 'conditional',
    argument:
      'The founder wants to know "what evidence says we should do this". Collapse by default, expand on click. Filing scores within the panel are still agent-internal and should be dimmed.',
  },
  {
    title: 'PRD preview',
    body: 'Rendered prd_content, open_questions highlighted.',
    audience: 'founder',
    ship: 'ship',
    argument:
      'The PRD is the product bet. Drawer should show it by default. Open questions callout is a trust signal — "the agent is not pretending to know".',
  },
  {
    title: 'Execution packet',
    body: 'Required files, test plan, safety caps.',
    audience: 'founder',
    ship: 'conditional',
    argument:
      'Only meaningful once status=approved. Before that it\'s premature. Show only when the packet exists.',
  },
  {
    title: 'Run history strip',
    body: 'Every brain_run that touched this item.',
    audience: 'debug',
    ship: 'runtime',
    argument:
      'Full history is a runtime concern. Keep the most recent run\'s status as a one-line summary in the drawer; the full strip lives at /brain-v1/runtime/runs.',
  },
  {
    title: 'Action resolver verdict',
    body: '"Next action: allow_prd — cluster entered slice."',
    audience: 'founder',
    ship: 'ship',
    argument:
      'Complements the chip in the row. In the drawer it gets the "why" sentence. Reinforces the transparency story.',
  },
]

function ItemDetailSection() {
  return (
    <SectionFrame
      id="item-detail"
      eyebrow="Item detail"
      title="Click a row, see the brain focused on one bet"
      sub="The drawer collapses everything the founder needs for a single item. Most agent-internal context stays one layer deeper."
    >
      <ItemDetailMockup />
      <ChangesWithArguments changes={ITEM_CHANGES} />
    </SectionFrame>
  )
}

// ===========================================================================
// MOCKUPS
// ===========================================================================

function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-lg border shadow-[0_8px_32px_rgba(26,26,46,0.08)]"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
    >
      <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}>
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#e06e5f' }} />
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#e0c25f' }} />
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#71b972' }} />
        <span className="ml-3 flex-1 truncate font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
          selfimprove.app/dashboard/myforeversongs-landing/roadmap
        </span>
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chrome mockup
// ---------------------------------------------------------------------------

function ChromeMockup({ state }: { state: 'before' | 'after' }) {
  return (
    <AppFrame>
      <div className="flex min-h-[460px]">
        <Sidebar state={state} />
        <div className="flex-1">
          <AppHeader state={state} />
          <div className="p-5">
            <div className="h-32 rounded-md border border-dashed" style={{ borderColor: 'var(--border)' }} />
            <div className="mt-3 h-28 rounded-md border border-dashed" style={{ borderColor: 'var(--border)' }} />
          </div>
        </div>
      </div>
    </AppFrame>
  )
}

function Sidebar({ state }: { state: 'before' | 'after' }) {
  const items =
    state === 'before'
      ? [
          { label: 'Roadmap', active: true },
          { label: 'Signals' },
          { label: 'Settings' },
        ]
      : [
          { label: 'Roadmap', active: true },
          { label: 'Signals' },
          { label: 'Clusters', isNew: true },
          { label: 'Brain', isNew: true, stale: true },
          { label: 'Settings' },
        ]
  return (
    <aside
      className="w-[200px] shrink-0 border-r p-4"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
    >
      <div className="mb-4 text-sm font-semibold" style={{ color: 'var(--text)' }}>SelfImprove</div>
      <div className="mb-4 rounded border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-secondary)' }}>
        Myforeversongs Landing ▾
      </div>
      <ul className="space-y-1 text-xs">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between rounded px-3 py-2"
            style={{
              backgroundColor: item.active ? 'rgba(13,148,136,0.10)' : 'transparent',
              color: item.active ? tone.teal : item.isNew ? tone.indigo : 'var(--text)',
              fontWeight: item.active ? 600 : 400,
            }}
          >
            <span className="flex items-center gap-2">
              {item.label}
              {'isNew' in item && item.isNew ? (
                <span className="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em]" style={{ backgroundColor: tone.indigo, color: '#fff' }}>new</span>
              ) : null}
            </span>
            {'stale' in item && item.stale ? (
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: tone.amber }} title="3 stale pages" />
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  )
}

function AppHeader({ state }: { state: 'before' | 'after' }) {
  return (
    <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-5 text-xs">
          {['Signals', 'Briefs', 'Roadmap', 'Building', 'Shipped', 'Archive'].map((tab) => (
            <span
              key={tab}
              className="pb-1"
              style={{
                color: tab === 'Roadmap' ? tone.teal : 'var(--text-secondary)',
                borderBottom: tab === 'Roadmap' ? `2px solid ${tone.teal}` : '2px solid transparent',
                fontWeight: tab === 'Roadmap' ? 600 : 400,
              }}
            >
              {tab}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {state === 'after' ? (
            <>
              <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: tone.teal, color: tone.teal, backgroundColor: 'rgba(13,148,136,0.08)' }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: tone.teal }} />
                focus: conversion
              </span>
              <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                health 72
              </span>
              <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: 'var(--border)', color: tone.green }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: tone.green }} />
                last run 2m
              </span>
            </>
          ) : null}
          <span className="rounded-md px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: '#6366f1', color: '#fff' }}>Update Roadmap</span>
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Roadmap</div>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>25 items</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Signals mockup
// ---------------------------------------------------------------------------

function SignalsMockup({ state }: { state: 'before' | 'after' }) {
  const columns =
    state === 'before'
      ? ['Type', 'Content', 'Weight', 'Created']
      : ['Type', 'Content', 'Weight', 'Filed to', 'Score', 'Polarity', 'Created']
  const rows: string[][] =
    state === 'before'
      ? [
          ['feedback', 'pricing page is confusing at checkout', '4', 'Apr 18'],
          ['error', 'auth.ts:47 token undefined on resume', '3', 'Apr 17'],
          ['analytics', 'landing_page_viewed drop at step 2', '2', 'Apr 17'],
          ['feedback', 'why does preview auto-stop?', '4', 'Apr 16'],
          ['builder', 'N+1 query on /dashboard list', '4', 'Apr 16'],
        ]
      : [
          ['feedback', 'pricing page is confusing at checkout', '4', 'pricing-confusion', '0.71', 'supports', 'Apr 18'],
          ['error', 'auth.ts:47 token undefined on resume', '3', 'auth-resume-bug', '0.84', 'supports', 'Apr 17'],
          ['analytics', 'landing_page_viewed drop at step 2', '2', 'onboarding-friction', '0.62', 'supports', 'Apr 17'],
          ['feedback', 'why does preview auto-stop?', '4', 'unfiled', '0.28', '—', 'Apr 16'],
          ['builder', 'N+1 query on /dashboard list', '4', 'performance-issues', '0.76', 'supports', 'Apr 16'],
        ]
  return (
    <AppFrame>
      <AppHeader state={state} />
      {state === 'after' ? (
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(13,148,136,0.04)' }}>
          <div className="text-xs" style={{ color: 'var(--text)' }}>
            <span className="font-semibold" style={{ color: tone.teal }}>18 signals filed</span> to 4 clusters
            <span style={{ color: 'var(--text-secondary)' }}> · </span>
            <span style={{ color: tone.amber }}>3 unfiled pending synthesis</span>
          </div>
          <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>last pass: 2m ago</span>
        </div>
      ) : null}
      <MockTable columns={columns} rows={rows} state={state} clusterColumnIndex={state === 'after' ? 3 : null} />
    </AppFrame>
  )
}

// ---------------------------------------------------------------------------
// Clusters mockup (new tab)
// ---------------------------------------------------------------------------

function ClustersMockup() {
  return (
    <AppFrame>
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-5 text-xs">
          {['Signals', 'Clusters', 'Briefs', 'Roadmap', 'Building', 'Shipped', 'Archive'].map((tab) => (
            <span
              key={tab}
              className="flex items-center gap-1.5 pb-1"
              style={{
                color: tab === 'Clusters' ? tone.indigo : 'var(--text-secondary)',
                borderBottom: tab === 'Clusters' ? `2px solid ${tone.indigo}` : '2px solid transparent',
                fontWeight: tab === 'Clusters' ? 600 : 400,
              }}
            >
              {tab}
              {tab === 'Clusters' ? (
                <span className="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em]" style={{ backgroundColor: tone.indigo, color: '#fff' }}>new</span>
              ) : null}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Opportunity Clusters</div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>4 active · focus-weighted ↓</div>
        </div>
      </div>
      <div>
        {[
          { slug: 'pricing-confusion', title: 'Pricing confusion at checkout', need: 'conversion', focus: 68, action: 'allow_prd', actionTone: 'teal' as const, brief: 'Users bounce because tier comparison is unclear during checkout. Strongest on feedback; analytics shows 42% drop at step 3.' },
          { slug: 'onboarding-friction', title: 'Onboarding drop at step 2', need: 'conversion', focus: 62, action: 'refresh_brief', actionTone: 'indigo' as const, brief: 'Step 2 async failure rate climbed after the auth refactor. Resume-from-cold-start flow is incomplete.' },
          { slug: 'playback-reliability', title: 'Audio playback crashes on Safari', need: 'performance', focus: 54, action: 'request_approval', actionTone: 'amber' as const, brief: 'Intermittent autoplay block errors. Estimated 14 files to fix — exceeds safety_max_files.' },
          { slug: 'landing-clarity', title: 'Landing CTA visibility', need: 'conversion', focus: 51, action: 'rerank_only', actionTone: 'green' as const, brief: 'Weak signal. Stable evidence but no fresh drop. Carry over.' },
        ].map((cluster) => (
          <div
            key={cluster.slug}
            className="border-t px-5 py-4"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-sm" style={{ color: tone.indigo }}>{cluster.slug}</span>
                  <span className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ backgroundColor: 'rgba(13,148,136,0.10)', color: tone.teal }}>
                    {cluster.need}
                  </span>
                </div>
                <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>{cluster.title}</div>
                <p className="mt-1.5 max-w-2xl text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                  {cluster.brief}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: `rgba(${cluster.actionTone === 'teal' ? '13,148,136' : cluster.actionTone === 'indigo' ? '99,102,241' : cluster.actionTone === 'amber' ? '217,119,6' : '5,150,105'},0.10)`,
                    color: tone[cluster.actionTone],
                  }}
                >
                  → {cluster.action}
                </span>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--text-secondary)' }}>focus</div>
                  <div className="font-mono text-xl tabular-nums" style={{ color: 'var(--text)' }}>{cluster.focus}</div>
                </div>
              </div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--surface-2)' }}>
              <div className="h-full rounded-full" style={{ width: `${cluster.focus}%`, backgroundColor: tone[cluster.actionTone] }} />
            </div>
          </div>
        ))}
      </div>
    </AppFrame>
  )
}

// ---------------------------------------------------------------------------
// Roadmap mockup
// ---------------------------------------------------------------------------

function RoadmapMockup({ state }: { state: 'before' | 'after' }) {
  if (state === 'before') {
    return (
      <AppFrame>
        <AppHeader state="before" />
        <MockTable
          columns={['Item', 'Category', 'Status', 'Confidence', 'Impact', 'Size', 'ROI']}
          rows={[
            ['Implement Landing Page → CTA Conversion', 'Revenue', 'Proposed', '82%', '8/10', '4/10', '16.4'],
            ['Implement Preview-to-Purchase Nudge', 'Revenue', 'Proposed', '82%', '9/10', '3/10', '24.6'],
            ['Fix Onboarding Async Failure', 'Revenue', 'Approved', '88%', '9/10', '5/10', '15.8'],
            ['Fix Exposed API Keys & CSP Nonces', 'Infra', 'Proposed', '95%', '9/10', '4/10', '21.4'],
            ['Fix Onboarding Validation Errors', 'Bug', 'Proposed', '88%', '9/10', '4/10', '19.8'],
          ]}
          state="before"
        />
      </AppFrame>
    )
  }
  return (
    <AppFrame>
      <AppHeader state="after" />
      <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(13,148,136,0.04)' }}>
        <div className="text-xs" style={{ color: 'var(--text)' }}>
          <span className="font-semibold">Group by cluster</span>
          <span className="ml-2 rounded-full px-2 py-0.5 text-[10px]" style={{ backgroundColor: 'rgba(13,148,136,0.15)', color: tone.teal }}>on</span>
          <span style={{ color: 'var(--text-secondary)' }}>  · sort: focus-weighted ↓</span>
        </div>
        <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>25 items · 4 clusters · 1 unassigned</span>
      </div>
      <div>
        <ClusterGroup
          slug="pricing-confusion"
          title="Pricing confusion at checkout"
          focus={68}
          items={[
            { title: 'Simplify pricing tiers', action: 'allow_prd', actionTone: 'teal', conf: 82, roi: 16.4 },
            { title: 'Add contextual price tooltip at checkout', action: 'rerank_only', actionTone: 'green', conf: 74, roi: 12.1 },
          ]}
        />
        <ClusterGroup
          slug="onboarding-friction"
          title="Onboarding drop at step 2"
          focus={62}
          items={[
            { title: 'Fix async failure on step 2', action: 'queue_build', actionTone: 'teal', conf: 88, roi: 15.8 },
            { title: 'Add resume state to onboarding', action: 'refresh_brief', actionTone: 'indigo', conf: 72, roi: 14.2 },
          ]}
        />
        <ClusterGroup
          slug="(unassigned)"
          title="Not yet filed to a cluster"
          focus={null}
          unassigned
          items={[
            { title: 'Fix exposed API keys & CSP nonces', action: 'refresh_brief', actionTone: 'amber', conf: 95, roi: 21.4 },
          ]}
        />
      </div>
    </AppFrame>
  )
}

function ClusterGroup({
  slug,
  title,
  focus,
  unassigned,
  items,
}: {
  slug: string
  title: string
  focus: number | null
  unassigned?: boolean
  items: Array<{ title: string; action: string; actionTone: 'teal' | 'indigo' | 'amber' | 'green' | 'red'; conf: number; roi: number }>
}) {
  return (
    <div style={{ borderBottom: `1px solid var(--border)` }}>
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ backgroundColor: unassigned ? 'rgba(217,119,6,0.06)' : 'rgba(99,102,241,0.04)' }}
      >
        <div className="flex items-center gap-3 text-sm">
          <span className="font-mono" style={{ color: unassigned ? tone.amber : tone.indigo }}>{slug}</span>
          <span style={{ color: 'var(--text)' }}>— {title}</span>
        </div>
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {focus != null ? <span>focus <span className="font-mono" style={{ color: 'var(--text)' }}>{focus}</span></span> : null}
          <span>{items.length} item{items.length > 1 ? 's' : ''}</span>
        </div>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-center justify-between px-8 py-3" style={{ borderTop: i === 0 ? `1px solid var(--border)` : 'none' }}>
          <div className="flex-1 truncate text-sm" style={{ color: 'var(--text)' }}>{item.title}</div>
          <div className="flex items-center gap-5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>conf <span className="font-mono" style={{ color: 'var(--text)' }}>{item.conf}</span></span>
            <span>roi <span className="font-mono" style={{ color: 'var(--text)' }}>{item.roi}</span></span>
            <span
              className="rounded-full px-2.5 py-0.5 text-xs"
              style={{
                backgroundColor: `rgba(${item.actionTone === 'teal' ? '13,148,136' : item.actionTone === 'indigo' ? '99,102,241' : item.actionTone === 'amber' ? '217,119,6' : item.actionTone === 'green' ? '5,150,105' : '220,38,38'},0.10)`,
                color: tone[item.actionTone],
              }}
            >
              → {item.action}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Building mockup
// ---------------------------------------------------------------------------

function BuildingMockup({ state }: { state: 'before' | 'after' }) {
  if (state === 'before') {
    return (
      <AppFrame>
        <AppHeader state="before" />
        <MockTable
          columns={['Item', 'Status', 'Started', 'PR']}
          rows={[
            ['Simplify pricing tiers', 'running', 'Apr 19', '—'],
            ['Add contextual price tooltip', 'pr_created', 'Apr 18', '#412'],
            ['Fix async failure on step 2', 'queued', 'Apr 20', '—'],
          ]}
          state="before"
        />
      </AppFrame>
    )
  }
  return (
    <AppFrame>
      <AppHeader state="after" />
      <MockTable
        columns={['Item', 'Status', 'Blast', 'Files', 'Mode', 'Run', 'PR']}
        rows={[
          ['Simplify pricing tiers', 'running', 'small', '3 / 10', 'manual', 'r_a1b2', '—'],
          ['Add contextual price tooltip', 'pr_created', 'small', '2 / 10', 'auto_approved', 'r_c3d4', '#412'],
          ['Fix async failure on step 2', 'blocked', 'large', '14 / 10', 'manual', 'r_e5f6', '—'],
        ]}
        state="after"
        blockedRow={2}
      />
      <div className="border-t px-5 py-3 text-xs" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(220,38,38,0.05)', color: tone.red }}>
        <span className="font-semibold">request_approval</span>
        <span style={{ color: 'var(--text-secondary)' }}> — &quot;Fix async failure on step 2&quot; wants 14 files changed but safety_max_files is 10. Review / Override.</span>
      </div>
    </AppFrame>
  )
}

// ---------------------------------------------------------------------------
// Shipped mockup
// ---------------------------------------------------------------------------

function ShippedMockup({ state }: { state: 'before' | 'after' }) {
  if (state === 'before') {
    return (
      <AppFrame>
        <AppHeader state="before" />
        <MockTable
          columns={['Item', 'PR', 'Merged', 'Risk', 'Approval']}
          rows={[
            ['Add contextual price tooltip', '#412', 'Apr 18', '32', 'manual'],
            ['Fix onboarding validation error', '#408', 'Apr 15', '18', 'auto_approved'],
            ['Reduce bundle size on /dashboard', '#402', 'Apr 12', '45', 'manual'],
          ]}
          state="before"
        />
      </AppFrame>
    )
  }
  return (
    <AppFrame>
      <AppHeader state="after" />
      <MockTable
        columns={['Item', 'PR', 'Merged', 'Verdict', 'Accuracy', 'Cluster Δ']}
        rows={[
          ['Add contextual price tooltip', '#412', 'Apr 18', 'confirmed', '0.84', 'focus +6'],
          ['Fix onboarding validation error', '#408', 'Apr 15', 'underperformed', '0.41', 'focus -4'],
          ['Reduce bundle size on /dashboard', '#402', 'Apr 12', 'inconclusive', '—', 'focus 0'],
        ]}
        state="after"
        verdictColumn={3}
      />
      <div className="border-t px-5 py-3 text-xs" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(217,119,6,0.05)', color: tone.amber }}>
        <span className="font-semibold">1 proposed change</span>
        <span style={{ color: 'var(--text-secondary)' }}> — impact-review suggests updating metric_definitions after the underperformed result. Review →</span>
      </div>
    </AppFrame>
  )
}

// ---------------------------------------------------------------------------
// Item detail drawer mockup
// ---------------------------------------------------------------------------

function ItemDetailMockup() {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <AppFrame>
        <AppHeader state="after" />
        <MockTable
          columns={['Item', 'Cluster', 'Focus', 'Next', 'Conf']}
          rows={[
            ['Simplify pricing tiers', 'pricing-confusion', '68', 'allow_prd', '82'],
            ['Add contextual price tooltip', 'pricing-confusion', '68', 'queue_build', '74'],
            ['Fix async failure on step 2', 'onboarding-friction', '62', 'queue_build', '88'],
          ]}
          state="after"
          highlightRow={0}
        />
        <div className="px-5 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>click a row → drawer →</div>
      </AppFrame>
      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: tone.teal, backgroundColor: 'var(--surface)', boxShadow: '-8px 0 32px rgba(13,148,136,0.12)' }}
      >
        <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}>
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold" style={{ color: 'var(--text)' }}>Simplify pricing tiers</div>
            <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>r_item_a1b2</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full px-2.5 py-1" style={{ backgroundColor: 'rgba(13,148,136,0.10)', color: tone.teal }}>cluster: pricing-confusion</span>
            <span className="rounded-full px-2.5 py-1" style={{ backgroundColor: 'rgba(99,102,241,0.10)', color: tone.indigo }}>next: allow_prd</span>
            <span className="rounded-full px-2.5 py-1" style={{ backgroundColor: 'rgba(5,150,105,0.10)', color: tone.green }}>status: proposed</span>
          </div>
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          <DrawerPanel
            label="Cluster"
            accent={tone.indigo}
            content={[
              'pricing-confusion · need=conversion · focus 68 (rank 3 of 25)',
              'Users bounce because pricing tiers are unclear at checkout. Analytics shows a 42% drop at step 3.',
            ]}
          />
          <DrawerPanel
            label="Sources"
            accent={tone.teal}
            content={[
              '9 feedback signals · top: "pricing page is confusing at checkout"',
              '2 shipped changes: #412 tooltip (confirmed), #408 onboarding (underperformed)',
              '1 cite from user_pain_map v4',
            ]}
          />
          <DrawerPanel
            label="PRD preview"
            accent={tone.indigo}
            content={[
              'Problem: Users can\'t tell which tier to pick at checkout.',
              'Solution: Collapse to 2 tiers + contextual tooltips.',
              '3 open questions highlighted.',
            ]}
          />
          <DrawerPanel
            label="Execution packet"
            accent={tone.indigo}
            content={[
              'Blast small · 3 files · tests required · rollback: revert + flag off',
              'app/pricing/page.tsx, src/components/PricingCard.tsx, src/lib/billing/tiers.ts',
            ]}
          />
          <DrawerPanel
            label="Run history"
            accent={tone.teal}
            content={[
              '2m ago · roadmap-synthesis · completed · 3 writes',
              '1h ago · prd-author · completed · 1 write',
              '3h ago · filing-resolver · attached to cluster (0.71)',
            ]}
          />
        </div>
      </div>
    </div>
  )
}

function DrawerPanel({ label, accent, content }: { label: string; accent: string; content: string[] }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: accent }}>{label}</div>
      <ul className="mt-2.5 space-y-1.5 text-sm leading-6" style={{ color: 'var(--text)' }}>
        {content.map((line, i) => (
          <li key={i} className="flex gap-2">
            <span style={{ color: 'var(--text-secondary)' }}>—</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared table
// ---------------------------------------------------------------------------

function MockTable({
  columns,
  rows,
  state,
  clusterColumnIndex,
  verdictColumn,
  blockedRow,
  highlightRow,
}: {
  columns: string[]
  rows: string[][]
  state: 'before' | 'after'
  clusterColumnIndex?: number | null
  verdictColumn?: number
  blockedRow?: number
  highlightRow?: number
}) {
  const newColumns =
    state === 'after'
      ? new Set(
          columns
            .map((col, i) => (['Filed to', 'Score', 'Polarity', 'Blast', 'Files', 'Mode', 'Run', 'Verdict', 'Accuracy', 'Cluster Δ', 'Cluster', 'Focus', 'Next'].includes(col) ? i : -1))
            .filter((i) => i >= 0),
        )
      : new Set<number>()

  return (
    <table className="w-full text-sm" style={{ color: 'var(--text)' }}>
      <thead>
        <tr style={{ borderBottom: `1px solid var(--border)` }}>
          {columns.map((col, i) => {
            const isNew = newColumns.has(i)
            return (
              <th
                key={col}
                className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{
                  color: isNew ? tone.indigo : 'var(--text-secondary)',
                  backgroundColor: isNew ? 'rgba(99,102,241,0.05)' : 'transparent',
                }}
              >
                {col}
                {isNew ? <span className="ml-1.5 text-[8px] font-bold">NEW</span> : null}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const isBlocked = blockedRow === i
          const isHighlighted = highlightRow === i
          return (
            <tr
              key={i}
              style={{
                borderBottom: i === rows.length - 1 ? 'none' : `1px solid var(--border)`,
                backgroundColor: isBlocked
                  ? 'rgba(220,38,38,0.04)'
                  : isHighlighted
                  ? 'rgba(13,148,136,0.06)'
                  : 'transparent',
              }}
            >
              {row.map((cell, j) => {
                const isClusterCell = clusterColumnIndex === j
                const isVerdictCell = verdictColumn === j
                const cellStyle: React.CSSProperties = { color: 'var(--text)' }
                let content: React.ReactNode = cell
                if (isClusterCell) {
                  if (cell === 'unfiled') {
                    content = (
                      <span className="rounded-full px-2.5 py-1 text-xs" style={{ backgroundColor: 'rgba(217,119,6,0.10)', color: tone.amber }}>
                        {cell}
                      </span>
                    )
                  } else {
                    content = <span className="font-mono text-sm" style={{ color: tone.indigo }}>{cell}</span>
                  }
                }
                if (isVerdictCell) {
                  const color =
                    cell === 'confirmed' ? tone.green : cell === 'underperformed' ? tone.red : tone.amber
                  content = (
                    <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: `${color}18`, color }}>
                      {cell}
                    </span>
                  )
                }
                if (cell === '14 / 10') {
                  content = <span style={{ color: tone.red, fontWeight: 600 }}>{cell}</span>
                }
                return (
                  <td key={j} className="px-5 py-3.5 align-top font-mono text-sm tabular-nums" style={cellStyle}>
                    {content}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-t" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
      <div className="mx-auto flex max-w-[88rem] flex-col gap-3 px-6 py-8 text-xs md:flex-row md:items-center md:justify-between lg:px-14" style={{ color: 'var(--text-secondary)' }}>
        <span>
          Illustrative mockups. Ship recommendations driven by the agent-on-top framing.
        </span>
        <div className="flex gap-4 font-mono">
          <Link href="/proposals" style={{ color: tone.teal }}>proposals</Link>
          <Link href="/brain-v1" style={{ color: tone.teal }}>brain-v1</Link>
          <Link href="/brain-v1/runtime" style={{ color: tone.teal }}>runtime</Link>
        </div>
      </div>
    </footer>
  )
}

// ---------------------------------------------------------------------------
// Flatten every change so the Summary section can count them
// ---------------------------------------------------------------------------

const ALL_CHANGES: Change[] = [
  ...CHROME_CHANGES,
  ...SIGNALS_CHANGES,
  ...CLUSTERS_CHANGES,
  ...ROADMAP_CHANGES,
  ...BUILDING_CHANGES,
  ...SHIPPED_CHANGES,
  ...ITEM_CHANGES,
]
