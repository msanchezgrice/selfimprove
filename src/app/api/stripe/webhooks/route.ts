import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyTierChanged } from '@/lib/notifications'
import type { TierName } from '@/lib/constants/tiers'

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const orgId = session.metadata?.org_id
      const tier = session.metadata?.tier as TierName
      if (orgId && tier) {
        // Get old tier before updating
        const { data: orgBefore } = await supabase
          .from('orgs')
          .select('tier')
          .eq('id', orgId)
          .single()
        const oldTier = (orgBefore?.tier as string) || 'free'

        await supabase
          .from('orgs')
          .update({
            tier,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', orgId)

        // Notify about tier change (fire-and-forget)
        const { data: orgProject } = await supabase
          .from('projects')
          .select('id')
          .eq('org_id', orgId)
          .limit(1)
          .single()
        if (orgProject) {
          notifyTierChanged(orgProject.id, oldTier, tier).catch(() => {})
        }
      }
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object
      // If subscription is cancelled/past_due, downgrade to free
      if (
        subscription.status === 'canceled' ||
        subscription.status === 'past_due'
      ) {
        const { data: org } = await supabase
          .from('orgs')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single()

        if (org) {
          await supabase
            .from('orgs')
            .update({ tier: 'free', stripe_subscription_id: null })
            .eq('id', org.id)
        }
      }
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      const { data: org } = await supabase
        .from('orgs')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .single()

      if (org) {
        await supabase
          .from('orgs')
          .update({ tier: 'free', stripe_subscription_id: null })
          .eq('id', org.id)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
