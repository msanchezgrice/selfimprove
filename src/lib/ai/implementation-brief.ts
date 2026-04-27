import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/crypto'
import type {
  OpportunityClusterRow,
  ProjectSettingsRow,
  RoadmapItemRow,
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

import { callClaude } from './call-claude'

/**
 * `implementation-brief` runner.
 *
 * Implements docs/brain/skills/implementation-brief.md.
 * Compresses an approved PRD into the smallest reliable execution packet for
 * a coding agent, respecting repo_map, safety_rules, and the active approval
 * policy. Returns the packet and, when a repo + token are available, also
 * enqueues a `build_jobs` row so the coding worker can pick it up.
 */

export type ImplementationBriefInput = {
  roadmapItemId: string
  approvalMode?: 'manual' | 'auto_approved' | 'auto_merged'
  model?: string
  /** When true (default), insert a `build_jobs` row with the packet prompt. */
  enqueueBuildJob?: boolean
  /** Override the repo GitHub token used to enqueue the build job. */
  githubToken?: string
}

export type ImplementationPacket = {
  summary: string
  goal: string
  branch_name: string
  required_files: Array<{ path: string; change: string; tests_required: boolean }>
  test_plan: string[]
  rollout: {
    feature_flag?: string | null
    phased: boolean
    verification_steps: string[]
  }
  safety: {
    blocked_paths_respected: string[]
    blast_radius: 'small' | 'medium' | 'large'
    max_files_touched: number
    max_lines_changed: number
    rollback_plan: string
  }
  references: {
    prd_anchor: string
    cluster_slug: string | null
    roadmap_item_id: string
    brain_pages_used: string[]
  }
  open_questions: string[]
}

export type ImplementationBriefResult = {
  packet: ImplementationPacket
  buildJobId: string | null
  runId: string | null
}

const PACKET_SCHEMA = {
  type: 'object' as const,
  properties: {
    summary: { type: 'string' },
    goal: { type: 'string' },
    branch_name: {
      type: 'string',
      description: 'Proposed git branch, kebab-case, prefixed with selfimprove/.',
    },
    required_files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          change: { type: 'string', description: 'Concrete change to make in this file.' },
          tests_required: { type: 'boolean' },
        },
        required: ['path', 'change', 'tests_required'],
      },
    },
    test_plan: { type: 'array', items: { type: 'string' } },
    rollout: {
      type: 'object',
      properties: {
        feature_flag: { type: 'string' },
        phased: { type: 'boolean' },
        verification_steps: { type: 'array', items: { type: 'string' } },
      },
      required: ['phased', 'verification_steps'],
    },
    safety: {
      type: 'object',
      properties: {
        blocked_paths_respected: { type: 'array', items: { type: 'string' } },
        blast_radius: { type: 'string', enum: ['small', 'medium', 'large'] },
        max_files_touched: { type: 'number' },
        max_lines_changed: { type: 'number' },
        rollback_plan: { type: 'string' },
      },
      required: [
        'blocked_paths_respected',
        'blast_radius',
        'max_files_touched',
        'max_lines_changed',
        'rollback_plan',
      ],
    },
    references: {
      type: 'object',
      properties: {
        prd_anchor: { type: 'string', description: 'Stable anchor to the PRD section that drives this packet.' },
        cluster_slug: { type: 'string' },
        roadmap_item_id: { type: 'string' },
        brain_pages_used: { type: 'array', items: { type: 'string' } },
      },
      required: ['prd_anchor', 'roadmap_item_id', 'brain_pages_used'],
    },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'summary',
    'goal',
    'branch_name',
    'required_files',
    'test_plan',
    'rollout',
    'safety',
    'references',
    'open_questions',
  ],
}

export async function runImplementationBrief(
  input: ImplementationBriefInput,
): Promise<ImplementationBriefResult> {
  const supabase = createAdminClient()

  const { data: itemData } = await supabase
    .from('roadmap_items')
    .select('*')
    .eq('id', input.roadmapItemId)
    .single()
  const item = itemData as RoadmapItemRow | null
  if (!item) throw new Error(`Roadmap item ${input.roadmapItemId} not found`)

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', item.project_id)
    .single()
  if (!project) throw new Error('Project not found for roadmap item')

  const { data: settingsData } = await supabase
    .from('project_settings')
    .select('*')
    .eq('project_id', item.project_id)
    .single()
  const settings = settingsData as ProjectSettingsRow | null

  const context = await resolveContextForTask(
    supabase,
    item.project_id,
    'implement_roadmap_item',
  )
  const brainContextBlock = formatResolvedContextForPrompt(context)

  let cluster: OpportunityClusterRow | null = null
  if (item.opportunity_cluster_id) {
    const { data } = await supabase
      .from('opportunity_clusters')
      .select('*')
      .eq('id', item.opportunity_cluster_id)
      .single()
    cluster = (data as OpportunityClusterRow) ?? null
  }

  const run = await startBrainRun(supabase, {
    projectId: item.project_id,
    taskType: 'implement_roadmap_item',
    skillSlug: 'implementation-brief',
    context,
    inputSummary: {
      roadmap_item_id: input.roadmapItemId,
      cluster_slug: cluster?.slug ?? null,
      approval_mode: input.approvalMode ?? null,
      has_prd: Boolean(item.prd_content),
    },
    writesPlanned: input.enqueueBuildJob === false ? ['brain_runs'] : ['build_jobs'],
  })

  try {
    if (!item.prd_content) {
      throw new Error(
        `Roadmap item ${input.roadmapItemId} has no PRD yet; run generate_prd first`,
      )
    }

    const model = input.model ?? settings?.ai_model_prd ?? 'claude-sonnet-4-6'

    const safetyLines = settings
      ? [
          `risk_threshold=${settings.safety_risk_threshold}`,
          `require_tests=${settings.safety_require_tests}`,
          `max_files=${settings.safety_max_files}`,
          `max_lines=${settings.safety_max_lines}`,
          `daily_cap=${settings.safety_daily_cap}`,
          `blocked_paths=${settings.safety_blocked_paths.join(', ') || 'none'}`,
        ].join('\n- ')
      : 'project settings not loaded'

    const clusterBlock = cluster
      ? `## Opportunity Cluster\n- slug: ${cluster.slug}\n- title: ${cluster.title}\n- primary_need: ${cluster.primary_need || 'n/a'}`
      : '## Opportunity Cluster\n_None linked._'

    const prdJson = JSON.stringify(item.prd_content, null, 2)

    const prompt = `You are running the implementation-brief skill.
Follow docs/brain/skills/implementation-brief.md. Produce the SMALLEST reliable execution packet. This is not a prose prompt, it is a structured packet the coding worker executes directly.

## Project
- Name: ${project.name}
- Repo: ${project.repo_url ?? 'Not connected'}
- Framework: ${project.framework ?? 'unknown'}

${brainContextBlock ? `${brainContextBlock}\n\n` : ''}${clusterBlock}

## Roadmap Item
- id: ${item.id}
- title: ${item.title}
- category: ${item.category}
- scope: ${item.scope}
- acceptance criteria: ${(item.acceptance_criteria ?? []).join(' | ') || 'none'}

## Approval + Safety Policy
- approval_mode: ${input.approvalMode ?? 'manual'}
- ${safetyLines}

## Approved PRD
\`\`\`json
${prdJson}
\`\`\`

## Requirements
1. List only the files the worker must touch. Respect \`blocked_paths\` above.
2. Each required file must include a concrete \`change\` and whether tests are required.
3. \`safety.max_files_touched\` and \`safety.max_lines_changed\` must not exceed the project caps.
4. Test plan must be concrete and executable (commands, not vibes).
5. Rollback plan must be actionable (revert PR, feature flag off, etc.).
6. Reference brain pages used via their kinds (e.g. "repo_map", "safety_rules").
7. Flag anything ambiguous in \`open_questions\` instead of guessing.`

    const packet = await callClaude<ImplementationPacket>({
      prompt,
      system:
        'You are a senior tech lead running the implementation-brief skill. Produce the smallest reliable execution packet possible, respecting all safety caps.',
      schema: PACKET_SCHEMA,
      schemaName: 'implementation_brief',
      schemaDescription:
        'Structured execution packet for the coding agent, derived from the approved PRD and the resolved brain context.',
      model,
      maxTokens: 4096,
    })

    // Deterministically ensure IDs in references match the actual item.
    packet.references.roadmap_item_id = item.id
    if (!packet.references.cluster_slug) {
      packet.references.cluster_slug = cluster?.slug ?? null
    }

    // Clamp packet safety to project caps when settings are available.
    if (settings) {
      packet.safety.max_files_touched = Math.min(
        packet.safety.max_files_touched,
        settings.safety_max_files,
      )
      packet.safety.max_lines_changed = Math.min(
        packet.safety.max_lines_changed,
        settings.safety_max_lines,
      )
      for (const blocked of settings.safety_blocked_paths) {
        if (
          !packet.safety.blocked_paths_respected.includes(blocked) &&
          packet.required_files.every((file) => !file.path.startsWith(blocked))
        ) {
          packet.safety.blocked_paths_respected.push(blocked)
        }
      }
    }

    let buildJobId: string | null = null
    const shouldEnqueue = input.enqueueBuildJob !== false
    if (shouldEnqueue) {
      buildJobId = await enqueueBuildJob({
        supabase,
        item,
        project,
        packet,
        githubToken: input.githubToken,
      })
      if (buildJobId) recordWriteCompleted(run, 'build_jobs')
    }

    await completeBrainRun(supabase, run, {
      resultSummary: {
        roadmap_item_id: item.id,
        cluster_slug: cluster?.slug ?? null,
        build_job_id: buildJobId,
        required_files: packet.required_files.length,
        open_questions: packet.open_questions.length,
        blast_radius: packet.safety.blast_radius,
      },
    })

    return { packet, buildJobId, runId: run.id }
  } catch (err) {
    await failBrainRun(supabase, run, err instanceof Error ? err : String(err))
    throw err
  }
}

async function enqueueBuildJob(args: {
  supabase: ReturnType<typeof createAdminClient>
  item: RoadmapItemRow
  project: { id: string; repo_url: string | null }
  packet: ImplementationPacket
  githubToken: string | undefined
}): Promise<string | null> {
  const { supabase, item, project, packet, githubToken } = args
  if (!project.repo_url) {
    console.warn('[implementation-brief] skipping enqueue: no repo_url on project', {
      projectId: project.id,
    })
    return null
  }
  if (!githubToken) {
    console.warn('[implementation-brief] skipping enqueue: no github token provided')
    return null
  }

  const prompt = renderPacketAsPrompt(packet)
  const { data, error } = await supabase
    .from('build_jobs')
    .insert({
      roadmap_item_id: item.id,
      project_id: project.id,
      job_type: 'implement',
      repo_url: project.repo_url,
      github_token: encrypt(githubToken),
      prompt,
    })
    .select('id')
    .single()
  if (error || !data) {
    console.warn('[implementation-brief] build_jobs insert failed', { error: error?.message })
    return null
  }
  return (data as { id: string }).id
}

export function renderPacketAsPrompt(packet: ImplementationPacket): string {
  const fileLines = packet.required_files
    .map((file) => `- ${file.path}${file.tests_required ? ' (tests required)' : ''}: ${file.change}`)
    .join('\n')

  return `# Implementation Packet

## Goal
${packet.goal}

## Branch
${packet.branch_name}

## Required Files
${fileLines || '- (none specified)'}

## Test Plan
${packet.test_plan.map((step) => `- ${step}`).join('\n') || '- (none specified)'}

## Rollout
- Phased: ${packet.rollout.phased}
- Feature flag: ${packet.rollout.feature_flag ?? 'none'}
- Verification:
${packet.rollout.verification_steps.map((step) => `  - ${step}`).join('\n')}

## Safety
- Blast radius: ${packet.safety.blast_radius}
- Max files: ${packet.safety.max_files_touched}
- Max lines: ${packet.safety.max_lines_changed}
- Blocked paths respected: ${packet.safety.blocked_paths_respected.join(', ') || 'n/a'}
- Rollback plan: ${packet.safety.rollback_plan}

## References
- Roadmap item: ${packet.references.roadmap_item_id}
- Cluster: ${packet.references.cluster_slug ?? 'none'}
- Brain pages: ${packet.references.brain_pages_used.join(', ') || 'none'}
- PRD anchor: ${packet.references.prd_anchor}

## Open Questions
${packet.open_questions.length > 0 ? packet.open_questions.map((q) => `- ${q}`).join('\n') : '- none'}
`
}
