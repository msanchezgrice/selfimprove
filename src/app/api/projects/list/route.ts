import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) return NextResponse.json({ projects: [] })

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, slug, status, framework')
    .eq('org_id', membership.org_id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ projects: projects || [] })
}
