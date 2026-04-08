import type { SignalRow } from '@/lib/types/database'
import { SIGNAL_WEIGHTS } from '@/lib/constants/signal-weights'

export interface SignalGroup {
  type: string
  count: number
  totalWeight: number
  signals: Array<{
    title: string | null
    content: string
    metadata: Record<string, unknown>
    weight: number
  }>
}

export interface SignalSummary {
  totalSignals: number
  totalWeight: number
  groups: SignalGroup[]
  topPages: Array<{ url: string; count: number }>
  topTags: Array<{ tag: string; count: number }>
  timeRange: { earliest: string; latest: string }
}

export function summarizeSignals(signals: SignalRow[]): SignalSummary {
  if (signals.length === 0) {
    return {
      totalSignals: 0,
      totalWeight: 0,
      groups: [],
      topPages: [],
      topTags: [],
      timeRange: { earliest: '', latest: '' },
    }
  }

  // Group by type
  const byType = new Map<string, SignalRow[]>()
  for (const signal of signals) {
    const existing = byType.get(signal.type) || []
    existing.push(signal)
    byType.set(signal.type, existing)
  }

  const groups: SignalGroup[] = []
  let totalWeight = 0

  for (const [type, typeSignals] of byType) {
    const weight = SIGNAL_WEIGHTS[type] ?? 1
    const groupWeight = typeSignals.length * weight
    totalWeight += groupWeight

    groups.push({
      type,
      count: typeSignals.length,
      totalWeight: groupWeight,
      signals: typeSignals.map((s) => ({
        title: s.title,
        content: s.content,
        metadata: s.metadata,
        weight,
      })),
    })
  }

  // Sort groups by total weight descending (most important first)
  groups.sort((a, b) => b.totalWeight - a.totalWeight)

  // Extract top pages from metadata
  const pageCounts = new Map<string, number>()
  for (const signal of signals) {
    const url = signal.metadata?.page_url as string | undefined
    if (url) {
      pageCounts.set(url, (pageCounts.get(url) || 0) + 1)
    }
  }
  const topPages = [...pageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([url, count]) => ({ url, count }))

  // Extract top tags from metadata
  const tagCounts = new Map<string, number>()
  for (const signal of signals) {
    const tags = signal.metadata?.tags as string[] | undefined
    if (tags) {
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      }
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }))

  // Time range
  const timestamps = signals.map((s) => s.created_at).sort()

  return {
    totalSignals: signals.length,
    totalWeight,
    groups,
    topPages,
    topTags,
    timeRange: {
      earliest: timestamps[0],
      latest: timestamps[timestamps.length - 1],
    },
  }
}

// Format the summary as a human-readable string for Claude's prompt
export function formatSummaryForPrompt(summary: SignalSummary): string {
  const lines: string[] = []

  lines.push(
    `## Signal Summary (${summary.totalSignals} signals, weighted score: ${summary.totalWeight})`
  )
  lines.push(
    `Time range: ${summary.timeRange.earliest} to ${summary.timeRange.latest}`
  )
  lines.push('')

  for (const group of summary.groups) {
    lines.push(
      `### ${group.type.toUpperCase()} (${group.count} signals, weight: ${group.totalWeight})`
    )
    // Include up to 20 signals per group to keep prompt manageable
    const displaySignals = group.signals.slice(0, 20)
    for (const signal of displaySignals) {
      const title = signal.title ? `**${signal.title}**: ` : ''
      const content =
        signal.content.length > 300
          ? signal.content.slice(0, 300) + '...'
          : signal.content
      lines.push(`- ${title}${content}`)
    }
    if (group.signals.length > 20) {
      lines.push(`- ... and ${group.signals.length - 20} more`)
    }
    lines.push('')
  }

  if (summary.topPages.length > 0) {
    lines.push('### Top Pages')
    for (const page of summary.topPages) {
      lines.push(`- ${page.url} (${page.count} signals)`)
    }
    lines.push('')
  }

  if (summary.topTags.length > 0) {
    lines.push('### Top Tags')
    for (const tag of summary.topTags) {
      lines.push(`- ${tag.tag} (${tag.count})`)
    }
  }

  return lines.join('\n')
}
