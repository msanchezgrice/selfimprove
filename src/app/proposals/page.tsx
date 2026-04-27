import Link from 'next/link'

/**
 * Not-in-spec polish — proposal board.
 *
 * Pre-wipe planning artifact. Every proposal is self-contained. No DB hits,
 * no auth, server-rendered static.
 *
 * Styled against the app's design tokens in globals.css (--bg, --surface,
 * --text, --accent, --accent-indigo, --amber, --green, --red). Inter + JetBrains Mono.
 */

type Category = 'Dashboard' | 'Agent Surface' | 'Observability' | 'Knowledge'
type Scope = 'S' | 'M' | 'L'
type Tier = 1 | 2 | 3

type Proposal = {
  id: string
  title: string
  category: Category
  scope: Scope
  locEstimate: string
  why: string
  spec: string[]
  dependsOn: string[]
  dataTouched: string[]
  newFiles: string[]
  recommendTier: Tier
  mockup: ProposalMockup
}

type ProposalMockup =
  | { kind: 'page'; title: string; rows: MockupRow[] }
  | { kind: 'flow'; steps: string[] }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | { kind: 'cards'; items: Array<{ label: string; value: string; hint?: string; tone?: 'teal' | 'indigo' | 'amber' | 'red' | 'green' }> }
  | { kind: 'json'; label: string; body: string }
  | { kind: 'terminal'; lines: string[] }

type MockupRow =
  | { kind: 'heading'; text: string }
  | { kind: 'bar'; label: string; value: number; tone?: 'teal' | 'indigo' | 'amber' | 'green' | 'red' }
  | { kind: 'pills'; items: string[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'text'; text: string }

export const metadata = { title: 'Project Brain — Next-Up Proposals' }

// ---------------------------------------------------------------------------
// Palette helpers (keeps Tailwind JIT from stripping these)
// ---------------------------------------------------------------------------

const tone = {
  teal: '#0d9488',
  indigo: '#6366f1',
  amber: '#d97706',
  green: '#059669',
  red: '#dc2626',
} as const

const CAT_STYLE: Record<Category, { label: string; fg: string; bg: string }> = {
  Dashboard: { label: 'DASH', fg: tone.teal, bg: 'rgba(13,148,136,0.10)' },
  'Agent Surface': { label: 'AGENT', fg: tone.indigo, bg: 'rgba(99,102,241,0.10)' },
  Observability: { label: 'OBS', fg: tone.amber, bg: 'rgba(217,119,6,0.10)' },
  Knowledge: { label: 'KNOW', fg: tone.green, bg: 'rgba(5,150,105,0.10)' },
}

export default function ProposalsPage() {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}
    >
      <Hero />
      <Preflight />
      <ShipOrder />
      <ProposalList />
      <Footer />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <header
      className="border-b"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
    >
      <div className="mx-auto max-w-7xl px-6 pb-16 pt-14 lg:px-12">
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone.teal, animation: 'pulse-dot 2s ease-in-out infinite' }} />
            <span>Project Brain · Pre-wipe planning</span>
          </span>
          <Link href="/proposals/dashboard" className="hover:opacity-70">Dashboard evolution</Link>
          <Link href="/brain-v1" className="hover:opacity-70">Spec walkthrough</Link>
          <Link href="/brain-v1/runtime" className="hover:opacity-70">Live runtime</Link>
          <span className="font-mono normal-case tracking-normal" style={{ color: tone.teal }}>localhost:3000/proposals</span>
        </nav>

        <h1
          className="mt-10 max-w-[20ch] text-5xl font-semibold leading-[0.95] tracking-tight lg:text-7xl"
          style={{ color: 'var(--text)' }}
        >
          Pick what ships<br />
          <span style={{ color: 'var(--text-secondary)' }}>before the wipe.</span>
        </h1>

        <p className="mt-8 max-w-2xl text-lg leading-7" style={{ color: 'var(--text)' }}>
          The Project Brain loop works end-to-end without any of these. Signals
          file onto clusters, clusters rank, PRDs generate, builds queue, impact
          reviews close the loop. These 16 proposals are the difference between
          &ldquo;it runs&rdquo; and &ldquo;I can see it running.&rdquo;
        </p>

        <div className="mt-10 grid grid-cols-2 gap-6 text-sm md:grid-cols-4" style={{ color: 'var(--text-secondary)' }}>
          <HeroStat value="16" label="proposals" />
          <HeroStat value="4" label="categories" />
          <HeroStat value="3" label="ship tiers" />
          <HeroStat value="~760" label="LOC for tier 1" accent />
        </div>
      </div>
    </header>
  )
}

function HeroStat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div>
      <div
        className="text-3xl font-semibold tabular-nums"
        style={{ color: accent ? tone.teal : 'var(--text)' }}
      >
        {value}
      </div>
      <div className="mt-1 text-xs uppercase tracking-[0.18em]">{label}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pre-flight checklist
// ---------------------------------------------------------------------------

function Preflight() {
  const items: Array<{ title: string; body: string; cmd?: string }> = [
    {
      title: 'Apply migrations 00010 + 00011',
      body: 'Adds opportunity_clusters, resolver_triggers, resolver_audits, current_focus, audit_resolver. Idempotent.',
      cmd: 'supabase db reset',
    },
    {
      title: 'Populate brain_skill_files once',
      body: 'Syncs docs/brain/skills/*.md into the DB. Weekly cron handles it afterwards.',
      cmd: 'tsx scripts/sync-skills.ts',
    },
    {
      title: 'Set CRON_SECRET + APP_BASE_URL',
      body: 'CRON_SECRET gates every /api/cron/* and the job-complete webhook. APP_BASE_URL lets the worker POST back.',
    },
    {
      title: 'Set current_focus',
      body: 'Until set, focus-weighted ranking is neutral. Picker is in /dashboard/[slug]/settings and /brain-v1/runtime.',
    },
    {
      title: 'Confirm worker APP_BASE_URL',
      body: 'If wrong, the worker completes jobs but the eager enrichment webhook no-ops; enrichment only runs on the cron.',
    },
    {
      title: 'Fire project-enrichment manually',
      body: 'After the wipe + re-onboarding, this compiles the baseline brain_pages from the fresh signals.',
      cmd: 'curl -H "Authorization: Bearer $CRON_SECRET" $APP/api/cron/project-enrichment',
    },
  ]
  return (
    <section className="border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-12">
        <SectionHeading eyebrow="Before the wipe" title="Pre-flight checklist" sub="Six ops regardless of which proposals ship. Everything else is gravy." />
        <ol className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <li key={item.title} className="flex gap-4">
              <span
                className="font-mono text-sm tabular-nums"
                style={{ color: tone.teal, minWidth: '2ch' }}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 border-l pl-4" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                  {item.body}
                </p>
                {item.cmd ? (
                  <code
                    className="mt-3 block overflow-x-auto rounded-md px-3 py-2 font-mono text-xs"
                    style={{
                      backgroundColor: 'var(--surface-2)',
                      color: 'var(--text)',
                      border: `1px solid var(--border)`,
                    }}
                  >
                    {item.cmd}
                  </code>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Ship order
// ---------------------------------------------------------------------------

function ShipOrder() {
  const tiers: Array<{ tier: Tier; title: string; ids: string[]; rationale: string; tone: string; bg: string }> = [
    {
      tier: 1,
      title: 'Ship before the wipe',
      ids: ['D1', 'D2', 'O4'],
      rationale: 'Together these mean "I can see what the brain is doing". Without them the only inspection path is SQL. ~760 LOC total.',
      tone: tone.teal,
      bg: 'rgba(13,148,136,0.08)',
    },
    {
      tier: 2,
      title: 'Nice before the wipe',
      ids: ['O1', 'A4', 'D3'],
      rationale: 'Each one unlocks a compounding feedback loop. Skip if bandwidth-bound and ship post-wipe.',
      tone: tone.indigo,
      bg: 'rgba(99,102,241,0.08)',
    },
    {
      tier: 3,
      title: 'When the brain has scale',
      ids: ['A1', 'A2', 'A3', 'A5', 'O2', 'O3', 'D4', 'D5', 'K1', 'K2'],
      rationale: 'Low traffic or depend on operational volume you won\'t have during initial onboarding.',
      tone: tone.amber,
      bg: 'rgba(217,119,6,0.08)',
    },
  ]
  return (
    <section className="border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-12">
        <SectionHeading
          eyebrow="Recommendation"
          title="If you only have time for three, ship tier 1."
          sub="Opinionated grouping. Every proposal is also independently shippable."
        />
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl" style={{ backgroundColor: 'var(--border)' }}>
          <div className="grid grid-cols-1 gap-px md:grid-cols-3" style={{ backgroundColor: 'var(--border)' }}>
            {tiers.map((t) => (
              <div key={t.tier} className="p-6" style={{ backgroundColor: t.bg }}>
                <div className="flex items-baseline gap-3">
                  <span
                    className="text-5xl font-semibold leading-none tabular-nums"
                    style={{ color: t.tone }}
                  >
                    {t.tier}
                  </span>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: t.tone }}>
                    {t.title}
                  </h3>
                </div>
                <ul className="mt-6 space-y-2 text-sm" style={{ color: 'var(--text)' }}>
                  {t.ids.map((id) => {
                    const proposal = PROPOSALS.find((p) => p.id === id)
                    return (
                      <li key={id} className="flex items-start gap-3">
                        <a
                          href={`#${id}`}
                          className="font-mono text-xs font-semibold tabular-nums"
                          style={{ color: t.tone, minWidth: '2.5ch' }}
                        >
                          {id}
                        </a>
                        <span className="flex-1">{proposal?.title ?? id}</span>
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-6 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                  {t.rationale}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Proposal list with sticky anchor nav
// ---------------------------------------------------------------------------

function ProposalList() {
  const grouped: Record<Category, Proposal[]> = {
    Dashboard: [],
    'Agent Surface': [],
    Observability: [],
    Knowledge: [],
  }
  for (const proposal of PROPOSALS) grouped[proposal.category].push(proposal)

  return (
    <section>
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-12">
        <SectionHeading
          eyebrow="Catalogue"
          title="16 proposals, four categories."
          sub="Click an ID in the side rail to jump. Each card is a self-contained spec."
        />
        <div className="mt-10 grid gap-12 lg:grid-cols-[12rem_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-8 space-y-6">
              {(Object.keys(grouped) as Category[]).map((cat) => {
                const meta = CAT_STYLE[cat]
                return (
                  <div key={cat}>
                    <div
                      className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em]"
                      style={{ color: meta.fg }}
                    >
                      {meta.label}
                    </div>
                    <ul className="space-y-1">
                      {grouped[cat].map((p) => (
                        <li key={p.id}>
                          <a
                            href={`#${p.id}`}
                            className="flex items-baseline gap-2 text-sm hover:opacity-100"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <span className="font-mono tabular-nums" style={{ color: meta.fg, minWidth: '2.5ch' }}>
                              {p.id}
                            </span>
                            <span className="truncate" style={{ color: 'var(--text)' }}>
                              {p.title}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </aside>
          <div className="space-y-16">
            {PROPOSALS.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const meta = CAT_STYLE[proposal.category]
  const scopeColor =
    proposal.scope === 'S' ? tone.green : proposal.scope === 'M' ? tone.amber : tone.red
  const tierColor =
    proposal.recommendTier === 1 ? tone.teal : proposal.recommendTier === 2 ? tone.indigo : tone.amber

  return (
    <article id={proposal.id} className="scroll-mt-8">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <span
          className="font-mono text-sm font-semibold tabular-nums"
          style={{ color: meta.fg }}
        >
          {proposal.id}
        </span>
        <span
          className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: meta.fg, backgroundColor: meta.bg }}
        >
          {proposal.category}
        </span>
        <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: scopeColor }} />
          <span>scope {proposal.scope}</span>
          <span>·</span>
          <span className="font-mono">{proposal.locEstimate}</span>
        </span>
        <span className="flex items-center gap-1.5 text-xs" style={{ color: tierColor }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: tierColor }} />
          <span>tier {proposal.recommendTier}</span>
        </span>
      </div>

      <h2 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl" style={{ color: 'var(--text)' }}>
        {proposal.title}
      </h2>

      <p className="mt-4 max-w-3xl text-base leading-7" style={{ color: 'var(--text)' }}>
        {proposal.why}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div>
            <SubLabel color={meta.fg}>Spec</SubLabel>
            <ul className="mt-3 space-y-2.5">
              {proposal.spec.map((item, i) => (
                <li key={i} className="flex gap-3 text-sm leading-6" style={{ color: 'var(--text)' }}>
                  <span className="font-mono text-xs tabular-nums" style={{ color: meta.fg, minWidth: '2ch' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <FactBlock label="Depends on" items={proposal.dependsOn} empty="— none —" />
            <FactBlock label="Data touched" items={proposal.dataTouched} mono />
            <FactBlock label="New files" items={proposal.newFiles} empty="— in-place —" mono />
          </div>
        </div>

        <div>
          <SubLabel color={meta.fg}>Mockup</SubLabel>
          <div className="mt-3">
            <MockupBlock mockup={proposal.mockup} accent={meta.fg} />
          </div>
        </div>
      </div>
    </article>
  )
}

function SubLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color }}>
      {children}
    </div>
  )
}

function FactBlock({ label, items, empty, mono }: { label: string; items: string[]; empty?: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-xs italic" style={{ color: 'var(--text-secondary)' }}>{empty ?? '—'}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li
              key={item}
              className={`text-xs leading-5 ${mono ? 'font-mono' : ''}`}
              style={{ color: 'var(--text)' }}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mockup renderers — the visual pay-off
// ---------------------------------------------------------------------------

function MockupBlock({ mockup, accent }: { mockup: ProposalMockup; accent: string }) {
  switch (mockup.kind) {
    case 'page':
      return <MockupPage title={mockup.title} rows={mockup.rows} accent={accent} />
    case 'flow':
      return <MockupFlow steps={mockup.steps} accent={accent} />
    case 'table':
      return <MockupTable columns={mockup.columns} rows={mockup.rows} accent={accent} />
    case 'cards':
      return <MockupCards items={mockup.items} />
    case 'json':
      return <MockupJson label={mockup.label} body={mockup.body} />
    case 'terminal':
      return <MockupTerminal lines={mockup.lines} />
  }
}

function MockupFrame({ children, title, accent }: { children: React.ReactNode; title?: string; accent?: string }) {
  return (
    <div
      className="overflow-hidden rounded-lg border shadow-[0_6px_24px_rgba(26,26,46,0.06)]"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
      >
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#e06e5f' }} />
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#e0c25f' }} />
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#71b972' }} />
        {title ? (
          <span
            className="ml-3 truncate font-mono text-[11px]"
            style={{ color: accent ?? 'var(--text-secondary)' }}
          >
            {title}
          </span>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function MockupPage({ title, rows, accent }: { title: string; rows: MockupRow[]; accent: string }) {
  return (
    <MockupFrame title={title} accent={accent}>
      <div className="space-y-3">
        {rows.map((row, i) => (
          <MockupRowNode key={i} row={row} />
        ))}
      </div>
    </MockupFrame>
  )
}

function MockupRowNode({ row }: { row: MockupRow }) {
  switch (row.kind) {
    case 'heading':
      return (
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {row.text}
        </div>
      )
    case 'bar': {
      const color = row.tone ? tone[row.tone] : tone.teal
      return (
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <span>{row.label}</span>
            <span className="font-mono tabular-nums" style={{ color: 'var(--text)' }}>
              {row.value}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--surface-2)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, row.value))}%`, backgroundColor: color }}
            />
          </div>
        </div>
      )
    }
    case 'pills':
      return (
        <div className="flex flex-wrap gap-1.5">
          {row.items.map((item) => (
            <span
              key={item}
              className="rounded-full px-2 py-0.5 font-mono text-[10px]"
              style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-secondary)' }}
            >
              {item}
            </span>
          ))}
        </div>
      )
    case 'list':
      return (
        <ul className="space-y-1 text-[12px] leading-5" style={{ color: 'var(--text)' }}>
          {row.items.map((item) => (
            <li key={item} className="flex gap-2">
              <span style={{ color: 'var(--text-secondary)' }}>—</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
    case 'text':
      return (
        <p className="text-[12px] leading-5" style={{ color: 'var(--text-secondary)' }}>
          {row.text}
        </p>
      )
  }
}

function MockupFlow({ steps, accent }: { steps: string[]; accent: string }) {
  return (
    <MockupFrame accent={accent} title="flow">
      <ol className="space-y-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] tabular-nums"
              style={{ backgroundColor: accent, color: '#fff' }}
            >
              {i + 1}
            </span>
            <span className="text-[12px] leading-5" style={{ color: 'var(--text)' }}>
              {step}
            </span>
          </li>
        ))}
      </ol>
    </MockupFrame>
  )
}

function MockupTable({ columns, rows, accent }: { columns: string[]; rows: string[][]; accent: string }) {
  return (
    <MockupFrame accent={accent} title="table">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" style={{ color: 'var(--text)' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid var(--border)` }}>
              {columns.map((col) => (
                <th
                  key={col}
                  className="py-2 pr-3 text-left font-semibold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--text-secondary)', fontSize: '9px' }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: i === rows.length - 1 ? 'none' : `1px solid var(--border)` }}>
                {row.map((cell, j) => (
                  <td key={j} className="py-2 pr-3 align-top font-mono tabular-nums">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MockupFrame>
  )
}

function MockupCards({ items }: { items: Array<{ label: string; value: string; hint?: string; tone?: 'teal' | 'indigo' | 'amber' | 'red' | 'green' }> }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => {
        const color = item.tone ? tone[item.tone] : tone.teal
        return (
          <div
            key={item.label}
            className="rounded-lg border p-3"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color }}>
              {item.label}
            </div>
            <div className="mt-1.5 text-xl font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
              {item.value}
            </div>
            {item.hint ? (
              <div className="mt-1 text-[10px] leading-4" style={{ color: 'var(--text-secondary)' }}>
                {item.hint}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function MockupJson({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div
        className="mb-0 inline-block rounded-t-md px-2.5 py-1 font-mono text-[10px]"
        style={{ backgroundColor: '#0f172a', color: tone.teal }}
      >
        {label}
      </div>
      <pre
        className="overflow-auto rounded-b-md rounded-tr-md border p-3 font-mono text-[11px] leading-[1.55]"
        style={{
          borderColor: '#0f172a',
          backgroundColor: '#0f172a',
          color: '#e2e8f0',
        }}
      >
        {body}
      </pre>
    </div>
  )
}

function MockupTerminal({ lines }: { lines: string[] }) {
  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{ borderColor: '#0f172a', backgroundColor: '#0f172a' }}
    >
      <div className="flex items-center gap-1.5 border-b px-3 py-2" style={{ borderColor: '#1e293b' }}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#e06e5f' }} />
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#e0c25f' }} />
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#71b972' }} />
        <span className="ml-2 font-mono text-[10px]" style={{ color: '#94a3b8' }}>
          ~/selfimprove
        </span>
      </div>
      <div className="p-3 font-mono text-[11px] leading-[1.6]">
        {lines.map((line, i) => (
          <div key={i}>
            {line.startsWith('$ ') ? (
              <>
                <span style={{ color: tone.teal }}>$ </span>
                <span style={{ color: '#e2e8f0' }}>{line.slice(2)}</span>
              </>
            ) : line.startsWith('→ ') ? (
              <>
                <span style={{ color: '#94a3b8' }}>→ </span>
                <span style={{ color: '#cbd5e1' }}>{line.slice(2)}</span>
              </>
            ) : line.startsWith('✓ ') ? (
              <>
                <span style={{ color: '#71b972' }}>✓ </span>
                <span style={{ color: '#e2e8f0' }}>{line.slice(2)}</span>
              </>
            ) : (
              <span style={{ color: '#cbd5e1' }}>{line}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section heading + footer
// ---------------------------------------------------------------------------

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="max-w-3xl">
      <div className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: tone.teal }}>
        {eyebrow}
      </div>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl" style={{ color: 'var(--text)' }}>
        {title}
      </h2>
      {sub ? (
        <p className="mt-3 text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
          {sub}
        </p>
      ) : null}
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 text-xs md:flex-row md:items-center md:justify-between lg:px-12" style={{ color: 'var(--text-secondary)' }}>
        <span>
          Generated pre-wipe. Nothing here is a prerequisite for the baseline v1.1 loop.
        </span>
        <div className="flex gap-4 font-mono">
          <Link href="/brain-v1" style={{ color: tone.teal }}>brain-v1</Link>
          <Link href="/brain-v1/runtime" style={{ color: tone.teal }}>runtime</Link>
          <Link href="/" style={{ color: tone.teal }}>home</Link>
        </div>
      </div>
    </footer>
  )
}

// ---------------------------------------------------------------------------
// Proposal data (same catalogue, refined copy)
// ---------------------------------------------------------------------------

const PROPOSALS: Proposal[] = [
  {
    id: 'D1',
    title: 'Cluster detail page',
    category: 'Dashboard',
    scope: 'M',
    locEstimate: '~220 LOC',
    recommendTier: 1,
    why:
      'The runtime dashboard shows 12 cluster cards with five score pills each. You can see the ranking, not the reasoning. A drill-down is the single biggest gap between "I see what\'s hot" and "I understand why".',
    spec: [
      '/brain-v1/runtime/cluster/[slug]',
      'Loads the cluster row, its sources (signals, pages, roadmap items, shipped changes), the latest brief rendered, linked roadmap items, and the most recent action-resolver decision.',
      'Sidebar with five score sparklines computed from brain_runs.result_summary history (no new table).',
      'CTAs: refresh brief, queue PRD, snooze, archive.',
      'Read-only first pass. CTAs land once the patterns are clear.',
    ],
    dependsOn: [],
    dataTouched: ['opportunity_clusters', 'opportunity_cluster_sources', 'brain_runs', 'roadmap_items'],
    newFiles: ['app/brain-v1/runtime/cluster/[slug]/page.tsx'],
    mockup: {
      kind: 'page',
      title: '/brain-v1/runtime/cluster/onboarding-friction',
      rows: [
        { kind: 'heading', text: 'onboarding-friction · Onboarding drop at step 2' },
        { kind: 'pills', items: ['need=conversion', 'theme=onboarding', 'status=active'] },
        { kind: 'bar', label: 'evidence', value: 72, tone: 'teal' },
        { kind: 'bar', label: 'freshness', value: 90, tone: 'indigo' },
        { kind: 'bar', label: 'confidence', value: 64, tone: 'green' },
        { kind: 'bar', label: 'effort', value: 42, tone: 'amber' },
        { kind: 'bar', label: 'focus-weighted', value: 68, tone: 'teal' },
        { kind: 'heading', text: 'Sources (14)' },
        { kind: 'list', items: ['9 feedback signals', '2 shipped changes', '2 analytics signals', '1 brain_page cite'] },
        { kind: 'heading', text: 'Next action' },
        { kind: 'text', text: '→ allow_prd — cluster entered ranked slice (rank 4 of 25)' },
      ],
    },
  },
  {
    id: 'D2',
    title: 'Brain run history + detail',
    category: 'Dashboard',
    scope: 'M',
    locEstimate: '~260 LOC',
    recommendTier: 1,
    why:
      'Every skill invocation writes a brain_run, but the only way to inspect one today is SQL. A filterable list plus a per-run detail page unlocks "did the nightly enrichment actually run, and what did it touch" without leaving the browser.',
    spec: [
      '/brain-v1/runtime/runs — filters for task_type, skill_slug, status, date range.',
      'Per-row: task, skill, status pill, writes done/planned, duration, error snippet.',
      '/brain-v1/runtime/runs/[id] — resolved_context[] as expandable cards, input & result summaries, writes diff.',
      'Cursor-based pagination on created_at so the list scales without count() on big tables.',
    ],
    dependsOn: [],
    dataTouched: ['brain_runs'],
    newFiles: [
      'app/brain-v1/runtime/runs/page.tsx',
      'app/brain-v1/runtime/runs/[id]/page.tsx',
    ],
    mockup: {
      kind: 'table',
      columns: ['when', 'task', 'skill', 'status', 'writes', 'note'],
      rows: [
        ['2m', 'generate_roadmap', 'roadmap-synthesis', 'completed', '3/4', '3 clusters touched'],
        ['11m', 'scan_codebase', 'project-enrichment', 'completed', '6/6', '4 pages updated'],
        ['42m', 'generate_prd', 'prd-author', 'failed', '0/1', 'missing metric_definitions'],
        ['1h', 'audit_resolver', 'check-resolvable', 'completed', '1/1', '19/20 eval pass'],
        ['3h', 'measure_impact', 'impact-review', 'completed', '3/3', 'underperformed'],
      ],
    },
  },
  {
    id: 'D3',
    title: 'Stale page queue',
    category: 'Dashboard',
    scope: 'S',
    locEstimate: '~120 LOC',
    recommendTier: 2,
    why:
      'page-graph.ts marks pages stale when upstream changes. Nothing surfaces them to a human, so stale pages accumulate unless enrichment happens to pick them up on its own cadence.',
    spec: [
      '/brain-v1/runtime/stale — list of brain_pages.status=\'stale\' across the project.',
      'Shows kind, slug, stale_reason, upstream trigger, last_compacted_at.',
      '"Re-enrich now" → POST /api/webhooks/job-complete {projectId, trigger: manual} and link to the resulting run.',
      'No new tables or writes — stale_reason is already populated by write-pages.ts.',
    ],
    dependsOn: [],
    dataTouched: ['brain_pages'],
    newFiles: ['app/brain-v1/runtime/stale/page.tsx'],
    mockup: {
      kind: 'page',
      title: '/brain-v1/runtime/stale',
      rows: [
        { kind: 'heading', text: '3 stale pages in this project' },
        { kind: 'list', items: [
          'implementation_patterns ← repo_map (project-enrichment)',
          'active_experiments ← current_focus (set-focus)',
          'user_pain_map ← project_overview (project-enrichment)',
        ]},
        { kind: 'pills', items: ['re-enrich all', 're-enrich one'] },
      ],
    },
  },
  {
    id: 'D4',
    title: 'Signal → product lineage',
    category: 'Dashboard',
    scope: 'L',
    locEstimate: '~380 LOC',
    recommendTier: 3,
    why:
      'The chain is all there: signal → opportunity_cluster_source → cluster → roadmap_item → shipped_change → impact_actuals. No view walks it end-to-end. Demo-gold for investor pitches, onboarding, and debugging "why did we build this".',
    spec: [
      '/brain-v1/runtime/lineage/[signalId] — also clickable from the signals list.',
      'Left-to-right Sankey: signal → clusters → roadmap_items → PRDs → shipped → actuals → rescore.',
      'Every node is clickable, drills into the matching detail page.',
      'Computes the "forecast was right?" verdict inline from impact_actuals.',
      'Heavy query lives in src/lib/brain/lineage.ts; the page is a thin renderer.',
    ],
    dependsOn: ['D1'],
    dataTouched: ['signals', 'opportunity_cluster_sources', 'roadmap_items', 'shipped_changes'],
    newFiles: [
      'app/brain-v1/runtime/lineage/[signalId]/page.tsx',
      'src/lib/brain/lineage.ts',
    ],
    mockup: {
      kind: 'flow',
      steps: [
        'Signal: "pricing page confuses users" (feedback, weight 4)',
        'Cluster: pricing-confusion (filing score 0.71)',
        'Roadmap: "Simplify pricing tiers" (rank 3, confidence 75)',
        'PRD + experiment: A/B checkout flow',
        'Shipped: PR #412 (merged, risk 32)',
        'Actuals: +9% conversion vs +12% forecast',
        'Rescore: confidence +8, focus 68 → 74',
      ],
    },
  },
  {
    id: 'D5',
    title: 'Cluster score history sparklines',
    category: 'Dashboard',
    scope: 'S',
    locEstimate: '~100 LOC + migration',
    recommendTier: 3,
    why:
      'Scores tell you the present. Sparklines tell you the trajectory. "Was this cluster rising or falling before we shipped?" is a question the brain should answer.',
    spec: [
      'Migration 00012: brain_cluster_snapshots (cluster_id, scores jsonb, captured_at).',
      'Snapshot every rescoreClusters() pass inside generate-roadmap + impact-review.',
      'Pure-SVG sparkline component, ~40px tall, last 20 snapshots.',
      'Render on D1 (cluster detail) and on the cluster cards in /brain-v1/runtime.',
    ],
    dependsOn: ['00012 migration', 'D1'],
    dataTouched: ['brain_cluster_snapshots (new)'],
    newFiles: [
      'supabase/migrations/00012_add_cluster_snapshots.sql',
      'src/lib/brain/snapshots.ts',
    ],
    mockup: {
      kind: 'cards',
      items: [
        { label: 'pricing-confusion', value: '↗ +12', hint: 'focus 56 → 68 (14d)', tone: 'teal' },
        { label: 'onboarding-friction', value: '→ 0', hint: 'focus 70 stable', tone: 'indigo' },
        { label: 'playback-reliability', value: '↘ -18', hint: 'focus 60 → 42 (14d)', tone: 'red' },
        { label: 'landing-clarity', value: '↗ +6', hint: 'focus 48 → 54 (14d)', tone: 'green' },
      ],
    },
  },
  {
    id: 'A1',
    title: 'CLI dispatcher',
    category: 'Agent Surface',
    scope: 'M',
    locEstimate: '~180 LOC',
    recommendTier: 3,
    why:
      'Every skill is invokable from code already. A CLI around dispatch.ts gives humans a terminal shortcut and proves the free-text router end-to-end. Also exercises unmatched-prompt logging in brain_runs.',
    spec: [
      'Binary: selfimprove (scripts/cli.ts; registered as `bin` in package.json).',
      'Commands: run "<phrase>", runs --limit 10, clusters --project <slug>, focus set <mode>.',
      'Auth: SELFIMPROVE_API_KEY from env. Calls /api/cli/run which wraps dispatch + the runner.',
      'Exposes the dispatcher so unmatched phrases land in brain_runs and get caught by the next check-resolvable.',
    ],
    dependsOn: ['dispatch.ts'],
    dataTouched: ['brain_runs'],
    newFiles: ['scripts/cli.ts', 'app/api/cli/run/route.ts'],
    mockup: {
      kind: 'terminal',
      lines: [
        '$ selfimprove run "rerank backlog"',
        '→ dispatch: matched `roadmap-synthesis` via "rerank backlog" (exact)',
        '→ running roadmap-synthesis for project: selfimprove',
        '→ filing: attached 12/13 signals, 1 unfiled',
        '→ synthesis: 4 clusters touched, 3 briefs refreshed',
        '→ roadmap: 3 new items, generation 83e7…',
        '→ page_updates: 1 (release_notes)',
        '→ run: /brain-v1/runtime/runs/r_a1b2c3',
        '✓ completed in 14.2s',
      ],
    },
  },
  {
    id: 'A2',
    title: 'MCP server',
    category: 'Agent Surface',
    scope: 'L',
    locEstimate: '~460 LOC',
    recommendTier: 3,
    why:
      'The skill registry is the right shape to expose as Model Context Protocol tools. Plug it into Claude Code, Cursor, Claude Desktop and every skill becomes callable from inside the IDE.',
    spec: [
      'New package: apps/mcp-server (standalone Node, not inside the Next app).',
      'One MCP tool per registered skill. Tool schema mirrors the runner inputs.',
      'Service-role auth via SUPABASE_SERVICE_ROLE_KEY (same as the worker).',
      'Each tool call routes through dispatchPrompt first, then invokes the matching runner.',
      'Plus read-only tools: brain.get_cluster, brain.search_chunks, brain.recent_runs.',
    ],
    dependsOn: ['dispatch.ts'],
    dataTouched: ['brain_runs', '(read-only across schema)'],
    newFiles: ['apps/mcp-server/src/index.ts', 'apps/mcp-server/package.json'],
    mockup: {
      kind: 'json',
      label: 'mcp tool list',
      body: `[
  { "name": "brain.refresh_roadmap",  "inputs": { "projectId": "uuid" } },
  { "name": "brain.generate_prd",     "inputs": { "roadmapItemId": "uuid" } },
  { "name": "brain.enrich",           "inputs": { "projectId": "uuid" } },
  { "name": "brain.impact_review",    "inputs": { "roadmapItemId": "uuid" } },
  { "name": "brain.audit_resolver",   "inputs": { "projectId": "uuid" } },
  { "name": "brain.get_cluster",      "inputs": { "slug": "string" },   "readOnly": true },
  { "name": "brain.search_chunks",    "inputs": { "query": "string" },  "readOnly": true },
  { "name": "brain.recent_runs",      "inputs": { "limit": "number?" }, "readOnly": true }
]`,
    },
  },
  {
    id: 'A3',
    title: 'Slack bot',
    category: 'Agent Surface',
    scope: 'M',
    locEstimate: '~320 LOC',
    recommendTier: 3,
    why:
      'Most founders check Slack before they check a dashboard. A daily digest channel plus /brain commands is the lowest-friction way to keep the brain present in the loop.',
    spec: [
      '/api/integrations/slack — install + OAuth callback.',
      'Daily cron at 9 AM reuses /api/cron/digest. Posts: top 3 clusters, 1 thesis drift, 1 open PRD, 1 failed run.',
      '/brain refresh-roadmap and /brain audit → dispatchPrompt + the runner.',
      '/brain focus <mode> → PUT /api/projects/[id]/focus, project bound to channel.',
    ],
    dependsOn: ['dispatch.ts', 'Slack app registration'],
    dataTouched: ['brain_runs', 'notifications'],
    newFiles: [
      'app/api/integrations/slack/install/route.ts',
      'app/api/integrations/slack/callback/route.ts',
      'app/api/integrations/slack/commands/route.ts',
    ],
    mockup: {
      kind: 'page',
      title: '#selfimprove-daily',
      rows: [
        { kind: 'heading', text: 'Project Brain — daily digest (Mon 9:00)' },
        { kind: 'list', items: [
          'Top 3 clusters: pricing-confusion (68 ↗), playback-reliability (62), landing-clarity (54)',
          'Thesis drift: onboarding-friction — theme changed from drop-off to activation',
          'Open PRD: "Simplify pricing tiers" — awaiting your approval',
          '1 failed run: prd-author @ 02:14 (missing metric_definitions)',
        ]},
        { kind: 'text', text: '/brain refresh-roadmap to rerun now · /brain focus conversion' },
      ],
    },
  },
  {
    id: 'A4',
    title: 'GitHub webhook → brain',
    category: 'Agent Surface',
    scope: 'M',
    locEstimate: '~180 LOC',
    recommendTier: 2,
    why:
      'The repo is half the product. A webhook that forwards issues, closed PRs, and failed workflow runs into the brain closes the shipped → measured → learning loop without human intervention.',
    spec: [
      '/api/webhooks/github — extend the existing handler.',
      'issues.opened / issues.closed → signal type=feedback, metadata.source=github_issue.',
      'pull_request.closed (merged=true) with linked roadmap_item → shipped_changes update + queue impact-review in +7d.',
      'workflow_run.completed with conclusion=failure → signal type=error with failing workflow name.',
      'All verified via verifyGitHubSignature (already in src/lib/auth/verify-secret.ts).',
    ],
    dependsOn: ['verify-secret'],
    dataTouched: ['signals', 'shipped_changes'],
    newFiles: ['(extension only)'],
    mockup: {
      kind: 'flow',
      steps: [
        'PR #412 merged with "closes #123" + linked roadmap_item_id',
        'GitHub → /api/webhooks/github (HMAC verified)',
        'shipped_changes row: status=merged, pr_number=412, risk carried',
        '+7d cron: /api/cron/impact-review picks it up',
        'impact-review: classifier → verdict → cluster rescore',
      ],
    },
  },
  {
    id: 'A5',
    title: 'PostHog direct ingest',
    category: 'Agent Surface',
    scope: 'S',
    locEstimate: '~90 LOC',
    recommendTier: 3,
    why:
      'Today the roadmap cron fetches PostHog events hourly with a 50-event pagination cap. Switching to PostHog\'s webhook cuts lag from 60 minutes to seconds and removes the cap.',
    spec: [
      '/api/webhooks/posthog — accepts PostHog Subscription Action payload.',
      'Filters to $exception, $rageclick, $feature_flag_call and inserts as signals.',
      'Auth: shared secret in the subscription URL, timing-safe comparison.',
      'Removes the posthog polling block from /api/cron/roadmap.',
    ],
    dependsOn: ['verify-secret'],
    dataTouched: ['signals'],
    newFiles: ['app/api/webhooks/posthog/route.ts'],
    mockup: {
      kind: 'flow',
      steps: [
        'PostHog exception fires in production',
        'PostHog subscription → POST /api/webhooks/posthog?t=<secret>',
        'signals row: type=error, weight=3, metadata.source=posthog',
        'Next /api/cron/roadmap picks it up via filing-resolver',
        'Attaches to performance-issues cluster',
      ],
    },
  },
  {
    id: 'O1',
    title: 'Brain health score',
    category: 'Observability',
    scope: 'M',
    locEstimate: '~220 LOC',
    recommendTier: 2,
    why:
      'The brain has a dozen signals of "is it healthy" and they\'re scattered. A single scalar on /brain-v1/runtime is the forcing function for the team to keep it maintained.',
    spec: [
      'Pure helper src/lib/brain/health.ts returning { overall, components[] }.',
      'Components: run pass rate (7d), trigger eval pass rate, stale page ratio, enrichment freshness, audit issue count.',
      'Big numeric + bar chart at the top of /brain-v1/runtime.',
      'Nightly snapshot via brain_runs (skill_slug=health-snapshot) so trends come free.',
    ],
    dependsOn: [],
    dataTouched: ['brain_runs'],
    newFiles: ['src/lib/brain/health.ts', 'app/api/cron/health-snapshot/route.ts'],
    mockup: {
      kind: 'cards',
      items: [
        { label: 'overall', value: '72', hint: '↗ +4 this week', tone: 'teal' },
        { label: 'run pass', value: '94%', hint: '7d rolling', tone: 'green' },
        { label: 'trigger evals', value: '19/20', hint: 'pass', tone: 'indigo' },
        { label: 'stale pages', value: '3', hint: '2 from repo_map', tone: 'amber' },
      ],
    },
  },
  {
    id: 'O2',
    title: 'Per-skill cost dashboard',
    category: 'Observability',
    scope: 'M',
    locEstimate: '~180 LOC',
    recommendTier: 3,
    why:
      'Every callClaude is anonymous cost. Wrapping the helper with token + $ recording gives you skill-level and project-level spend. Valuable when deciding which skills to throttle or downgrade model for.',
    spec: [
      'Extend call-claude.ts to return { usage: { input, output, model, cost_usd } }.',
      'Runners persist usage into brain_runs.result_summary.usage.',
      '/brain-v1/runtime/cost — stacked bar by skill, day window, CSV export.',
      'Prices driven by a JSON map in src/lib/ai/model-pricing.ts (auditable, tweakable).',
    ],
    dependsOn: [],
    dataTouched: ['brain_runs'],
    newFiles: ['src/lib/ai/model-pricing.ts', 'app/brain-v1/runtime/cost/page.tsx'],
    mockup: {
      kind: 'table',
      columns: ['skill', 'runs', 'in', 'out', '$'],
      rows: [
        ['roadmap-synthesis', '42', '218k', '63k', '2.14'],
        ['prd-author', '18', '96.5k', '41k', '1.08'],
        ['project-enrichment', '6', '320k', '28k', '1.42'],
        ['impact-review', '11', '48k', '9.5k', '0.37'],
        ['check-resolvable', '1', '18k', '4.2k', '0.09'],
        ['implementation-brief', '9', '54k', '12.8k', '0.46'],
      ],
    },
  },
  {
    id: 'O3',
    title: 'Alerting on audit issues',
    category: 'Observability',
    scope: 'S',
    locEstimate: '~120 LOC',
    recommendTier: 3,
    why:
      'resolver_audits is written every Monday. Nobody reads it unless they open /brain-v1/runtime. An alert on the first issue surfaces routing drift the day it happens, not next week.',
    spec: [
      'Extend runResolverAudit: issues > threshold OR pass_rate < floor → notifyResolverDrift.',
      'notifyResolverDrift uses existing Resend integration. Optional Slack via A3.',
      'Add to project_settings: brain_audit_alert_threshold (3), brain_audit_alert_pass_rate_floor (0.85).',
    ],
    dependsOn: ['A3 (optional)'],
    dataTouched: ['resolver_audits', 'project_settings'],
    newFiles: ['src/lib/notifications.ts (extension)'],
    mockup: {
      kind: 'page',
      title: 'brain-alert@selfimprove.dev',
      rows: [
        { kind: 'heading', text: 'Resolver drift detected — selfimprove' },
        { kind: 'text', text: 'Weekly audit found 4 issues (threshold 3). Pass rate dropped to 78% (floor 85%).' },
        { kind: 'list', items: [
          'false_negative: "make this shippable" no longer routes to prd-author',
          'overlap: "audit" maps to check-resolvable AND impact-review',
          'dark_capability: implementation-brief has no trigger',
          'unmatched: retired skill `auto-scope` still referenced in 2 runs',
        ]},
        { kind: 'text', text: 'Review at /brain-v1/runtime · one-click apply at /api/resolver-audits/a1b2/apply' },
      ],
    },
  },
  {
    id: 'O4',
    title: 'Run trace viewer',
    category: 'Observability',
    scope: 'M',
    locEstimate: '~280 LOC',
    recommendTier: 1,
    why:
      'Debugging a skill today: find the brain_run row, open the JSON, guess what was in the prompt, replay by hand. A trace viewer closes that loop. This is the piece that moves the brain from "trust the model" to "audit the model".',
    spec: [
      'Extend startBrainRun to accept { promptHash, promptPreview } persisted under result_summary.prompt_preview.',
      '/brain-v1/runtime/runs/[id]/trace — five collapsible sections: resolved context, input, prompt preview, model response, writes diff.',
      'Writes diff: writes_planned minus writes_completed with status pills. Clickable to the written rows.',
      'Configurable redact list in src/lib/brain/runs.ts for PII-sensitive fields.',
    ],
    dependsOn: ['D2'],
    dataTouched: ['brain_runs'],
    newFiles: ['app/brain-v1/runtime/runs/[id]/trace/page.tsx'],
    mockup: {
      kind: 'page',
      title: '/brain-v1/runtime/runs/r_a1b2c3/trace',
      rows: [
        { kind: 'heading', text: 'roadmap-synthesis · completed · 14.2s' },
        { kind: 'pills', items: ['resolved context', 'input', 'prompt', 'response', 'writes'] },
        { kind: 'heading', text: 'Resolved context (5 pages)' },
        { kind: 'list', items: [
          'current_focus conversion — v3 active',
          'project_overview — v7',
          'user_pain_map — v4',
          'active_experiments — v2',
          'open_decisions — v3 (missing, used default)',
        ]},
        { kind: 'heading', text: 'Writes: 3 of 4 completed' },
        { kind: 'list', items: [
          '✓ signals.processed (12 rows)',
          '✓ opportunity_clusters (3 rows)',
          '✓ roadmap_items (3 rows)',
          '✗ brain_pages (0/1 — metric_definitions chunk insert failed)',
        ]},
      ],
    },
  },
  {
    id: 'K1',
    title: 'Chunk search',
    category: 'Knowledge',
    scope: 'S',
    locEstimate: '~140 LOC',
    recommendTier: 3,
    why:
      'brain_chunks is populated on every page write with a full-text index already sitting there. A search endpoint turns the brain from "it has thoughts about my product" to "I can ask it."',
    spec: [
      'GET /api/brain/search?q=...&projectId=... — Postgres to_tsvector rank over brain_chunks.',
      '/brain-v1/runtime/search — input + results grouped by page kind, chunk with heading metadata.',
      'Swap to pgvector when embeddings land. API shape stays identical.',
      'Uses the brain_chunks_search gin index from migration 00009.',
    ],
    dependsOn: [],
    dataTouched: ['brain_chunks'],
    newFiles: ['app/api/brain/search/route.ts', 'app/brain-v1/runtime/search/page.tsx'],
    mockup: {
      kind: 'page',
      title: '/brain-v1/runtime/search · q="onboarding drop"',
      rows: [
        { kind: 'heading', text: '4 results' },
        { kind: 'list', items: [
          'user_pain_map § Onboarding drop-off — v4 (freshness 82)',
          'project_overview § Stage & surface — v7',
          'active_experiments § A/B simplified setup — v2',
          'release_notes § 2025-10 shipped changes — v3',
        ]},
      ],
    },
  },
  {
    id: 'K2',
    title: 'Model evaluation scoreboard',
    category: 'Knowledge',
    scope: 'L',
    locEstimate: '~420 LOC',
    recommendTier: 3,
    why:
      'Every roadmap item carries a forecast (impact_estimates). Every shipped item eventually carries actuals. Aggregating those into a "was the model right" scoreboard turns the brain into a self-improving PM.',
    spec: [
      'Pure helper src/lib/brain/model-eval.ts aggregating estimate_accuracy across roadmap_items.',
      'Breakdowns by cluster, skill, focus mode, model string.',
      '/brain-v1/runtime/model-eval — three charts: accuracy by skill, by focus, over time.',
      'impact-review.ts can eventually cite it ("historical accuracy for this cluster kind: 68%").',
      'Hide the view until N >= 10. Cold start is otherwise ugly.',
    ],
    dependsOn: ['D2'],
    dataTouched: ['roadmap_items', 'brain_runs'],
    newFiles: ['src/lib/brain/model-eval.ts', 'app/brain-v1/runtime/model-eval/page.tsx'],
    mockup: {
      kind: 'cards',
      items: [
        { label: 'overall accuracy', value: '62%', hint: '34 shipped (30d)', tone: 'teal' },
        { label: 'best skill', value: '74%', hint: 'prd-author', tone: 'green' },
        { label: 'worst skill', value: '51%', hint: 'roadmap-synthesis', tone: 'red' },
        { label: 'best focus', value: '71%', hint: 'conversion', tone: 'indigo' },
      ],
    },
  },
]
