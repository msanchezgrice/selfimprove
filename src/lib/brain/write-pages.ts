import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  BrainPageKind,
  BrainPageRow,
  BrainPageSourceInsert,
  BrainPageStatus,
  BrainPageVersionRow,
} from '@/lib/types/database'

import { chunkMarkdown } from './chunking'
import {
  DEFAULT_PAGE_GRAPH,
  propagateStaleness,
  type PageDependencyGraph,
} from './page-graph'

/**
 * Shared page-writeback helper.
 *
 * The skill specs (docs/brain/skills/*) say `roadmap-synthesis`,
 * `prd-author`, `impact-review`, and `project-enrichment` should all update
 * `brain_pages` when they learn something durable. Centralizing that logic
 * here keeps each runner small and makes the write semantics (version
 * bump, chunks, sources, staleness cascade) identical across the board.
 */

export type PageUpdateInput = {
  kind: BrainPageKind
  slug: string
  title: string
  summary: string
  importance?: number
  status?: BrainPageStatus
  stale_reason?: string
  content_md: string
  key_facts?: string[]
  open_questions?: string[]
  change_summary?: string
  /**
   * Inline source citations. Each entry must reference at most ONE of
   * signal_id / roadmap_item_id / shipped_change_id per the check
   * constraint on `brain_page_sources`.
   */
  sources?: Array<{
    source_kind: 'signal' | 'roadmap_item' | 'shipped_change' | 'manual_note' | 'scan_finding'
    signal_id?: string
    roadmap_item_id?: string
    shipped_change_id?: string
    citation?: string
    excerpt?: string
    weight?: number
  }>
}

export type PageWriteOptions = {
  /** Which skill owns this write. Shows up in `brain_page_versions.created_by`. */
  createdBy: string
  /** Graph used for downstream staleness propagation. Defaults to DEFAULT_PAGE_GRAPH. */
  graph?: PageDependencyGraph
  /** Cap on model-proposed writes; anything beyond is dropped. Default 8. */
  maxPages?: number
  /** When true, skip staleness propagation entirely. Default false. */
  skipStalenessCascade?: boolean
}

export type PageWriteResult = {
  pagesUpdated: number
  versionsCreated: number
  sourcesAttached: number
  chunksWritten: number
  staleMarked: BrainPageKind[]
  touchedKinds: BrainPageKind[]
}

/**
 * Apply a batch of page updates for a single project.
 *
 * Behavior:
 *   - If a page with `kind + slug` exists, it is updated and a new
 *     `brain_page_versions` row is appended (version n+1).
 *   - If not, it is inserted at version 1.
 *   - Sources with zero or ambiguous foreign keys are skipped silently
 *     (single-ref check constraint on brain_page_sources).
 *   - Content is chunked into `brain_chunks` with the section heading
 *     preserved in `metadata`.
 *   - After all writes, downstream pages are marked `stale` via the
 *     page graph unless `skipStalenessCascade` is set.
 *
 * Returns counts only; callers can record them into `brain_runs`.
 */
export async function applyPageUpdates(
  supabase: SupabaseClient,
  projectId: string,
  updates: PageUpdateInput[],
  options: PageWriteOptions,
): Promise<PageWriteResult> {
  const limited = updates.slice(0, options.maxPages ?? 8)
  let pagesUpdated = 0
  let versionsCreated = 0
  let sourcesAttached = 0
  let chunksWritten = 0
  const touchedKinds: BrainPageKind[] = []

  for (const update of limited) {
    if (!update.content_md || update.content_md.trim().length === 0) continue

    const pageRow = await upsertPage(supabase, projectId, update)
    if (!pageRow) continue
    pagesUpdated += 1
    touchedKinds.push(update.kind)

    const versionRow = await appendVersion(supabase, pageRow, update, options.createdBy)
    if (!versionRow) continue
    versionsCreated += 1

    sourcesAttached += await attachSources(supabase, pageRow.id, versionRow.id, update)
    chunksWritten += await writeChunks(supabase, pageRow.id, versionRow.id, update.content_md)
  }

  let staleMarked: BrainPageKind[] = []
  if (!options.skipStalenessCascade && touchedKinds.length > 0) {
    staleMarked = await cascadeStaleness({
      supabase,
      projectId,
      touchedKinds,
      graph: options.graph ?? DEFAULT_PAGE_GRAPH,
      triggeredBy: options.createdBy,
    })
  }

  return {
    pagesUpdated,
    versionsCreated,
    sourcesAttached,
    chunksWritten,
    staleMarked,
    touchedKinds,
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

async function upsertPage(
  supabase: SupabaseClient,
  projectId: string,
  update: PageUpdateInput,
): Promise<BrainPageRow | null> {
  const { data: existingRow } = await supabase
    .from('brain_pages')
    .select('*')
    .eq('project_id', projectId)
    .eq('kind', update.kind)
    .eq('slug', update.slug)
    .maybeSingle()
  const existing = (existingRow as BrainPageRow) ?? null

  if (existing) {
    const { data, error } = await supabase
      .from('brain_pages')
      .update({
        title: update.title,
        summary: update.summary,
        importance:
          update.importance != null
            ? Math.max(0, Math.min(100, Math.round(update.importance)))
            : existing.importance,
        status: update.status ?? 'active',
        stale_reason: update.status === 'stale' ? update.stale_reason ?? null : null,
        freshness_score: 100,
        last_compacted_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error || !data) {
      console.warn('[write-pages] update page failed', {
        slug: update.slug,
        error: error?.message,
      })
      return existing
    }
    return data as BrainPageRow
  }

  const { data, error } = await supabase
    .from('brain_pages')
    .insert({
      project_id: projectId,
      slug: update.slug,
      kind: update.kind,
      title: update.title,
      summary: update.summary,
      status: update.status ?? 'active',
      importance: Math.max(0, Math.min(100, Math.round(update.importance ?? 50))),
      freshness_score: 100,
      stale_reason: update.status === 'stale' ? update.stale_reason ?? null : null,
    })
    .select('*')
    .single()
  if (error || !data) {
    console.warn('[write-pages] insert page failed', {
      slug: update.slug,
      error: error?.message,
    })
    return null
  }
  return data as BrainPageRow
}

async function appendVersion(
  supabase: SupabaseClient,
  page: BrainPageRow,
  update: PageUpdateInput,
  createdBy: string,
): Promise<BrainPageVersionRow | null> {
  const { data: latest } = await supabase
    .from('brain_page_versions')
    .select('version')
    .eq('page_id', page.id)
    .order('version', { ascending: false })
    .limit(1)
  const nextVersion = ((latest?.[0] as { version: number } | undefined)?.version ?? 0) + 1

  const { data, error } = await supabase
    .from('brain_page_versions')
    .insert({
      page_id: page.id,
      version: nextVersion,
      content_md: update.content_md,
      outline: [],
      key_facts: update.key_facts ?? [],
      open_questions: update.open_questions ?? [],
      change_summary: update.change_summary ?? '',
      compiled_from: { skill: createdBy },
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error || !data) {
    console.warn('[write-pages] append version failed', {
      pageId: page.id,
      version: nextVersion,
      error: error?.message,
    })
    return null
  }
  return data as BrainPageVersionRow
}

async function attachSources(
  supabase: SupabaseClient,
  pageId: string,
  pageVersionId: string,
  update: PageUpdateInput,
): Promise<number> {
  const sources = update.sources ?? []
  if (sources.length === 0) return 0

  const inserts: BrainPageSourceInsert[] = []
  for (const source of sources) {
    const refCount =
      (source.signal_id ? 1 : 0) +
      (source.roadmap_item_id ? 1 : 0) +
      (source.shipped_change_id ? 1 : 0)
    if (refCount > 1) continue
    inserts.push({
      page_id: pageId,
      page_version_id: pageVersionId,
      source_kind: source.source_kind,
      signal_id: source.signal_id ?? null,
      roadmap_item_id: source.roadmap_item_id ?? null,
      shipped_change_id: source.shipped_change_id ?? null,
      citation: source.citation ?? '',
      excerpt: source.excerpt ?? null,
      weight: source.weight ?? 1,
    })
  }
  if (inserts.length === 0) return 0
  const { error } = await supabase.from('brain_page_sources').insert(inserts)
  return error ? 0 : inserts.length
}

async function writeChunks(
  supabase: SupabaseClient,
  pageId: string,
  pageVersionId: string,
  contentMd: string,
): Promise<number> {
  const chunks = chunkMarkdown(contentMd).map((chunk) => ({
    page_id: pageId,
    page_version_id: pageVersionId,
    chunk_index: chunk.index,
    content: chunk.content,
    token_estimate: chunk.tokenEstimate,
    metadata: chunk.heading ? { heading: chunk.heading } : {},
  }))
  if (chunks.length === 0) return 0
  const { error } = await supabase.from('brain_chunks').insert(chunks)
  return error ? 0 : chunks.length
}

async function cascadeStaleness(args: {
  supabase: SupabaseClient
  projectId: string
  touchedKinds: BrainPageKind[]
  graph: PageDependencyGraph
  triggeredBy: string
}): Promise<BrainPageKind[]> {
  const downstream = propagateStaleness(args.touchedKinds, args.graph)
  if (downstream.length === 0) return []

  const { data: rows } = await args.supabase
    .from('brain_pages')
    .select('id, kind, status')
    .eq('project_id', args.projectId)
    .in('kind', downstream)
    .eq('status', 'active')
  const pages = (rows ?? []) as Array<Pick<BrainPageRow, 'id' | 'kind' | 'status'>>
  if (pages.length === 0) return []

  const now = new Date().toISOString()
  const staleMarked: BrainPageKind[] = []
  for (const page of pages) {
    const { error } = await args.supabase
      .from('brain_pages')
      .update({
        status: 'stale',
        stale_reason: `upstream change: ${args.touchedKinds.join(', ')} (via ${args.triggeredBy})`,
        last_compacted_at: now,
      })
      .eq('id', page.id)
    if (!error) staleMarked.push(page.kind)
  }
  return staleMarked
}
