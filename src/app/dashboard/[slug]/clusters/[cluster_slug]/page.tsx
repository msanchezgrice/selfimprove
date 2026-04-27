import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getActiveProject } from '@/lib/supabase/get-active-project'
import { rankRoadmapItems, type RoadmapItemForRanking } from '@/lib/brain/rerank'
import type { OpportunityClusterRow } from '@/lib/types/database'

/**
 * Cluster detail page.
 *
 * Shows everything we know about an opportunity_cluster: header card with
 * theme + need + scores + evidence count, the latest_brief_md synthesis,
 * the focus-ranked roadmap_items inside the cluster, and a back link to
 * the roadmap (with the cluster filter pre-applied — the roadmap-view
 * client respects ?cluster=... if we ever add that, but for now the back
 * link is plain).
 */
export default async function ClusterDetailPage({
  params,
}: {
  params: Promise<{ slug: string; cluster_slug: string }>
}) {
  const { slug, cluster_slug } = await params

  const project = await getActiveProject()
  if (!project) notFound()

  // Auth-gate via the user's session.
  await createClient()

  const admin = createAdminClient()

  const { data: clusterRow } = await admin
    .from('opportunity_clusters')
    .select('*')
    .eq('project_id', project.id)
    .eq('slug', cluster_slug)
    .maybeSingle()
  const cluster = clusterRow as OpportunityClusterRow | null
  if (!cluster) notFound()

  const [itemsRes, sourcesRes] = await Promise.all([
    admin
      .from('roadmap_items')
      .select(
        'id, project_id, title, description, category, status, stage, rank, confidence, roi_score, impact, size, updated_at, created_at, opportunity_cluster_id, prd_content',
      )
      .eq('project_id', project.id)
      .eq('opportunity_cluster_id', cluster.id)
      .order('updated_at', { ascending: false })
      .limit(200),
    admin
      .from('opportunity_cluster_sources')
      .select('source_kind, citation, weight, polarity, created_at')
      .eq('cluster_id', cluster.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const ranked = rankRoadmapItems(
    (itemsRes.data ?? []) as RoadmapItemForRanking[],
    [cluster],
    {
      // Allow brief AND roadmap stages so the page shows the full membership.
      status: ['proposed', 'approved', 'building', 'shipped'],
      limit: 100,
    },
  )

  return (
    <div>
      <div className="mb-4 text-xs">
        <Link
          href={`/dashboard/${slug}/roadmap`}
          className="hover:underline"
          style={{ color: '#6366f1' }}
        >
          ← Roadmap
        </Link>
      </div>

      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: '#1a1a2e' }}>
              {cluster.title}
            </h1>
            <p className="mt-1 text-sm" style={{ color: '#8b8680' }}>
              <span className="font-medium" style={{ color: '#1a1a2e' }}>
                {cluster.primary_need}
              </span>
              {' / '}
              {cluster.theme ?? 'general'} · slug: <code>{cluster.slug}</code>
            </p>
          </div>
          <div
            className="grid grid-cols-3 gap-2 rounded-lg border p-2 text-xs"
            style={{ borderColor: '#e5e1d8', backgroundColor: '#fafaf7' }}
          >
            <Stat label="Focus score" value={cluster.focus_weighted_score} hint="Cluster relevance under the active focus mode (0-100)." />
            <Stat label="Confidence" value={cluster.confidence_score} hint="Confidence the brief will move the metric." />
            <Stat label="Evidence" value={cluster.evidence_strength} hint="Evidence strength from attached sources (0-100)." />
          </div>
        </div>
      </header>

      {cluster.latest_brief_md && (
        <section
          className="mb-6 rounded-lg border p-4"
          style={{ borderColor: '#e5e1d8', backgroundColor: 'white' }}
        >
          <h2
            className="mb-2 text-xs uppercase tracking-wide"
            style={{ color: '#8b8680' }}
          >
            Latest brief synthesis
          </h2>
          <pre
            className="whitespace-pre-wrap text-sm"
            style={{ color: '#1a1a2e', fontFamily: 'inherit' }}
          >
            {cluster.latest_brief_md}
          </pre>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium" style={{ color: '#1a1a2e' }}>
          Items in this cluster ({ranked.length})
        </h2>
        {ranked.length === 0 ? (
          <p className="text-sm" style={{ color: '#8b8680' }}>
            No items linked yet.
          </p>
        ) : (
          <div
            className="overflow-hidden rounded-lg border"
            style={{ borderColor: '#e5e1d8', backgroundColor: 'white' }}
          >
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: '#fafaf7', color: '#8b8680' }}>
                <tr className="text-left text-xs uppercase tracking-wide">
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Conf</th>
                  <th className="px-3 py-2 text-right">ROI</th>
                  <th className="px-3 py-2 text-right">Combined</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((entry) => (
                  <tr key={entry.item.id} className="border-t" style={{ borderColor: '#f3efe6' }}>
                    <td className="px-3 py-2">
                      <Link
                        href={`/dashboard/${slug}/roadmap/${entry.item.id}`}
                        className="hover:underline"
                        style={{ color: '#1a1a2e' }}
                      >
                        {entry.item.title}
                      </Link>
                      <span
                        className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                        style={
                          entry.item.prd_content
                            ? { backgroundColor: '#ecfdf5', color: '#059669' }
                            : { backgroundColor: '#f5f0eb', color: '#8b8680' }
                        }
                      >
                        {entry.item.prd_content ? 'PRD' : 'Brief'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: '#8b8680' }}>
                      {entry.item.stage}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: '#8b8680' }}>
                      {entry.item.status}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {entry.item.confidence}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {entry.item.roi_score}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                      {entry.combinedScore.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium" style={{ color: '#1a1a2e' }}>
          Evidence ({sourcesRes.data?.length ?? 0})
        </h2>
        {sourcesRes.data && sourcesRes.data.length > 0 ? (
          <ul className="space-y-1 text-sm" style={{ color: '#1a1a2e' }}>
            {sourcesRes.data.map((src, idx) => (
              <li
                key={idx}
                className="flex items-baseline gap-2 rounded border p-2 text-xs"
                style={{ borderColor: '#f3efe6', backgroundColor: 'white' }}
              >
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] uppercase"
                  style={{ backgroundColor: '#f5f0eb', color: '#8b8680' }}
                >
                  {(src as { source_kind: string }).source_kind}
                </span>
                <span style={{ color: '#1a1a2e' }}>
                  {(src as { citation: string }).citation || '(no citation)'}
                </span>
                <span className="ml-auto" style={{ color: '#8b8680' }}>
                  weight {(src as { weight: number }).weight}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: '#8b8680' }}>
            No evidence linked yet — sources accumulate as signals get filed onto this cluster.
          </p>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="text-center" title={hint}>
      <div className="text-xs uppercase tracking-wide" style={{ color: '#8b8680' }}>
        {label}
      </div>
      <div className="font-mono text-sm font-semibold" style={{ color: '#1a1a2e' }}>
        {Math.round(value)}
      </div>
    </div>
  )
}
