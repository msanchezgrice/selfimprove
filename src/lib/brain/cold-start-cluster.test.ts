import { describe, expect, it } from 'vitest'

import { clusterItems, type CandidateItem } from './cold-start-cluster'

function item(
  id: string,
  title: string,
  category = 'revenue',
  createdAt = '2026-04-20T10:00:00Z',
): CandidateItem {
  return {
    id,
    title,
    category,
    opportunity_cluster_id: null,
    created_at: createdAt,
  }
}

describe('clusterItems', () => {
  it('returns no drafts for empty input', () => {
    expect(clusterItems([])).toEqual([])
  })

  it('groups near-duplicate titles into one draft', () => {
    const drafts = clusterItems([
      item('1', 'Implement Preview-to-Purchase Conversion Nudge After Audio Play'),
      item('2', 'Build Preview-to-Purchase Conversion Bridge Post-Play CTA'),
      item('3', 'Add Preview-Play Purchase Inline Upsell Bridge'),
      item('4', 'Fix Onboarding Async Failure & Step Validation Errors'),
      item('5', 'Add Onboarding Step Inline Validation Real-Time Feedback'),
    ])

    const seen = new Map<string, number>()
    for (const draft of drafts) {
      seen.set(draft.slug, draft.members.length)
    }

    // We expect at least 2 distinct theme buckets (preview/purchase + onboarding).
    expect(drafts.length).toBeGreaterThanOrEqual(2)
    const totalMembers = drafts.reduce((s, d) => s + d.members.length, 0)
    expect(totalMembers).toBe(5)
  })

  it('themes preview/audio items under preview', () => {
    const drafts = clusterItems([
      item('1', 'Preview Audio Play Conversion'),
      item('2', 'Preview Played Bridge'),
    ])
    expect(drafts[0]?.theme).toBe('preview')
  })

  it('themes pricing/checkout items under pricing', () => {
    const drafts = clusterItems([
      item('1', 'Simplify Pricing Tiers at Checkout'),
      item('2', 'Optimize Pricing Page Purchase Flow'),
    ])
    expect(drafts[0]?.theme).toBe('pricing')
  })

  it('emits an unfiled bucket once the cap is hit', () => {
    // Use 31 totally distinct items so each one wants its own cluster.
    const distinctItems = Array.from({ length: 31 }, (_, i) =>
      item(`r${i}`, `Distinct unique theme number ${i} alpha bravo`),
    )
    // Differentiate titles so cosine doesn't accidentally cluster them.
    distinctItems.forEach((it, i) => {
      it.title = `${it.title} ${'word'.repeat(i + 1)} ${i * 7919}`
    })
    const drafts = clusterItems(distinctItems)
    const unfiled = drafts.find((d) => d.slug === 'unfiled')
    expect(unfiled).toBeDefined()
    expect(unfiled!.members.length).toBeGreaterThan(0)
  })
})
