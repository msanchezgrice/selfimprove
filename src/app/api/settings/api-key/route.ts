import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const apiKey = `si_${crypto.randomBytes(24).toString('hex')}`
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
  const apiKeyHint = `${apiKey.slice(0, 11)}…${apiKey.slice(-4)}`

  await admin
    .from('org_members')
    .update({ api_key_hash: apiKeyHash, api_key_hint: apiKeyHint, api_key: null })
    .eq('user_id', user.id)

  // Returned once at creation time; never retrievable again.
  return NextResponse.json({ api_key: apiKey })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('org_members')
    .select('api_key_hash, api_key_hint')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  return NextResponse.json({ api_key: null, has_key: !!data?.api_key_hash, hint: data?.api_key_hint || null })
}
