import type { FocusMode } from './design'

/**
 * Deterministic ranking math for opportunity clusters.
 *
 * The V1.1 design separates latent judgment (model writes the brief) from
 * deterministic math (code computes scores). These helpers are pure so they
 * can be unit tested without a database, a model call, or real time.
 *
 * See docs/brain/project-brain-v1.md -> "Refactor: generateRoadmap()" step 3.
 */

export type ClusterSourceInput = {
  source_kind:
    | 'signal'
    | 'brain_page'
    | 'roadmap_item'
    | 'shipped_change'
    | 'scan_finding'
    | 'manual_note'
  signal_type?: string | null
  weight: number
  polarity?: 'supports' | 'contradicts' | 'neutral'
  created_at: string
}

export type ClusterScoreInput = {
  sources: ClusterSourceInput[]
  lastSignalAt: string | null
  lastRefreshedAt: string | null
  effortSignal?: number | null
  primaryNeed: string
  needVector: Record<string, number>
  focus: FocusMode | null
  now?: Date
}

export type ClusterScores = {
  evidenceStrength: number
  freshnessScore: number
  confidenceScore: number
  effortScore: number
  focusWeightedScore: number
  needAlignment: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

/**
 * Evidence strength grows with the weighted sum of supporting sources and is
 * dampened by contradicting sources. Logarithmic curve so a cluster with 50
 * feedback signals is not infinitely stronger than one with 5.
 */
export function computeEvidenceStrength(sources: ClusterSourceInput[]): number {
  if (sources.length === 0) return 0
  let supports = 0
  let contradicts = 0
  for (const source of sources) {
    const polarity = source.polarity ?? 'supports'
    const weight = Math.max(0, source.weight)
    if (polarity === 'supports') supports += weight
    else if (polarity === 'contradicts') contradicts += weight
  }
  const net = Math.max(0, supports - contradicts * 0.75)
  if (net === 0) return 0
  const curve = Math.log10(1 + net) / Math.log10(1 + 25)
  return clamp(curve * 100)
}

/**
 * Freshness decays linearly from 100 at today down to 0 at ~90 days old.
 * Null `lastSignalAt` treats the cluster as completely stale.
 */
export function computeFreshnessScore(
  lastSignalAt: string | null,
  now: Date = new Date(),
): number {
  if (!lastSignalAt) return 0
  const age = now.getTime() - new Date(lastSignalAt).getTime()
  if (!Number.isFinite(age) || age < 0) return 100
  const days = age / DAY_MS
  const score = 100 - (days / 90) * 100
  return clamp(score)
}

/**
 * Confidence grows with source diversity: more distinct signal types, more
 * distinct source kinds, and a healthier supports-to-contradicts ratio.
 */
export function computeConfidenceScore(sources: ClusterSourceInput[]): number {
  if (sources.length === 0) return 0
  const distinctSignalTypes = new Set<string>()
  const distinctSourceKinds = new Set<string>()
  let supports = 0
  let contradicts = 0
  for (const source of sources) {
    if (source.signal_type) distinctSignalTypes.add(source.signal_type)
    distinctSourceKinds.add(source.source_kind)
    const polarity = source.polarity ?? 'supports'
    if (polarity === 'supports') supports += 1
    else if (polarity === 'contradicts') contradicts += 1
  }

  const diversity = (distinctSignalTypes.size + distinctSourceKinds.size) / 8
  const diversityScore = Math.min(1, diversity) * 70

  const total = supports + contradicts
  const ratio = total === 0 ? 0.5 : supports / total
  const polarityScore = ratio * 30

  return clamp(diversityScore + polarityScore)
}

/**
 * Effort is inversely proportional to the model's `effortSignal` (1-10 scale,
 * where 10 is hardest). When no effort is provided, assume medium effort.
 * Returns 0-100 where 100 means "tiny, do it tomorrow".
 */
export function computeEffortScore(effortSignal: number | null | undefined): number {
  if (effortSignal == null || !Number.isFinite(effortSignal)) return 50
  const clamped = Math.max(1, Math.min(10, effortSignal))
  return clamp((10 - clamped) * (100 / 9))
}

/**
 * Returns 0-1 describing how well the cluster's primary need and need vector
 * align with the currently active focus mode. Focus modes "raise" and "lower"
 * lists are used as a coarse overlay for soft matching.
 */
export function computeNeedAlignment(
  primaryNeed: string,
  needVector: Record<string, number>,
  focus: FocusMode | null,
): number {
  if (!focus) return 0.5
  if (primaryNeed.trim().toLowerCase() === focus.name.toLowerCase()) return 1

  const normalizedVector = normalizeVector(needVector)
  const directComponent = normalizedVector[focus.name.toLowerCase()] ?? 0

  const raiseHits = countMatches(primaryNeed, focus.raises)
  const lowerHits = countMatches(primaryNeed, focus.lowers)

  const heuristic = Math.max(0, Math.min(1, 0.5 + 0.1 * raiseHits - 0.15 * lowerHits))

  return Math.max(directComponent, heuristic)
}

/**
 * Focus-weighted score combines the four raw scores with focus alignment.
 *   base = 0.35*evidence + 0.15*freshness + 0.30*confidence + 0.20*effort
 *   final = base * (0.6 + 0.4 * needAlignment)
 * so a perfectly aligned cluster keeps its base score, and a misaligned one
 * drops to ~60% of base rather than falling off a cliff.
 */
export function computeFocusWeightedScore(input: {
  evidence: number
  freshness: number
  confidence: number
  effort: number
  needAlignment: number
}): number {
  const base =
    0.35 * input.evidence +
    0.15 * input.freshness +
    0.3 * input.confidence +
    0.2 * input.effort
  const multiplier = 0.6 + 0.4 * clamp01(input.needAlignment)
  return clamp(base * multiplier)
}

/** Convenience: compute the full score bundle for a cluster in one call. */
export function computeClusterScores(input: ClusterScoreInput): ClusterScores {
  const evidenceStrength = computeEvidenceStrength(input.sources)
  const freshnessScore = computeFreshnessScore(input.lastSignalAt, input.now)
  const confidenceScore = computeConfidenceScore(input.sources)
  const effortScore = computeEffortScore(input.effortSignal ?? null)
  const needAlignment = computeNeedAlignment(
    input.primaryNeed,
    input.needVector,
    input.focus,
  )
  const focusWeightedScore = computeFocusWeightedScore({
    evidence: evidenceStrength,
    freshness: freshnessScore,
    confidence: confidenceScore,
    effort: effortScore,
    needAlignment,
  })

  return {
    evidenceStrength,
    freshnessScore,
    confidenceScore,
    effortScore,
    focusWeightedScore,
    needAlignment,
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function normalizeVector(vector: Record<string, number>): Record<string, number> {
  const total = Object.values(vector).reduce((sum, value) => {
    return sum + (Number.isFinite(value) && value > 0 ? value : 0)
  }, 0)
  if (total <= 0) return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(vector)) {
    if (!Number.isFinite(value) || value <= 0) continue
    out[key.toLowerCase()] = value / total
  }
  return out
}

function countMatches(text: string, terms: string[]): number {
  const lowered = text.toLowerCase()
  let hits = 0
  for (const term of terms) {
    if (!term) continue
    if (lowered.includes(term.toLowerCase())) hits += 1
  }
  return hits
}
