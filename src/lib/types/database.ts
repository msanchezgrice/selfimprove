export type Tier = 'free' | 'pro' | 'autonomous';
export type OrgMemberRole = 'owner' | 'admin' | 'member';
export type ProjectStatus = 'active' | 'paused' | 'archived';
export type SignalType = 'feedback' | 'voice' | 'analytics' | 'error' | 'builder' | 'funnel_anomaly';
export type RoadmapCategory = 'bug' | 'feature' | 'improvement' | 'infrastructure' | 'retention' | 'revenue' | 'reach';
export type RoadmapStatus = 'proposed' | 'approved' | 'building' | 'shipped' | 'archived' | 'dismissed';
export type RoadmapScope = 'small' | 'medium' | 'large';
export type ApprovalMethod = 'manual' | 'auto_approved' | 'auto_merged';
export type ShippedChangeStatus = 'pending_review' | 'approved' | 'merged' | 'reverted';
export type BuildJobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type BuildJobType = 'implement' | 'scan';
export type BuildStatus = 'queued' | 'approved' | 'pr_creating' | 'pr_created' | 'merged';
export type RoiFocus = 'balanced' | 'impact' | 'effort' | 'confidence' | 'bugs' | 'ux' | 'features' | 'retention' | 'revenue' | 'reach';
export type WidgetPosition = 'bottom-right' | 'bottom-left';
export type WidgetStyle = 'pill' | 'button' | 'tab';

type BaseRow = {
  id: string;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// orgs
// ---------------------------------------------------------------------------

export type OrgRow = BaseRow & {
  name: string;
  slug: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  tier: Tier;
};

export type OrgInsert = Omit<OrgRow, 'id' | 'created_at' | 'updated_at' | 'stripe_customer_id' | 'stripe_subscription_id' | 'tier'> & {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  tier?: Tier;
};

export type OrgUpdate = Partial<OrgInsert>;

// ---------------------------------------------------------------------------
// org_members
// ---------------------------------------------------------------------------

export type OrgMemberRow = BaseRow & {
  org_id: string;
  user_id: string;
  role: OrgMemberRole;
  github_token: string | null;
  api_key: string | null;
};

export type OrgMemberInsert = Omit<OrgMemberRow, 'id' | 'created_at' | 'updated_at'>;

export type OrgMemberUpdate = Partial<OrgMemberInsert>;

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------

export type ProjectRow = BaseRow & {
  org_id: string;
  name: string;
  slug: string;
  repo_url: string | null;
  site_url: string | null;
  framework: string | null;
  description: string | null;
  allowed_domains: string[];
  status: ProjectStatus;
};

export type ProjectInsert = Omit<ProjectRow, 'id' | 'created_at' | 'updated_at' | 'repo_url' | 'site_url' | 'framework' | 'description' | 'status'> & {
  repo_url?: string | null;
  site_url?: string | null;
  framework?: string | null;
  description?: string | null;
  status?: ProjectStatus;
};

export type ProjectUpdate = Partial<ProjectInsert>;

// ---------------------------------------------------------------------------
// signals
// ---------------------------------------------------------------------------

export type SignalRow = BaseRow & {
  project_id: string;
  type: SignalType;
  title: string | null;
  content: string;
  metadata: Record<string, unknown>;
  source_user_hash: string | null;
  dedup_group_id: string | null;
  weight: number;
  processed: boolean;
};

export type SignalInsert = Omit<SignalRow, 'id' | 'created_at' | 'updated_at' | 'title' | 'source_user_hash' | 'dedup_group_id' | 'weight' | 'processed'> & {
  title?: string | null;
  source_user_hash?: string | null;
  dedup_group_id?: string | null;
  weight?: number;
  processed?: boolean;
};

export type SignalUpdate = Partial<SignalInsert>;

// ---------------------------------------------------------------------------
// roadmap_items
// ---------------------------------------------------------------------------

export type RoadmapStage = 'brief' | 'roadmap';

export type RoadmapItemRow = BaseRow & {
  project_id: string;
  title: string;
  description: string;
  category: RoadmapCategory;
  origin: string;
  confidence: number;
  scope: RoadmapScope;
  strategy: string;
  impact: number;
  upside: string;
  size: number;
  roi_score: number;
  evidence_trail: Record<string, unknown>[];
  thinking_traces: string[];
  acceptance_criteria: string[];
  files_to_modify: string[];
  risks: string[];
  status: RoadmapStatus;
  stage: RoadmapStage;
  rank: number;
  feedback_up: number;
  feedback_down: number;
  dismiss_reason: string | null;
  prd_content: Record<string, unknown> | null;
  generation_id: string | null;
  build_status: string | null;
  github_issue_url: string | null;
  github_issue_number: number | null;
  pr_url: string | null;
  pr_number: number | null;
  impact_estimates: Array<{ metric: string; baseline: string; predicted: string; unit: string; reasoning: string }>;
  impact_actuals: Array<{ metric: string; actual: string; measured_at: string }>;
  estimate_accuracy: number | null;
  opportunity_cluster_id: string | null;
};

export type RoadmapItemInsert = Omit<RoadmapItemRow, 'id' | 'created_at' | 'updated_at' | 'roi_score' | 'status' | 'stage' | 'rank' | 'feedback_up' | 'feedback_down' | 'dismiss_reason' | 'prd_content' | 'generation_id' | 'build_status' | 'github_issue_url' | 'github_issue_number' | 'pr_url' | 'pr_number' | 'impact_estimates' | 'impact_actuals' | 'estimate_accuracy' | 'opportunity_cluster_id'> & {
  roi_score?: number;
  status?: RoadmapStatus;
  stage?: RoadmapStage;
  rank?: number;
  feedback_up?: number;
  feedback_down?: number;
  dismiss_reason?: string | null;
  prd_content?: Record<string, unknown> | null;
  generation_id?: string | null;
  build_status?: string | null;
  github_issue_url?: string | null;
  github_issue_number?: number | null;
  pr_url?: string | null;
  pr_number?: number | null;
  impact_estimates?: Array<{ metric: string; baseline: string; predicted: string; unit: string; reasoning: string }>;
  impact_actuals?: Array<{ metric: string; actual: string; measured_at: string }>;
  estimate_accuracy?: number | null;
  opportunity_cluster_id?: string | null;
};

export type RoadmapItemUpdate = Partial<RoadmapItemInsert>;

// ---------------------------------------------------------------------------
// shipped_changes
// ---------------------------------------------------------------------------

export type ShippedChangeRow = BaseRow & {
  project_id: string;
  roadmap_item_id: string;
  pr_url: string | null;
  pr_number: number | null;
  commit_sha: string | null;
  risk_score: number | null;
  approval_method: ApprovalMethod;
  status: ShippedChangeStatus;
};

export type ShippedChangeInsert = Omit<ShippedChangeRow, 'id' | 'created_at' | 'updated_at' | 'pr_url' | 'pr_number' | 'commit_sha' | 'risk_score'> & {
  pr_url?: string | null;
  pr_number?: number | null;
  commit_sha?: string | null;
  risk_score?: number | null;
};

export type ShippedChangeUpdate = Partial<ShippedChangeInsert>;

// ---------------------------------------------------------------------------
// build_jobs
// ---------------------------------------------------------------------------

export type BuildJobRow = BaseRow & {
  roadmap_item_id: string | null;
  project_id: string;
  job_type: BuildJobType;
  status: BuildJobStatus;
  repo_url: string;
  github_token: string;
  prompt: string;
  result: Record<string, unknown> | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
};

// ---------------------------------------------------------------------------
// project_brain
// ---------------------------------------------------------------------------

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
  | 'metric_definitions';

export type BrainPageStatus = 'active' | 'stale' | 'archived';
export type BrainTaskType =
  | 'generate_roadmap'
  | 'generate_prd'
  | 'scan_codebase'
  | 'implement_roadmap_item'
  | 'review_pr'
  | 'measure_impact'
  | 'audit_resolver';
export type BrainSourceKind = 'signal' | 'roadmap_item' | 'shipped_change' | 'manual_note' | 'scan_finding';
export type BrainSkillStatus = 'draft' | 'active' | 'retired';
export type BrainRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export type BrainPageRow = BaseRow & {
  project_id: string;
  slug: string;
  kind: BrainPageKind;
  title: string;
  summary: string;
  status: BrainPageStatus;
  importance: number;
  freshness_score: number;
  stale_reason: string | null;
  last_compacted_at: string | null;
  last_signal_at: string | null;
  last_shipped_at: string | null;
  metadata: Record<string, unknown>;
};

export type BrainPageInsert = Omit<BrainPageRow, 'id' | 'created_at' | 'updated_at' | 'summary' | 'status' | 'importance' | 'freshness_score' | 'stale_reason' | 'last_compacted_at' | 'last_signal_at' | 'last_shipped_at' | 'metadata'> & {
  summary?: string;
  status?: BrainPageStatus;
  importance?: number;
  freshness_score?: number;
  stale_reason?: string | null;
  last_compacted_at?: string | null;
  last_signal_at?: string | null;
  last_shipped_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type BrainPageUpdate = Partial<BrainPageInsert>;

export type BrainPageVersionRow = {
  id: string;
  page_id: string;
  version: number;
  content_md: string;
  outline: Record<string, unknown>[];
  key_facts: string[];
  open_questions: string[];
  change_summary: string;
  compiled_from: Record<string, unknown>;
  created_by: string;
  created_at: string;
};

export type BrainPageVersionInsert = Omit<BrainPageVersionRow, 'id' | 'created_at' | 'outline' | 'key_facts' | 'open_questions' | 'change_summary' | 'compiled_from' | 'created_by'> & {
  outline?: Record<string, unknown>[];
  key_facts?: string[];
  open_questions?: string[];
  change_summary?: string;
  compiled_from?: Record<string, unknown>;
  created_by?: string;
};

export type BrainPageSourceRow = {
  id: string;
  page_id: string;
  page_version_id: string | null;
  source_kind: BrainSourceKind;
  signal_id: string | null;
  roadmap_item_id: string | null;
  shipped_change_id: string | null;
  citation: string;
  excerpt: string | null;
  weight: number;
  created_at: string;
};

export type BrainPageSourceInsert = Omit<BrainPageSourceRow, 'id' | 'created_at' | 'page_version_id' | 'signal_id' | 'roadmap_item_id' | 'shipped_change_id' | 'citation' | 'excerpt' | 'weight'> & {
  page_version_id?: string | null;
  signal_id?: string | null;
  roadmap_item_id?: string | null;
  shipped_change_id?: string | null;
  citation?: string;
  excerpt?: string | null;
  weight?: number;
};

export type BrainChunkRow = {
  id: string;
  page_id: string;
  page_version_id: string | null;
  chunk_index: number;
  content: string;
  token_estimate: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type BrainChunkInsert = Omit<BrainChunkRow, 'id' | 'created_at' | 'page_version_id' | 'token_estimate' | 'metadata'> & {
  page_version_id?: string | null;
  token_estimate?: number | null;
  metadata?: Record<string, unknown>;
};

export type BrainSkillFileRow = BaseRow & {
  slug: string;
  name: string;
  description: string;
  task_type: BrainTaskType;
  content_md: string;
  input_schema: Record<string, unknown>;
  status: BrainSkillStatus;
};

export type BrainSkillFileInsert = Omit<BrainSkillFileRow, 'id' | 'created_at' | 'updated_at' | 'description' | 'input_schema' | 'status'> & {
  description?: string;
  input_schema?: Record<string, unknown>;
  status?: BrainSkillStatus;
};

export type BrainSkillFileUpdate = Partial<BrainSkillFileInsert>;

export type BrainResolverRuleRow = BaseRow & {
  task_type: BrainTaskType;
  page_kind: BrainPageKind;
  priority: number;
  required: boolean;
  reason: string;
};

export type BrainResolverRuleInsert = Omit<BrainResolverRuleRow, 'id' | 'created_at' | 'updated_at' | 'required' | 'reason'> & {
  required?: boolean;
  reason?: string;
};

export type BrainResolverRuleUpdate = Partial<BrainResolverRuleInsert>;

export type BrainRunRow = BaseRow & {
  project_id: string;
  task_type: BrainTaskType;
  skill_slug: string;
  status: BrainRunStatus;
  resolved_context: Record<string, unknown>[];
  input_summary: Record<string, unknown>;
  result_summary: Record<string, unknown>;
  writes_planned: string[];
  writes_completed: string[];
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type BrainRunInsert = Omit<BrainRunRow, 'id' | 'created_at' | 'updated_at' | 'status' | 'resolved_context' | 'input_summary' | 'result_summary' | 'writes_planned' | 'writes_completed' | 'error' | 'started_at' | 'completed_at'> & {
  status?: BrainRunStatus;
  resolved_context?: Record<string, unknown>[];
  input_summary?: Record<string, unknown>;
  result_summary?: Record<string, unknown>;
  writes_planned?: string[];
  writes_completed?: string[];
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

export type BrainRunUpdate = Partial<BrainRunInsert>;

// ---------------------------------------------------------------------------
// opportunity_clusters (v1.1)
// ---------------------------------------------------------------------------

export type OpportunityClusterStatus = 'active' | 'snoozed' | 'archived' | 'merged' | 'shipped';
export type OpportunityClusterSourceKind =
  | 'signal'
  | 'brain_page'
  | 'roadmap_item'
  | 'shipped_change'
  | 'scan_finding'
  | 'manual_note';
export type OpportunityClusterSourcePolarity = 'supports' | 'contradicts' | 'neutral';

export type OpportunityClusterRow = BaseRow & {
  project_id: string;
  slug: string;
  title: string;
  theme: string;
  primary_need: string;
  need_vector: Record<string, number>;
  evidence_strength: number;
  freshness_score: number;
  confidence_score: number;
  effort_score: number;
  focus_weighted_score: number;
  status: OpportunityClusterStatus;
  merged_into_cluster_id: string | null;
  latest_brief_md: string;
  last_signal_at: string | null;
  last_refreshed_at: string | null;
  metadata: Record<string, unknown>;
};

export type OpportunityClusterInsert = Omit<
  OpportunityClusterRow,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'theme'
  | 'primary_need'
  | 'need_vector'
  | 'evidence_strength'
  | 'freshness_score'
  | 'confidence_score'
  | 'effort_score'
  | 'focus_weighted_score'
  | 'status'
  | 'merged_into_cluster_id'
  | 'latest_brief_md'
  | 'last_signal_at'
  | 'last_refreshed_at'
  | 'metadata'
> & {
  theme?: string;
  primary_need?: string;
  need_vector?: Record<string, number>;
  evidence_strength?: number;
  freshness_score?: number;
  confidence_score?: number;
  effort_score?: number;
  focus_weighted_score?: number;
  status?: OpportunityClusterStatus;
  merged_into_cluster_id?: string | null;
  latest_brief_md?: string;
  last_signal_at?: string | null;
  last_refreshed_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type OpportunityClusterUpdate = Partial<OpportunityClusterInsert>;

export type OpportunityClusterSourceRow = {
  id: string;
  cluster_id: string;
  source_kind: OpportunityClusterSourceKind;
  signal_id: string | null;
  brain_page_id: string | null;
  roadmap_item_id: string | null;
  shipped_change_id: string | null;
  citation: string;
  excerpt: string | null;
  weight: number;
  polarity: OpportunityClusterSourcePolarity;
  created_at: string;
};

export type OpportunityClusterSourceInsert = Omit<
  OpportunityClusterSourceRow,
  | 'id'
  | 'created_at'
  | 'signal_id'
  | 'brain_page_id'
  | 'roadmap_item_id'
  | 'shipped_change_id'
  | 'citation'
  | 'excerpt'
  | 'weight'
  | 'polarity'
> & {
  signal_id?: string | null;
  brain_page_id?: string | null;
  roadmap_item_id?: string | null;
  shipped_change_id?: string | null;
  citation?: string;
  excerpt?: string | null;
  weight?: number;
  polarity?: OpportunityClusterSourcePolarity;
};

// ---------------------------------------------------------------------------
// resolver_triggers (v1.1)
// ---------------------------------------------------------------------------

export type ResolverType = 'skill' | 'filing' | 'context' | 'action';
export type ResolverTriggerKind = 'user_phrase' | 'cron' | 'webhook' | 'policy';
export type ResolverTriggerStatus = 'active' | 'draft' | 'retired';

export type ResolverTriggerRow = BaseRow & {
  resolver_type: ResolverType;
  trigger_phrase: string;
  trigger_kind: ResolverTriggerKind;
  target_skill_slug: string;
  priority: number;
  fallback_skill_slug: string | null;
  notes: string;
  status: ResolverTriggerStatus;
};

export type ResolverTriggerInsert = Omit<
  ResolverTriggerRow,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'trigger_kind'
  | 'priority'
  | 'fallback_skill_slug'
  | 'notes'
  | 'status'
> & {
  trigger_kind?: ResolverTriggerKind;
  priority?: number;
  fallback_skill_slug?: string | null;
  notes?: string;
  status?: ResolverTriggerStatus;
};

export type ResolverTriggerUpdate = Partial<ResolverTriggerInsert>;

// ---------------------------------------------------------------------------
// resolver_audits (v1.1)
// ---------------------------------------------------------------------------

export type ResolverAuditType = 'check_resolvable' | 'trigger_eval' | 'dark_capability_scan';

export type ResolverAuditIssue = {
  kind: 'false_negative' | 'false_positive' | 'dark_capability' | 'overlap' | 'unmatched';
  description: string;
  evidence?: Record<string, unknown>;
};

export type ResolverAuditFix = {
  kind: 'add_trigger' | 'remove_trigger' | 'change_priority' | 'add_fallback' | 'edit_skill';
  target: string;
  proposal: string;
  applied?: boolean;
};

export type ResolverAuditRow = BaseRow & {
  project_id: string;
  audit_type: ResolverAuditType;
  window_start: string;
  window_end: string;
  issues_found: ResolverAuditIssue[];
  suggested_fixes: ResolverAuditFix[];
  applied_changes: ResolverAuditFix[];
  summary: string;
  run_id: string | null;
};

export type ResolverAuditInsert = Omit<
  ResolverAuditRow,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'audit_type'
  | 'issues_found'
  | 'suggested_fixes'
  | 'applied_changes'
  | 'summary'
  | 'run_id'
> & {
  audit_type?: ResolverAuditType;
  issues_found?: ResolverAuditIssue[];
  suggested_fixes?: ResolverAuditFix[];
  applied_changes?: ResolverAuditFix[];
  summary?: string;
  run_id?: string | null;
};

export type ResolverAuditUpdate = Partial<ResolverAuditInsert>;

// ---------------------------------------------------------------------------
// project_settings
// ---------------------------------------------------------------------------

export type ProjectSettingsRow = BaseRow & {
  project_id: string;
  automation_roadmap_enabled: boolean;
  automation_roi_focus: RoiFocus;
  automation_implement_enabled: boolean;
  automation_auto_approve: boolean;
  automation_auto_merge: boolean;
  safety_risk_threshold: number;
  safety_require_tests: boolean;
  safety_max_files: number;
  safety_max_lines: number;
  safety_blocked_paths: string[];
  safety_daily_cap: number;
  ai_model_roadmap: string;
  ai_model_prd: string;
  ai_model_approval: string;
  widget_enabled: boolean;
  widget_color: string;
  widget_position: WidgetPosition;
  widget_style: WidgetStyle;
  widget_button_text: string;
  widget_tags: string[];
  voice_enabled: boolean;
  voice_system_prompt: string | null;
  voice_screen_capture: boolean;
  posthog_api_key: string | null;
  sentry_dsn: string | null;
};

export type ProjectSettingsInsert = Omit<ProjectSettingsRow, 'id' | 'created_at' | 'updated_at' | 'automation_roadmap_enabled' | 'automation_roi_focus' | 'automation_implement_enabled' | 'automation_auto_approve' | 'automation_auto_merge' | 'safety_risk_threshold' | 'safety_require_tests' | 'safety_max_files' | 'safety_max_lines' | 'safety_blocked_paths' | 'safety_daily_cap' | 'ai_model_roadmap' | 'ai_model_prd' | 'ai_model_approval' | 'widget_enabled' | 'widget_color' | 'widget_position' | 'widget_style' | 'widget_button_text' | 'widget_tags' | 'voice_enabled' | 'voice_system_prompt' | 'voice_screen_capture' | 'posthog_api_key' | 'sentry_dsn'> & {
  automation_roadmap_enabled?: boolean;
  automation_roi_focus?: RoiFocus;
  automation_implement_enabled?: boolean;
  automation_auto_approve?: boolean;
  automation_auto_merge?: boolean;
  safety_risk_threshold?: number;
  safety_require_tests?: boolean;
  safety_max_files?: number;
  safety_max_lines?: number;
  safety_blocked_paths?: string[];
  safety_daily_cap?: number;
  ai_model_roadmap?: string;
  ai_model_prd?: string;
  ai_model_approval?: string;
  widget_enabled?: boolean;
  widget_color?: string;
  widget_position?: WidgetPosition;
  widget_style?: WidgetStyle;
  widget_button_text?: string;
  widget_tags?: string[];
  voice_enabled?: boolean;
  voice_system_prompt?: string | null;
  voice_screen_capture?: boolean;
  posthog_api_key?: string | null;
  sentry_dsn?: string | null;
};

export type ProjectSettingsUpdate = Partial<ProjectSettingsInsert>;

// ---------------------------------------------------------------------------
// funnel_stops (v1.1.5)
// ---------------------------------------------------------------------------

export type FunnelRole = 'top' | 'middle' | 'bottom' | 'error' | 'engagement' | 'event';

export type FunnelStopRow = BaseRow & {
  project_id: string;
  event_name: string;
  upstream_event: string | null;
  funnel_role: FunnelRole;
  count_24h: number;
  count_7d: number;
  count_28d: number;
  rate_vs_upstream_7d: number | null;
  rate_vs_upstream_28d: number | null;
  trend_count_7d: number | null;
  trend_rate_7d: number | null;
  last_observed: string | null;
  last_rolled_up_at: string | null;
  metadata: Record<string, unknown>;
};

export type FunnelStopInsert = Omit<FunnelStopRow, 'id' | 'created_at' | 'updated_at' | 'upstream_event' | 'funnel_role' | 'count_24h' | 'count_7d' | 'count_28d' | 'rate_vs_upstream_7d' | 'rate_vs_upstream_28d' | 'trend_count_7d' | 'trend_rate_7d' | 'last_observed' | 'last_rolled_up_at' | 'metadata'> & {
  upstream_event?: string | null;
  funnel_role?: FunnelRole;
  count_24h?: number;
  count_7d?: number;
  count_28d?: number;
  rate_vs_upstream_7d?: number | null;
  rate_vs_upstream_28d?: number | null;
  trend_count_7d?: number | null;
  trend_rate_7d?: number | null;
  last_observed?: string | null;
  last_rolled_up_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type FunnelStopUpdate = Partial<FunnelStopInsert>;

// ---------------------------------------------------------------------------
// funnel_anomalies (v1.1.5)
// ---------------------------------------------------------------------------

export type FunnelAnomalyKind = 'rate_drop' | 'rate_spike' | 'count_drop' | 'count_spike' | 'new_event' | 'first_seen';
export type FunnelAnomalyStatus = 'open' | 'acknowledged' | 'resolved' | 'expired' | 'duplicate';
export type FunnelAnomalySource = 'cron' | 'webhook' | 'backtest' | 'manual';

export type FunnelAnomalyRow = BaseRow & {
  project_id: string;
  funnel_stop_id: string;
  kind: FunnelAnomalyKind;
  baseline: number;
  observed: number;
  delta_pct: number;
  window_start: string;
  window_end: string;
  severity: number;
  status: FunnelAnomalyStatus;
  resolved_at: string | null;
  resolution_note: string | null;
  source: FunnelAnomalySource;
  signal_id: string | null;
  metadata: Record<string, unknown>;
};

export type FunnelAnomalyInsert = Omit<FunnelAnomalyRow, 'id' | 'created_at' | 'updated_at' | 'severity' | 'status' | 'resolved_at' | 'resolution_note' | 'source' | 'signal_id' | 'metadata'> & {
  severity?: number;
  status?: FunnelAnomalyStatus;
  resolved_at?: string | null;
  resolution_note?: string | null;
  source?: FunnelAnomalySource;
  signal_id?: string | null;
  metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// posthog_subscriptions (v1.1.5)
// ---------------------------------------------------------------------------

export type PosthogSubscriptionStatus = 'active' | 'paused' | 'errored';

export type PosthogSubscriptionRow = BaseRow & {
  project_id: string;
  posthog_host: string;
  posthog_project_id: string;
  secret: string;
  hogql_alert_ids: unknown[];
  last_event_at: string | null;
  last_rollup_at: string | null;
  status: PosthogSubscriptionStatus;
  metadata: Record<string, unknown>;
};

export type PosthogSubscriptionInsert = Omit<PosthogSubscriptionRow, 'id' | 'created_at' | 'updated_at' | 'posthog_host' | 'hogql_alert_ids' | 'last_event_at' | 'last_rollup_at' | 'status' | 'metadata'> & {
  posthog_host?: string;
  hogql_alert_ids?: unknown[];
  last_event_at?: string | null;
  last_rollup_at?: string | null;
  status?: PosthogSubscriptionStatus;
  metadata?: Record<string, unknown>;
};
