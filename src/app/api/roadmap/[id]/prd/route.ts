import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePRD } from '@/lib/ai/generate-prd'

export async function POST(
  req: NextRequest,
  ctx: RouteContext<'/api/roadmap/[id]/prd'>,
) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse optional feedback from request body
  const body = await req.json().catch(() => ({}))
  const feedback = (body as Record<string, unknown>)?.feedback as string | undefined

  // Verify user has access to this roadmap item's project
  const { data: item } = await supabase
    .from('roadmap_items')
    .select('id, project_id, prd_content')
    .eq('id', id)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // If PRD already exists and no feedback for refinement, return cached
  if (item.prd_content && !feedback) {
    return NextResponse.json({ prd: item.prd_content, cached: true })
  }

  try {
    const prd = await generatePRD(id, feedback)
    return NextResponse.json({ prd, cached: false })
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'PRD generation failed',
      },
      { status: 500 },
    )
  }
}
