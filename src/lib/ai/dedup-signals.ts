import type { SignalRow } from '@/lib/types/database'

/**
 * Fuzzy signal deduplication using token-overlap cosine similarity.
 * Groups similar signals (>80% similarity) and merges them into
 * representative signals, reducing noise in the briefs pipeline.
 *
 * No external dependencies — uses a simple bag-of-words model.
 */

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

/** Normalize and tokenize text into lowercase word tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

/** Build a term-frequency map from tokens. */
export function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1)
  }
  return tf
}

/**
 * Cosine similarity between two term-frequency vectors.
 * Returns a value between 0 (no overlap) and 1 (identical).
 */
export function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (const [term, freqA] of a) {
    normA += freqA * freqA
    const freqB = b.get(term)
    if (freqB !== undefined) {
      dotProduct += freqA * freqB
    }
  }

  for (const freqB of b.values()) {
    normB += freqB * freqB
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Compute similarity between two signals using their title + content.
 * Signals of different types are never considered duplicates.
 */
export function signalSimilarity(a: SignalRow, b: SignalRow): number {
  // Different signal types are never duplicates
  if (a.type !== b.type) return 0

  const textA = `${a.title || ''} ${a.content}`
  const textB = `${b.title || ''} ${b.content}`

  const tfA = termFrequency(tokenize(textA))
  const tfB = termFrequency(tokenize(textB))

  return cosineSimilarity(tfA, tfB)
}

// ---------------------------------------------------------------------------
// Dedup grouping
// ---------------------------------------------------------------------------

export interface DedupGroup {
  /** The representative (canonical) signal for this group. */
  canonical: SignalRow
  /** All signals in the group, including the canonical one. */
  members: SignalRow[]
  /** Merged content combining unique info from all group members. */
  mergedContent: string
  /** Number of duplicates (members.length - 1). */
  duplicateCount: number
}

export interface DedupResult {
  /** Deduplicated signals — one per group, with merged content. */
  dedupedSignals: SignalRow[]
  /** Full group details for inspection/logging. */
  groups: DedupGroup[]
  /** Total signals before dedup. */
  originalCount: number
  /** Total signals after dedup. */
  dedupedCount: number
  /** Number of signals identified as duplicates. */
  duplicatesFound: number
}

const DEFAULT_SIMILARITY_THRESHOLD = 0.8

/**
 * Deduplicate signals using fuzzy text similarity.
 *
 * Algorithm: greedy single-pass clustering.
 * For each signal, check against existing group canonicals.
 * If similarity > threshold, add to that group. Otherwise, start a new group.
 *
 * Signals are processed in order (newest first, matching the DB query order)
 * so the first signal seen becomes the canonical representative.
 */
export function deduplicateSignals(
  signals: SignalRow[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): DedupResult {
  if (signals.length === 0) {
    return {
      dedupedSignals: [],
      groups: [],
      originalCount: 0,
      dedupedCount: 0,
      duplicatesFound: 0,
    }
  }

  const groups: DedupGroup[] = []

  for (const signal of signals) {
    let merged = false

    for (const group of groups) {
      const similarity = signalSimilarity(signal, group.canonical)
      if (similarity >= threshold) {
        group.members.push(signal)
        group.duplicateCount++
        merged = true
        break
      }
    }

    if (!merged) {
      groups.push({
        canonical: signal,
        members: [signal],
        mergedContent: '',  // computed below
        duplicateCount: 0,
      })
    }
  }

  // Build merged content for each group
  for (const group of groups) {
    group.mergedContent = mergeGroupContent(group.members)
  }

  // Produce deduplicated signals — one per group with merged content
  const dedupedSignals: SignalRow[] = groups.map((group) => ({
    ...group.canonical,
    content: group.mergedContent,
    // Boost weight based on how many duplicates reinforce this signal
    weight: group.canonical.weight * Math.max(1, Math.log2(group.members.length) + 1),
    // Preserve the dedup_group_id if we merged multiple signals
    dedup_group_id: group.members.length > 1 ? group.canonical.id : group.canonical.dedup_group_id,
  }))

  const duplicatesFound = signals.length - groups.length

  return {
    dedupedSignals,
    groups,
    originalCount: signals.length,
    dedupedCount: groups.length,
    duplicatesFound,
  }
}

// ---------------------------------------------------------------------------
// Content merging
// ---------------------------------------------------------------------------

/**
 * Merge content from multiple signals into a single representative text.
 * For single signals, returns the content as-is.
 * For groups, combines the canonical content with unique details from duplicates.
 */
function mergeGroupContent(members: SignalRow[]): string {
  if (members.length === 1) {
    return members[0].content
  }

  const canonical = members[0]
  const canonicalTokens = new Set(tokenize(canonical.content))

  // Collect unique sentences/phrases from duplicates that aren't in the canonical
  const additionalDetails: string[] = []

  for (let i = 1; i < members.length; i++) {
    const member = members[i]
    const memberTokens = tokenize(member.content)

    // Find tokens unique to this duplicate
    const uniqueTokens = memberTokens.filter((t) => !canonicalTokens.has(t))

    if (uniqueTokens.length > 0) {
      // Extract the unique portion — take the original content if it's short,
      // otherwise just note it as additional context
      const uniqueContent = member.content.length <= 200
        ? member.content
        : member.content.slice(0, 200) + '...'

      // Avoid adding near-identical additional details
      const isDuplicate = additionalDetails.some((existing) => {
        const existingTf = termFrequency(tokenize(existing))
        const newTf = termFrequency(tokenize(uniqueContent))
        return cosineSimilarity(existingTf, newTf) >= 0.8
      })

      if (!isDuplicate) {
        additionalDetails.push(uniqueContent)
      }
    }
  }

  if (additionalDetails.length === 0) {
    return `${canonical.content} [${members.length} similar reports]`
  }

  const details = additionalDetails
    .slice(0, 3)  // Cap at 3 additional details to keep content manageable
    .map((d) => `  - ${d}`)
    .join('\n')

  return `${canonical.content} [${members.length} similar reports]\nAdditional context:\n${details}`
}
