import { getStripe } from './client'
import { TIERS } from '@/lib/constants/tiers'

const PRODUCT_PREFIX = 'selfimprove_'

interface TierPrice {
  productId: string
  priceId: string
}

let _priceCache: Record<string, TierPrice> | null = null

export async function ensureTierPrices(): Promise<Record<string, TierPrice>> {
  if (_priceCache) return _priceCache

  const stripe = getStripe()
  const cache: Record<string, TierPrice> = {}

  for (const [tierKey, tier] of Object.entries(TIERS)) {
    if (tier.price === 0) continue // Skip free tier

    const productName = `SelfImprove ${tier.name}`
    const lookupKey = `${PRODUCT_PREFIX}${tierKey}_monthly`

    // Try to find existing price by lookup_key
    const existingPrices = await stripe.prices.list({
      lookup_keys: [lookupKey],
      limit: 1,
    })

    if (existingPrices.data.length > 0) {
      const price = existingPrices.data[0]
      cache[tierKey] = {
        productId: price.product as string,
        priceId: price.id,
      }
      continue
    }

    // Create product
    const product = await stripe.products.create({
      name: productName,
      description: `SelfImprove ${tier.name} plan — ${tierKey === 'pro' ? '3 projects, 10K signals/mo' : 'Unlimited projects & signals'}`,
      metadata: { tier: tierKey },
    })

    // Create price with lookup_key for idempotent retrieval
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: tier.price,
      currency: 'usd',
      recurring: { interval: 'month' },
      lookup_key: lookupKey,
      metadata: { tier: tierKey },
    })

    cache[tierKey] = {
      productId: product.id,
      priceId: price.id,
    }
  }

  _priceCache = cache
  return cache
}
