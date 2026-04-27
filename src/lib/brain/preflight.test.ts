import { describe, expect, it } from 'vitest'

import {
  dedupAgainstHistory,
  shouldRunSynthesis,
  TITLE_DEDUP_THRESHOLD,
} from './preflight'

describe('dedupAgainstHistory', () => {
  const existing = [
    {
      id: 'r1',
      title: 'Implement Preview-to-Purchase Conversion Nudge After Audio Play',
      created_at: '2026-04-20T10:00:00Z',
    },
    {
      id: 'r2',
      title: 'Fix Onboarding Async Failure & Step Validation Errors',
      created_at: '2026-04-19T10:00:00Z',
    },
    {
      id: 'r3',
      title: 'Add Explicit Width/Height to Images to Eliminate Layout Shift',
      created_at: '2026-04-18T10:00:00Z',
    },
  ]

  it('drops a near-duplicate against history', () => {
    const result = dedupAgainstHistory(
      [{ title: 'Implement Preview-to-Purchase Conversion Bridge After Audio' }],
      existing,
    )
    expect(result.kept).toHaveLength(0)
    expect(result.dropped).toHaveLength(1)
    expect(result.dropped[0]?.matchedTitle).toContain('Preview-to-Purchase')
    expect(result.dropped[0]?.score).toBeGreaterThanOrEqual(TITLE_DEDUP_THRESHOLD)
  })

  it('keeps a clearly novel title', () => {
    const result = dedupAgainstHistory(
      [{ title: 'Add Stripe webhook for refund handling' }],
      existing,
    )
    expect(result.kept).toHaveLength(1)
    expect(result.dropped).toHaveLength(0)
  })

  it('drops within-batch duplicates', () => {
    const result = dedupAgainstHistory(
      [
        { title: 'Implement Pricing Tier Simplification on Checkout' },
        { title: 'Implement Pricing Tier Simplification at Checkout' },
        { title: 'Add CSP Nonces to Inline Scripts' },
      ],
      [],
    )
    expect(result.kept).toHaveLength(2)
    const inBatch = result.dropped.filter((d) => d.matchedId === 'in-batch')
    expect(inBatch).toHaveLength(1)
  })

  it('handles empty inputs gracefully', () => {
    expect(dedupAgainstHistory([], existing).kept).toEqual([])
    expect(dedupAgainstHistory([{ title: 'Anything' }], []).kept).toHaveLength(1)
  })
})

describe('shouldRunSynthesis', () => {
  const NOW = new Date('2026-04-27T12:00:00Z')

  it('runs when there is no prior run', () => {
    const decision = shouldRunSynthesis({
      lastCompletedAt: null,
      latestAnomalyAt: null,
      latestUnprocessedSignalAt: null,
      now: NOW,
    })
    expect(decision.run).toBe(true)
  })

  it('runs when the cooldown has elapsed', () => {
    const decision = shouldRunSynthesis({
      lastCompletedAt: '2026-04-27T05:00:00Z',
      latestAnomalyAt: null,
      latestUnprocessedSignalAt: null,
      now: NOW,
      cooldownHours: 6,
    })
    expect(decision.run).toBe(true)
  })

  it('skips when cooldown is active and no fresh evidence', () => {
    const decision = shouldRunSynthesis({
      lastCompletedAt: '2026-04-27T10:00:00Z',
      latestAnomalyAt: '2026-04-27T08:00:00Z',
      latestUnprocessedSignalAt: '2026-04-27T09:30:00Z',
      now: NOW,
      cooldownHours: 6,
    })
    expect(decision.run).toBe(false)
    if (!decision.run) {
      expect(decision.nextEligibleAt).toBeDefined()
    }
  })

  it('runs even within cooldown when a fresh anomaly arrived', () => {
    const decision = shouldRunSynthesis({
      lastCompletedAt: '2026-04-27T10:00:00Z',
      latestAnomalyAt: '2026-04-27T11:30:00Z',
      latestUnprocessedSignalAt: null,
      now: NOW,
      cooldownHours: 6,
    })
    expect(decision.run).toBe(true)
    expect(decision.reason).toContain('new')
  })

  it('runs when a fresh unprocessed signal arrived inside cooldown', () => {
    const decision = shouldRunSynthesis({
      lastCompletedAt: '2026-04-27T10:00:00Z',
      latestAnomalyAt: null,
      latestUnprocessedSignalAt: '2026-04-27T11:45:00Z',
      now: NOW,
      cooldownHours: 6,
    })
    expect(decision.run).toBe(true)
  })
})
