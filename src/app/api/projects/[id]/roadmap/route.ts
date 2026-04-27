import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rankRoadmapItems, type RoadmapItemForRanking } from '@/lib/brain/rerank'
import { FOCUS_MODES } from '@/lib/brain/design'
import type { OpportunityClusterRow } from '@/lib/types/database'

/**
 * Filterable roadmap query.
 *
 *   GET /api/projects/[id]/roadmap?focus=conversion&category=revenue,bug
 *      &minConfidence=70&minClusterScore=50&clusterSlugs=funnel-preview-played
 *      &status=proposed,approved&limit=25&stage=both
 *
 * Returns the ordered list using the v1.1.5 combined score (60% cluster
 * focus-weighted + 40% item ROI). The persisted `focus_weighted_score` is
 * recomputed locally when the request supplies a `focus` filter, so the
 * user can preview "what would the roadmap look like under retention?"
 * without persisting.
 *
 * All filters are optional. Sensible defaults yield the canonical roadmap.
 *
 * Auth: standard session via createClient (the project must be reachable
 * from the user's org). Server fetches via the admin client so RLS is
 * uniform across joins.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const url = new URL(req.url)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: project } = await supabase.from('projects').select('id').eq('id', id).single()
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const focus = url.searchParams.get('focus')
  if (focus && !FOCUS_MODES.some((m) => m.name === focus)) {
    return NextResponse.json(
      {
        error: `Unknown focus mode '${focus}'`,
        allowed: FOCUS_MODES.map((m) => m.name),
      },
      { status: 400 },
    )
  }

  const stage = (url.searchParams.get('stage') ?? 'roadmap').toLowerCase()
  // Allowed: roadmap | brief | both
  const stagesToInclude =
    stage === 'both' ? ['roadmap', 'brief'] : stage === 'brief' ? ['brief'] : ['roadmap']

  const filter = {
    focus: focus ?? undefined,
    category: parseListParam(url.searchParams.get('category')),
    minConfidence: parseIntOrNull(url.searchParams.get('minConfidence')) ?? 0,
    minClusterScore: parseIntOrNull(url.searchParams.get('minClusterScore')) ?? 0,
    clusterSlugs: parseListParam(url.searchParams.get('clusterSlugs')),
    status: parseListParam(url.searchParams.get('status')),
    limit: parseIntOrNull(url.searchParams.get('limit')) ?? 25,
  }

  const admin = createAdminClient()

  const [itemsRes, clustersRes, focusPageRes] = await Promise.all([
    admin
      .from('roadmap_items')
      .select(
        'id, project_id, title, description, category, status, stage, rank, confidence, roi_score, impact, size, updated_at, created_at, opportunity_cluster_id, prd_content',
      )
      .eq('project_id', id)
      .in('stage', stagesToInclude)
      .order('updated_at', { ascending: false })
      .limit(800),
    admin
      .from('opportunity_clusters')
      .select('*')
      .eq('project_id', id)
      .eq('status', 'active'),
    admin
      .from('brain_pages')
      .select('slug, updated_at')
      .eq('project_id', id)
      .eq('kind', 'current_focus')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const ranked = rankRoadmapItems(
    (itemsRes.data ?? []) as RoadmapItemForRanking[],
    (clustersRes.data ?? []) as OpportunityClusterRow[],
    filter,
  )

  const persistedFocus = (focusPageRes.data as { slug: string } | null)?.slug ?? null
  const appliedFocus = filter.focus ?? persistedFocus

  return NextResponse.json({
    project_id: id,
    persisted_focus: persistedFocus,
    applied_focus: appliedFocus,
    filter,
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
      cluster_focus_score: entry.clusterFocusScore,
      combined_score: entry.combinedScore,
      reason: entry.reason,
    })),
  })
}

function parseListParam(raw: string | null): string[] | undefined {
  if (!raw) return undefined
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : undefined
}

function parseIntOrNull(raw: string | null): number | null {
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}
