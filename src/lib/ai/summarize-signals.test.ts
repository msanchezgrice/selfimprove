import { describe, it, expect } from 'vitest'
import type { SignalRow } from '@/lib/types/database'
import { SIGNAL_WEIGHTS } from '@/lib/constants/signal-weights'
import { summarizeSignals, formatSummaryForPrompt } from './summarize-signals'

function makeSignal(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: crypto.randomUUID(),
    project_id: 'proj-1',
    type: 'feedback',
    title: null,
    content: 'test content',
    metadata: {},
    source_user_hash: null,
    dedup_group_id: null,
    weight: 4,
    processed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// summarizeSignals
// ---------------------------------------------------------------------------
describe('summarizeSignals', () => {
  it('returns zero totals for empty array', () => {
    const result = summarizeSignals([])
    expect(result).toEqual({
      totalSignals: 0,
      totalWeight: 0,
      groups: [],
      topPages: [],
      topTags: [],
      timeRange: { earliest: '', latest: '' },
    })
  })

  it('handles a single signal with correct type grouping and weight', () => {
    const signal = makeSignal({ type: 'voice', content: 'voice feedback' })
    const result = summarizeSignals([signal])

    expect(result.totalSignals).toBe(1)
    expect(result.totalWeight).toBe(SIGNAL_WEIGHTS.voice) // 5
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].type).toBe('voice')
    expect(result.groups[0].count).toBe(1)
    expect(result.groups[0].totalWeight).toBe(SIGNAL_WEIGHTS.voice)
    expect(result.groups[0].signals[0].weight).toBe(SIGNAL_WEIGHTS.voice)
  })

  it('groups multiple signal types and sorts by total weight descending', () => {
    const signals = [
      makeSignal({ type: 'analytics' }),
      makeSignal({ type: 'analytics' }),
      makeSignal({ type: 'analytics' }),
      makeSignal({ type: 'voice' }),
    ]
    const result = summarizeSignals(signals)

    expect(result.totalSignals).toBe(4)
    // analytics: 3 * 2 = 6, voice: 1 * 5 = 5
    expect(result.totalWeight).toBe(3 * SIGNAL_WEIGHTS.analytics + 1 * SIGNAL_WEIGHTS.voice)
    expect(result.groups).toHaveLength(2)
    // analytics (6) should come before voice (5)
    expect(result.groups[0].type).toBe('analytics')
    expect(result.groups[0].totalWeight).toBe(6)
    expect(result.groups[1].type).toBe('voice')
    expect(result.groups[1].totalWeight).toBe(5)
  })

  it('extracts top pages from metadata.page_url', () => {
    const signals = [
      makeSignal({ metadata: { page_url: '/home' } }),
      makeSignal({ metadata: { page_url: '/home' } }),
      makeSignal({ metadata: { page_url: '/about' } }),
    ]
    const result = summarizeSignals(signals)

    expect(result.topPages).toHaveLength(2)
    expect(result.topPages[0]).toEqual({ url: '/home', count: 2 })
    expect(result.topPages[1]).toEqual({ url: '/about', count: 1 })
  })

  it('extracts top tags from metadata.tags', () => {
    const signals = [
      makeSignal({ metadata: { tags: ['ux', 'bug'] } }),
      makeSignal({ metadata: { tags: ['ux'] } }),
      makeSignal({ metadata: { tags: ['perf'] } }),
    ]
    const result = summarizeSignals(signals)

    expect(result.topTags).toHaveLength(3)
    expect(result.topTags[0]).toEqual({ tag: 'ux', count: 2 })
    expect(result.topTags[1]).toEqual({ tag: 'bug', count: 1 })
    expect(result.topTags[2]).toEqual({ tag: 'perf', count: 1 })
  })

  it('computes correct time range (earliest and latest)', () => {
    const signals = [
      makeSignal({ created_at: '2025-03-15T10:00:00Z' }),
      makeSignal({ created_at: '2025-01-01T00:00:00Z' }),
      makeSignal({ created_at: '2025-06-30T23:59:59Z' }),
    ]
    const result = summarizeSignals(signals)

    expect(result.timeRange.earliest).toBe('2025-01-01T00:00:00Z')
    expect(result.timeRange.latest).toBe('2025-06-30T23:59:59Z')
  })

  it('uses SIGNAL_WEIGHTS constants for weight calculation', () => {
    // One of each type
    const types = Object.keys(SIGNAL_WEIGHTS) as Array<keyof typeof SIGNAL_WEIGHTS>
    const signals = types.map((type) =>
      makeSignal({ type: type as SignalRow['type'] })
    )
    const result = summarizeSignals(signals)

    const expectedTotal = types.reduce((sum, t) => sum + SIGNAL_WEIGHTS[t], 0)
    expect(result.totalWeight).toBe(expectedTotal)
  })

  it('falls back to weight 1 for unknown signal types', () => {
    // Force an unknown type via type assertion
    const signal = makeSignal({ type: 'unknown_type' as SignalRow['type'] })
    const result = summarizeSignals([signal])

    expect(result.totalWeight).toBe(1)
    expect(result.groups[0].totalWeight).toBe(1)
  })

  it('ignores signals without page_url or tags metadata', () => {
    const signals = [
      makeSignal({ metadata: {} }),
      makeSignal({ metadata: { other: 'data' } }),
    ]
    const result = summarizeSignals(signals)

    expect(result.topPages).toEqual([])
    expect(result.topTags).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// formatSummaryForPrompt
// ---------------------------------------------------------------------------
describe('formatSummaryForPrompt', () => {
  it('produces minimal output for empty summary', () => {
    const empty = summarizeSignals([])
    const output = formatSummaryForPrompt(empty)

    expect(output).toContain('0 signals')
    expect(output).toContain('weighted score: 0')
  })

  it('truncates long content to 300 chars', () => {
    const longContent = 'x'.repeat(500)
    const signal = makeSignal({ content: longContent })
    const summary = summarizeSignals([signal])
    const output = formatSummaryForPrompt(summary)

    // Should contain truncated content (300 chars + "...")
    expect(output).toContain('x'.repeat(300) + '...')
    expect(output).not.toContain('x'.repeat(301))
  })

  it('does not truncate content at or under 300 chars', () => {
    const exactContent = 'y'.repeat(300)
    const signal = makeSignal({ content: exactContent })
    const summary = summarizeSignals([signal])
    const output = formatSummaryForPrompt(summary)

    expect(output).toContain(exactContent)
    expect(output).not.toContain(exactContent + '...')
  })

  it('caps at 20 signals per group with "... and N more" message', () => {
    const signals = Array.from({ length: 25 }, (_, i) =>
      makeSignal({ content: `signal ${i}` })
    )
    const summary = summarizeSignals(signals)
    const output = formatSummaryForPrompt(summary)

    expect(output).toContain('... and 5 more')
    // Should display exactly 20 signals (not 25)
    const signalLines = output
      .split('\n')
      .filter((l) => l.startsWith('- ') && !l.includes('... and'))
    expect(signalLines).toHaveLength(20)
  })

  it('includes top pages section when pages exist', () => {
    const signals = [
      makeSignal({ metadata: { page_url: '/dashboard' } }),
      makeSignal({ metadata: { page_url: '/dashboard' } }),
    ]
    const summary = summarizeSignals(signals)
    const output = formatSummaryForPrompt(summary)

    expect(output).toContain('### Top Pages')
    expect(output).toContain('/dashboard (2 signals)')
  })

  it('includes top tags section when tags exist', () => {
    const signals = [
      makeSignal({ metadata: { tags: ['urgent'] } }),
    ]
    const summary = summarizeSignals(signals)
    const output = formatSummaryForPrompt(summary)

    expect(output).toContain('### Top Tags')
    expect(output).toContain('urgent (1)')
  })

  it('omits top pages section when no pages', () => {
    const signals = [makeSignal()]
    const summary = summarizeSignals(signals)
    const output = formatSummaryForPrompt(summary)

    expect(output).not.toContain('### Top Pages')
  })

  it('omits top tags section when no tags', () => {
    const signals = [makeSignal()]
    const summary = summarizeSignals(signals)
    const output = formatSummaryForPrompt(summary)

    expect(output).not.toContain('### Top Tags')
  })

  it('includes signal title when present', () => {
    const signal = makeSignal({ title: 'Login broken', content: 'Cannot login' })
    const summary = summarizeSignals([signal])
    const output = formatSummaryForPrompt(summary)

    expect(output).toContain('**Login broken**')
    expect(output).toContain('Cannot login')
  })

  it('formats group headers with type, count, and weight', () => {
    const signals = [makeSignal({ type: 'error' }), makeSignal({ type: 'error' })]
    const summary = summarizeSignals(signals)
    const output = formatSummaryForPrompt(summary)

    expect(output).toContain('### ERROR (2 signals, weight: 6)')
  })
})
