'use client'

import { useState } from 'react'
import { Code, Copy, Check, MessageCircle, Bot, Tag } from 'lucide-react'

type StepAddWidgetProps = {
  projectId: string | null
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors shrink-0"
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
          {label}
        </>
      )}
    </button>
  )
}

function CodeBlock({
  children,
  copyText,
  copyLabel = 'Copy',
  label,
}: {
  children: React.ReactNode
  copyText: string
  copyLabel?: string
  label?: string
}) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: '#e8e4de' }}
    >
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{
          backgroundColor: '#1a1a2e',
          borderBottom: '1px solid #2d2d44',
        }}
      >
        <span
          className="text-xs font-medium"
          style={{ color: '#8b8680' }}
        >
          {label}
        </span>
        <CopyButton text={copyText} label={copyLabel} />
      </div>
      <pre
        className="px-4 py-3 text-sm overflow-x-auto"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
          backgroundColor: '#1a1a2e',
          color: '#e2e8f0',
          margin: 0,
          lineHeight: 1.6,
        }}
      >
        {children}
      </pre>
    </div>
  )
}

export function StepAddWidget({ projectId }: StepAddWidgetProps) {
  const pid = projectId ?? 'proj_xxx'
  const [tags, setTags] = useState('bug, confusing, slow, missing feature, love it')

  const scriptSnippet = `<script src="https://selfimprove.dev/widget.js"\n  data-project="${pid}"></script>`
  const reactSnippet = `// npm install @selfimprove/react\nimport { FeedbackWidget } from '@selfimprove/react'\n\n<FeedbackWidget projectId="${pid}" />`
  const agentPrompt = `Add the SelfImprove feedback widget to my app. Add this script tag just before </body> in my root layout: <script src='https://selfimprove.dev/widget.js' data-project='${pid}'></script>. That's it, one line.`

  const agentInstructions = `## SelfImprove Integration
This project uses SelfImprove (selfimprove.dev) for AI product management.
Dashboard: https://selfimprove.dev/p/${pid}

### Context for coding agents
- A feedback widget is embedded on all pages (bottom-right corner)
- User signals (voice transcripts, feedback tags, analytics) feed a live product roadmap
- Each roadmap item has: evidence trail, thinking traces, acceptance criteria, and a full PRD
- When implementing features from the roadmap, follow the PRD's acceptance criteria
- Reference the roadmap item in commit messages: "Implements roadmap #<id>"
- The feedback widget is at /api/feedback (POST) if you need to test it`

  const agentQuickPrompt = `Check the SelfImprove dashboard at selfimprove.dev/p/${pid} for the highest-priority roadmap item. Read the PRD and acceptance criteria, then implement it.`

  return (
    <div>
      {/* Header */}
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
            One line of code. Adds a &ldquo;Something off?&rdquo; button to every page.
          </p>
        </div>
      </div>

      {/* Widget preview */}
      <div
        className="rounded-xl border p-4 mb-5"
        style={{ borderColor: '#e8e4de', backgroundColor: '#faf8f5' }}
      >
        <p
          className="text-xs font-semibold mb-2 uppercase tracking-wide"
          style={{ color: '#8b8680' }}
        >
          Preview
        </p>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full shadow-sm"
            style={{ backgroundColor: '#6366f1', color: '#ffffff' }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: '#34d399' }}
            />
            <span className="text-sm font-medium">Something off?</span>
          </div>
        </div>
        <p className="text-xs mt-2" style={{ color: '#8b8680' }}>
          Expands on click. Collapses when done. Zero layout shift.
        </p>
      </div>

      {/* Script tag */}
      <p
        className="text-xs font-semibold uppercase tracking-wider mb-1.5"
        style={{ color: '#8b8680' }}
      >
        Script tag (any framework)
      </p>
      <CodeBlock copyText={scriptSnippet} label="HTML">
        <span style={{ color: '#7dd3fc' }}>&lt;script</span>{' '}
        <span style={{ color: '#fbbf24' }}>src</span>
        <span style={{ color: '#94a3b8' }}>=</span>
        <span style={{ color: '#a5f3c4' }}>&quot;https://selfimprove.dev/widget.js&quot;</span>
        {'\n'}
        {'  '}
        <span style={{ color: '#fbbf24' }}>data-project</span>
        <span style={{ color: '#94a3b8' }}>=</span>
        <span style={{ color: '#a5f3c4' }}>&quot;{pid}&quot;</span>
        <span style={{ color: '#7dd3fc' }}>&gt;&lt;/script&gt;</span>
      </CodeBlock>

      {/* React component */}
      <p
        className="text-xs font-semibold uppercase tracking-wider mb-1.5 mt-5"
        style={{ color: '#8b8680' }}
      >
        React component
      </p>
      <CodeBlock copyText={reactSnippet} label="JSX">
        <span style={{ color: '#6b7280' }}>// npm install @selfimprove/react</span>
        {'\n'}
        <span style={{ color: '#c084fc' }}>import</span>
        {' { '}
        <span style={{ color: '#e2e8f0' }}>FeedbackWidget</span>
        {' } '}
        <span style={{ color: '#c084fc' }}>from</span>{' '}
        <span style={{ color: '#a5f3c4' }}>&apos;@selfimprove/react&apos;</span>
        {'\n\n'}
        <span style={{ color: '#7dd3fc' }}>&lt;FeedbackWidget</span>{' '}
        <span style={{ color: '#fbbf24' }}>projectId</span>
        <span style={{ color: '#94a3b8' }}>=</span>
        <span style={{ color: '#a5f3c4' }}>&quot;{pid}&quot;</span>
        {' '}
        <span style={{ color: '#7dd3fc' }}>/&gt;</span>
      </CodeBlock>
      <p className="text-xs mt-1.5" style={{ color: '#8b8680' }}>
        npm package coming soon
      </p>

      {/* Agent prompt */}
      <p
        className="text-xs font-semibold uppercase tracking-wider mb-1.5 mt-5"
        style={{ color: '#8b8680' }}
      >
        Or paste this to your AI coding agent
      </p>
      <CodeBlock copyText={agentPrompt} copyLabel="Copy prompt" label="Prompt">
        <span style={{ color: '#a5f3c4' }}>&quot;{agentPrompt}&quot;</span>
      </CodeBlock>

      {/* Customize tags */}
      <div className="mt-5">
        <label
          className="flex items-center gap-1.5 text-sm font-medium mb-1.5"
          style={{ color: '#1a1a2e' }}
        >
          <Tag size={14} style={{ color: '#6366f1' }} />
          Customize tags
        </label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors"
          style={{
            borderColor: '#e8e4de',
            color: '#1a1a2e',
            backgroundColor: '#ffffff',
          }}
          placeholder="bug, confusing, slow, missing feature, love it"
        />
        <p className="text-xs mt-1" style={{ color: '#8b8680' }}>
          Comma-separated. Users pick from these when leaving feedback.
        </p>
      </div>

      {/* Divider */}
      <div
        className="border-t my-6"
        style={{ borderColor: '#e8e4de' }}
      />

      {/* Agent Instructions (Step 3b) */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl"
          style={{ backgroundColor: '#eef2ff' }}
        >
          <Bot size={20} style={{ color: '#6366f1' }} />
        </div>
        <div>
          <h3
            className="text-base font-semibold"
            style={{ color: '#1a1a2e' }}
          >
            Tell your coding agent about SelfImprove
          </h3>
          <p className="text-xs" style={{ color: '#8b8680' }}>
            Optional &mdash; gives your AI coding agent context about the live roadmap
          </p>
        </div>
      </div>

      <p className="text-sm mb-3" style={{ color: '#8b8680' }}>
        If you use Claude Code, Cursor, or Codex, adding this context to your agent config means
        your agent can reference the live roadmap and user evidence when building features.
      </p>

      {/* Agent instructions card */}
      <div
        className="rounded-xl border overflow-hidden mb-4"
        style={{ borderColor: '#e8e4de' }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2.5 border-b"
          style={{ backgroundColor: '#faf8f5', borderColor: '#e8e4de' }}
        >
          <Bot size={14} style={{ color: '#6366f1' }} />
          <span
            className="text-xs font-semibold"
            style={{ color: '#1a1a2e' }}
          >
            Agent Instructions
          </span>
        </div>
        <div className="p-4">
          <p className="text-xs mb-3" style={{ color: '#8b8680' }}>
            Copy this into your CLAUDE.md, .cursorrules, or agent system prompt.
            This gives your coding agent context about the live product roadmap so it can
            reference real user evidence when building features.
          </p>
          <CodeBlock copyText={agentInstructions} copyLabel="Copy to clipboard" label="Markdown">
            <span style={{ color: '#a5f3c4' }}>## SelfImprove Integration</span>
            {'\n'}
            <span style={{ color: '#e2e8f0' }}>This project uses SelfImprove (selfimprove.dev) for AI product management.</span>
            {'\n'}
            <span style={{ color: '#e2e8f0' }}>Dashboard: </span>
            <span style={{ color: '#7dd3fc' }}>https://selfimprove.dev/p/{pid}</span>
            {'\n\n'}
            <span style={{ color: '#a5f3c4' }}>### Context for coding agents</span>
            {'\n'}
            <span style={{ color: '#e2e8f0' }}>- A feedback widget is embedded on all pages (bottom-right corner)</span>
            {'\n'}
            <span style={{ color: '#e2e8f0' }}>- User signals feed a live product roadmap</span>
            {'\n'}
            <span style={{ color: '#e2e8f0' }}>- Each roadmap item has: evidence, acceptance criteria, and a PRD</span>
            {'\n'}
            <span style={{ color: '#e2e8f0' }}>- Follow the PRD&apos;s acceptance criteria when implementing</span>
            {'\n'}
            <span style={{ color: '#e2e8f0' }}>- Reference roadmap items in commits: &quot;Implements roadmap #&lt;id&gt;&quot;</span>
            {'\n'}
            <span style={{ color: '#e2e8f0' }}>- Feedback API: /api/feedback (POST)</span>
          </CodeBlock>
          <div className="flex flex-wrap gap-2 mt-3">
            <CopyButton text={agentInstructions} label="Copy agent instructions" />
            <button
              type="button"
              className="text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
              style={{ color: '#6366f1', backgroundColor: '#eef2ff' }}
            >
              Add to CLAUDE.md
            </button>
          </div>
        </div>
      </div>

      {/* Quick prompt card */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: '#e8e4de' }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2.5 border-b"
          style={{ backgroundColor: '#faf8f5', borderColor: '#e8e4de' }}
        >
          <MessageCircle size={14} style={{ color: '#6366f1' }} />
          <span
            className="text-xs font-semibold"
            style={{ color: '#1a1a2e' }}
          >
            Quick prompt for your agent
          </span>
        </div>
        <div className="p-4">
          <p className="text-xs mb-3" style={{ color: '#8b8680' }}>
            Paste this into your coding agent to have it check what users are asking for:
          </p>
          <CodeBlock copyText={agentQuickPrompt} copyLabel="Copy prompt" label="Prompt">
            <span style={{ color: '#a5f3c4' }}>&quot;{agentQuickPrompt}&quot;</span>
          </CodeBlock>
        </div>
      </div>
    </div>
  )
}
