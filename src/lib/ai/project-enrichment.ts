import { createAdminClient } from '@/lib/supabase/admin'
import type {
  BrainPageKind,
  BrainPageRow,
  OpportunityClusterRow,
  OpportunityClusterSourceInsert,
  ShippedChangeRow,
  SignalRow,
} from '@/lib/types/database'

import { callClaude } from './call-claude'
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

/**
 * `project-enrichment` runner.
 *
 * Implements the skill in docs/brain/skills/project-enrichment.md. Converts
 * raw product and repo evidence into durable `brain_pages` and
 * `opportunity_clusters`, writing append-only `brain_page_versions`,
 * attribution rows in `brain_page_sources`, retrieval-ready `brain_chunks`,
 * and a `brain_runs` audit record for the invocation.
 *
 * Key policy: file by product subject, not source format (see
 * docs/brain/skills/_filing-rules.md). The default action is to update an
 * existing page or cluster rather than mint a new one.
 */

export type ScanFinding = {
  id?: string
  summary: string
  area: string
  severity?: 'low' | 'medium' | 'high'
  citation?: string
  excerpt?: string
}

export type EnrichmentInput = {
  projectId: string
  /** Specific signals to ingest. Defaults to up to 200 recent signals. */
  signalIds?: string[]
  scanFindings?: ScanFinding[]
  /** Shipped changes to consider when updating release_notes or repo_map. */
  recentShippedIds?: string[]
  manualNotes?: string[]
  model?: string
  /** Hard cap on how many pages the model may touch in one run. */
  maxPageUpdates?: number
  /** Max clusters to refresh in one run (the rest wait for the next sweep). */
  maxClusterUpdates?: number
}

export type EnrichmentResult = {
  pagesUpdated: number
  versionsCreated: number
  sourcesAttached: number
  chunksWritten: number
  clustersUpdated: number
  staleMarked: string[]
  runId: string | null
  openQuestions: string[]
}

export type PageUpdateOutput = {
  kind: BrainPageKind
  slug: string
  title: string
  summary: string
  importance?: number
  status?: 'active' | 'stale'
  stale_reason?: string
  content_md: string
  key_facts?: string[]
  open_questions?: string[]
  change_summary?: string
  sources?: Array<{
    source_kind: 'signal' | 'roadmap_item' | 'shipped_change' | 'manual_note' | 'scan_finding'
    signal_id?: string
    roadmap_item_id?: string
    shipped_change_id?: string
    citation?: string
    excerpt?: string
    weight?: number
  }>
}

export type ClusterUpdateOutput = {
  slug: string
  title?: string
  theme?: string
  primary_need?: string
  need_vector?: Record<string, number>
  latest_brief_md?: string
  status?: 'active' | 'snoozed' | 'archived' | 'merged' | 'shipped'
  attach_signal_ids?: string[]
}

const ENRICHMENT_SCHEMA = {
  type: 'object' as const,
  properties: {
    page_updates: {
      type: 'array',
      description:
        'Minimal set of brain_pages to update or create. Prefer updating an existing slug/kind over creating a new one. Leave this empty if nothing durable changed.',
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
          slug: { type: 'string', description: 'Kebab-case slug, stable across versions.' },
          title: { type: 'string' },
          summary: { type: 'string', description: 'One-paragraph summary for lists + previews.' },
          importance: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            description: 'How critical this page is for downstream tasks (default 50).',
          },
          status: { type: 'string', enum: ['active', 'stale'] },
          stale_reason: { type: 'string', description: 'Only when status=stale.' },
          content_md: { type: 'string', description: 'Full compiled markdown for this version.' },
          key_facts: { type: 'array', items: { type: 'string' } },
          open_questions: { type: 'array', items: { type: 'string' } },
          change_summary: { type: 'string', description: 'What changed vs. the previous version.' },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source_kind: {
                  type: 'string',
                  enum: ['signal', 'roadmap_item', 'shipped_change', 'manual_note', 'scan_finding'],
                },
                signal_id: { type: 'string' },
                roadmap_item_id: { type: 'string' },
                shipped_change_id: { type: 'string' },
                citation: { type: 'string' },
                excerpt: { type: 'string' },
                weight: { type: 'number' },
              },
              required: ['source_kind'],
            },
          },
        },
        required: ['kind', 'slug', 'title', 'summary', 'content_md'],
      },
    },
    cluster_updates: {
      type: 'array',
      description: 'Optional: opportunity cluster refreshes proposed alongside the page updates.',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          title: { type: 'string' },
          theme: { type: 'string' },
          primary_need: { type: 'string' },
          need_vector: { type: 'object', additionalProperties: { type: 'number' } },
          latest_brief_md: { type: 'string' },
          status: { type: 'string', enum: ['active', 'snoozed', 'archived', 'merged', 'shipped'] },
          attach_signal_ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['slug'],
      },
    },
    diary: {
      type: 'array',
      description: 'Private reasoning trace captured with the run; NOT user-facing.',
      items: { type: 'string' },
    },
  },
  required: ['page_updates'],
}

type EnrichmentOutput = {
  page_updates: PageUpdateOutput[]
  cluster_updates?: ClusterUpdateOutput[]
  diary?: string[]
}

export async function runProjectEnrichment(
  input: EnrichmentInput,
): Promise<EnrichmentResult> {
  const supabase = createAdminClient()
  const { projectId } = input

  // ---- gather inputs -------------------------------------------------
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()
  if (!project) throw new Error(`Project ${projectId} not found`)

  const signals = await loadSignals(supabase, projectId, input.signalIds)
  const shipped = await loadShipped(supabase, projectId, input.recentShippedIds)
  const { data: existingPagesData } = await supabase
    .from('brain_pages')
    .select('*')
    .eq('project_id', projectId)
  const existingPages = (existingPagesData ?? []) as BrainPageRow[]

  const { data: clustersData } = await supabase
    .from('opportunity_clusters')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'active')
  const activeClusters = (clustersData ?? []) as OpportunityClusterRow[]

  const context = await resolveContextForTask(supabase, projectId, 'scan_codebase')

  const run = await startBrainRun(supabase, {
    projectId,
    taskType: 'scan_codebase',
    skillSlug: 'project-enrichment',
    context,
    inputSummary: {
      signals: signals.length,
      shipped: shipped.length,
      scan_findings: input.scanFindings?.length ?? 0,
      manual_notes: input.manualNotes?.length ?? 0,
      existing_pages: existingPages.length,
      active_clusters: activeClusters.length,
    },
    writesPlanned: [
      'brain_pages',
      'brain_page_versions',
      'brain_page_sources',
      'brain_chunks',
      'opportunity_clusters',
      'opportunity_cluster_sources',
    ],
  })

  try {
    const brainContextBlock = formatResolvedContextForPrompt(context)

    const prompt = buildPrompt({
      project,
      signals,
      shipped,
      scanFindings: input.scanFindings ?? [],
      manualNotes: input.manualNotes ?? [],
      existingPages,
      activeClusters,
      brainContextBlock,
      maxPageUpdates: input.maxPageUpdates ?? 6,
      maxClusterUpdates: input.maxClusterUpdates ?? 6,
    })

    const output = await callClaude<EnrichmentOutput>({
      prompt,
      system:
        'You are running the project-enrichment skill (docs/brain/skills/project-enrichment.md). Update the minimum set of project pages and opportunity clusters that the incoming evidence actually changes. File by product subject, not by source format. Prefer updating existing objects over creating new ones.',
      schema: ENRICHMENT_SCHEMA,
      schemaName: 'project_enrichment',
      schemaDescription:
        'Diarize signals, scans, and shipped changes into durable brain pages and opportunity clusters.',
      model: input.model ?? 'claude-sonnet-4-6',
      maxTokens: 8192,
    })

    // ---- apply page updates ------------------------------------------
    // v1.1 spec: project-enrichment is the authoritative writer for
    // brain_pages. Route through the shared helper so staleness cascades
    // identical to roadmap/prd/impact-review writebacks.
    const pageUpdates = (output.page_updates ?? []).filter(
      (update) => update.content_md && update.content_md.trim().length > 0,
    )
    const openQuestions: string[] = []
    for (const update of pageUpdates) {
      if (update.open_questions?.length) openQuestions.push(...update.open_questions)
    }

    const pageWriteResult = await applyPageUpdates(
      supabase,
      projectId,
      pageUpdates as unknown as PageUpdateInput[],
      { createdBy: 'project-enrichment', maxPages: input.maxPageUpdates ?? 6 },
    )

    const { pagesUpdated, versionsCreated, sourcesAttached, chunksWritten, staleMarked } =
      pageWriteResult
    if (pagesUpdated > 0) recordWriteCompleted(run, 'brain_pages')
    if (versionsCreated > 0) recordWriteCompleted(run, 'brain_page_versions')
    if (sourcesAttached > 0) recordWriteCompleted(run, 'brain_page_sources')
    if (chunksWritten > 0) recordWriteCompleted(run, 'brain_chunks')

    // ---- apply cluster updates ---------------------------------------
    const clusterUpdates = (output.cluster_updates ?? []).slice(
      0,
      input.maxClusterUpdates ?? 6,
    )
    const clustersTouched = await applyClusterUpdates({
      supabase,
      projectId,
      clusterUpdates,
      activeClusters,
    })
    if (clustersTouched > 0) recordWriteCompleted(run, 'opportunity_clusters')

    await completeBrainRun(supabase, run, {
      resultSummary: {
        pages_updated: pagesUpdated,
        versions_created: versionsCreated,
        sources_attached: sourcesAttached,
        chunks_written: chunksWritten,
        stale_marked: staleMarked,
        clusters_updated: clustersTouched,
        open_questions_count: openQuestions.length,
      },
    })

    return {
      pagesUpdated,
      versionsCreated,
      sourcesAttached,
      chunksWritten,
      clustersUpdated: clustersTouched,
      staleMarked,
      runId: run.id,
      openQuestions,
    }
  } catch (err) {
    await failBrainRun(supabase, run, err instanceof Error ? err : String(err))
    throw err
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

async function loadSignals(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  signalIds: string[] | undefined,
): Promise<SignalRow[]> {
  if (signalIds && signalIds.length > 0) {
    const { data } = await supabase.from('signals').select('*').in('id', signalIds)
    return (data ?? []) as SignalRow[]
  }
  const { data } = await supabase
    .from('signals')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(200)
  return (data ?? []) as SignalRow[]
}

async function loadShipped(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  shippedIds: string[] | undefined,
): Promise<ShippedChangeRow[]> {
  if (shippedIds && shippedIds.length > 0) {
    const { data } = await supabase.from('shipped_changes').select('*').in('id', shippedIds)
    return (data ?? []) as ShippedChangeRow[]
  }
  const { data } = await supabase
    .from('shipped_changes')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(25)
  return (data ?? []) as ShippedChangeRow[]
}

type PromptArgs = {
  project: { name: string; description: string | null; framework: string | null }
  signals: SignalRow[]
  shipped: ShippedChangeRow[]
  scanFindings: ScanFinding[]
  manualNotes: string[]
  existingPages: BrainPageRow[]
  activeClusters: OpportunityClusterRow[]
  brainContextBlock: string
  maxPageUpdates: number
  maxClusterUpdates: number
}

function buildPrompt(args: PromptArgs): string {
  const {
    project,
    signals,
    shipped,
    scanFindings,
    manualNotes,
    existingPages,
    activeClusters,
    brainContextBlock,
    maxPageUpdates,
    maxClusterUpdates,
  } = args

  const existingPageList =
    existingPages.length === 0
      ? '_No pages exist yet. Seed the minimum set the incoming evidence justifies._'
      : existingPages
          .map(
            (page) =>
              `- ${page.kind} \`${page.slug}\` (${page.status}, importance ${page.importance}, freshness ${page.freshness_score})`,
          )
          .join('\n')

  const activeClustersList =
    activeClusters.length === 0
      ? '_No active clusters yet._'
      : activeClusters
          .map(
            (cluster) =>
              `- \`${cluster.slug}\` — ${cluster.title} | need=${cluster.primary_need || 'n/a'} | theme=${cluster.theme || 'n/a'} | ev=${cluster.evidence_strength} fresh=${cluster.freshness_score}`,
          )
          .join('\n')

  const signalList = signals
    .slice(0, 80)
    .map((signal) => {
      const head = signal.title ? `${signal.title}` : ''
      return `- (${signal.type}) id=${signal.id} weight=${signal.weight} ${head} | ${signal.content.slice(0, 260)}`
    })
    .join('\n')

  const shippedList = shipped
    .slice(0, 15)
    .map((row) => {
      const pr = row.pr_number ? `#${row.pr_number}` : 'no-PR'
      return `- id=${row.id} ${pr} [${row.status}] ${row.approval_method} risk=${row.risk_score ?? 'n/a'}`
    })
    .join('\n') || '_none_'

  const scanFindingList =
    scanFindings.length === 0
      ? '_none_'
      : scanFindings
          .map(
            (finding) =>
              `- [${finding.severity ?? 'med'}] area=${finding.area} | ${finding.summary}`,
          )
          .join('\n')

  const notesBlock = manualNotes.length === 0 ? '_none_' : manualNotes.map((n) => `- ${n}`).join('\n')

  return `You are the project-enrichment skill. Follow docs/brain/skills/project-enrichment.md and obey the filing rules in docs/brain/skills/_filing-rules.md.

## Project
- Name: ${project.name}
- Description: ${project.description ?? 'No description'}
- Framework: ${project.framework ?? 'unknown'}

${brainContextBlock ? `${brainContextBlock}\n\n` : ''}## Existing Pages
${existingPageList}

## Active Opportunity Clusters (prefer updating over creating)
${activeClustersList}

## Incoming Signals (${signals.length} total, showing up to 80)
${signalList || '_none_'}

## Recent Shipped Changes
${shippedList}

## Scan Findings
${scanFindingList}

## Manual Notes
${notesBlock}

## Procedure (summarized; see the skill file for detail)
1. Scope which pages and clusters can actually change from this evidence. Do NOT touch pages that are unaffected.
2. Diarize: contradictions, repeated pain, repo facts, new risks, shifts in dominant need.
3. Update the MINIMUM set of pages (cap: ${maxPageUpdates}) and clusters (cap: ${maxClusterUpdates}) needed.
4. Reuse existing slug+kind combinations whenever possible. Create a new page only when the evidence is durable AND there is no existing page that covers it.
5. For each page update, provide: \`kind\`, stable \`slug\`, \`title\`, one-paragraph \`summary\`, full \`content_md\`, \`key_facts\`, \`open_questions\`, a short \`change_summary\`, and \`sources\` with exact signal/shipped ids when citable.
6. Mark a page \`stale\` only if the new evidence contradicts its current truth; include \`stale_reason\`.
7. Attach signals to existing clusters via \`attach_signal_ids\`. Create a new cluster ONLY if the filing rules justify it.
8. If nothing durable changed, return empty \`page_updates\` and \`cluster_updates\`.`
}

async function applyClusterUpdates(args: {
  supabase: ReturnType<typeof createAdminClient>
  projectId: string
  clusterUpdates: ClusterUpdateOutput[]
  activeClusters: OpportunityClusterRow[]
}): Promise<number> {
  const { supabase, projectId, clusterUpdates, activeClusters } = args
  if (clusterUpdates.length === 0) return 0
  const bySlug = new Map(activeClusters.map((c) => [c.slug, c]))
  let touched = 0

  for (const update of clusterUpdates) {
    const existing = bySlug.get(update.slug)
    const now = new Date().toISOString()

    let clusterId: string | null = null
    if (existing) {
      const { data } = await supabase
        .from('opportunity_clusters')
        .update({
          title: update.title ?? existing.title,
          theme: update.theme ?? existing.theme,
          primary_need: update.primary_need ?? existing.primary_need,
          need_vector: update.need_vector ?? existing.need_vector,
          latest_brief_md: update.latest_brief_md ?? existing.latest_brief_md,
          status: update.status ?? existing.status,
          last_refreshed_at: now,
        })
        .eq('id', existing.id)
        .select('id')
        .single()
      clusterId = (data as { id: string } | null)?.id ?? existing.id
    } else {
      const { data } = await supabase
        .from('opportunity_clusters')
        .insert({
          project_id: projectId,
          slug: update.slug,
          title: update.title ?? update.slug,
          theme: update.theme ?? '',
          primary_need: update.primary_need ?? '',
          need_vector: update.need_vector ?? {},
          latest_brief_md: update.latest_brief_md ?? '',
          status: update.status ?? 'active',
          last_refreshed_at: now,
        })
        .select('id')
        .single()
      clusterId = (data as { id: string } | null)?.id ?? null
    }

    if (!clusterId) continue
    touched += 1

    if (update.attach_signal_ids && update.attach_signal_ids.length > 0) {
      const inserts: OpportunityClusterSourceInsert[] = update.attach_signal_ids.map(
        (signalId) => ({
          cluster_id: clusterId as string,
          source_kind: 'signal',
          signal_id: signalId,
          citation: '',
          weight: 1,
          polarity: 'supports',
        }),
      )
      await supabase.from('opportunity_cluster_sources').insert(inserts)
      await supabase
        .from('opportunity_clusters')
        .update({ last_signal_at: now })
        .eq('id', clusterId)
    }
  }

  return touched
}
