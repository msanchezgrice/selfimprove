import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SITE_URL,
  getEmailFromAddress,
  getSiteUrl,
} from './site-config'

describe('site configuration', () => {
  it('uses the owned Vercel deployment as the safe default', () => {
    expect(DEFAULT_SITE_URL).toBe('https://shipsitself.com')
    expect(DEFAULT_SITE_URL).not.toContain('selfimprove-iota.vercel.app')
  })

  it('normalizes an explicitly configured app URL', () => {
    expect(getSiteUrl('https://example.com/')).toBe('https://example.com')
  })

  it('requires an explicitly configured sender instead of impersonating an unowned domain', () => {
    expect(getEmailFromAddress(undefined)).toBeNull()
    expect(getEmailFromAddress('hello@example.com')).toBe(
      'Ships Itself <hello@example.com>',
    )
    expect(getEmailFromAddress('Ships Itself Team <hello@example.com>')).toBe(
      'Ships Itself Team <hello@example.com>',
    )
  })
})
