'use client'

import { useState } from 'react'

const ONE_LINER = `Read https://selfimprove-iota.vercel.app/setup and follow the instructions to set up SelfImprove`

export function AgentOneLiner() {
  const [copied, setCopied] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(ONE_LINER)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
        className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded text-[10px] font-medium z-10 transition-all"
        style={{
          backgroundColor: copied ? 'rgba(5,150,105,0.3)' : 'rgba(255,255,255,0.15)',
          color: copied ? '#6ee7b7' : '#94a3b8',
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre
        className="bg-[#1a1a2e] rounded-lg p-3 pr-14 font-mono text-[12px] leading-relaxed text-left whitespace-pre-wrap"
        style={{ color: '#a5f3c4', margin: 0 }}
      >
        {ONE_LINER}
      </pre>
    </div>
  )
}

const PROMPT = `Set up SelfImprove for this project. Get my GitHub token with "gh auth token", then call POST https://selfimprove-iota.vercel.app/api/cli/init with Authorization: Bearer GITHUB_TOKEN and body: {"repo_url": "THIS_REPO_URL", "site_url": "PRODUCTION_URL"}. Open the dashboard_url from the response.`

export function CopyPrompt() {
  const [copied, setCopied] = useState(false)

  return (
    <div className="rounded-[16px] border-2 p-6 text-center" style={{ borderColor: '#0d9488', backgroundColor: '#faf8f5' }}>
      <p className="text-sm font-semibold mb-3" style={{ color: '#1a1a2e' }}>
        Paste into your coding agent
      </p>
      <div className="relative">
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(PROMPT)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          className="absolute top-2 right-2 px-2.5 py-1 rounded-md text-xs font-medium z-10 transition-all"
          style={{
            backgroundColor: copied ? 'rgba(5,150,105,0.3)' : 'rgba(255,255,255,0.15)',
            color: copied ? '#6ee7b7' : '#94a3b8',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <pre
          className="bg-[#1a1a2e] rounded-xl p-4 pr-16 font-mono text-xs leading-relaxed text-left whitespace-pre-wrap"
          style={{ color: '#a5f3c4', margin: 0 }}
        >
          {PROMPT}
        </pre>
      </div>
      <ol className="text-left mt-4 space-y-1 text-xs" style={{ color: '#8b8680' }}>
        <li><span className="font-semibold" style={{ color: '#0d9488' }}>1.</span> Paste the prompt above into Claude Code, Cursor, or Codex</li>
        <li><span className="font-semibold" style={{ color: '#0d9488' }}>2.</span> Your agent creates the project and opens your dashboard</li>
        <li><span className="font-semibold" style={{ color: '#0d9488' }}>3.</span> Your roadmap populates within minutes</li>
      </ol>
    </div>
  )
}
