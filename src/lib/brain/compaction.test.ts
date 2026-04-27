import { describe, expect, it } from 'vitest'

import { compactPageVersions } from './compaction'

/**
 * Tiny in-memory supabase stub that supports the subset of the fluent API
 * `compactPageVersions` touches: select/eq/order/delete({count}).in/limit.
 * Everything else throws so we fail loud on API drift.
 */
type Version = { id: string; page_id: string; version: number; created_at: string }

function makeStub(state: {
  pages: Array<{ id: string; project_id?: string }>
  versions: Version[]
}) {
  const deleteLog: { versionsDeleted: string[]; chunksDeletedForVersions: string[] } = {
    versionsDeleted: [],
    chunksDeletedForVersions: [],
  }

  function from(table: string) {
    if (table === 'brain_pages') {
      let rows = [...state.pages]
      const builder = {
        select() {
          return builder
        },
        eq(column: string, value: unknown) {
          rows = rows.filter((row) => (row as Record<string, unknown>)[column] === value)
          return builder
        },
        limit() {
          return builder
        },
        then(resolve: (value: { data: typeof rows; error: null }) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(resolve)
        },
      }
      return builder
    }
    if (table === 'brain_page_versions') {
      let rows = [...state.versions]
      const builder = {
        select() {
          return builder
        },
        eq(column: string, value: unknown) {
          rows = rows.filter((row) => (row as Record<string, unknown>)[column] === value)
          return builder
        },
        order(column: string, opts?: { ascending?: boolean }) {
          const ascending = opts?.ascending ?? true
          rows = [...rows].sort((a, b) => {
            const av = a[column as keyof Version]
            const bv = b[column as keyof Version]
            if (av === bv) return 0
            return ascending ? (av! > bv! ? 1 : -1) : av! > bv! ? -1 : 1
          })
          return builder
        },
        delete() {
          return {
            in(_col: string, values: string[]) {
              state.versions = state.versions.filter((row) => !values.includes(row.id))
              deleteLog.versionsDeleted.push(...values)
              return Promise.resolve({ error: null, count: values.length })
            },
          }
        },
        then(resolve: (value: { data: typeof rows; error: null }) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(resolve)
        },
      }
      return builder
    }
    if (table === 'brain_chunks') {
      return {
        delete() {
          return {
            in(_col: string, values: string[]) {
              deleteLog.chunksDeletedForVersions.push(...values)
              // Return the count we "deleted" — test doesn't maintain chunk state.
              return Promise.resolve({ error: null, count: values.length * 2 })
            },
          }
        },
      }
    }
    throw new Error(`Unexpected table ${table}`)
  }

  return {
    supabase: { from } as unknown as Parameters<typeof compactPageVersions>[0],
    deleteLog,
  }
}

const DAY = 24 * 60 * 60 * 1000

describe('compactPageVersions', () => {
  it('keeps pages untouched when they have <= keepMin versions', async () => {
    const now = Date.now()
    const { supabase, deleteLog } = makeStub({
      pages: [{ id: 'p1' }],
      versions: Array.from({ length: 4 }, (_unused, index) => ({
        id: `v-${index}`,
        page_id: 'p1',
        version: index + 1,
        created_at: new Date(now - 120 * DAY).toISOString(),
      })),
    })

    const result = await compactPageVersions(supabase, { keepMin: 5, olderThanDays: 30 })
    expect(result.versionsPruned).toBe(0)
    expect(deleteLog.versionsDeleted).toHaveLength(0)
  })

  it('keeps the top-keepMin most recent versions regardless of age', async () => {
    const now = Date.now()
    const versions: Version[] = Array.from({ length: 10 }, (_unused, index) => ({
      id: `v-${index}`,
      page_id: 'p1',
      version: index + 1,
      created_at: new Date(now - (10 - index) * 10 * DAY).toISOString(),
    }))
    const { supabase, deleteLog } = makeStub({ pages: [{ id: 'p1' }], versions })

    const result = await compactPageVersions(supabase, { keepMin: 3, olderThanDays: 20 })
    // Last 3 (versions 8, 9, 10) are kept regardless of age.
    expect(deleteLog.versionsDeleted).not.toContain('v-9')
    expect(deleteLog.versionsDeleted).not.toContain('v-8')
    expect(deleteLog.versionsDeleted).not.toContain('v-7')
    expect(result.versionsPruned).toBeGreaterThan(0)
  })

  it('does not delete when dryRun is true', async () => {
    const now = Date.now()
    const versions: Version[] = Array.from({ length: 10 }, (_unused, index) => ({
      id: `v-${index}`,
      page_id: 'p1',
      version: index + 1,
      created_at: new Date(now - (10 - index) * 10 * DAY).toISOString(),
    }))
    const { supabase, deleteLog } = makeStub({ pages: [{ id: 'p1' }], versions })

    const result = await compactPageVersions(supabase, {
      keepMin: 3,
      olderThanDays: 20,
      dryRun: true,
    })
    expect(result.dryRun).toBe(true)
    expect(result.versionsPruned).toBeGreaterThan(0)
    expect(deleteLog.versionsDeleted).toHaveLength(0)
  })
})
