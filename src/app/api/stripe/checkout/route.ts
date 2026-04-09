import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { TIERS, type TierName } from '@/lib/constants/tiers'
import { ensureTierPrices } from '@/lib/stripe/products'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tier } = (await request.json()) as { tier: TierName }
  if (!tier || !TIERS[tier] || TIERS[tier].price === 0) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
  }

  // Get user's org
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, orgs(id, stripe_customer_id)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership?.orgs) {
    return NextResponse.json(
      { error: 'No organization found' },
      { status: 400 },
    )
  }

  const org = membership.orgs as unknown as { id: string; stripe_customer_id: string | null }
  let customerId = org.stripe_customer_id

  // Create Stripe customer if needed
  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: user.email,
      metadata: { org_id: org.id, user_id: user.id },
    })
    customerId = customer.id

    await supabase
      .from('orgs')
      .update({ stripe_customer_id: customerId })
      .eq('id', org.id)
  }

  const prices = await ensureTierPrices()
  const tierPrice = prices[tier]
  if (!tierPrice) {
    return NextResponse.json({ error: 'Price not configured' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [
      {
        price: tierPrice.priceId,
        quantity: 1,
      },
    ],
    metadata: { org_id: org.id, tier },
    success_url: `${appUrl}/dashboard?billing=success`,
    cancel_url: `${appUrl}/dashboard?billing=cancelled`,
  })

  return NextResponse.json({ url: session.url })
}
