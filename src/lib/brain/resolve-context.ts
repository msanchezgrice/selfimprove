import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  BrainPageKind,
  BrainPageRow,
  BrainPageVersionRow,
  BrainResolverRuleRow,
  BrainTaskType,
} from '@/lib/types/database'

import { RESOLVER_RULES, type ResolverRule } from './design'

export type ResolvedPage = {
  kind: BrainPageKind
  priority: number
  required: boolean
  reason: string
  page: BrainPageRow | null
  version: BrainPageVersionRow | null
  content: string
  missing: boolean
}

export type ResolvedContext = {
  taskType: BrainTaskType
  projectId: string
  pages: ResolvedPage[]
  missingRequired: BrainPageKind[]
}

/**
 * Load the ordered, task-specific context set for a brain task.
 *
 * Reads `brain_resolver_rules` when the table is populated; otherwise falls
 * back to the seeded `RESOLVER_RULES` exported by `design.ts`. Then loads the
 * most recent `active` `brain_pages` (and latest version) for each rule.
 *
 * Keeps prompts small: deterministic, task-specific selection rather than a
 * blob-of-pages approach. See docs/brain/project-brain-v1.md (Context Resolver).
 */
export async function resolveContextForTask(
  supabase: SupabaseClient,
  projectId: string,
  taskType: BrainTaskType,
): Promise<ResolvedContext> {
  const rules = await loadResolverRules(supabase, taskType)

  if (rules.length === 0) {
    return { taskType, projectId, pages: [], missingRequired: [] }
  }

  const kinds = rules.map((rule) => rule.pageKind)

  const { data: pages } = await supabase
    .from('brain_pages')
    .select('*')
    .eq('project_id', projectId)
    .in('kind', kinds)
    .eq('status', 'active')

  const pageByKind = new Map<BrainPageKind, BrainPageRow>()
  for (const page of (pages ?? []) as BrainPageRow[]) {
    const existing = pageByKind.get(page.kind)
    if (!existing || (page.importance ?? 0) > (existing.importance ?? 0)) {
      pageByKind.set(page.kind, page)
    }
  }

  const pageIds = [...pageByKind.values()].map((page) => page.id)
  const versionByPageId = new Map<string, BrainPageVersionRow>()

  if (pageIds.length > 0) {
    const { data: versions } = await supabase
      .from('brain_page_versions')
      .select('*')
      .in('page_id', pageIds)
      .order('created_at', { ascending: false })

    for (const version of (versions ?? []) as BrainPageVersionRow[]) {
      if (!versionByPageId.has(version.page_id)) {
        versionByPageId.set(version.page_id, version)
      }
    }
  }

  const resolvedPages: ResolvedPage[] = rules.map((rule) => {
    const page = pageByKind.get(rule.pageKind) ?? null
    const version = page ? versionByPageId.get(page.id) ?? null : null
    const content = version?.content_md ?? page?.summary ?? ''
    return {
      kind: rule.pageKind,
      priority: rule.priority,
      required: rule.required,
      reason: rule.reason,
      page,
      version,
      content,
      missing: !page || content.trim().length === 0,
    }
  })

  const missingRequired = resolvedPages
    .filter((entry) => entry.required && entry.missing)
    .map((entry) => entry.kind)

  return { taskType, projectId, pages: resolvedPages, missingRequired }
}

async function loadResolverRules(
  supabase: SupabaseClient,
  taskType: BrainTaskType,
): Promise<ResolverRule[]> {
  const { data, error } = await supabase
    .from('brain_resolver_rules')
    .select('task_type, page_kind, priority, required, reason')
    .eq('task_type', taskType)
    .order('priority', { ascending: true })

  if (error || !data || data.length === 0) {
    return getSeededResolverRules(taskType)
  }

  return (data as BrainResolverRuleRow[]).map((row) => ({
    taskType: row.task_type,
    pageKind: row.page_kind,
    priority: row.priority,
    required: row.required,
    reason: row.reason,
  }))
}

export function getSeededResolverRules(taskType: BrainTaskType): ResolverRule[] {
  return RESOLVER_RULES.filter((rule) => rule.taskType === taskType).sort(
    (left, right) => left.priority - right.priority,
  )
}

/**
 * Render a resolved context as a single markdown block suitable for prompt
 * inclusion. Pages are ordered by priority; missing pages are called out
 * explicitly so the model knows what it does NOT have.
 */
export function formatResolvedContextForPrompt(context: ResolvedContext): string {
  if (context.pages.length === 0) return ''

  const blocks: string[] = []
  blocks.push(`## Resolved Context (task: ${context.taskType})`)

  for (const entry of context.pages) {
    const header = `### ${entry.kind} (priority ${entry.priority}, ${entry.required ? 'required' : 'optional'})`
    if (entry.missing) {
      blocks.push(`${header}\n_Missing._ ${entry.reason}`)
      continue
    }
    blocks.push(`${header}\n${entry.content.trim()}`)
  }

  if (context.missingRequired.length > 0) {
    blocks.push(
      `> Required pages not yet compiled: ${context.missingRequired.join(', ')}. Proceed with caution and record open questions.`,
    )
  }

  return blocks.join('\n\n')
}
