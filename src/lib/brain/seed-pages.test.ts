import { describe, expect, it } from 'vitest'

import type { ProjectSettingsRow } from '@/lib/types/database'

import { buildProjectSeedStubs, type ProjectSeedInput } from './seed-pages'

function makeSettings(overrides: Partial<ProjectSettingsRow> = {}): ProjectSettingsRow {
  return {
    id: 'settings-1',
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    project_id: 'proj-1',
    automation_roadmap_enabled: true,
    automation_roi_focus: 'balanced',
    automation_implement_enabled: false,
    automation_auto_approve: false,
    automation_auto_merge: false,
    safety_risk_threshold: 60,
    safety_require_tests: true,
    safety_max_files: 10,
    safety_max_lines: 400,
    safety_blocked_paths: ['infra/', 'secrets/'],
    safety_daily_cap: 3,
    ai_model_roadmap: 'claude-sonnet-4-6',
    ai_model_prd: 'claude-sonnet-4-6',
    ai_model_approval: 'claude-sonnet-4-6',
    widget_enabled: false,
    widget_color: '#000',
    widget_position: 'bottom-right',
    widget_style: 'pill',
    widget_button_text: 'feedback',
    widget_tags: [],
    voice_enabled: false,
    voice_system_prompt: null,
    voice_screen_capture: false,
    posthog_api_key: null,
    sentry_dsn: null,
    ...overrides,
  }
}

function makeInput(overrides: Partial<ProjectSeedInput> = {}): ProjectSeedInput {
  return {
    projectId: 'proj-1',
    name: 'SelfImprove',
    description: 'AI PM for indie founders',
    framework: 'next.js',
    repoUrl: 'https://github.com/example/selfimprove',
    siteUrl: 'https://selfimprove.dev',
    settings: makeSettings(),
    ...overrides,
  }
}

describe('buildProjectSeedStubs', () => {
  it('produces one stub per seeded kind', () => {
    const stubs = buildProjectSeedStubs(makeInput())
    const kinds = stubs.map((stub) => stub.kind)
    expect(kinds).toEqual([
      'project_overview',
      'repo_map',
      'safety_rules',
      'metric_definitions',
      'implementation_patterns',
    ])
    // current_focus is intentionally NOT seeded — user choice.
    expect(kinds).not.toContain('current_focus')
  })

  it('uses the project description verbatim in the overview summary when present', () => {
    const stubs = buildProjectSeedStubs(makeInput({ description: 'A tiny AI PM' }))
    const overview = stubs.find((stub) => stub.kind === 'project_overview')
    expect(overview?.summary).toBe('A tiny AI PM')
    expect(overview?.content_md).toContain('A tiny AI PM')
  })

  it('renders the no-repo stub when repoUrl is null', () => {
    const stubs = buildProjectSeedStubs(
      makeInput({ repoUrl: null, description: null }),
    )
    const repoMap = stubs.find((stub) => stub.kind === 'repo_map')
    expect(repoMap?.content_md).toContain('No repository is connected')
    expect(repoMap?.key_facts).toContain('no repo connected')
  })

  it('mirrors safety caps and blocked paths from project_settings into the safety_rules stub', () => {
    const stubs = buildProjectSeedStubs(makeInput({ settings: makeSettings({ safety_max_files: 5, safety_max_lines: 250, safety_blocked_paths: ['migrations/', '.env'] }) }))
    const safety = stubs.find((stub) => stub.kind === 'safety_rules')
    expect(safety?.content_md).toContain('Max files per change: 5')
    expect(safety?.content_md).toContain('Max lines per change: 250')
    expect(safety?.content_md).toContain('`migrations/`')
    expect(safety?.content_md).toContain('`.env`')
    expect(safety?.key_facts).toContain('max_files=5')
    expect(safety?.key_facts).toContain('blocked_paths_count=2')
  })

  it('falls back to platform defaults when settings are missing', () => {
    const stubs = buildProjectSeedStubs(makeInput({ settings: null }))
    const safety = stubs.find((stub) => stub.kind === 'safety_rules')
    expect(safety?.content_md).toContain('Project settings not loaded')
    expect(safety?.key_facts).toContain('project_settings not loaded at seed time')
  })

  it('gives every stub a non-empty content_md and an open_questions list', () => {
    const stubs = buildProjectSeedStubs(makeInput())
    for (const stub of stubs) {
      expect(stub.content_md.trim().length).toBeGreaterThan(0)
      expect(Array.isArray(stub.open_questions)).toBe(true)
      expect(stub.open_questions.length).toBeGreaterThan(0)
      expect(stub.importance).toBeGreaterThanOrEqual(0)
      expect(stub.importance).toBeLessThanOrEqual(100)
    }
  })
})
