import { describe, expect, it } from 'vitest'

import {
  FILING_ATTACH_THRESHOLD,
  fileSignal,
  fileSignals,
  scoreClusterMatch,
  type FilingInputCluster,
  type FilingInputSignal,
} from './filing-resolver'

function signal(overrides: Partial<FilingInputSignal> = {}): FilingInputSignal {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    type: overrides.type ?? 'feedback',
    title: overrides.title ?? null,
    content: overrides.content ?? '',
    weight: overrides.weight ?? 4,
  }
}

function cluster(overrides: Partial<FilingInputCluster> = {}): FilingInputCluster {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    slug: overrides.slug ?? 'cluster',
    title: overrides.title ?? 'Cluster',
    theme: overrides.theme ?? '',
    primary_need: overrides.primary_need ?? '',
    latest_brief_md: overrides.latest_brief_md ?? '',
    status: overrides.status ?? 'active',
  }
}

describe('scoreClusterMatch', () => {
  it('scores higher when signal content shares vocabulary with the cluster', () => {
    const pricing = cluster({
      slug: 'pricing-confusion',
      title: 'Pricing confusion at checkout',
      theme: 'pricing',
      primary_need: 'conversion',
      latest_brief_md: 'Users keep bouncing because pricing tiers are unclear',
    })
    const onboarding = cluster({
      slug: 'onboarding-friction',
      title: 'Onboarding friction',
      theme: 'onboarding',
      primary_need: 'ux_quality',
      latest_brief_md: 'New users drop off during the setup wizard',
    })

    const s = signal({
      title: 'Confusing pricing',
      content: 'The pricing page shows three tiers but the checkout shows four, users get confused',
    })

    const pricingScore = scoreClusterMatch(s, pricing)
    const onboardingScore = scoreClusterMatch(s, onboarding)
    expect(pricingScore).toBeGreaterThan(onboardingScore)
    expect(pricingScore).toBeGreaterThan(FILING_ATTACH_THRESHOLD)
  })

  it('boosts matches when the signal mentions the cluster primary need verbatim', () => {
    const c = cluster({
      slug: 'conversion-funnel',
      title: 'Conversion funnel',
      theme: 'funnel',
      primary_need: 'conversion',
      latest_brief_md: '',
    })
    const plain = signal({ content: 'users abandon the funnel halfway through' })
    const withBoost = signal({
      content: 'users abandon the funnel halfway through and conversion is dropping',
    })
    expect(scoreClusterMatch(withBoost, c)).toBeGreaterThan(scoreClusterMatch(plain, c))
  })
})

describe('fileSignal', () => {
  it('returns unfiled when no clusters exist', () => {
    const decision = fileSignal(signal({ content: 'anything' }), [])
    expect(decision.kind).toBe('unfiled')
    if (decision.kind === 'unfiled') {
      expect(decision.reason).toBe('no_clusters')
    }
  })

  it('returns unfiled when the best match is below threshold', () => {
    const c = cluster({
      slug: 'performance-issues',
      title: 'Performance issues',
      theme: 'performance',
      primary_need: 'performance',
      latest_brief_md: 'latency spikes on the dashboard',
    })
    const s = signal({ content: 'the login button has a typo' })
    const decision = fileSignal(s, [c])
    expect(decision.kind).toBe('unfiled')
    if (decision.kind === 'unfiled') {
      expect(decision.reason).toBe('below_threshold')
      expect(decision.bestClusterSlug).toBe('performance-issues')
    }
  })

  it('attaches to the best matching active cluster above threshold', () => {
    const pricing = cluster({
      slug: 'pricing-confusion',
      title: 'Pricing confusion',
      theme: 'pricing',
      primary_need: 'conversion',
      latest_brief_md: 'Users cannot tell which tier to pick on the pricing page during checkout.',
    })
    const onboarding = cluster({
      slug: 'onboarding-friction',
      title: 'Onboarding friction',
      theme: 'onboarding',
      primary_need: 'ux_quality',
    })

    const s = signal({
      title: 'Pricing page is confusing',
      content: 'Users are confused about the pricing tiers shown on the pricing page during checkout.',
    })

    const decision = fileSignal(s, [pricing, onboarding])
    expect(decision.kind).toBe('attach')
    if (decision.kind === 'attach') {
      expect(decision.clusterSlug).toBe('pricing-confusion')
      expect(decision.score).toBeGreaterThanOrEqual(FILING_ATTACH_THRESHOLD)
    }
  })

  it('ignores inactive clusters', () => {
    const archived = cluster({
      slug: 'pricing-confusion',
      title: 'Pricing confusion',
      theme: 'pricing',
      primary_need: 'conversion',
      latest_brief_md: 'Users confused about pricing tiers',
      status: 'archived',
    })
    const s = signal({
      title: 'Pricing page is confusing',
      content: 'Users are confused about pricing tiers on checkout.',
    })
    const decision = fileSignal(s, [archived])
    expect(decision.kind).toBe('unfiled')
    if (decision.kind === 'unfiled') {
      expect(decision.reason).toBe('no_clusters')
    }
  })
})

describe('fileSignals', () => {
  it('groups attach decisions by cluster and surfaces unfiled ids', () => {
    const pricing = cluster({
      slug: 'pricing-confusion',
      title: 'Pricing confusion',
      theme: 'pricing',
      primary_need: 'conversion',
      latest_brief_md: 'Users confused by pricing tiers during checkout.',
    })
    const onboarding = cluster({
      slug: 'onboarding-friction',
      title: 'Onboarding friction',
      theme: 'onboarding',
      primary_need: 'ux_quality',
      latest_brief_md: 'Setup wizard drops users before completion.',
    })

    const s1 = signal({
      id: 's1',
      content: 'The pricing tiers shown on the pricing page are confusing during checkout.',
    })
    const s2 = signal({
      id: 's2',
      content: 'Users abandon the setup wizard during onboarding friction steps.',
    })
    const s3 = signal({ id: 's3', content: 'Random feedback about app icon color.' })

    const report = fileSignals([s1, s2, s3], [pricing, onboarding])

    expect(report.examinedClusters).toBe(2)
    expect(report.decisions).toHaveLength(3)
    expect(report.unfiledSignalIds).toContain('s3')
    const attachedIds = Object.values(report.attachedByCluster).flat()
    expect(attachedIds).toContain('s1')
    expect(attachedIds).toContain('s2')
  })
})
