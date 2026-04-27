import { cosineSimilarity, termFrequency, tokenize } from '@/lib/ai/dedup-signals'

/**
 * Pre-emit deduplication and cooldown helpers for `generateRoadmap`.
 *
 * Two pure functions used at the top of every roadmap-synthesis run:
 *   1. `dedupAgainstHistory` — drops new items whose titles cosine-match
 *      a recent existing item above a threshold. Solves the "model
 *      reinvents the same idea every hour" problem we saw on
 *      myforeversongs (9 generations / 24h, mostly variants).
 *   2. `shouldRunSynthesis` — returns false when the last run completed
 *      <6h ago AND no fresh funnel anomalies arrived since. The hourly
 *      cron stays loud, but only does work when there's new evidence.
 *
 * Both are pure / no-DB. The wrappers in generate-roadmap call them with
 * the rows already loaded. This keeps the backtest harness able to replay
 * the same logic against historical signals.
 */

export const TITLE_DEDUP_THRESHOLD = 0.7

export type ExistingItem = {
  id: string
  title: string
  created_at: string
}

/** Any object with a `title` field. Everything else passes through unchanged. */
export type DedupCandidate = {
  title: string
}

export type DedupResult<T extends DedupCandidate> = {
  kept: T[]
  dropped: Array<{ candidate: T; matchedTitle: string; matchedId: string; score: number }>
}

/**
 * Drop new items whose titles cosine-match an existing item above
 * `threshold`. Existing items only need their title + id; the candidate
 * keeps its payload so callers can re-shape it on the way through.
 */
export function dedupAgainstHistory<T extends DedupCandidate>(
  candidates: T[],
  existing: ExistingItem[],
  threshold: number = TITLE_DEDUP_THRESHOLD,
): DedupResult<T> {
  const result: DedupResult<T> = { kept: [], dropped: [] }
  if (candidates.length === 0) return result

  // Pre-tokenize existing titles once.
  const existingTokens = existing
    .map((row) => ({
      id: row.id,
      title: row.title,
      tf: termFrequency(tokenize(row.title)),
    }))
    .filter((row) => row.tf.size > 0)

  // Also dedup *within* the candidate batch (model sometimes emits dupes
  // in a single response).
  const keptTokens: Array<{ title: string; tf: Map<string, number> }> = []

  for (const candidate of candidates) {
    const tokens = tokenize(candidate.title)
    if (tokens.length === 0) {
      result.kept.push(candidate)
      continue
    }
    const tf = termFrequency(tokens)

    // Compare against existing.
    let bestExisting: { score: number; row: (typeof existingTokens)[number] } | null = null
    for (const row of existingTokens) {
      const score = cosineSimilarity(tf, row.tf)
      if (!bestExisting || score > bestExisting.score) {
        bestExisting = { score, row }
      }
    }
    if (bestExisting && bestExisting.score >= threshold) {
      result.dropped.push({
        candidate,
        matchedTitle: bestExisting.row.title,
        matchedId: bestExisting.row.id,
        score: bestExisting.score,
      })
      continue
    }

    // Compare against earlier-kept candidates in this batch.
    let bestPeer: { score: number; title: string } | null = null
    for (const row of keptTokens) {
      const score = cosineSimilarity(tf, row.tf)
      if (!bestPeer || score > bestPeer.score) {
        bestPeer = { score, title: row.title }
      }
    }
    if (bestPeer && bestPeer.score >= threshold) {
      result.dropped.push({
        candidate,
        matchedTitle: bestPeer.title,
        matchedId: 'in-batch',
        score: bestPeer.score,
      })
      continue
    }

    keptTokens.push({ title: candidate.title, tf })
    result.kept.push(candidate)
  }

  return result
}

// ---------------------------------------------------------------------------
// Cooldown
// ---------------------------------------------------------------------------

export type CooldownInput = {
  /** Most recent successful brain_run completed_at for this project + task. */
  lastCompletedAt: string | null
  /** Latest funnel_anomaly created_at for the project (any status). */
  latestAnomalyAt: string | null
  /** Latest unprocessed signal created_at for the project. */
  latestUnprocessedSignalAt: string | null
  /** Window in hours during which we suppress redundant runs. Default 6. */
  cooldownHours?: number
  now?: Date
}

export type CooldownDecision =
  | { run: true; reason: string }
  | { run: false; reason: string; nextEligibleAt: string }

/**
 * Decide whether to skip this roadmap-synthesis pass.
 *
 *   - If the last run was >= cooldownHours ago, run.
 *   - Otherwise, run only if a fresh funnel_anomaly or unprocessed signal
 *     arrived AFTER the last completed run.
 *   - Else skip.
 */
export function shouldRunSynthesis(input: CooldownInput): CooldownDecision {
  const cooldown = input.cooldownHours ?? 6
  const now = (input.now ?? new Date()).getTime()
  const cooldownMs = cooldown * 60 * 60 * 1000

  if (!input.lastCompletedAt) {
    return { run: true, reason: 'No prior run on record.' }
  }

  const lastMs = new Date(input.lastCompletedAt).getTime()
  const elapsedMs = now - lastMs

  if (elapsedMs >= cooldownMs) {
    return { run: true, reason: `Last run was ${formatHours(elapsedMs)} ago (cooldown ${cooldown}h).` }
  }

  const anomalyMs = input.latestAnomalyAt ? new Date(input.latestAnomalyAt).getTime() : null
  const signalMs = input.latestUnprocessedSignalAt
    ? new Date(input.latestUnprocessedSignalAt).getTime()
    : null
  const newEvidence = (anomalyMs && anomalyMs > lastMs) || (signalMs && signalMs > lastMs)

  if (newEvidence) {
    return {
      run: true,
      reason: 'Cooldown active but new funnel-anomaly or signal arrived since last run.',
    }
  }

  const nextEligibleAt = new Date(lastMs + cooldownMs).toISOString()
  return {
    run: false,
    reason: `Cooldown active (${formatHours(elapsedMs)} since last run, threshold ${cooldown}h) and no fresh evidence.`,
    nextEligibleAt,
  }
}

function formatHours(ms: number): string {
  const hours = ms / (60 * 60 * 1000)
  if (hours < 1) return `${Math.round(hours * 60)}m`
  return `${hours.toFixed(1)}h`
}
