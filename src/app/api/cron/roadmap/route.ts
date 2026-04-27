import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateRoadmap } from '@/lib/ai/generate-roadmap'
import { generatePRD } from '@/lib/ai/generate-prd'
import { rollupProjectFunnel } from '@/lib/brain/funnel-rollup'
import { verifySecret } from '@/lib/auth/verify-secret'

export async function GET(request: Request) {
  // Verify cron secret (Vercel sets this header)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader || !verifySecret(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // v1.1.5: ingest funnel anomalies from PostHog (HogQL aggregates), not raw
  // events. Each rollup mints at most a handful of `funnel_anomaly` signals
  // per project — only when a rate or count actually moved enough to matter.
  // The legacy per-event poll (50 events/hour, no aggregation) is gone.
  const { data: posthogProjects } = await supabase
    .from('project_settings')
    .select('project_id')
    .not('posthog_api_key', 'is', null)

  const subscriptionProjects = (
    await supabase.from('posthog_subscriptions').select('project_id')
  ).data ?? []

  const projectsWithPosthog = new Set<string>([
    ...(posthogProjects ?? []).map((p) => p.project_id),
    ...subscriptionProjects.map((p) => p.project_id),
  ])

  for (const projectId of projectsWithPosthog) {
    try {
      await rollupProjectFunnel(supabase, projectId, { source: 'cron' })
    } catch (err) {
      console.warn('[cron/roadmap] funnel-rollup failed', {
        projectId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Find projects with unprocessed signals
  const { data: projects } = await supabase
    .from('signals')
    .select('project_id')
    .eq('processed', false)
    .limit(100)

  if (!projects || projects.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  // Deduplicate project IDs
  const projectIds = [...new Set(projects.map((p) => p.project_id))]

  // Check which projects have automation enabled
  const { data: settings } = await supabase
    .from('project_settings')
    .select('project_id')
    .in('project_id', projectIds)
    .eq('automation_roadmap_enabled', true)

  const enabledIds = new Set(settings?.map((s) => s.project_id) || [])
  const toProcess = projectIds.filter((id) => enabledIds.has(id))

  let processed = 0
  const errors: string[] = []

  const generationIds: string[] = []

  for (const projectId of toProcess) {
    try {
      const result = await generateRoadmap(projectId)
      generationIds.push(result.generationId)
      processed++
    } catch (err) {
      errors.push(
        `${projectId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    }
  }

  // Queue PRD generation for all new items after response
  if (generationIds.length > 0) {
    after(async () => {
      const db = createAdminClient()
      for (const genId of generationIds) {
        const { data: items } = await db
          .from('roadmap_items')
          .select('id')
          .eq('generation_id', genId)
          .is('prd_content', null)

        if (items) {
          for (const item of items) {
            try {
              await generatePRD(item.id)
              console.log(`[cron/after] PRD generated for ${item.id}`)
            } catch (err) {
              console.error(`[cron/after] PRD failed for ${item.id}:`, err)
            }
          }
        }
      }
    })
  }

  return NextResponse.json({ processed, total: toProcess.length, errors })
}
