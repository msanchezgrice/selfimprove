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
  posthogApiKey: string
  setPosthogApiKey: (k: string) => void
  sentryDsn: string
  setSentryDsn: (d: string) => void
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
  posthogApiKey,
  setPosthogApiKey,
  sentryDsn,
  setSentryDsn,
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
        <div className="flex flex-col">
          <SourceCard
            icon={<BarChart3 size={18} style={{ color: '#6366f1' }} />}
            name="PostHog Analytics"
            description="Pull usage analytics and funnel insights from PostHog."
            note="API key required"
            enabled={sources.posthog}
            onToggle={() => toggle('posthog')}
          />
          {sources.posthog && (
            <div className="mt-2">
              <input
                type="text"
                placeholder="phx_... (Personal API key)"
                value={posthogApiKey}
                onChange={e => setPosthogApiKey(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: '#e8e4de' }}
              />
              <p className="text-xs mt-1" style={{ color: '#8b8680' }}>
                Requires a <strong>Personal API key</strong> (phx_). Create at PostHog &rarr; Settings &rarr; Personal API Keys
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <SourceCard
            icon={<AlertTriangle size={18} style={{ color: '#6366f1' }} />}
            name="Sentry Errors"
            description="Surface recurring errors and crashes from Sentry."
            note="DSN required"
            enabled={sources.sentry}
            onToggle={() => toggle('sentry')}
          />
          {sources.sentry && (
            <div className="mt-2">
              <input
                type="text"
                placeholder="https://...@sentry.io/... or your Sentry DSN"
                value={sentryDsn}
                onChange={e => setSentryDsn(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: '#e8e4de' }}
              />
              <p className="text-xs mt-1" style={{ color: '#8b8680' }}>
                Find this in Sentry &rarr; Settings &rarr; Client Keys (DSN)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
