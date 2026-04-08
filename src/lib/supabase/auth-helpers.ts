import { createClient } from './server'

export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function requireUser() {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

export async function getUserOrg() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role, orgs(*)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) return null
  return {
    user,
    org: membership.orgs,
    role: membership.role,
    orgId: membership.org_id,
  }
}
