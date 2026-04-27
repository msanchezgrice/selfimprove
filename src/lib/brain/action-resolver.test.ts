import { describe, expect, it } from 'vitest'

import {
  resolveAction,
  resolveActions,
  type ApprovalPolicy,
  type ClusterSnapshot,
  type RoadmapProjection,
} from './action-resolver'

function snapshot(overrides: Partial<ClusterSnapshot> = {}): ClusterSnapshot {
  return {
    id: 'cluster-1',
    slug: 'onboarding-friction',
    evidence_strength: 40,
    freshness_score: 80,
    confidence_score: 55,
    effort_score: 50,
    focus_weighted_score: 50,
    latest_brief_md: 'baseline brief',
    status: 'active',
    primary_need: 'conversion',
    theme: 'onboarding',
    ...overrides,
  }
}

function policy(overrides: Partial<ApprovalPolicy> = {}): ApprovalPolicy {
  return {
    automation_auto_approve: false,
    automation_auto_merge: false,
    automation_implement_enabled: true,
    safety_risk_threshold: 60,
    safety_max_files: 10,
    safety_max_lines: 400,
    safety_blocked_paths: [],
    safety_daily_cap: 3,
    ...overrides,
  }
}

function projection(overrides: Partial<RoadmapProjection> = {}): RoadmapProjection {
  return {
    id: 'roadmap-1',
    opportunity_cluster_id: 'cluster-1',
    prd_content: null,
    status: 'proposed',
    stage: 'roadmap',
    build_status: null,
    ...overrides,
  }
}

describe('resolveAction', () => {
  it('returns noop when nothing material changed', () => {
    const current = snapshot()
    const action = resolveAction({
      before: snapshot(),
      after: current,
      policy: policy(),
    })
    expect(action.kind).toBe('noop')
  })

  it('routes to refresh_brief when the thesis drifted (theme changed)', () => {
    const action = resolveAction({
      before: snapshot({ theme: 'pricing' }),
      after: snapshot({ theme: 'onboarding' }),
      policy: policy(),
    })
    expect(action.kind).toBe('refresh_brief')
  })

  it('routes to refresh_brief when focus score moved beyond the drift threshold', () => {
    const action = resolveAction({
      before: snapshot({ focus_weighted_score: 20 }),
      after: snapshot({ focus_weighted_score: 60 }),
      policy: policy(),
    })
    expect(action.kind).toBe('refresh_brief')
  })

  it('routes to rerank_only when evidence moved but focus did not', () => {
    const action = resolveAction({
      before: snapshot({ evidence_strength: 40, freshness_score: 70 }),
      after: snapshot({ evidence_strength: 50, freshness_score: 75 }),
      policy: policy(),
    })
    expect(action.kind).toBe('rerank_only')
  })

  it('routes to allow_prd when a cluster enters the ranked slice', () => {
    const action = resolveAction({
      before: snapshot({ focus_weighted_score: 20 }),
      after: snapshot({ focus_weighted_score: 80 }),
      policy: policy(),
      clusterRankInFocus: 4,
      roadmapSliceSize: 25,
    })
    expect(action.kind).toBe('allow_prd')
  })

  it('routes to queue_build when a PRD is approved and build is not yet queued', () => {
    const action = resolveAction({
      before: snapshot(),
      after: snapshot(),
      roadmapItem: projection({
        status: 'approved',
        prd_content: { problem: 'x' },
        build_status: null,
      }),
      policy: policy({ automation_auto_approve: true }),
    })
    expect(action.kind).toBe('queue_build')
    if (action.kind === 'queue_build') {
      expect(action.approvalMode).toBe('auto_approved')
    }
  })

  it('routes to request_approval when file count exceeds the safety cap', () => {
    const action = resolveAction({
      before: snapshot(),
      after: snapshot(),
      roadmapItem: projection({
        status: 'approved',
        prd_content: { problem: 'x' },
      }),
      policy: policy({ safety_max_files: 5 }),
      estimatedFilesTouched: 12,
    })
    expect(action.kind).toBe('request_approval')
    if (action.kind === 'request_approval') {
      expect(action.policyField).toBe('safety_max_files')
    }
  })

  it('routes to request_approval when implementation automation is disabled', () => {
    const action = resolveAction({
      before: snapshot(),
      after: snapshot(),
      roadmapItem: projection({
        status: 'approved',
        prd_content: { problem: 'x' },
      }),
      policy: policy({ automation_implement_enabled: false }),
    })
    expect(action.kind).toBe('request_approval')
    if (action.kind === 'request_approval') {
      expect(action.policyField).toBe('automation_implement_enabled')
    }
  })
})

describe('resolveActions', () => {
  it('maps an array of transitions to decisions preserving slug and id', () => {
    const result = resolveActions([
      {
        before: snapshot({ slug: 'a', id: 'ca' }),
        after: snapshot({ slug: 'a', id: 'ca' }),
        policy: policy(),
      },
      {
        before: snapshot({ slug: 'b', id: 'cb', theme: 'foo' }),
        after: snapshot({ slug: 'b', id: 'cb', theme: 'bar' }),
        policy: policy(),
      },
    ])
    expect(result[0]?.slug).toBe('a')
    expect(result[0]?.action.kind).toBe('noop')
    expect(result[1]?.slug).toBe('b')
    expect(result[1]?.action.kind).toBe('refresh_brief')
  })
})
