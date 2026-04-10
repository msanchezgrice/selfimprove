import { createAdminClient } from '@/lib/supabase/admin'

export async function authenticateApiKey(request: Request): Promise<{ userId: string; orgId: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer si_')) return null

  const apiKey = authHeader.slice(7) // Remove "Bearer "
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('org_members')
    .select('user_id, org_id')
    .eq('api_key', apiKey)
    .limit(1)
    .single()

  if (!data) return null
  return { userId: data.user_id, orgId: data.org_id }
}

export async function getGitHubTokenFromApiKey(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer si_')) return null

  const apiKey = authHeader.slice(7)
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('org_members')
    .select('github_token')
    .eq('api_key', apiKey)
    .limit(1)
    .single()

  return data?.github_token ?? null
}
