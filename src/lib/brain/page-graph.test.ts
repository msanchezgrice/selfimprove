import { describe, expect, it } from 'vitest'

import type { BrainPageKind } from '@/lib/types/database'

import { DEFAULT_PAGE_GRAPH, propagateStaleness } from './page-graph'

describe('propagateStaleness', () => {
  it('returns nothing when no pages were touched', () => {
    expect(propagateStaleness([])).toEqual([])
  })

  it('returns nothing when the touched pages have no downstream edges', () => {
    expect(propagateStaleness(['safety_rules'])).toEqual([])
  })

  it('returns the downstream kinds for a touched page', () => {
    const result = propagateStaleness(['repo_map'])
    expect(result).toContain('implementation_patterns')
    expect(result).toContain('safety_rules')
  })

  it('does not mark a page stale when it was also just touched', () => {
    const result = propagateStaleness(['project_overview', 'user_pain_map'])
    expect(result).not.toContain('user_pain_map')
    // active_experiments is downstream of both project_overview and
    // user_pain_map, and wasn't touched, so it should surface.
    expect(result).toContain('active_experiments')
  })

  it('is single-hop — does not cascade two levels deep', () => {
    const graph = {
      current_focus: ['user_pain_map'],
      user_pain_map: ['active_experiments'],
    } satisfies Record<BrainPageKind, BrainPageKind[]> as unknown as typeof DEFAULT_PAGE_GRAPH
    const result = propagateStaleness(['current_focus'], graph)
    expect(result).toEqual(['user_pain_map'])
    expect(result).not.toContain('active_experiments')
  })

  it('deduplicates downstream kinds reached from multiple edges', () => {
    const result = propagateStaleness(['project_overview', 'current_focus'])
    const unique = new Set(result)
    expect(unique.size).toBe(result.length)
  })
})
