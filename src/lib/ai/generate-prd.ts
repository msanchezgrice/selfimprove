import { createAdminClient } from '@/lib/supabase/admin'
import { callClaude } from './call-claude'

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
      description: 'Background context and evidence from signals',
    },
    solution: { type: 'string', description: 'Proposed solution approach' },
    acceptance_criteria: {
      type: 'array',
      items: { type: 'string' },
      description: 'Testable acceptance criteria',
    },
    technical_approach: {
      type: 'string',
      description: 'Technical implementation strategy',
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
    open_questions: { type: 'array', items: { type: 'string' } },
    success_metrics: {
      type: 'array',
      description: 'How to measure if this change was successful after shipping',
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
  ],
}

export async function generatePRD(roadmapItemId: string, feedback?: string): Promise<PRDContent> {
  const supabase = createAdminClient()

  const { data: item } = await supabase
    .from('roadmap_items')
    .select('*')
    .eq('id', roadmapItemId)
    .single()

  if (!item) throw new Error(`Roadmap item ${roadmapItemId} not found`)

  // Get project context
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', item.project_id)
    .single()

  if (!project) throw new Error('Project not found for roadmap item')

  // Get settings for AI model
  const { data: settings } = await supabase
    .from('project_settings')
    .select('ai_model_prd')
    .eq('project_id', item.project_id)
    .single()

  const model = settings?.ai_model_prd || 'claude-sonnet-4-6'

  const evidenceTrail = item.evidence_trail as Array<Record<string, unknown>>
  const thinkingTraces = item.thinking_traces as string[]
  const acceptanceCriteria = item.acceptance_criteria as string[]
  const filesToModify = item.files_to_modify as string[]
  const risks = item.risks as string[]

  const prompt = `Generate a detailed Product Requirements Document (PRD) for the following roadmap item.

## Project
- Name: ${project.name}
- Repository: ${project.repo_url || 'Not connected'}
- Framework: ${project.framework || 'Unknown'}
- Site: ${project.site_url || 'Not deployed'}

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

Generate a complete PRD with problem statement, solution approach, detailed acceptance criteria, technical implementation plan, file-by-file changes, test requirements, rollback plan, success metrics (how to measure if this worked after shipping), and analytics events the developer should add to track this feature's usage and impact.${feedback ? `\n\n## Refinement Feedback\nThe user has provided the following feedback on the previous PRD. Incorporate these changes:\n${feedback}` : ''}`

  const prd = await callClaude<PRDContent>({
    prompt,
    system:
      'You are a senior technical product manager. Generate precise, actionable PRDs that a developer can implement directly.',
    schema: PRD_SCHEMA,
    schemaName: 'generate_prd',
    schemaDescription: 'Generate a Product Requirements Document',
    model,
    maxTokens: 8192,
  })

  // Save PRD to roadmap item
  await supabase
    .from('roadmap_items')
    .update({ prd_content: prd as unknown as Record<string, unknown> })
    .eq('id', roadmapItemId)

  return prd
}
