import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  BrainPageKind,
  BrainPageRow,
  ProjectSettingsRow,
} from '@/lib/types/database'

import { chunkMarkdown } from './chunking'

/**
 * Seed a minimal set of `brain_pages` on project creation so the resolver
 * has something to load on the very first roadmap / PRD run. Without this,
 * every task logs `missingRequired` pages and the model has to improvise.
 *
 * Pure stub builders live below so they can be unit tested without a DB;
 * the exported `seedProjectBrainPages` wires them to Supabase.
 *
 * Does not seed `current_focus` — that's a taste decision owned by the user
 * (see `PUT /api/projects/[id]/focus`). Existing pages for the same
 * `kind+slug` combination are left untouched.
 */

export type ProjectSeedInput = {
  projectId: string
  name: string
  description: string | null
  framework: string | null
  repoUrl: string | null
  siteUrl: string | null
  settings: ProjectSettingsRow | null
}

export type SeedPageStub = {
  kind: BrainPageKind
  slug: string
  title: string
  summary: string
  importance: number
  content_md: string
  key_facts: string[]
  open_questions: string[]
  change_summary: string
}

export type SeedResult = {
  pagesSeeded: number
  versionsCreated: number
  chunksWritten: number
  seededKinds: BrainPageKind[]
}

/**
 * Build the stub set for a given project. Pure: no DB, no clock, no env.
 *
 * We intentionally return stubs for five kinds; `current_focus` is left for
 * the user, and the remaining page kinds are populated by
 * `project-enrichment` as evidence accumulates.
 */
export function buildProjectSeedStubs(input: ProjectSeedInput): SeedPageStub[] {
  const stubs: SeedPageStub[] = []

  stubs.push({
    kind: 'project_overview',
    slug: 'project-overview',
    title: `Project Overview — ${input.name}`,
    summary: input.description?.trim()
      ? input.description.trim()
      : 'Seeded overview. Replace this once the product has a lived description.',
    importance: 70,
    content_md: renderProjectOverview(input),
    key_facts: [
      `name: ${input.name}`,
      input.framework ? `framework: ${input.framework}` : 'framework: unknown',
      input.repoUrl ? `repo: ${input.repoUrl}` : 'repo: not connected',
      input.siteUrl ? `site: ${input.siteUrl}` : 'site: not deployed',
    ],
    open_questions: [
      input.description?.trim()
        ? 'Which sentence here is most load-bearing, and does it still match the current product?'
        : 'What is the one-sentence product promise? Write it into this page.',
      'Who is the primary user? Seed the user_pain_map with their top pains.',
    ],
    change_summary: 'Initial stub seeded at project creation.',
  })

  stubs.push({
    kind: 'repo_map',
    slug: 'repo-map',
    title: `Repo Map — ${input.name}`,
    summary: input.repoUrl
      ? 'Seeded repo map from the connected repository. Refresh via project-enrichment or a codebase scan.'
      : 'No repo connected yet. Connect a repo to enable file-level PRD plans.',
    importance: 60,
    content_md: renderRepoMap(input),
    key_facts: input.repoUrl
      ? [`repo: ${input.repoUrl}`, input.framework ? `framework: ${input.framework}` : 'framework: unknown']
      : ['no repo connected'],
    open_questions: [
      'Which directories are the primary surfaces the coding agent should edit?',
      'Which paths are off-limits and should be mirrored into safety_rules.blocked_paths?',
    ],
    change_summary: 'Initial stub; real repo map lands after the first codebase-scan + enrichment cycle.',
  })

  stubs.push({
    kind: 'safety_rules',
    slug: 'safety-rules',
    title: `Safety Rules — ${input.name}`,
    summary: input.settings
      ? 'Rendered from project_settings. Update the settings row to change the deterministic caps.'
      : 'Project settings not yet loaded; using platform defaults.',
    importance: 90,
    content_md: renderSafetyRules(input),
    key_facts: renderSafetyFacts(input.settings),
    open_questions: [
      'Are there any implicit blocked paths (secrets, infra, migrations) that should be added?',
      'What is the acceptable blast radius per shipped change for this product stage?',
    ],
    change_summary: 'Initial stub seeded from project_settings at project creation.',
  })

  stubs.push({
    kind: 'metric_definitions',
    slug: 'metric-definitions',
    title: `Metric Definitions — ${input.name}`,
    summary:
      'Canonical metric names and instrumentation rules. PRDs and impact reviews should refer to these by name.',
    importance: 50,
    content_md: renderMetricDefinitions(input),
    key_facts: [
      'no metrics defined yet',
      'prd-author and impact-review will cite this page by name',
    ],
    open_questions: [
      'What are the 3-5 metrics that matter most for the current focus mode?',
      'For each metric: source of truth, definition, cadence, owner.',
    ],
    change_summary: 'Initial stub; populate per-metric sections as instrumentation lands.',
  })

  stubs.push({
    kind: 'implementation_patterns',
    slug: 'implementation-patterns',
    title: `Implementation Patterns — ${input.name}`,
    summary:
      'Conventions the coding agent must follow: testing, deployment, error handling, logging, feature flags.',
    importance: 55,
    content_md: renderImplementationPatterns(input),
    key_facts: input.framework
      ? [`framework: ${input.framework}`]
      : ['framework: unknown — patterns section is a placeholder'],
    open_questions: [
      'What is the testing pyramid (unit/integration/e2e)?',
      'Where does logging go, and what error-reporting service is live?',
      'What is the preferred feature-flag tool, if any?',
    ],
    change_summary: 'Initial stub; deepens after the first codebase-scan + enrichment cycle.',
  })

  return stubs
}

export async function seedProjectBrainPages(
  supabase: SupabaseClient,
  input: ProjectSeedInput,
): Promise<SeedResult> {
  const stubs = buildProjectSeedStubs(input)

  // Don't clobber pages a user (or a prior enrichment run) already wrote.
  const { data: existingData } = await supabase
    .from('brain_pages')
    .select('id, kind, slug')
    .eq('project_id', input.projectId)

  const existing = new Set(
    ((existingData ?? []) as Array<Pick<BrainPageRow, 'kind' | 'slug'>>).map(
      (row) => `${row.kind}:${row.slug}`,
    ),
  )

  let pagesSeeded = 0
  let versionsCreated = 0
  let chunksWritten = 0
  const seededKinds: BrainPageKind[] = []

  for (const stub of stubs) {
    const key = `${stub.kind}:${stub.slug}`
    if (existing.has(key)) continue

    const { data: pageRow, error: pageError } = await supabase
      .from('brain_pages')
      .insert({
        project_id: input.projectId,
        slug: stub.slug,
        kind: stub.kind,
        title: stub.title,
        summary: stub.summary,
        status: 'active',
        importance: stub.importance,
        freshness_score: 100,
      })
      .select('id')
      .single()

    if (pageError || !pageRow) {
      console.warn('[seed-pages] insert page failed', {
        slug: stub.slug,
        error: pageError?.message,
      })
      continue
    }
    const pageId = (pageRow as { id: string }).id
    pagesSeeded += 1
    seededKinds.push(stub.kind)

    const { data: versionRow, error: versionError } = await supabase
      .from('brain_page_versions')
      .insert({
        page_id: pageId,
        version: 1,
        content_md: stub.content_md,
        outline: [],
        key_facts: stub.key_facts,
        open_questions: stub.open_questions,
        change_summary: stub.change_summary,
        compiled_from: { skill: 'seed-pages' },
        created_by: 'seed-pages',
      })
      .select('id')
      .single()

    if (versionError || !versionRow) {
      console.warn('[seed-pages] insert version failed', {
        pageId,
        error: versionError?.message,
      })
      continue
    }
    const versionId = (versionRow as { id: string }).id
    versionsCreated += 1

    const chunks = chunkMarkdown(stub.content_md).map((chunk) => ({
      page_id: pageId,
      page_version_id: versionId,
      chunk_index: chunk.index,
      content: chunk.content,
      token_estimate: chunk.tokenEstimate,
      metadata: chunk.heading ? { heading: chunk.heading } : {},
    }))
    if (chunks.length > 0) {
      const { error: chunkError } = await supabase.from('brain_chunks').insert(chunks)
      if (!chunkError) chunksWritten += chunks.length
    }
  }

  return { pagesSeeded, versionsCreated, chunksWritten, seededKinds }
}

// ---------------------------------------------------------------------------
// Pure content builders
// ---------------------------------------------------------------------------

function renderProjectOverview(input: ProjectSeedInput): string {
  const description = input.description?.trim() || 'Seed stub — add the product description here.'
  return `# ${input.name}

## Description
${description}

## Stage & surface
- Framework: ${input.framework ?? 'unknown'}
- Repo: ${input.repoUrl ?? 'not connected'}
- Site: ${input.siteUrl ?? 'not deployed'}

## Product promise
_Seed stub. Replace with the one-sentence promise the team is making to the user._

## Current focus
_Set via \`PUT /api/projects/:id/focus\` or the brain dashboard. The roadmap skill loads the \`current_focus\` page first._
`
}

function renderRepoMap(input: ProjectSeedInput): string {
  if (!input.repoUrl) {
    return `# Repo Map

_No repository is connected to this project yet._

Connect a repo (GitHub) so:
- PRDs can cite concrete file paths
- the implementation-brief skill can respect blocked paths
- codebase scans can produce repo-derived signals
`
  }
  return `# Repo Map — ${input.name}

## Source
- Repository: ${input.repoUrl}
- Framework: ${input.framework ?? 'unknown'}

## Directory surfaces (seed stub)
_Populated by the first codebase-scan + project-enrichment cycle._

## Edit policy
- Default: only the coding worker may edit files inside the repo.
- Blocked paths should be mirrored here from \`safety_rules.blocked_paths\`.
`
}

function renderSafetyRules(input: ProjectSeedInput): string {
  const s = input.settings
  if (!s) {
    return `# Safety Rules — ${input.name}

_Project settings not loaded at seed time. Re-run enrichment after settings land._

## Platform defaults
- Risk threshold: unset
- Require tests: unset
- Max files per change: unset
- Max lines per change: unset
- Blocked paths: none
`
  }
  const blockedPaths =
    s.safety_blocked_paths.length > 0
      ? s.safety_blocked_paths.map((path) => `- \`${path}\``).join('\n')
      : '- (none configured)'
  return `# Safety Rules — ${input.name}

## Deterministic caps
- Risk threshold: ${s.safety_risk_threshold}
- Require tests: ${s.safety_require_tests}
- Max files per change: ${s.safety_max_files}
- Max lines per change: ${s.safety_max_lines}
- Daily shipped-change cap: ${s.safety_daily_cap}

## Blocked paths
${blockedPaths}

## Approval policy
- Auto-approve: ${s.automation_auto_approve}
- Auto-merge: ${s.automation_auto_merge}
- Implementation automation: ${s.automation_implement_enabled}

## Human override
Any change exceeding these caps or touching a blocked path must pass through manual approval.
The implementation-brief skill clamps packets to these caps; the PRD-author skill should also respect them.
`
}

function renderSafetyFacts(settings: ProjectSettingsRow | null): string[] {
  if (!settings) return ['project_settings not loaded at seed time']
  return [
    `risk_threshold=${settings.safety_risk_threshold}`,
    `max_files=${settings.safety_max_files}`,
    `max_lines=${settings.safety_max_lines}`,
    `daily_cap=${settings.safety_daily_cap}`,
    `blocked_paths_count=${settings.safety_blocked_paths.length}`,
  ]
}

function renderMetricDefinitions(input: ProjectSeedInput): string {
  return `# Metric Definitions — ${input.name}

Canonical metric names used across PRDs, impact-reviews, and experiment designs.
The \`prd-author\` and \`impact-review\` skills are instructed to refer to these by name.

## Seed stub

_No metrics defined yet._ Populate this page with one section per metric:

\`\`\`md
### <metric_name>
- Source of truth: <PostHog | Sentry | internal table | Stripe>
- Definition: <formula or SQL>
- Cadence: <daily | weekly | real-time>
- Owner: <role or name>
- Current baseline: <value + date>
\`\`\`

## Focus-mode anchors
When \`current_focus\` is set, the three to five most load-bearing metrics should sit at the top of this page.
`
}

function renderImplementationPatterns(input: ProjectSeedInput): string {
  return `# Implementation Patterns — ${input.name}

Conventions the coding agent must follow. This page is loaded by the PRD-author and implementation-brief skills.

## Framework
${input.framework ? `- ${input.framework}` : '- unknown (update after the first codebase-scan)'}

## Testing
_Seed stub — document the expected testing pyramid, test runner, and coverage expectations._

## Logging & error reporting
_Seed stub — record the logging library and any error-reporting service (Sentry, Rollbar, etc.)._

## Feature flags
_Seed stub — record the preferred feature-flag tool and rollout conventions, if any._

## Deployment
_Seed stub — describe the pipeline from merge to production (CI, environments, verification gates)._

## Code style
_Seed stub — cite the linter/formatter config and any repo-specific rules the coding agent must respect._
`
}
