export type Tier = 'free' | 'pro' | 'autonomous';
export type OrgMemberRole = 'owner' | 'admin' | 'member';
export type ProjectStatus = 'active' | 'paused' | 'archived';
export type SignalType = 'feedback' | 'voice' | 'analytics' | 'error' | 'builder';
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
};

export type RoadmapItemInsert = Omit<RoadmapItemRow, 'id' | 'created_at' | 'updated_at' | 'roi_score' | 'status' | 'rank' | 'feedback_up' | 'feedback_down' | 'dismiss_reason' | 'prd_content' | 'generation_id' | 'build_status' | 'github_issue_url' | 'github_issue_number' | 'pr_url' | 'pr_number' | 'impact_estimates' | 'impact_actuals' | 'estimate_accuracy'> & {
  roi_score?: number;
  status?: RoadmapStatus;
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
