import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateRoadmap } from '@/lib/ai/generate-roadmap'
import { generatePRD } from '@/lib/ai/generate-prd'
import { verifySecret } from '@/lib/auth/verify-secret'

export async function GET(request: Request) {
  // Verify cron secret (Vercel sets this header)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader || !verifySecret(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Sync PostHog events for projects with API keys
  const { data: posthogProjects } = await supabase
    .from('project_settings')
    .select('project_id, posthog_api_key')
    .not('posthog_api_key', 'is', null)

  if (posthogProjects) {
    for (const ps of posthogProjects) {
      try {
        // Fetch and create signals from PostHog
        const eventsRes = await fetch('https://app.posthog.com/api/event/?limit=50&order_by=-timestamp', {
          headers: { Authorization: `Bearer ${ps.posthog_api_key}` },
        })
        if (eventsRes.ok) {
          const data = await eventsRes.json()
          const events = data.results?.filter((e: any) =>
            e.event?.includes('$exception') || e.event?.includes('$rageclick') || !e.event?.startsWith('$')
          ) || []

          if (events.length > 0) {
            const signals = events.slice(0, 10).map((e: any) => ({
              project_id: ps.project_id,
              type: e.event?.includes('$exception') ? 'error' : 'analytics' as const,
              title: `PostHog: ${e.event}`,
              content: e.properties?.$exception_message || `Event "${e.event}" detected`,
              metadata: { source: 'posthog', event_name: e.event },
              weight: e.event?.includes('$exception') ? 3 : 2,
            }))
            await supabase.from('signals').insert(signals)
          }
        }
      } catch { /* skip on error */ }
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
