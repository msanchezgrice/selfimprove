import type { SupabaseClient } from '@supabase/supabase-js'

import type { BrainPageVersionRow } from '@/lib/types/database'

/**
 * Version compaction for `brain_page_versions`.
 *
 * Pages that churn (especially `current_focus` as users tune it) accumulate
 * versions that are never read. This module prunes superseded versions
 * older than `olderThanDays`, always keeping at least `keepMin` most-recent
 * versions per page so history near "now" stays inspectable.
 *
 * Also deletes the `brain_chunks` that referenced the pruned versions so
 * retrieval doesn't surface stale text.
 */

export type CompactionInput = {
  projectId?: string
  olderThanDays?: number
  keepMin?: number
  /** If set, only compact these pages. Otherwise compact all pages in scope. */
  pageIds?: string[]
  /** Dry-run returns counts without deleting. */
  dryRun?: boolean
}

export type CompactionResult = {
  pagesInspected: number
  versionsPruned: number
  chunksPruned: number
  dryRun: boolean
}

const DEFAULT_OLDER_THAN_DAYS = 60
const DEFAULT_KEEP_MIN = 5

export async function compactPageVersions(
  supabase: SupabaseClient,
  input: CompactionInput = {},
): Promise<CompactionResult> {
  const olderThanDays = input.olderThanDays ?? DEFAULT_OLDER_THAN_DAYS
  const keepMin = Math.max(1, input.keepMin ?? DEFAULT_KEEP_MIN)
  const dryRun = input.dryRun ?? false
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

  const pages = await loadPagesInScope(supabase, input)
  if (pages.length === 0) {
    return { pagesInspected: 0, versionsPruned: 0, chunksPruned: 0, dryRun }
  }

  let versionsPruned = 0
  let chunksPruned = 0

  for (const page of pages) {
    const { data: versionRows } = await supabase
      .from('brain_page_versions')
      .select('id, version, created_at')
      .eq('page_id', page.id)
      .order('version', { ascending: false })

    const versions = (versionRows ?? []) as Pick<
      BrainPageVersionRow,
      'id' | 'version' | 'created_at'
    >[]
    if (versions.length <= keepMin) continue

    // Keep the top-`keepMin` most recent versions regardless of age.
    const keepers = versions.slice(0, keepMin).map((row) => row.id)
    const keeperSet = new Set(keepers)

    const pruneCandidates = versions.filter((row) => {
      if (keeperSet.has(row.id)) return false
      const age = new Date(row.created_at).getTime()
      return Number.isFinite(age) && age < cutoff.getTime()
    })
    if (pruneCandidates.length === 0) continue

    const pruneIds = pruneCandidates.map((row) => row.id)

    if (!dryRun) {
      const { error: chunkError, count: chunkCount } = await supabase
        .from('brain_chunks')
        .delete({ count: 'exact' })
        .in('page_version_id', pruneIds)
      if (!chunkError && typeof chunkCount === 'number') {
        chunksPruned += chunkCount
      }

      const { error: versionError } = await supabase
        .from('brain_page_versions')
        .delete()
        .in('id', pruneIds)
      if (versionError) continue
    }
    versionsPruned += pruneIds.length
  }

  return {
    pagesInspected: pages.length,
    versionsPruned,
    chunksPruned,
    dryRun,
  }
}

async function loadPagesInScope(
  supabase: SupabaseClient,
  input: CompactionInput,
): Promise<Array<{ id: string }>> {
  if (input.pageIds && input.pageIds.length > 0) {
    return input.pageIds.map((id) => ({ id }))
  }
  let query = supabase.from('brain_pages').select('id').limit(2000)
  if (input.projectId) {
    query = query.eq('project_id', input.projectId)
  }
  const { data } = await query
  return (data ?? []) as Array<{ id: string }>
}
