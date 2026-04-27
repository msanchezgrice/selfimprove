'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

// Mirrors FOCUS_MODES in src/lib/brain/design.ts. Keep synced if that
// list ever changes — the API rejects any other value.
const FOCUS_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: '', label: 'Use current focus', description: 'Whatever current_focus is set to in the brain (auto-derived from anomalies).' },
  { value: 'conversion', label: 'Conversion', description: 'Improve visitor → signup → paid in the funnel.' },
  { value: 'retention', label: 'Retention', description: 'Increase repeat usage and habit formation after activation.' },
  { value: 'virality', label: 'Virality', description: 'Increase referral loops, sharing, and user-generated acquisition.' },
  { value: 'ux_quality', label: 'UX quality', description: 'Reduce friction, clarify flows, improve felt quality.' },
  { value: 'performance', label: 'Performance', description: 'Reduce latency, errors, and operational drag.' },
]

const CATEGORY_OPTIONS = ['bug', 'feature', 'improvement', 'infrastructure', 'retention', 'revenue', 'reach']

const CONFIDENCE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Any' },
  { value: 50, label: '50+' },
  { value: 70, label: '70+' },
  { value: 85, label: '85+' },
]

const COLUMN_HELP: Record<string, string> = {
  cluster: 'Opportunity cluster this brief belongs to. Click to filter the table to that cluster.',
  cluster_focus:
    'Cluster\u2019s focus-weighted score (0-100). How relevant the cluster is given the active focus mode.',
  conf: 'Model confidence (0-100) that the linked PRD will move the metric.',
  roi: 'Item ROI = impact / size. Higher = better leverage.',
  combined:
    'Final ranking score = 60% cluster focus + 40% item ROI. This is how the table is sorted.',
}

const REFRESH_HELP =
  'Run the full daily brain pipeline now: pull PostHog rollups → mint anomaly signals → synthesize new briefs (LLM) → cluster → recycle stale → rerank → backfill PRDs. ' +
  'This is the same pipeline that runs automatically every day at 7am UTC. Idempotent — safe to click any time.'

type RoadmapEntry = {
  id: string
  title: string
  category: string
  status: string
  stage: string
  confidence: number
  roi_score: number
  has_prd: boolean
  dismiss_reason: string | null
  cluster: {
    id: string
    slug: string
    primary_need: string
    theme: string | null
    evidence_strength: number
    confidence_score: number
    persisted_focus_score: number
  } | null
  cluster_focus_score: number
  combined_score: number
  reason: string | null
}

type RoadmapApiResponse = {
  project_id: string
  persisted_focus: string | null
  applied_focus: string | null
  filter: {
    focus?: string
    category?: string[]
    minConfidence?: number
    minClusterScore?: number
    clusterSlugs?: string[]
    status?: string[]
    limit: number
  }
  total: number
  items: RoadmapEntry[]
}

type BootstrapResponse = {
  project: { id: string; slug: string; name: string }
  steps: {
    dedupItems?: { total?: number; exactMerged?: number; cosineMerged?: number }
    rollup?: { anomaliesMinted?: number }
    coldStart?: { itemsLinked?: number; clustersCreated?: number }
    [key: string]: unknown
  }
  finalState: {
    roadmapCount: number
    clusterCount: number
    openAnomalies: number
    currentFocus: string | null
    lastSignalAt: string | null
  } | null
  durationMs: number
}

type Props = {
  projectId: string
  projectSlug: string
  initialData: RoadmapApiResponse
  unprocessedSignals: number
  lastRefreshedAt: string | null
}

export function RoadmapView({
  projectId,
  projectSlug,
  initialData,
  unprocessedSignals,
  lastRefreshedAt,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const [focus, setFocus] = useState<string>('')
  const [categories, setCategories] = useState<string[]>([])
  const [minConfidence, setMinConfidence] = useState<number>(0)
  const [stage, setStage] = useState<'roadmap' | 'brief' | 'both'>('roadmap')
  const [clusterSlug, setClusterSlug] = useState<string>('')
  const [showDismissed, setShowDismissed] = useState<boolean>(false)
  const [data, setData] = useState<RoadmapApiResponse>(initialData)
  const [loading, setLoading] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [bootstrapResult, setBootstrapResult] = useState<BootstrapResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clusterSlugs = useMemo(() => {
    const set = new Set<string>()
    for (const item of data.items) if (item.cluster) set.add(item.cluster.slug)
    return Array.from(set).sort()
  }, [data.items])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (focus) params.set('focus', focus)
      if (categories.length > 0) params.set('category', categories.join(','))
      if (minConfidence > 0) params.set('minConfidence', String(minConfidence))
      if (clusterSlug) params.set('clusterSlugs', clusterSlug)
      if (stage !== 'roadmap') params.set('stage', stage)
      if (showDismissed) {
        params.set('status', 'proposed,approved,building,dismissed')
      }
      params.set('limit', '100')
      const res = await fetch(`/api/projects/${projectId}/roadmap?${params.toString()}`)
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error ?? `HTTP ${res.status}`)
      }
      const json = (await res.json()) as RoadmapApiResponse
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roadmap')
    } finally {
      setLoading(false)
    }
  }, [projectId, focus, categories, minConfidence, clusterSlug, stage, showDismissed])

  useEffect(() => {
    if (
      focus === '' &&
      categories.length === 0 &&
      minConfidence === 0 &&
      !clusterSlug &&
      stage === 'roadmap' &&
      !showDismissed
    ) {
      // Showing initial canonical view; no need to refetch.
      return
    }
    refetch()
  }, [focus, categories, minConfidence, clusterSlug, stage, showDismissed, refetch])

  const handleBootstrap = useCallback(async () => {
    setBootstrapping(true)
    setBootstrapResult(null)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/bootstrap-brain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      setBootstrapResult(json as BootstrapResponse)
      // Refetch with current filters to show the new state.
      await refetch()
      // Also refresh server components on the page (counts, focus headers, etc.).
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bootstrap failed')
    } finally {
      setBootstrapping(false)
    }
  }, [projectId, refetch, router])

  const toggleCategory = (cat: string) => {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]))
  }

  const isFiltered =
    focus !== '' ||
    categories.length > 0 ||
    minConfidence > 0 ||
    clusterSlug !== '' ||
    stage !== 'roadmap' ||
    showDismissed

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#1a1a2e' }}>
            Roadmap
          </h1>
          <p className="text-sm" style={{ color: '#8b8680' }}>
            {data.total} item{data.total === 1 ? '' : 's'} · focus:{' '}
            <span
              className="font-medium"
              style={{ color: '#1a1a2e' }}
              title="The brain&rsquo;s current focus mode. Auto-derived from open funnel anomalies. Drives cluster scoring."
            >
              {data.applied_focus ?? 'none'}
            </span>
            {data.applied_focus && data.persisted_focus && data.applied_focus !== data.persisted_focus && (
              <span style={{ color: '#d97706' }}> (filter override · saved: {data.persisted_focus})</span>
            )}
            {' · '}
            <span title="When the brain last ingested data for this project. The pipeline runs automatically every day at 7am UTC.">
              refreshed {formatRelativeTime(lastRefreshedAt)}
            </span>
            {unprocessedSignals > 0 && (
              <>
                {' · '}
                <span
                  style={{ color: '#059669' }}
                  title="Signals captured since the last refresh. They\u2019ll be processed on the next run."
                >
                  {unprocessedSignals} new signal{unprocessedSignals === 1 ? '' : 's'} pending
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs" style={{ color: '#dc2626' }}>
              {error}
            </span>
          )}
          <button
            type="button"
            onClick={handleBootstrap}
            disabled={bootstrapping}
            title={REFRESH_HELP}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#6366f1' }}
          >
            {bootstrapping ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
      </div>

      {bootstrapResult && bootstrapResult.finalState && (
        <div
          className="mb-4 rounded-lg border p-3 text-xs"
          style={{ borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', color: '#166534' }}
        >
          Refreshed in {(bootstrapResult.durationMs / 1000).toFixed(1)}s ·{' '}
          <strong>{bootstrapResult.finalState.roadmapCount}</strong> roadmap items ·{' '}
          <strong>{bootstrapResult.finalState.clusterCount}</strong> active clusters ·{' '}
          <strong>{bootstrapResult.finalState.openAnomalies}</strong> open anomalies · focus:{' '}
          <strong>{bootstrapResult.finalState.currentFocus ?? 'none'}</strong>
          {(bootstrapResult.steps.dedupItems?.total ?? 0) > 0 && (
            <>
              {' \u00b7 '}
              <strong>{bootstrapResult.steps.dedupItems!.total}</strong> dupes merged
            </>
          )}
          {(bootstrapResult.steps.rollup?.anomaliesMinted ?? 0) > 0 && (
            <>
              {' \u00b7 '}
              <strong>+{bootstrapResult.steps.rollup!.anomaliesMinted}</strong> new anomaly signals
            </>
          )}
        </div>
      )}

      <div
        className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-3"
        style={{ borderColor: '#e5e1d8', backgroundColor: '#fafaf7' }}
      >
        <FilterLabel
          help="Strategic lens that REWEIGHTS scores (e.g. retention boosts retention-themed clusters). Different from category, which only filters which items appear."
        >
          Focus
        </FilterLabel>
        <select
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          className="rounded-md border bg-white px-2 py-1 text-xs"
          style={{ borderColor: '#e5e1d8', color: '#1a1a2e' }}
          title={
            FOCUS_OPTIONS.find((o) => o.value === focus)?.description ??
            'Pick a focus to override the brain&rsquo;s current_focus.'
          }
        >
          {FOCUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} title={opt.description}>
              {opt.label}
            </option>
          ))}
        </select>

        <FilterLabel help="Type of work. Filters which items show but does NOT change scores. Multi-select.">
          Categories
        </FilterLabel>
        <div className="flex flex-wrap gap-1">
          {CATEGORY_OPTIONS.map((cat) => {
            const active = categories.includes(cat)
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className="rounded-full border px-2 py-0.5 text-xs"
                style={{
                  borderColor: active ? '#1a1a2e' : '#e5e1d8',
                  backgroundColor: active ? '#1a1a2e' : 'white',
                  color: active ? 'white' : '#1a1a2e',
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>

        <FilterLabel help="Minimum model confidence (0-100) for items to appear.">Confidence</FilterLabel>
        <select
          value={minConfidence}
          onChange={(e) => setMinConfidence(Number.parseInt(e.target.value, 10))}
          className="rounded-md border bg-white px-2 py-1 text-xs"
          style={{ borderColor: '#e5e1d8', color: '#1a1a2e' }}
        >
          {CONFIDENCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <FilterLabel help="Roadmap = promoted items the team is reviewing. Briefs = the long backlog. Both = combined.">
          Stage
        </FilterLabel>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value as 'roadmap' | 'brief' | 'both')}
          className="rounded-md border bg-white px-2 py-1 text-xs"
          style={{ borderColor: '#e5e1d8', color: '#1a1a2e' }}
        >
          <option value="roadmap">Roadmap</option>
          <option value="brief">Briefs</option>
          <option value="both">Both</option>
        </select>

        {clusterSlugs.length > 0 && (
          <>
            <FilterLabel help="Show only items in one opportunity cluster. Set automatically when you click a cluster cell.">
              Cluster
            </FilterLabel>
            <select
              value={clusterSlug}
              onChange={(e) => setClusterSlug(e.target.value)}
              className="rounded-md border bg-white px-2 py-1 text-xs"
              style={{ borderColor: '#e5e1d8', color: '#1a1a2e' }}
            >
              <option value="">All</option>
              {clusterSlugs.map((slug) => (
                <option key={slug} value={slug}>
                  {slug}
                </option>
              ))}
            </select>
          </>
        )}

        <label
          className="ml-2 flex cursor-pointer items-center gap-1 text-xs"
          style={{ color: '#8b8680' }}
          title="Show dismissed items \u2014 useful to audit auto-merged duplicates and stale items recycled by the daily pipeline."
        >
          <input
            type="checkbox"
            checked={showDismissed}
            onChange={(e) => setShowDismissed(e.target.checked)}
            className="h-3 w-3"
          />
          Show dismissed
        </label>

        {isFiltered && (
          <button
            type="button"
            onClick={() => {
              setFocus('')
              setCategories([])
              setMinConfidence(0)
              setClusterSlug('')
              setStage('roadmap')
              setShowDismissed(false)
            }}
            className="ml-auto rounded-md border px-2 py-1 text-xs"
            style={{ borderColor: '#e5e1d8', color: '#8b8680', backgroundColor: 'white' }}
          >
            Clear
          </button>
        )}
      </div>

      {data.items.length === 0 ? (
        <div
          className="rounded-lg border p-8 text-center"
          style={{ borderColor: '#e5e1d8', backgroundColor: 'white', color: '#8b8680' }}
        >
          {loading
            ? 'Loading…'
            : isFiltered
              ? 'No items match these filters.'
              : 'No roadmap items yet. Click "Rebuild brain" to bootstrap from existing signals and briefs.'}
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-lg border"
          style={{ borderColor: '#e5e1d8', backgroundColor: 'white' }}
        >
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: '#fafaf7', color: '#8b8680' }}>
              <tr className="text-left text-xs uppercase tracking-wide">
                <th className="w-12 px-3 py-2">#</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2" title={COLUMN_HELP.cluster}>
                  Cluster
                </th>
                <th
                  className="px-3 py-2 text-right"
                  title={COLUMN_HELP.cluster_focus}
                >
                  Cluster focus
                </th>
                <th className="px-3 py-2 text-right" title={COLUMN_HELP.conf}>
                  Conf
                </th>
                <th className="px-3 py-2 text-right" title={COLUMN_HELP.roi}>
                  ROI
                </th>
                <th
                  className="px-3 py-2 text-right"
                  title={COLUMN_HELP.combined}
                >
                  Combined
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => {
                const itemHref = `${pathname}/${item.id}`
                const isDismissed = item.status === 'dismissed'
                return (
                  <tr
                    key={item.id}
                    className="cursor-pointer border-t transition-colors hover:bg-[#fafaf7]"
                    style={{
                      borderColor: '#f3efe6',
                      color: isDismissed ? '#8b8680' : '#1a1a2e',
                      opacity: isDismissed ? 0.6 : 1,
                    }}
                    onClick={(e) => {
                      // Don't navigate if user clicked a control inside the row.
                      if ((e.target as HTMLElement).closest('button, a')) return
                      router.push(itemHref)
                    }}
                  >
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: '#8b8680' }}>
                      {index + 1}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={itemHref}
                        className="hover:underline"
                        style={{
                          color: isDismissed ? '#8b8680' : '#1a1a2e',
                          textDecoration: isDismissed ? 'line-through' : 'none',
                        }}
                      >
                        {item.title}
                      </Link>
                      {isDismissed ? (
                        <span
                          className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                          style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}
                          title={item.dismiss_reason ?? 'dismissed'}
                        >
                          Dismissed
                        </span>
                      ) : (
                        <span
                          className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                          style={
                            item.has_prd
                              ? { backgroundColor: '#ecfdf5', color: '#059669' }
                              : { backgroundColor: '#f5f0eb', color: '#8b8680' }
                          }
                          title={
                            item.has_prd
                              ? 'PRD generated. Click the row to read the spec.'
                              : 'Brief only \u2014 PRD will auto-generate when you open this item for the first time.'
                          }
                        >
                          {item.has_prd ? 'PRD' : 'Brief'}
                        </span>
                      )}
                      {(item.dismiss_reason || item.reason) && (
                        <div className="text-xs" style={{ color: '#8b8680' }}>
                          {item.dismiss_reason ?? item.reason}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ backgroundColor: '#f5f0eb', color: '#8b8680' }}
                      >
                        {item.category}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {item.cluster ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setClusterSlug(item.cluster!.slug)}
                            className="text-left hover:underline"
                            style={{ color: '#6366f1' }}
                            title={`Filter table to cluster: ${item.cluster.primary_need}/${item.cluster.theme ?? 'general'}`}
                          >
                            {item.cluster.slug}
                          </button>
                          <Link
                            href={`/dashboard/${projectSlug}/clusters/${item.cluster.slug}`}
                            className="text-[10px] hover:underline"
                            style={{ color: '#8b8680' }}
                            title="Open cluster detail page (brief, evidence, all linked items)"
                          >
                            ↗
                          </Link>
                        </span>
                      ) : (
                        <span
                          className="text-xs"
                          style={{ color: '#8b8680' }}
                          title="No cluster assigned. Will be filed when the next bootstrap or rollup runs."
                        >
                          unfiled
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {Math.round(item.cluster_focus_score)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{item.confidence}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{item.roi_score}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                      {item.combined_score.toFixed(1)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return 'never'
  if (ms < 60_000) return 'just now'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

function FilterLabel({ children, help }: { children: React.ReactNode; help?: string }) {
  return (
    <span
      className="text-xs uppercase tracking-wide"
      style={{ color: '#8b8680' }}
      title={help}
    >
      {children}
      {help && (
        <span aria-hidden className="ml-1 text-[10px]" style={{ color: '#bdb9b1' }}>
          ?
        </span>
      )}
    </span>
  )
}
