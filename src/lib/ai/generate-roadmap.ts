import { createAdminClient } from '@/lib/supabase/admin'
import { callClaude } from './call-claude'
import { generatePRD } from './generate-prd'
import { summarizeSignals, formatSummaryForPrompt } from './summarize-signals'
import { notifyRoadmapReady } from '@/lib/notifications'
import type { SignalRow, RoadmapItemInsert } from '@/lib/types/database'

interface GeneratedRoadmapItem {
  title: string
  description: string
  category: 'bug' | 'feature' | 'improvement' | 'infrastructure'
  origin: string
  confidence: number
  scope: 'small' | 'medium' | 'large'
  strategy: string
  impact: number
  upside: string
  size: number
  roi_score: number
  evidence_trail: Array<{ signal_type: string; content: string; weight: number }>
  thinking_traces: string[]
  acceptance_criteria: string[]
  files_to_modify: string[]
  risks: string[]
}

interface RoadmapGenerationResult {
  items: GeneratedRoadmapItem[]
  generationId: string
}

const ROADMAP_SCHEMA = {
  type: 'object' as const,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          category: {
            type: 'string',
            enum: ['bug', 'feature', 'improvement', 'infrastructure'],
          },
          origin: {
            type: 'string',
            description: 'Which signals led to this item',
          },
          confidence: { type: 'number', minimum: 0, maximum: 100 },
          scope: { type: 'string', enum: ['small', 'medium', 'large'] },
          strategy: { type: 'string' },
          impact: { type: 'number', minimum: 1, maximum: 10 },
          upside: { type: 'string' },
          size: {
            type: 'number',
            minimum: 1,
            maximum: 10,
            description: 'Effort estimate 1-10',
          },
          roi_score: {
            type: 'number',
            description: 'Computed as impact * confidence / size',
          },
          evidence_trail: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                signal_type: { type: 'string' },
                content: { type: 'string' },
                weight: { type: 'number' },
              },
              required: ['signal_type', 'content', 'weight'],
            },
          },
          thinking_traces: { type: 'array', items: { type: 'string' } },
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          files_to_modify: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'title',
          'description',
          'category',
          'origin',
          'confidence',
          'scope',
          'strategy',
          'impact',
          'upside',
          'size',
          'roi_score',
          'evidence_trail',
          'thinking_traces',
          'acceptance_criteria',
          'files_to_modify',
          'risks',
        ],
      },
    },
  },
  required: ['items'],
}

export async function generateRoadmap(
  projectId: string,
  options?: { model?: string; roiFocus?: string },
): Promise<RoadmapGenerationResult> {
  const supabase = createAdminClient()
  const generationId = crypto.randomUUID()

  // Fetch project info
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (!project) throw new Error(`Project ${projectId} not found`)

  // Fetch project settings
  const { data: settings } = await supabase
    .from('project_settings')
    .select('*')
    .eq('project_id', projectId)
    .single()

  // Fetch unprocessed signals
  const { data: signals } = await supabase
    .from('signals')
    .select('*')
    .eq('project_id', projectId)
    .eq('processed', false)
    .order('created_at', { ascending: false })
    .limit(500)

  if (!signals || signals.length === 0) {
    return { items: [], generationId }
  }

  // Fetch existing roadmap items for context (avoid duplicates)
  const { data: existingItems } = await supabase
    .from('roadmap_items')
    .select('title, description, status')
    .eq('project_id', projectId)
    .in('status', ['proposed', 'approved', 'building'])
    .limit(50)

  const summary = summarizeSignals(signals as SignalRow[])
  const summaryText = formatSummaryForPrompt(summary)

  const roiFocus =
    options?.roiFocus || settings?.automation_roi_focus || 'balanced'
  const model =
    options?.model || settings?.ai_model_roadmap || 'claude-sonnet-4-6'

  const existingContext =
    existingItems && existingItems.length > 0
      ? `\n\n## Existing Roadmap Items (do NOT duplicate these)\n${existingItems.map((i) => `- [${i.status}] ${i.title}`).join('\n')}`
      : ''

  const roiFocusInstruction =
    roiFocus === 'impact'
      ? 'Prioritize high-impact items even if they require more effort.'
      : roiFocus === 'effort'
        ? 'Prioritize quick wins — low effort items with reasonable impact.'
        : roiFocus === 'confidence'
          ? 'Prioritize items with strong evidence from multiple signal sources.'
          : 'Balance impact, effort, and confidence equally.'

  const prompt = `You are an AI Product Manager analyzing user signals to generate a prioritized product roadmap.

## Project Context
- Name: ${project.name}
- Description: ${project.description || 'No description'}
- Framework: ${project.framework || 'Unknown'}
- Repository: ${project.repo_url || 'Not connected'}
- Site: ${project.site_url || 'Not deployed'}

${summaryText}
${existingContext}

## ROI Focus: ${roiFocus}
${roiFocusInstruction}

## Instructions
1. Analyze the signals and identify actionable improvements
2. Group related signals into coherent roadmap items
3. For each item, calculate ROI score as: (impact * confidence) / (size * 10)
4. Provide concrete acceptance criteria
5. Identify likely files that would need modification
6. List risks and potential rollback strategies
7. Include your thinking traces showing how you arrived at each item
8. Return 3-10 items, ranked by ROI score (highest first)`

  const result = await callClaude<{ items: GeneratedRoadmapItem[] }>({
    prompt,
    system:
      'You are SelfImprove AI PM. Analyze signals and produce actionable, well-scoped roadmap items with evidence-based ROI scores.',
    schema: ROADMAP_SCHEMA,
    schemaName: 'generate_roadmap',
    schemaDescription:
      'Generate prioritized roadmap items from user signals',
    model,
    maxTokens: 8192,
  })

  // Mark signals as processed
  const signalIds = signals.map((s) => s.id)
  await supabase.from('signals').update({ processed: true }).in('id', signalIds)

  // Insert roadmap items into DB
  if (result.items.length > 0) {
    const inserts: RoadmapItemInsert[] = result.items.map((item, index) => ({
      project_id: projectId,
      title: item.title,
      description: item.description,
      category: item.category,
      origin: item.origin,
      confidence: Math.max(0, Math.min(100, Math.round(item.confidence))),
      scope: item.scope,
      strategy: item.strategy,
      impact: Math.max(1, Math.min(10, Math.round(item.impact))),
      upside: item.upside,
      size: Math.max(1, Math.min(10, Math.round(item.size))),
      roi_score: item.roi_score,
      evidence_trail: item.evidence_trail,
      thinking_traces: item.thinking_traces,
      acceptance_criteria: item.acceptance_criteria,
      files_to_modify: item.files_to_modify,
      risks: item.risks,
      rank: index + 1,
      generation_id: generationId,
    }))

    await supabase.from('roadmap_items').insert(inserts)
  }

  // Notify about new roadmap items (fire-and-forget)
  if (result.items.length > 0) {
    notifyRoadmapReady(projectId, result.items.length).catch(() => {})
  }

  // Auto-generate PRDs in background (don't block the return)
  if (result.items.length > 0) {
    const { data: insertedItems } = await supabase
      .from('roadmap_items')
      .select('id')
      .eq('generation_id', generationId)

    if (insertedItems) {
      // Fire-and-forget: generate PRDs for each inserted item
      Promise.all(
        insertedItems.map(item =>
          generatePRD(item.id).catch(() => {}) // Silent failure per item
        )
      ).catch(() => {})
    }
  }

  return { items: result.items, generationId }
}
