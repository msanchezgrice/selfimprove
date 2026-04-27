import { describe, expect, it } from 'vitest'

import {
  formatResolvedContextForPrompt,
  getSeededResolverRules,
  resolveContextForTask,
} from './resolve-context'

type QueryTable =
  | 'brain_resolver_rules'
  | 'brain_pages'
  | 'brain_page_versions'

type MockData = {
  brain_resolver_rules: Array<Record<string, unknown>>
  brain_pages: Array<Record<string, unknown>>
  brain_page_versions: Array<Record<string, unknown>>
}

/**
 * Minimal query builder that mimics the subset of the supabase-js fluent API
 * used by `resolveContextForTask`. Supports `select().eq().in().order().single()`
 * chains and returns `{ data, error }` as a thenable.
 */
function makeSupabaseStub(data: MockData) {
  function from(table: QueryTable) {
    let rows: Array<Record<string, unknown>> = [...(data[table] ?? [])]
    const builder: Record<string, unknown> = {
      select() {
        return builder
      },
      eq(column: string, value: unknown) {
        rows = rows.filter((row) => row[column] === value)
        return builder
      },
      in(column: string, values: unknown[]) {
        rows = rows.filter((row) => values.includes(row[column]))
        return builder
      },
      order(column: string, opts?: { ascending?: boolean }) {
        const ascending = opts?.ascending ?? true
        rows = [...rows].sort((a, b) => {
          const av = a[column] as string | number | null
          const bv = b[column] as string | number | null
          if (av === bv) return 0
          if (av === null || av === undefined) return ascending ? -1 : 1
          if (bv === null || bv === undefined) return ascending ? 1 : -1
          return ascending ? (av > bv ? 1 : -1) : av > bv ? -1 : 1
        })
        return builder
      },
      single() {
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      },
      then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      },
    }
    return builder
  }

  return { from } as unknown as Parameters<typeof resolveContextForTask>[0]
}

describe('getSeededResolverRules', () => {
  it('returns the roadmap rules in priority order with current_focus first', () => {
    const rules = getSeededResolverRules('generate_roadmap')
    expect(rules[0]?.pageKind).toBe('current_focus')
    expect(rules.map((rule) => rule.priority)).toEqual(
      [...rules.map((rule) => rule.priority)].sort((a, b) => a - b),
    )
  })
})

describe('resolveContextForTask', () => {
  it('falls back to the seeded rules when the resolver_rules table is empty', async () => {
    const supabase = makeSupabaseStub({
      brain_resolver_rules: [],
      brain_pages: [],
      brain_page_versions: [],
    })

    const context = await resolveContextForTask(supabase, 'proj-1', 'generate_roadmap')

    expect(context.taskType).toBe('generate_roadmap')
    expect(context.pages.length).toBeGreaterThan(0)
    expect(context.pages[0]?.kind).toBe('current_focus')
    expect(context.pages.every((entry) => entry.missing)).toBe(true)
    expect(context.missingRequired).toContain('current_focus')
  })

  it('loads the latest brain page version for each resolver rule', async () => {
    const pageId = 'page-focus'
    const versionId = 'version-focus-2'

    const supabase = makeSupabaseStub({
      brain_resolver_rules: [
        {
          id: 'rule-1',
          task_type: 'generate_roadmap',
          page_kind: 'current_focus',
          priority: 5,
          required: true,
          reason: 'dominant-need-first',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
      ],
      brain_pages: [
        {
          id: pageId,
          project_id: 'proj-1',
          slug: 'current-focus',
          kind: 'current_focus',
          title: 'Current Focus',
          summary: 'conversion',
          status: 'active',
          importance: 100,
          freshness_score: 100,
          stale_reason: null,
          last_compacted_at: null,
          last_signal_at: null,
          last_shipped_at: null,
          metadata: {},
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
      ],
      brain_page_versions: [
        {
          id: 'version-focus-1',
          page_id: pageId,
          version: 1,
          content_md: 'focus: ux_quality',
          outline: [],
          key_facts: [],
          open_questions: [],
          change_summary: '',
          compiled_from: {},
          created_by: 'system',
          created_at: '2026-04-01T00:00:00.000Z',
        },
        {
          id: versionId,
          page_id: pageId,
          version: 2,
          content_md: 'focus: conversion',
          outline: [],
          key_facts: [],
          open_questions: [],
          change_summary: '',
          compiled_from: {},
          created_by: 'system',
          created_at: '2026-04-10T00:00:00.000Z',
        },
      ],
    })

    const context = await resolveContextForTask(supabase, 'proj-1', 'generate_roadmap')
    const focusEntry = context.pages.find((entry) => entry.kind === 'current_focus')
    expect(focusEntry).toBeDefined()
    expect(focusEntry?.missing).toBe(false)
    expect(focusEntry?.version?.id).toBe(versionId)
    expect(focusEntry?.content).toContain('conversion')
  })
})

describe('formatResolvedContextForPrompt', () => {
  it('renders resolved pages in priority order and calls out missing required pages', () => {
    const text = formatResolvedContextForPrompt({
      taskType: 'generate_roadmap',
      projectId: 'proj-1',
      pages: [
        {
          kind: 'current_focus',
          priority: 5,
          required: true,
          reason: 'dominant-need-first',
          page: null,
          version: null,
          content: '',
          missing: true,
        },
        {
          kind: 'project_overview',
          priority: 10,
          required: true,
          reason: 'anchor',
          page: null,
          version: null,
          content: 'SelfImprove is an AI PM for indie founders.',
          missing: false,
        },
      ],
      missingRequired: ['current_focus'],
    })

    expect(text).toContain('## Resolved Context (task: generate_roadmap)')
    expect(text).toContain('### current_focus (priority 5, required)')
    expect(text).toContain('_Missing._')
    expect(text).toContain('### project_overview (priority 10, required)')
    expect(text).toContain('SelfImprove is an AI PM for indie founders.')
    expect(text).toContain('Required pages not yet compiled: current_focus')
  })

  it('returns an empty string when no rules resolved', () => {
    expect(
      formatResolvedContextForPrompt({
        taskType: 'generate_roadmap',
        projectId: 'proj-1',
        pages: [],
        missingRequired: [],
      }),
    ).toBe('')
  })
})
