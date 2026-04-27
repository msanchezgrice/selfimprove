import { describe, expect, it } from 'vitest'

import {
  buildFunnelStopUpdate,
  classifyEvent,
  detectAnomaly,
  funnelClusterSlug,
  inferUpstream,
  type FunnelStopRow,
} from './funnel'

describe('classifyEvent', () => {
  it('flags errors / failures / crashes as error role', () => {
    expect(classifyEvent('onboarding_step_validation_failed')).toBe('error')
    expect(classifyEvent('checkout_error')).toBe('error')
    expect(classifyEvent('app_crash')).toBe('error')
  })

  it('flags purchase / signup completions as bottom', () => {
    expect(classifyEvent('purchase_completed')).toBe('bottom')
    expect(classifyEvent('checkout_completed')).toBe('bottom')
    expect(classifyEvent('auth_sign_up_completed')).toBe('bottom')
    expect(classifyEvent('subscribed')).toBe('bottom')
  })

  it('flags clicks / plays / opens as middle', () => {
    expect(classifyEvent('landing_cta_clicked')).toBe('middle')
    expect(classifyEvent('preview_played')).toBe('middle')
    expect(classifyEvent('email_opened')).toBe('middle')
  })

  it('flags views / visits as top', () => {
    expect(classifyEvent('landing_page_viewed')).toBe('top')
    expect(classifyEvent('home_visited')).toBe('top')
  })

  it('flags repeat_visit and email_sent as engagement', () => {
    expect(classifyEvent('repeat_visit')).toBe('engagement')
    expect(classifyEvent('email_sent')).toBe('engagement')
  })

  it('falls back to event when nothing matches', () => {
    expect(classifyEvent('something_random_thing')).toBe('event')
  })
})

describe('inferUpstream', () => {
  const events = [
    'landing_page_viewed',
    'landing_cta_clicked',
    'create_flow_viewed',
    'onboarding_step_viewed',
    'onboarding_step_completed',
    'preview_played',
    'purchase_completed',
  ]

  it('returns null for top-of-funnel events', () => {
    expect(inferUpstream('landing_page_viewed', events)).toBeNull()
  })

  it('matches by shared prefix when available', () => {
    expect(inferUpstream('landing_cta_clicked', events)).toBe('landing_page_viewed')
    expect(inferUpstream('onboarding_step_completed', events)).toBe('onboarding_step_viewed')
  })

  it('falls back to a one-tier-up event when nothing else fits', () => {
    expect(inferUpstream('purchase_completed', ['preview_played', 'purchase_completed'])).toBe('preview_played')
  })
})

describe('funnelClusterSlug', () => {
  it('produces stable kebab-case slugs', () => {
    expect(funnelClusterSlug('onboarding_step_completed')).toBe('funnel-onboarding-step-completed')
    expect(funnelClusterSlug('Purchase  Completed!')).toBe('funnel-purchase-completed')
  })
})

describe('buildFunnelStopUpdate', () => {
  it('computes rate vs upstream when both counts exist', () => {
    const update = buildFunnelStopUpdate({
      eventName: 'landing_cta_clicked',
      count24h: 14,
      count7d: 101,
      count28d: 380,
      trend: { current: 101, previous: 90, trendPct: 0.122 },
      upstreamEvent: 'landing_page_viewed',
      upstreamCount7d: 700,
      upstreamCount28d: 2800,
      upstreamTrend: { current: 700, previous: 680, trendPct: 0.029 },
      lastObserved: '2026-04-26T10:00:00Z',
    })
    expect(update.rateVsUpstream7d).toBeCloseTo(101 / 700, 4)
    expect(update.role).toBe('middle')
  })

  it('returns null rate when upstream is missing', () => {
    const update = buildFunnelStopUpdate({
      eventName: 'landing_page_viewed',
      count24h: 50,
      count7d: 700,
      count28d: 2800,
      trend: null,
      upstreamEvent: null,
      upstreamCount7d: null,
      upstreamCount28d: null,
      upstreamTrend: null,
      lastObserved: '2026-04-26T10:00:00Z',
    })
    expect(update.rateVsUpstream7d).toBeNull()
  })
})

describe('detectAnomaly', () => {
  function stop(overrides: Partial<FunnelStopRow> = {}): FunnelStopRow {
    return {
      id: 'stop-1',
      event_name: 'preview_played',
      upstream_event: 'create_flow_viewed',
      funnel_role: 'middle',
      count_24h: 12,
      count_7d: 95,
      count_28d: 380,
      rate_vs_upstream_7d: 0.61,
      rate_vs_upstream_28d: 0.6,
      trend_count_7d: 0,
      trend_rate_7d: 0,
      last_observed: '2026-04-26T10:00:00Z',
      ...overrides,
    }
  }

  it('returns first_seen when prior is null and count clears the floor', () => {
    const decision = detectAnomaly(null, {
      eventName: 'preview_played',
      role: 'middle',
      upstreamEvent: 'create_flow_viewed',
      count24h: 12,
      count7d: 95,
      count28d: 380,
      upstreamCount7d: 155,
      rateVsUpstream7d: 0.61,
      rateVsUpstream28d: 0.6,
      trendCount7d: null,
      trendRate7d: null,
      lastObserved: '2026-04-26T10:00:00Z',
    })
    expect(decision?.kind).toBe('first_seen')
  })

  it('returns null when prior is null and the count is below the floor', () => {
    expect(
      detectAnomaly(null, {
        eventName: 'rare_event',
        role: 'event',
        upstreamEvent: null,
        count24h: 1,
        count7d: 8,
        count28d: 12,
        upstreamCount7d: null,
        rateVsUpstream7d: null,
        rateVsUpstream28d: null,
        trendCount7d: null,
        trendRate7d: null,
        lastObserved: '2026-04-26T10:00:00Z',
      }),
    ).toBeNull()
  })

  it('flags a count drop above threshold', () => {
    const decision = detectAnomaly(stop(), {
      eventName: 'preview_played',
      role: 'middle',
      upstreamEvent: 'create_flow_viewed',
      count24h: 5,
      count7d: 60,
      count28d: 280,
      upstreamCount7d: 155,
      rateVsUpstream7d: 0.39,
      rateVsUpstream28d: 0.55,
      trendCount7d: -0.36, // -36% week-over-week
      trendRate7d: null,
      lastObserved: '2026-04-26T10:00:00Z',
    })
    expect(decision?.kind).toBe('count_drop')
    expect(decision?.severity).toBeGreaterThanOrEqual(2)
  })

  it('flags a rate drop on a stop with upstream', () => {
    const decision = detectAnomaly(stop(), {
      eventName: 'preview_played',
      role: 'middle',
      upstreamEvent: 'create_flow_viewed',
      count24h: 9,
      count7d: 95,
      count28d: 380,
      upstreamCount7d: 240,
      rateVsUpstream7d: 0.4,
      rateVsUpstream28d: 0.55,
      trendCount7d: 0.02,
      trendRate7d: -0.34, // 34% rate drop
      lastObserved: '2026-04-26T10:00:00Z',
    })
    expect(decision?.kind).toBe('rate_drop')
  })

  it('returns null when the move is too small to matter', () => {
    expect(
      detectAnomaly(stop(), {
        eventName: 'preview_played',
        role: 'middle',
        upstreamEvent: 'create_flow_viewed',
        count24h: 12,
        count7d: 95,
        count28d: 380,
        upstreamCount7d: 155,
        rateVsUpstream7d: 0.62,
        rateVsUpstream28d: 0.6,
        trendCount7d: 0.05,
        trendRate7d: 0.02,
        lastObserved: '2026-04-26T10:00:00Z',
      }),
    ).toBeNull()
  })

  it('emits a count_trend at lower severity for moves between 7-20%', () => {
    const decision = detectAnomaly(stop(), {
      eventName: 'preview_played',
      role: 'middle',
      upstreamEvent: 'create_flow_viewed',
      count24h: 11,
      count7d: 84,
      count28d: 360,
      upstreamCount7d: 155,
      rateVsUpstream7d: 0.54,
      rateVsUpstream28d: 0.55,
      trendCount7d: -0.12, // -12% week-over-week — trend tier
      trendRate7d: null,
      lastObserved: '2026-04-26T10:00:00Z',
    })
    expect(decision?.kind).toBe('count_trend')
    expect(decision?.severity).toBeLessThanOrEqual(2)
  })

  it('emits a rate_trend at lower severity for conversion moves between 7-15%', () => {
    const decision = detectAnomaly(stop(), {
      eventName: 'preview_played',
      role: 'middle',
      upstreamEvent: 'create_flow_viewed',
      count24h: 10,
      count7d: 90,
      count28d: 380,
      upstreamCount7d: 200,
      rateVsUpstream7d: 0.45,
      rateVsUpstream28d: 0.5,
      trendCount7d: 0.02,
      trendRate7d: -0.10, // 10% rate dip — trend tier
      lastObserved: '2026-04-26T10:00:00Z',
    })
    expect(decision?.kind).toBe('rate_trend')
    expect(decision?.severity).toBeLessThanOrEqual(2)
  })

  it('ignores moves on tiny populations', () => {
    expect(
      detectAnomaly(stop({ count_7d: 12 }), {
        eventName: 'preview_played',
        role: 'middle',
        upstreamEvent: 'create_flow_viewed',
        count24h: 1,
        count7d: 7,
        count28d: 30,
        upstreamCount7d: 11,
        rateVsUpstream7d: 0.6,
        rateVsUpstream28d: 0.5,
        trendCount7d: -0.45,
        trendRate7d: null,
        lastObserved: '2026-04-26T10:00:00Z',
      }),
    ).toBeNull()
  })
})
