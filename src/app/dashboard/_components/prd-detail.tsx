'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { showToast } from '@/lib/utils/toast'
import type {
  RoadmapItemRow,
  RoadmapCategory,
  RoadmapScope,
  RoadmapStatus,
  SignalType,
} from '@/lib/types/database'

type PRDDetailProps = {
  item: RoadmapItemRow
}

/* ---------- Config ---------- */

const categoryConfig: Record<RoadmapCategory, { bg: string; text: string; label: string }> = {
  bug: { bg: '#fef2f2', text: '#dc2626', label: 'Bug' },
  feature: { bg: '#eef2ff', text: '#6366f1', label: 'Feature' },
  improvement: { bg: '#fffbeb', text: '#d97706', label: 'Improvement' },
  infrastructure: { bg: '#f8fafc', text: '#475569', label: 'Infra' },
  retention: { bg: '#fdf4ff', text: '#a855f7', label: 'Retention' },
  revenue: { bg: '#f0fdf4', text: '#16a34a', label: 'Revenue' },
  reach: { bg: '#eff6ff', text: '#3b82f6', label: 'Reach' },
}

const scopeConfig: Record<RoadmapScope, { bg: string; text: string; label: string }> = {
  small: { bg: '#f0fdf4', text: '#16a34a', label: 'Small' },
  medium: { bg: '#fffbeb', text: '#d97706', label: 'Medium' },
  large: { bg: '#fef2f2', text: '#dc2626', label: 'Large' },
}

const statusConfig: Record<RoadmapStatus, { bg: string; text: string; label: string }> = {
  proposed: { bg: '#eef2ff', text: '#6366f1', label: 'Proposed' },
  approved: { bg: '#f0fdf4', text: '#059669', label: 'Approved' },
  building: { bg: '#fffbeb', text: '#d97706', label: 'Building' },
  shipped: { bg: '#ecfdf5', text: '#059669', label: 'Shipped' },
  archived: { bg: '#f8fafc', text: '#475569', label: 'Archived' },
  dismissed: { bg: '#fef2f2', text: '#dc2626', label: 'Dismissed' },
}

const signalTypeBadge: Record<string, { bg: string; text: string }> = {
  voice: { bg: '#f5f3ff', text: '#7c3aed' },
  feedback: { bg: '#eef2ff', text: '#6366f1' },
  analytics: { bg: '#ecfeff', text: '#0891b2' },
  error: { bg: '#fef2f2', text: '#dc2626' },
  builder: { bg: '#ecfdf5', text: '#059669' },
}

/* ---------- Helpers ---------- */

function Badge({ bg, text, label }: { bg: string; text: string; label: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col items-center rounded-lg border px-4 py-3"
      style={{ borderColor: '#e8e4de' }}
    >
      <span className="text-lg font-semibold tabular-nums" style={{ color: '#1a1a2e' }}>
        {value}
      </span>
      <span className="text-xs" style={{ color: '#8b8680' }}>
        {label}
      </span>
    </div>
  )
}

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl border bg-white p-5"
      style={{ borderColor: '#e8e4de' }}
    >
      <h3 className="text-sm font-semibold mb-3" style={{ color: '#1a1a2e' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

/* ---------- PRD Content types ---------- */

type EvidenceItem = {
  type?: string
  content?: string
  signal_type?: string
}

type PRDContent = {
  problem?: string
  evidence?: EvidenceItem[]
  thinking_traces?: string[]
  expected_impact?: string
  solution?: string
  acceptance_criteria?: string[]
  files_to_modify?: { path?: string; change?: string }[]
  risks?: string[]
  rollback?: string
  success_metrics?: Array<{ metric: string; baseline: string; target: string; measurement: string }>
  analytics_events?: Array<{ event_name: string; properties: string; trigger: string }>
  experiments?: Array<{ name: string; hypothesis: string; control: string; variant: string; metric: string; sample_size: string; duration: string; expected_lift: string }>
}

/* ---------- Main component ---------- */

export function PRDDetail({ item }: PRDDetailProps) {
  const router = useRouter()
  const pathname = usePathname()
  const slugMatch = pathname.match(/^\/dashboard\/([^/]+)/)
  const slug = slugMatch?.[1] || ''
  const [loading, setLoading] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [dismissReason, setDismissReason] = useState('')
  const [localItem, setLocalItem] = useState(item)
  const [showRefineInput, setShowRefineInput] = useState(false)
  const [refineFeedback, setRefineFeedback] = useState('')
  const [feedbackDirection, setFeedbackDirection] = useState<'up' | 'down' | null>(null)
  const [feedbackNote, setFeedbackNote] = useState('')
  const [issueUrl] = useState<string | null>(() => {
    // Check direct fields first
    if (item.github_issue_url) return item.github_issue_url
    // Fall back to evidence trail
    const trail = (item.evidence_trail as Array<Record<string, unknown>>) || []
    const existing = trail.find(e => e.type === 'github_issue')
    return (existing?.url as string | null) ?? null
  })

  const prd = localItem.prd_content as PRDContent | null
  const cat = categoryConfig[localItem.category]
  const scope = scopeConfig[localItem.scope]
  const status = statusConfig[localItem.status]

  async function handleGeneratePRD(feedback?: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/roadmap/${localItem.id}/prd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedback ? { feedback } : {}),
      })
      if (res.ok) {
        const data = await res.json()
        setLocalItem((prev) => ({ ...prev, prd_content: data.prd }))
        setShowRefineInput(false)
        setRefineFeedback('')
        showToast('success', 'Changes saved', { id: 'prd-generate' })
      } else {
        showToast('error', 'Failed to save changes. Please try again.', { id: 'prd-generate' })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove() {
    const res = await fetch(`/api/roadmap/${localItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
    if (res.ok) {
      setLocalItem((prev) => ({ ...prev, status: 'approved' }))
      showToast('success', 'PRD approved successfully', { id: 'prd-approve' })
    } else {
      showToast('error', 'Failed to approve PRD. Please try again.', { id: 'prd-approve' })
    }
  }

  async function handleDismiss() {
    if (!dismissReason.trim()) return
    const res = await fetch(`/api/roadmap/${localItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed', dismiss_reason: dismissReason }),
    })
    if (res.ok) {
      setLocalItem((prev) => ({
        ...prev,
        status: 'dismissed',
        dismiss_reason: dismissReason,
      }))
      setDismissing(false)
      showToast('info', 'Status updated to Dismissed', { id: 'prd-dismiss' })
    } else {
      showToast('error', 'Failed to dismiss item. Please try again.', { id: 'prd-dismiss' })
    }
  }

  async function handleFeedback(direction: 'up' | 'down', note: string) {
    const res = await fetch(`/api/roadmap/${localItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        direction === 'up'
          ? { feedback_up: localItem.feedback_up + 1 }
          : { feedback_down: localItem.feedback_down + 1 },
      ),
    })
    if (res.ok) {
      setLocalItem((prev) => ({
        ...prev,
        feedback_up: direction === 'up' ? prev.feedback_up + 1 : prev.feedback_up,
        feedback_down: direction === 'down' ? prev.feedback_down + 1 : prev.feedback_down,
      }))
      setFeedbackDirection(null)
      setFeedbackNote('')
    }
  }


  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back button */}
      <Link
        href={`/dashboard/${slug}/roadmap`}
        className="inline-flex items-center gap-1 text-sm font-medium mb-6 transition-colors hover:opacity-70"
        style={{ color: '#6366f1' }}
      >
        &larr; Back to Roadmap
      </Link>

      {/* Title */}
      <h1 className="text-2xl font-bold mb-3" style={{ color: '#1a1a2e' }}>
        {localItem.title}
      </h1>

      {/* Badge row */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Badge bg={cat.bg} text={cat.text} label={cat.label} />
        <Badge bg={scope.bg} text={scope.text} label={scope.label} />
        <Badge bg={status.bg} text={status.text} label={status.label} />
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Impact" value={`${localItem.impact}/10`} />
        <MetricCard label="Size" value={`${localItem.size}/10`} />
        <MetricCard label="ROI Score" value={localItem.roi_score.toFixed(1)} />
        <MetricCard label="Confidence" value={`${localItem.confidence}%`} />
      </div>

      {/* Description */}
      <div
        className="rounded-xl border bg-white p-5 mb-4"
        style={{ borderColor: '#e8e4de' }}
      >
        <p className="text-sm leading-relaxed" style={{ color: '#1a1a2e' }}>
          {localItem.description}
        </p>
      </div>

      {/* PRD sections */}
      {prd ? (
        <div className="space-y-4 mb-6">
          {prd.problem && (
            <SectionCard title="Problem">
              <p className="text-sm leading-relaxed" style={{ color: '#1a1a2e' }}>
                {prd.problem}
              </p>
            </SectionCard>
          )}

          {prd.evidence && prd.evidence.length > 0 && (
            <SectionCard title="Evidence Trail">
              <ul className="space-y-2">
                {prd.evidence.map((ev, i) => {
                  const signalType = (ev.signal_type ?? ev.type ?? 'feedback') as SignalType
                  const badgeStyle = signalTypeBadge[signalType] ?? {
                    bg: '#f8fafc',
                    text: '#475569',
                  }
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0 mt-0.5"
                        style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.text }}
                      >
                        {signalType}
                      </span>
                      <span className="text-sm" style={{ color: '#1a1a2e' }}>
                        {ev.content ?? JSON.stringify(ev)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </SectionCard>
          )}

          {prd.thinking_traces && prd.thinking_traces.length > 0 && (
            <SectionCard title="Thinking Traces">
              <ol className="list-decimal list-inside space-y-1.5">
                {prd.thinking_traces.map((trace, i) => (
                  <li
                    key={i}
                    className="text-sm leading-relaxed"
                    style={{ color: '#1a1a2e' }}
                  >
                    {trace}
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}

          {prd.expected_impact && (
            <SectionCard title="Expected Impact">
              <p className="text-sm leading-relaxed" style={{ color: '#1a1a2e' }}>
                {prd.expected_impact}
              </p>
            </SectionCard>
          )}

          {prd.solution && (
            <SectionCard title="Solution">
              <p className="text-sm leading-relaxed" style={{ color: '#1a1a2e' }}>
                {prd.solution}
              </p>
            </SectionCard>
          )}

          {prd.acceptance_criteria && prd.acceptance_criteria.length > 0 && (
            <SectionCard title="Acceptance Criteria">
              <ul className="space-y-1.5">
                {prd.acceptance_criteria.map((criterion, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span
                      className="mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                      style={{ borderColor: '#e8e4de' }}
                    >
                      <span className="text-[10px]" style={{ color: '#8b8680' }}>
                        {i + 1}
                      </span>
                    </span>
                    <span style={{ color: '#1a1a2e' }}>{criterion}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {prd.files_to_modify && prd.files_to_modify.length > 0 && (
            <SectionCard title="Files to Modify">
              <ul className="space-y-2">
                {prd.files_to_modify.map((file, i) => (
                  <li key={i} className="text-sm">
                    <code
                      className="px-1.5 py-0.5 rounded text-xs font-mono"
                      style={{ backgroundColor: '#f5f3ff', color: '#6366f1' }}
                    >
                      {file.path ?? String(file)}
                    </code>
                    {file.change && (
                      <span className="ml-2" style={{ color: '#8b8680' }}>
                        &mdash; {file.change}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {((prd.risks && prd.risks.length > 0) || prd.rollback) && (
            <SectionCard title="Risks & Rollback">
              {prd.risks && prd.risks.length > 0 && (
                <ul className="list-disc list-inside space-y-1 mb-3">
                  {prd.risks.map((risk, i) => (
                    <li key={i} className="text-sm" style={{ color: '#1a1a2e' }}>{risk}</li>
                  ))}
                </ul>
              )}
              {prd.rollback && (
                <p className="text-sm" style={{ color: '#8b8680' }}>
                  <strong style={{ color: '#1a1a2e' }}>Rollback:</strong> {prd.rollback}
                </p>
              )}
            </SectionCard>
          )}

          {item.impact_estimates && (item.impact_estimates as unknown[]).length > 0 && (
            <SectionCard title="Predicted Impact">
              <div className="space-y-3">
                {(item.impact_estimates as Array<{metric: string; baseline: string; predicted: string; unit: string; reasoning: string}>).map((est, i) => (
                  <div key={i} className="rounded-lg p-3" style={{ backgroundColor: '#f0fdf4' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium" style={{ color: '#1a1a2e' }}>
                        {est.metric.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm font-semibold" style={{ color: '#059669' }}>
                        {est.baseline} &rarr; {est.predicted}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: '#8b8680' }}>{est.reasoning}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {prd.success_metrics && (prd.success_metrics as unknown[]).length > 0 && (
            <SectionCard title="Success Metrics">
              <div className="space-y-3">
                {(prd.success_metrics as Array<{ metric: string; baseline: string; target: string; measurement: string }>).map((m, i) => (
                  <div key={i} className="rounded-lg p-3" style={{ backgroundColor: '#f5f0eb' }}>
                    <p className="text-sm font-medium" style={{ color: '#1a1a2e' }}>{m.metric}</p>
                    <div className="flex gap-4 mt-1 text-xs" style={{ color: '#8b8680' }}>
                      <span>Baseline: <strong style={{ color: '#1a1a2e' }}>{m.baseline}</strong></span>
                      <span>Target: <strong style={{ color: '#059669' }}>{m.target}</strong></span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: '#8b8680' }}>Measured via: {m.measurement}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {prd.analytics_events && (prd.analytics_events as unknown[]).length > 0 && (
            <SectionCard title="Analytics Events to Implement">
              <div className="space-y-2">
                {(prd.analytics_events as Array<{ event_name: string; properties: string; trigger: string }>).map((e, i) => (
                  <div key={i} className="rounded-lg border p-3" style={{ borderColor: '#e8e4de' }}>
                    <code className="text-sm font-medium" style={{ color: '#6366f1' }}>{e.event_name}</code>
                    <p className="text-xs mt-1" style={{ color: '#8b8680' }}>Properties: {e.properties}</p>
                    <p className="text-xs" style={{ color: '#8b8680' }}>Trigger: {e.trigger}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {prd.experiments && prd.experiments.length > 0 && (
            <SectionCard title="Experiment Designs">
              <div className="space-y-4">
                {prd.experiments.map((exp, i) => (
                  <div key={i} className="rounded-lg border p-4" style={{ borderColor: '#e8e4de' }}>
                    <h4 className="text-sm font-semibold mb-2" style={{ color: '#1a1a2e' }}>{exp.name}</h4>
                    <p className="text-xs mb-3" style={{ color: '#6366f1', fontStyle: 'italic' }}>{exp.hypothesis}</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="font-medium" style={{ color: '#8b8680' }}>Control:</span>
                        <p style={{ color: '#1a1a2e' }}>{exp.control}</p>
                      </div>
                      <div>
                        <span className="font-medium" style={{ color: '#8b8680' }}>Variant:</span>
                        <p style={{ color: '#1a1a2e' }}>{exp.variant}</p>
                      </div>
                      <div>
                        <span className="font-medium" style={{ color: '#8b8680' }}>Primary Metric:</span>
                        <p style={{ color: '#1a1a2e' }}>{exp.metric}</p>
                      </div>
                      <div>
                        <span className="font-medium" style={{ color: '#8b8680' }}>Expected Lift:</span>
                        <p style={{ color: '#059669', fontWeight: 600 }}>{exp.expected_lift}</p>
                      </div>
                      <div>
                        <span className="font-medium" style={{ color: '#8b8680' }}>Sample Size:</span>
                        <p style={{ color: '#1a1a2e' }}>{exp.sample_size}</p>
                      </div>
                      <div>
                        <span className="font-medium" style={{ color: '#8b8680' }}>Duration:</span>
                        <p style={{ color: '#1a1a2e' }}>{exp.duration}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      ) : (
        /* No PRD content yet */
        <div
          className="rounded-xl border bg-white px-6 py-12 text-center mb-6"
          style={{ borderColor: '#e8e4de' }}
        >
          <p className="text-sm mb-4" style={{ color: '#8b8680' }}>
            No PRD has been generated for this item yet.
          </p>
          <button
            onClick={() => handleGeneratePRD()}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
            style={{ backgroundColor: '#6366f1' }}
          >
            {loading ? 'Generating...' : 'Generate PRD'}
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Shipped banner */}
        {localItem.status === 'shipped' && (
          <div className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium" style={{ backgroundColor: '#ecfdf5', color: '#059669' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Shipped
            {localItem.pr_url && (
              <a href={localItem.pr_url as string} target="_blank" rel="noopener noreferrer" className="underline ml-1">
                PR #{localItem.pr_number}
              </a>
            )}
          </div>
        )}

        {/* Refine PRD */}
        {prd && !showRefineInput && (
          <button
            onClick={() => setShowRefineInput(true)}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
            style={{ backgroundColor: '#6366f1' }}
          >
            Refine PRD
          </button>
        )}

        {prd && showRefineInput && (
          <div className="flex items-start gap-2 flex-1 min-w-[260px]">
            <textarea
              value={refineFeedback}
              onChange={(e) => setRefineFeedback(e.target.value)}
              placeholder="Describe how to refine the PRD..."
              rows={2}
              className="flex-1 px-3 py-2 rounded-lg border text-sm resize-none"
              style={{ borderColor: '#e8e4de', color: '#1a1a2e' }}
            />
            <button
              onClick={() => handleGeneratePRD(refineFeedback)}
              disabled={loading || !refineFeedback.trim()}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: '#6366f1' }}
            >
              {loading ? 'Refining...' : 'Submit'}
            </button>
            <button
              onClick={() => {
                setShowRefineInput(false)
                setRefineFeedback('')
              }}
              className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ color: '#8b8680' }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Approve */}
        {localItem.status === 'proposed' && (
          <button
            onClick={handleApprove}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: '#059669' }}
          >
            Approve
          </button>
        )}

        {/* GitHub Issue link (auto-created on approve) */}
        {issueUrl && (
          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border"
            style={{ borderColor: '#e8e4de', color: '#1a1a2e' }}
          >
            <GitHubIcon size={16} />
            View Issue #{issueUrl.split('/').pop()}
          </a>
        )}

        {/* Dismiss */}
        {localItem.status !== 'shipped' && localItem.status !== 'dismissed' && (
          !dismissing ? (
            <button
              onClick={() => setDismissing(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium border transition-opacity hover:opacity-90 cursor-pointer"
              style={{ borderColor: '#dc2626', color: '#dc2626' }}
            >
              Dismiss
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                placeholder="Reason for dismissal..."
                className="px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: '#e8e4de', color: '#1a1a2e' }}
              />
              <button
                onClick={handleDismiss}
                className="px-3 py-2 rounded-lg text-sm font-medium text-white cursor-pointer"
                style={{ backgroundColor: '#dc2626' }}
              >
                Confirm
              </button>
              <button
                onClick={() => {
                  setDismissing(false)
                  setDismissReason('')
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                style={{ color: '#8b8680' }}
              >
                Cancel
              </button>
            </div>
          )
        )}

        {/* Feedback buttons */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setFeedbackDirection(feedbackDirection === 'up' ? null : 'up')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-sm transition-colors hover:bg-green-50 cursor-pointer${feedbackDirection === 'up' ? ' bg-green-50' : ''}`}
            style={{ borderColor: feedbackDirection === 'up' ? '#059669' : '#e8e4de', color: '#059669' }}
            aria-label="Thumbs up"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 10v12" />
              <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
            </svg>
            <span className="tabular-nums text-xs">{localItem.feedback_up}</span>
          </button>
          <button
            onClick={() => setFeedbackDirection(feedbackDirection === 'down' ? null : 'down')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-sm transition-colors hover:bg-red-50 cursor-pointer${feedbackDirection === 'down' ? ' bg-red-50' : ''}`}
            style={{ borderColor: feedbackDirection === 'down' ? '#dc2626' : '#e8e4de', color: '#dc2626' }}
            aria-label="Thumbs down"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 14V2" />
              <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
            </svg>
            <span className="tabular-nums text-xs">{localItem.feedback_down}</span>
          </button>
        </div>
      </div>

      {/* Feedback note input */}
      {feedbackDirection && (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg border p-3"
          style={{ borderColor: feedbackDirection === 'up' ? '#bbf7d0' : '#fecaca', backgroundColor: feedbackDirection === 'up' ? '#f0fdf4' : '#fef2f2' }}
        >
          <input
            type="text"
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.target.value)}
            placeholder={feedbackDirection === 'down' ? 'Reason for downvote (required)' : 'Add a note (optional)'}
            className="flex-1 px-3 py-1.5 rounded-lg border text-sm"
            style={{ borderColor: '#e8e4de', color: '#1a1a2e' }}
          />
          <button
            onClick={() => handleFeedback(feedbackDirection, feedbackNote)}
            disabled={feedbackDirection === 'down' && !feedbackNote.trim()}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: feedbackDirection === 'up' ? '#059669' : '#dc2626' }}
          >
            Submit
          </button>
          <button
            onClick={() => {
              setFeedbackDirection(null)
              setFeedbackNote('')
            }}
            className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
            style={{ color: '#8b8680' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Dismiss info banner */}
      {localItem.status === 'dismissed' && localItem.dismiss_reason && (
        <div
          className="mt-4 rounded-lg border p-3 text-sm"
          style={{ borderColor: '#fecaca', backgroundColor: '#fef2f2', color: '#dc2626' }}
        >
          <strong>Dismissed:</strong> {localItem.dismiss_reason}
        </div>
      )}
    </div>
  )
}
