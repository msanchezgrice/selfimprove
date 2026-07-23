import type { TierName } from '@/lib/constants/tiers'

export function resolveSubscriptionTier(
  status: string,
  metadataTier: string | undefined,
): TierName {
  const paidTier =
    metadataTier === 'pro' || metadataTier === 'autonomous'
      ? metadataTier
      : null

  if ((status === 'active' || status === 'trialing') && paidTier) {
    return paidTier
  }

  return 'free'
}
