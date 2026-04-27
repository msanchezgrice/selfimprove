import { describe, expect, it } from 'vitest'

import { rankRoadmapItems, recomputeClusterFocusScore, type RoadmapItemForRanking } from './rerank'
import { FOCUS_MODES } from './design'
import type { OpportunityClusterRow } from '@/lib/types/database'

function cluster(overrides: Partial<OpportunityClusterRow> = {}): OpportunityClusterRow {
  return {
    id: overrides.id ?? `c-${Math.random()}`,
    project_id: 'p1',
    slug: 'pricing-confusion',
    title: 'Pricing confusion',
    theme: 'pricing',
    primary_need: 'conversion',
    need_vector: { conversion: 1 },
    evidence_strength: 70,
    freshness_score: 80,
    confidence_score: 65,
    effort_score: 60,
    focus_weighted_score: 68,
    status: 'active',
    merged_into_cluster_id: null,
    latest_brief_md: '',
    last_signal_at: '2026-04-26T10:00:00Z',
    last_refreshed_at: '2026-04-26T10:00:00Z',
    metadata: {},
    created_at: '2026-04-20T10:00:00Z',
    updated_at: '2026-04-26T10:00:00Z',
    ...overrides,
  }
}

function item(overrides: Partial<RoadmapItemForRanking> = {}): RoadmapItemForRanking {
  return {
    id: overrides.id ?? `i-${Math.random()}`,
    project_id: 'p1',
    title: 'Implement Pricing Tier Simplification',
    description: '',
    category: 'revenue',
    status: 'proposed',
    stage: 'roadmap',
    rank: 1,
    confidence: 80,
    roi_score: 20,
    impact: 8,
    size: 4,
    updated_at: '2026-04-26T10:00:00Z',
    created_at: '2026-04-26T10:00:00Z',
    opportunity_cluster_id: null,
    prd_content: null,
    ...overrides,
  } as RoadmapItemForRanking
}

describe('rankRoadmapItems', () => {
  it('returns nothing when items list is empty', () => {
    expect(rankRoadmapItems([], [])).toEqual([])
  })

  it('orders by combined score descending', () => {
    const c1 = cluster({ id: 'c1', focus_weighted_score: 80 })
    const c2 = cluster({ id: 'c2', focus_weighted_score: 30 })
    const items = [
      item({ id: 'a', opportunity_cluster_id: 'c1', roi_score: 10 }),
      item({ id: 'b', opportunity_cluster_id: 'c2', roi_score: 40 }),
    ]
    const ranked = rankRoadmapItems(items, [c1, c2])
    // c1 (80) * 0.6 + 10/50*100 * 0.4 = 48 + 8  = 56
    // c2 (30) * 0.6 + 40/50*100 * 0.4 = 18 + 32 = 50
    expect(ranked[0]?.item.id).toBe('a')
    expect(ranked[1]?.item.id).toBe('b')
  })

  it('drops items below confidence floor', () => {
    const ranked = rankRoadmapItems(
      [item({ id: 'a', confidence: 60 }), item({ id: 'b', confidence: 90 })],
      [],
      { minConfidence: 80 },
    )
    expect(ranked.map((r) => r.item.id)).toEqual(['b'])
  })

  it('filters by category whitelist', () => {
    const ranked = rankRoadmapItems(
      [
        item({ id: 'a', category: 'revenue' }),
        item({ id: 'b', category: 'bug' }),
        item({ id: 'c', category: 'infrastructure' }),
      ],
      [],
      { category: ['revenue', 'bug'] },
    )
    expect(ranked.map((r) => r.item.id).sort()).toEqual(['a', 'b'])
  })

  it('filters by cluster slug', () => {
    const c1 = cluster({ id: 'c1', slug: 'pricing-confusion' })
    const c2 = cluster({ id: 'c2', slug: 'onboarding-friction' })
    const ranked = rankRoadmapItems(
      [
        item({ id: 'a', opportunity_cluster_id: 'c1' }),
        item({ id: 'b', opportunity_cluster_id: 'c2' }),
      ],
      [c1, c2],
      { clusterSlugs: ['pricing-confusion'] },
    )
    expect(ranked.map((r) => r.item.id)).toEqual(['a'])
  })

  it('respects minClusterScore floor', () => {
    const c1 = cluster({ id: 'c1', focus_weighted_score: 70 })
    const c2 = cluster({ id: 'c2', focus_weighted_score: 30 })
    const ranked = rankRoadmapItems(
      [
        item({ id: 'a', opportunity_cluster_id: 'c1' }),
        item({ id: 'b', opportunity_cluster_id: 'c2' }),
      ],
      [c1, c2],
      { minClusterScore: 50 },
    )
    expect(ranked.map((r) => r.item.id)).toEqual(['a'])
  })

  it('honors limit', () => {
    const c1 = cluster({ id: 'c1' })
    const items = Array.from({ length: 10 }, (_, i) => item({ id: `i${i}`, opportunity_cluster_id: 'c1' }))
    const ranked = rankRoadmapItems(items, [c1], { limit: 3 })
    expect(ranked).toHaveLength(3)
  })

  it('recomputes focus-weighted score when filter overrides the focus', () => {
    // A cluster whose persisted score reflects "conversion" focus.
    const c = cluster({
      primary_need: 'conversion',
      need_vector: { conversion: 1 },
      focus_weighted_score: 80,
    })
    const items = [item({ opportunity_cluster_id: c.id })]

    const conversion = rankRoadmapItems(items, [c], { focus: 'conversion' })
    const retention = rankRoadmapItems(items, [c], { focus: 'retention' })

    expect(conversion[0]?.clusterFocusScore).toBeGreaterThan(retention[0]?.clusterFocusScore ?? 0)
    expect(conversion[0]?.reason).toContain('conversion')
  })
})

describe('recomputeClusterFocusScore', () => {
  it('drops the score when applying an unaligned focus', () => {
    const conversion = FOCUS_MODES.find((m) => m.name === 'conversion')!
    const retention = FOCUS_MODES.find((m) => m.name === 'retention')!
    const c = cluster({ primary_need: 'conversion', need_vector: { conversion: 1 } })

    const aligned = recomputeClusterFocusScore(c, conversion, new Date('2026-04-26T10:00:00Z'))
    const misaligned = recomputeClusterFocusScore(c, retention, new Date('2026-04-26T10:00:00Z'))
    expect(aligned).toBeGreaterThan(misaligned)
  })
})
