import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  FunnelAnomalyRow,
  FunnelStopRow,
  ProjectSettingsRow,
} from '@/lib/types/database'

import { FOCUS_MODES, type FocusMode } from './design'

/**
 * Auto-derive `current_focus` from funnel state.
 *
 * Without this, every project starts with no focus mode and ranking is
 * neutral (alignment 0.5 everywhere). The user has to manually open the
 * settings page and pick. Auto-focus removes that step:
 *
 *   - Bottom-of-funnel rate drop  → focus = conversion
 *   - Spike in error / failure events → focus = ux_quality
 *   - Repeat-visit / engagement decline → focus = retention
 *   - New-channel acquisition spike (top funnel) → focus = virality
 *   - Slow page / count drop on top events → focus = performance
 *
 * Picks one mode (the one with the strongest evidence) and records why.
 * Pure decision logic; the runner wraps it with DB I/O.
 */

export type AutoFocusEvidence = {
  bottomFunnelDropMag: number
  errorSpikeMag: number
  retentionDeclineMag: number
  topFunnelDropMag: number
  topFunnelSpikeMag: number
}

export type AutoFocusDecision = {
  mode: FocusMode['name']
  confidence: number
  reason: string
  evidence: AutoFocusEvidence
  topAnomalies: Array<{ event: string; kind: string; deltaPct: number; severity: number }>
}

export type AutoFocusOptions = {
  /** Override the existing setting even if it was set manually. Default false. */
  overrideManual?: boolean
  /** Skip writing; just return the decision. */
  dryRun?: boolean
  /** Window in days to consider for evidence. Default 14. */
  windowDays?: number
}

const MAGNITUDE_FLOOR = 0.05 // ignore anomalies below 5% delta

/**
 * Pure focus decision. Takes the rolled-up funnel state + recent anomalies
 * and picks one focus mode.
 */
export function decideFocus(
  stops: FunnelStopRow[],
  anomalies: FunnelAnomalyRow[],
): AutoFocusDecision {
  const evidence: AutoFocusEvidence = {
    bottomFunnelDropMag: 0,
    errorSpikeMag: 0,
    retentionDeclineMag: 0,
    topFunnelDropMag: 0,
    topFunnelSpikeMag: 0,
  }

  const stopByEvent = new Map<string, FunnelStopRow>()
  for (const stop of stops) stopByEvent.set(stop.event_name, stop)

  const considered: AutoFocusDecision['topAnomalies'] = []

  for (const anomaly of anomalies) {
    if (anomaly.status !== 'open' && anomaly.status !== 'acknowledged') continue
    const stop = stops.find((s) => s.id === anomaly.funnel_stop_id)
    if (!stop) continue

    const mag = Math.abs(Number(anomaly.delta_pct))
    if (mag < MAGNITUDE_FLOOR) continue
    const weighted = mag * anomaly.severity

    considered.push({
      event: stop.event_name,
      kind: anomaly.kind,
      deltaPct: Number(anomaly.delta_pct),
      severity: anomaly.severity,
    })

    const isDrop =
      anomaly.kind === 'rate_drop' ||
      anomaly.kind === 'count_drop' ||
      Number(anomaly.delta_pct) < 0
    const isSpike =
      anomaly.kind === 'rate_spike' ||
      anomaly.kind === 'count_spike' ||
      Number(anomaly.delta_pct) > 0

    if (stop.funnel_role === 'bottom' && isDrop) {
      evidence.bottomFunnelDropMag += weighted
      continue
    }
    if (stop.funnel_role === 'error' && isSpike) {
      evidence.errorSpikeMag += weighted
      continue
    }
    if (stop.funnel_role === 'engagement' && isDrop) {
      evidence.retentionDeclineMag += weighted
      continue
    }
    if (stop.funnel_role === 'top' && isDrop) {
      evidence.topFunnelDropMag += weighted
      continue
    }
    if (stop.funnel_role === 'top' && isSpike) {
      evidence.topFunnelSpikeMag += weighted
      continue
    }
  }

  // Decision matrix.
  const buckets: Array<{ mode: FocusMode['name']; weight: number; rationale: string }> = [
    {
      mode: 'conversion',
      weight: evidence.bottomFunnelDropMag,
      rationale: 'Bottom-of-funnel conversion is dropping; prioritize converting existing visitors.',
    },
    {
      mode: 'ux_quality',
      weight: evidence.errorSpikeMag,
      rationale: 'Errors and validation failures are spiking; prioritize fixing felt quality.',
    },
    {
      mode: 'retention',
      weight: evidence.retentionDeclineMag,
      rationale: 'Repeat-visit / engagement is declining; prioritize keeping users coming back.',
    },
    {
      mode: 'performance',
      weight: evidence.topFunnelDropMag,
      rationale: 'Top-of-funnel volume is falling; prioritize the reliability that holds traffic.',
    },
    {
      mode: 'virality',
      weight: evidence.topFunnelSpikeMag,
      rationale: 'Top-of-funnel volume is spiking; lean into the channel and amplify it.',
    },
  ]

  buckets.sort((a, b) => b.weight - a.weight)
  const top = buckets[0]
  const total = buckets.reduce((sum, b) => sum + b.weight, 0)

  // No meaningful evidence: default to conversion (most landing pages need it).
  if (total === 0 || top.weight === 0) {
    return {
      mode: 'conversion',
      confidence: 0.4,
      reason: 'No fresh anomalies; defaulting to `conversion` (typical landing-page baseline).',
      evidence,
      topAnomalies: considered.slice(0, 5),
    }
  }

  const confidence = Math.min(0.95, 0.4 + (top.weight / total) * 0.55)

  return {
    mode: top.mode,
    confidence,
    reason: top.rationale,
    evidence,
    topAnomalies: considered
      .sort((a, b) => Math.abs(b.deltaPct) * b.severity - Math.abs(a.deltaPct) * a.severity)
      .slice(0, 5),
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export type AutoFocusResult = {
  projectId: string
  decision: AutoFocusDecision
  applied: boolean
  reason: string
  previousMode: string | null
  brainPageId: string | null
}

/**
 * Run auto-focus for a single project. Reads `funnel_stops` + recent
 * `funnel_anomalies`, calls `decideFocus`, and (unless dryRun) upserts the
 * `current_focus` brain page using the same mechanism the picker uses.
 *
 * Skips writing when `overrideManual` is false and the existing focus page
 * was last edited by a real user (created_by != 'auto-focus' on the
 * latest version). The picker writes `created_by = 'user:<id>'` while the
 * cron writes `created_by = 'auto-focus'`, so this distinguishes them.
 */
export async function runAutoFocus(
  supabase: SupabaseClient,
  projectId: string,
  options: AutoFocusOptions = {},
): Promise<AutoFocusResult> {
  const windowDays = options.windowDays ?? 14
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  const [stopsRes, anomaliesRes] = await Promise.all([
    supabase.from('funnel_stops').select('*').eq('project_id', projectId),
    supabase
      .from('funnel_anomalies')
      .select('*')
      .eq('project_id', projectId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const stops = (stopsRes.data ?? []) as FunnelStopRow[]
  const anomalies = (anomaliesRes.data ?? []) as FunnelAnomalyRow[]

  const decision = decideFocus(stops, anomalies)

  // Existing focus page (if any).
  const { data: existingFocus } = await supabase
    .from('brain_pages')
    .select('id, slug, status, updated_at')
    .eq('project_id', projectId)
    .eq('kind', 'current_focus')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const previousMode =
    (existingFocus as { slug: string } | null)?.slug ?? null

  // If a manual user already set this, don't override unless asked.
  let isManual = false
  if (existingFocus) {
    const { data: latestVersion } = await supabase
      .from('brain_page_versions')
      .select('created_by')
      .eq('page_id', (existingFocus as { id: string }).id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    isManual = ((latestVersion as { created_by?: string } | null)?.created_by ?? '').startsWith('user:')
  }

  if (isManual && !options.overrideManual) {
    return {
      projectId,
      decision,
      applied: false,
      reason: 'Existing current_focus was set manually; not overriding.',
      previousMode,
      brainPageId: (existingFocus as { id: string } | null)?.id ?? null,
    }
  }

  if (previousMode === decision.mode) {
    return {
      projectId,
      decision,
      applied: false,
      reason: `Focus is already ${decision.mode}; no change needed.`,
      previousMode,
      brainPageId: (existingFocus as { id: string } | null)?.id ?? null,
    }
  }

  if (options.dryRun) {
    return {
      projectId,
      decision,
      applied: false,
      reason: 'dryRun=true',
      previousMode,
      brainPageId: (existingFocus as { id: string } | null)?.id ?? null,
    }
  }

  // Apply: archive old focus pages with a different slug, then upsert.
  const now = new Date().toISOString()

  const { data: activePages } = await supabase
    .from('brain_pages')
    .select('id, slug')
    .eq('project_id', projectId)
    .eq('kind', 'current_focus')
    .eq('status', 'active')
  for (const row of (activePages ?? []) as Array<{ id: string; slug: string }>) {
    if (row.slug === decision.mode) continue
    await supabase
      .from('brain_pages')
      .update({ status: 'archived', stale_reason: `superseded by auto-focus=${decision.mode}` })
      .eq('id', row.id)
  }

  let pageId: string | null = null
  const { data: existingForMode } = await supabase
    .from('brain_pages')
    .select('id')
    .eq('project_id', projectId)
    .eq('kind', 'current_focus')
    .eq('slug', decision.mode)
    .maybeSingle()
  if (existingForMode) {
    pageId = (existingForMode as { id: string }).id
    await supabase
      .from('brain_pages')
      .update({
        status: 'active',
        importance: 95,
        freshness_score: 100,
        stale_reason: null,
        title: `Current Focus — ${decision.mode}`,
        summary: decision.reason,
      })
      .eq('id', pageId)
  } else {
    const { data: inserted } = await supabase
      .from('brain_pages')
      .insert({
        project_id: projectId,
        slug: decision.mode,
        kind: 'current_focus',
        title: `Current Focus — ${decision.mode}`,
        summary: decision.reason,
        status: 'active',
        importance: 95,
        freshness_score: 100,
      })
      .select('id')
      .single()
    pageId = (inserted as { id: string } | null)?.id ?? null
  }

  if (!pageId) {
    return {
      projectId,
      decision,
      applied: false,
      reason: 'Failed to upsert current_focus page',
      previousMode,
      brainPageId: null,
    }
  }

  const mode = FOCUS_MODES.find((m) => m.name === decision.mode)
  const content = `# Current Focus — ${decision.mode}\n\n## Auto-derived from funnel anomalies\n${decision.reason}\n\nConfidence: ${(decision.confidence * 100).toFixed(0)}%.\n\n## Top recent anomalies\n${decision.topAnomalies
    .map(
      (a) =>
        `- ${a.event} · ${a.kind} · Δ ${(a.deltaPct * 100).toFixed(1)}% · severity ${a.severity}`,
    )
    .join('\n') || '- (none)'}\n\n## Mode\n${mode?.description ?? ''}\n\nRaises: ${mode?.raises.join(', ') ?? ''}\nLowers: ${mode?.lowers.join(', ') ?? ''}\n\n_Auto-generated at ${now}. The picker (PUT /api/projects/${projectId}/focus) overrides this._`

  // Append a new version.
  const { data: latestVersion } = await supabase
    .from('brain_page_versions')
    .select('version')
    .eq('page_id', pageId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = ((latestVersion as { version: number } | null)?.version ?? 0) + 1

  await supabase.from('brain_page_versions').insert({
    page_id: pageId,
    version: nextVersion,
    content_md: content,
    outline: [],
    key_facts: [
      `mode=${decision.mode}`,
      `confidence=${decision.confidence.toFixed(2)}`,
      ...decision.topAnomalies.slice(0, 3).map((a) => `top_anomaly=${a.event}:${a.kind}`),
    ],
    open_questions: [],
    change_summary: `Auto-focus → ${decision.mode}: ${decision.reason}`,
    compiled_from: { skill: 'auto-focus' },
    created_by: 'auto-focus',
  })

  // Sync the legacy roi focus too so the existing UI reflects it.
  const legacyMap: Partial<Record<FocusMode['name'], ProjectSettingsRow['automation_roi_focus']>> = {
    conversion: 'revenue',
    ux_quality: 'ux',
    retention: 'retention',
    virality: 'reach',
    performance: 'effort',
  }
  const legacy = legacyMap[decision.mode]
  if (legacy) {
    await supabase
      .from('project_settings')
      .update({ automation_roi_focus: legacy })
      .eq('project_id', projectId)
  }

  return {
    projectId,
    decision,
    applied: true,
    reason: `Set focus to ${decision.mode} (was ${previousMode ?? 'unset'}).`,
    previousMode,
    brainPageId: pageId,
  }
}
