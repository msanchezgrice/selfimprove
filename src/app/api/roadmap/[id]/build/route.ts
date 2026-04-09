import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGitHubToken } from '@/lib/github/get-token'
import { implementRoadmapItem } from '@/lib/ai/implement'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user has access to this roadmap item
  const { data: item } = await supabase
    .from('roadmap_items')
    .select('id, prd_content')
    .eq('id', id)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!item.prd_content) {
    return NextResponse.json(
      { error: 'PRD must be generated first' },
      { status: 400 },
    )
  }

  const token = await getGitHubToken()
  if (!token) {
    return NextResponse.json({ error: 'No GitHub token' }, { status: 400 })
  }

  after(async () => {
    try {
      const result = await implementRoadmapItem(id, token)
      console.log('[build] Implementation result:', result)
    } catch (err) {
      console.error('[build] Failed:', err)
    }
  })

  return NextResponse.json({
    status: 'building',
    message: 'Implementation started',
  })
}
