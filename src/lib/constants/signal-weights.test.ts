import { describe, it, expect } from 'vitest'
import { SIGNAL_WEIGHTS } from './signal-weights'

describe('SIGNAL_WEIGHTS', () => {
  it('voice > feedback > error > analytics > builder', () => {
    expect(SIGNAL_WEIGHTS.voice).toBeGreaterThan(SIGNAL_WEIGHTS.feedback)
    expect(SIGNAL_WEIGHTS.feedback).toBeGreaterThan(SIGNAL_WEIGHTS.error)
    expect(SIGNAL_WEIGHTS.error).toBeGreaterThan(SIGNAL_WEIGHTS.analytics)
    expect(SIGNAL_WEIGHTS.analytics).toBeGreaterThan(SIGNAL_WEIGHTS.builder)
  })

  it('all values are positive numbers', () => {
    for (const [key, value] of Object.entries(SIGNAL_WEIGHTS)) {
      expect(value, `${key} should be a positive number`).toBeGreaterThan(0)
      expect(typeof value, `${key} should be a number`).toBe('number')
    }
  })
})
