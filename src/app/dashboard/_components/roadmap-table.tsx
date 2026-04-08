'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { RoadmapItemRow, RoadmapCategory, RoadmapScope } from '@/lib/types/database'

type RoadmapTableProps = {
  items: RoadmapItemRow[]
}

const categoryConfig: Record<RoadmapCategory, { bg: string; text: string; label: string }> = {
  bug: { bg: '#fef2f2', text: '#dc2626', label: 'Bug' },
  feature: { bg: '#eef2ff', text: '#6366f1', label: 'Feature' },
  improvement: { bg: '#fffbeb', text: '#d97706', label: 'Improvement' },
  infrastructure: { bg: '#f8fafc', text: '#475569', label: 'Infra' },
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

/* ---------- Desktop table ---------- */

function DesktopTable({ items }: RoadmapTableProps) {
  const router = useRouter()

  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-sm" style={{ color: '#1a1a2e' }}>
        <thead>
          <tr
            className="sticky top-0 z-10 text-left text-xs font-medium"
            style={{ backgroundColor: '#faf8f5', color: '#8b8680' }}
          >
            <th className="px-3 py-3 w-10">#</th>
            <th className="px-3 py-3 min-w-[180px]">Item</th>
            <th className="px-3 py-3">Category</th>
            <th className="hidden lg:table-cell px-3 py-3">Origin</th>
            <th className="px-3 py-3">Confidence</th>
            <th className="hidden lg:table-cell px-3 py-3">Scope</th>
            <th className="hidden lg:table-cell px-3 py-3">Strategy</th>
            <th className="hidden lg:table-cell px-3 py-3 text-right">Impact</th>
            <th className="hidden lg:table-cell px-3 py-3">Upside</th>
            <th className="hidden lg:table-cell px-3 py-3 text-right">Size</th>
            <th className="px-3 py-3 text-right">ROI</th>
            <th className="px-3 py-3 w-10" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const cat = categoryConfig[item.category]
            const scope = scopeConfig[item.scope]

            return (
              <tr
                key={item.id}
                onClick={() => router.push(`/dashboard/roadmap/${item.id}`)}
                className="border-t cursor-pointer transition-colors duration-100 hover:bg-[#faf8f5]/60"
                style={{ borderColor: '#e8e4de' }}
              >
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
                <td className="hidden lg:table-cell px-3 py-3 text-xs max-w-[120px]" style={{ color: '#8b8680' }}>
                  {truncate(item.upside, 32)}
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
                <td className="px-3 py-3 text-right">
                  <Link
                    href={`/dashboard/roadmap/${item.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm transition-colors hover:opacity-70"
                    style={{ color: '#6366f1' }}
                    aria-label={`View ${item.title}`}
                  >
                    &rarr;
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

function MobileCards({ items }: RoadmapTableProps) {
  return (
    <div className="md:hidden space-y-3">
      {items.map((item) => {
        const cat = categoryConfig[item.category]

        return (
          <Link
            key={item.id}
            href={`/dashboard/roadmap/${item.id}`}
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
  return (
    <div
      className="rounded-xl border bg-white overflow-hidden"
      style={{ borderColor: '#e8e4de' }}
    >
      <DesktopTable items={items} />
      <MobileCards items={items} />
    </div>
  )
}
