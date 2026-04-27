'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

const FOCUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Persisted focus' },
  { value: 'conversion', label: 'Conversion' },
  { value: 'reach', label: 'Reach' },
  { value: 'retention', label: 'Retention' },
  { value: 'monetization', label: 'Monetization' },
  { value: 'reliability', label: 'Reliability' },
  { value: 'ux_quality', label: 'UX quality' },
  { value: 'discovery', label: 'Discovery' },
]

const CATEGORY_OPTIONS = ['bug', 'feature', 'improvement', 'infrastructure', 'retention', 'revenue', 'reach']

const CONFIDENCE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Any' },
  { value: 50, label: '50+' },
  { value: 70, label: '70+' },
  { value: 85, label: '85+' },
]

type RoadmapEntry = {
  id: string
  title: string
  category: string
  status: string
  stage: string
  confidence: number
  roi_score: number
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
  steps: Record<string, unknown>
  finalState: {
    roadmapCount: number
    clusterCount: number
    openAnomalies: number
    currentFocus: string | null
  }
  durationMs: number
}

type Props = {
  projectId: string
  projectSlug: string
  initialData: RoadmapApiResponse
}

export function RoadmapView({ projectId, projectSlug, initialData }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const [focus, setFocus] = useState<string>('')
  const [categories, setCategories] = useState<string[]>([])
  const [minConfidence, setMinConfidence] = useState<number>(0)
  const [stage, setStage] = useState<'roadmap' | 'brief' | 'both'>('roadmap')
  const [clusterSlug, setClusterSlug] = useState<string>('')
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
      params.set('limit', '50')
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
  }, [projectId, focus, categories, minConfidence, clusterSlug, stage])

  useEffect(() => {
    if (focus === '' && categories.length === 0 && minConfidence === 0 && !clusterSlug && stage === 'roadmap') {
      // Showing initial canonical view; no need to refetch.
      return
    }
    refetch()
  }, [focus, categories, minConfidence, clusterSlug, stage, refetch])

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
    focus !== '' || categories.length > 0 || minConfidence > 0 || clusterSlug !== '' || stage !== 'roadmap'

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#1a1a2e' }}>
            Roadmap
          </h1>
          <p className="text-sm" style={{ color: '#8b8680' }}>
            {data.total} item{data.total === 1 ? '' : 's'} · applied focus:{' '}
            <span className="font-medium" style={{ color: '#1a1a2e' }}>
              {data.applied_focus ?? 'none'}
            </span>
            {data.applied_focus && data.persisted_focus && data.applied_focus !== data.persisted_focus && (
              <span style={{ color: '#d97706' }}> (override · persisted: {data.persisted_focus})</span>
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
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ borderColor: '#e5e1d8', color: '#1a1a2e', backgroundColor: 'white' }}
          >
            {bootstrapping ? 'Rebuilding…' : 'Rebuild brain'}
          </button>
        </div>
      </div>

      {bootstrapResult && (
        <div
          className="mb-4 rounded-lg border p-3 text-xs"
          style={{ borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', color: '#166534' }}
        >
          Bootstrap finished in {bootstrapResult.durationMs}ms ·{' '}
          <strong>{bootstrapResult.finalState.roadmapCount}</strong> roadmap items ·{' '}
          <strong>{bootstrapResult.finalState.clusterCount}</strong> active clusters ·{' '}
          <strong>{bootstrapResult.finalState.openAnomalies}</strong> open anomalies · current focus:{' '}
          <strong>{bootstrapResult.finalState.currentFocus ?? 'none'}</strong>
        </div>
      )}

      <div
        className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-3"
        style={{ borderColor: '#e5e1d8', backgroundColor: '#fafaf7' }}
      >
        <FilterLabel>Focus</FilterLabel>
        <select
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          className="rounded-md border bg-white px-2 py-1 text-xs"
          style={{ borderColor: '#e5e1d8', color: '#1a1a2e' }}
        >
          {FOCUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <FilterLabel>Categories</FilterLabel>
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

        <FilterLabel>Confidence</FilterLabel>
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

        <FilterLabel>Stage</FilterLabel>
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
            <FilterLabel>Cluster</FilterLabel>
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

        {isFiltered && (
          <button
            type="button"
            onClick={() => {
              setFocus('')
              setCategories([])
              setMinConfidence(0)
              setClusterSlug('')
              setStage('roadmap')
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
                <th className="px-3 py-2">Cluster</th>
                <th className="px-3 py-2 text-right">Cluster focus</th>
                <th className="px-3 py-2 text-right">Conf</th>
                <th className="px-3 py-2 text-right">ROI</th>
                <th className="px-3 py-2 text-right">Combined</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => (
                <tr
                  key={item.id}
                  className="border-t"
                  style={{ borderColor: '#f3efe6', color: '#1a1a2e' }}
                >
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: '#8b8680' }}>
                    {index + 1}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`${pathname}/${item.id}`}
                      className="hover:underline"
                      style={{ color: '#1a1a2e' }}
                    >
                      {item.title}
                    </Link>
                    {item.reason && (
                      <div className="text-xs" style={{ color: '#8b8680' }}>
                        {item.reason}
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
                      <Link
                        href={`/dashboard/${projectSlug}/clusters/${item.cluster.slug}`}
                        className="hover:underline"
                        style={{ color: '#6366f1' }}
                      >
                        {item.cluster.slug}
                      </Link>
                    ) : (
                      <span className="text-xs" style={{ color: '#8b8680' }}>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs uppercase tracking-wide" style={{ color: '#8b8680' }}>
      {children}
    </span>
  )
}
