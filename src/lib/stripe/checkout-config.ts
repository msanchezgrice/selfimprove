import type { TierName } from '@/lib/constants/tiers'

type CheckoutEnvironment = {
  STRIPE_PRO_PRICE_ID?: string
  STRIPE_AUTONOMOUS_PRICE_ID?: string
}

export class CheckoutConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutConfigurationError'
  }
}

export function getCheckoutPriceId(
  tier: TierName,
  env: CheckoutEnvironment = process.env as CheckoutEnvironment,
): string {
  if (tier === 'free') {
    throw new CheckoutConfigurationError('Free tier does not use checkout')
  }

  const variable =
    tier === 'pro' ? 'STRIPE_PRO_PRICE_ID' : 'STRIPE_AUTONOMOUS_PRICE_ID'
  const priceId = env[variable]?.trim()

  if (!priceId) {
    throw new CheckoutConfigurationError(`${variable} is not configured`)
  }

  return priceId
}

export function getSubscriptionData(hasExistingSubscription: boolean) {
  if (hasExistingSubscription) return undefined

  return { trial_period_days: 14 } as const
}
