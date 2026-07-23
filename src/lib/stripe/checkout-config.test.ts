import { describe, expect, it } from 'vitest'

import {
  CheckoutConfigurationError,
  getCheckoutPriceId,
  getSubscriptionData,
} from './checkout-config'

describe('checkout configuration', () => {
  const env = {
    STRIPE_PRO_PRICE_ID: 'price_pro',
    STRIPE_AUTONOMOUS_PRICE_ID: 'price_autonomous',
  }

  it('maps each paid tier to its preconfigured Stripe price', () => {
    expect(getCheckoutPriceId('pro', env)).toBe('price_pro')
    expect(getCheckoutPriceId('autonomous', env)).toBe('price_autonomous')
  })

  it('rejects free checkout and missing catalog configuration', () => {
    expect(() => getCheckoutPriceId('free', env)).toThrow(
      CheckoutConfigurationError,
    )
    expect(() => getCheckoutPriceId('pro', {})).toThrow(
      'STRIPE_PRO_PRICE_ID is not configured',
    )
  })

  it('offers the advertised trial once, not on subscription changes', () => {
    expect(getSubscriptionData(false)).toEqual({ trial_period_days: 14 })
    expect(getSubscriptionData(true)).toBeUndefined()
  })
})
