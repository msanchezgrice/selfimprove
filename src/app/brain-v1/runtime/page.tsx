import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FOCUS_MODES } from '@/lib/brain/design'
import { FocusPicker } from './_components/focus-picker'
import type {
  BrainPageRow,
  BrainPageVersionRow,
  BrainRunRow,
  OpportunityClusterRow,
  ResolverAuditIssue,
  ResolverAuditRow,
} from '@/lib/types/database'

type ProjectListItem = { id: string; name: string; slug: string }

type RuntimeData = {
  project: ProjectListItem
  focusPage: BrainPageRow | null
  focusVersion: BrainPageVersionRow | null
  clusters: OpportunityClusterRow[]
  runs: BrainRunRow[]
  audit: ResolverAuditRow | null
  signalsProcessed24h: number
}

/**
 * /brain-v1/runtime
 *
 * Read-only dashboard that shows the live state of the project brain for
 * one project: the active focus mode, the top opportunity clusters, the
 * latest `brain_runs`, and the most recent `resolver_audit`. Mirrors the
 * spec walkthrough at `/brain-v1` with actual data.
 *
 * Auth-gated: pulls the first project the user has access to unless
 * `?projectId=` is supplied. Shows a picker when multiple projects are
 * reachable. Redirects to /login when no user is signed in.
 */
export default async function BrainRuntimePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId: requestedProjectId } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?next=/brain-v1/runtime')
  }

  const projects = await loadAccessibleProjects(supabase)
  if (projects.length === 0) {
    return <EmptyState reason="no_projects" />
  }

  const selected =
    projects.find((project) => project.id === requestedProjectId) ?? projects[0]

  const data = await loadRuntimeData(selected)

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(233,213,198,0.8), transparent 26%), linear-gradient(180deg, #f7f2eb 0%, #f4efe8 50%, #efe9df 100%)',
      }}
    >
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <Header
          projects={projects}
          selected={selected}
        />
        <FocusSection data={data} />
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <ClustersSection clusters={data.clusters} />
          <RunsSection runs={data.runs} signalsProcessed24h={data.signalsProcessed24h} />
        </div>
        <AuditSection audit={data.audit} />
        <FooterLinks />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadAccessibleProjects(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ProjectListItem[]> {
  const { data } = await supabase
    .from('projects')
    .select('id, name, slug')
    .eq('status', 'active')
    .order('name', { ascending: true })
    .limit(50)
  return (data ?? []) as ProjectListItem[]
}

async function loadRuntimeData(project: ProjectListItem): Promise<RuntimeData> {
  const admin = createAdminClient()

  const { data: focusPage } = await admin
    .from('brain_pages')
    .select('*')
    .eq('project_id', project.id)
    .eq('kind', 'current_focus')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let focusVersion: BrainPageVersionRow | null = null
  if (focusPage) {
    const { data } = await admin
      .from('brain_page_versions')
      .select('*')
      .eq('page_id', (focusPage as BrainPageRow).id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    focusVersion = (data as BrainPageVersionRow) ?? null
  }

  const { data: clusters } = await admin
    .from('opportunity_clusters')
    .select('*')
    .eq('project_id', project.id)
    .eq('status', 'active')
    .order('focus_weighted_score', { ascending: false })
    .limit(12)

  const { data: runs } = await admin
    .from('brain_runs')
    .select('*')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: audit } = await admin
    .from('resolver_audits')
    .select('*')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: signalsProcessed24h } = await admin
    .from('signals')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', project.id)
    .eq('processed', true)
    .gte('updated_at', since)

  return {
    project,
    focusPage: (focusPage as BrainPageRow) ?? null,
    focusVersion,
    clusters: (clusters ?? []) as OpportunityClusterRow[],
    runs: (runs ?? []) as BrainRunRow[],
    audit: (audit as ResolverAuditRow) ?? null,
    signalsProcessed24h: signalsProcessed24h ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function Header({
  projects,
  selected,
}: {
  projects: ProjectListItem[]
  selected: ProjectListItem
}) {
  return (
    <div
      className="rounded-[2rem] border p-8 shadow-[0_16px_60px_rgba(70,55,40,0.08)]"
      style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,252,247,0.94)' }}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ backgroundColor: '#efe4d7', color: '#8b5e34' }}
            >
              Live Runtime
            </span>
            <Link
              href="/brain-v1"
              className="text-xs uppercase tracking-[0.18em] underline underline-offset-4"
              style={{ color: '#8b5e34' }}
            >
              back to spec walkthrough
            </Link>
          </div>
          <h1
            className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight lg:text-5xl"
            style={{ color: '#1f1a17' }}
          >
            Project Brain — live
          </h1>
          <p className="mt-3 text-sm" style={{ color: '#6f665e' }}>
            Current focus, top opportunity clusters, recent skill runs, and the latest resolver audit for this project.
          </p>
        </div>
        <ProjectPicker projects={projects} selected={selected} />
      </div>
    </div>
  )
}

function ProjectPicker({
  projects,
  selected,
}: {
  projects: ProjectListItem[]
  selected: ProjectListItem
}) {
  return (
    <div
      className="rounded-2xl border px-4 py-3 text-sm"
      style={{ borderColor: '#e6ddd3', backgroundColor: '#fff7ef', color: '#4d4741' }}
    >
      <div className="mb-2 text-xs uppercase tracking-[0.18em]" style={{ color: '#8b5e34' }}>
        Project
      </div>
      <div className="flex flex-wrap gap-2">
        {projects.map((project) => {
          const isSelected = project.id === selected.id
          return (
            <Link
              key={project.id}
              href={`/brain-v1/runtime?projectId=${project.id}`}
              className="rounded-full px-3 py-1 text-xs"
              style={{
                backgroundColor: isSelected ? '#8b5e34' : '#f1e6d9',
                color: isSelected ? '#fffdf8' : '#7c5633',
              }}
            >
              {project.name}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function FocusSection({ data }: { data: RuntimeData }) {
  const focusName = data.focusPage?.slug ?? null
  const mode = focusName ? FOCUS_MODES.find((m) => m.name === focusName) : null
  return (
    <section
      className="mt-6 rounded-[2rem] border p-6"
      style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
            Current Focus
          </h2>
          <p className="mt-1 text-sm" style={{ color: '#6f665e' }}>
            Loaded first by `roadmap-synthesis`. Set via `PUT /api/projects/{data.project.id}/focus`.
          </p>
        </div>
        <div className="rounded-full px-4 py-2 text-sm font-semibold" style={{
          backgroundColor: focusName ? '#efe4d7' : '#f3ecdf',
          color: focusName ? '#8b5e34' : '#9a8f7f',
        }}>
          {focusName ? focusName : 'not set'}
        </div>
      </div>
      {mode ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border p-5" style={{ borderColor: '#e5ddd2', backgroundColor: '#fffcf8' }}>
            <p className="text-sm leading-6" style={{ color: '#4d4741' }}>{mode.description}</p>
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: '#8b5e34' }}>Raises</h3>
              <ul className="mt-2 space-y-1 text-sm" style={{ color: '#4d4741' }}>
                {mode.raises.map((entry) => (<li key={entry}>— {entry}</li>))}
              </ul>
            </div>
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: '#8b5e34' }}>Lowers</h3>
              <ul className="mt-2 space-y-1 text-sm" style={{ color: '#4d4741' }}>
                {mode.lowers.map((entry) => (<li key={entry}>— {entry}</li>))}
              </ul>
            </div>
          </div>
          <div className="space-y-4">
            <FocusPicker
              projectId={data.project.id}
              currentFocus={focusName}
              note={null}
            />
            <div className="rounded-3xl border p-5" style={{ borderColor: '#e5ddd2', backgroundColor: '#fffcf8' }}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: '#8b5e34' }}>Latest version</h3>
              <pre
                className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap text-xs leading-6"
                style={{ color: '#3f3a36' }}
              >{data.focusVersion?.content_md ?? '(no compiled version)'}</pre>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <p className="text-sm" style={{ color: '#6f665e' }}>
            No focus mode set yet. Until one is set, <code>computeNeedAlignment</code> falls back to a neutral 0.5 for every cluster.
          </p>
          <FocusPicker projectId={data.project.id} currentFocus={null} note={null} />
        </div>
      )}
    </section>
  )
}

function ClustersSection({ clusters }: { clusters: OpportunityClusterRow[] }) {
  return (
    <section
      className="rounded-[2rem] border p-6"
      style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
    >
      <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
        Top Opportunity Clusters
      </h2>
      <p className="mt-1 text-sm" style={{ color: '#6f665e' }}>
        Ranked by focus-weighted score. The roadmap is a projection over this list.
      </p>
      <div className="mt-5 space-y-3">
        {clusters.length === 0 ? (
          <EmptyRow text="No active clusters yet. The first roadmap run or enrichment sweep will populate them." />
        ) : (
          clusters.map((cluster) => (
            <article
              key={cluster.id}
              className="rounded-3xl border p-4"
              style={{ borderColor: '#e5ddd2', backgroundColor: '#fffcf8' }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold" style={{ color: '#25211d' }}>
                  <code>{cluster.slug}</code> — {cluster.title}
                </h3>
                <span className="text-xs uppercase tracking-[0.14em]" style={{ color: '#8b5e34' }}>
                  focus {cluster.focus_weighted_score}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs" style={{ color: '#7c5633' }}>
                <Pill label="need" value={cluster.primary_need || 'n/a'} />
                <Pill label="theme" value={cluster.theme || 'n/a'} />
                <Pill label="ev" value={String(cluster.evidence_strength)} />
                <Pill label="fresh" value={String(cluster.freshness_score)} />
                <Pill label="conf" value={String(cluster.confidence_score)} />
                <Pill label="effort" value={String(cluster.effort_score)} />
              </div>
              {cluster.latest_brief_md ? (
                <p className="mt-3 line-clamp-3 text-sm leading-6" style={{ color: '#4d4741' }}>
                  {cluster.latest_brief_md.replace(/^#.*\n/, '').slice(0, 320)}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  )
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5"
      style={{ backgroundColor: '#f1e6d9', color: '#7c5633' }}
    >
      {label}={value}
    </span>
  )
}

function RunsSection({
  runs,
  signalsProcessed24h,
}: {
  runs: BrainRunRow[]
  signalsProcessed24h: number
}) {
  return (
    <section
      className="rounded-[2rem] border p-6"
      style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
          Recent Runs
        </h2>
        <span className="text-xs" style={{ color: '#8b5e34' }}>
          {signalsProcessed24h} signal(s) processed in 24h
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {runs.length === 0 ? (
          <EmptyRow text="No runs yet. Trigger the roadmap, enrichment, or resolver-audit cron to see entries here." />
        ) : (
          runs.map((run) => (
            <div
              key={run.id}
              className="rounded-2xl border px-4 py-3 text-sm"
              style={{ borderColor: '#e5ddd2', backgroundColor: '#fffcf8', color: '#4d4741' }}
            >
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-semibold" style={{ color: '#7c5633' }}>{run.task_type}</code>
                <span className="text-xs uppercase tracking-[0.14em]" style={{ color: runStatusColor(run.status) }}>
                  {run.status}
                </span>
              </div>
              <div className="mt-1 text-xs" style={{ color: '#9a8f81' }}>
                skill <code>{run.skill_slug}</code> · writes {run.writes_completed.length}/{run.writes_planned.length || 0} · {formatRelative(run.created_at)}
              </div>
              {run.error ? (
                <p className="mt-2 text-xs" style={{ color: '#a8552a' }}>
                  error: {run.error}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function AuditSection({ audit }: { audit: ResolverAuditRow | null }) {
  if (!audit) {
    return (
      <section
        className="mt-8 rounded-[2rem] border p-6"
        style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
      >
        <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
          Resolver Audit
        </h2>
        <EmptyRow text="No audit yet. The weekly /api/cron/resolver-audit sweep will write one." />
      </section>
    )
  }

  const issues = (audit.issues_found ?? []) as ResolverAuditIssue[]
  return (
    <section
      className="mt-8 rounded-[2rem] border p-6"
      style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
            Resolver Audit
          </h2>
          <p className="mt-1 text-sm" style={{ color: '#6f665e' }}>
            Latest reachability and overlap audit from `check-resolvable`.
          </p>
        </div>
        <div className="text-xs" style={{ color: '#8b5e34' }}>
          {issues.length} issue(s) · {formatRelative(audit.created_at)}
        </div>
      </div>
      <p className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{
        borderColor: '#efe4d7',
        backgroundColor: '#fff7ef',
        color: '#4d4741',
      }}>
        {audit.summary || '(no summary written)'}
      </p>
      <div className="mt-4 space-y-2">
        {issues.slice(0, 8).map((issue, index) => (
          <div
            key={`${issue.kind}-${index}`}
            className="rounded-2xl border px-4 py-2 text-sm"
            style={{ borderColor: '#e5ddd2', backgroundColor: '#fffcf8', color: '#4d4741' }}
          >
            <span className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: '#f1e6d9', color: '#7c5633' }}>
              {issue.kind}
            </span>{' '}
            {issue.description}
          </div>
        ))}
      </div>
    </section>
  )
}

function FooterLinks() {
  return (
    <section className="mt-8 flex flex-wrap gap-3 text-sm" style={{ color: '#6f665e' }}>
      <Link className="underline underline-offset-4" href="/brain-v1" style={{ color: '#8b5e34' }}>
        Spec walkthrough
      </Link>
      <span>·</span>
      <span>
        cron routes: <code>/api/cron/roadmap</code>, <code>/api/cron/project-enrichment</code>,{' '}
        <code>/api/cron/impact-review</code>, <code>/api/cron/resolver-audit</code>
      </span>
    </section>
  )
}

function EmptyState({ reason }: { reason: 'no_projects' }) {
  return (
    <div className="mx-auto max-w-xl py-24 text-center">
      <h1 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>Project Brain — runtime</h1>
      <p className="mt-4 text-sm" style={{ color: '#6f665e' }}>
        {reason === 'no_projects'
          ? 'No projects are active on your account yet. Create one first.'
          : 'No data to show yet.'}
      </p>
      <div className="mt-6">
        <Link href="/" className="text-sm underline underline-offset-4" style={{ color: '#8b5e34' }}>
          Back to home
        </Link>
      </div>
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div
      className="rounded-2xl border px-4 py-3 text-sm"
      style={{ borderColor: '#efe4d7', backgroundColor: '#fff7ef', color: '#6f665e' }}
    >
      {text}
    </div>
  )
}

function runStatusColor(status: string): string {
  switch (status) {
    case 'completed': return '#2f6240'
    case 'running': return '#4c43b1'
    case 'failed': return '#a8552a'
    default: return '#8b5e34'
  }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diff) || diff < 0) return 'just now'
  const minutes = Math.round(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
