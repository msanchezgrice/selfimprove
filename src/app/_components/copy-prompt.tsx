'use client'

import { useState } from 'react'

const PROMPT = `Set up SelfImprove for this project.

1. Get my GitHub token by running: gh auth token

2. Call this API to create the project:
   curl -X POST https://selfimprove-iota.vercel.app/api/cli/init \\
     -H "Authorization: Bearer GITHUB_TOKEN" \\
     -H "Content-Type: application/json" \\
     -d '{"repo_url": "THIS_REPO_URL", "site_url": "PRODUCTION_URL"}'

3. Open the dashboard_url from the response in my browser.`

export function CopyPrompt() {
  const [copied, setCopied] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(PROMPT)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
        className="absolute top-3 right-3 px-3 py-1.5 rounded-lg text-xs font-medium transition-all z-10"
        style={{
          backgroundColor: copied ? 'rgba(5, 150, 105, 0.2)' : 'rgba(255,255,255,0.1)',
          color: copied ? '#6ee7b7' : '#94a3b8',
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre
        className="bg-[#1a1a2e] rounded-[14px] p-6 pr-20 font-mono text-[13px] leading-[1.8] overflow-x-auto text-left whitespace-pre-wrap"
        style={{ color: '#e2e0dc', margin: 0 }}
      >
        {PROMPT}
      </pre>
    </div>
  )
}
