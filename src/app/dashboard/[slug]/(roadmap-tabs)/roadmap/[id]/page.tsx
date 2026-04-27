import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generatePRD } from '@/lib/ai/generate-prd'
import { ItemContextCard } from '../../../../_components/item-context-card'
import { PRDDetail } from '../../../../_components/prd-detail'
import type {
  OpportunityClusterRow,
  RoadmapItemRow,
  SignalRow,
} from '@/lib/types/database'

export default async function PRDPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const supabase = await createClient()

  let { data: item } = await supabase
    .from('roadmap_items')
    .select('*')
    .eq('id', id)
    .single()

  if (!item) notFound()

  // Auto-generate PRD if missing.
  if (!item.prd_content) {
    try {
      await generatePRD(id)
      const { data: updated } = await supabase
        .from('roadmap_items')
        .select('*')
        .eq('id', id)
        .single()
      if (updated) item = updated
    } catch {
      // Show page without PRD — user can trigger manually.
    }
  }

  // Pull related context for the new card. Use the admin client because
  // the cross-cutting joins span tables we want a uniform read on.
  const admin = createAdminClient()
  const [clusterRes, mergedRes, signalRes] = await Promise.all([
    item.opportunity_cluster_id
      ? admin
          .from('opportunity_clusters')
          .select('*')
          .eq('id', item.opportunity_cluster_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Briefs that were dismissed AS dupes of this one carry the marker
    // "auto-merged duplicate of <id>" in dismiss_reason.
    admin
      .from('roadmap_items')
      .select('id, title, updated_at')
      .eq('project_id', item.project_id)
      .eq('status', 'dismissed')
      .like('dismiss_reason', `%${id}%`)
      .limit(20),
    // Originating signal: opportunity_cluster_sources.roadmap_item_id ties
    // a signal/source to this item. Fall back to the most recent signal
    // for this cluster.
    item.opportunity_cluster_id
      ? admin
          .from('opportunity_cluster_sources')
          .select('signal_id, citation, created_at')
          .eq('cluster_id', item.opportunity_cluster_id)
          .eq('source_kind', 'signal')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const cluster =
    (clusterRes as { data: OpportunityClusterRow | null }).data ?? null
  const mergedFrom = ((mergedRes as { data: Array<Pick<RoadmapItemRow, 'id' | 'title' | 'updated_at'>> | null }).data ??
    []) as Array<Pick<RoadmapItemRow, 'id' | 'title' | 'updated_at'>>
  const sourceRow = (signalRes as { data: { signal_id: string | null } | null }).data ?? null

  let originatingSignal:
    | (Pick<SignalRow, 'id' | 'type' | 'title' | 'content' | 'created_at'> & {
        metadata?: Record<string, unknown> | null
      })
    | null = null
  if (sourceRow?.signal_id) {
    const { data: sig } = await admin
      .from('signals')
      .select('id, type, title, content, created_at, metadata')
      .eq('id', sourceRow.signal_id)
      .maybeSingle()
    if (sig) {
      originatingSignal = sig as unknown as NonNullable<typeof originatingSignal>
    }
  }

  return (
    <div>
      <ItemContextCard
        projectSlug={slug}
        cluster={cluster}
        originatingSignal={originatingSignal}
        mergedFrom={mergedFrom}
      />
      <PRDDetail item={item} cluster={cluster} originatingSignal={originatingSignal} />
    </div>
  )
}
