import { createAdminClient } from '@/lib/supabase/admin'
import { callClaude } from './call-claude'
import { summarizeSignals, formatSummaryForPrompt } from './summarize-signals'
import { deduplicateSignals } from './dedup-signals'
import { notifyRoadmapReady } from '@/lib/notifications'
import type {
  OpportunityClusterRow,
  OpportunityClusterSourceInsert,
  RoadmapItemInsert,
  SignalRow,
} from '@/lib/types/database'

import { FOCUS_MODES, type FocusMode } from '@/lib/brain/design'
import {
  formatResolvedContextForPrompt,
  resolveContextForTask,
} from '@/lib/brain/resolve-context'
import {
  FILING_ATTACH_THRESHOLD,
  fileSignals,
  type FilingInputCluster,
  type FilingInputSignal,
} from '@/lib/brain/filing-resolver'
import {
  computeClusterScores,
  type ClusterSourceInput,
} from '@/lib/brain/ranking'
import {
  completeBrainRun,
  failBrainRun,
  recordWriteCompleted,
  startBrainRun,
} from '@/lib/brain/runs'
import { applyPageUpdates, type PageUpdateInput } from '@/lib/brain/write-pages'
import {
  resolveActions,
  type Action,
  type ClusterSnapshot,
} from '@/lib/brain/action-resolver'
import {
  dedupAgainstHistory,
  shouldRunSynthesis,
  TITLE_DEDUP_THRESHOLD,
  type ExistingItem,
} from '@/lib/brain/preflight'

interface GeneratedRoadmapItem {
  title: string
  description: string
  category: 'bug' | 'feature' | 'improvement' | 'infrastructure' | 'retention' | 'revenue' | 'reach'
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
  impact_estimates: Array<{
    metric: string
    baseline: string
    predicted: string
    unit: string
    reasoning: string
  }>
  /**
   * v1.1: the cluster this item projects from. Either an existing active
   * cluster slug, or a new slug the model is proposing. Falls back to a
   * deterministic slug derived from the title when the model omits it.
   */
  cluster_slug?: string
  /** v1.1: short theme tag for the cluster (e.g. "onboarding-friction"). */
  cluster_theme?: string
  /**
   * v1.1: the dominant product need this item serves. Should be one of the
   * known focus modes when possible (e.g. "conversion", "ux_quality").
   */
  cluster_primary_need?: string
  /** v1.1: why this item matters right now given the active focus mode. */
  why_now?: string
}

interface RoadmapGenerationResult {
  items: GeneratedRoadmapItem[]
  generationId: string
  runId?: string | null
  clustersTouched?: number
  filingReport?: {
    attached: number
    unfiled: number
    examinedClusters: number
  }
  /** v1.1: page updates written back after synthesis. */
  pagesUpdated?: number
  /** v1.1: downstream pages marked stale by the cascade. */
  staleMarked?: string[]
  /** v1.1: action dispatch decisions per cluster. */
  nextActions?: Array<{ clusterId: string; slug: string; action: Action }>
  /** v1.1.5: cooldown gate fired and skipped this run. */
  cooldownSkip?: { reason: string; nextEligibleAt: string }
  /** v1.1.5: pre-emit dedup report. */
  dedupReport?: {
    candidates: number
    kept: number
    droppedAgainstHistory: number
    droppedInBatch: number
    examples: Array<{ dropped: string; matched: string; score: number }>
  }
}

/**
 * v1.1: durable-truth writebacks emitted alongside roadmap items.
 * See docs/brain/skills/roadmap-synthesis.md step 7.
 */
const PAGE_UPDATE_SCHEMA_ITEM = {
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
            enum: ['bug', 'feature', 'improvement', 'infrastructure', 'retention', 'revenue', 'reach'],
          },
          origin: {
            type: 'string',
            description: 'Which signals or clusters led to this item',
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
          impact_estimates: {
            type: 'array',
            description: 'Specific, measurable metric predictions. Be concrete: "+12% signup completion" not "improves UX". Include baseline (current state), predicted (after shipping), and reasoning.',
            items: {
              type: 'object',
              properties: {
                metric: { type: 'string', description: 'Metric name, e.g. signup_completion_rate, bounce_rate, page_load_time, error_rate, retention_d7' },
                baseline: { type: 'string', description: 'Current value or best estimate, e.g. "58%", "3.2s", "12 errors/day"' },
                predicted: { type: 'string', description: 'Predicted value after shipping, e.g. "70%", "1.8s", "2 errors/day"' },
                unit: { type: 'string', description: 'Unit type: percentage, seconds, count, rate' },
                reasoning: { type: 'string', description: 'Why this prediction — reference the signal evidence' },
              },
              required: ['metric', 'baseline', 'predicted', 'unit', 'reasoning'],
            },
          },
          cluster_slug: {
            type: 'string',
            description:
              'Kebab-case slug that identifies the opportunity cluster this item projects from. Reuse an existing slug listed in context when possible; only invent a new slug when no active cluster fits. See docs/brain/skills/_filing-rules.md.',
          },
          cluster_theme: {
            type: 'string',
            description: 'Short theme tag, e.g. "onboarding-friction", "pricing-confusion".',
          },
          cluster_primary_need: {
            type: 'string',
            description:
              'Dominant product need this cluster serves. Prefer a focus-mode name: conversion, ux_quality, retention, virality, performance.',
          },
          why_now: {
            type: 'string',
            description:
              'One sentence on why this item matters now given the active focus mode and recent evidence. Cite what changed.',
          },
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
          'impact_estimates',
        ],
      },
    },
    page_updates: {
      type: 'array',
      description:
        'OPTIONAL durable-truth writebacks the synthesis learned. Prefer updating an existing kind+slug. Leave empty if no page actually needs to change. See docs/brain/skills/roadmap-synthesis.md step 7.',
      items: PAGE_UPDATE_SCHEMA_ITEM,
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

  // v1.1.5: cooldown gate. The hourly cron used to fire even when nothing
  // moved, generating duplicate-shaped briefs. Now: if the last successful
  // run was <6h ago and no fresh anomaly/signal arrived since, skip the
  // pass entirely. This collapses ~9 redundant generations/day to ~2-3.
  const cooldown = await checkSynthesisCooldown(supabase, projectId)
  if (!cooldown.run) {
    console.log(`[generateRoadmap] cooldown skip: ${cooldown.reason}`)
    return {
      items: [],
      generationId,
      cooldownSkip: { reason: cooldown.reason, nextEligibleAt: cooldown.nextEligibleAt },
    }
  }

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

  // Deduplicate similar signals before filing
  const dedupResult = deduplicateSignals(signals as SignalRow[])
  if (dedupResult.duplicatesFound > 0) {
    console.log(
      `[generateRoadmap] Deduplication: ${dedupResult.originalCount} signals → ${dedupResult.dedupedCount} unique (${dedupResult.duplicatesFound} duplicates merged)`
    )
    for (const group of dedupResult.groups) {
      if (group.members.length > 1) {
        const memberIds = group.members.map((m) => m.id)
        void supabase
          .from('signals')
          .update({ dedup_group_id: group.canonical.id })
          .in('id', memberIds)
      }
    }
  }

  // ---------------------------------------------------------------------
  // v1.1: resolve the brain context pages for this task.
  // ---------------------------------------------------------------------

  const context = await resolveContextForTask(supabase, projectId, 'generate_roadmap')
  const focus = resolveFocusMode(context, options?.roiFocus ?? settings?.automation_roi_focus)

  // ---------------------------------------------------------------------
  // v1.1: load active clusters so we can file signals onto them first.
  // ---------------------------------------------------------------------

  const { data: activeClustersRaw } = await supabase
    .from('opportunity_clusters')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'active')

  const activeClusters = (activeClustersRaw ?? []) as OpportunityClusterRow[]
  const clusterBySlug = new Map(activeClusters.map((c) => [c.slug, c]))

  // Start the brain run. Failures are logged but don't abort the task.
  const run = await startBrainRun(supabase, {
    projectId,
    taskType: 'generate_roadmap',
    skillSlug: 'roadmap-synthesis',
    context,
    inputSummary: {
      signal_count: signals.length,
      deduped_count: dedupResult.dedupedCount,
      active_clusters: activeClusters.length,
      focus_mode: focus?.name ?? null,
      roi_focus: options?.roiFocus ?? settings?.automation_roi_focus ?? 'balanced',
    },
    writesPlanned: [
      'signals.processed',
      'roadmap_items',
      'opportunity_clusters',
      'opportunity_cluster_sources',
    ],
  })

  try {
    // File each deduped signal onto the best-matching active cluster.
    const filingInput: FilingInputSignal[] = dedupResult.dedupedSignals.map(
      (signal) => ({
        id: signal.id,
        type: signal.type,
        title: signal.title,
        content: signal.content,
        weight: signal.weight,
      }),
    )
    const clustersForFiling: FilingInputCluster[] = activeClusters.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      theme: c.theme,
      primary_need: c.primary_need,
      latest_brief_md: c.latest_brief_md,
      status: c.status,
    }))

    const filingReport = fileSignals(filingInput, clustersForFiling, FILING_ATTACH_THRESHOLD)

    // Persist attach decisions as cluster sources. Default action for a new
    // signal is to update an existing cluster — see project-brain-v1.md.
    await attachFiledSignals({
      supabase,
      signals: dedupResult.dedupedSignals,
      filingReport,
      clusterById: new Map(activeClusters.map((c) => [c.id, c])),
    })
    if (Object.keys(filingReport.attachedByCluster).length > 0) {
      recordWriteCompleted(run, 'opportunity_cluster_sources')
    }

    // --------------------------------------------------------------
    // Fetch roadmap items for duplicate suppression in the prompt.
    // --------------------------------------------------------------

    const { data: existingItems } = await supabase
      .from('roadmap_items')
      .select('title, description, status')
      .eq('project_id', projectId)
      .in('status', ['proposed', 'approved', 'building'])
      .limit(50)

    const summary = summarizeSignals(dedupResult.dedupedSignals)
    const summaryText = formatSummaryForPrompt(summary)

    const roiFocus =
      options?.roiFocus || settings?.automation_roi_focus || 'balanced'
    const model =
      options?.model || settings?.ai_model_roadmap || 'claude-sonnet-4-6'

    const existingContext =
      existingItems && existingItems.length > 0
        ? `\n\n## Existing Roadmap Items (do NOT duplicate these)\n${existingItems.map((i) => `- [${i.status}] ${i.title}`).join('\n')}`
        : ''

    const clustersContext = formatClustersForPrompt(activeClusters)
    const brainContextBlock = formatResolvedContextForPrompt(context)
    const filingContext = formatFilingReportForPrompt(
      filingReport,
      clusterBySlug,
    )

    const roiFocusInstruction = ROI_FOCUS_INSTRUCTIONS[roiFocus] ?? 'Balance impact, effort, and confidence equally.'

    // v1.1: snapshot every cluster's current scores BEFORE any writes so
    // the action resolver can diff before/after once synthesis finishes.
    const clusterBefore = new Map<string, ClusterSnapshot>(
      activeClusters.map((cluster) => [cluster.id, toSnapshot(cluster)]),
    )

    // v1.1 spec step 4: "Invoke roadmap-synthesis only on changed or
    // high-uncertainty clusters." The selector is deterministic:
    //   - any cluster the filing pass just attached a signal to
    //   - any cluster with low confidence OR low evidence
    // Everything else rides on its current brief for this pass.
    const filedClusterIds = new Set(Object.keys(filingReport.attachedByCluster))
    const selectiveFocusClusters = activeClusters.filter((cluster) => {
      if (filedClusterIds.has(cluster.id)) return true
      if (cluster.confidence_score < 40) return true
      if (cluster.evidence_strength < 40) return true
      return false
    })
    const selectiveFocusBlock = formatSelectiveFocusBlock(selectiveFocusClusters, activeClusters.length)

    const prompt = `You are an AI Product Manager running the \`roadmap-synthesis\` skill.
Follow docs/brain/skills/roadmap-synthesis.md. Default behavior: attach signals to an existing opportunity cluster; only propose a new cluster when no active one fits and the evidence repeats a real theme (see docs/brain/skills/_filing-rules.md).

## Project Context
- Name: ${project.name}
- Description: ${project.description || 'No description'}
- Framework: ${project.framework || 'Unknown'}
- Repository: ${project.repo_url || 'Not connected'}
- Site: ${project.site_url || 'Not deployed'}

${brainContextBlock ? `${brainContextBlock}\n\n` : ''}${clustersContext}

${selectiveFocusBlock}

## Filing Report (deterministic first pass)
${filingContext}

${summaryText}
${existingContext}

## ROI Focus: ${roiFocus}${focus ? ` | Active focus mode: ${focus.name}` : ''}
${roiFocusInstruction}${focus ? `\nThe focus mode raises: ${focus.raises.join(', ')}. It lowers: ${focus.lowers.join(', ')}.` : ''}

## Instructions
1. Analyze the signals plus the resolved brain context and identify actionable improvements.
2. Group related signals into coherent roadmap items. Each item MUST carry:
   - \`cluster_slug\`: reuse an active slug from the list above when possible; only invent one if no cluster fits.
   - \`cluster_theme\` and \`cluster_primary_need\`: align with a focus-mode name where applicable.
   - \`why_now\`: one sentence referencing the active focus and the fresh evidence.
3. For each item, calculate ROI score as: (impact * confidence) / (size * 10).
4. Provide concrete acceptance criteria.
5. Identify likely files that would need modification.
6. List risks and potential rollback strategies.
7. Include thinking traces showing how you arrived at each item.
8. For each item, provide QUANTIFIED impact estimates (baseline + predicted + reasoning grounded in the signals).
9. Generate only high-signal briefs. Prefer refreshing an existing cluster's thesis to minting new clusters.
10. Rank items by ROI score (highest first).
11. If synthesis surfaced a durable truth (new decision, repeated pain, shift in product stage), append it as a \`page_updates[]\` entry. Leave \`page_updates\` empty when nothing durable actually changed.`

    const result = await callClaude<{
      items: GeneratedRoadmapItem[]
      page_updates?: PageUpdateInput[]
    }>({
      prompt,
      system:
        'You are SelfImprove AI PM running the roadmap-synthesis skill. Produce actionable, well-scoped roadmap items that project cleanly from maintained opportunity clusters.',
      schema: ROADMAP_SCHEMA,
      schemaName: 'generate_roadmap',
      schemaDescription:
        'Generate prioritized roadmap items from user signals and the brain context.',
      model,
      maxTokens: 8192,
    })

    // --------------------------------------------------------------
    // Apply the model output: upsert clusters, insert roadmap items.
    // --------------------------------------------------------------

    const signalIds = signals.map((s) => s.id)
    await supabase.from('signals').update({ processed: true }).in('id', signalIds)
    recordWriteCompleted(run, 'signals.processed')

    // v1.1.5: drop new items whose titles cosine-match a recent existing
    // item above the threshold. Without this we observed ~6 variants of
    // "preview-to-purchase nudge" in 24h.
    const dedupReport = await dedupNewItems(supabase, projectId, result.items)
    const dedupedItems = dedupReport.kept

    let clustersTouched = 0

    if (dedupedItems.length > 0) {
      const itemsByClusterSlug = groupItemsByClusterSlug(dedupedItems)

      // Upsert clusters from the model output (new + existing).
      for (const [slug, items] of itemsByClusterSlug.entries()) {
        const representative = items[0]
        const existing = clusterBySlug.get(slug)
        const cluster = await upsertCluster({
          supabase,
          projectId,
          existing,
          slug,
          title: representative.cluster_theme
            ? `${representative.cluster_theme} — ${representative.title}`
            : representative.title,
          theme: representative.cluster_theme ?? representative.category ?? '',
          primary_need:
            representative.cluster_primary_need ?? focus?.name ?? '',
          latest_brief_md: buildClusterBriefMarkdown(items, {
            focusName: focus?.name ?? null,
          }),
        })

        if (!cluster) continue
        clusterBySlug.set(slug, cluster)
        clustersTouched += 1
      }
      recordWriteCompleted(run, 'opportunity_clusters')

      // Insert roadmap items linked back to their clusters.
      const inserts: RoadmapItemInsert[] = dedupedItems.map((item, index) => {
        const slug = item.cluster_slug && item.cluster_slug.trim().length > 0
          ? item.cluster_slug
          : slugifyTitle(item.title)
        const cluster = clusterBySlug.get(slug) ?? null
        return {
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
          impact_estimates: item.impact_estimates,
          stage: 'brief',
          rank: index + 1,
          generation_id: generationId,
          opportunity_cluster_id: cluster?.id ?? null,
        }
      })

      await supabase.from('roadmap_items').insert(inserts)
      recordWriteCompleted(run, 'roadmap_items')

      console.log(`[generateRoadmap] Inserted ${inserts.length} items with generationId=${generationId} (dedup dropped ${dedupReport.dropped.length})`)
      notifyRoadmapReady(projectId, dedupedItems.length).catch(() => {})

      // Recompute deterministic scores for every cluster that changed.
      await rescoreClusters({
        supabase,
        clusters: [...clusterBySlug.values()],
        focus,
        itemsByClusterSlug,
      })
    }

    // v1.1 spec step 8: "Update changed pages and citations." Run AFTER
    // cluster rescoring so downstream cascades reflect the final state.
    let pagesUpdated = 0
    const staleMarked: string[] = []
    if (result.page_updates && result.page_updates.length > 0) {
      const pageWriteResult = await applyPageUpdates(
        supabase,
        projectId,
        result.page_updates,
        { createdBy: 'roadmap-synthesis' },
      )
      pagesUpdated = pageWriteResult.pagesUpdated
      staleMarked.push(...pageWriteResult.staleMarked)
      if (pagesUpdated > 0) recordWriteCompleted(run, 'brain_pages')
    }

    // v1.1: compute the next action per touched cluster so downstream
    // automation (auto-PRD, auto-build) has a single policy decision to
    // dispatch from. We re-read the post-rescore cluster state once so
    // the "after" snapshot sees the new focus_weighted_score.
    const nextActions = await computeNextActions({
      supabase,
      projectId,
      clusterBySlug,
      clusterBefore,
      settings,
    })

    // Auto-promote high-confidence briefs to the roadmap
    await autoPromoteBriefs(projectId)

    await completeBrainRun(supabase, run, {
      resultSummary: {
        items_generated: dedupedItems.length,
        items_proposed_by_model: result.items.length,
        items_dropped_by_dedup: dedupReport.dropped.length,
        clusters_touched: clustersTouched,
        filing: {
          attached: Object.values(filingReport.attachedByCluster).reduce(
            (sum, ids) => sum + ids.length,
            0,
          ),
          unfiled: filingReport.unfiledSignalIds.length,
          examined_clusters: filingReport.examinedClusters,
        },
        generation_id: generationId,
        pages_updated: pagesUpdated,
        stale_marked: staleMarked,
        selective_focus_clusters: selectiveFocusClusters.length,
        total_clusters: activeClusters.length,
        next_actions: nextActions.map(({ slug, action }) => ({
          slug,
          kind: action.kind,
        })),
      },
    })

    return {
      items: dedupedItems,
      generationId,
      runId: run.id,
      clustersTouched,
      filingReport: {
        attached: Object.values(filingReport.attachedByCluster).reduce(
          (sum, ids) => sum + ids.length,
          0,
        ),
        unfiled: filingReport.unfiledSignalIds.length,
        examinedClusters: filingReport.examinedClusters,
      },
      pagesUpdated,
      staleMarked,
      nextActions,
      dedupReport: {
        candidates: result.items.length,
        kept: dedupedItems.length,
        droppedAgainstHistory: dedupReport.dropped.filter((d) => d.matchedId !== 'in-batch').length,
        droppedInBatch: dedupReport.dropped.filter((d) => d.matchedId === 'in-batch').length,
        examples: dedupReport.dropped.slice(0, 5).map((d) => ({
          dropped: d.candidate.title,
          matched: d.matchedTitle,
          score: Number(d.score.toFixed(3)),
        })),
      },
    }
  } catch (err) {
    await failBrainRun(supabase, run, err instanceof Error ? err : String(err))
    throw err
  }
}

export async function autoPromoteBriefs(projectId: string) {
  const supabase = createAdminClient()

  const { count: roadmapCount } = await supabase
    .from('roadmap_items')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('stage', 'roadmap')
    .in('status', ['proposed', 'approved', 'building'])

  const available = 25 - (roadmapCount ?? 0)
  if (available <= 0) return

  const { data: briefs } = await supabase
    .from('roadmap_items')
    .select('id, confidence, roi_score')
    .eq('project_id', projectId)
    .eq('stage', 'brief')
    .eq('status', 'proposed')
    .gte('confidence', 80)
    .gte('roi_score', 4.0)
    .order('roi_score', { ascending: false })
    .limit(available)

  if (!briefs || briefs.length === 0) return

  const ids = briefs.map(b => b.id)
  await supabase
    .from('roadmap_items')
    .update({ stage: 'roadmap' })
    .in('id', ids)
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

async function checkSynthesisCooldown(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
): Promise<ReturnType<typeof shouldRunSynthesis>> {
  const [lastRunRes, anomalyRes, signalRes] = await Promise.all([
    supabase
      .from('brain_runs')
      .select('completed_at')
      .eq('project_id', projectId)
      .eq('task_type', 'generate_roadmap')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('funnel_anomalies')
      .select('created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('signals')
      .select('created_at')
      .eq('project_id', projectId)
      .eq('processed', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return shouldRunSynthesis({
    lastCompletedAt: (lastRunRes.data as { completed_at: string | null } | null)?.completed_at ?? null,
    latestAnomalyAt: (anomalyRes.data as { created_at: string } | null)?.created_at ?? null,
    latestUnprocessedSignalAt: (signalRes.data as { created_at: string } | null)?.created_at ?? null,
  })
}

async function dedupNewItems(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  candidates: GeneratedRoadmapItem[],
) {
  if (candidates.length === 0) {
    return { kept: candidates, dropped: [] as Array<{ candidate: GeneratedRoadmapItem; matchedTitle: string; matchedId: string; score: number }> }
  }
  // Pull the last 30d of titles for this project.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: existingRows } = await supabase
    .from('roadmap_items')
    .select('id, title, created_at')
    .eq('project_id', projectId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500)

  const existing: ExistingItem[] = (existingRows ?? []).map((row: { id: string; title: string; created_at: string }) => ({
    id: row.id,
    title: row.title,
    created_at: row.created_at,
  }))

  return dedupAgainstHistory(candidates, existing, TITLE_DEDUP_THRESHOLD)
}

function toSnapshot(cluster: OpportunityClusterRow): ClusterSnapshot {
  return {
    id: cluster.id,
    slug: cluster.slug,
    evidence_strength: cluster.evidence_strength,
    freshness_score: cluster.freshness_score,
    confidence_score: cluster.confidence_score,
    effort_score: cluster.effort_score,
    focus_weighted_score: cluster.focus_weighted_score,
    latest_brief_md: cluster.latest_brief_md,
    status: cluster.status,
    primary_need: cluster.primary_need,
    theme: cluster.theme,
  }
}

function formatSelectiveFocusBlock(
  selected: OpportunityClusterRow[],
  total: number,
): string {
  if (total === 0) return ''
  if (selected.length === 0) {
    return '## Selective Synthesis Focus\n_No clusters meet the changed-or-high-uncertainty criteria this pass. Refresh briefs only when the filing report demands it._'
  }
  const lines = selected
    .slice(0, 30)
    .map(
      (cluster) =>
        `- \`${cluster.slug}\` (ev=${cluster.evidence_strength} conf=${cluster.confidence_score})`,
    )
  return `## Selective Synthesis Focus (${selected.length} of ${total} clusters)\nOnly refresh briefs on these clusters this pass — everything else rides on its current brief:\n${lines.join('\n')}`
}

async function computeNextActions(args: {
  supabase: ReturnType<typeof createAdminClient>
  projectId: string
  clusterBySlug: Map<string, OpportunityClusterRow>
  clusterBefore: Map<string, ClusterSnapshot>
  settings: Record<string, unknown> | null | undefined
}): Promise<Array<{ clusterId: string; slug: string; action: Action }>> {
  const { supabase, projectId, clusterBySlug, clusterBefore, settings } = args
  const clusterIds = [...clusterBySlug.values()].map((cluster) => cluster.id)
  if (clusterIds.length === 0) return []

  const { data: freshRows } = await supabase
    .from('opportunity_clusters')
    .select('*')
    .in('id', clusterIds)
  const fresh = (freshRows ?? []) as OpportunityClusterRow[]
  if (fresh.length === 0) return []

  // Rank clusters by focus_weighted_score so action-resolver can tell
  // "entered the ranked roadmap slice".
  const ranked = [...fresh].sort(
    (a, b) => b.focus_weighted_score - a.focus_weighted_score,
  )
  const rankByClusterId = new Map<string, number>(
    ranked.map((cluster, index) => [cluster.id, index + 1]),
  )

  // Load roadmap projections so action-resolver can tell "PRD approved".
  const { data: projectionRows } = await supabase
    .from('roadmap_items')
    .select('id, opportunity_cluster_id, prd_content, status, stage, build_status')
    .eq('project_id', projectId)
    .in(
      'opportunity_cluster_id',
      fresh.map((cluster) => cluster.id),
    )
  const projectionsByCluster = new Map<string, RoadmapProjectionRow>()
  for (const row of (projectionRows ?? []) as RoadmapProjectionRow[]) {
    if (!row.opportunity_cluster_id) continue
    const existing = projectionsByCluster.get(row.opportunity_cluster_id)
    // prefer approved + prd'd projections over earlier ones
    if (
      !existing ||
      (row.status === 'approved' && existing.status !== 'approved')
    ) {
      projectionsByCluster.set(row.opportunity_cluster_id, row)
    }
  }

  const inputs = fresh.map((cluster) => ({
    before: clusterBefore.get(cluster.id) ?? null,
    after: toSnapshot(cluster),
    roadmapItem: projectionsByCluster.get(cluster.id) ?? null,
    policy: (settings as ApprovalPolicyRow | null) ?? null,
    clusterRankInFocus: rankByClusterId.get(cluster.id),
  }))

  return resolveActions(inputs)
}

type RoadmapProjectionRow = {
  id: string
  opportunity_cluster_id: string | null
  prd_content: Record<string, unknown> | null
  status: string
  stage: string
  build_status: string | null
}

type ApprovalPolicyRow = {
  automation_auto_approve: boolean
  automation_auto_merge: boolean
  automation_implement_enabled: boolean
  safety_risk_threshold: number
  safety_max_files: number
  safety_max_lines: number
  safety_blocked_paths: string[]
  safety_daily_cap: number
}

const ROI_FOCUS_INSTRUCTIONS: Record<string, string> = {
  impact: 'Prioritize high-impact items even if they require more effort.',
  effort: 'Prioritize quick wins — low effort items with reasonable impact.',
  confidence: 'Prioritize items with strong evidence from multiple signal sources.',
  bugs: 'Focus on bug fixes and stability improvements. Prioritize items that fix existing broken behavior, reduce errors, and improve reliability.',
  ux: 'Focus on usability and UX improvements. Prioritize items that reduce friction, improve navigation, and make the product more intuitive.',
  features: 'Focus on new feature development. Prioritize items that add new capabilities users are asking for.',
  retention: 'Focus on features that improve user retention — reduce churn, increase engagement, improve onboarding completion. Use the "retention" category for these items.',
  revenue: 'Focus on features that increase revenue — pricing optimization, conversion funnels, upsell opportunities. Use the "revenue" category for these items.',
  reach: 'Focus on features that increase reach/traffic — SEO, sharing, viral loops, content marketing support. Use the "reach" category for these items.',
}

function resolveFocusMode(
  context: Awaited<ReturnType<typeof resolveContextForTask>>,
  roiFocus?: string | null,
): FocusMode | null {
  const currentFocusEntry = context.pages.find((entry) => entry.kind === 'current_focus')
  const focusName = normalizeFocusName(
    currentFocusEntry?.page?.slug ?? currentFocusEntry?.content ?? roiFocus ?? null,
  )
  if (!focusName) return null
  return FOCUS_MODES.find((mode) => mode.name === focusName) ?? null
}

function normalizeFocusName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const lowered = raw.toLowerCase()
  for (const mode of FOCUS_MODES) {
    if (lowered.includes(mode.name)) return mode.name
  }
  return null
}

function formatClustersForPrompt(clusters: OpportunityClusterRow[]): string {
  if (clusters.length === 0) {
    return '## Active Opportunity Clusters\n_No active clusters yet; propose new ones only when evidence justifies it._'
  }
  const lines = clusters
    .slice(0, 40)
    .map((cluster) => {
      const scores = `ev=${cluster.evidence_strength} fresh=${cluster.freshness_score} conf=${cluster.confidence_score} effort=${cluster.effort_score} focus=${cluster.focus_weighted_score}`
      return `- \`${cluster.slug}\` — ${cluster.title} | need=${cluster.primary_need || 'n/a'} | theme=${cluster.theme || 'n/a'} | ${scores}`
    })
  return `## Active Opportunity Clusters (prefer attaching over creating)\n${lines.join('\n')}`
}

function formatFilingReportForPrompt(
  report: ReturnType<typeof fileSignals>,
  clusterBySlug: Map<string, OpportunityClusterRow>,
): string {
  const attachedLines: string[] = []
  const attachedEntries = Object.entries(report.attachedByCluster)
  for (const [clusterId, signalIds] of attachedEntries) {
    const cluster = [...clusterBySlug.values()].find((c) => c.id === clusterId)
    const slug = cluster?.slug ?? clusterId
    attachedLines.push(`- ${signalIds.length} signal(s) attached to \`${slug}\``)
  }
  const attachedBlock = attachedLines.length > 0
    ? attachedLines.join('\n')
    : '- (none)'

  const unfiledCount = report.unfiledSignalIds.length
  return [
    `Examined ${report.examinedClusters} active cluster(s).`,
    'Attached:',
    attachedBlock,
    `Unfiled (require your judgment): ${unfiledCount} signal(s). Decide attach-or-create per the filing rules.`,
  ].join('\n')
}

function groupItemsByClusterSlug(
  items: GeneratedRoadmapItem[],
): Map<string, GeneratedRoadmapItem[]> {
  const byCluster = new Map<string, GeneratedRoadmapItem[]>()
  for (const item of items) {
    const slug = item.cluster_slug && item.cluster_slug.trim().length > 0
      ? item.cluster_slug
      : slugifyTitle(item.title)
    const list = byCluster.get(slug) ?? []
    list.push(item)
    byCluster.set(slug, list)
  }
  return byCluster
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'cluster'
}

function buildClusterBriefMarkdown(
  items: GeneratedRoadmapItem[],
  opts: { focusName: string | null },
): string {
  const lead = items[0]
  const whyNow = items.map((item) => item.why_now).filter((entry) => entry && entry.trim()).join(' ')
  const focusLine = opts.focusName ? `\nActive focus: ${opts.focusName}.` : ''
  return [
    `# ${lead.title}`,
    '',
    lead.description,
    '',
    '## Why now',
    whyNow || '(not provided)',
    focusLine.trim() ? focusLine : '',
    '',
    '## Linked brief titles',
    items.map((item) => `- ${item.title}`).join('\n'),
  ]
    .filter((line) => line !== '')
    .join('\n')
}

async function attachFiledSignals(args: {
  supabase: ReturnType<typeof createAdminClient>
  signals: SignalRow[]
  filingReport: ReturnType<typeof fileSignals>
  clusterById: Map<string, OpportunityClusterRow>
}): Promise<void> {
  const { supabase, signals, filingReport, clusterById } = args
  const signalById = new Map(signals.map((s) => [s.id, s]))
  const inserts: OpportunityClusterSourceInsert[] = []
  const touchedClusterIds = new Set<string>()

  for (const decision of filingReport.decisions) {
    if (decision.kind !== 'attach') continue
    const signal = signalById.get(decision.signalId)
    if (!signal) continue
    const cluster = clusterById.get(decision.clusterId)
    if (!cluster) continue

    touchedClusterIds.add(cluster.id)
    inserts.push({
      cluster_id: cluster.id,
      source_kind: 'signal',
      signal_id: signal.id,
      weight: signal.weight,
      citation: signal.title ?? signal.content.slice(0, 140),
      excerpt: signal.content.slice(0, 500),
      polarity: 'supports',
    })
  }

  if (inserts.length > 0) {
    await supabase.from('opportunity_cluster_sources').insert(inserts)
  }

  if (touchedClusterIds.size > 0) {
    const now = new Date().toISOString()
    await supabase
      .from('opportunity_clusters')
      .update({ last_signal_at: now })
      .in('id', [...touchedClusterIds])
  }
}

async function upsertCluster(args: {
  supabase: ReturnType<typeof createAdminClient>
  projectId: string
  existing: OpportunityClusterRow | undefined
  slug: string
  title: string
  theme: string
  primary_need: string
  latest_brief_md: string
}): Promise<OpportunityClusterRow | null> {
  const { supabase, projectId, existing, slug, title, theme, primary_need, latest_brief_md } = args
  const now = new Date().toISOString()

  if (existing) {
    const { data } = await supabase
      .from('opportunity_clusters')
      .update({
        title: title || existing.title,
        theme: theme || existing.theme,
        primary_need: primary_need || existing.primary_need,
        latest_brief_md,
        last_refreshed_at: now,
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    return (data as OpportunityClusterRow) ?? existing
  }

  const { data } = await supabase
    .from('opportunity_clusters')
    .insert({
      project_id: projectId,
      slug,
      title: title || slug,
      theme,
      primary_need,
      latest_brief_md,
      last_refreshed_at: now,
    })
    .select('*')
    .single()
  return (data as OpportunityClusterRow) ?? null
}

async function rescoreClusters(args: {
  supabase: ReturnType<typeof createAdminClient>
  clusters: OpportunityClusterRow[]
  focus: FocusMode | null
  itemsByClusterSlug: Map<string, GeneratedRoadmapItem[]>
}): Promise<void> {
  const { supabase, clusters, focus, itemsByClusterSlug } = args
  if (clusters.length === 0) return

  const { data: sources } = await supabase
    .from('opportunity_cluster_sources')
    .select('cluster_id, source_kind, weight, polarity, created_at, signal_id')
    .in('cluster_id', clusters.map((c) => c.id))

  const sourcesByCluster = new Map<string, ClusterSourceInput[]>()
  for (const row of (sources ?? []) as Array<{
    cluster_id: string
    source_kind: ClusterSourceInput['source_kind']
    weight: number
    polarity: ClusterSourceInput['polarity']
    created_at: string
    signal_id: string | null
  }>) {
    const list = sourcesByCluster.get(row.cluster_id) ?? []
    list.push({
      source_kind: row.source_kind,
      weight: row.weight,
      polarity: row.polarity ?? 'supports',
      created_at: row.created_at,
    })
    sourcesByCluster.set(row.cluster_id, list)
  }

  for (const cluster of clusters) {
    const clusterSources = sourcesByCluster.get(cluster.id) ?? []
    const items = itemsByClusterSlug.get(cluster.slug) ?? []
    const avgSize =
      items.length > 0
        ? items.reduce((sum, item) => sum + (item.size ?? 5), 0) / items.length
        : null

    const scores = computeClusterScores({
      sources: clusterSources,
      lastSignalAt: cluster.last_signal_at,
      lastRefreshedAt: cluster.last_refreshed_at,
      effortSignal: avgSize,
      primaryNeed: cluster.primary_need,
      needVector: cluster.need_vector,
      focus,
    })

    await supabase
      .from('opportunity_clusters')
      .update({
        evidence_strength: scores.evidenceStrength,
        freshness_score: scores.freshnessScore,
        confidence_score: scores.confidenceScore,
        effort_score: scores.effortScore,
        focus_weighted_score: scores.focusWeightedScore,
      })
      .eq('id', cluster.id)
  }
}
