export type BrainTaskType =
  | 'generate_roadmap'
  | 'generate_prd'
  | 'scan_codebase'
  | 'implement_roadmap_item'
  | 'review_pr'
  | 'measure_impact'
  | 'audit_resolver'

export type BrainPageKind =
  | 'current_focus'
  | 'project_overview'
  | 'user_pain_map'
  | 'product_constraints'
  | 'repo_map'
  | 'implementation_patterns'
  | 'open_decisions'
  | 'active_experiments'
  | 'release_notes'
  | 'safety_rules'
  | 'metric_definitions'

export type BrainTable = {
  name: string
  purpose: string
  columns: string[]
  phase: 'v1-core' | 'v1.1-spec'
}

export type BrainSkill = {
  slug: string
  name: string
  description: string
  taskType: BrainTaskType
  filePath: string
  inputParameters: string[]
  writes: string[]
}

export type ResolverRule = {
  taskType: BrainTaskType
  pageKind: BrainPageKind
  priority: number
  required: boolean
  reason: string
}

export type TaskBlueprint = {
  taskType: BrainTaskType
  name: string
  goal: string
  reads: string[]
  deterministicStages: string[]
  latentStages: string[]
  writes: string[]
  changedFromToday: string[]
}

export type ResolverLayer = {
  name: string
  where: string
  purpose: string
  protectsAgainst: string
}

export type FocusMode = {
  name: string
  description: string
  raises: string[]
  lowers: string[]
}

export type BacklogLayer = {
  name: string
  role: string
  countGuidance: string
  updatePolicy: string
}

export const BRAIN_TABLES: BrainTable[] = [
  {
    name: 'brain_pages',
    purpose: 'Canonical project truths that sit between raw signals and generated artifacts.',
    columns: [
      'project_id',
      'slug',
      'kind',
      'title',
      'summary',
      'status',
      'importance',
      'freshness_score',
      'stale_reason',
      'metadata',
    ],
    phase: 'v1-core',
  },
  {
    name: 'brain_page_versions',
    purpose: 'Append-only snapshots of each compiled page so the model can learn without losing history.',
    columns: [
      'page_id',
      'version',
      'content_md',
      'outline',
      'key_facts',
      'open_questions',
      'change_summary',
      'compiled_from',
    ],
    phase: 'v1-core',
  },
  {
    name: 'brain_page_sources',
    purpose: 'Attribution graph from a page back to signals, roadmap items, shipped changes, and scan findings.',
    columns: [
      'page_id',
      'page_version_id',
      'source_kind',
      'signal_id',
      'roadmap_item_id',
      'shipped_change_id',
      'citation',
      'weight',
      'excerpt',
    ],
    phase: 'v1-core',
  },
  {
    name: 'brain_chunks',
    purpose: 'Chunked retrieval surface for keyword and later semantic search over compiled pages.',
    columns: [
      'page_id',
      'page_version_id',
      'chunk_index',
      'content',
      'token_estimate',
      'metadata',
    ],
    phase: 'v1-core',
  },
  {
    name: 'brain_skill_files',
    purpose: 'Versioned fat-skill registry with markdown procedures instead of prompt strings hidden in code.',
    columns: [
      'slug',
      'name',
      'description',
      'task_type',
      'content_md',
      'input_schema',
      'status',
    ],
    phase: 'v1-core',
  },
  {
    name: 'brain_resolver_rules',
    purpose: 'Task-specific context rules that keep prompts small and make the dominant-need policy explicit.',
    columns: ['task_type', 'page_kind', 'priority', 'required', 'reason'],
    phase: 'v1-core',
  },
  {
    name: 'brain_runs',
    purpose: 'Audit log for every skill invocation, what context it resolved, and what it wrote back.',
    columns: [
      'project_id',
      'task_type',
      'skill_slug',
      'status',
      'resolved_context',
      'input_summary',
      'result_summary',
      'writes_planned',
      'writes_completed',
    ],
    phase: 'v1-core',
  },
  {
    name: 'opportunity_clusters',
    purpose: 'Canonical long-backlog objects that group repeated evidence by theme and current product need.',
    columns: [
      'project_id',
      'slug',
      'title',
      'theme',
      'primary_need',
      'need_vector',
      'evidence_strength',
      'freshness_score',
      'confidence_score',
      'effort_score',
      'status',
      'latest_brief_md',
    ],
    phase: 'v1.1-spec',
  },
  {
    name: 'opportunity_cluster_sources',
    purpose: 'Source graph for why a cluster exists and which signals, pages, and roadmap rows support it.',
    columns: [
      'cluster_id',
      'source_kind',
      'signal_id',
      'brain_page_id',
      'roadmap_item_id',
      'weight',
      'excerpt',
    ],
    phase: 'v1.1-spec',
  },
  {
    name: 'resolver_triggers',
    purpose: 'Explicit trigger table for skill routing, escalation priority, and overlap management.',
    columns: [
      'resolver_type',
      'trigger_phrase',
      'target_skill_slug',
      'priority',
      'fallback_skill_slug',
      'notes',
    ],
    phase: 'v1.1-spec',
  },
  {
    name: 'resolver_audits',
    purpose: 'Reachability and trigger-eval output so dark skills and routing drift are visible before users hit them.',
    columns: [
      'project_id',
      'audit_type',
      'window_start',
      'window_end',
      'issues_found',
      'suggested_fixes',
      'applied_changes',
    ],
    phase: 'v1.1-spec',
  },
]

export const BRAIN_SKILLS: BrainSkill[] = [
  {
    slug: 'project-enrichment',
    name: 'Project Enrichment',
    description: 'Continuously converts raw signals, scans, and shipped changes into durable pages and opportunity clusters.',
    taskType: 'scan_codebase',
    filePath: 'docs/brain/skills/project-enrichment.md',
    inputParameters: ['PROJECT_ID', 'SIGNAL_BATCH', 'SCAN_FINDINGS', 'RECENT_SHIPS'],
    writes: [
      'brain_pages',
      'brain_page_versions',
      'brain_page_sources',
      'brain_chunks',
      'opportunity_clusters',
      'opportunity_cluster_sources',
    ],
  },
  {
    slug: 'roadmap-synthesis',
    name: 'Roadmap Synthesis',
    description: 'Maintains a long backlog of opportunity clusters and refreshes the ranked roadmap slice under the current dominant need.',
    taskType: 'generate_roadmap',
    filePath: 'docs/brain/skills/roadmap-synthesis.md',
    inputParameters: ['PROJECT_ID', 'CURRENT_FOCUS', 'CHANGED_CLUSTER_WINDOW'],
    writes: ['brain_runs', 'opportunity_clusters', 'roadmap_items', 'brain_page_versions'],
  },
  {
    slug: 'prd-author',
    name: 'PRD Author',
    description: 'Expands a selected cluster and roadmap item into an implementation-ready PRD with repo-specific context.',
    taskType: 'generate_prd',
    filePath: 'docs/brain/skills/prd-author.md',
    inputParameters: ['PROJECT_ID', 'OPPORTUNITY_CLUSTER_ID', 'ROADMAP_ITEM_ID', 'USER_FEEDBACK'],
    writes: ['brain_runs', 'roadmap_items.prd_content', 'brain_page_versions'],
  },
  {
    slug: 'implementation-brief',
    name: 'Implementation Brief',
    description: 'Turns an approved PRD into a deterministic execution packet for Claude Code or another coding agent.',
    taskType: 'implement_roadmap_item',
    filePath: 'docs/brain/skills/implementation-brief.md',
    inputParameters: ['PROJECT_ID', 'ROADMAP_ITEM_ID', 'PRD_CONTENT', 'APPROVAL_MODE'],
    writes: ['brain_runs', 'build_jobs'],
  },
  {
    slug: 'impact-review',
    name: 'Impact Review',
    description: 'Measures shipped outcomes against forecasts, updates cluster scores, and proposes resolver or skill changes.',
    taskType: 'measure_impact',
    filePath: 'docs/brain/skills/impact-review.md',
    inputParameters: ['PROJECT_ID', 'OPPORTUNITY_CLUSTER_ID', 'ROADMAP_ITEM_ID', 'ACTUAL_METRICS'],
    writes: [
      'brain_runs',
      'opportunity_clusters',
      'brain_page_versions',
      'brain_skill_files',
      'brain_resolver_rules',
    ],
  },
  {
    slug: 'check-resolvable',
    name: 'Check Resolvable',
    description: 'Audits whether every skill, trigger, and codepath is reachable from the resolver and still matches real traffic.',
    taskType: 'audit_resolver',
    filePath: 'docs/brain/skills/check-resolvable.md',
    inputParameters: ['PROJECT_ID', 'RESOLVER_TRAFFIC_WINDOW', 'SKILL_REGISTRY'],
    writes: ['brain_runs', 'resolver_audits', 'brain_resolver_rules'],
  },
]

export const RESOLVER_RULES: ResolverRule[] = [
  {
    taskType: 'generate_roadmap',
    pageKind: 'current_focus',
    priority: 5,
    required: true,
    reason: 'Roadmap ranking should start with the dominant need of the product right now, not a generic ROI prompt.',
  },
  {
    taskType: 'generate_roadmap',
    pageKind: 'project_overview',
    priority: 10,
    required: true,
    reason: 'Anchor the roadmap in the project’s current goals, scope, and product stage.',
  },
  {
    taskType: 'generate_roadmap',
    pageKind: 'user_pain_map',
    priority: 20,
    required: true,
    reason: 'Repeated user pain should outrank isolated raw signal snippets.',
  },
  {
    taskType: 'generate_roadmap',
    pageKind: 'active_experiments',
    priority: 30,
    required: true,
    reason: 'Avoid duplicating ideas that are already being measured or rolled out.',
  },
  {
    taskType: 'generate_roadmap',
    pageKind: 'open_decisions',
    priority: 40,
    required: true,
    reason: 'A roadmap item should not violate unresolved product or technical decisions.',
  },
  {
    taskType: 'generate_roadmap',
    pageKind: 'release_notes',
    priority: 50,
    required: false,
    reason: 'Recent shipped work helps distinguish regressions from already-addressed pain.',
  },
  {
    taskType: 'generate_prd',
    pageKind: 'project_overview',
    priority: 10,
    required: true,
    reason: 'The PRD needs a stable product frame before it starts specifying work.',
  },
  {
    taskType: 'generate_prd',
    pageKind: 'current_focus',
    priority: 15,
    required: false,
    reason: 'The PRD should preserve why this item matters now, especially when the roadmap is a long backlog.',
  },
  {
    taskType: 'generate_prd',
    pageKind: 'repo_map',
    priority: 20,
    required: true,
    reason: 'File-level plans should come from a maintained repo map rather than ad hoc guesses.',
  },
  {
    taskType: 'generate_prd',
    pageKind: 'implementation_patterns',
    priority: 30,
    required: true,
    reason: 'PRDs should reflect known conventions, test patterns, and deployment constraints.',
  },
  {
    taskType: 'generate_prd',
    pageKind: 'safety_rules',
    priority: 40,
    required: true,
    reason: 'Guardrails belong in deterministic context, not improvised inside the prompt body.',
  },
  {
    taskType: 'generate_prd',
    pageKind: 'metric_definitions',
    priority: 50,
    required: false,
    reason: 'Success metrics should use the canonical names and instrumentation rules.',
  },
  {
    taskType: 'implement_roadmap_item',
    pageKind: 'repo_map',
    priority: 10,
    required: true,
    reason: 'Implementation should load the narrowest possible repo context first.',
  },
  {
    taskType: 'implement_roadmap_item',
    pageKind: 'safety_rules',
    priority: 20,
    required: true,
    reason: 'Execution packets should always include blocked paths, test requirements, and blast-radius caps.',
  },
  {
    taskType: 'measure_impact',
    pageKind: 'current_focus',
    priority: 5,
    required: false,
    reason: 'Reviewing outcomes against the active focus helps explain why an item was promoted and whether that was still right.',
  },
  {
    taskType: 'measure_impact',
    pageKind: 'metric_definitions',
    priority: 10,
    required: true,
    reason: 'Impact reviews are only meaningful if the metric names and collection rules are consistent.',
  },
  {
    taskType: 'measure_impact',
    pageKind: 'active_experiments',
    priority: 20,
    required: true,
    reason: 'The learning loop needs experiment status, forecast deltas, and unresolved questions.',
  },
]

export const RESOLVER_LAYERS: ResolverLayer[] = [
  {
    name: 'Skill Resolver',
    where: 'AGENTS.md + resolver_triggers',
    purpose: 'Maps user requests, cron jobs, and webhook events to the right skill with explicit trigger phrases and fallbacks.',
    protectsAgainst: 'Dark capabilities, overlapping triggers, and “the skill exists but nothing can call it.”',
  },
  {
    name: 'Filing Resolver',
    where: 'docs/brain/RESOLVER.md + skills/_filing-rules.md',
    purpose: 'Decides whether new evidence updates a page, strengthens an opportunity cluster, or creates something net new.',
    protectsAgainst: 'Backlog junk drawers, misfiled evidence, and one-off skill-specific filing logic.',
  },
  {
    name: 'Context Resolver',
    where: 'brain_resolver_rules',
    purpose: 'Loads the smallest correct context set for each task, with current focus first for roadmap work.',
    protectsAgainst: '20,000-line prompt sprawl, stale assumptions, and irrelevant context bloat.',
  },
  {
    name: 'Action Resolver',
    where: 'runtime policy + approval rules',
    purpose: 'Turns state changes into the next action: rerank only, refresh a brief, draft a PRD, queue implementation, or ask for approval.',
    protectsAgainst: 'Over-automation, unsafe escalation, and agents skipping straight from evidence to execution.',
  },
]

export const FOCUS_MODES: FocusMode[] = [
  {
    name: 'ux_quality',
    description: 'Reduce friction, clarify flows, and improve the felt quality of the product.',
    raises: ['navigation clarity', 'error recovery', 'onboarding friction', 'dead-end screens'],
    lowers: ['large speculative feature bets', 'non-blocking infra work'],
  },
  {
    name: 'conversion',
    description: 'Improve visitor-to-signup or signup-to-paid conversion in the current funnel.',
    raises: ['landing clarity', 'pricing friction', 'CTA visibility', 'signup drop-off'],
    lowers: ['engagement loops with no funnel tie', 'low-impact cosmetic polish'],
  },
  {
    name: 'virality',
    description: 'Increase referral loops, sharing, and user-generated acquisition.',
    raises: ['sharing surfaces', 'invite loops', 'social proof', 'network effects'],
    lowers: ['internal tooling improvements', 'isolated retention fixes'],
  },
  {
    name: 'performance',
    description: 'Reduce latency, errors, and operational drag that blocks product quality or conversion.',
    raises: ['load time', 'crash rate', 'render blocking', 'backend reliability'],
    lowers: ['nice-to-have feature work', 'long-tail content ideas'],
  },
  {
    name: 'retention',
    description: 'Increase repeat usage, habit formation, and long-term value after activation.',
    raises: ['re-engagement hooks', 'time-to-value', 'churn reasons', 'unfinished loops'],
    lowers: ['top-of-funnel only experiments', 'one-time launch mechanics'],
  },
]

export const BACKLOG_LAYERS: BacklogLayer[] = [
  {
    name: 'Signals',
    role: 'Raw evidence from feedback, analytics, support, scans, and shipped outcomes.',
    countGuidance: 'Unbounded append-only log.',
    updatePolicy: 'Never rank directly. First route through the filing resolver.',
  },
  {
    name: 'Opportunity Clusters',
    role: 'Canonical long backlog grouped by theme and dominant need.',
    countGuidance: 'Roughly 50-200 active clusters depending on product scale.',
    updatePolicy: 'Default action is merge/refresh. Creating a new cluster should be rarer than attaching to an existing one.',
  },
  {
    name: 'Ranked Roadmap',
    role: 'Focus-weighted slice of the long backlog that the team can actually review.',
    countGuidance: 'Usually 10-25 live items.',
    updatePolicy: 'Recomputed whenever focus changes or changed clusters materially move.',
  },
  {
    name: 'Now / Next',
    role: 'Execution shortlist with PRDs, approvals, and implementation packets.',
    countGuidance: 'Usually 1-5 active bets.',
    updatePolicy: 'Human or policy-gated promotion only.',
  },
]

export const TASK_BLUEPRINTS: Record<BrainTaskType, TaskBlueprint> = {
  generate_roadmap: {
    taskType: 'generate_roadmap',
    name: 'Roadmap Synthesis',
    goal: 'Maintain a long backlog of opportunity clusters and refresh the ranked roadmap slice under the current dominant need.',
    reads: [
      'brain_pages',
      'brain_page_versions',
      'brain_page_sources',
      'opportunity_clusters',
      'signals',
      'roadmap_items',
    ],
    deterministicStages: [
      'Resolve current_focus, project_overview, user_pain_map, active_experiments, open_decisions, and release_notes.',
      'Run the filing resolver on fresh signals: attach to an existing cluster, create a new cluster, or mark a page stale.',
      'Compute evidence strength, freshness, confidence, effort, and focus-weighted ranking outside the model.',
      'Refresh only changed clusters and the selected roadmap slice instead of regenerating every brief in the backlog.',
    ],
    latentStages: [
      'Read only the changed or highest-uncertainty clusters in full.',
      'Refresh the cluster brief, explain why it matters now, and propose the right next action.',
      'Update affected pages with changed truths, contradictions, and open questions.',
    ],
    writes: [
      'brain_runs',
      'opportunity_clusters',
      'roadmap_items',
      'brain_page_versions',
      'brain_page_sources',
    ],
    changedFromToday: [
      'Stops treating every batch of signals as a source of brand-new briefs.',
      'Makes current_focus a first-class routing input instead of a loose prompt instruction.',
      'Turns roadmap_items into a ranked projection over the long backlog, not the memory layer itself.',
    ],
  },
  generate_prd: {
    taskType: 'generate_prd',
    name: 'PRD Author',
    goal: 'Expand a selected opportunity cluster into a repo-aware PRD grounded in canonical product and code context.',
    reads: [
      'roadmap_items',
      'opportunity_clusters',
      'brain_pages',
      'brain_page_versions',
      'brain_resolver_rules',
      'shipped_changes',
    ],
    deterministicStages: [
      'Resolve project overview, current focus, repo map, safety rules, and recent shipped changes.',
      'Load the chosen cluster, selected roadmap item, canonical metrics, and known constraints as separate inputs.',
      'Persist the run log, citations, and final PRD writeback independently of model output.',
    ],
    latentStages: [
      'Interpret how the cluster fits the current strategy and repo shape.',
      'Draft acceptance criteria, rollout notes, experiments, and file-level implementation guidance.',
      'Identify what new truth the PRD should write back to memory.',
    ],
    writes: [
      'brain_runs',
      'roadmap_items.prd_content',
      'brain_page_versions',
      'brain_page_sources',
    ],
    changedFromToday: [
      'No longer relies only on evidence_trail and thinking_traces stored on the roadmap row.',
      'Carries forward why-now context from the active focus mode.',
      'Creates a traceable run record and page updates after PRD generation.',
    ],
  },
  scan_codebase: {
    taskType: 'scan_codebase',
    name: 'Project Enrichment',
    goal: 'Convert scans, commits, and feedback into continuously maintained pages and opportunity clusters.',
    reads: ['signals', 'shipped_changes', 'projects', 'docs/brain/RESOLVER.md'],
    deterministicStages: [
      'Collect new scans, repository facts, and raw signals since the last enrichment run.',
      'Consult the filing resolver and filing-rules doc before creating any new page or cluster.',
      'Map incoming evidence to the minimum set of pages and clusters that can change.',
    ],
    latentStages: [
      'Diarize repository and product state into durable summaries.',
      'Write changed truths, contradictions, repeated pain, and open questions into the right pages and clusters.',
    ],
    writes: [
      'brain_runs',
      'brain_pages',
      'brain_page_versions',
      'brain_page_sources',
      'brain_chunks',
      'opportunity_clusters',
      'opportunity_cluster_sources',
    ],
    changedFromToday: [
      'Introduces a filing resolver so enrichments do not invent their own storage logic.',
      'Creates or refreshes long-backlog clusters instead of bouncing findings straight into a flat brief list.',
    ],
  },
  implement_roadmap_item: {
    taskType: 'implement_roadmap_item',
    name: 'Implementation Brief',
    goal: 'Prepare a thin, deterministic execution packet for the coding agent after explicit approval.',
    reads: [
      'roadmap_items',
      'opportunity_clusters',
      'brain_pages',
      'brain_page_versions',
      'project_settings',
    ],
    deterministicStages: [
      'Load the PRD, repo map, test requirements, blocked paths, and approval policy.',
      'Generate a structured build payload that the worker can execute without rethinking product intent.',
    ],
    latentStages: [
      'Only summarize the minimal intent that the coding agent needs to keep context tight.',
    ],
    writes: ['brain_runs', 'build_jobs'],
    changedFromToday: [
      'Replaces freeform job prompts with a reproducible execution packet and narrower context.',
      'Makes the action resolver explicit: not every refreshed brief should become implementation work.',
    ],
  },
  review_pr: {
    taskType: 'review_pr',
    name: 'PR Review',
    goal: 'Separate deterministic blast-radius checks from latent code review judgment.',
    reads: ['project_settings', 'brain_pages', 'brain_page_versions', 'shipped_changes'],
    deterministicStages: [
      'Compute file/path/test risk mechanically.',
      'Load only the relevant safety and implementation-pattern pages for semantic review.',
    ],
    latentStages: [
      'Judge correctness, regression risk, and code quality with page-backed context.',
    ],
    writes: ['brain_runs'],
    changedFromToday: [
      'Lets semantic review see project-specific constraints without bloating the main approval prompt.',
    ],
  },
  measure_impact: {
    taskType: 'measure_impact',
    name: 'Impact Review',
    goal: 'Compare predicted outcomes against actuals, update cluster scores, and feed the delta back into the system.',
    reads: [
      'roadmap_items',
      'opportunity_clusters',
      'brain_pages',
      'brain_page_versions',
      'signals',
      'shipped_changes',
    ],
    deterministicStages: [
      'Fetch actual metrics and compare them to the forecast attached to the roadmap item.',
      'Update cluster evidence strength, freshness, and dominant-need weighting based on the result.',
      'Classify the delta as confirmed, underperformed, or inconclusive.',
    ],
    latentStages: [
      'Interpret why the forecast was wrong or right.',
      'Propose resolver and skill updates that should become permanent improvements.',
    ],
    writes: [
      'brain_runs',
      'opportunity_clusters',
      'brain_page_versions',
      'brain_skill_files',
      'brain_resolver_rules',
    ],
    changedFromToday: [
      'Closes the loop with explicit learning instead of leaving accuracy updates to humans.',
      'Feeds the long backlog and the routing layer, not just the shipped row.',
    ],
  },
  audit_resolver: {
    taskType: 'audit_resolver',
    name: 'Check Resolvable',
    goal: 'Keep routing honest by testing triggers, finding dark capabilities, and proposing resolver repairs.',
    reads: [
      'brain_skill_files',
      'brain_resolver_rules',
      'resolver_triggers',
      'brain_runs',
      'docs/brain/RESOLVER.md',
    ],
    deterministicStages: [
      'Enumerate the skill registry, trigger table, and observed task dispatch traffic for the audit window.',
      'Run trigger evals for common user phrases and cron/webhook events.',
      'Find skills and codepaths that have no reachable path from the resolver.',
    ],
    latentStages: [
      'Propose better trigger descriptions, overlap fixes, and escalation paths.',
      'Summarize where resolver drift is starting to appear before users notice it.',
    ],
    writes: ['brain_runs', 'resolver_audits', 'brain_resolver_rules'],
    changedFromToday: [
      'Treats resolver health as a first-class system concern, not documentation hygiene.',
      'Makes routing drift visible and reviewable on a weekly cadence.',
    ],
  },
}

export function getResolverRules(taskType: BrainTaskType): ResolverRule[] {
  return RESOLVER_RULES.filter((rule) => rule.taskType === taskType).sort(
    (left, right) => left.priority - right.priority,
  )
}

export function getTaskBlueprint(taskType: BrainTaskType): TaskBlueprint {
  return TASK_BLUEPRINTS[taskType]
}

export function getTaskSkill(taskType: BrainTaskType): BrainSkill {
  const skill = BRAIN_SKILLS.find((candidate) => candidate.taskType === taskType)

  if (!skill) {
    throw new Error(`No brain skill registered for task ${taskType}`)
  }

  return skill
}
