import { TIERS, type TierName } from '@/lib/constants/tiers'

export type TierCheck =
  | { allowed: true }
  | { allowed: false; reason: string; upgradeRequired: TierName }

export function canCreateProject(
  tier: TierName,
  currentCount: number,
): TierCheck {
  const limit = TIERS[tier].maxProjects
  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `${TIERS[tier].name} plan allows ${limit} project${limit === 1 ? '' : 's'}`,
      upgradeRequired: tier === 'free' ? 'pro' : 'autonomous',
    }
  }
  return { allowed: true }
}

export function canIngestSignal(
  tier: TierName,
  monthlyCount: number,
): TierCheck {
  const limit = TIERS[tier].maxSignalsPerMonth
  if (monthlyCount >= limit) {
    return {
      allowed: false,
      reason: `${TIERS[tier].name} plan allows ${limit} signals/month`,
      upgradeRequired: tier === 'free' ? 'pro' : 'autonomous',
    }
  }
  return { allowed: true }
}

export function canUseVoice(tier: TierName): TierCheck {
  if (TIERS[tier].voiceCompanionLimit === 0) {
    return {
      allowed: false,
      reason: 'Voice companion requires Pro plan',
      upgradeRequired: 'pro',
    }
  }
  return { allowed: true }
}

export function canUseFeature(
  tier: TierName,
  feature: keyof (typeof TIERS)['free']['features'],
): TierCheck {
  if (!TIERS[tier].features[feature]) {
    const required =
      feature === 'autoMerge' || feature === 'autoApprove'
        ? 'autonomous'
        : 'pro'
    return {
      allowed: false,
      reason: `${feature} requires ${TIERS[required].name} plan`,
      upgradeRequired: required,
    }
  }
  return { allowed: true }
}
