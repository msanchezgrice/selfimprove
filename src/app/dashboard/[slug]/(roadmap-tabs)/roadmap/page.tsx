import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { rankRoadmapItems, type RoadmapItemForRanking } from '@/lib/brain/rerank'
import { getActiveProject } from '@/lib/supabase/get-active-project'
import { RoadmapEmpty } from '../../../_components/roadmap-empty'
import { RoadmapView } from '../../../_components/roadmap-view'
import type { OpportunityClusterRow } from '@/lib/types/database'

export default async function RoadmapPage() {
  const project = await getActiveProject()
  const projectId = project?.id ?? null
  const projectSlug = project?.slug ?? ''

  if (!projectId) {
    return <RoadmapEmpty projectId={null} />
  }

  // Auth-gate via session (same as the API route).
  await createClient()

  // Fetch the canonical (no filter) ranked list using the same engine as the API
  // route, so the initial render matches what the user gets after the first
  // client-side refetch.
  const admin = createAdminClient()
  const [itemsRes, clustersRes, focusPageRes, unprocessedRes, lastSignalRes] = await Promise.all([
    admin
      .from('roadmap_items')
      .select(
        'id, project_id, title, description, category, status, stage, rank, confidence, roi_score, impact, size, updated_at, created_at, opportunity_cluster_id, prd_content, dismiss_reason',
      )
      .eq('project_id', projectId)
      .in('stage', ['roadmap'])
      .order('updated_at', { ascending: false })
      .limit(800),
    admin
      .from('opportunity_clusters')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'active'),
    admin
      .from('brain_pages')
      .select('slug, updated_at')
      .eq('project_id', projectId)
      .eq('kind', 'current_focus')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('processed', false),
    // Latest funnel anomaly = best proxy for "when did the brain last touch
    // this project". The pipeline mints anomalies on every rollup.
    admin
      .from('funnel_anomalies')
      .select('created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const ranked = rankRoadmapItems(
    (itemsRes.data ?? []) as RoadmapItemForRanking[],
    (clustersRes.data ?? []) as OpportunityClusterRow[],
    { limit: 50 },
  )

  const persistedFocus = (focusPageRes.data as { slug: string } | null)?.slug ?? null

  const initialData = {
    project_id: projectId,
    persisted_focus: persistedFocus,
    applied_focus: persistedFocus,
    filter: { limit: 50 },
    total: ranked.length,
    items: ranked.map((entry) => ({
      id: entry.item.id,
      title: entry.item.title,
      category: entry.item.category,
      status: entry.item.status,
      stage: entry.item.stage,
      confidence: entry.item.confidence,
      roi_score: entry.item.roi_score,
      has_prd: Boolean(entry.item.prd_content),
      dismiss_reason: entry.item.dismiss_reason ?? null,
      cluster: entry.cluster
        ? {
            id: entry.cluster.id,
            slug: entry.cluster.slug,
            primary_need: entry.cluster.primary_need,
            theme: entry.cluster.theme,
            evidence_strength: entry.cluster.evidence_strength,
            confidence_score: entry.cluster.confidence_score,
            persisted_focus_score: entry.cluster.focus_weighted_score,
          }
        : null,
      cluster_focus_score: entry.clusterFocusScore ?? 0,
      combined_score: entry.combinedScore,
      reason: entry.reason,
    })),
  }

  const lastRefreshedAt =
    (lastSignalRes.data as { created_at: string } | null)?.created_at ??
    (focusPageRes.data as { updated_at?: string } | null)?.updated_at ??
    null

  return (
    <div>
      <RoadmapView
        projectId={projectId}
        projectSlug={projectSlug}
        initialData={initialData}
        unprocessedSignals={unprocessedRes.count ?? 0}
        lastRefreshedAt={lastRefreshedAt}
      />
    </div>
  )
}
