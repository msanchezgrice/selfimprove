'use client'

import { Brain, Zap, Target, Shield } from 'lucide-react'
import type { RoiFocus } from '@/lib/types/database'
import type { ReactNode } from 'react'

type StepConfigureAiProps = {
  roiFocus: RoiFocus
  setRoiFocus: (v: RoiFocus) => void
  autoImplement: boolean
  setAutoImplement: (v: boolean) => void
  riskThreshold: number
  setRiskThreshold: (v: number) => void
}

type FocusOption = {
  value: RoiFocus
  label: string
  description: string
  icon: ReactNode
}

const focusOptions: FocusOption[] = [
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Equal weight across all factors',
    icon: <Brain size={18} style={{ color: '#6366f1' }} />,
  },
  {
    value: 'impact',
    label: 'Impact-first',
    description: 'Prioritize high-impact items',
    icon: <Target size={18} style={{ color: '#6366f1' }} />,
  },
  {
    value: 'effort',
    label: 'Quick wins',
    description: 'Low-effort, high-return items first',
    icon: <Zap size={18} style={{ color: '#6366f1' }} />,
  },
  {
    value: 'confidence',
    label: 'High confidence',
    description: 'Only act on strong signals',
    icon: <Shield size={18} style={{ color: '#6366f1' }} />,
  },
]

function getRiskLabel(value: number): string {
  if (value <= 30) return 'Conservative'
  if (value <= 70) return 'Moderate'
  return 'Aggressive'
}

function getRiskColor(value: number): string {
  if (value <= 30) return '#059669'
  if (value <= 70) return '#d97706'
  return '#dc2626'
}

export function StepConfigureAi({
  roiFocus,
  setRoiFocus,
  autoImplement,
  setAutoImplement,
  riskThreshold,
  setRiskThreshold,
}: StepConfigureAiProps) {
  return (
    <div>
      <h2
        className="text-lg font-semibold mb-1"
        style={{ color: '#1a1a2e' }}
      >
        Configure your AI PM
      </h2>
      <p className="text-sm mb-5" style={{ color: '#8b8680' }}>
        Set how your AI prioritizes and acts on signals.
      </p>

      {/* ROI Focus */}
      <div className="mb-6">
        <p
          className="text-sm font-medium mb-3"
          style={{ color: '#1a1a2e' }}
        >
          ROI Focus
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {focusOptions.map((opt) => {
            const selected = roiFocus === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRoiFocus(opt.value)}
                className="flex items-start gap-3 p-3 rounded-xl border text-left transition-all"
                style={{
                  borderColor: selected ? '#6366f1' : '#e8e4de',
                  backgroundColor: selected ? '#fafaff' : '#ffffff',
                  boxShadow: selected ? '0 0 0 1px #6366f1' : 'none',
                }}
              >
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5"
                  style={{
                    backgroundColor: selected ? '#eef2ff' : '#f5f3ef',
                  }}
                >
                  {opt.icon}
                </div>
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: '#1a1a2e' }}
                  >
                    {opt.label}
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: '#8b8680' }}
                  >
                    {opt.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Auto-implement */}
      <div
        className="flex items-center justify-between p-4 rounded-xl border mb-6"
        style={{ borderColor: '#e8e4de' }}
      >
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: '#1a1a2e' }}
          >
            Auto-implement changes
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#8b8680' }}>
            Let the AI create PRs for approved roadmap items automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAutoImplement(!autoImplement)}
          className="relative w-10 h-6 rounded-full transition-colors shrink-0 ml-4"
          style={{
            backgroundColor: autoImplement ? '#6366f1' : '#d1d5db',
          }}
          aria-label="Toggle auto-implement"
        >
          <div
            className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
            style={{
              transform: autoImplement
                ? 'translateX(22px)'
                : 'translateX(4px)',
            }}
          />
        </button>
      </div>

      {/* Risk threshold */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p
            className="text-sm font-medium"
            style={{ color: '#1a1a2e' }}
          >
            Risk threshold
          </p>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              color: getRiskColor(riskThreshold),
              backgroundColor:
                riskThreshold <= 30
                  ? '#ecfdf5'
                  : riskThreshold <= 70
                    ? '#fffbeb'
                    : '#fef2f2',
            }}
          >
            {getRiskLabel(riskThreshold)} ({riskThreshold})
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={riskThreshold}
          onChange={(e) => setRiskThreshold(Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
          style={{
            accentColor: '#6366f1',
            backgroundColor: '#e8e4de',
          }}
        />
        <div
          className="flex justify-between text-xs mt-1"
          style={{ color: '#8b8680' }}
        >
          <span>Conservative</span>
          <span>Moderate</span>
          <span>Aggressive</span>
        </div>
      </div>
    </div>
  )
}
