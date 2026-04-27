import { createAdminClient } from '@/lib/supabase/admin'
import { callClaude } from './call-claude'
import type {
  OpportunityClusterRow,
  ShippedChangeRow,
} from '@/lib/types/database'

import {
  formatResolvedContextForPrompt,
  resolveContextForTask,
} from '@/lib/brain/resolve-context'
import {
  completeBrainRun,
  failBrainRun,
  recordWriteCompleted,
  startBrainRun,
} from '@/lib/brain/runs'
import { applyPageUpdates, type PageUpdateInput } from '@/lib/brain/write-pages'

interface PRDContent {
  problem: string
  context: string
  solution: string
  acceptance_criteria: string[]
  technical_approach: string
  files_to_modify: Array<{ path: string; changes: string }>
  test_requirements: string[]
  rollback_plan: string
  estimated_effort: string
  dependencies: string[]
  open_questions: string[]
  success_metrics: Array<{ metric: string; baseline: string; target: string; measurement: string }>
  analytics_events: Array<{ event_name: string; properties: string; trigger: string }>
  experiments: Array<{
    name: string
    hypothesis: string
    control: string
    variant: string
    metric: string
    sample_size: string
    duration: string
    expected_lift: string
  }>
}

const PRD_SCHEMA = {
  type: 'object' as const,
  properties: {
    problem: {
      type: 'string',
      description: 'Clear problem statement from user perspective',
    },
    context: {
      type: 'string',
      description: 'Background context and evidence from signals, brain pages, and cluster brief',
    },
    solution: { type: 'string', description: 'Proposed solution approach' },
    acceptance_criteria: {
      type: 'array',
      items: { type: 'string' },
      description: 'Testable acceptance criteria',
    },
    technical_approach: {
      type: 'string',
      description: 'Technical implementation strategy grounded in repo_map and implementation_patterns',
    },
    files_to_modify: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          changes: {
            type: 'string',
            description: 'What changes are needed in this file',
          },
        },
        required: ['path', 'changes'],
      },
    },
    test_requirements: { type: 'array', items: { type: 'string' } },
    rollback_plan: { type: 'string' },
    estimated_effort: { type: 'string' },
    dependencies: { type: 'array', items: { type: 'string' } },
    open_questions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Open questions that should be called out explicitly and not buried in prose.',
    },
    success_metrics: {
      type: 'array',
      description: 'How to measure if this change was successful after shipping, grounded in metric_definitions.',
      items: {
        type: 'object',
        properties: {
          metric: { type: 'string', description: 'What to measure (e.g., checkout completion rate)' },
          baseline: { type: 'string', description: 'Current value or estimate (e.g., 60%)' },
          target: { type: 'string', description: 'Target value after shipping (e.g., 80%)' },
          measurement: { type: 'string', description: 'How to measure it (e.g., PostHog funnel, error rate in Sentry)' },
        },
        required: ['metric', 'baseline', 'target', 'measurement'],
      },
    },
    analytics_events: {
      type: 'array',
      description: 'Analytics events the coding agent should add to track this feature',
      items: {
        type: 'object',
        properties: {
          event_name: { type: 'string', description: 'Event name (e.g., checkout_completed, feature_used)' },
          properties: { type: 'string', description: 'Event properties to capture' },
          trigger: { type: 'string', description: 'When this event fires (e.g., user clicks submit button)' },
        },
        required: ['event_name', 'properties', 'trigger'],
      },
    },
    experiments: {
      type: 'array',
      description: 'A/B test or experiment designs to validate the feature impact. Include hypothesis, control/variant descriptions, target metric, sample size, duration, and expected lift.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Experiment name, e.g. "Simplified Checkout A/B Test"' },
          hypothesis: { type: 'string', description: 'If we [change], then [metric] will [improve] because [reason]' },
          control: { type: 'string', description: 'Current experience (control group)' },
          variant: { type: 'string', description: 'New experience (variant group)' },
          metric: { type: 'string', description: 'Primary metric to track, e.g. "checkout_completion_rate"' },
          sample_size: { type: 'string', description: 'Required sample size for statistical significance' },
          duration: { type: 'string', description: 'How long to run the experiment, e.g. "2 weeks"' },
          expected_lift: { type: 'string', description: 'Expected improvement, e.g. "+8% conversion"' },
        },
        required: ['name', 'hypothesis', 'control', 'variant', 'metric', 'sample_size', 'duration', 'expected_lift'],
      },
    },
  },
  required: [
    'problem',
    'context',
    'solution',
    'acceptance_criteria',
    'technical_approach',
    'files_to_modify',
    'test_requirements',
    'rollback_plan',
    'estimated_effort',
    'dependencies',
    'open_questions',
    'success_metrics',
    'analytics_events',
    'experiments',
  ],
}

/**
 * v1.1: optional page-writeback alongside the PRD. Empty in the common
 * case; populated only when authoring surfaced a durable new truth.
 * See docs/brain/skills/prd-author.md step 6.
 */
const PRD_PAGE_UPDATES_SCHEMA = {
  type: 'array',
  description:
    'OPTIONAL durable-truth writebacks the PRD surfaced. Prefer updating an existing kind+slug. Leave empty if nothing durable changed.',
  items: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: [
          'current_focus',
          'project_overview',
          'user_pain_map',
          'product_constraints',
          'repo_map',
          'implementation_patterns',
          'open_decisions',
          'active_experiments',
          'release_notes',
          'safety_rules',
          'metric_definitions',
        ],
      },
      slug: { type: 'string' },
      title: { type: 'string' },
      summary: { type: 'string' },
      importance: { type: 'number', minimum: 0, maximum: 100 },
      status: { type: 'string', enum: ['active', 'stale'] },
      stale_reason: { type: 'string' },
      content_md: { type: 'string' },
      key_facts: { type: 'array', items: { type: 'string' } },
      open_questions: { type: 'array', items: { type: 'string' } },
      change_summary: { type: 'string' },
    },
    required: ['kind', 'slug', 'title', 'summary', 'content_md'],
  },
}

const PRD_SCHEMA_WITH_PAGES = {
  type: 'object' as const,
  properties: {
    ...PRD_SCHEMA.properties,
    page_updates: PRD_PAGE_UPDATES_SCHEMA,
  },
  required: PRD_SCHEMA.required,
}

export async function generatePRD(roadmapItemId: string, feedback?: string): Promise<PRDContent> {
  const supabase = createAdminClient()

  const { data: item } = await supabase
    .from('roadmap_items')
    .select('*')
    .eq('id', roadmapItemId)
    .single()

  if (!item) throw new Error(`Roadmap item ${roadmapItemId} not found`)

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', item.project_id)
    .single()

  if (!project) throw new Error('Project not found for roadmap item')

  const { data: settings } = await supabase
    .from('project_settings')
    .select('ai_model_prd')
    .eq('project_id', item.project_id)
    .single()

  const model = settings?.ai_model_prd || 'claude-sonnet-4-6'

  // -------------------------------------------------------------------
  // v1.1: resolve brain pages required for the PRD task.
  // -------------------------------------------------------------------

  const context = await resolveContextForTask(
    supabase,
    item.project_id as string,
    'generate_prd',
  )
  const brainContextBlock = formatResolvedContextForPrompt(context)

  // -------------------------------------------------------------------
  // v1.1: load the linked opportunity cluster (if any).
  // -------------------------------------------------------------------

  let cluster: OpportunityClusterRow | null = null
  const linkedClusterId = (item as { opportunity_cluster_id?: string | null }).opportunity_cluster_id
  if (linkedClusterId) {
    const { data: clusterRow } = await supabase
      .from('opportunity_clusters')
      .select('*')
      .eq('id', linkedClusterId)
      .single()
    cluster = (clusterRow as OpportunityClusterRow) ?? null
  }

  // -------------------------------------------------------------------
  // v1.1: load recent shipped changes that touch the same area.
  // -------------------------------------------------------------------

  const { data: recentShipped } = await supabase
    .from('shipped_changes')
    .select('*')
    .eq('project_id', item.project_id)
    .order('created_at', { ascending: false })
    .limit(10)

  const shippedContext = formatShippedForPrompt(
    (recentShipped ?? []) as ShippedChangeRow[],
  )

  // -------------------------------------------------------------------
  // Start the brain run.
  // -------------------------------------------------------------------

  const run = await startBrainRun(supabase, {
    projectId: item.project_id as string,
    taskType: 'generate_prd',
    skillSlug: 'prd-author',
    context,
    inputSummary: {
      roadmap_item_id: roadmapItemId,
      cluster_slug: cluster?.slug ?? null,
      shipped_changes_in_window: recentShipped?.length ?? 0,
      has_feedback: Boolean(feedback && feedback.trim()),
    },
    writesPlanned: ['roadmap_items.prd_content'],
  })

  try {
    const evidenceTrail = item.evidence_trail as Array<Record<string, unknown>>
    const thinkingTraces = item.thinking_traces as string[]
    const acceptanceCriteria = item.acceptance_criteria as string[]
    const filesToModify = item.files_to_modify as string[]
    const risks = item.risks as string[]

    const clusterBlock = cluster
      ? `## Opportunity Cluster
- slug: ${cluster.slug}
- title: ${cluster.title}
- theme: ${cluster.theme || 'n/a'}
- primary need: ${cluster.primary_need || 'n/a'}
- scores: evidence=${cluster.evidence_strength}, freshness=${cluster.freshness_score}, confidence=${cluster.confidence_score}, effort=${cluster.effort_score}, focus-weighted=${cluster.focus_weighted_score}

### Current brief
${cluster.latest_brief_md || '(not yet compiled)'}`
      : '## Opportunity Cluster\n_No cluster linked yet; write the PRD against the roadmap item in isolation and propose filing it under a cluster in open_questions._'

    const prompt = `You are running the \`prd-author\` skill. Follow docs/brain/skills/prd-author.md.

## Project
- Name: ${project.name}
- Repository: ${project.repo_url || 'Not connected'}
- Framework: ${project.framework || 'Unknown'}
- Site: ${project.site_url || 'Not deployed'}

${brainContextBlock ? `${brainContextBlock}\n\n` : ''}${clusterBlock}

${shippedContext}

## Roadmap Item
- Title: ${item.title}
- Description: ${item.description}
- Category: ${item.category}
- Impact: ${item.impact}/10
- Size: ${item.size}/10
- ROI Score: ${item.roi_score}
- Scope: ${item.scope}

## Evidence
${JSON.stringify(evidenceTrail, null, 2)}

## Thinking Traces
${thinkingTraces.join('\n')}

## Existing Acceptance Criteria
${acceptanceCriteria.join('\n- ')}

## Known Files to Modify
${filesToModify.join('\n- ')}

## Known Risks
${risks.join('\n- ')}

Generate a complete PRD per the prd-author skill procedure:
1. Problem + context grounded in the cluster brief and brain pages.
2. Why this matters now (reference current_focus if present).
3. Solution + rollout.
4. Acceptance criteria, file-level plan (respect repo_map + safety_rules).
5. Tests and analytics (respect metric_definitions when naming metrics).
6. Rollback and risk notes.
7. Call out open questions explicitly instead of burying them in prose.
8. Design A/B experiments to validate the change.${feedback ? `\n\n## Refinement Feedback\nThe user has provided the following feedback on the previous PRD. Incorporate these changes:\n${feedback}` : ''}`

    const rawResponse = await callClaude<PRDContent & { page_updates?: PageUpdateInput[] }>({
      prompt,
      system:
        'You are a senior technical product manager running the prd-author skill. Generate precise, actionable PRDs that a developer can implement directly, grounded in the resolved brain context and linked opportunity cluster. If PRD authoring surfaces a durable new truth (new constraint, unresolved decision, implementation note), emit it as a `page_updates[]` entry so memory stays compounding.',
      schema: PRD_SCHEMA_WITH_PAGES,
      schemaName: 'generate_prd',
      schemaDescription:
        'Generate a PRD grounded in the brain context and cluster brief, plus optional page writebacks.',
      model,
      maxTokens: 8192,
    })

    const { page_updates: pageUpdates, ...prd } = rawResponse

    await supabase
      .from('roadmap_items')
      .update({ prd_content: prd as unknown as Record<string, unknown> })
      .eq('id', roadmapItemId)
    recordWriteCompleted(run, 'roadmap_items.prd_content')

    // v1.1 spec step 7: "Update affected memory pages with new constraints,
    // questions, or implementation notes."
    let pagesUpdated = 0
    let staleMarked: string[] = []
    if (pageUpdates && pageUpdates.length > 0) {
      const result = await applyPageUpdates(
        supabase,
        item.project_id as string,
        pageUpdates,
        { createdBy: 'prd-author' },
      )
      pagesUpdated = result.pagesUpdated
      staleMarked = result.staleMarked
      if (pagesUpdated > 0) recordWriteCompleted(run, 'brain_pages')
    }

    await completeBrainRun(supabase, run, {
      resultSummary: {
        roadmap_item_id: roadmapItemId,
        cluster_slug: cluster?.slug ?? null,
        open_questions_count: prd.open_questions?.length ?? 0,
        experiments_count: prd.experiments?.length ?? 0,
        pages_updated: pagesUpdated,
        stale_marked: staleMarked,
      },
    })

    return prd
  } catch (err) {
    await failBrainRun(supabase, run, err instanceof Error ? err : String(err))
    throw err
  }
}

function formatShippedForPrompt(rows: ShippedChangeRow[]): string {
  if (rows.length === 0) {
    return '## Recent Shipped Changes\n_No recent shipped changes in this project._'
  }
  const lines = rows.slice(0, 10).map((row) => {
    const pr = row.pr_number ? `#${row.pr_number}` : 'no-PR'
    return `- ${pr} [${row.status}] ${row.approval_method} | risk=${row.risk_score ?? 'n/a'} | commit=${row.commit_sha?.slice(0, 7) ?? 'n/a'}`
  })
  return `## Recent Shipped Changes\n${lines.join('\n')}`
}
