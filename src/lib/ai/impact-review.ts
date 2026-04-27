import { createAdminClient } from '@/lib/supabase/admin'
import type {
  OpportunityClusterRow,
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
import {
  computeClusterScores,
  type ClusterSourceInput,
} from '@/lib/brain/ranking'
import { applyPageUpdates, type PageUpdateInput } from '@/lib/brain/write-pages'

import { callClaude } from './call-claude'

/**
 * `impact-review` runner.
 *
 * Implements docs/brain/skills/impact-review.md. Compares the PRD's predicted
 * impact against the actual metrics measured after shipping, deterministically
 * classifies the delta per metric, and asks the model for the "why" plus
 * candidate skill/resolver updates when the same mistake is likely to recur.
 */

export type ImpactActual = {
  metric: string
  actual: string
  measured_at: string
}

export type ImpactReviewInput = {
  roadmapItemId: string
  /** Optional override for the actuals; defaults to what is on the row. */
  actuals?: ImpactActual[]
  model?: string
}

export type MetricClassification = 'confirmed' | 'underperformed' | 'inconclusive' | 'missing'

export type MetricComparison = {
  metric: string
  unit: string | null
  baseline: number | null
  predicted: number | null
  actual: number | null
  expectedDelta: number | null
  actualDelta: number | null
  accuracyRatio: number | null
  classification: MetricClassification
  note: string
}

export type ImpactReviewVerdict = 'confirmed' | 'underperformed' | 'inconclusive'

export type ImpactReviewResult = {
  verdict: ImpactReviewVerdict
  accuracyScore: number | null
  comparisons: MetricComparison[]
  reasoning: string
  proposedChanges: Array<{
    target: 'skill' | 'resolver_rule' | 'resolver_trigger' | 'brain_page'
    description: string
  }>
  clusterRescored: boolean
  runId: string | null
}

/**
 * Parse a loose metric string like "58%", "3.2s", "12 errors/day" into a
 * numeric value plus the unit we parsed out. Returns null when no number can
 * be extracted.
 */
export function parseMetricValue(
  raw: string | number | null | undefined,
): { value: number; unit: string | null } | null {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? { value: raw, unit: null } : null

  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  const match = /(-?\d+(?:[.,]\d+)?)/.exec(trimmed)
  if (!match) return null
  const value = Number.parseFloat(match[1].replace(',', '.'))
  if (!Number.isFinite(value)) return null

  const rest = trimmed.replace(match[1], '').trim()
  const unit = rest.length > 0 ? rest : null
  return { value, unit }
}

export type ImpactEstimate = {
  metric: string
  baseline: string
  predicted: string
  unit: string
  reasoning?: string
}

/**
 * Deterministically classify each metric's outcome. Pure function — used both
 * by the runner and the unit tests.
 */
export function classifyImpact(
  estimates: ImpactEstimate[],
  actuals: ImpactActual[],
): { comparisons: MetricComparison[]; verdict: ImpactReviewVerdict; accuracyScore: number | null } {
  if (estimates.length === 0) {
    return { comparisons: [], verdict: 'inconclusive', accuracyScore: null }
  }

  const actualByMetric = new Map<string, ImpactActual>()
  for (const actual of actuals) {
    actualByMetric.set(actual.metric.toLowerCase(), actual)
  }

  const comparisons: MetricComparison[] = estimates.map((estimate) => {
    const baseline = parseMetricValue(estimate.baseline)
    const predicted = parseMetricValue(estimate.predicted)
    const actualEntry = actualByMetric.get(estimate.metric.toLowerCase())
    const actual = parseMetricValue(actualEntry?.actual ?? null)

    if (!baseline || !predicted) {
      return {
        metric: estimate.metric,
        unit: estimate.unit || null,
        baseline: baseline?.value ?? null,
        predicted: predicted?.value ?? null,
        actual: actual?.value ?? null,
        expectedDelta: null,
        actualDelta: null,
        accuracyRatio: null,
        classification: 'missing',
        note: 'Baseline or predicted value could not be parsed.',
      }
    }

    if (!actual) {
      return {
        metric: estimate.metric,
        unit: estimate.unit || baseline.unit,
        baseline: baseline.value,
        predicted: predicted.value,
        actual: null,
        expectedDelta: predicted.value - baseline.value,
        actualDelta: null,
        accuracyRatio: null,
        classification: 'missing',
        note: 'No actual measurement supplied for this metric.',
      }
    }

    const expectedDelta = predicted.value - baseline.value
    const actualDelta = actual.value - baseline.value
    const expectedMagnitude = Math.abs(expectedDelta)
    const actualMagnitude = Math.abs(actualDelta)

    if (expectedMagnitude < 1e-6) {
      // Predicted no change; judge purely by whether the actual moved.
      const classification: MetricClassification = actualMagnitude < 1e-6 ? 'confirmed' : 'inconclusive'
      return {
        metric: estimate.metric,
        unit: estimate.unit || baseline.unit,
        baseline: baseline.value,
        predicted: predicted.value,
        actual: actual.value,
        expectedDelta,
        actualDelta,
        accuracyRatio: actualMagnitude < 1e-6 ? 1 : 0,
        classification,
        note:
          classification === 'confirmed'
            ? 'Predicted no change and nothing changed.'
            : 'Predicted no change but actual moved — classify as inconclusive.',
      }
    }

    const sameSign = Math.sign(expectedDelta) === Math.sign(actualDelta) || actualMagnitude < 1e-6
    const ratio = actualDelta / expectedDelta
    const accuracyRatio = Math.max(0, Math.min(1.5, ratio))

    let classification: MetricClassification
    let note: string
    if (!sameSign && actualMagnitude >= expectedMagnitude * 0.25) {
      classification = 'underperformed'
      note = 'Actual moved the wrong direction vs. the forecast.'
    } else if (ratio >= 0.75) {
      classification = 'confirmed'
      note = 'Actual reached at least 75% of the expected delta in the right direction.'
    } else if (ratio >= 0.25) {
      classification = 'underperformed'
      note = 'Actual moved in the right direction but under 75% of the expected delta.'
    } else {
      classification = 'inconclusive'
      note = 'Actual barely moved relative to the forecast; cannot attribute to the change.'
    }

    return {
      metric: estimate.metric,
      unit: estimate.unit || baseline.unit,
      baseline: baseline.value,
      predicted: predicted.value,
      actual: actual.value,
      expectedDelta,
      actualDelta,
      accuracyRatio,
      classification,
      note,
    }
  })

  // Aggregate verdict: any underperformance wins over confirmed if
  // majority underperformed; otherwise majority rules, with "missing" not
  // counted for the verdict.
  const comparable = comparisons.filter((entry) => entry.classification !== 'missing')
  if (comparable.length === 0) {
    return { comparisons, verdict: 'inconclusive', accuracyScore: null }
  }
  const counts = comparable.reduce<Record<MetricClassification, number>>(
    (acc, entry) => {
      acc[entry.classification] = (acc[entry.classification] ?? 0) + 1
      return acc
    },
    { confirmed: 0, underperformed: 0, inconclusive: 0, missing: 0 },
  )

  let verdict: ImpactReviewVerdict
  if (counts.confirmed >= counts.underperformed && counts.confirmed >= counts.inconclusive) {
    verdict = 'confirmed'
  } else if (counts.underperformed >= counts.inconclusive) {
    verdict = 'underperformed'
  } else {
    verdict = 'inconclusive'
  }

  const ratios = comparable
    .map((entry) => entry.accuracyRatio)
    .filter((ratio): ratio is number => ratio != null)
  const accuracyScore =
    ratios.length === 0
      ? null
      : Math.max(
          0,
          Math.min(
            1,
            ratios.reduce((sum, r) => sum + Math.min(1, r), 0) / ratios.length,
          ),
        )

  return { comparisons, verdict, accuracyScore }
}

const REVIEW_SCHEMA = {
  type: 'object' as const,
  properties: {
    reasoning: {
      type: 'string',
      description:
        'Most likely reasons for the observed outcome. Cite specific signals, shipped changes, or page facts.',
    },
    proposed_changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            enum: ['skill', 'resolver_rule', 'resolver_trigger', 'brain_page'],
          },
          description: { type: 'string' },
        },
        required: ['target', 'description'],
      },
    },
    page_updates: {
      type: 'array',
      description:
        'OPTIONAL durable-truth writebacks. Prefer appending to release_notes or metric_definitions; leave empty when nothing durable changed. See docs/brain/skills/impact-review.md step 4.',
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
    },
  },
  required: ['reasoning', 'proposed_changes'],
}

export async function runImpactReview(
  input: ImpactReviewInput,
): Promise<ImpactReviewResult> {
  const supabase = createAdminClient()

  const { data: itemData } = await supabase
    .from('roadmap_items')
    .select('*')
    .eq('id', input.roadmapItemId)
    .single()
  const item = itemData as RoadmapItemRow | null
  if (!item) throw new Error(`Roadmap item ${input.roadmapItemId} not found`)

  const actuals = input.actuals ?? ((item.impact_actuals ?? []) as ImpactActual[])
  const estimates = (item.impact_estimates ?? []) as ImpactEstimate[]

  const { comparisons, verdict, accuracyScore } = classifyImpact(estimates, actuals)

  const context = await resolveContextForTask(supabase, item.project_id, 'measure_impact')
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
    taskType: 'measure_impact',
    skillSlug: 'impact-review',
    context,
    inputSummary: {
      roadmap_item_id: item.id,
      cluster_slug: cluster?.slug ?? null,
      verdict,
      accuracy_score: accuracyScore,
      metrics_count: comparisons.length,
    },
    writesPlanned: ['roadmap_items.estimate_accuracy', 'opportunity_clusters'],
  })

  try {
    const prompt = buildReviewPrompt({
      item,
      cluster,
      comparisons,
      verdict,
      accuracyScore,
      brainContextBlock,
    })

    const model = input.model ?? 'claude-sonnet-4-6'
    const reviewOut = await callClaude<{
      reasoning: string
      proposed_changes: ImpactReviewResult['proposedChanges']
      page_updates?: PageUpdateInput[]
    }>({
      prompt,
      system:
        'You are running the impact-review skill. Compare predicted vs actual, explain the delta, and propose concrete skill/resolver/page changes only when the same mistake is likely to recur. When the outcome surfaces a durable learning worth preserving, append a `page_updates[]` entry (usually to `release_notes` or `metric_definitions`).',
      schema: REVIEW_SCHEMA,
      schemaName: 'impact_review',
      schemaDescription: 'Explain the outcome and propose improvements, plus optional page writebacks.',
      model,
      maxTokens: 2048,
    })

    // Persist estimate_accuracy on the roadmap item.
    await supabase
      .from('roadmap_items')
      .update({
        estimate_accuracy: accuracyScore,
        impact_actuals: actuals,
      })
      .eq('id', item.id)
    recordWriteCompleted(run, 'roadmap_items.estimate_accuracy')

    // Nudge the cluster's scores by treating the review outcome as a new
    // source row: confirmed = supports, underperformed = contradicts.
    let clusterRescored = false
    if (cluster) {
      await supabase.from('opportunity_cluster_sources').insert({
        cluster_id: cluster.id,
        source_kind: 'shipped_change',
        roadmap_item_id: item.id,
        citation: `impact-review:${verdict}`,
        weight: accuracyScore ?? 1,
        polarity: verdict === 'underperformed' ? 'contradicts' : 'supports',
      })

      const { data: sources } = await supabase
        .from('opportunity_cluster_sources')
        .select('source_kind, weight, polarity, created_at')
        .eq('cluster_id', cluster.id)
      const sourceInputs = ((sources ?? []) as Array<{
        source_kind: ClusterSourceInput['source_kind']
        weight: number
        polarity: ClusterSourceInput['polarity']
        created_at: string
      }>).map((row) => ({
        source_kind: row.source_kind,
        weight: row.weight,
        polarity: row.polarity ?? 'supports',
        created_at: row.created_at,
      }))

      const scores = computeClusterScores({
        sources: sourceInputs,
        lastSignalAt: cluster.last_signal_at,
        lastRefreshedAt: cluster.last_refreshed_at,
        effortSignal: item.size ?? null,
        primaryNeed: cluster.primary_need,
        needVector: cluster.need_vector,
        focus: null,
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
      recordWriteCompleted(run, 'opportunity_clusters')
      clusterRescored = true
    }

    // v1.1 spec step 4: "Update the relevant project pages and cluster
    // scores with the learning." Cluster scores updated above; now write
    // any page updates the model surfaced.
    let pagesUpdated = 0
    let staleMarked: string[] = []
    if (reviewOut.page_updates && reviewOut.page_updates.length > 0) {
      const writeResult = await applyPageUpdates(
        supabase,
        item.project_id,
        reviewOut.page_updates,
        { createdBy: 'impact-review' },
      )
      pagesUpdated = writeResult.pagesUpdated
      staleMarked = writeResult.staleMarked
      if (pagesUpdated > 0) recordWriteCompleted(run, 'brain_pages')
    }

    await completeBrainRun(supabase, run, {
      resultSummary: {
        verdict,
        accuracy_score: accuracyScore,
        comparisons: comparisons.map((entry) => ({
          metric: entry.metric,
          classification: entry.classification,
          accuracyRatio: entry.accuracyRatio,
        })),
        proposed_changes_count: reviewOut.proposed_changes.length,
        pages_updated: pagesUpdated,
        stale_marked: staleMarked,
      },
    })

    return {
      verdict,
      accuracyScore,
      comparisons,
      reasoning: reviewOut.reasoning,
      proposedChanges: reviewOut.proposed_changes,
      clusterRescored,
      runId: run.id,
    }
  } catch (err) {
    await failBrainRun(supabase, run, err instanceof Error ? err : String(err))
    throw err
  }
}

type ReviewPromptArgs = {
  item: RoadmapItemRow
  cluster: OpportunityClusterRow | null
  comparisons: MetricComparison[]
  verdict: ImpactReviewVerdict
  accuracyScore: number | null
  brainContextBlock: string
}

function buildReviewPrompt(args: ReviewPromptArgs): string {
  const { item, cluster, comparisons, verdict, accuracyScore, brainContextBlock } = args
  const lines = comparisons.map((entry) => {
    const unit = entry.unit ?? ''
    return `- ${entry.metric}: baseline=${entry.baseline ?? '?'}${unit}, predicted=${entry.predicted ?? '?'}${unit}, actual=${entry.actual ?? '?'}${unit} | classification=${entry.classification} (${entry.note})`
  })

  const clusterBlock = cluster
    ? `## Cluster\n- slug: ${cluster.slug}\n- primary_need: ${cluster.primary_need}\n- brief: ${cluster.latest_brief_md.slice(0, 600)}`
    : '## Cluster\n_None linked._'

  return `You are running the impact-review skill. The deterministic classifier has already run. You only need to explain the outcome and propose durable improvements.

## Roadmap Item
- id: ${item.id}
- title: ${item.title}
- category: ${item.category}
- scope: ${item.scope}
- shipped acceptance criteria: ${(item.acceptance_criteria ?? []).join(' | ') || 'none'}

${brainContextBlock ? `${brainContextBlock}\n\n` : ''}${clusterBlock}

## Deterministic Verdict
- overall: ${verdict}
- accuracy_score: ${accuracyScore ?? 'n/a'}

## Per-Metric Comparisons
${lines.join('\n') || '- none'}

## Instructions
1. Explain the MOST LIKELY reasons for the outcome. Reference specific signals, shipped changes, or page facts.
2. Only propose changes (skill, resolver_rule, resolver_trigger, brain_page) when the same mistake is LIKELY to recur.
3. Keep each proposed change concrete and actionable (what to edit, not a principle).`
}
