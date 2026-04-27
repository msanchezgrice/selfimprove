import { readFile } from 'fs/promises'
import path from 'path'
import Link from 'next/link'

import {
  BACKLOG_LAYERS,
  BRAIN_SKILLS,
  BRAIN_TABLES,
  FOCUS_MODES,
  RESOLVER_LAYERS,
  TASK_BLUEPRINTS,
  getResolverRules,
  type BrainTaskType,
} from '@/lib/brain/design'
import { BrainDiagramGallery } from './_components/brain-diagrams'

const reviewTasks: BrainTaskType[] = [
  'generate_roadmap',
  'generate_prd',
  'implement_roadmap_item',
  'measure_impact',
]

const spotlightTasks: BrainTaskType[] = [
  'generate_roadmap',
  'generate_prd',
  'audit_resolver',
]

const repoTouchpoints = [
  'src/lib/ai/generate-roadmap.ts',
  'src/lib/ai/generate-prd.ts',
  'src/lib/ai/project-enrichment.ts',
  'src/lib/ai/implementation-brief.ts',
  'src/lib/ai/impact-review.ts',
  'src/lib/ai/check-resolvable.ts',
  'src/lib/brain/resolve-context.ts',
  'src/lib/brain/ranking.ts',
  'src/lib/brain/filing-resolver.ts',
  'src/lib/brain/seed-pages.ts',
  'src/app/api/cron/project-enrichment/route.ts',
  'src/app/api/cron/impact-review/route.ts',
  'src/app/api/cron/resolver-audit/route.ts',
  'src/app/api/webhooks/job-complete/route.ts',
  'docs/brain/RESOLVER.md',
  'docs/brain/skills/_filing-rules.md',
  'docs/brain/project-brain-v1.md',
]

async function loadText(relativePath: string) {
  return readFile(path.join(process.cwd(), relativePath), 'utf8')
}

function TaskCard({
  title,
  items,
}: {
  title: string
  items: string[]
}) {
  return (
    <div
      className="rounded-3xl border p-5"
      style={{ borderColor: '#d9d0c5', backgroundColor: '#fffdf8' }}
    >
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: '#8b5e34' }}>
        {title}
      </h3>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item} className="flex gap-3">
            <span
              className="mt-1 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: '#c08457' }}
            />
            <p className="text-sm leading-6" style={{ color: '#3f3a36' }}>
              {item}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function BrainV1Page() {
  const [designDoc, resolverDoc, filingRulesDoc, skillFiles] = await Promise.all([
    loadText('docs/brain/project-brain-v1.md'),
    loadText('docs/brain/RESOLVER.md'),
    loadText('docs/brain/skills/_filing-rules.md'),
    Promise.all(
      BRAIN_SKILLS.map(async (skill) => ({
        ...skill,
        content: await loadText(skill.filePath),
      })),
    ),
  ])

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(233,213,198,0.8), transparent 26%), linear-gradient(180deg, #f7f2eb 0%, #f4efe8 50%, #efe9df 100%)',
      }}
    >
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div
          className="rounded-[2rem] border p-8 shadow-[0_16px_60px_rgba(70,55,40,0.08)]"
          style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,252,247,0.94)' }}
        >
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ backgroundColor: '#efe4d7', color: '#8b5e34' }}
                >
                  Local Review
                </span>
                <span className="text-sm" style={{ color: '#7a6d61' }}>
                  <code>signals -&gt; project memory -&gt; opportunity clusters -&gt; ranked roadmap -&gt; PRDs / build jobs</code>
                </span>
              </div>
              <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight lg:text-6xl" style={{ color: '#1f1a17' }}>
                Project Brain v1.1
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8" style={{ color: '#4d4741' }}>
                This is the updated SelfImprove architecture after the resolver and backlog refinements:
                resolver as governance, dominant-need focus, opportunity clusters, and a long backlog
                that stays rankable instead of turning into brief sprawl.
              </p>
            </div>

            <div className="grid gap-3 text-sm" style={{ color: '#4d4741' }}>
              <Link
                href="/brain-v1/runtime"
                className="rounded-2xl border px-4 py-3 font-semibold underline underline-offset-4"
                style={{ borderColor: '#d7b48a', backgroundColor: '#fff1dd', color: '#8b5e34' }}
              >
                Live runtime dashboard: <code>/brain-v1/runtime</code>
              </Link>
              <Link
                href="/proposals"
                className="rounded-2xl border px-4 py-3 font-semibold underline underline-offset-4"
                style={{ borderColor: '#b5c2d9', backgroundColor: '#eef4ff', color: '#35527e' }}
              >
                Next-up proposals (specs + mockups): <code>/proposals</code>
              </Link>
              <div className="rounded-2xl border px-4 py-3" style={{ borderColor: '#e6ddd3', backgroundColor: '#fff7ef' }}>
                Primary migrations: <code className="font-semibold">00009, 00010, 00011</code>
              </div>
            </div>
          </div>
        </div>

        <section className="mt-8 grid gap-6 xl:grid-cols-4">
          <TaskCard
            title="Today"
            items={[
              'Raw signals are batch summarized and quickly turned into standalone briefs.',
              'Roadmap rows still do too much work as memory, backlog, and action queue.',
              'A capped roadmap coexists with a sprawling briefs layer underneath it.',
            ]}
          />
          <TaskCard
            title="Resolver Governance"
            items={[
              'Resolver now means skill routing, filing, context loading, and next-action policy.',
              'Every memory-writing skill reads RESOLVER.md and filing rules before creating anything new.',
              'A weekly check-resolvable audit catches dark capabilities and trigger drift.',
            ]}
          />
          <TaskCard
            title="Dominant Need"
            items={[
              'Current focus becomes first-class context: UX quality, conversion, virality, performance, or retention.',
              'Roadmap ranking changes with focus mode instead of regenerating strategy from scratch every run.',
              'PRDs preserve why-now context so execution matches the current phase of the product.',
            ]}
          />
          <TaskCard
            title="Structured Backlog"
            items={[
              'Signals stay raw evidence; opportunity clusters become the canonical long backlog.',
              'The roadmap becomes a ranked slice over clusters, not the storage layer for every idea.',
              'Default behavior is attach-to-cluster, not create-a-new-brief.',
            ]}
          />
        </section>

        <BrainDiagramGallery />

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div
            className="rounded-[2rem] border p-6"
            style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
                  Resolver Governance
                </h2>
                <p className="mt-1 text-sm" style={{ color: '#6f665e' }}>
                  Resolver is no longer just a page-loader. It is the management layer that keeps the whole system coherent.
                </p>
              </div>
              <span className="text-xs uppercase tracking-[0.18em]" style={{ color: '#8b5e34' }}>
                v1.1 shift
              </span>
            </div>

            <div className="mt-6 grid gap-4">
              {RESOLVER_LAYERS.map((layer) => (
                <article
                  key={layer.name}
                  className="rounded-3xl border p-5"
                  style={{ borderColor: '#e5ddd2', backgroundColor: '#fffcf8' }}
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <h3 className="text-lg font-semibold" style={{ color: '#25211d' }}>
                      {layer.name}
                    </h3>
                    <span
                      className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]"
                      style={{ backgroundColor: '#f1e6d9', color: '#7c5633' }}
                    >
                      {layer.where}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6" style={{ color: '#4d4741' }}>
                    {layer.purpose}
                  </p>
                  <p className="mt-3 text-sm leading-6" style={{ color: '#6f665e' }}>
                    Prevents: {layer.protectsAgainst}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div
              className="rounded-[2rem] border p-6"
              style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
            >
              <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
                Focus Modes
              </h2>
              <p className="mt-1 text-sm" style={{ color: '#6f665e' }}>
                The roadmap should be weighted by the product’s current dominant need.
              </p>
              <div className="mt-5 space-y-4">
                {FOCUS_MODES.map((mode) => (
                  <div
                    key={mode.name}
                    className="rounded-3xl border p-5"
                    style={{ borderColor: '#e5ddd2', backgroundColor: '#fffcf8' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold" style={{ color: '#25211d' }}>
                        <code>{mode.name}</code>
                      </h3>
                    </div>
                    <p className="mt-2 text-sm leading-6" style={{ color: '#5d5750' }}>
                      {mode.description}
                    </p>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <TaskCard title="Raises" items={mode.raises} />
                      <TaskCard title="Lowers" items={mode.lowers} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="rounded-[2rem] border p-6"
              style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
            >
              <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
                Backlog Shape
              </h2>
              <p className="mt-1 text-sm" style={{ color: '#6f665e' }}>
                A longer backlog is fine if each layer has a clear role and update policy.
              </p>
              <div className="mt-5 space-y-4">
                {BACKLOG_LAYERS.map((layer) => (
                  <div
                    key={layer.name}
                    className="rounded-3xl border p-5"
                    style={{ borderColor: '#e5ddd2', backgroundColor: '#fffcf8' }}
                  >
                    <h3 className="text-lg font-semibold" style={{ color: '#25211d' }}>
                      {layer.name}
                    </h3>
                    <p className="mt-2 text-sm leading-6" style={{ color: '#5d5750' }}>
                      {layer.role}
                    </p>
                    <p className="mt-3 text-sm leading-6" style={{ color: '#4d4741' }}>
                      {layer.countGuidance}
                    </p>
                    <p className="mt-2 text-sm leading-6" style={{ color: '#6f665e' }}>
                      {layer.updatePolicy}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div
            className="rounded-[2rem] border p-6"
            style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
                  Tables
                </h2>
                <p className="mt-1 text-sm" style={{ color: '#6f665e' }}>
                  The schema now distinguishes between shipped v1 core tables and the v1.1 backlog and resolver extensions.
                </p>
              </div>
              <span className="text-xs uppercase tracking-[0.18em]" style={{ color: '#8b5e34' }}>
                core + next
              </span>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {BRAIN_TABLES.map((table) => (
                <article
                  key={table.name}
                  className="rounded-3xl border p-5"
                  style={{ borderColor: '#e5ddd2', backgroundColor: '#fffcf8' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold" style={{ color: '#25211d' }}>
                        <code>{table.name}</code>
                      </h3>
                      <p className="mt-2 text-sm leading-6" style={{ color: '#5d5750' }}>
                        {table.purpose}
                      </p>
                    </div>
                    <span
                      className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.14em]"
                      style={{
                        backgroundColor: table.phase === 'v1-core' ? '#efe4d7' : '#e7eefb',
                        color: table.phase === 'v1-core' ? '#8b5e34' : '#35527e',
                      }}
                    >
                      {table.phase}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {table.columns.map((column) => (
                      <span
                        key={column}
                        className="rounded-full px-3 py-1 text-xs"
                        style={{ backgroundColor: '#f1e6d9', color: '#7c5633' }}
                      >
                        {column}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div
            className="rounded-[2rem] border p-6"
            style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
          >
            <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
              Repo Touchpoints
            </h2>
            <p className="mt-1 text-sm" style={{ color: '#6f665e' }}>
              These are the files that now define the control plane, not just the AI prompts.
            </p>
            <div className="mt-5 space-y-3">
              {repoTouchpoints.map((touchpoint) => (
                <div
                  key={touchpoint}
                  className="rounded-2xl border px-4 py-3 text-sm"
                  style={{ borderColor: '#e5ddd2', backgroundColor: '#fffcf8', color: '#3f3a36' }}
                >
                  <code>{touchpoint}</code>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-3xl border p-5" style={{ borderColor: '#e5ddd2', backgroundColor: '#fff7ef' }}>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: '#8b5e34' }}>
                Source of Truth
              </h3>
              <p className="mt-3 text-sm leading-6" style={{ color: '#4d4741' }}>
                Roadmap rows and PRDs become projections of maintained opportunity clusters and project memory.
                Resolver decides what gets loaded, where evidence goes, and what action should happen next.
              </p>
            </div>
          </div>
        </section>

        <section
          className="mt-8 rounded-[2rem] border p-6"
          style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
        >
          <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
            Context Resolver Rules
          </h2>
          <p className="mt-1 text-sm" style={{ color: '#6f665e' }}>
            These are the task-specific rules that keep context small. The biggest change is that roadmap work starts with `current_focus`.
          </p>

          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            {reviewTasks.map((taskType) => {
              const rules = getResolverRules(taskType)
              const blueprint = TASK_BLUEPRINTS[taskType]

              return (
                <div
                  key={taskType}
                  className="rounded-3xl border p-5"
                  style={{ borderColor: '#e5ddd2', backgroundColor: '#fffcf8' }}
                >
                  <h3 className="text-lg font-semibold" style={{ color: '#25211d' }}>
                    {blueprint.name}
                  </h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: '#5d5750' }}>
                    {blueprint.goal}
                  </p>

                  <div className="mt-4 space-y-3">
                    {rules.map((rule) => (
                      <div key={`${rule.taskType}-${rule.pageKind}`} className="rounded-2xl border px-4 py-3" style={{ borderColor: '#efe4d7', backgroundColor: '#fff7ef' }}>
                        <div className="flex items-center justify-between gap-4">
                          <code className="text-sm font-semibold" style={{ color: '#7c5633' }}>
                            {rule.pageKind}
                          </code>
                          <span className="text-xs uppercase tracking-[0.14em]" style={{ color: rule.required ? '#8b5e34' : '#9c8f81' }}>
                            {rule.required ? 'required' : 'optional'} • p{rule.priority}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6" style={{ color: '#4d4741' }}>
                          {rule.reason}
                        </p>
                      </div>
                    ))}
                    {rules.length === 0 ? (
                      <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: '#efe4d7', backgroundColor: '#fff7ef', color: '#6f665e' }}>
                        This task is governed mostly by trigger routing and runtime policy rather than page selection.
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-3">
          {spotlightTasks.map((taskType) => {
            const blueprint = TASK_BLUEPRINTS[taskType]

            return (
              <div
                key={taskType}
                className="rounded-[2rem] border p-6"
                style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
              >
                <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
                  {blueprint.name}
                </h2>
                <p className="mt-2 text-sm leading-6" style={{ color: '#5d5750' }}>
                  {blueprint.goal}
                </p>

                <div className="mt-6 space-y-4">
                  <TaskCard title="Deterministic Stages" items={blueprint.deterministicStages} />
                  <TaskCard title="Latent Stages" items={blueprint.latentStages} />
                  <TaskCard title="Writes" items={blueprint.writes} />
                  <TaskCard title="What Changes" items={blueprint.changedFromToday} />
                </div>
              </div>
            )
          })}
        </section>

        <section
          className="mt-8 rounded-[2rem] border p-6"
          style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
                Skill Files
              </h2>
              <p className="mt-1 text-sm" style={{ color: '#6f665e' }}>
                These markdown files are the reusable judgment layer. The page reads the same files that are committed under <code>docs/brain/skills</code>.
              </p>
            </div>
            <Link href="/" className="text-sm font-medium underline underline-offset-4" style={{ color: '#8b5e34' }}>
              Back to home
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {skillFiles.map((skill) => (
              <details
                key={skill.slug}
                className="rounded-3xl border p-5"
                style={{ borderColor: '#e5ddd2', backgroundColor: '#fffcf8' }}
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold" style={{ color: '#25211d' }}>
                        {skill.name}
                      </h3>
                      <p className="mt-2 text-sm leading-6" style={{ color: '#5d5750' }}>
                        {skill.description}
                      </p>
                    </div>
                    <div className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]" style={{ backgroundColor: '#f1e6d9', color: '#7c5633' }}>
                      {skill.slug}
                    </div>
                  </div>
                </summary>

                <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                  <div className="space-y-4">
                    <TaskCard title="Inputs" items={skill.inputParameters} />
                    <TaskCard title="Writes" items={skill.writes} />
                    <div className="rounded-3xl border p-5" style={{ borderColor: '#d9d0c5', backgroundColor: '#fff7ef' }}>
                      <h4 className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: '#8b5e34' }}>
                        File Path
                      </h4>
                      <p className="mt-3 text-sm" style={{ color: '#4d4741' }}>
                        <code>{skill.filePath}</code>
                      </p>
                    </div>
                  </div>

                  <pre
                    className="overflow-x-auto rounded-3xl border p-5 text-sm leading-6"
                    style={{
                      borderColor: '#e5ddd2',
                      backgroundColor: '#241f1b',
                      color: '#f8eee2',
                    }}
                  >
                    {skill.content}
                  </pre>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <div
            className="rounded-[2rem] border p-6"
            style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
          >
            <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
              Resolver Doc
            </h2>
            <p className="mt-1 text-sm" style={{ color: '#6f665e' }}>
              This is the explicit routing table the memory-writing and roadmap skills are now expected to consult.
            </p>
            <pre
              className="mt-5 overflow-x-auto rounded-3xl border p-5 text-sm leading-6"
              style={{
                borderColor: '#e5ddd2',
                backgroundColor: '#faf5ee',
                color: '#3f3a36',
              }}
            >
              {resolverDoc}
            </pre>
          </div>

          <div
            className="rounded-[2rem] border p-6"
            style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
          >
            <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
              Filing Rules
            </h2>
            <p className="mt-1 text-sm" style={{ color: '#6f665e' }}>
              The shared anti-junk-drawer rules that every writing skill should follow before creating new pages or clusters.
            </p>
            <pre
              className="mt-5 overflow-x-auto rounded-3xl border p-5 text-sm leading-6"
              style={{
                borderColor: '#e5ddd2',
                backgroundColor: '#faf5ee',
                color: '#3f3a36',
              }}
            >
              {filingRulesDoc}
            </pre>
          </div>
        </section>

        <section
          className="mt-8 rounded-[2rem] border p-6"
          style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
        >
          <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
            Design Doc
          </h2>
          <p className="mt-1 text-sm" style={{ color: '#6f665e' }}>
            The review page also includes the checked-in markdown overview.
          </p>
          <pre
            className="mt-5 overflow-x-auto rounded-3xl border p-5 text-sm leading-6"
            style={{
              borderColor: '#e5ddd2',
              backgroundColor: '#faf5ee',
              color: '#3f3a36',
            }}
          >
            {designDoc}
          </pre>
        </section>
      </div>
    </div>
  )
}
