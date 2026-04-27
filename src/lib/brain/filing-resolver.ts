import type { OpportunityClusterRow, SignalRow } from '@/lib/types/database'

import { cosineSimilarity, termFrequency, tokenize } from '@/lib/ai/dedup-signals'

/**
 * Deterministic filing resolver.
 *
 * "File by primary product subject, not by source format or skill name."
 * See docs/brain/skills/_filing-rules.md.
 *
 * Given a signal and the set of active opportunity clusters, decide which
 * existing cluster (if any) is the natural home. Below a confidence threshold
 * the signal is "unfiled" and gets handed to the synthesis skill so the model
 * can judge whether the signal justifies a new cluster.
 *
 * The job of this module is NOT to invent new clusters. That is a latent
 * decision and lives in the `roadmap-synthesis` skill.
 */

export type FilingInputCluster = Pick<
  OpportunityClusterRow,
  | 'id'
  | 'slug'
  | 'title'
  | 'theme'
  | 'primary_need'
  | 'latest_brief_md'
  | 'status'
>

export type FilingInputSignal = Pick<
  SignalRow,
  'id' | 'type' | 'title' | 'content' | 'weight'
>

export type FilingDecision =
  | {
      kind: 'attach'
      clusterId: string
      clusterSlug: string
      score: number
      signalId: string
    }
  | {
      kind: 'unfiled'
      signalId: string
      bestScore: number
      bestClusterSlug: string | null
      reason: 'no_clusters' | 'below_threshold'
    }

export type FilingReport = {
  decisions: FilingDecision[]
  attachedByCluster: Record<string, string[]>
  unfiledSignalIds: string[]
  examinedClusters: number
}

/** Signals below this cosine score fall through to the synthesis skill. */
export const FILING_ATTACH_THRESHOLD = 0.35

/** Score a single (signal, cluster) pair. Exported for tests and debugging. */
export function scoreClusterMatch(
  signal: FilingInputSignal,
  cluster: FilingInputCluster,
): number {
  const signalText = `${signal.title ?? ''} ${signal.content}`
  const clusterText = [
    cluster.title,
    cluster.theme,
    cluster.primary_need,
    cluster.latest_brief_md,
    cluster.slug.replace(/-/g, ' '),
  ]
    .filter(Boolean)
    .join(' ')

  const signalTokens = tokenize(signalText)
  const clusterTokens = tokenize(clusterText)
  if (signalTokens.length === 0 || clusterTokens.length === 0) return 0

  const tfSignal = termFrequency(signalTokens)
  const tfCluster = termFrequency(clusterTokens)
  const cosine = cosineSimilarity(tfSignal, tfCluster)

  // Boost for exact primary-need or theme substring match so a clearly
  // labelled "pricing confusion" signal files with the "pricing" cluster even
  // when the vocabulary only overlaps on one or two tokens.
  const signalLower = signalText.toLowerCase()
  let boost = 0
  if (cluster.primary_need && signalLower.includes(cluster.primary_need.toLowerCase())) {
    boost += 0.15
  }
  if (cluster.theme && signalLower.includes(cluster.theme.toLowerCase())) {
    boost += 0.1
  }

  return Math.min(1, cosine + boost)
}

/** File one signal into the best matching active cluster (or mark it unfiled). */
export function fileSignal(
  signal: FilingInputSignal,
  clusters: FilingInputCluster[],
  threshold: number = FILING_ATTACH_THRESHOLD,
): FilingDecision {
  const active = clusters.filter((cluster) => cluster.status === 'active')
  if (active.length === 0) {
    return {
      kind: 'unfiled',
      signalId: signal.id,
      bestScore: 0,
      bestClusterSlug: null,
      reason: 'no_clusters',
    }
  }

  let best: { cluster: FilingInputCluster; score: number } | null = null
  for (const cluster of active) {
    const score = scoreClusterMatch(signal, cluster)
    if (!best || score > best.score) {
      best = { cluster, score }
    }
  }

  if (!best || best.score < threshold) {
    return {
      kind: 'unfiled',
      signalId: signal.id,
      bestScore: best?.score ?? 0,
      bestClusterSlug: best?.cluster.slug ?? null,
      reason: 'below_threshold',
    }
  }

  return {
    kind: 'attach',
    clusterId: best.cluster.id,
    clusterSlug: best.cluster.slug,
    score: best.score,
    signalId: signal.id,
  }
}

/** File an array of signals and return a report suitable for `brain_runs`. */
export function fileSignals(
  signals: FilingInputSignal[],
  clusters: FilingInputCluster[],
  threshold: number = FILING_ATTACH_THRESHOLD,
): FilingReport {
  const decisions: FilingDecision[] = []
  const attachedByCluster: Record<string, string[]> = {}
  const unfiledSignalIds: string[] = []

  for (const signal of signals) {
    const decision = fileSignal(signal, clusters, threshold)
    decisions.push(decision)
    if (decision.kind === 'attach') {
      if (!attachedByCluster[decision.clusterId]) {
        attachedByCluster[decision.clusterId] = []
      }
      attachedByCluster[decision.clusterId].push(decision.signalId)
    } else {
      unfiledSignalIds.push(decision.signalId)
    }
  }

  return {
    decisions,
    attachedByCluster,
    unfiledSignalIds,
    examinedClusters: clusters.filter((c) => c.status === 'active').length,
  }
}
