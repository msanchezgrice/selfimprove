import { cookies } from 'next/headers'
import { createClient } from './server'

export async function getActiveProject() {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const selectedId = cookieStore.get('selfimprove_project')?.value

  if (selectedId) {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('id', selectedId)
      .single()
    if (data) return data
  }

  // Fallback: first project in user's org
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .limit(1)
    .single()

  if (!membership) return null

  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('org_id', membership.org_id)
    .limit(1)
    .single()

  return data
}
