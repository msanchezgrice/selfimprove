import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function getGitHubToken(): Promise<string | null> {
  const supabase = await createClient()

  // First try the session (freshest)
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.provider_token) return session.provider_token

  // Fall back to stored token
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: member } = await admin
    .from('org_members')
    .select('github_token')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  return member?.github_token ?? null
}
