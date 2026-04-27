import type {
  OpportunityClusterRow,
  ProjectSettingsRow,
  RoadmapItemRow,
} from '@/lib/types/database'

/**
 * Action Resolver — the fourth resolver layer described in
 * docs/brain/project-brain-v1.md and docs/brain/RESOLVER.md.
 *
 *   "Turns state changes into the next action: rerank only, refresh a brief,
 *    draft a PRD, queue implementation, or ask for approval."
 *
 * Pure decision function. Given a cluster transition plus the project's
 * approval policy, return exactly one `Action` so callers can dispatch
 * without re-implementing the routing rules from the spec.
 */

export type Action =
  | { kind: 'rerank_only'; reason: string }
  | { kind: 'refresh_brief'; reason: string }
  | { kind: 'allow_prd'; reason: string }
  | { kind: 'queue_build'; reason: string; approvalMode: 'manual' | 'auto_approved' }
  | { kind: 'request_approval'; reason: string; policyField: string }
  | { kind: 'noop'; reason: string }

export type ClusterSnapshot = Pick<
  OpportunityClusterRow,
  | 'id'
  | 'slug'
  | 'evidence_strength'
  | 'freshness_score'
  | 'confidence_score'
  | 'effort_score'
  | 'focus_weighted_score'
  | 'latest_brief_md'
  | 'status'
  | 'primary_need'
  | 'theme'
>

export type RoadmapProjection = Pick<
  RoadmapItemRow,
  | 'id'
  | 'opportunity_cluster_id'
  | 'prd_content'
  | 'status'
  | 'stage'
  | 'build_status'
>

export type ApprovalPolicy = Pick<
  ProjectSettingsRow,
  | 'automation_auto_approve'
  | 'automation_auto_merge'
  | 'automation_implement_enabled'
  | 'safety_risk_threshold'
  | 'safety_max_files'
  | 'safety_max_lines'
  | 'safety_blocked_paths'
  | 'safety_daily_cap'
>

export type ActionResolverInput = {
  before: ClusterSnapshot | null
  after: ClusterSnapshot
  /** Roadmap row this cluster currently projects into, if any. */
  roadmapItem?: RoadmapProjection | null
  policy: ApprovalPolicy | null
  /** Top-N slice size for the ranked roadmap. Default 25, per BACKLOG_LAYERS. */
  roadmapSliceSize?: number
  /** Current rank of the cluster in the focus-weighted order (1-based). */
  clusterRankInFocus?: number
  /** Model-estimated blast radius for the linked roadmap item, if known. */
  estimatedFilesTouched?: number
  estimatedLinesChanged?: number
}

const THESIS_DRIFT_THRESHOLD = 12 // focus_weighted_score points
const MATERIAL_MOVE_THRESHOLD = 6 // focus_weighted_score points

/**
 * Decide the next action for a single cluster given the transition from
 * `before` to `after`. Follows the spec's ordered routing rules:
 *
 *   1. policy block (blast radius / blocked paths) → request_approval
 *   2. approved PRD → queue_build
 *   3. cluster newly entered the roadmap slice → allow_prd
 *   4. cluster thesis meaningfully changed → refresh_brief
 *   5. evidence moved but priority did not → rerank_only
 *   6. otherwise → noop
 */
export function resolveAction(input: ActionResolverInput): Action {
  const sliceSize = input.roadmapSliceSize ?? 25
  const { before, after } = input

  // (1) Safety gates beat everything else. If a build would exceed the caps,
  // stop dispatching automatically and route to manual approval.
  const safetyViolation = detectSafetyViolation(input)
  if (safetyViolation) return safetyViolation

  // (2) If a PRD is already approved on the projection row, the next action
  // is to emit the execution packet. This mirrors what PATCH /roadmap/[id]
  // already does on the "approved" status transition.
  if (
    input.roadmapItem?.status === 'approved' &&
    input.roadmapItem.prd_content &&
    input.roadmapItem.build_status !== 'queued' &&
    input.roadmapItem.build_status !== 'pr_created' &&
    input.roadmapItem.build_status !== 'merged'
  ) {
    const approvalMode: 'manual' | 'auto_approved' =
      input.policy?.automation_implement_enabled && input.policy.automation_auto_approve
        ? 'auto_approved'
        : 'manual'
    return {
      kind: 'queue_build',
      reason: 'PRD approved and build not yet queued',
      approvalMode,
    }
  }

  // (3) Cluster newly enters the ranked roadmap slice → allow PRD generation.
  if (input.clusterRankInFocus && input.clusterRankInFocus <= sliceSize) {
    const wasOutOfSlice =
      !before ||
      (before.focus_weighted_score ?? 0) < (after.focus_weighted_score ?? 0) - MATERIAL_MOVE_THRESHOLD
    if (wasOutOfSlice && !input.roadmapItem?.prd_content) {
      return {
        kind: 'allow_prd',
        reason: `cluster entered ranked roadmap slice (rank=${input.clusterRankInFocus}/${sliceSize})`,
      }
    }
  }

  // (4) Cluster thesis drifted: brief should be regenerated.
  if (clusterThesisChanged(before, after)) {
    return {
      kind: 'refresh_brief',
      reason: 'focus-weighted score drifted beyond the material-move threshold',
    }
  }

  // (5) Evidence changed but priority is essentially stable: just rerank.
  if (before && evidenceChanged(before, after) && !priorityMovedMaterially(before, after)) {
    return {
      kind: 'rerank_only',
      reason: 'evidence strength/freshness moved but focus-weighted rank held',
    }
  }

  // (6) No meaningful change.
  return {
    kind: 'noop',
    reason: 'no material cluster change since last pass',
  }
}

/**
 * Resolve actions for an array of cluster transitions. Handy for wiring
 * into `generate-roadmap` post-processing and for the `/brain-v1/runtime`
 * "next actions" surface.
 */
export function resolveActions(
  inputs: ActionResolverInput[],
): Array<{ clusterId: string; slug: string; action: Action }> {
  return inputs.map((input) => ({
    clusterId: input.after.id,
    slug: input.after.slug,
    action: resolveAction(input),
  }))
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function clusterThesisChanged(
  before: ClusterSnapshot | null,
  after: ClusterSnapshot,
): boolean {
  if (!before) return true
  const drift = Math.abs((after.focus_weighted_score ?? 0) - (before.focus_weighted_score ?? 0))
  const themeShift = (before.theme ?? '') !== (after.theme ?? '')
  const needShift = (before.primary_need ?? '') !== (after.primary_need ?? '')
  const briefShift = (before.latest_brief_md ?? '') !== (after.latest_brief_md ?? '')
  return drift >= THESIS_DRIFT_THRESHOLD || themeShift || needShift || briefShift
}

function evidenceChanged(
  before: ClusterSnapshot,
  after: ClusterSnapshot,
): boolean {
  return (
    before.evidence_strength !== after.evidence_strength ||
    before.freshness_score !== after.freshness_score ||
    before.confidence_score !== after.confidence_score
  )
}

function priorityMovedMaterially(
  before: ClusterSnapshot,
  after: ClusterSnapshot,
): boolean {
  return (
    Math.abs((after.focus_weighted_score ?? 0) - (before.focus_weighted_score ?? 0)) >=
    MATERIAL_MOVE_THRESHOLD
  )
}

function detectSafetyViolation(input: ActionResolverInput): Action | null {
  const { policy, estimatedFilesTouched, estimatedLinesChanged, roadmapItem } = input
  if (!policy) return null

  // Only evaluate safety when a build transition is plausible.
  if (!roadmapItem || roadmapItem.status !== 'approved' || !roadmapItem.prd_content) {
    return null
  }

  if (
    estimatedFilesTouched != null &&
    estimatedFilesTouched > policy.safety_max_files
  ) {
    return {
      kind: 'request_approval',
      reason: `estimated files touched (${estimatedFilesTouched}) exceeds safety_max_files (${policy.safety_max_files})`,
      policyField: 'safety_max_files',
    }
  }

  if (
    estimatedLinesChanged != null &&
    estimatedLinesChanged > policy.safety_max_lines
  ) {
    return {
      kind: 'request_approval',
      reason: `estimated lines changed (${estimatedLinesChanged}) exceeds safety_max_lines (${policy.safety_max_lines})`,
      policyField: 'safety_max_lines',
    }
  }

  if (!policy.automation_implement_enabled) {
    return {
      kind: 'request_approval',
      reason: 'automation_implement_enabled is false for this project',
      policyField: 'automation_implement_enabled',
    }
  }

  return null
}
