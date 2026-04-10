'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function GenerateButton({
  projectId,
  unprocessedCount,
  hasItems = false,
}: {
  projectId: string
  unprocessedCount: number
  hasItems?: boolean
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-roadmap`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to generate')
      } else {
        router.refresh()
      }
    } catch {
      setError('Network error')
    }
    setGenerating(false)
  }

  return (
    <div className="flex items-center gap-3">
      {error && (
        <span className="text-xs" style={{ color: '#dc2626' }}>
          {error}
        </span>
      )}
      {unprocessedCount > 0 && (
        <span
          className="text-xs px-2 py-1 rounded-full"
          style={{ backgroundColor: '#ecfdf5', color: '#059669' }}
        >
          {unprocessedCount} new signal{unprocessedCount === 1 ? '' : 's'}
        </span>
      )}
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
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
          hasItems ? 'Update Roadmap' : 'Generate Roadmap'
        )}
      </button>
    </div>
  )
}
