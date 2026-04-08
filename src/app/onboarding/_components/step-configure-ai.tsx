'use client'

import { useState } from 'react'
import { Brain, Sparkles, ChevronDown, Zap, GitPullRequest, Bot } from 'lucide-react'
import type { RoiFocus } from '@/lib/types/database'

type AutomationLevel = 'roadmap' | 'roadmap_implement' | 'full_autonomous'

type StepConfigureAiProps = {
  roiFocus: RoiFocus
  setRoiFocus: (v: RoiFocus) => void
  autoImplement: boolean
  setAutoImplement: (v: boolean) => void
  riskThreshold: number
  setRiskThreshold: (v: number) => void
}

type PriorityOption = {
  value: string
  label: string
}

const priorityOptions: PriorityOption[] = [
  { value: 'bugs', label: 'Fix bugs and improve stability' },
  { value: 'ux', label: 'Improve usability and UX' },
  { value: 'features', label: 'Add new features' },
  { value: 'balanced', label: 'Balanced (all of the above)' },
]

type AutomationOption = {
  value: AutomationLevel
  title: string
  description: string
  icon: React.ReactNode
}

const automationOptions: AutomationOption[] = [
  {
    value: 'roadmap',
    title: 'Roadmap only (start here)',
    description: 'AI generates your roadmap. You decide what to build.',
    icon: <Brain size={18} style={{ color: '#6366f1' }} />,
  },
  {
    value: 'roadmap_implement',
    title: 'Roadmap + one-click implement',
    description: 'AI creates PRs when you click "Implement." You review and merge.',
    icon: <GitPullRequest size={18} style={{ color: '#6366f1' }} />,
  },
  {
    value: 'full_autonomous',
    title: 'Full autonomous',
    description: 'AI auto-approves, auto-builds, auto-merges low-risk changes. You set guardrails.',
    icon: <Bot size={18} style={{ color: '#6366f1' }} />,
  },
]

function mapAutomationToProps(level: AutomationLevel): {
  autoImplement: boolean
} {
  switch (level) {
    case 'roadmap':
      return { autoImplement: false }
    case 'roadmap_implement':
    case 'full_autonomous':
      return { autoImplement: true }
  }
}

function mapPropsToAutomation(autoImplement: boolean): AutomationLevel {
  return autoImplement ? 'roadmap_implement' : 'roadmap'
}

export function StepConfigureAi({
  roiFocus,
  setRoiFocus,
  autoImplement,
  setAutoImplement,
  riskThreshold,
  setRiskThreshold,
}: StepConfigureAiProps) {
  const [productDescription, setProductDescription] = useState('')
  const [targetUsers, setTargetUsers] = useState('')
  const [currentFeatures, setCurrentFeatures] = useState('')
  const [priority, setPriority] = useState('balanced')
  const [automationLevel, setAutomationLevel] = useState<AutomationLevel>(
    mapPropsToAutomation(autoImplement)
  )

  const handleAutomationChange = (level: AutomationLevel) => {
    setAutomationLevel(level)
    const mapped = mapAutomationToProps(level)
    setAutoImplement(mapped.autoImplement)
  }

  // Map priority to roiFocus
  const handlePriorityChange = (val: string) => {
    setPriority(val)
    const focusMap: Record<string, RoiFocus> = {
      bugs: 'confidence',
      ux: 'impact',
      features: 'effort',
      balanced: 'balanced',
    }
    setRoiFocus(focusMap[val] ?? 'balanced')
  }

  // Unused but kept for prop interface compatibility
  void riskThreshold
  void setRiskThreshold
  void roiFocus

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl"
          style={{ backgroundColor: '#eef2ff' }}
        >
          <Sparkles size={20} style={{ color: '#6366f1' }} />
        </div>
        <div>
          <h2
            className="text-lg font-semibold"
            style={{ color: '#1a1a2e' }}
          >
            Configure your AI PM
          </h2>
          <p className="text-sm" style={{ color: '#8b8680' }}>
            Tell the AI about your product. Everything here can be changed later.
          </p>
        </div>
      </div>

      {/* Product description */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: '#e8e4de', backgroundColor: '#ffffff' }}
      >
        <div className="mb-4">
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: '#1a1a2e' }}
          >
            What does your product do?
          </label>
          <textarea
            rows={2}
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-y"
            style={{
              borderColor: '#e8e4de',
              color: '#1a1a2e',
              backgroundColor: '#ffffff',
            }}
            placeholder="A study tool for oral board exams with flashcards, quizzes, and an AI companion."
          />
        </div>

        {/* Target users */}
        <div className="mb-4">
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: '#1a1a2e' }}
          >
            Who are your users?
          </label>
          <input
            type="text"
            value={targetUsers}
            onChange={(e) => setTargetUsers(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
            style={{
              borderColor: '#e8e4de',
              color: '#1a1a2e',
              backgroundColor: '#ffffff',
            }}
            placeholder="Residents studying for oral board exams"
          />
        </div>

        {/* Current features */}
        <div className="mb-4">
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: '#1a1a2e' }}
          >
            Current features
          </label>
          <input
            type="text"
            value={currentFeatures}
            onChange={(e) => setCurrentFeatures(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
            style={{
              borderColor: '#e8e4de',
              color: '#1a1a2e',
              backgroundColor: '#ffffff',
            }}
            placeholder="Flashcards, quizzes, PDF reader, chat, progress tracking"
          />
        </div>

        {/* Priority dropdown */}
        <div className="mb-0">
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: '#1a1a2e' }}
          >
            What matters most right now?
          </label>
          <div className="relative">
            <select
              value={priority}
              onChange={(e) => handlePriorityChange(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none appearance-none pr-10"
              style={{
                borderColor: '#e8e4de',
                color: '#1a1a2e',
                backgroundColor: '#ffffff',
              }}
            >
              {priorityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: '#8b8680' }}
            />
          </div>
          <p className="text-xs mt-1" style={{ color: '#8b8680' }}>
            Biases ROI scoring toward your priority.
          </p>
        </div>
      </div>

      {/* Automation level */}
      <div className="mt-5">
        <p
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: '#8b8680' }}
        >
          Automation level
        </p>
        <div className="space-y-2.5">
          {automationOptions.map((opt) => {
            const selected = automationLevel === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleAutomationChange(opt.value)}
                className="flex items-start gap-3 w-full p-4 rounded-xl border text-left transition-all"
                style={{
                  borderColor: selected ? '#6366f1' : '#e8e4de',
                  backgroundColor: selected ? '#fafaff' : '#ffffff',
                  boxShadow: selected ? '0 0 0 1px #6366f1' : 'none',
                }}
              >
                <div className="mt-0.5 shrink-0">
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                    style={{
                      borderColor: selected ? '#6366f1' : '#d1d5db',
                    }}
                  >
                    {selected && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: '#6366f1' }}
                      />
                    )}
                  </div>
                </div>
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
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
                    {opt.title}
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

        {automationLevel === 'full_autonomous' && (
          <div
            className="mt-3 p-3 rounded-xl border flex items-center gap-2"
            style={{ borderColor: '#e8e4de', backgroundColor: '#fffbeb' }}
          >
            <Zap size={14} style={{ color: '#d97706' }} />
            <p className="text-xs" style={{ color: '#92400e' }}>
              Full autonomous mode auto-merges low-risk changes. You can set guardrails in project settings.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
