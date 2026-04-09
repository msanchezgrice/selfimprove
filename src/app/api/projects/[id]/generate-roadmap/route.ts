import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateRoadmap } from '@/lib/ai/generate-roadmap'
import { generatePRD } from '@/lib/ai/generate-prd'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify project exists and user has access
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', id)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Check if there are unprocessed signals
  const admin = createAdminClient()
  const { count } = await admin
    .from('signals')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', id)
    .eq('processed', false)

  if (!count || count === 0) {
    return NextResponse.json(
      { error: 'No new signals to process', count: 0 },
      { status: 400 }
    )
  }

  try {
    const result = await generateRoadmap(id)

    // Queue PRD generation for all new items AFTER response is sent
    if (result.items.length > 0) {
      after(async () => {
        const adminDb = createAdminClient()
        const { data: items } = await adminDb
          .from('roadmap_items')
          .select('id')
          .eq('generation_id', result.generationId)

        if (items) {
          for (const item of items) {
            try {
              await generatePRD(item.id)
              console.log(`[after] PRD generated for ${item.id}`)
            } catch (err) {
              console.error(`[after] PRD failed for ${item.id}:`, err)
            }
          }
        }
      })
    }

    return NextResponse.json({
      items: result.items.length,
      generationId: result.generationId,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
