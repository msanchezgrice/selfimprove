'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'

import { FOCUS_MODES } from '@/lib/brain/design'

const FOCUS_NAMES = FOCUS_MODES.map((mode) => mode.name)

type FocusPickerProps = {
  projectId: string
  currentFocus: string | null
  note: string | null
}

/**
 * Focus picker for /brain-v1/runtime.
 *
 * Wraps `PUT /api/projects/[id]/focus`. Client component because it needs
 * state (selected mode, optional note, submitting indicator). Refreshes
 * the server page after a successful save so the FocusSection re-renders.
 */
export function FocusPicker({ projectId, currentFocus, note }: FocusPickerProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<string>(currentFocus ?? FOCUS_NAMES[0] ?? 'conversion')
  const [noteDraft, setNoteDraft] = useState<string>(note ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const submit = useCallback(async () => {
    setState('saving')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/focus`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: selected, note: noteDraft.trim() || undefined }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Failed (${res.status})`)
      }
      setState('saved')
      router.refresh()
    } catch (err) {
      setState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [projectId, selected, noteDraft, router])

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="rounded-3xl border p-5"
      style={{ borderColor: '#e5ddd2', backgroundColor: '#fffcf8' }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3
          className="text-sm font-semibold uppercase tracking-[0.18em]"
          style={{ color: '#8b5e34' }}
        >
          Set focus
        </h3>
        {state === 'saved' ? (
          <span className="text-xs" style={{ color: '#2f6240' }}>Saved.</span>
        ) : null}
        {state === 'error' ? (
          <span className="text-xs" style={{ color: '#a8552a' }}>{errorMessage}</span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FOCUS_MODES.map((mode) => {
          const isSelected = selected === mode.name
          return (
            <button
              type="button"
              key={mode.name}
              onClick={() => setSelected(mode.name)}
              className="rounded-full px-3 py-1 text-xs"
              style={{
                backgroundColor: isSelected ? '#8b5e34' : '#f1e6d9',
                color: isSelected ? '#fffdf8' : '#7c5633',
                border: isSelected ? '1px solid #8b5e34' : '1px solid #e5ddd2',
              }}
            >
              {mode.name}
            </button>
          )
        })}
      </div>

      <label className="mt-4 block text-xs" style={{ color: '#6f665e' }}>
        Note (optional — shows up in the focus page's change summary)
      </label>
      <textarea
        value={noteDraft}
        onChange={(event) => setNoteDraft(event.target.value)}
        rows={2}
        maxLength={400}
        className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
        style={{ borderColor: '#e5ddd2', backgroundColor: '#fff', color: '#3f3a36' }}
        placeholder="e.g. funnel drop on step 2 last week"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: '#9a8f81' }}>
          Active focus loads first for every roadmap and PRD run.
        </p>
        <button
          type="submit"
          disabled={state === 'saving'}
          className="rounded-full px-4 py-2 text-sm font-semibold"
          style={{
            backgroundColor: state === 'saving' ? '#c8ab86' : '#8b5e34',
            color: '#fffdf8',
          }}
        >
          {state === 'saving' ? 'Saving…' : 'Save focus'}
        </button>
      </div>
    </form>
  )
}
