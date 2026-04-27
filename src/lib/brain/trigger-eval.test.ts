import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TRIGGER_CORPUS,
  evaluateTriggerCorpus,
  matchPhrase,
  summarizeTriggerEval,
  TRIGGER_MATCH_THRESHOLD,
  type ActiveTrigger,
} from './trigger-eval'

function trigger(overrides: Partial<ActiveTrigger> = {}): ActiveTrigger {
  return {
    resolver_type: 'skill',
    trigger_phrase: 'refresh the roadmap',
    trigger_kind: 'user_phrase',
    target_skill_slug: 'roadmap-synthesis',
    priority: 10,
    status: 'active',
    ...overrides,
  }
}

describe('matchPhrase', () => {
  it('returns null when there are no active triggers', () => {
    expect(matchPhrase('refresh the roadmap', [])).toBeNull()
  })

  it('prefers exact matches to cosine matches', () => {
    const result = matchPhrase(
      'refresh the roadmap',
      [
        trigger({ trigger_phrase: 'refresh the roadmap', target_skill_slug: 'a' }),
        trigger({ trigger_phrase: 'rerank backlog', target_skill_slug: 'b' }),
      ],
    )
    expect(result?.skill).toBe('a')
    expect(result?.exact).toBe(true)
  })

  it('falls back to cosine similarity above threshold', () => {
    const result = matchPhrase(
      'refresh roadmap please',
      [trigger({ trigger_phrase: 'refresh the roadmap' })],
      'skill',
      0.5,
    )
    expect(result).not.toBeNull()
    expect(result?.skill).toBe('roadmap-synthesis')
  })

  it('returns null when no trigger clears the similarity threshold', () => {
    const result = matchPhrase(
      'deploy to production now',
      [trigger({ trigger_phrase: 'refresh the roadmap' })],
      'skill',
      TRIGGER_MATCH_THRESHOLD,
    )
    expect(result).toBeNull()
  })

  it('breaks ties by priority (lower number wins)', () => {
    const result = matchPhrase(
      'refresh the roadmap',
      [
        trigger({ trigger_phrase: 'refresh the roadmap', target_skill_slug: 'high-priority', priority: 5 }),
        trigger({ trigger_phrase: 'refresh the roadmap', target_skill_slug: 'low-priority', priority: 20 }),
      ],
    )
    expect(result?.skill).toBe('high-priority')
  })

  it('ignores retired triggers', () => {
    const result = matchPhrase('refresh the roadmap', [
      trigger({ status: 'retired' }),
    ])
    expect(result).toBeNull()
  })
})

describe('evaluateTriggerCorpus', () => {
  it('flags every case as false_negative when the trigger table is empty', () => {
    const results = evaluateTriggerCorpus([])
    expect(results.every((entry) => entry.outcome === 'false_negative')).toBe(true)
  })

  it('passes cases when triggers match the expected skill exactly', () => {
    const triggers = DEFAULT_TRIGGER_CORPUS.map((entry) =>
      trigger({
        trigger_phrase: entry.phrase,
        target_skill_slug: entry.expectedSkill,
      }),
    )
    const results = evaluateTriggerCorpus(triggers)
    expect(results.every((entry) => entry.outcome === 'pass')).toBe(true)
  })

  it('flags a case as false_positive when the match routes to the wrong skill', () => {
    const triggers = [
      trigger({ trigger_phrase: 'refresh the roadmap', target_skill_slug: 'wrong-skill' }),
    ]
    const results = evaluateTriggerCorpus(triggers, [
      {
        id: 'test',
        phrase: 'refresh the roadmap',
        expectedSkill: 'roadmap-synthesis',
        resolverType: 'skill',
      },
    ])
    expect(results[0]?.outcome).toBe('false_positive')
    expect(results[0]?.matchedSkill).toBe('wrong-skill')
  })
})

describe('summarizeTriggerEval', () => {
  it('computes pass_rate as pass/total', () => {
    const summary = summarizeTriggerEval([
      { case: { id: 'a', phrase: 'x', expectedSkill: 'y', resolverType: 'skill' }, matchedSkill: 'y', matchedTriggerPhrase: 'x', matchScore: 1, outcome: 'pass', note: '' },
      { case: { id: 'b', phrase: 'x', expectedSkill: 'y', resolverType: 'skill' }, matchedSkill: null, matchedTriggerPhrase: null, matchScore: 0, outcome: 'false_negative', note: '' },
    ])
    expect(summary.total).toBe(2)
    expect(summary.pass).toBe(1)
    expect(summary.false_negative).toBe(1)
    expect(summary.pass_rate).toBe(0.5)
  })
})
