import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  // Verify GitHub webhook signature (optional for now — use a secret later)
  const event = request.headers.get('x-github-event')

  if (event !== 'pull_request') {
    return NextResponse.json({ ignored: true })
  }

  const payload = await request.json()
  const action = payload.action // opened, closed, merged, etc.
  const pr = payload.pull_request

  if (!pr) return NextResponse.json({ ignored: true })

  const supabase = createAdminClient()

  // Find roadmap item by PR number + repo URL
  const repoUrl = pr.base?.repo?.html_url
  if (!repoUrl) return NextResponse.json({ ignored: true })

  const { data: items } = await supabase
    .from('roadmap_items')
    .select('id, status, build_status')
    .eq('pr_number', pr.number)

  if (!items || items.length === 0) {
    return NextResponse.json({ matched: false })
  }

  for (const item of items) {
    if (pr.merged) {
      await supabase
        .from('roadmap_items')
        .update({ status: 'shipped', build_status: 'merged' })
        .eq('id', item.id)
    } else if (action === 'closed' && !pr.merged) {
      await supabase
        .from('roadmap_items')
        .update({ build_status: 'approved' })
        .eq('id', item.id)
    }
  }

  return NextResponse.json({ matched: items.length, action })
}
