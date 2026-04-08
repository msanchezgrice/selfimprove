import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

async function mockSupabase(count: number | null) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue({ count }),
  }
  const { createAdminClient } = await import('@/lib/supabase/admin')
  vi.mocked(createAdminClient).mockReturnValue(chain as any)
  return chain
}

describe('checkDailyCap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns allowed with full remaining when 0 used', async () => {
    await mockSupabase(0)
    const { checkDailyCap } = await import('./daily-cap')
    const result = await checkDailyCap('proj-1', 5)
    expect(result).toEqual({ allowed: true, used: 0, remaining: 5 })
  })

  it('returns allowed with 1 remaining when 4 used out of 5', async () => {
    await mockSupabase(4)
    const { checkDailyCap } = await import('./daily-cap')
    const result = await checkDailyCap('proj-1', 5)
    expect(result).toEqual({ allowed: true, used: 4, remaining: 1 })
  })

  it('returns not allowed when used equals cap', async () => {
    await mockSupabase(5)
    const { checkDailyCap } = await import('./daily-cap')
    const result = await checkDailyCap('proj-1', 5)
    expect(result).toEqual({ allowed: false, used: 5, remaining: 0 })
  })

  it('returns not allowed when used exceeds cap', async () => {
    await mockSupabase(10)
    const { checkDailyCap } = await import('./daily-cap')
    const result = await checkDailyCap('proj-1', 5)
    expect(result).toEqual({ allowed: false, used: 10, remaining: 0 })
  })

  it('treats null count as 0 used (allowed)', async () => {
    await mockSupabase(null)
    const { checkDailyCap } = await import('./daily-cap')
    const result = await checkDailyCap('proj-1', 5)
    expect(result).toEqual({ allowed: true, used: 0, remaining: 5 })
  })
})
