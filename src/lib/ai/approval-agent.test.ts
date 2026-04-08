import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reviewPR } from './approval-agent'
import type { PRDiff } from './approval-agent'
import type { ProjectSettingsRow } from '@/lib/types/database'
import { callClaude } from '@/lib/ai/call-claude'

vi.mock('@/lib/ai/call-claude', () => ({
  callClaude: vi.fn(),
}))

const mockCallClaude = vi.mocked(callClaude)

function makeSettings(overrides: Partial<ProjectSettingsRow> = {}): ProjectSettingsRow {
  return {
    id: 'settings-1',
    project_id: 'proj-1',
    automation_roadmap_enabled: true,
    automation_roi_focus: 'balanced',
    automation_implement_enabled: true,
    automation_auto_approve: false,
    automation_auto_merge: false,
    safety_risk_threshold: 70,
    safety_require_tests: true,
    safety_max_files: 10,
    safety_max_lines: 500,
    safety_blocked_paths: [],
    safety_daily_cap: 5,
    ai_model_roadmap: 'claude-sonnet-4-6',
    ai_model_prd: 'claude-sonnet-4-6',
    ai_model_approval: 'claude-haiku-4-5-20251001',
    widget_enabled: true,
    widget_color: '#6366f1',
    widget_position: 'bottom-right',
    widget_style: 'pill',
    widget_button_text: 'Feedback',
    widget_tags: ['bug', 'feature'],
    voice_enabled: false,
    voice_system_prompt: null,
    voice_screen_capture: false,
    posthog_api_key: null,
    sentry_dsn: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeDiff(overrides: Partial<PRDiff> = {}): PRDiff {
  return {
    filesChanged: 3,
    linesAdded: 100,
    linesRemoved: 20,
    filePaths: ['src/app/page.tsx', 'src/lib/utils.ts', 'src/lib/utils.test.ts'],
    hasTests: true,
    diffContent: '+ some changes\n- old code',
    ...overrides,
  }
}

describe('reviewPR', () => {
  beforeEach(() => {
    mockCallClaude.mockReset()
  })

  it('approves a low-risk diff', async () => {
    mockCallClaude.mockResolvedValue({
      risk_score: 10,
      concerns: [],
      suggestions: [],
      summary: 'Looks safe',
    })

    const diff = makeDiff({ filesChanged: 2, linesAdded: 30, linesRemoved: 20 })
    const settings = makeSettings()

    const result = await reviewPR(diff, settings)

    expect(result.decision).toBe('approve')
    expect(result.combinedScore).toBeLessThanOrEqual(settings.safety_risk_threshold * 0.5)
    expect(result.reasons).toEqual([])
  })

  it('increases mechanical score for high file count', async () => {
    mockCallClaude.mockResolvedValue({
      risk_score: 20,
      concerns: [],
      suggestions: [],
      summary: 'Moderate changes',
    })

    const diff = makeDiff({ filesChanged: 15 })
    const settings = makeSettings()

    const result = await reviewPR(diff, settings)

    // 15 files > max_files(10) => +25 mechanical
    // mechanical: 25, semantic: 20
    // combined: 25*0.4 + 20*0.6 = 10 + 12 = 22
    expect(result.mechanicalScore).toBeGreaterThanOrEqual(25)
    expect(result.combinedScore).toBeGreaterThan(0)
  })

  it('increases mechanical score for high line count', async () => {
    mockCallClaude.mockResolvedValue({
      risk_score: 20,
      concerns: [],
      suggestions: [],
      summary: 'Large diff',
    })

    const diff = makeDiff({ linesAdded: 600, linesRemoved: 200 })
    const settings = makeSettings()

    const result = await reviewPR(diff, settings)

    // 800 total > max_lines(500) => +25
    // 800 < 1000 so no large diff penalty
    expect(result.mechanicalScore).toBeGreaterThanOrEqual(25)
  })

  it('always rejects when blocked paths are hit', async () => {
    mockCallClaude.mockResolvedValue({
      risk_score: 0,
      concerns: [],
      suggestions: [],
      summary: 'Clean code',
    })

    const diff = makeDiff({
      filePaths: ['src/app/page.tsx', '.env.local', 'src/lib/utils.ts'],
    })
    const settings = makeSettings({
      safety_blocked_paths: ['.env'],
    })

    const result = await reviewPR(diff, settings)

    expect(result.decision).toBe('reject')
    expect(result.reasons).toContain('Modifies blocked paths: .env.local')
  })

  it('penalizes missing tests when safety_require_tests is true', async () => {
    mockCallClaude.mockResolvedValue({
      risk_score: 10,
      concerns: [],
      suggestions: [],
      summary: 'No tests',
    })

    const diffWithTests = makeDiff({ hasTests: true })
    const diffWithout = makeDiff({ hasTests: false })
    const settings = makeSettings({ safety_require_tests: true })

    const withTests = await reviewPR(diffWithTests, settings)
    const withoutTests = await reviewPR(diffWithout, settings)

    // Missing tests adds +15 to mechanical score
    expect(withoutTests.mechanicalScore).toBe(withTests.mechanicalScore + 15)
    expect(withoutTests.reasons).toContain('No test files detected in the diff')
  })

  it('auto-approves flagged PRs when auto_approve is enabled and score is within threshold', async () => {
    // Set up semantic score so combined lands in "flag" range (> threshold*0.5 but <= threshold)
    mockCallClaude.mockResolvedValue({
      risk_score: 50,
      concerns: [],
      suggestions: [],
      summary: 'Some risk but manageable',
    })

    const diff = makeDiff()
    const settings = makeSettings({ automation_auto_approve: true })

    const result = await reviewPR(diff, settings)

    // combined = 0*0.4 + 50*0.6 = 30, threshold=70, 70*0.5=35
    // 30 < 35 => would be approve already; need higher score to hit flag range
    // Let's verify: if decision was going to be 'flag', auto_approve overrides to 'approve'
    // We need combined > 35 and <= 70
    // Use higher semantic score
    mockCallClaude.mockResolvedValue({
      risk_score: 80,
      concerns: [],
      suggestions: [],
      summary: 'Risky but within threshold',
    })

    const result2 = await reviewPR(diff, settings)

    // combined = 0*0.4 + 80*0.6 = 48, which is > 35 and <= 70 => flag => auto_approve => approve
    expect(result2.decision).toBe('approve')
    expect(result2.reasons).toContain('Auto-approved: score within threshold')
  })

  it('propagates semantic concerns into reasons', async () => {
    const concerns = [
      'Possible SQL injection in query builder',
      'Missing input validation on user data',
    ]

    mockCallClaude.mockResolvedValue({
      risk_score: 60,
      concerns,
      suggestions: ['Add parameterized queries', 'Validate inputs'],
      summary: 'Security concerns found',
    })

    const diff = makeDiff()
    const settings = makeSettings()

    const result = await reviewPR(diff, settings)

    for (const concern of concerns) {
      expect(result.reasons).toContain(concern)
    }
    expect(result.suggestions).toContain('Add parameterized queries')
    expect(result.suggestions).toContain('Validate inputs')
  })
})
