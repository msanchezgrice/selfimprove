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

  await admin
    .from('org_members')
    .update({ api_key: apiKey })
    .eq('user_id', user.id)

  return NextResponse.json({ api_key: apiKey })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('org_members')
    .select('api_key')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  return NextResponse.json({ api_key: data?.api_key || null })
}
