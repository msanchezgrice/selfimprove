'use client'

import { CheckCircle2, Circle, Calendar, TrendingUp, Rocket } from 'lucide-react'

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
  widget: 'Feedback widget',
  voice: 'Voice companion',
  posthog: 'PostHog analytics',
  sentry: 'Sentry errors',
}

const focusLabels: Record<string, string> = {
  balanced: 'Balanced',
  impact: 'Impact-first',
  effort: 'Quick wins',
  confidence: 'High confidence',
}

function getAutomationLabel(autoImplement: boolean): string {
  return autoImplement ? 'Roadmap + implement' : 'Roadmap only'
}

type TimelineItem = {
  period: string
  description: string
}

const timelineItems: TimelineItem[] = [
  {
    period: 'Day 1',
    description: 'Signals flow in. First roadmap items from user feedback.',
  },
  {
    period: 'Week 1',
    description: '5-15 items. Patterns emerge. ROI scores stabilize.',
  },
  {
    period: 'Month 1',
    description: 'Living product roadmap. Never wonder "what next?" again.',
  },
]

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

  const enabledSourceCount = enabledSources.length

  const repoDisplay = repoUrl
    ? repoUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '')
    : null

  const checks = [
    {
      title: 'Repository connected',
      detail: repoDisplay ?? projectName,
      done: true,
    },
    {
      title: `${enabledSourceCount} signal source${enabledSourceCount === 1 ? '' : 's'} active`,
      detail: enabledSources.join(' + ') || 'None configured',
      done: enabledSourceCount > 0,
    },
    {
      title: 'Widget installed',
      detail: sources.widget ? 'Ready to collect feedback' : 'Skipped',
      done: sources.widget,
    },
    {
      title: 'AI PM configured',
      detail: `Mode: ${getAutomationLabel(autoImplement)} \u00b7 Focus: ${focusLabels[roiFocus] ?? roiFocus}`,
      done: true,
    },
  ]

  return (
    <div className="text-center">
      {/* Celebration header */}
      <div className="mb-5">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
          style={{ backgroundColor: '#ecfdf5' }}
        >
          <Rocket size={32} style={{ color: '#059669' }} />
        </div>

        <h2
          className="text-xl font-semibold mb-1"
          style={{ color: '#1a1a2e' }}
        >
          Your AI PM is live
        </h2>
        <p
          className="text-sm mx-auto"
          style={{ color: '#8b8680', maxWidth: '400px' }}
        >
          SelfImprove is watching your app. Signals flow in, roadmap populates.
          Here&apos;s your setup:
        </p>
      </div>

      {/* Checklist */}
      <div
        className="rounded-xl border p-4 mb-5 text-left"
        style={{ borderColor: '#e8e4de' }}
      >
        <ul className="space-y-4">
          {checks.map((check) => (
            <li key={check.title} className="flex items-start gap-3">
              <CheckCircle2
                size={20}
                className="shrink-0 mt-0.5"
                style={{ color: check.done ? '#059669' : '#d1d5db' }}
              />
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: '#1a1a2e' }}
                >
                  {check.title}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8b8680' }}>
                  {check.detail}
                </p>
              </div>
            </li>
          ))}

          {/* Waiting for signals — pulsing indicator */}
          <li className="flex items-start gap-3">
            <div className="relative shrink-0 mt-0.5">
              <Circle
                size={20}
                style={{ color: '#6366f1' }}
              />
              <span
                className="absolute inset-0 rounded-full animate-ping"
                style={{
                  backgroundColor: '#6366f1',
                  opacity: 0.3,
                  width: 20,
                  height: 20,
                }}
              />
            </div>
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: '#1a1a2e' }}
              >
                Waiting for first signals...
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#8b8680' }}>
                First roadmap items appear within 24h of user activity.
              </p>
            </div>
          </li>
        </ul>
      </div>

      {/* What's next timeline */}
      <div className="mb-6">
        <p
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: '#8b8680' }}
        >
          What&apos;s next
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          {timelineItems.map((item) => (
            <div
              key={item.period}
              className="rounded-xl border p-3 text-left"
              style={{ borderColor: '#e8e4de', backgroundColor: '#faf8f5' }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                {item.period === 'Day 1' && (
                  <Calendar size={12} style={{ color: '#6366f1' }} />
                )}
                {item.period === 'Week 1' && (
                  <TrendingUp size={12} style={{ color: '#6366f1' }} />
                )}
                {item.period === 'Month 1' && (
                  <Rocket size={12} style={{ color: '#6366f1' }} />
                )}
                <p
                  className="text-xs font-semibold"
                  style={{ color: '#1a1a2e' }}
                >
                  {item.period}
                </p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#8b8680' }}>
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Go Live button */}
      <button
        type="button"
        onClick={onGoLive}
        disabled={loading || !projectName}
        className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: '#6366f1', fontSize: '0.95rem' }}
      >
        {loading ? 'Creating project...' : 'Open Dashboard \u2192'}
      </button>
    </div>
  )
}
