'use client'

import { CheckCircle2, Rocket } from 'lucide-react'

type StepGoLiveProps = {
  projectName: string
  repoUrl: string
  sources: {
    widget: boolean
    voice: boolean
    posthog: boolean
    sentry: boolean
  }
  roiFocus: string
  autoImplement: boolean
  onGoLive: () => void
  loading: boolean
}

const sourceLabels: Record<string, string> = {
  widget: 'Widget Feedback',
  voice: 'Voice Companion',
  posthog: 'PostHog Analytics',
  sentry: 'Sentry Errors',
}

const focusLabels: Record<string, string> = {
  balanced: 'Balanced',
  impact: 'Impact-first',
  effort: 'Quick wins',
  confidence: 'High confidence',
}

export function StepGoLive({
  projectName,
  repoUrl,
  sources,
  roiFocus,
  autoImplement,
  onGoLive,
  loading,
}: StepGoLiveProps) {
  const enabledSources = Object.entries(sources)
    .filter(([, enabled]) => enabled)
    .map(([key]) => sourceLabels[key])

  const checks = [
    {
      label: `Project "${projectName}" created`,
      done: !!projectName,
    },
    {
      label: repoUrl ? 'GitHub repo connected' : 'GitHub repo (skipped)',
      done: true,
    },
    {
      label: `${enabledSources.length} signal source${enabledSources.length === 1 ? '' : 's'} enabled`,
      done: enabledSources.length > 0,
    },
    {
      label: `ROI focus: ${focusLabels[roiFocus] ?? roiFocus}`,
      done: true,
    },
    {
      label: autoImplement
        ? 'Auto-implement enabled'
        : 'Auto-implement disabled',
      done: true,
    },
  ]

  return (
    <div className="text-center">
      <div
        className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
        style={{ backgroundColor: '#ecfdf5' }}
      >
        <Rocket size={28} style={{ color: '#059669' }} />
      </div>

      <h2
        className="text-xl font-semibold mb-1"
        style={{ color: '#1a1a2e' }}
      >
        Your AI PM is ready
      </h2>
      <p className="text-sm mb-6" style={{ color: '#8b8680' }}>
        Everything is configured. Launch your project to start collecting
        signals.
      </p>

      <div
        className="rounded-xl border p-4 mb-6 text-left"
        style={{ borderColor: '#e8e4de' }}
      >
        <ul className="space-y-3">
          {checks.map((check) => (
            <li key={check.label} className="flex items-start gap-2.5">
              <CheckCircle2
                size={18}
                className="shrink-0 mt-0.5"
                style={{ color: check.done ? '#059669' : '#d1d5db' }}
              />
              <span
                className="text-sm"
                style={{
                  color: check.done ? '#1a1a2e' : '#8b8680',
                }}
              >
                {check.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={onGoLive}
        disabled={loading || !projectName}
        className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: '#6366f1' }}
      >
        {loading ? 'Creating project...' : 'Go to Dashboard →'}
      </button>
    </div>
  )
}
