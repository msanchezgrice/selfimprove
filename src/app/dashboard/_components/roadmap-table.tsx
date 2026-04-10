'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import type { RoadmapItemRow, RoadmapCategory, RoadmapScope } from '@/lib/types/database'

type RoadmapTableProps = {
  items: RoadmapItemRow[]
}

const categoryConfig: Record<RoadmapCategory, { bg: string; text: string; label: string }> = {
  bug: { bg: '#fef2f2', text: '#dc2626', label: 'Bug' },
  feature: { bg: '#eef2ff', text: '#6366f1', label: 'Feature' },
  improvement: { bg: '#fffbeb', text: '#d97706', label: 'Improvement' },
  infrastructure: { bg: '#f8fafc', text: '#475569', label: 'Infra' },
  retention: { bg: '#fdf4ff', text: '#a855f7', label: 'Retention' },
  revenue: { bg: '#f0fdf4', text: '#16a34a', label: 'Revenue' },
  reach: { bg: '#eff6ff', text: '#3b82f6', label: 'Reach' },
}

const scopeConfig: Record<RoadmapScope, { bg: string; text: string; label: string }> = {
  small: { bg: '#f0fdf4', text: '#16a34a', label: 'S' },
  medium: { bg: '#fffbeb', text: '#d97706', label: 'M' },
  large: { bg: '#fef2f2', text: '#dc2626', label: 'L' },
}

function roiColor(score: number): string {
  if (score >= 7) return '#16a34a'
  if (score >= 4) return '#d97706'
  return '#dc2626'
}

function roiBg(score: number): string {
  if (score >= 7) return '#f0fdf4'
  if (score >= 4) return '#fffbeb'
  return '#fef2f2'
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '\u2026'
}

/* ---------- Badge ---------- */

function Badge({ bg, text, label }: { bg: string; text: string; label: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  )
}

/* ---------- Confidence bar ---------- */

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

/* ---------- Sort indicator ---------- */

function SortIndicator({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: 'asc' | 'desc' }) {
  if (sortField !== field) return <span className="ml-1 opacity-0 group-hover:opacity-40">&#9650;</span>
  return <span className="ml-1">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
}

/* ---------- Desktop table ---------- */

function DesktopTable({ items, onReorder, sortField, sortDir, onSort, slug }: RoadmapTableProps & {
  onReorder?: (fromIndex: number, toIndex: number) => void
  sortField: string
  sortDir: 'asc' | 'desc'
  onSort: (field: string) => void
  slug: string
}) {
  const router = useRouter()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const thClass = "px-3 py-3 cursor-pointer select-none group transition-colors hover:text-gray-700"

  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-sm" style={{ color: '#1a1a2e' }}>
        <thead>
          <tr
            className="sticky top-0 z-10 text-left text-xs font-medium"
            style={{ backgroundColor: '#faf8f5', color: '#8b8680' }}
          >
            <th className="px-3 py-3 w-8" />
            <th className={`${thClass} w-10`} onClick={() => onSort('rank')}>#<SortIndicator field="rank" sortField={sortField} sortDir={sortDir} /></th>
            <th className={`${thClass} min-w-[180px]`} onClick={() => onSort('title')}>Item<SortIndicator field="title" sortField={sortField} sortDir={sortDir} /></th>
            <th className={thClass} onClick={() => onSort('category')}>Category<SortIndicator field="category" sortField={sortField} sortDir={sortDir} /></th>
            <th className={`hidden lg:table-cell ${thClass}`} onClick={() => onSort('origin')}>Origin<SortIndicator field="origin" sortField={sortField} sortDir={sortDir} /></th>
            <th className={thClass} onClick={() => onSort('confidence')}>Confidence<SortIndicator field="confidence" sortField={sortField} sortDir={sortDir} /></th>
            <th className={`hidden lg:table-cell ${thClass}`} onClick={() => onSort('scope')}>Scope<SortIndicator field="scope" sortField={sortField} sortDir={sortDir} /></th>
            <th className={`hidden lg:table-cell ${thClass}`} onClick={() => onSort('strategy')}>Strategy<SortIndicator field="strategy" sortField={sortField} sortDir={sortDir} /></th>
            <th className={`hidden lg:table-cell ${thClass} text-right`} onClick={() => onSort('impact')}>Impact<SortIndicator field="impact" sortField={sortField} sortDir={sortDir} /></th>
            <th className={`hidden lg:table-cell ${thClass}`} onClick={() => onSort('upside')}>Upside<SortIndicator field="upside" sortField={sortField} sortDir={sortDir} /></th>
            <th className={`hidden lg:table-cell ${thClass} text-right`} onClick={() => onSort('size')}>Size<SortIndicator field="size" sortField={sortField} sortDir={sortDir} /></th>
            <th className={`${thClass} text-right`} onClick={() => onSort('roi_score')}>ROI<SortIndicator field="roi_score" sortField={sortField} sortDir={sortDir} /></th>
            <th className={`hidden lg:table-cell ${thClass}`} onClick={() => onSort('created_at')}>Created<SortIndicator field="created_at" sortField={sortField} sortDir={sortDir} /></th>
            <th className="px-3 py-3 w-10" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const cat = categoryConfig[item.category]
            const scope = scopeConfig[item.scope]

            return (
              <tr
                key={item.id}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverIndex(index)
                }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={() => {
                  if (dragIndex !== null && dragIndex !== index) {
                    onReorder?.(dragIndex, index)
                  }
                  setDragIndex(null)
                  setDragOverIndex(null)
                }}
                onClick={() => router.push(`/dashboard/${slug}/roadmap/${item.id}`)}
                className={`border-t cursor-pointer transition-all duration-150 hover:bg-[#faf8f5]/60${dragIndex === index ? ' opacity-40 scale-[0.98]' : ''}${dragOverIndex === index && dragIndex !== index ? ' border-t-2 border-t-indigo-400' : ''}`}
                style={{ borderColor: dragOverIndex === index && dragIndex !== index ? undefined : '#e8e4de' }}
              >
                <td
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(index)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {
                    setDragIndex(null)
                    setDragOverIndex(null)
                  }}
                  className="px-2 py-3 cursor-grab active:cursor-grabbing"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#8b8680"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <circle cx="9" cy="5" r="1" fill="#8b8680" />
                    <circle cx="15" cy="5" r="1" fill="#8b8680" />
                    <circle cx="9" cy="12" r="1" fill="#8b8680" />
                    <circle cx="15" cy="12" r="1" fill="#8b8680" />
                    <circle cx="9" cy="19" r="1" fill="#8b8680" />
                    <circle cx="15" cy="19" r="1" fill="#8b8680" />
                  </svg>
                </td>
                <td className="px-3 py-3 tabular-nums" style={{ color: '#8b8680' }}>
                  {item.rank}
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium leading-snug" style={{ color: '#1a1a2e' }}>
                    {item.title}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed" style={{ color: '#8b8680' }}>
                    {truncate(item.description, 80)}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <Badge bg={cat.bg} text={cat.text} label={cat.label} />
                </td>
                <td className="hidden lg:table-cell px-3 py-3 text-xs" style={{ color: '#8b8680' }}>
                  {truncate(item.origin, 24)}
                </td>
                <td className="px-3 py-3">
                  <ConfidenceBar value={item.confidence} />
                </td>
                <td className="hidden lg:table-cell px-3 py-3">
                  <Badge bg={scope.bg} text={scope.text} label={scope.label} />
                </td>
                <td className="hidden lg:table-cell px-3 py-3 text-xs max-w-[120px]" style={{ color: '#8b8680' }}>
                  {truncate(item.strategy, 32)}
                </td>
                <td className="hidden lg:table-cell px-3 py-3 text-right tabular-nums font-medium">
                  {item.impact}/10
                </td>
                <td className="hidden lg:table-cell px-3 py-3">
                  {item.impact_estimates && (item.impact_estimates as unknown[]).length > 0 ? (
                    <div className="text-xs">
                      {(item.impact_estimates as Array<{metric: string; predicted: string}>).slice(0, 2).map((est, i) => (
                        <div key={i} className="truncate" style={{ color: '#059669', maxWidth: '120px' }}>
                          {est.metric.replace(/_/g, ' ')}: {est.predicted}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs truncate" style={{ color: '#8b8680', maxWidth: '100px', display: 'block' }}>
                      {item.upside?.slice(0, 40) || '\u2014'}
                    </span>
                  )}
                </td>
                <td className="hidden lg:table-cell px-3 py-3 text-right tabular-nums font-medium">
                  {item.size}/10
                </td>
                <td className="px-3 py-3 text-right">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums"
                    style={{
                      backgroundColor: roiBg(item.roi_score),
                      color: roiColor(item.roi_score),
                    }}
                  >
                    {item.roi_score.toFixed(1)}
                  </span>
                </td>
                <td className="hidden lg:table-cell px-3 py-3">
                  {(() => {
                    const created = new Date(item.created_at)
                    const now = new Date()
                    const diffHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60)
                    const isNew = diffHours < 24
                    const dateStr = created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    return (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs" style={{ color: '#8b8680' }}>{dateStr}</span>
                        {isNew && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#eef2ff', color: '#6366f1' }}>
                            NEW
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                <td className="px-3 py-3 text-right">
                  <Link
                    href={`/dashboard/${slug}/roadmap/${item.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-medium transition-colors hover:opacity-70"
                    style={{ color: '#6366f1' }}
                    aria-label={`View ${item.title}`}
                  >
                    Open
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- Mobile card view ---------- */

function MobileCards({ items, slug }: RoadmapTableProps & { slug: string }) {
  return (
    <div className="md:hidden space-y-3">
      {items.map((item) => {
        const cat = categoryConfig[item.category]

        return (
          <Link
            key={item.id}
            href={`/dashboard/${slug}/roadmap/${item.id}`}
            className="block rounded-xl border bg-white p-4 transition-colors duration-100 hover:bg-[#faf8f5]/60"
            style={{ borderColor: '#e8e4de' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: '#6366f1' }}
                >
                  {item.rank}
                </span>
                <span className="text-sm font-medium truncate" style={{ color: '#1a1a2e' }}>
                  {item.title}
                </span>
              </div>
              <span
                className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums"
                style={{
                  backgroundColor: roiBg(item.roi_score),
                  color: roiColor(item.roi_score),
                }}
              >
                {item.roi_score.toFixed(1)}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <Badge bg={cat.bg} text={cat.text} label={cat.label} />
              <ConfidenceBar value={item.confidence} />
            </div>

            <div className="mt-2 text-xs" style={{ color: '#8b8680' }}>
              {truncate(item.description, 100)}
            </div>
          </Link>
        )
      })}
    </div>
  )
}

/* ---------- Exported component ---------- */

export function RoadmapTable({ items }: RoadmapTableProps) {
  const router = useRouter()
  const pathname = usePathname()
  const slugMatch = pathname.match(/^\/dashboard\/([^/]+)/)
  const slug = slugMatch?.[1] || ''
  const [localItems, setLocalItems] = useState(items)
  const [sortField, setSortField] = useState<string>('rank')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sortedItems = [...localItems].sort((a, b) => {
    let aVal = a[sortField as keyof typeof a]
    let bVal = b[sortField as keyof typeof b]

    if (typeof aVal === 'string') aVal = aVal.toLowerCase()
    if (typeof bVal === 'string') bVal = bVal.toLowerCase()

    if (aVal == null && bVal == null) return 0
    if (aVal == null) return sortDir === 'asc' ? 1 : -1
    if (bVal == null) return sortDir === 'asc' ? -1 : 1

    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    const reordered = [...localItems]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)

    // Update local state immediately for responsiveness
    setLocalItems(reordered)

    // Persist new ranks to DB
    const supabase = createClient()
    await Promise.all(
      reordered.map((item, i) =>
        supabase
          .from('roadmap_items')
          .update({ rank: i + 1 })
          .eq('id', item.id)
      )
    )

    router.refresh()
  }

  return (
    <div
      className="rounded-xl border bg-white overflow-hidden"
      style={{ borderColor: '#e8e4de' }}
    >
      <DesktopTable
        items={sortedItems}
        onReorder={handleReorder}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        slug={slug}
      />
      <MobileCards items={sortedItems} slug={slug} />
    </div>
  )
}
