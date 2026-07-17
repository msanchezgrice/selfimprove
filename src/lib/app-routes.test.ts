import { describe, expect, it } from 'vitest'
import {
  APP_ORIGIN,
  DEFAULT_DASHBOARD_PATH,
  OWNER_DASHBOARD_URL,
  getAuthCallbackUrl,
  getAppOrigin,
  getSafeAuthNextPath,
} from './app-routes'

describe('app routes', () => {
  it('keeps authentication and the dashboard on one origin', () => {
    expect(APP_ORIGIN).toBe('https://shipsitself.com')
    expect(OWNER_DASHBOARD_URL).toBe(
      'https://shipsitself.com/dashboard/selfimprove/roadmap',
    )
  })

  it('refuses to restore the retired Vercel origin from stale environment config', () => {
    expect(getAppOrigin('https://selfimprove-iota.vercel.app')).toBe(
      'https://shipsitself.com',
    )
    expect(getAppOrigin('https://shipsitself.com/')).toBe(
      'https://shipsitself.com',
    )
  })

  it('builds an encoded callback on the app origin', () => {
    const callback = new URL(
      getAuthCallbackUrl('/dashboard?upgrade=autonomous', 'google'),
    )
    expect(callback.origin).toBe(APP_ORIGIN)
    expect(callback.pathname).toBe('/auth/callback')
    expect(callback.searchParams.get('next')).toBe(
      '/dashboard?upgrade=autonomous',
    )
    expect(callback.searchParams.get('provider')).toBe('google')
  })

  it('allows only local app destinations', () => {
    expect(getSafeAuthNextPath('/onboarding')).toBe('/onboarding')
    expect(getSafeAuthNextPath('/dashboard/example/roadmap')).toBe(
      '/dashboard/example/roadmap',
    )
    expect(getSafeAuthNextPath('https://example.com/steal')).toBe(
      DEFAULT_DASHBOARD_PATH,
    )
    expect(getSafeAuthNextPath('//example.com/steal')).toBe(
      DEFAULT_DASHBOARD_PATH,
    )
    expect(getSafeAuthNextPath('/pricing')).toBe(DEFAULT_DASHBOARD_PATH)
  })
})
