import { describe, expect, it } from 'vitest'

// We test the small pure helpers + the merge-decision shape by injecting a
// fake supabase client. Persistence specifics are exercised in integration.

import { dedupHistoricalItems } from './dedup-items'

type StubRow = {
  id: string
  title: string
  status: string
  stage: string
  opportunity_cluster_id: string | null
  updated_at: string
  created_at: string
}

function makeStubSupabase(rows: StubRow[]) {
  const dismissed: Array<{ id: string; reason: string }> = []
  const deletedSrcIds: string[] = []
  const client = {
    from(table: string) {
      if (table === 'roadmap_items') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: () => Promise.resolve({ data: rows, error: null }),
              }),
            }),
          }),
          update: (patch: { status: string; dismiss_reason: string }) => ({
            eq: (_col: string, id: string) => {
              dismissed.push({ id, reason: patch.dismiss_reason })
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      if (table === 'opportunity_cluster_sources') {
        return {
          delete: () => ({
            in: (_col: string, ids: string[]) => {
              deletedSrcIds.push(...ids)
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { client, dismissed, deletedSrcIds }
}

const baseRow = (overrides: Partial<StubRow>): StubRow => ({
  id: 'id',
  title: 'title',
  status: 'proposed',
  stage: 'roadmap',
  opportunity_cluster_id: null,
  updated_at: '2026-04-01T10:00:00Z',
  created_at: '2026-04-01T10:00:00Z',
  ...overrides,
})

describe('dedupHistoricalItems', () => {
  it('merges items with the same first-6-word key, keeping the most recent', async () => {
    const rows: StubRow[] = [
      baseRow({ id: 'old', title: 'Fix onboarding async failure step validation', updated_at: '2026-03-15T10:00:00Z' }),
      baseRow({ id: 'new', title: 'Fix onboarding async failure step validation errors', updated_at: '2026-04-15T10:00:00Z' }),
    ]
    const { client, dismissed } = makeStubSupabase(rows)
    const result = await dedupHistoricalItems(client as never, 'p1')
    expect(result.exactGroups).toBe(1)
    expect(result.exactMerged).toBe(1)
    expect(dismissed).toEqual([
      { id: 'old', reason: expect.stringContaining('auto-merged duplicate of new') },
    ])
  })

  it('catches near-duplicates within the same cluster via cosine', async () => {
    const rows: StubRow[] = [
      baseRow({ id: 'a', title: 'Add error tracking with Sentry integration', updated_at: '2026-04-01T10:00:00Z', opportunity_cluster_id: 'c1' }),
      baseRow({ id: 'b', title: 'Add error tracking via Sentry integration', updated_at: '2026-04-10T10:00:00Z', opportunity_cluster_id: 'c1' }),
      baseRow({ id: 'c', title: 'Improve checkout conversion with new pricing page', updated_at: '2026-04-05T10:00:00Z', opportunity_cluster_id: 'c2' }),
    ]
    const { client, dismissed } = makeStubSupabase(rows)
    const result = await dedupHistoricalItems(client as never, 'p1')
    expect(result.cosineMerged).toBe(1)
    expect(dismissed).toEqual([
      { id: 'a', reason: expect.stringContaining('auto-merged duplicate of b') },
    ])
  })

  it('exact-key merge ignores cluster boundaries (literally-identical titles are dupes)', async () => {
    const rows: StubRow[] = [
      baseRow({ id: 'a', title: 'Improve onboarding completion rate', opportunity_cluster_id: 'c1', updated_at: '2026-04-01T10:00:00Z' }),
      baseRow({ id: 'b', title: 'Improve onboarding completion rate', opportunity_cluster_id: 'c2', updated_at: '2026-04-10T10:00:00Z' }),
    ]
    const { client, dismissed } = makeStubSupabase(rows)
    const result = await dedupHistoricalItems(client as never, 'p1')
    expect(result.exactMerged).toBe(1)
    expect(dismissed).toEqual([
      { id: 'a', reason: expect.stringContaining('auto-merged duplicate of b') },
    ])
  })

  it('cosine pass stays scoped to one cluster so different clusters don\'t cross-merge', async () => {
    const rows: StubRow[] = [
      baseRow({ id: 'a', title: 'Improve onboarding flow with better validation', opportunity_cluster_id: 'c1', updated_at: '2026-04-01T10:00:00Z' }),
      // Word-for-word similar to 'a' but lives in cluster c2 \u2014 cosine pass should NOT merge.
      baseRow({ id: 'b', title: 'Improve onboarding flow via better validation hints', opportunity_cluster_id: 'c2', updated_at: '2026-04-10T10:00:00Z' }),
    ]
    const { client, dismissed } = makeStubSupabase(rows)
    const result = await dedupHistoricalItems(client as never, 'p1')
    expect(result.cosineMerged).toBe(0)
    expect(dismissed).toEqual([])
  })

  it('respects dryRun by reporting counts but not writing', async () => {
    const rows: StubRow[] = [
      baseRow({ id: 'old', title: 'Fix onboarding async failure step validation', updated_at: '2026-03-15T10:00:00Z' }),
      baseRow({ id: 'new', title: 'Fix onboarding async failure step validation errors', updated_at: '2026-04-15T10:00:00Z' }),
    ]
    const { client, dismissed } = makeStubSupabase(rows)
    const result = await dedupHistoricalItems(client as never, 'p1', { dryRun: true })
    expect(result.exactMerged).toBe(1)
    expect(dismissed).toEqual([])
  })
})
