import type { SupabaseClient } from '@supabase/supabase-js'

import { cosineSimilarity, termFrequency, tokenize } from '@/lib/ai/dedup-signals'
import type { OpportunityClusterRow, RoadmapItemRow } from '@/lib/types/database'

import { funnelClusterSlug } from './funnel'

/**
 * Cold-start clustering pass.
 *
 * For projects that have a fat backlog of `roadmap_items` minted before
 * v1.1 shipped (myforeversongs has 1,358 of them), this groups items by
 * title-cosine similarity into a small set of clusters, links each item
 * back via `opportunity_cluster_id`, and updates the brief with a short
 * synthesis comment so the cluster's `latest_brief_md` isn't empty.
 *
 * Pure greedy single-pass clustering. No model calls; no DB writes during
 * `cluster()`. The wrapper `applyColdStartCluster` does the writes once,
 * idempotently. Run via `scripts/cold-start-cluster.ts`.
 */

export type CandidateItem = Pick<RoadmapItemRow, 'id' | 'title' | 'category' | 'opportunity_cluster_id' | 'created_at'>

export type ClusterDraft = {
  slug: string
  title: string
  theme: string
  primaryNeed: string
  members: CandidateItem[]
}

const SIMILARITY_THRESHOLD = 0.45
const MAX_CLUSTERS = 30
const MAX_TITLE_TOKENS = 16

/**
 * Greedy first-fit cosine clustering. Pure; deterministic when sorted input
 * is the same.
 *
 * Emits at most `MAX_CLUSTERS`; items that don't fit any existing cluster
 * AND would push past the cap go into a synthetic `unfiled` cluster.
 */
export function clusterItems(items: CandidateItem[]): ClusterDraft[] {
  if (items.length === 0) return []
  // Sort by created_at desc so newer items seed clusters when there are ties.
  const sorted = [...items].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

  const drafts: Array<ClusterDraft & { tf: Map<string, number> }> = []

  for (const item of sorted) {
    const titleTokens = tokenize(item.title).slice(0, MAX_TITLE_TOKENS)
    if (titleTokens.length === 0) continue
    const tf = termFrequency(titleTokens)

    let best: { draft: (typeof drafts)[number]; score: number } | null = null
    for (const draft of drafts) {
      const score = cosineSimilarity(tf, draft.tf)
      if (!best || score > best.score) best = { draft, score }
    }

    if (best && best.score >= SIMILARITY_THRESHOLD) {
      best.draft.members.push(item)
      // Update the draft's tf with this item's terms so future matches
      // look at the merged token mass, not just the seed.
      for (const [term, count] of tf) {
        best.draft.tf.set(term, (best.draft.tf.get(term) ?? 0) + count)
      }
      continue
    }

    if (drafts.length >= MAX_CLUSTERS) {
      // Push into a sentinel "unfiled" draft.
      let sentinel = drafts.find((d) => d.slug === 'unfiled')
      if (!sentinel) {
        sentinel = {
          slug: 'unfiled',
          title: 'Unfiled (cold-start)',
          theme: 'unfiled',
          primaryNeed: 'unknown',
          members: [],
          tf: new Map(),
        }
        drafts.push(sentinel)
      }
      sentinel.members.push(item)
      for (const [term, count] of tf) {
        sentinel.tf.set(term, (sentinel.tf.get(term) ?? 0) + count)
      }
      continue
    }

    drafts.push({
      slug: deriveSlug(item.title, titleTokens),
      title: item.title,
      theme: deriveTheme(titleTokens),
      primaryNeed: deriveNeed(titleTokens, item.category),
      members: [item],
      tf,
    })
  }

  return drafts.map(({ tf: _tf, ...draft }) => draft)
}

function deriveSlug(title: string, tokens: string[]): string {
  // Prefer "verb-noun" from the first 3 meaningful tokens.
  const head = tokens.slice(0, 3).join('-').replace(/[^a-z0-9-]/g, '')
  if (head.length > 0) return `cluster-${head}`.slice(0, 56)
  return `cluster-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`
}

function deriveTheme(tokens: string[]): string {
  const text = tokens.join(' ')
  if (text.includes('onboarding')) return 'onboarding'
  if (text.includes('pricing') || text.includes('purchase') || text.includes('checkout')) return 'pricing'
  if (text.includes('preview') || text.includes('audio') || text.includes('play')) return 'preview'
  if (text.includes('email')) return 'email'
  if (text.includes('refine')) return 'refine'
  if (text.includes('funnel') || text.includes('attribution')) return 'funnel'
  if (text.includes('error') || text.includes('failure') || text.includes('crash')) return 'error'
  if (text.includes('landing') || text.includes('cta')) return 'landing'
  if (text.includes('membership') || text.includes('private')) return 'membership'
  return 'general'
}

function deriveNeed(tokens: string[], category: string): string {
  const text = tokens.join(' ')
  if (category === 'revenue') return 'conversion'
  if (text.includes('error') || text.includes('crash') || text.includes('failed')) return 'ux_quality'
  if (text.includes('retention') || text.includes('repeat')) return 'retention'
  if (text.includes('performance') || text.includes('cls') || text.includes('latency')) return 'performance'
  if (category === 'reach') return 'virality'
  return 'conversion'
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export type ColdStartResult = {
  itemsConsidered: number
  clustersCreated: number
  clustersExisting: number
  itemsLinked: number
  unfiled: number
  errors: string[]
}

export type ColdStartOptions = {
  /** Limit pass to recent N briefs. Default: all of them. */
  limit?: number
  /** When true, run the pass without writing anything. */
  dryRun?: boolean
}

export async function applyColdStartCluster(
  supabase: SupabaseClient,
  projectId: string,
  options: ColdStartOptions = {},
): Promise<ColdStartResult> {
  const result: ColdStartResult = {
    itemsConsidered: 0,
    clustersCreated: 0,
    clustersExisting: 0,
    itemsLinked: 0,
    unfiled: 0,
    errors: [],
  }

  let query = supabase
    .from('roadmap_items')
    .select('id, title, category, opportunity_cluster_id, created_at')
    .eq('project_id', projectId)
    .is('opportunity_cluster_id', null)
    .order('created_at', { ascending: false })
  if (options.limit) query = query.limit(options.limit)

  const { data: items, error } = await query
  if (error) {
    result.errors.push(`load roadmap_items: ${error.message}`)
    return result
  }

  const candidates = (items ?? []) as CandidateItem[]
  result.itemsConsidered = candidates.length
  if (candidates.length === 0) return result

  const drafts = clusterItems(candidates)

  if (options.dryRun) {
    result.clustersCreated = drafts.filter((d) => d.slug !== 'unfiled').length
    result.unfiled = drafts.find((d) => d.slug === 'unfiled')?.members.length ?? 0
    result.itemsLinked = drafts.reduce((s, d) => s + (d.slug === 'unfiled' ? 0 : d.members.length), 0)
    return result
  }

  // Existing clusters in this project. We match candidates two ways:
  //   1. By exact slug — for stability when re-running with the same input.
  //   2. By (primary_need, theme) — so a re-run on the previously "unfiled"
  //      tail attaches new items to the already-canonical cluster instead
  //      of minting a near-dupe.
  const { data: existingClustersRaw } = await supabase
    .from('opportunity_clusters')
    .select('id, slug, primary_need, theme, status')
    .eq('project_id', projectId)
  const existingClusters = (existingClustersRaw ?? []) as Array<
    Pick<OpportunityClusterRow, 'id' | 'slug' | 'primary_need' | 'theme' | 'status'>
  >
  const existingBySlug = new Map<string, string>(existingClusters.map((row) => [row.slug, row.id]))
  // Only ACTIVE clusters get matched by need+theme so archived dupes don't
  // resurrect themselves on the next pass.
  const existingByNeedTheme = new Map<string, string>(
    existingClusters
      .filter((row) => row.status === 'active')
      .map((row) => [`${row.primary_need}::${row.theme ?? ''}`, row.id]),
  )

  for (const draft of drafts) {
    if (draft.slug === 'unfiled') {
      result.unfiled += draft.members.length
      continue
    }

    const needThemeKey = `${draft.primaryNeed}::${draft.theme}`
    let clusterId =
      existingBySlug.get(draft.slug) ?? existingByNeedTheme.get(needThemeKey) ?? null

    if (clusterId) {
      result.clustersExisting += 1
    } else {
      // Avoid colliding with funnel-bootstrapped clusters by trying a
      // funnel-prefix variant first.
      const funnelSlug = funnelClusterSlug(draft.title.split(' ')[0] ?? draft.slug)
      const slug = existingBySlug.has(funnelSlug) ? funnelSlug : draft.slug
      const { data: inserted, error: insertErr } = await supabase
        .from('opportunity_clusters')
        .insert({
          project_id: projectId,
          slug,
          title: draft.title,
          theme: draft.theme,
          primary_need: draft.primaryNeed,
          need_vector: { [draft.primaryNeed]: 1 },
          latest_brief_md: `## Cold-start synthesis\n${draft.members.length} pre-v1.1 brief(s) consolidated under this cluster.\n\n## Top items\n${draft.members
            .slice(0, 5)
            .map((m) => `- ${m.title}`)
            .join('\n')}`,
          metadata: {
            bootstrap_source: 'cold-start',
            cold_start_member_count: draft.members.length,
          },
        })
        .select('id')
        .single()
      if (insertErr || !inserted) {
        result.errors.push(`insert cluster ${slug}: ${insertErr?.message ?? 'unknown'}`)
        continue
      }
      clusterId = (inserted as { id: string }).id
      existingBySlug.set(slug, clusterId)
      existingByNeedTheme.set(needThemeKey, clusterId)
      result.clustersCreated += 1
    }

    // Bulk link the members.
    const memberIds = draft.members.map((m) => m.id)
    const { error: linkErr } = await supabase
      .from('roadmap_items')
      .update({ opportunity_cluster_id: clusterId })
      .in('id', memberIds)
    if (linkErr) {
      result.errors.push(`link members for ${draft.slug}: ${linkErr.message}`)
      continue
    }
    result.itemsLinked += memberIds.length
  }

  return result
}
