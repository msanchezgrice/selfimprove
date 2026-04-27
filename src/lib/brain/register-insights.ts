import type { SupabaseClient } from '@supabase/supabase-js'

import { listInsights, type PostHogConfig } from '@/lib/posthog/client'

/**
 * Auto-discover saved PostHog Insights for a project and register each one
 * as a `metric_definitions` row of kind `posthog_insight`.
 *
 * Idempotent: re-running updates display_name + insight_short_id but never
 * deletes user-edited rows. Insights tagged `selfimprove` are filtered out
 * by the client (those are alerts the app creates itself).
 *
 * Used by the one-shot bootstrap route and as a standalone script.
 */

export type RegisterInsightsResult = {
  projectId: string
  insightsFound: number
  inserted: number
  updated: number
  skipped: number
  errors: string[]
}

export async function registerPostHogInsights(
  supabase: SupabaseClient,
  projectId: string,
  config: PostHogConfig,
): Promise<RegisterInsightsResult> {
  const result: RegisterInsightsResult = {
    projectId,
    insightsFound: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  }

  let insights: Awaited<ReturnType<typeof listInsights>>
  try {
    insights = await listInsights(config, { limit: 50 })
  } catch (err) {
    result.errors.push(
      `list insights: ${err instanceof Error ? err.message : String(err)}`,
    )
    return result
  }

  result.insightsFound = insights.length

  // Pull existing metric_definitions for this project so we don't redo work.
  const { data: existingRows } = await supabase
    .from('metric_definitions')
    .select('slug, posthog_insight_short_id, display_name')
    .eq('project_id', projectId)
    .eq('metric_kind', 'posthog_insight')
  const existing = new Map<string, { display_name: string }>(
    (
      existingRows as Array<{
        slug: string
        posthog_insight_short_id: string
        display_name: string
      }> | null
    )?.map((row) => [row.posthog_insight_short_id, { display_name: row.display_name }]) ?? [],
  )

  for (const insight of insights) {
    if (!insight.short_id) {
      result.skipped += 1
      continue
    }
    const slug = insightSlug(insight.short_id, insight.name)
    const displayName = (insight.name && insight.name.trim().length > 0
      ? insight.name
      : `Insight ${insight.short_id}`) as string

    const previous = existing.get(insight.short_id)
    if (previous && previous.display_name === displayName) {
      result.skipped += 1
      continue
    }

    if (previous) {
      const { error } = await supabase
        .from('metric_definitions')
        .update({
          display_name: displayName,
          description: insight.description ?? '',
          metadata: {
            insight_kind: insight.kind,
            tags: insight.tags ?? [],
            updated_from_posthog_at: new Date().toISOString(),
          },
        })
        .eq('project_id', projectId)
        .eq('posthog_insight_short_id', insight.short_id)
      if (error) {
        result.errors.push(`update ${slug}: ${error.message}`)
        continue
      }
      result.updated += 1
      continue
    }

    const { error } = await supabase.from('metric_definitions').insert({
      project_id: projectId,
      slug,
      display_name: displayName,
      description: insight.description ?? '',
      metric_kind: 'posthog_insight',
      posthog_insight_short_id: insight.short_id,
      funnel_stop_event_name: `insight:${slug}`,
      trend_threshold: 0.07,
      anomaly_threshold: 0.2,
      metadata: {
        insight_kind: insight.kind,
        tags: insight.tags ?? [],
        registered_at: new Date().toISOString(),
      },
    })
    if (error) {
      result.errors.push(`insert ${slug}: ${error.message}`)
      continue
    }
    result.inserted += 1
  }

  return result
}

function insightSlug(shortId: string, name: string | null | undefined): string {
  const namePart = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)
  return namePart ? `ph-${namePart}-${shortId.slice(0, 6)}` : `ph-${shortId}`
}
