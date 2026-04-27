import type { BrainPageKind } from '@/lib/types/database'

/**
 * Page dependency graph for downstream staleness propagation.
 *
 * Implements `project-enrichment.md` step 9:
 *   "Mark downstream pages or clusters stale if the new truth changes their
 *    assumptions."
 *
 * Each edge `A -> [B, C]` means: when the content of page A changes, pages
 * B and C should be marked `stale` and re-enriched on the next pass. This
 * is intentionally a small, curated graph (not a reachability analyzer) so
 * maintainers can reason about cascades locally.
 *
 * Do NOT add cycles. The propagation function stops at depth 1 anyway, but
 * cycles would still be confusing to readers.
 */

export type PageDependencyGraph = Partial<Record<BrainPageKind, BrainPageKind[]>>

export const DEFAULT_PAGE_GRAPH: PageDependencyGraph = {
  current_focus: ['user_pain_map'],
  project_overview: ['user_pain_map', 'active_experiments', 'open_decisions'],
  repo_map: ['implementation_patterns', 'safety_rules'],
  product_constraints: ['implementation_patterns', 'open_decisions'],
  user_pain_map: ['active_experiments'],
  release_notes: ['metric_definitions'],
  metric_definitions: ['active_experiments'],
}

/**
 * Given a set of freshly-touched page kinds, return the set of downstream
 * page kinds that should be marked stale. Pure function.
 *
 * Propagation is single-hop on purpose: if you changed A and B is stale
 * because of A, the next enrichment pass will recompute B, and any further
 * cascade from B happens on that pass. This prevents a single write from
 * nuking half the brain.
 */
export function propagateStaleness(
  touched: BrainPageKind[],
  graph: PageDependencyGraph = DEFAULT_PAGE_GRAPH,
): BrainPageKind[] {
  const touchedSet = new Set<BrainPageKind>(touched)
  const result = new Set<BrainPageKind>()
  for (const kind of touchedSet) {
    const downstream = graph[kind]
    if (!downstream) continue
    for (const dep of downstream) {
      // Don't mark a page as downstream-stale if it was also just written:
      // we just refreshed it, no need to stale it immediately.
      if (touchedSet.has(dep)) continue
      result.add(dep)
    }
  }
  return [...result]
}
