'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import type { RoadmapItemRow, RoadmapCategory } from '@/lib/types/database'

const categoryConfig: Record<RoadmapCategory, { bg: string; text: string; label: string }> = {
  bug: { bg: '#fef2f2', text: '#dc2626', label: 'Bug' },
  feature: { bg: '#eef2ff', text: '#6366f1', label: 'Feature' },
  improvement: { bg: '#fffbeb', text: '#d97706', label: 'Improvement' },
  infrastructure: { bg: '#f8fafc', text: '#475569', label: 'Infra' },
  retention: { bg: '#fdf4ff', text: '#a855f7', label: 'Retention' },
  revenue: { bg: '#f0fdf4', text: '#16a34a', label: 'Revenue' },
  reach: { bg: '#eff6ff', text: '#3b82f6', label: 'Reach' },
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 rounded-full overflow-hidden"
        style={{ backgroundColor: '#e8e4de' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: '#6366f1',
          }}
        />
      </div>
      <span className="text-xs tabular-nums" style={{ color: '#8b8680' }}>
        {pct}%
      </span>
    </div>
  )
}

export function BriefsCards({ items, roadmapCount }: { items: RoadmapItemRow[]; roadmapCount: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const slug = pathname.match(/^\/dashboard\/([^/]+)/)?.[1] || ''
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const isFull = roadmapCount >= 25

  const handlePromote = async (itemId: string) => {
    if (isFull) return
    setPromotingId(itemId)
    try {
      await fetch(`/api/roadmap/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'roadmap' }),
      })
      router.refresh()
    } catch {
      // Silently fail — user can retry
    }
    setPromotingId(null)
  }

  const handleArchive = async (itemId: string) => {
    setArchivingId(itemId)
    try {
      await fetch(`/api/roadmap/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      })
      router.refresh()
    } catch {
      // Silently fail — user can retry
    }
    setArchivingId(null)
  }

  const handleFeedback = async (itemId: string, direction: 'up' | 'down') => {
    const field = direction === 'up' ? 'feedback_up' : 'feedback_down'
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const current = direction === 'up' ? item.feedback_up : item.feedback_down
    await fetch(`/api/roadmap/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: current + 1 }),
    })
    router.refresh()
  }

  return (
    <div className="grid gap-4">
      {items.map(item => {
        const cat = categoryConfig[item.category] || categoryConfig.feature
        const created = new Date(item.created_at)
        const now = new Date()
        const diffHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60)
        const isNew = diffHours < 24
        const dateStr = created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const evidenceCount = item.evidence_trail?.length ?? 0
        const topEstimate = item.impact_estimates?.[0]

        return (
          <div
            key={item.id}
            className="rounded-xl border bg-white p-5 transition-colors hover:bg-[#faf8f5]/60 cursor-pointer"
            style={{ borderColor: '#e8e4de' }}
            onClick={() => router.push(`/dashboard/${slug}/roadmap/${item.id}`)}
          >
            {/* Header: title + category badge + NEW badge */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex-1 min-w-0">
                <Link
                  href={`/dashboard/${slug}/roadmap/${item.id}`}
                  className="text-base font-semibold no-underline hover:underline"
                  style={{ color: '#1a1a2e' }}
                >
                  {item.title}
                </Link>
                <p className="text-sm mt-1 line-clamp-3" style={{ color: '#8b8680' }}>
                  {item.description}
                </p>
              </div>
              <div className="flex gap-2 shrink-0 items-center">
                {isNew && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: '#eef2ff', color: '#6366f1' }}
                  >
                    NEW
                  </span>
                )}
                <span
                  className="text-xs font-semibold px-2 py-1 rounded-md"
                  style={{ backgroundColor: cat.bg, color: cat.text }}
                >
                  {cat.label}
                </span>
              </div>
            </div>

            {/* Metrics row: confidence bar + evidence + impact estimate + date */}
            <div className="flex flex-wrap items-center gap-4 text-xs mb-4" style={{ color: '#8b8680' }}>
              <ConfidenceBar value={item.confidence} />
              <span>{evidenceCount} signal{evidenceCount === 1 ? '' : 's'}</span>
              {topEstimate && (
                <span style={{ color: '#059669' }}>
                  {topEstimate.metric.replace(/_/g, ' ')}: {topEstimate.predicted}
                </span>
              )}
              <span className="ml-auto">{dateStr}</span>
            </div>

            {/* Actions row */}
            <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => handleFeedback(item.id, 'up')}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors hover:bg-green-50"
                style={{ borderColor: '#e8e4de', color: item.feedback_up > 0 ? '#059669' : '#8b8680' }}
              >
                <span style={{ fontSize: '14px' }}>+1</span>
                {item.feedback_up > 0 && <span>{item.feedback_up}</span>}
              </button>
              <button
                onClick={() => handleFeedback(item.id, 'down')}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors hover:bg-red-50"
                style={{ borderColor: '#e8e4de', color: item.feedback_down > 0 ? '#dc2626' : '#8b8680' }}
              >
                <span style={{ fontSize: '14px' }}>-1</span>
                {item.feedback_down > 0 && <span>{item.feedback_down}</span>}
              </button>

              <div className="flex-1" />

              <button
                onClick={() => handleArchive(item.id)}
                disabled={archivingId === item.id}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50"
                style={{ borderColor: '#e8e4de', color: '#8b8680' }}
              >
                {archivingId === item.id ? 'Archiving...' : 'Archive'}
              </button>

              <button
                onClick={() => handlePromote(item.id)}
                disabled={isFull || promotingId === item.id}
                title={isFull ? 'Roadmap full (25/25)' : 'Add to Roadmap'}
                className="text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: '#6366f1' }}
              >
                {promotingId === item.id ? 'Adding...' : 'Add to Roadmap'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
