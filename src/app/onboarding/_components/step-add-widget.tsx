'use client'

import { useState } from 'react'
import { Code, Copy, Check, MessageCircle } from 'lucide-react'

export function StepAddWidget() {
  const [copied, setCopied] = useState(false)

  const snippet = `<script src="https://cdn.selfimprove.dev/widget.js" data-project="proj_xxx"></script>`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl"
          style={{ backgroundColor: '#eef2ff' }}
        >
          <Code size={20} style={{ color: '#6366f1' }} />
        </div>
        <div>
          <h2
            className="text-lg font-semibold"
            style={{ color: '#1a1a2e' }}
          >
            Add the feedback widget
          </h2>
          <p className="text-sm" style={{ color: '#8b8680' }}>
            One line of code to start collecting feedback
          </p>
        </div>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: '#e8e4de' }}
      >
        <div
          className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{
            backgroundColor: '#faf8f5',
            borderColor: '#e8e4de',
          }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: '#8b8680' }}
          >
            HTML
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
            style={{
              color: copied ? '#059669' : '#6366f1',
              backgroundColor: copied ? '#ecfdf5' : '#eef2ff',
            }}
          >
            {copied ? (
              <>
                <Check size={14} />
                Copied
              </>
            ) : (
              <>
                <Copy size={14} />
                Copy
              </>
            )}
          </button>
        </div>
        <pre
          className="px-4 py-3 text-sm overflow-x-auto"
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            color: '#1a1a2e',
            backgroundColor: '#ffffff',
            margin: 0,
          }}
        >
          {snippet}
        </pre>
      </div>

      <p className="text-xs mt-3" style={{ color: '#8b8680' }}>
        Paste this before the closing{' '}
        <code
          className="px-1 py-0.5 rounded text-xs"
          style={{ backgroundColor: '#f5f3ef' }}
        >
          {'</body>'}
        </code>{' '}
        tag. The project ID will be filled in automatically once your project
        is created.
      </p>

      {/* Widget preview */}
      <div className="mt-6">
        <p
          className="text-xs font-medium mb-3"
          style={{ color: '#8b8680' }}
        >
          Preview
        </p>
        <div
          className="relative rounded-xl border overflow-hidden"
          style={{
            borderColor: '#e8e4de',
            backgroundColor: '#f9fafb',
            height: '140px',
          }}
        >
          <div className="absolute bottom-4 right-4">
            <div
              className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg cursor-default"
              style={{
                backgroundColor: '#6366f1',
                color: '#ffffff',
              }}
            >
              <MessageCircle size={16} />
              <span className="text-sm font-medium">Feedback</span>
            </div>
          </div>
          <div
            className="absolute top-3 left-3 text-xs"
            style={{ color: '#8b8680' }}
          >
            yoursite.com
          </div>
        </div>
      </div>
    </div>
  )
}
