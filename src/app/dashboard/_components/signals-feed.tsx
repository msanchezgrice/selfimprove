'use client'

import { useState } from 'react'
import type { SignalRow, SignalType } from '@/lib/types/database'

type SignalsFeedProps = {
  signals: SignalRow[]
}

const filterTabs: { key: SignalType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'voice', label: 'Voice' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'error', label: 'Errors' },
  { key: 'builder', label: 'Builder' },
]

const typeBadgeConfig: Record<SignalType, { bg: string; text: string; label: string }> = {
  voice: { bg: '#f5f3ff', text: '#7c3aed', label: 'Voice' },
  feedback: { bg: '#eef2ff', text: '#6366f1', label: 'Feedback' },
  analytics: { bg: '#ecfeff', text: '#0891b2', label: 'Analytics' },
  error: { bg: '#fef2f2', text: '#dc2626', label: 'Error' },
  builder: { bg: '#ecfdf5', text: '#059669', label: 'Builder' },
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(date).toLocaleDateString()
}

function weightDotSize(weight: number): number {
  if (weight >= 8) return 10
  if (weight >= 5) return 8
  if (weight >= 3) return 6
  return 4
}

export function SignalsFeed({ signals }: SignalsFeedProps) {
  const [activeFilter, setActiveFilter] = useState<SignalType | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered =
    activeFilter === 'all'
      ? signals
      : signals.filter((s) => s.type === activeFilter)

  return (
    <div>
      {/* Filter bar */}
      <div
        className="flex gap-1 mb-4 overflow-x-auto pb-1"
      >
        {filterTabs.map((tab) => {
          const isActive = activeFilter === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer"
              style={{
                backgroundColor: isActive ? '#6366f1' : 'transparent',
                color: isActive ? '#ffffff' : '#8b8680',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Signal list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div
            className="rounded-xl border bg-white px-6 py-12 text-center"
            style={{ borderColor: '#e8e4de' }}
          >
            <p className="text-sm" style={{ color: '#8b8680' }}>
              No signals match this filter.
            </p>
          </div>
        ) : (
          filtered.map((signal) => {
            const badge = typeBadgeConfig[signal.type]
            const meta = signal.metadata as Record<string, unknown>
            const pageUrl = typeof meta?.page_url === 'string' ? meta.page_url : null
            const tags = Array.isArray(meta?.tags) ? (meta.tags as string[]) : []
            const dotSize = weightDotSize(signal.weight)

            const isExpanded = expandedId === signal.id

            return (
              <div
                key={signal.id}
                className="rounded-xl border bg-white p-4 transition-colors duration-100 hover:bg-[#faf8f5]/60 cursor-pointer"
                style={{ borderColor: '#e8e4de' }}
                onClick={() => setExpandedId(isExpanded ? null : signal.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Type badge */}
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0"
                      style={{ backgroundColor: badge.bg, color: badge.text }}
                    >
                      {badge.label}
                    </span>
                    {/* Title */}
                    {signal.title && (
                      <span
                        className="text-sm font-semibold truncate"
                        style={{ color: '#1a1a2e' }}
                      >
                        {signal.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Weight dot */}
                    <span
                      className="rounded-full shrink-0"
                      style={{
                        width: dotSize,
                        height: dotSize,
                        backgroundColor: '#6366f1',
                        opacity: 0.5 + (signal.weight / 10) * 0.5,
                      }}
                      title={`Weight: ${signal.weight}`}
                    />
                    {/* Expand indicator */}
                    <span className="text-xs" style={{ color: '#8b8680' }}>
                      {isExpanded ? '\u25B2' : '\u25BC'}
                    </span>
                    {/* Timestamp */}
                    <span className="text-xs whitespace-nowrap" style={{ color: '#8b8680' }}>
                      {timeAgo(signal.created_at)}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={isExpanded ? {
                    color: '#1a1a2e',
                  } : {
                    color: '#1a1a2e',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {signal.type === 'feedback' ? `\u201C${signal.content}\u201D` : signal.content}
                </p>

                {/* Metadata row (always visible) */}
                {(pageUrl || tags.length > 0) && (
                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                    {pageUrl && (
                      <a
                        href={pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs truncate max-w-[240px] transition-colors hover:underline"
                        style={{ color: '#8b8680' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {pageUrl.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium"
                        style={{ backgroundColor: '#f5f3ff', color: '#7c3aed' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: '#e8e4de' }}>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(meta).map(([key, value]) => (
                        value != null && (
                          <div key={key}>
                            <span className="text-xs font-medium uppercase" style={{ color: '#8b8680' }}>{key.replace(/_/g, ' ')}</span>
                            <p className="text-xs break-all" style={{ color: '#1a1a2e' }}>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>
                          </div>
                        )
                      ))}
                    </div>
                    <div className="flex gap-4 mt-2 text-xs" style={{ color: '#8b8680' }}>
                      <span>Weight: {signal.weight}</span>
                      <span>Processed: {signal.processed ? 'Yes' : 'No'}</span>
                      <span>Created: {new Date(signal.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
