import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyTierChanged } from '@/lib/notifications'
import type { TierName } from '@/lib/constants/tiers'
import { resolveSubscriptionTier } from '@/lib/stripe/subscription-state'

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

        const { error: updateError } = await supabase
          .from('orgs')
          .update({
            tier,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', orgId)
        if (updateError) throw updateError

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
      const metadataOrgId = subscription.metadata?.org_id
      const { data: org } = metadataOrgId
        ? await supabase.from('orgs').select('id').eq('id', metadataOrgId).maybeSingle()
        : await supabase
            .from('orgs')
            .select('id')
            .eq('stripe_subscription_id', subscription.id)
            .maybeSingle()

      if (org) {
        const tier = resolveSubscriptionTier(
          subscription.status,
          subscription.metadata?.tier,
        )
        const { error: updateError } = await supabase
          .from('orgs')
          .update({
            tier,
            stripe_subscription_id: tier === 'free' ? null : subscription.id,
          })
          .eq('id', org.id)
        if (updateError) throw updateError
      }
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      const { data: org } = await supabase
        .from('orgs')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .maybeSingle()

      if (org) {
        const { error: updateError } = await supabase
          .from('orgs')
          .update({ tier: 'free', stripe_subscription_id: null })
          .eq('id', org.id)
        if (updateError) throw updateError
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
