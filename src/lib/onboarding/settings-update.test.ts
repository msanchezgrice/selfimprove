import { describe, expect, it } from 'vitest'

import { sanitizeProjectSettingsUpdate } from './settings-update'

describe('onboarding settings updates', () => {
  const onboardingSettings = {
    automation_roi_focus: 'retention',
    automation_implement_enabled: true,
    safety_risk_threshold: 35,
    widget_enabled: true,
    voice_enabled: false,
    posthog_api_key: 'phx_test',
    sentry_dsn: 'https://example@sentry.io/1',
    ignored_field: 'nope',
  }

  it('persists supported onboarding settings and strips unknown fields', () => {
    expect(sanitizeProjectSettingsUpdate(onboardingSettings, 'pro')).toEqual({
      automation_roi_focus: 'retention',
      automation_implement_enabled: true,
      safety_risk_threshold: 35,
      widget_enabled: true,
      voice_enabled: false,
      posthog_api_key: 'phx_test',
      sentry_dsn: 'https://example@sentry.io/1',
    })
  })

  it('does not let a free organization enable paid automation', () => {
    expect(
      sanitizeProjectSettingsUpdate(onboardingSettings, 'free')
        .automation_implement_enabled,
    ).toBe(false)
  })
})
