import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptIfNeeded } from '@/lib/crypto'

export async function authenticateApiKey(request: Request): Promise<{ userId: string; orgId: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer si_')) return null

  const apiKey = authHeader.slice(7) // Remove "Bearer "
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('org_members')
    .select('user_id, org_id')
    .eq('api_key_hash', keyHash)
    .limit(1)
    .single()

  if (!data) return null
  return { userId: data.user_id, orgId: data.org_id }
}

export async function getGitHubTokenFromApiKey(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer si_')) return null

  const apiKey = authHeader.slice(7)
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('org_members')
    .select('github_token')
    .eq('api_key_hash', keyHash)
    .limit(1)
    .single()

  if (!data?.github_token) return null
  return decryptIfNeeded(data.github_token)
}
