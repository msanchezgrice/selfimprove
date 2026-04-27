import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  OpportunityClusterRow,
  RoadmapItemRow,
} from '@/lib/types/database'

import { FOCUS_MODES, type FocusMode } from './design'
import {
  computeFreshnessScore,
  computeNeedAlignment,
  computeFocusWeightedScore,
  type ClusterScores,
} from './ranking'

/**
 * Roadmap rerank engine.
 *
 * Two surfaces:
 *   1. `rerankProjectRoadmap`  — DB writer used by /api/cron/roadmap-rerank.
 *      Refreshes cluster scores, demotes stale roadmap items, promotes
 *      fresh briefs into the freed slots. Pure deterministic; no model call.
 *   2. `rankRoadmapItems` — pure read-only function used by
 *      /api/projects/[id]/roadmap to render filter-aware orderings on the fly.
 *      Doesn't write; respects user filters; can override the project's
 *      stored focus_mode for a single request without persisting.
 *
 * The rerank is decoupled from synthesis on purpose. Synthesis is expensive
 * and respects a 6h cooldown. Rerank is cheap and fires daily.
 */

// ---------------------------------------------------------------------------
// Pure ranking
// ---------------------------------------------------------------------------

export type RoadmapItemForRanking = Pick<
  RoadmapItemRow,
  | 'id'
  | 'project_id'
  | 'title'
  | 'description'
  | 'category'
  | 'status'
  | 'stage'
  | 'rank'
  | 'confidence'
  | 'roi_score'
  | 'impact'
  | 'size'
  | 'updated_at'
  | 'created_at'
  | 'opportunity_cluster_id'
  | 'prd_content'
  | 'dismiss_reason'
>

export type RoadmapFilter = {
  /** Override the persisted current_focus for this view. */
  focus?: FocusMode['name']
  /** Whitelist of categories. Empty / undefined = all. */
  category?: string[]
  /** Minimum confidence to surface. */
  minConfidence?: number
  /** Minimum focus-weighted cluster score. */
  minClusterScore?: number
  /** Restrict to specific cluster slugs. */
  clusterSlugs?: string[]
  /** Restrict to specific item statuses (default: ['proposed', 'approved']). */
  status?: string[]
  /** Limit returned items. Default 25. */
  limit?: number
}

export type RankedItem = {
  item: RoadmapItemForRanking
  cluster: OpportunityClusterRow | null
  itemRoi: number
  clusterFocusScore: number | null
  combinedScore: number
  reason: string
}

const FOCUS_BY_NAME = new Map<string, FocusMode>(FOCUS_MODES.map((m) => [m.name, m]))

/**
 * Pure ordering function. Given the items, their clusters, and a filter,
 * return the top-N ordered items along with the score components that
 * produced the order. Doesn't read or write the DB. Used by both the cron
 * path and the on-demand query route.
 *
 * The combined score is a weighted blend:
 *   60% cluster focus_weighted_score + 40% item ROI score (normalized).
 *
 * When the filter requests a different focus mode than the cluster's
 * persisted score implies, we recompute alignment locally so the user
 * sees what *that* focus would surface without persisting anything.
 */
export function rankRoadmapItems(
  items: RoadmapItemForRanking[],
  clusters: OpportunityClusterRow[],
  filter: RoadmapFilter = {},
): RankedItem[] {
  const allowedStatus = new Set(filter.status ?? ['proposed', 'approved', 'building'])
  const allowedCategories = filter.category ? new Set(filter.category) : null
  const minConfidence = filter.minConfidence ?? 0
  const minClusterScore = filter.minClusterScore ?? 0
  const clusterSlugFilter = filter.clusterSlugs ? new Set(filter.clusterSlugs) : null

  const clusterById = new Map<string, OpportunityClusterRow>()
  for (const cluster of clusters) clusterById.set(cluster.id, cluster)

  const focusMode = filter.focus ? FOCUS_BY_NAME.get(filter.focus) ?? null : null

  const ranked: RankedItem[] = []
  const now = new Date()

  for (const item of items) {
    if (!allowedStatus.has(item.status)) continue
    if (allowedCategories && !allowedCategories.has(item.category)) continue
    if (item.confidence < minConfidence) continue

    const cluster = item.opportunity_cluster_id
      ? clusterById.get(item.opportunity_cluster_id) ?? null
      : null

    if (clusterSlugFilter && (!cluster || !clusterSlugFilter.has(cluster.slug))) continue

    let clusterFocusScore: number | null = null
    let reason = ''

    if (cluster) {
      if (focusMode) {
        // Recompute focus-weighted with the requested override.
        clusterFocusScore = recomputeClusterFocusScore(cluster, focusMode, now)
        reason = `Recomputed under filter focus=${focusMode.name}.`
      } else {
        clusterFocusScore = cluster.focus_weighted_score
        reason = 'Persisted focus_weighted_score (no filter override).'
      }
    } else {
      reason = 'No linked cluster — using item ROI alone.'
    }

    if (clusterFocusScore != null && clusterFocusScore < minClusterScore) continue

    // ROI normalization: cap at 50 (the table tops out roughly there).
    const itemRoi = Math.min(50, Math.max(0, item.roi_score ?? 0))
    const itemRoiNorm = (itemRoi / 50) * 100

    const combined =
      clusterFocusScore != null
        ? Math.round(0.6 * clusterFocusScore + 0.4 * itemRoiNorm)
        : Math.round(itemRoiNorm)

    ranked.push({
      item,
      cluster,
      itemRoi,
      clusterFocusScore,
      combinedScore: combined,
      reason,
    })
  }

  ranked.sort((a, b) => b.combinedScore - a.combinedScore)

  const limit = filter.limit ?? 25
  return ranked.slice(0, limit)
}

/**
 * Recompute a cluster's focus_weighted_score under a filter-supplied focus
 * mode. Pure: doesn't write.
 */
export function recomputeClusterFocusScore(
  cluster: OpportunityClusterRow,
  focus: FocusMode,
  now: Date = new Date(),
): number {
  // We don't have the source rows here, so reuse the persisted component
  // scores and recompute only the focus-alignment overlay.
  const scores: ClusterScores = {
    evidenceStrength: cluster.evidence_strength,
    freshnessScore: cluster.last_signal_at
      ? computeFreshnessScore(cluster.last_signal_at, now)
      : cluster.freshness_score,
    confidenceScore: cluster.confidence_score,
    effortScore: cluster.effort_score,
    focusWeightedScore: cluster.focus_weighted_score,
    needAlignment: computeNeedAlignment(cluster.primary_need, cluster.need_vector, focus),
  }
  return computeFocusWeightedScore({
    evidence: scores.evidenceStrength,
    freshness: scores.freshnessScore,
    confidence: scores.confidenceScore,
    effort: scores.effortScore,
    needAlignment: scores.needAlignment,
  })
}

// ---------------------------------------------------------------------------
// DB-writing rerank for the cron
// ---------------------------------------------------------------------------

export type RerankResult = {
  projectId: string
  clustersRescored: number
  itemsDemoted: number
  itemsPromoted: number
  briefsAvailable: number
  errors: string[]
}

export type RerankOptions = {
  /** Roadmap slot cap. Default 25. Matches autoPromoteBriefs. */
  cap?: number
  /** Demote items with stage=roadmap that haven't moved in N days. Default 14. */
  demoteAfterDays?: number
  /** Confidence floor for promotion. Default 70. */
  promotionConfidenceFloor?: number
  /** Cluster focus-score floor for promotion. Default 50. */
  promotionFocusFloor?: number
  dryRun?: boolean
}

const DEFAULT_OPTIONS: Required<RerankOptions> = {
  cap: 25,
  demoteAfterDays: 14,
  promotionConfidenceFloor: 70,
  promotionFocusFloor: 50,
  dryRun: false,
}

/**
 * Run the daily rerank for one project.
 *
 *  1. Recompute every active cluster's focus-weighted score under the
 *     project's persisted current_focus.
 *  2. Demote roadmap-stage items that are stale + low-relevance under the
 *     refreshed scores. Frees cap slots.
 *  3. Promote the highest-combined-score briefs that meet thresholds.
 *
 * No model calls. Safe to run unattended every day.
 */
export async function rerankProjectRoadmap(
  supabase: SupabaseClient,
  projectId: string,
  options: RerankOptions = {},
): Promise<RerankResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const result: RerankResult = {
    projectId,
    clustersRescored: 0,
    itemsDemoted: 0,
    itemsPromoted: 0,
    briefsAvailable: 0,
    errors: [],
  }

  // 1. Load project current_focus
  const { data: focusPage } = await supabase
    .from('brain_pages')
    .select('slug')
    .eq('project_id', projectId)
    .eq('kind', 'current_focus')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const focusSlug = (focusPage as { slug: string } | null)?.slug ?? null
  const focusMode = focusSlug ? FOCUS_BY_NAME.get(focusSlug) ?? null : null

  // 2. Rescore clusters under that focus.
  const { data: clusters } = await supabase
    .from('opportunity_clusters')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'active')

  const clusterRows = (clusters ?? []) as OpportunityClusterRow[]
  const now = new Date()
  const updates: Array<{ id: string; focus_weighted_score: number; freshness_score: number }> = []
  for (const cluster of clusterRows) {
    if (!focusMode) {
      // No focus set: just refresh freshness from last_signal_at.
      const fresh = cluster.last_signal_at
        ? computeFreshnessScore(cluster.last_signal_at, now)
        : cluster.freshness_score
      updates.push({
        id: cluster.id,
        focus_weighted_score: cluster.focus_weighted_score,
        freshness_score: fresh,
      })
      continue
    }
    const fresh = cluster.last_signal_at
      ? computeFreshnessScore(cluster.last_signal_at, now)
      : cluster.freshness_score
    const focusScore = computeFocusWeightedScore({
      evidence: cluster.evidence_strength,
      freshness: fresh,
      confidence: cluster.confidence_score,
      effort: cluster.effort_score,
      needAlignment: computeNeedAlignment(cluster.primary_need, cluster.need_vector, focusMode),
    })
    updates.push({
      id: cluster.id,
      focus_weighted_score: focusScore,
      freshness_score: fresh,
    })
  }

  if (!opts.dryRun) {
    for (const u of updates) {
      const { error } = await supabase
        .from('opportunity_clusters')
        .update({
          focus_weighted_score: u.focus_weighted_score,
          freshness_score: u.freshness_score,
        })
        .eq('id', u.id)
      if (error) {
        result.errors.push(`rescore ${u.id}: ${error.message}`)
      } else {
        result.clustersRescored += 1
      }
    }
  } else {
    result.clustersRescored = updates.length
  }

  // 3. Demote stale roadmap items.
  const cutoff = new Date(now.getTime() - opts.demoteAfterDays * 24 * 60 * 60 * 1000).toISOString()
  const { data: stale } = await supabase
    .from('roadmap_items')
    .select('id, opportunity_cluster_id, updated_at, prd_content, pr_url')
    .eq('project_id', projectId)
    .eq('stage', 'roadmap')
    .eq('status', 'proposed')
    .lt('updated_at', cutoff)
    .is('pr_url', null)
    .is('prd_content', null)

  const demoteIds = (stale ?? []).map((row: { id: string }) => row.id)
  if (demoteIds.length > 0 && !opts.dryRun) {
    const { error: demoteErr } = await supabase
      .from('roadmap_items')
      .update({ stage: 'brief', status: 'proposed' })
      .in('id', demoteIds)
    if (demoteErr) {
      result.errors.push(`demote: ${demoteErr.message}`)
    } else {
      result.itemsDemoted = demoteIds.length
    }
  } else {
    result.itemsDemoted = demoteIds.length
  }

  // 4. Re-promote up to cap from the brief pool, ordered by combined score.
  const { data: roadmapCount } = await supabase
    .from('roadmap_items')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('stage', 'roadmap')
    .in('status', ['proposed', 'approved', 'building'])
  const currentCount = (roadmapCount as unknown as number | null) ?? 0
  const slotsAvailable = Math.max(0, opts.cap - currentCount)
  result.briefsAvailable = slotsAvailable

  if (slotsAvailable > 0) {
    // Pull all eligible briefs and rank with the same pure function.
    const { data: briefs } = await supabase
      .from('roadmap_items')
      .select(
        'id, project_id, title, description, category, status, stage, rank, confidence, roi_score, impact, size, updated_at, created_at, opportunity_cluster_id, prd_content',
      )
      .eq('project_id', projectId)
      .eq('stage', 'brief')
      .eq('status', 'proposed')
      .gte('confidence', opts.promotionConfidenceFloor)

    const ranked = rankRoadmapItems(
      (briefs ?? []) as RoadmapItemForRanking[],
      // Reload clusters with the freshly-rescored values.
      ((await supabase
        .from('opportunity_clusters')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'active')).data ?? []) as OpportunityClusterRow[],
      {
        focus: focusMode?.name,
        minClusterScore: opts.promotionFocusFloor,
        limit: slotsAvailable,
      },
    )

    if (ranked.length > 0 && !opts.dryRun) {
      for (let i = 0; i < ranked.length; i++) {
        const entry = ranked[i]
        const { error: promoteErr } = await supabase
          .from('roadmap_items')
          .update({ stage: 'roadmap', rank: currentCount + i + 1 })
          .eq('id', entry.item.id)
        if (promoteErr) {
          result.errors.push(`promote ${entry.item.id}: ${promoteErr.message}`)
        } else {
          result.itemsPromoted += 1
        }
      }
    } else if (opts.dryRun) {
      result.itemsPromoted = ranked.length
    }
  }

  return result
}
