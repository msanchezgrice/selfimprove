import { describe, expect, it } from 'vitest'

import { decideFocus } from './auto-focus'
import type { FunnelAnomalyRow, FunnelStopRow } from '@/lib/types/database'

function stop(overrides: Partial<FunnelStopRow> = {}): FunnelStopRow {
  return {
    id: overrides.id ?? `stop-${overrides.event_name ?? 'x'}`,
    project_id: 'p1',
    event_name: 'preview_played',
    upstream_event: null,
    funnel_role: 'middle',
    count_24h: 10,
    count_7d: 70,
    count_28d: 300,
    rate_vs_upstream_7d: null,
    rate_vs_upstream_28d: null,
    trend_count_7d: null,
    trend_rate_7d: null,
    last_observed: '2026-04-26T10:00:00Z',
    last_rolled_up_at: '2026-04-26T10:00:00Z',
    metadata: {},
    created_at: '2026-04-20T10:00:00Z',
    updated_at: '2026-04-26T10:00:00Z',
    ...overrides,
  }
}

function anomaly(
  overrides: Partial<FunnelAnomalyRow>,
): FunnelAnomalyRow {
  return {
    id: overrides.id ?? `a-${Math.random()}`,
    project_id: 'p1',
    funnel_stop_id: overrides.funnel_stop_id ?? 'stop-x',
    kind: overrides.kind ?? 'rate_drop',
    baseline: overrides.baseline ?? 0.6,
    observed: overrides.observed ?? 0.4,
    delta_pct: overrides.delta_pct ?? -0.33,
    window_start: '2026-04-19T10:00:00Z',
    window_end: '2026-04-26T10:00:00Z',
    severity: overrides.severity ?? 3,
    status: overrides.status ?? 'open',
    resolved_at: null,
    resolution_note: null,
    source: 'cron',
    signal_id: null,
    metadata: {},
    created_at: '2026-04-26T10:00:00Z',
    updated_at: '2026-04-26T10:00:00Z',
  }
}

describe('decideFocus', () => {
  it('defaults to conversion when there is no evidence', () => {
    const decision = decideFocus([], [])
    expect(decision.mode).toBe('conversion')
    expect(decision.confidence).toBeLessThan(0.5)
  })

  it('chooses ux_quality when error events spiked', () => {
    const errorStop = stop({ id: 'err', event_name: 'onboarding_failed', funnel_role: 'error' })
    const decision = decideFocus(
      [errorStop],
      [
        anomaly({
          funnel_stop_id: errorStop.id,
          kind: 'count_spike',
          delta_pct: 0.6,
          severity: 4,
        }),
      ],
    )
    expect(decision.mode).toBe('ux_quality')
    expect(decision.confidence).toBeGreaterThan(0.5)
  })

  it('chooses conversion when bottom-of-funnel rate dropped', () => {
    const bottomStop = stop({
      id: 'b',
      event_name: 'purchase_completed',
      funnel_role: 'bottom',
    })
    const decision = decideFocus(
      [bottomStop],
      [
        anomaly({
          funnel_stop_id: bottomStop.id,
          kind: 'rate_drop',
          delta_pct: -0.42,
          severity: 4,
        }),
      ],
    )
    expect(decision.mode).toBe('conversion')
  })

  it('chooses retention when engagement events declined', () => {
    const eng = stop({ id: 'e', event_name: 'repeat_visit', funnel_role: 'engagement' })
    const decision = decideFocus(
      [eng],
      [
        anomaly({
          funnel_stop_id: eng.id,
          kind: 'count_drop',
          delta_pct: -0.32,
          severity: 3,
        }),
      ],
    )
    expect(decision.mode).toBe('retention')
  })

  it('chooses virality when top-of-funnel volume spiked', () => {
    const topStop = stop({
      id: 't',
      event_name: 'landing_page_viewed',
      funnel_role: 'top',
    })
    const decision = decideFocus(
      [topStop],
      [
        anomaly({
          funnel_stop_id: topStop.id,
          kind: 'count_spike',
          delta_pct: 0.8,
          severity: 4,
        }),
      ],
    )
    expect(decision.mode).toBe('virality')
  })

  it('ignores anomalies below the magnitude floor', () => {
    const errorStop = stop({ id: 'err', event_name: 'onboarding_failed', funnel_role: 'error' })
    const decision = decideFocus(
      [errorStop],
      [
        anomaly({
          funnel_stop_id: errorStop.id,
          kind: 'count_spike',
          delta_pct: 0.02,
          severity: 1,
        }),
      ],
    )
    // Tiny delta → falls into the no-evidence default.
    expect(decision.mode).toBe('conversion')
    expect(decision.confidence).toBeLessThan(0.5)
  })

  it('ignores resolved anomalies', () => {
    const errorStop = stop({ id: 'err', event_name: 'onboarding_failed', funnel_role: 'error' })
    const decision = decideFocus(
      [errorStop],
      [
        anomaly({
          funnel_stop_id: errorStop.id,
          kind: 'count_spike',
          delta_pct: 0.6,
          severity: 4,
          status: 'resolved',
        }),
      ],
    )
    expect(decision.mode).toBe('conversion') // default; the anomaly was filtered out
  })
})
