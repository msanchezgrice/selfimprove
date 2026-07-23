import type { Tier } from '@/lib/types/database'

const ALLOWED_SETTINGS = new Set([
  'widget_position',
  'widget_color',
  'widget_label',
  'widget_enabled',
  'allowed_domains',
  'voice_enabled',
  'automation_roi_focus',
  'automation_implement_enabled',
  'automation_auto_merge',
  'safety_risk_threshold',
  'posthog_api_key',
  'posthog_host',
  'sentry_dsn',
])

export function sanitizeProjectSettingsUpdate(
  settings: Record<string, unknown>,
  tier: Tier,
): Record<string, unknown> {
  const sanitized = Object.fromEntries(
    Object.entries(settings).filter(([key]) => ALLOWED_SETTINGS.has(key)),
  )

  if (tier === 'free' && 'automation_implement_enabled' in sanitized) {
    sanitized.automation_implement_enabled = false
  }
  if (tier !== 'autonomous' && 'automation_auto_merge' in sanitized) {
    sanitized.automation_auto_merge = false
  }

  return sanitized
}
