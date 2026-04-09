'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export function RoadmapEmpty({ projectId }: { projectId: string | null }) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleGenerate = async () => {
    if (!projectId) return
    setGenerating(true)
    setError(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/generate-roadmap`, {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to generate')
        return
      }

      // Refresh the page to show new roadmap items
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border bg-white px-6 py-16 text-center"
      style={{ borderColor: '#e8e4de' }}
    >
      {/* Compass icon */}
      <svg
        width={48}
        height={48}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#6366f1"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mb-5"
        aria-hidden="true"
      >
        <circle cx={12} cy={12} r={10} />
        <polygon
          points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"
          fill="#eef2ff"
          stroke="#6366f1"
        />
      </svg>

      <h2 className="text-lg font-semibold" style={{ color: '#1a1a2e' }}>
        Your roadmap is brewing
      </h2>

      <p
        className="mt-2 max-w-sm text-sm leading-relaxed"
        style={{ color: '#8b8680' }}
      >
        {projectId
          ? 'Signals are ready. Generate your first AI-powered roadmap now, or wait for the hourly auto-generation.'
          : 'Connect signals and your AI PM will generate prioritized improvements.'}
      </p>

      {error && (
        <p className="mt-3 text-sm" style={{ color: '#dc2626' }}>
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        {projectId && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#6366f1' }}
          >
            {generating ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="opacity-25"
                  />
                  <path
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    className="opacity-75"
                  />
                </svg>
                Generating...
              </>
            ) : (
              <>Generate Roadmap Now &rarr;</>
            )}
          </button>
        )}
        <Link
          href="/dashboard/signals"
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          style={{ color: '#6366f1', border: '1px solid #e8e4de' }}
        >
          View signals
        </Link>
      </div>
    </div>
  )
}
