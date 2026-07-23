import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { getSiteUrl } from '@/lib/site-config'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('orgs(stripe_customer_id)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  const org = membership?.orgs as unknown as {
    stripe_customer_id: string | null
  } | null
  if (!org?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account' }, { status: 400 })
  }

  const appUrl = getSiteUrl()

  const session = await getStripe().billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${appUrl}/dashboard`,
  })

  return NextResponse.json({ url: session.url })
}
