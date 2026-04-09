import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateRoadmap } from '@/lib/ai/generate-roadmap'
import { generatePRD } from '@/lib/ai/generate-prd'

export async function GET(request: Request) {
  // Verify cron secret (Vercel sets this header)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

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
