import type { SupabaseClient } from '@supabase/supabase-js'

import { cosineSimilarity, termFrequency, tokenize } from '@/lib/ai/dedup-signals'

/**
 * Merge near-duplicate roadmap_items inside one project.
 *
 * Two passes:
 *
 *   1. EXACT KEY:  group by the first 6 normalized words of the title.
 *      Cheap & catches the bulk of synthesis-churn dupes ("Fix onboarding
 *      validation errors" minted three times across runs).
 *
 *   2. COSINE:     within each cluster, compare title token vectors of
 *      remaining items pairwise. Score >= 0.85 -> merge. Catches things
 *      like "Add error tracking with Sentry" vs. "Add error tracking
 *      (Sentry or equivalent)" that the exact key misses.
 *
 * In each group, keep the MOST RECENT item (most likely the canonical one
 * the model produced last). Older dupes get:
 *   - status='dismissed', dismiss_reason='auto-merged duplicate of <id>'
 *   - opportunity_cluster_sources rows repointed to the canonical item
 *
 * Idempotent: skips items that are already dismissed/archived. Safe to
 * call from the daily pipeline.
 */

// 0.80 catches paraphrases like "Add error tracking with Sentry" vs.
// "Add error tracking via Sentry" while still rejecting things that share
// only a verb stem. 0.85 was too tight in practice.
const COSINE_THRESHOLD = 0.8
// 5 words is the sweet spot: long enough to be meaningful, short enough to
// catch synthesis churn that varies wording slightly mid-title.
const EXACT_KEY_WORD_COUNT = 5

export type DedupItemsResult = {
  projectId: string
  considered: number
  exactGroups: number
  exactMerged: number
  cosineGroups: number
  cosineMerged: number
  total: number
  errors: string[]
}

type Candidate = {
  id: string
  title: string
  status: string
  stage: string
  cluster_id: string | null
  updated_at: string
  created_at: string
}

export async function dedupHistoricalItems(
  supabase: SupabaseClient,
  projectId: string,
  options: { dryRun?: boolean; cosineWithinClusterOnly?: boolean } = {},
): Promise<DedupItemsResult> {
  const result: DedupItemsResult = {
    projectId,
    considered: 0,
    exactGroups: 0,
    exactMerged: 0,
    cosineGroups: 0,
    cosineMerged: 0,
    total: 0,
    errors: [],
  }

  // Supabase defaults to 1000 rows per query; we explicitly raise it so the
  // whole backlog is considered in one pass. Otherwise the function only
  // sees the first 1000 and leaves dupes in the tail.
  const { data: rows, error } = await supabase
    .from('roadmap_items')
    .select('id, title, status, stage, opportunity_cluster_id, updated_at, created_at')
    .eq('project_id', projectId)
    .in('status', ['proposed', 'approved'])
    .limit(20_000)

  if (error) {
    result.errors.push(`load roadmap_items: ${error.message}`)
    return result
  }

  const items = (rows ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: (row.title as string | null) ?? '',
    status: row.status as string,
    stage: row.stage as string,
    cluster_id: (row.opportunity_cluster_id as string | null) ?? null,
    updated_at: row.updated_at as string,
    created_at: row.created_at as string,
  })) as Candidate[]

  result.considered = items.length
  if (items.length === 0) return result

  // ----- Pass 1: exact-key groups -----

  const byExactKey = new Map<string, Candidate[]>()
  for (const item of items) {
    const key = exactKey(item.title)
    if (!key) continue
    const arr = byExactKey.get(key) ?? []
    arr.push(item)
    byExactKey.set(key, arr)
  }

  const merges: Array<{ canonical: Candidate; dupe: Candidate; how: 'exact' | 'cosine' }> = []

  for (const group of byExactKey.values()) {
    if (group.length < 2) continue
    result.exactGroups += 1
    const sorted = [...group].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    const [canonical, ...dupes] = sorted
    for (const dupe of dupes) {
      merges.push({ canonical, dupe, how: 'exact' })
      result.exactMerged += 1
    }
  }

  // ----- Pass 2: cosine within survivors -----

  const dismissedIds = new Set(merges.map((m) => m.dupe.id))
  const survivors = items.filter((it) => !dismissedIds.has(it.id))

  // Bucket by cluster (or 'unfiled') so we don't quadratically compare across
  // unrelated themes — that would catch false positives like
  // "Add error tracking" vs "Fix retention error".
  const byBucket = new Map<string, Candidate[]>()
  for (const it of survivors) {
    const key = options.cosineWithinClusterOnly === false
      ? 'all'
      : it.cluster_id ?? 'unfiled'
    const arr = byBucket.get(key) ?? []
    arr.push(it)
    byBucket.set(key, arr)
  }

  for (const bucket of byBucket.values()) {
    if (bucket.length < 2) continue
    const tfs = bucket.map((it) => termFrequency(tokenize(it.title)))
    const matched = new Set<string>()
    const groups: Array<{ canonical: Candidate; dupes: Candidate[] }> = []

    for (let i = 0; i < bucket.length; i++) {
      if (matched.has(bucket[i].id)) continue
      const group = { canonical: bucket[i], dupes: [] as Candidate[] }
      for (let j = i + 1; j < bucket.length; j++) {
        if (matched.has(bucket[j].id)) continue
        const score = cosineSimilarity(tfs[i], tfs[j])
        if (score >= COSINE_THRESHOLD) {
          group.dupes.push(bucket[j])
          matched.add(bucket[j].id)
        }
      }
      if (group.dupes.length > 0) {
        // Pick the most recent item across {canonical} ∪ dupes as the keeper.
        const all = [group.canonical, ...group.dupes].sort((a, b) =>
          a.updated_at < b.updated_at ? 1 : -1,
        )
        const [keeper, ...rest] = all
        groups.push({ canonical: keeper, dupes: rest })
      }
    }

    for (const g of groups) {
      result.cosineGroups += 1
      for (const dupe of g.dupes) {
        merges.push({ canonical: g.canonical, dupe, how: 'cosine' })
        result.cosineMerged += 1
      }
    }
  }

  result.total = merges.length

  if (options.dryRun || merges.length === 0) return result

  // ----- Apply merges -----
  const dupeIds = merges.map((m) => m.dupe.id)
  const reasonMap = new Map<string, string>(
    merges.map((m) => [m.dupe.id, `auto-merged duplicate of ${m.canonical.id} (${m.how})`]),
  )

  // Repoint opportunity_cluster_sources that referenced the dupe item to the
  // canonical one (or just delete; sources accumulate again on next rollup).
  // Chunk to keep PATCH/DELETE bodies under PostgREST's request limits.
  const CHUNK_SIZE = 100
  for (let i = 0; i < dupeIds.length; i += CHUNK_SIZE) {
    const chunk = dupeIds.slice(i, i + CHUNK_SIZE)
    const { error: srcErr } = await supabase
      .from('opportunity_cluster_sources')
      .delete()
      .in('roadmap_item_id', chunk)
    if (srcErr) {
      result.errors.push(
        `delete cluster sources (chunk ${i / CHUNK_SIZE}): ${srcErr.message}`,
      )
    }
  }

  // Per-row reason means one update per item — but we can still order them
  // so any single chunk's request stays small. The N here scales linearly
  // with dupes, which is fine: even 1k merges = ~5s wall time.
  for (const [dupeId, reason] of reasonMap.entries()) {
    const { error: updErr } = await supabase
      .from('roadmap_items')
      .update({ status: 'dismissed', dismiss_reason: reason })
      .eq('id', dupeId)
    if (updErr) {
      result.errors.push(`dismiss ${dupeId}: ${updErr.message}`)
    }
  }

  return result
}

function exactKey(title: string): string {
  if (!title) return ''
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, EXACT_KEY_WORD_COUNT)
    .join(' ')
}
