import { afterEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const originalSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseKey
})

describe('canonical product origin proxy', () => {
  it('permanently redirects every legacy Vercel path and query to Ships Itself', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const response = await proxy(
      new NextRequest(
        'https://selfimprove-iota.vercel.app/dashboard/selfimprove/roadmap?tab=signals',
      ),
    )

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(
      'https://shipsitself.com/dashboard/selfimprove/roadmap?tab=signals',
    )
  })

  it('serves login and dashboard routes directly on Ships Itself', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    for (const path of ['/login', '/onboarding', '/dashboard/selfimprove/roadmap']) {
      const response = await proxy(
        new NextRequest(`https://shipsitself.com${path}`),
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
    }
  })
})
