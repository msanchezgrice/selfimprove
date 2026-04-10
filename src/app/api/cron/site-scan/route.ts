import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedProjectSignals } from '@/lib/ai/cold-start'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, site_url')
    .eq('status', 'active')
    .not('site_url', 'is', null)

  if (!projects) return NextResponse.json({ scanned: 0 })

  let scanned = 0
  for (const project of projects) {
    if (!project.site_url) continue
    try {
      await seedProjectSignals(project.id, project.site_url)
      scanned++
    } catch {}
  }

  return NextResponse.json({ scanned, total: projects.length })
}
