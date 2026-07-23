import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { TIERS, type TierName } from '@/lib/constants/tiers'
import {
  CheckoutConfigurationError,
  getCheckoutPriceId,
  getSubscriptionData,
} from '@/lib/stripe/checkout-config'
import { getSiteUrl } from '@/lib/site-config'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as { tier?: TierName } | null
  const tier = body?.tier
  if (!tier || !TIERS[tier] || TIERS[tier].price === 0) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
  }

  let priceId: string
  try {
    priceId = getCheckoutPriceId(tier)
  } catch (error) {
    if (error instanceof CheckoutConfigurationError) {
      console.error('[stripe/checkout]', error.message)
      return NextResponse.json(
        { error: 'Billing is not configured yet. Please contact support.' },
        { status: 503 },
      )
    }
    throw error
  }

  // Get user's org
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, orgs(id, stripe_customer_id, stripe_subscription_id)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership?.orgs) {
    return NextResponse.json(
      { error: 'No organization found' },
      { status: 400 },
    )
  }

  const org = membership.orgs as unknown as {
    id: string
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
  }
  if (org.stripe_subscription_id) {
    return NextResponse.json(
      { error: 'Use Manage Billing to change an existing subscription.' },
      { status: 409 },
    )
  }

  let customerId = org.stripe_customer_id
  const hadExistingCustomer = Boolean(customerId)

  // Create Stripe customer if needed
  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: user.email,
      metadata: { org_id: org.id, user_id: user.id },
    })
    customerId = customer.id

    const { error: customerUpdateError } = await supabase
      .from('orgs')
      .update({ stripe_customer_id: customerId })
      .eq('id', org.id)
    if (customerUpdateError) {
      return NextResponse.json(
        { error: 'Unable to save billing customer' },
        { status: 500 },
      )
    }
  }

  const previousSubscriptions = hadExistingCustomer
    ? await getStripe().subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 1,
      })
    : null
  const hasSubscriptionHistory = Boolean(previousSubscriptions?.data.length)

  const appUrl = getSiteUrl()

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: { org_id: org.id, tier },
    subscription_data: {
      ...getSubscriptionData(hasSubscriptionHistory),
      metadata: { org_id: org.id, tier },
    },
    allow_promotion_codes: true,
    success_url: `${appUrl}/dashboard?billing=success`,
    cancel_url: `${appUrl}/dashboard?billing=cancelled`,
  })

  return NextResponse.json({ url: session.url })
}
