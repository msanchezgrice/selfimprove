'use client'

import { useState, useCallback, useRef, type KeyboardEvent, type ChangeEvent } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { showToast } from '@/lib/utils/toast'
import { TIERS } from '@/lib/constants/tiers'
import type {
  ProjectRow,
  ProjectSettingsRow,
  Tier,
  RoiFocus,
  WidgetPosition,
  WidgetStyle,
} from '@/lib/types/database'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Tab = 'general' | 'automation' | 'safety' | 'ai' | 'signals' | 'billing'

type SettingsFormProps = {
  project: ProjectRow
  settings: ProjectSettingsRow
  orgTier: Tier
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'automation', label: 'Automation' },
  { key: 'safety', label: 'Safety' },
  { key: 'ai', label: 'AI Models' },
  { key: 'signals', label: 'Signals' },
  { key: 'billing', label: 'Team & Billing' },
]

const AI_MODELS = [
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
]

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/* ------------------------------------------------------------------ */

const C = {
  bg: '#faf8f5',
  card: '#ffffff',
  border: '#e8e4de',
  accent: '#6366f1',
  text: '#1a1a2e',
  secondary: '#8b8680',
  radius: '12px',
} as const

/* ------------------------------------------------------------------ */
/*  Shared input styles                                                */
/* ------------------------------------------------------------------ */

const inputClass =
  'w-full rounded-lg border px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 focus:ring-indigo-300'

const inputStyle = { borderColor: C.border, color: C.text }

/* ------------------------------------------------------------------ */
/*  Small reusable pieces                                              */
/* ------------------------------------------------------------------ */

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-sm font-medium mb-1"
      style={{ color: C.text }}
    >
      {children}
    </label>
  )
}

function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs mt-1" style={{ color: C.secondary }}>
      {children}
    </p>
  )
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ backgroundColor: checked ? C.accent : '#d1d5db' }}
    >
      <span
        className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

function SaveButton({
  onClick,
  saving,
  toast,
}: {
  onClick: () => void
  saving: boolean
  toast: string | null
}) {
  return (
    <div className="flex items-center gap-3 pt-4">
      <button
        type="button"
        onClick={onClick}
        disabled={saving}
        className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: C.accent }}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
      {toast && (
        <span
          className="text-sm font-medium animate-fade-in"
          style={{ color: toast === 'Saved' ? '#16a34a' : '#dc2626' }}
        >
          {toast === 'Saved' ? 'Saved \u2713' : toast}
        </span>
      )}
    </div>
  )
}

function TagInput({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const val = (e.target as HTMLInputElement).value.trim()
    if (e.key === 'Enter' && val) {
      e.preventDefault()
      if (!tags.includes(val)) {
        onChange([...tags, val])
      }
      if (inputRef.current) inputRef.current.value = ''
    }
    if (e.key === 'Backspace' && !val && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }

  function remove(idx: number) {
    onChange(tags.filter((_, i) => i !== idx))
  }

  return (
    <div
      className="flex flex-wrap gap-1.5 rounded-lg border px-2 py-1.5 min-h-[38px] focus-within:ring-2 focus-within:ring-indigo-300"
      style={{ borderColor: C.border }}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((t, i) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: '#eef2ff', color: C.accent }}
        >
          {t}
          <button
            type="button"
            onClick={() => remove(i)}
            className="hover:opacity-70"
            aria-label={`Remove ${t}`}
          >
            &times;
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        onKeyDown={handleKeyDown}
        className="flex-1 min-w-[80px] border-none outline-none bg-transparent text-sm py-0.5"
        placeholder={tags.length === 0 ? 'Type and press Enter' : ''}
        style={{ color: C.text }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Toast hook                                                         */
/* ------------------------------------------------------------------ */

function useToast() {
  const [toast, setToast] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((msg: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast(msg)
    timerRef.current = setTimeout(() => setToast(null), 2000)
  }, [])

  return { toast, show }
}

/* ------------------------------------------------------------------ */
/*  Main form component                                                */
/* ------------------------------------------------------------------ */

export function SettingsForm({ project, settings, orgTier }: SettingsFormProps) {
  const [tab, setTab] = useState<Tab>('general')
  const [saving, setSaving] = useState(false)
  const { toast, show } = useToast()

  const tierConfig = TIERS[orgTier]

  /* ----- General state ----- */
  const [name, setName] = useState(project.name)
  const [repoUrl, setRepoUrl] = useState(project.repo_url ?? '')
  const [siteUrl, setSiteUrl] = useState(project.site_url ?? '')
  const [description, setDescription] = useState(project.description ?? '')

  /* ----- Automation state ----- */
  const [roadmapEnabled, setRoadmapEnabled] = useState(settings.automation_roadmap_enabled)
  const [roiFocus, setRoiFocus] = useState<RoiFocus>(settings.automation_roi_focus)
  const [implementEnabled, setImplementEnabled] = useState(settings.automation_implement_enabled)
  const [autoApprove, setAutoApprove] = useState(settings.automation_auto_approve)
  const [autoMerge, setAutoMerge] = useState(settings.automation_auto_merge)

  /* ----- Safety state ----- */
  const [riskThreshold, setRiskThreshold] = useState(settings.safety_risk_threshold)
  const [requireTests, setRequireTests] = useState(settings.safety_require_tests)
  const [maxFiles, setMaxFiles] = useState(settings.safety_max_files)
  const [maxLines, setMaxLines] = useState(settings.safety_max_lines)
  const [blockedPaths, setBlockedPaths] = useState<string[]>(settings.safety_blocked_paths)
  const [dailyCap, setDailyCap] = useState(settings.safety_daily_cap)

  /* ----- AI Models state ----- */
  const [modelRoadmap, setModelRoadmap] = useState(settings.ai_model_roadmap)
  const [modelPrd, setModelPrd] = useState(settings.ai_model_prd)
  const [modelApproval, setModelApproval] = useState(settings.ai_model_approval)

  /* ----- Signals / Widget state ----- */
  const [widgetEnabled, setWidgetEnabled] = useState(settings.widget_enabled)
  const [widgetColor, setWidgetColor] = useState(settings.widget_color)
  const [widgetPosition, setWidgetPosition] = useState<WidgetPosition>(settings.widget_position)
  const [widgetStyle, setWidgetStyle] = useState<WidgetStyle>(settings.widget_style)
  const [widgetButtonText, setWidgetButtonText] = useState(settings.widget_button_text)
  const [widgetTags, setWidgetTags] = useState<string[]>(settings.widget_tags)
  const [voiceEnabled, setVoiceEnabled] = useState(settings.voice_enabled)
  const [voiceSystemPrompt, setVoiceSystemPrompt] = useState(settings.voice_system_prompt ?? '')
  const [posthogKey, setPosthogKey] = useState(settings.posthog_api_key ?? '')
  const [sentryDsn, setSentryDsn] = useState(settings.sentry_dsn ?? '')

  /* ----- Save handler ----- */

  async function save() {
    setSaving(true)
    try {
      const supabase = createClient()

      if (tab === 'general') {
        const { error } = await supabase
          .from('projects')
          .update({ name, repo_url: repoUrl || null, site_url: siteUrl || null, description: description || null })
          .eq('id', project.id)
        if (error) throw error
      }

      if (tab === 'automation') {
        const { error } = await supabase
          .from('project_settings')
          .update({
            automation_roadmap_enabled: roadmapEnabled,
            automation_roi_focus: roiFocus,
            automation_implement_enabled: implementEnabled,
            automation_auto_approve: autoApprove,
            automation_auto_merge: autoMerge,
          })
          .eq('project_id', project.id)
        if (error) throw error
      }

      if (tab === 'safety') {
        const { error } = await supabase
          .from('project_settings')
          .update({
            safety_risk_threshold: riskThreshold,
            safety_require_tests: requireTests,
            safety_max_files: maxFiles,
            safety_max_lines: maxLines,
            safety_blocked_paths: blockedPaths,
            safety_daily_cap: dailyCap,
          })
          .eq('project_id', project.id)
        if (error) throw error
      }

      if (tab === 'ai') {
        const { error } = await supabase
          .from('project_settings')
          .update({
            ai_model_roadmap: modelRoadmap,
            ai_model_prd: modelPrd,
            ai_model_approval: modelApproval,
          })
          .eq('project_id', project.id)
        if (error) throw error
      }

      if (tab === 'signals') {
        const { error } = await supabase
          .from('project_settings')
          .update({
            widget_enabled: widgetEnabled,
            widget_color: widgetColor,
            widget_position: widgetPosition,
            widget_style: widgetStyle,
            widget_button_text: widgetButtonText,
            widget_tags: widgetTags,
            voice_enabled: voiceEnabled,
            voice_system_prompt: voiceSystemPrompt || null,
            posthog_api_key: posthogKey || null,
            sentry_dsn: sentryDsn || null,
          })
          .eq('project_id', project.id)
        if (error) throw error
      }

      show('Saved')
      showToast('success', 'Changes saved', { id: 'settings-save' })
    } catch {
      show('Save failed — try again')
      showToast('error', 'Failed to save changes. Please try again.', { id: 'settings-save' })
    } finally {
      setSaving(false)
    }
  }

  /* ----- Render helpers for each tab ----- */

  function renderGeneral() {
    return (
      <div className="space-y-5">
        <div>
          <Label htmlFor="proj-name">Project name</Label>
          <input
            id="proj-name"
            type="text"
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>

        <div>
          <Label htmlFor="repo-url">Repository URL</Label>
          <input
            id="repo-url"
            type="url"
            value={repoUrl}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/org/repo"
            className={inputClass}
            style={inputStyle}
          />
        </div>

        <div>
          <Label htmlFor="site-url">Site URL</Label>
          <input
            id="site-url"
            type="url"
            value={siteUrl}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSiteUrl(e.target.value)}
            placeholder="https://example.com"
            className={inputClass}
            style={inputStyle}
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            rows={3}
            value={description}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
            className={inputClass + ' resize-none'}
            style={inputStyle}
          />
        </div>

        <SaveButton onClick={save} saving={saving} toast={tab === 'general' ? toast : null} />
      </div>
    )
  }

  function renderAutomation() {
    const roiOptions: { value: RoiFocus; label: string }[] = [
      { value: 'balanced', label: 'Balanced' },
      { value: 'impact', label: 'Impact' },
      { value: 'effort', label: 'Effort' },
      { value: 'confidence', label: 'Confidence' },
    ]

    return (
      <div className="space-y-6">
        {/* Roadmap generation */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label>Roadmap generation</Label>
            <HelpText>Automatically generate roadmap items from incoming signals.</HelpText>
          </div>
          <Toggle checked={roadmapEnabled} onChange={setRoadmapEnabled} />
        </div>

        {/* ROI focus */}
        <div>
          <Label>ROI focus</Label>
          <HelpText>Prioritisation weighting for the roadmap scorer.</HelpText>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {roiOptions.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors"
                style={{
                  borderColor: roiFocus === opt.value ? C.accent : C.border,
                  backgroundColor: roiFocus === opt.value ? '#eef2ff' : C.card,
                  color: C.text,
                }}
              >
                <input
                  type="radio"
                  name="roi-focus"
                  value={opt.value}
                  checked={roiFocus === opt.value}
                  onChange={() => setRoiFocus(opt.value)}
                  className="accent-indigo-500"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Auto-implement */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label>Auto-implement</Label>
            <HelpText>Let AI autonomously build approved roadmap items.</HelpText>
          </div>
          <Toggle checked={implementEnabled} onChange={setImplementEnabled} />
        </div>

        {/* Auto-approve */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label>Auto-approve</Label>
            <HelpText>
              Automatically approve low-risk changes.
              {!tierConfig.features.autoApprove && (
                <span className="ml-1 text-amber-600">(Autonomous tier required)</span>
              )}
            </HelpText>
          </div>
          <Toggle
            checked={autoApprove}
            onChange={setAutoApprove}
            disabled={!tierConfig.features.autoApprove}
          />
        </div>

        {/* Auto-merge */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label>Auto-merge</Label>
            <HelpText>
              Merge pull requests automatically after approval.
              {!tierConfig.features.autoMerge && (
                <span className="ml-1 text-amber-600">(Autonomous tier required)</span>
              )}
            </HelpText>
          </div>
          <Toggle
            checked={autoMerge}
            onChange={setAutoMerge}
            disabled={!tierConfig.features.autoMerge}
          />
        </div>

        <SaveButton onClick={save} saving={saving} toast={tab === 'automation' ? toast : null} />
      </div>
    )
  }

  function renderSafety() {
    return (
      <div className="space-y-5">
        {/* Risk threshold */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label>Risk threshold</Label>
            <span className="text-sm font-mono" style={{ color: C.accent }}>
              {riskThreshold}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={riskThreshold}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setRiskThreshold(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <HelpText>Changes above this score require manual review.</HelpText>
        </div>

        {/* Require tests */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label>Require tests</Label>
            <HelpText>All generated PRs must include tests.</HelpText>
          </div>
          <Toggle checked={requireTests} onChange={setRequireTests} />
        </div>

        {/* Max files per PR */}
        <div>
          <Label htmlFor="max-files">Max files per PR</Label>
          <input
            id="max-files"
            type="number"
            min={1}
            value={maxFiles}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setMaxFiles(Number(e.target.value))}
            className={inputClass}
            style={{ ...inputStyle, maxWidth: 160 }}
          />
        </div>

        {/* Max lines per PR */}
        <div>
          <Label htmlFor="max-lines">Max lines per PR</Label>
          <input
            id="max-lines"
            type="number"
            min={1}
            value={maxLines}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setMaxLines(Number(e.target.value))}
            className={inputClass}
            style={{ ...inputStyle, maxWidth: 160 }}
          />
        </div>

        {/* Blocked paths */}
        <div>
          <Label>Blocked paths</Label>
          <TagInput tags={blockedPaths} onChange={setBlockedPaths} />
          <HelpText>Files or directories the agent must never modify.</HelpText>
        </div>

        {/* Daily improvement cap */}
        <div>
          <Label htmlFor="daily-cap">Daily improvement cap</Label>
          <input
            id="daily-cap"
            type="number"
            min={0}
            value={dailyCap}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDailyCap(Number(e.target.value))}
            className={inputClass}
            style={{ ...inputStyle, maxWidth: 160 }}
          />
          <HelpText>Maximum autonomous improvements per day.</HelpText>
        </div>

        <SaveButton onClick={save} saving={saving} toast={tab === 'safety' ? toast : null} />
      </div>
    )
  }

  function renderAI() {
    function ModelSelect({
      id,
      value,
      onChange,
    }: {
      id: string
      value: string
      onChange: (v: string) => void
    }) {
      return (
        <select
          id={id}
          value={value}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
          className={inputClass}
          style={inputStyle}
        >
          {AI_MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      )
    }

    return (
      <div className="space-y-5">
        <div>
          <Label htmlFor="model-roadmap">Roadmap analysis model</Label>
          <ModelSelect id="model-roadmap" value={modelRoadmap} onChange={setModelRoadmap} />
        </div>
        <div>
          <Label htmlFor="model-prd">PRD generation model</Label>
          <ModelSelect id="model-prd" value={modelPrd} onChange={setModelPrd} />
        </div>
        <div>
          <Label htmlFor="model-approval">Approval review model</Label>
          <ModelSelect id="model-approval" value={modelApproval} onChange={setModelApproval} />
        </div>
        <SaveButton onClick={save} saving={saving} toast={tab === 'ai' ? toast : null} />
      </div>
    )
  }

  function renderSignals() {
    return (
      <div className="space-y-6">
        {/* Widget section */}
        <h3 className="text-sm font-semibold" style={{ color: C.text }}>
          Feedback widget
        </h3>

        <div className="flex items-start justify-between gap-4">
          <div>
            <Label>Widget enabled</Label>
            <HelpText>Show the feedback widget on your site.</HelpText>
          </div>
          <Toggle checked={widgetEnabled} onChange={setWidgetEnabled} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="widget-color">Widget color</Label>
            <div className="flex items-center gap-2">
              <input
                id="widget-color"
                type="color"
                value={widgetColor}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setWidgetColor(e.target.value)}
                className="h-9 w-12 rounded-lg border cursor-pointer"
                style={{ borderColor: C.border }}
              />
              <span className="text-sm font-mono" style={{ color: C.secondary }}>
                {widgetColor}
              </span>
            </div>
          </div>

          <div>
            <Label htmlFor="widget-position">Position</Label>
            <select
              id="widget-position"
              value={widgetPosition}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setWidgetPosition(e.target.value as WidgetPosition)
              }
              className={inputClass}
              style={inputStyle}
            >
              <option value="bottom-right">Bottom Right</option>
              <option value="bottom-left">Bottom Left</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="widget-style">Style</Label>
            <select
              id="widget-style"
              value={widgetStyle}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setWidgetStyle(e.target.value as WidgetStyle)
              }
              className={inputClass}
              style={inputStyle}
            >
              <option value="pill">Pill</option>
              <option value="button">Button</option>
              <option value="tab">Tab</option>
            </select>
          </div>

          <div>
            <Label htmlFor="widget-btn-text">Button text</Label>
            <input
              id="widget-btn-text"
              type="text"
              value={widgetButtonText}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setWidgetButtonText(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <Label>Tags</Label>
          <TagInput tags={widgetTags} onChange={setWidgetTags} />
          <HelpText>Tags help categorise feedback from different pages.</HelpText>
        </div>

        {/* Voice section */}
        <h3 className="text-sm font-semibold pt-2" style={{ color: C.text }}>
          Voice companion
        </h3>

        <div className="flex items-start justify-between gap-4">
          <div>
            <Label>Voice enabled</Label>
            <HelpText>Allow voice feedback from users.</HelpText>
          </div>
          <Toggle checked={voiceEnabled} onChange={setVoiceEnabled} />
        </div>

        <div>
          <Label htmlFor="voice-prompt">Voice system prompt</Label>
          <textarea
            id="voice-prompt"
            rows={3}
            value={voiceSystemPrompt}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              setVoiceSystemPrompt(e.target.value)
            }
            className={inputClass + ' resize-none'}
            style={inputStyle}
            placeholder="Instructions for the voice companion..."
          />
        </div>

        {/* Integrations */}
        <h3 className="text-sm font-semibold pt-2" style={{ color: C.text }}>
          Integrations
        </h3>

        <div>
          <Label htmlFor="posthog-key">PostHog API key</Label>
          <div className="flex gap-2">
            <input
              id="posthog-key"
              type="password"
              value={posthogKey}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPosthogKey(e.target.value)}
              className={inputClass + ' flex-1'}
              style={inputStyle}
              placeholder="phx_..."
            />
            <button
              type="button"
              className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-50"
              style={{ color: C.accent, border: `1px solid ${C.border}` }}
            >
              Connect &rarr;
            </button>
          </div>
        </div>

        <div>
          <Label htmlFor="sentry-dsn">Sentry DSN</Label>
          <div className="flex gap-2">
            <input
              id="sentry-dsn"
              type="password"
              value={sentryDsn}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSentryDsn(e.target.value)}
              className={inputClass + ' flex-1'}
              style={inputStyle}
              placeholder="https://...@sentry.io/..."
            />
            <button
              type="button"
              className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-50"
              style={{ color: C.accent, border: `1px solid ${C.border}` }}
            >
              Connect &rarr;
            </button>
          </div>
        </div>

        <SaveButton onClick={save} saving={saving} toast={tab === 'signals' ? toast : null} />
      </div>
    )
  }

  function renderBilling() {
    const price = tierConfig.price === 0 ? 'Free' : `$${(tierConfig.price / 100).toFixed(0)}/mo`

    async function handleCheckout() {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = (await res.json()) as { url?: string }
      if (data.url) window.location.href = data.url
    }

    async function handlePortal() {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = (await res.json()) as { url?: string }
      if (data.url) window.location.href = data.url
    }

    return (
      <div className="space-y-6">
        {/* Current plan */}
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: C.border, backgroundColor: C.card }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: C.secondary }}>
                Current plan
              </p>
              <p className="text-lg font-semibold mt-0.5" style={{ color: C.text }}>
                {tierConfig.name}
              </p>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.text }}>
              {price}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          {orgTier !== 'autonomous' && (
            <button
              type="button"
              onClick={handleCheckout}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: C.accent }}
            >
              Upgrade
            </button>
          )}
          <button
            type="button"
            onClick={handlePortal}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-50"
            style={{ color: C.text, border: `1px solid ${C.border}` }}
          >
            Manage Billing
          </button>
        </div>

        {/* Team members placeholder */}
        <div>
          <h3 className="text-sm font-semibold mb-3" style={{ color: C.text }}>
            Team members
          </h3>
          <div
            className="rounded-xl border p-6 text-center"
            style={{ borderColor: C.border }}
          >
            <p className="text-sm" style={{ color: C.secondary }}>
              Team management coming soon.
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* ----- Main render ----- */

  const panels: Record<Tab, () => React.ReactNode> = {
    general: renderGeneral,
    automation: renderAutomation,
    safety: renderSafety,
    ai: renderAI,
    signals: renderSignals,
    billing: renderBilling,
  }

  return (
    <div>
      {/* Tab bar */}
      <div
        className="border-b overflow-x-auto mb-6"
        style={{ borderColor: C.border }}
      >
        <nav className="flex gap-0 min-w-max" aria-label="Settings tabs">
          {TABS.map((t) => {
            const isActive = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors duration-150"
                style={{ color: isActive ? C.accent : C.secondary }}
              >
                {t.label}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
                    style={{ backgroundColor: C.accent }}
                  />
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Panel */}
      <div
        className="rounded-xl border p-5 lg:p-6"
        style={{
          borderColor: C.border,
          backgroundColor: C.card,
          borderRadius: C.radius,
        }}
      >
        {panels[tab]()}
      </div>
    </div>
  )
}
