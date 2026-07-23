import { describe, expect, it } from 'vitest'

import { resolveSubscriptionTier } from './subscription-state'

describe('Stripe subscription state', () => {
  it('keeps configured paid tiers for active and trialing subscriptions', () => {
    expect(resolveSubscriptionTier('active', 'pro')).toBe('pro')
    expect(resolveSubscriptionTier('trialing', 'autonomous')).toBe('autonomous')
  })

  it('fails closed for unpaid or cancelled subscriptions', () => {
    expect(resolveSubscriptionTier('past_due', 'pro')).toBe('free')
    expect(resolveSubscriptionTier('unpaid', 'autonomous')).toBe('free')
    expect(resolveSubscriptionTier('canceled', 'pro')).toBe('free')
  })

  it('does not grant a paid tier from invalid metadata', () => {
    expect(resolveSubscriptionTier('active', 'enterprise')).toBe('free')
    expect(resolveSubscriptionTier('active', undefined)).toBe('free')
  })
})
