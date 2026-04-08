'use client'

import { MessageCircle, Mic, BarChart3, AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

type Sources = {
  widget: boolean
  voice: boolean
  posthog: boolean
  sentry: boolean
}

type StepSelectSourcesProps = {
  sources: Sources
  setSources: (s: Sources) => void
}

type SourceCardProps = {
  icon: ReactNode
  name: string
  description: string
  note?: string
  enabled: boolean
  onToggle: () => void
}

function SourceCard({
  icon,
  name,
  description,
  note,
  enabled,
  onToggle,
}: SourceCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex flex-col items-start gap-3 p-4 rounded-xl border text-left transition-all"
      style={{
        borderColor: enabled ? '#6366f1' : '#e8e4de',
        backgroundColor: enabled ? '#fafaff' : '#ffffff',
        boxShadow: enabled ? '0 0 0 1px #6366f1' : 'none',
      }}
    >
      <div className="flex items-center justify-between w-full">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg"
          style={{
            backgroundColor: enabled ? '#eef2ff' : '#f5f3ef',
          }}
        >
          {icon}
        </div>
        <div
          className="relative w-10 h-6 rounded-full transition-colors"
          style={{
            backgroundColor: enabled ? '#6366f1' : '#d1d5db',
          }}
        >
          <div
            className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
            style={{
              transform: enabled ? 'translateX(22px)' : 'translateX(4px)',
            }}
          />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: '#1a1a2e' }}>
          {name}
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#8b8680' }}>
          {description}
        </p>
        {note && (
          <p
            className="text-xs mt-1 font-medium"
            style={{ color: '#b45309' }}
          >
            {note}
          </p>
        )}
      </div>
    </button>
  )
}

export function StepSelectSources({
  sources,
  setSources,
}: StepSelectSourcesProps) {
  const toggle = (key: keyof Sources) => {
    setSources({ ...sources, [key]: !sources[key] })
  }

  return (
    <div>
      <h2
        className="text-lg font-semibold mb-1"
        style={{ color: '#1a1a2e' }}
      >
        Select signal sources
      </h2>
      <p className="text-sm mb-5" style={{ color: '#8b8680' }}>
        Choose where your AI PM collects user feedback and product data.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <SourceCard
          icon={<MessageCircle size={18} style={{ color: '#6366f1' }} />}
          name="Widget Feedback"
          description="Collect feedback directly from your users via an embedded widget."
          enabled={sources.widget}
          onToggle={() => toggle('widget')}
        />
        <SourceCard
          icon={<Mic size={18} style={{ color: '#6366f1' }} />}
          name="Voice Companion"
          description="Let users speak their feedback with voice-to-text capture."
          enabled={sources.voice}
          onToggle={() => toggle('voice')}
        />
        <SourceCard
          icon={<BarChart3 size={18} style={{ color: '#6366f1' }} />}
          name="PostHog Analytics"
          description="Pull usage analytics and funnel insights from PostHog."
          note="API key required"
          enabled={sources.posthog}
          onToggle={() => toggle('posthog')}
        />
        <SourceCard
          icon={<AlertTriangle size={18} style={{ color: '#6366f1' }} />}
          name="Sentry Errors"
          description="Surface recurring errors and crashes from Sentry."
          note="DSN required"
          enabled={sources.sentry}
          onToggle={() => toggle('sentry')}
        />
      </div>
    </div>
  )
}
