import { describe, expect, it } from 'vitest'

import { classifyImpact, parseMetricValue, type ImpactEstimate } from './impact-review'

describe('parseMetricValue', () => {
  it('returns null for unparseable or empty input', () => {
    expect(parseMetricValue(null)).toBeNull()
    expect(parseMetricValue(undefined)).toBeNull()
    expect(parseMetricValue('')).toBeNull()
    expect(parseMetricValue('   ')).toBeNull()
    expect(parseMetricValue('nothing numeric')).toBeNull()
  })

  it('passes through numeric values', () => {
    expect(parseMetricValue(3.14)).toEqual({ value: 3.14, unit: null })
    expect(parseMetricValue(42)).toEqual({ value: 42, unit: null })
  })

  it('extracts numbers and units from strings', () => {
    expect(parseMetricValue('58%')).toEqual({ value: 58, unit: '%' })
    expect(parseMetricValue('3.2s')).toEqual({ value: 3.2, unit: 's' })
    expect(parseMetricValue('12 errors/day')).toEqual({ value: 12, unit: 'errors/day' })
    expect(parseMetricValue('-5 pts')).toEqual({ value: -5, unit: 'pts' })
  })
})

describe('classifyImpact', () => {
  const estimate = (overrides: Partial<ImpactEstimate> = {}): ImpactEstimate => ({
    metric: 'signup_completion_rate',
    baseline: '58%',
    predicted: '70%',
    unit: 'percentage',
    reasoning: 'stub',
    ...overrides,
  })

  it('returns inconclusive when there are no estimates', () => {
    const result = classifyImpact([], [])
    expect(result.verdict).toBe('inconclusive')
    expect(result.accuracyScore).toBeNull()
    expect(result.comparisons).toEqual([])
  })

  it('marks missing actuals explicitly', () => {
    const result = classifyImpact([estimate()], [])
    expect(result.verdict).toBe('inconclusive')
    expect(result.comparisons[0]?.classification).toBe('missing')
  })

  it('classifies a hit close to the forecast as confirmed', () => {
    const result = classifyImpact(
      [estimate()],
      [{ metric: 'signup_completion_rate', actual: '69%', measured_at: 'now' }],
    )
    expect(result.comparisons[0]?.classification).toBe('confirmed')
    expect(result.verdict).toBe('confirmed')
    expect(result.accuracyScore).not.toBeNull()
    expect(result.accuracyScore).toBeGreaterThan(0.8)
  })

  it('classifies half-delivered wins as underperformed', () => {
    const result = classifyImpact(
      [estimate()],
      [{ metric: 'signup_completion_rate', actual: '62%', measured_at: 'now' }],
    )
    expect(result.comparisons[0]?.classification).toBe('underperformed')
    expect(result.verdict).toBe('underperformed')
  })

  it('classifies barely-moved actuals as inconclusive', () => {
    const result = classifyImpact(
      [estimate()],
      [{ metric: 'signup_completion_rate', actual: '58.5%', measured_at: 'now' }],
    )
    expect(result.comparisons[0]?.classification).toBe('inconclusive')
    expect(result.verdict).toBe('inconclusive')
  })

  it('flags wrong-direction movement as underperformed', () => {
    const result = classifyImpact(
      [estimate({ baseline: '60%', predicted: '75%' })],
      [{ metric: 'signup_completion_rate', actual: '50%', measured_at: 'now' }],
    )
    expect(result.comparisons[0]?.classification).toBe('underperformed')
    expect(result.verdict).toBe('underperformed')
  })

  it('aggregates the majority verdict across multiple metrics', () => {
    const result = classifyImpact(
      [
        estimate({ metric: 'a', baseline: '10', predicted: '20' }),
        estimate({ metric: 'b', baseline: '100', predicted: '120' }),
        estimate({ metric: 'c', baseline: '5', predicted: '10' }),
      ],
      [
        { metric: 'a', actual: '19', measured_at: 'now' }, // confirmed
        { metric: 'b', actual: '118', measured_at: 'now' }, // confirmed
        { metric: 'c', actual: '6', measured_at: 'now' }, // underperformed
      ],
    )
    expect(result.verdict).toBe('confirmed')
    expect(result.comparisons.map((c) => c.classification)).toEqual([
      'confirmed',
      'confirmed',
      'underperformed',
    ])
  })
})
