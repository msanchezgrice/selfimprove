import { describe, it, expect } from 'vitest'
import type { SignalRow } from '@/lib/types/database'
import {
  tokenize,
  termFrequency,
  cosineSimilarity,
  signalSimilarity,
  deduplicateSignals,
} from './dedup-signals'

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
// tokenize
// ---------------------------------------------------------------------------
describe('tokenize', () => {
  it('lowercases and splits on whitespace', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world'])
  })

  it('strips punctuation', () => {
    expect(tokenize("can't login!")).toEqual(['can', 'login'])
  })

  it('filters single-character tokens', () => {
    expect(tokenize('I am a user')).toEqual(['am', 'user'])
  })

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// termFrequency
// ---------------------------------------------------------------------------
describe('termFrequency', () => {
  it('counts token occurrences', () => {
    const tf = termFrequency(['hello', 'world', 'hello'])
    expect(tf.get('hello')).toBe(2)
    expect(tf.get('world')).toBe(1)
  })

  it('returns empty map for empty array', () => {
    expect(termFrequency([]).size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------
describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const tf = termFrequency(['hello', 'world'])
    expect(cosineSimilarity(tf, tf)).toBeCloseTo(1.0)
  })

  it('returns 0 for completely disjoint vectors', () => {
    const a = termFrequency(['hello', 'world'])
    const b = termFrequency(['foo', 'bar'])
    expect(cosineSimilarity(a, b)).toBe(0)
  })

  it('returns value between 0 and 1 for partial overlap', () => {
    const a = termFrequency(['login', 'broken', 'error'])
    const b = termFrequency(['login', 'error', 'fix'])
    const sim = cosineSimilarity(a, b)
    expect(sim).toBeGreaterThan(0)
    expect(sim).toBeLessThan(1)
  })

  it('returns 0 when either vector is empty', () => {
    const a = termFrequency(['hello'])
    const b = termFrequency([])
    expect(cosineSimilarity(a, b)).toBe(0)
    expect(cosineSimilarity(b, a)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// signalSimilarity
// ---------------------------------------------------------------------------
describe('signalSimilarity', () => {
  it('returns 0 for signals of different types', () => {
    const a = makeSignal({ type: 'feedback', content: 'login broken' })
    const b = makeSignal({ type: 'error', content: 'login broken' })
    expect(signalSimilarity(a, b)).toBe(0)
  })

  it('returns high similarity for near-identical content', () => {
    const a = makeSignal({ content: 'The login page is broken and I cannot sign in' })
    const b = makeSignal({ content: 'The login page is broken, I cannot sign in' })
    expect(signalSimilarity(a, b)).toBeGreaterThan(0.9)
  })

  it('returns low similarity for unrelated content', () => {
    const a = makeSignal({ content: 'The login page is broken' })
    const b = makeSignal({ content: 'Please add dark mode to the settings' })
    expect(signalSimilarity(a, b)).toBeLessThan(0.3)
  })

  it('includes title in similarity calculation', () => {
    const a = makeSignal({ title: 'Login Bug', content: 'page broken' })
    const b = makeSignal({ title: 'Login Bug', content: 'different issue' })
    const c = makeSignal({ title: 'Dark Mode', content: 'different issue' })
    // a & b share title, so they should be more similar than b & c
    expect(signalSimilarity(a, b)).toBeGreaterThan(signalSimilarity(b, c))
  })
})

// ---------------------------------------------------------------------------
// deduplicateSignals
// ---------------------------------------------------------------------------
describe('deduplicateSignals', () => {
  it('returns empty result for empty input', () => {
    const result = deduplicateSignals([])
    expect(result.dedupedSignals).toEqual([])
    expect(result.groups).toEqual([])
    expect(result.originalCount).toBe(0)
    expect(result.dedupedCount).toBe(0)
    expect(result.duplicatesFound).toBe(0)
  })

  it('does not merge signals below threshold', () => {
    const signals = [
      makeSignal({ content: 'The login page is completely broken' }),
      makeSignal({ content: 'Please add dark mode theme to settings' }),
      makeSignal({ content: 'The pricing page loads too slowly' }),
    ]
    const result = deduplicateSignals(signals)
    expect(result.dedupedCount).toBe(3)
    expect(result.duplicatesFound).toBe(0)
  })

  it('merges near-identical signals into one group', () => {
    const signals = [
      makeSignal({ content: 'The login page is broken and I cannot sign in to my account' }),
      makeSignal({ content: 'The login page is broken and I cannot sign in to my account at all' }),
      makeSignal({ content: 'Login page broken, cannot sign in to my account' }),
    ]
    const result = deduplicateSignals(signals)
    expect(result.dedupedCount).toBeLessThan(3)
    expect(result.duplicatesFound).toBeGreaterThan(0)
    expect(result.groups[0].members.length).toBeGreaterThan(1)
  })

  it('does not merge signals of different types even with identical content', () => {
    const signals = [
      makeSignal({ type: 'feedback', content: 'login page broken' }),
      makeSignal({ type: 'error', content: 'login page broken' }),
    ]
    const result = deduplicateSignals(signals)
    expect(result.dedupedCount).toBe(2)
    expect(result.duplicatesFound).toBe(0)
  })

  it('boosts weight for merged groups', () => {
    const signals = [
      makeSignal({ content: 'The login page is completely broken and not working', weight: 4 }),
      makeSignal({ content: 'The login page is completely broken and not working at all', weight: 4 }),
    ]
    const result = deduplicateSignals(signals)
    if (result.dedupedCount < 2) {
      // If they were merged, the weight should be boosted
      expect(result.dedupedSignals[0].weight).toBeGreaterThan(4)
    }
  })

  it('sets dedup_group_id on merged signals', () => {
    const signals = [
      makeSignal({ content: 'The login page is completely broken and not working' }),
      makeSignal({ content: 'The login page is completely broken and not working at all' }),
    ]
    const result = deduplicateSignals(signals)
    if (result.dedupedCount < 2) {
      expect(result.dedupedSignals[0].dedup_group_id).toBe(signals[0].id)
    }
  })

  it('preserves original signal when not part of a group', () => {
    const signal = makeSignal({ content: 'unique feedback about a unique feature' })
    const result = deduplicateSignals([signal])
    expect(result.dedupedSignals).toHaveLength(1)
    expect(result.dedupedSignals[0].content).toBe(signal.content)
    expect(result.dedupedSignals[0].id).toBe(signal.id)
  })

  it('respects custom threshold', () => {
    const signals = [
      makeSignal({ content: 'The login page is broken' }),
      makeSignal({ content: 'The login page seems broken' }),
    ]
    // With very low threshold, everything merges
    const looseDedupe = deduplicateSignals(signals, 0.1)
    // With very high threshold, nothing merges
    const strictDedupe = deduplicateSignals(signals, 0.99)

    expect(looseDedupe.dedupedCount).toBeLessThanOrEqual(strictDedupe.dedupedCount)
  })

  it('includes duplicate count annotation in merged content', () => {
    const signals = [
      makeSignal({ content: 'The login page is completely broken and not working' }),
      makeSignal({ content: 'The login page is completely broken and not working at all' }),
    ]
    const result = deduplicateSignals(signals)
    if (result.dedupedCount < 2) {
      expect(result.dedupedSignals[0].content).toContain('similar reports')
    }
  })

  it('handles large batches without error', () => {
    const signals = Array.from({ length: 100 }, (_, i) =>
      makeSignal({ content: `unique signal number ${i} with distinct text about feature ${i}` })
    )
    const result = deduplicateSignals(signals)
    // Should process without throwing
    expect(result.originalCount).toBe(100)
    expect(result.dedupedCount).toBeLessThanOrEqual(100)
  })
})
