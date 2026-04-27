import { describe, expect, it } from 'vitest'

import { FOCUS_MODES } from './design'
import {
  computeClusterScores,
  computeConfidenceScore,
  computeEffortScore,
  computeEvidenceStrength,
  computeFocusWeightedScore,
  computeFreshnessScore,
  computeNeedAlignment,
  type ClusterSourceInput,
} from './ranking'

const NOW = new Date('2026-04-20T00:00:00.000Z')

function source(overrides: Partial<ClusterSourceInput> = {}): ClusterSourceInput {
  return {
    source_kind: 'signal',
    signal_type: 'feedback',
    weight: 4,
    polarity: 'supports',
    created_at: NOW.toISOString(),
    ...overrides,
  }
}

describe('computeEvidenceStrength', () => {
  it('is 0 for no sources', () => {
    expect(computeEvidenceStrength([])).toBe(0)
  })

  it('grows with supporting sources but plateaus (logarithmic curve)', () => {
    const few = computeEvidenceStrength(Array.from({ length: 3 }, () => source()))
    const many = computeEvidenceStrength(Array.from({ length: 30 }, () => source()))
    expect(few).toBeGreaterThan(0)
    expect(many).toBeGreaterThan(few)
    expect(many - few).toBeLessThan(few)
  })

  it('dampens net support with contradicting sources', () => {
    const supports = computeEvidenceStrength(
      Array.from({ length: 6 }, () => source()),
    )
    const mixed = computeEvidenceStrength([
      ...Array.from({ length: 6 }, () => source()),
      ...Array.from({ length: 3 }, () => source({ polarity: 'contradicts' })),
    ])
    expect(mixed).toBeLessThan(supports)
  })
})

describe('computeFreshnessScore', () => {
  it('returns 0 when there is no last signal', () => {
    expect(computeFreshnessScore(null, NOW)).toBe(0)
  })

  it('returns 100 for a brand-new signal', () => {
    expect(computeFreshnessScore(NOW.toISOString(), NOW)).toBe(100)
  })

  it('decays roughly linearly to 0 around 90 days', () => {
    const thirtyDaysAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    const ninetyDaysAgo = new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000)

    const thirty = computeFreshnessScore(thirtyDaysAgo.toISOString(), NOW)
    const ninety = computeFreshnessScore(ninetyDaysAgo.toISOString(), NOW)

    expect(thirty).toBeGreaterThan(50)
    expect(thirty).toBeLessThan(80)
    expect(ninety).toBe(0)
  })
})

describe('computeConfidenceScore', () => {
  it('rewards source and signal-type diversity', () => {
    const narrow = computeConfidenceScore([
      source({ signal_type: 'feedback' }),
      source({ signal_type: 'feedback' }),
      source({ signal_type: 'feedback' }),
    ])
    const wide = computeConfidenceScore([
      source({ signal_type: 'feedback', source_kind: 'signal' }),
      source({ signal_type: 'voice', source_kind: 'signal' }),
      source({ signal_type: 'analytics', source_kind: 'signal' }),
      source({ signal_type: 'error', source_kind: 'scan_finding' }),
      source({ signal_type: null, source_kind: 'roadmap_item' }),
    ])
    expect(wide).toBeGreaterThan(narrow)
  })
})

describe('computeEffortScore', () => {
  it('defaults to medium effort when missing', () => {
    expect(computeEffortScore(null)).toBe(50)
    expect(computeEffortScore(undefined)).toBe(50)
  })

  it('inverts a 1-10 effort signal into a 0-100 do-it-now score', () => {
    expect(computeEffortScore(1)).toBeGreaterThan(computeEffortScore(10))
    expect(computeEffortScore(10)).toBe(0)
  })
})

describe('computeNeedAlignment', () => {
  const conversion = FOCUS_MODES.find((mode) => mode.name === 'conversion')!

  it('is 1 when the primary need matches focus exactly', () => {
    expect(computeNeedAlignment('conversion', {}, conversion)).toBe(1)
  })

  it('reads the normalized need_vector when available', () => {
    expect(
      computeNeedAlignment('retention', { conversion: 2, retention: 1 }, conversion),
    ).toBeGreaterThanOrEqual(2 / 3)
  })

  it('is neutral when no focus is active', () => {
    expect(computeNeedAlignment('retention', {}, null)).toBe(0.5)
  })
})

describe('computeFocusWeightedScore', () => {
  it('keeps base score for perfectly aligned clusters', () => {
    const base = computeFocusWeightedScore({
      evidence: 80,
      freshness: 80,
      confidence: 80,
      effort: 80,
      needAlignment: 1,
    })
    const misaligned = computeFocusWeightedScore({
      evidence: 80,
      freshness: 80,
      confidence: 80,
      effort: 80,
      needAlignment: 0,
    })
    expect(base).toBe(80)
    expect(misaligned).toBeLessThan(base)
    expect(misaligned).toBeGreaterThanOrEqual(Math.round(base * 0.6))
  })
})

describe('computeClusterScores', () => {
  it('returns a full bundle without throwing on sparse input', () => {
    const scores = computeClusterScores({
      sources: [],
      lastSignalAt: null,
      lastRefreshedAt: null,
      effortSignal: null,
      primaryNeed: '',
      needVector: {},
      focus: null,
      now: NOW,
    })
    expect(scores.evidenceStrength).toBe(0)
    expect(scores.freshnessScore).toBe(0)
    expect(scores.confidenceScore).toBe(0)
    expect(scores.effortScore).toBe(50)
    expect(scores.focusWeightedScore).toBeGreaterThanOrEqual(0)
  })
})
