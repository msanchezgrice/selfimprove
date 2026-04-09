'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { RoadmapItemRow } from '@/lib/types/database'

const categoryConfig: Record<string, { bg: string; text: string; label: string }> = {
  bug: { bg: '#fef2f2', text: '#dc2626', label: 'Bug' },
  feature: { bg: '#eef2ff', text: '#6366f1', label: 'Feature' },
  improvement: { bg: '#fffbeb', text: '#d97706', label: 'Improvement' },
  infrastructure: { bg: '#f8fafc', text: '#475569', label: 'Infra' },
  retention: { bg: '#fdf4ff', text: '#a855f7', label: 'Retention' },
  revenue: { bg: '#f0fdf4', text: '#16a34a', label: 'Revenue' },
  reach: { bg: '#eff6ff', text: '#3b82f6', label: 'Reach' },
}

const buildStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  approved: { label: 'Ready to build', color: '#6366f1', bg: '#eef2ff' },
  pr_creating: { label: 'Creating PR...', color: '#d97706', bg: '#fffbeb' },
  pr_created: { label: 'PR open', color: '#0891b2', bg: '#ecfeff' },
  merged: { label: 'Merged', color: '#059669', bg: '#ecfdf5' },
}

export function BuildingCards({ items }: { items: RoadmapItemRow[] }) {
  const pathname = usePathname()
  const slug = pathname.match(/^\/dashboard\/([^/]+)/)?.[1] || ''

  return (
    <div className="grid gap-4">
      {items.map(item => {
        const cat = categoryConfig[item.category] || categoryConfig.feature
        const buildStatus = buildStatusConfig[item.build_status || 'approved'] || buildStatusConfig.approved

        return (
          <div
            key={item.id}
            className="rounded-xl border bg-white p-5"
            style={{ borderColor: '#e8e4de' }}
          >
            {/* Header row: title + badges */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex-1">
                <Link
                  href={`/dashboard/${slug}/roadmap/${item.id}`}
                  className="text-base font-semibold no-underline hover:underline"
                  style={{ color: '#1a1a2e' }}
                >
                  {item.title}
                </Link>
                <p className="text-sm mt-1 line-clamp-2" style={{ color: '#8b8680' }}>
                  {item.description}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <span
                  className="text-xs font-semibold px-2 py-1 rounded-md"
                  style={{ backgroundColor: cat.bg, color: cat.text }}
                >
                  {cat.label}
                </span>
                <span
                  className="text-xs font-semibold px-2 py-1 rounded-md"
                  style={{ backgroundColor: buildStatus.bg, color: buildStatus.color }}
                >
                  {buildStatus.label}
                </span>
              </div>
            </div>

            {/* Metrics row */}
            <div className="flex gap-6 text-xs mb-4" style={{ color: '#8b8680' }}>
              <span>Impact: <strong style={{ color: '#1a1a2e' }}>{item.impact}/10</strong></span>
              <span>Size: <strong style={{ color: '#1a1a2e' }}>{item.size}/10</strong></span>
              <span>ROI: <strong style={{ color: item.roi_score >= 7 ? '#059669' : item.roi_score >= 4 ? '#d97706' : '#8b8680' }}>{item.roi_score.toFixed(1)}</strong></span>
              <span>Confidence: <strong style={{ color: '#1a1a2e' }}>{item.confidence}%</strong></span>
            </div>

            {/* Links row: GitHub issue + PR */}
            <div className="flex gap-3 items-center flex-wrap">
              {item.github_issue_url && (
                <a
                  href={item.github_issue_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border no-underline transition-colors hover:bg-gray-50"
                  style={{ borderColor: '#e8e4de', color: '#1a1a2e' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  Issue #{item.github_issue_number}
                </a>
              )}
              {item.pr_url && (
                <a
                  href={item.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border no-underline transition-colors hover:bg-gray-50"
                  style={{ borderColor: '#e8e4de', color: '#0891b2' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="18" r="3" />
                    <circle cx="6" cy="6" r="3" />
                    <path d="M13 6h3a2 2 0 012 2v7" />
                    <line x1="6" y1="9" x2="6" y2="21" />
                  </svg>
                  PR #{item.pr_number}
                </a>
              )}
              {!item.github_issue_url && !item.pr_url && (
                <span className="text-xs" style={{ color: '#8b8680' }}>No GitHub links yet</span>
              )}

              {/* PRD link */}
              <Link
                href={`/dashboard/${slug}/roadmap/${item.id}`}
                className="ml-auto text-xs font-medium no-underline"
                style={{ color: '#6366f1' }}
              >
                View PRD →
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
