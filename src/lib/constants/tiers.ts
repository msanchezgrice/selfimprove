export const TIERS = {
  free: {
    name: 'Free',
    price: 0,
    maxProjects: 1,
    maxSignalsPerMonth: 100,
    voiceCompanionLimit: 0,
    features: { autoImplement: false, autoApprove: false, autoMerge: false, posthog: false, sentry: false },
  },
  pro: {
    name: 'Pro',
    price: 4900,
    maxProjects: 3,
    maxSignalsPerMonth: 10000,
    voiceCompanionLimit: 100,
    features: { autoImplement: true, autoApprove: false, autoMerge: false, posthog: true, sentry: true },
  },
  autonomous: {
    name: 'Autonomous',
    price: 19900,
    maxProjects: Infinity,
    maxSignalsPerMonth: Infinity,
    voiceCompanionLimit: 500,
    features: { autoImplement: true, autoApprove: true, autoMerge: true, posthog: true, sentry: true },
  },
} as const;

export type TierName = keyof typeof TIERS;
export const DAILY_VOICE_CAP_PER_PROJECT = 20;
