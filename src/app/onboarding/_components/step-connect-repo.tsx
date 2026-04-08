'use client'

import { GitBranch } from 'lucide-react'

type StepConnectRepoProps = {
  projectName: string
  setProjectName: (v: string) => void
  repoUrl: string
  setRepoUrl: (v: string) => void
  siteUrl: string
  setSiteUrl: (v: string) => void
  framework: string
  setFramework: (v: string) => void
}

const frameworks = [
  { value: 'nextjs', label: 'Next.js' },
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'other', label: 'Other' },
]

export function StepConnectRepo({
  projectName,
  setProjectName,
  repoUrl,
  setRepoUrl,
  siteUrl,
  setSiteUrl,
  framework,
  setFramework,
}: StepConnectRepoProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-6">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl"
          style={{ backgroundColor: '#eef2ff' }}
        >
          <GitBranch size={20} style={{ color: '#6366f1' }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: '#1a1a2e' }}>
            Connect your repository
          </h2>
          <p className="text-sm" style={{ color: '#8b8680' }}>
            Link a GitHub repo to get started
          </p>
        </div>
      </div>

      <div>
        <label
          htmlFor="project-name"
          className="block text-sm font-medium mb-1.5"
          style={{ color: '#1a1a2e' }}
        >
          Project name <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          id="project-name"
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="My Awesome App"
          className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none transition-colors focus:ring-2 focus:ring-offset-1"
          style={{
            borderColor: '#e8e4de',
            color: '#1a1a2e',
            backgroundColor: '#ffffff',
          }}
        />
      </div>

      <div>
        <label
          htmlFor="repo-url"
          className="block text-sm font-medium mb-1.5"
          style={{ color: '#1a1a2e' }}
        >
          GitHub repo URL
        </label>
        <input
          id="repo-url"
          type="url"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/your-org/your-repo"
          className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none transition-colors focus:ring-2 focus:ring-offset-1"
          style={{
            borderColor: '#e8e4de',
            color: '#1a1a2e',
            backgroundColor: '#ffffff',
          }}
        />
        <p className="mt-1 text-xs" style={{ color: '#8b8680' }}>
          Full GitHub OAuth repo picker coming soon
        </p>
      </div>

      <div>
        <label
          htmlFor="site-url"
          className="block text-sm font-medium mb-1.5"
          style={{ color: '#1a1a2e' }}
        >
          Site URL
        </label>
        <input
          id="site-url"
          type="url"
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
          placeholder="https://myapp.com"
          className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none transition-colors focus:ring-2 focus:ring-offset-1"
          style={{
            borderColor: '#e8e4de',
            color: '#1a1a2e',
            backgroundColor: '#ffffff',
          }}
        />
      </div>

      <div>
        <label
          htmlFor="framework"
          className="block text-sm font-medium mb-1.5"
          style={{ color: '#1a1a2e' }}
        >
          Framework
        </label>
        <select
          id="framework"
          value={framework}
          onChange={(e) => setFramework(e.target.value)}
          className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none transition-colors focus:ring-2 focus:ring-offset-1 appearance-none bg-white"
          style={{
            borderColor: '#e8e4de',
            color: framework ? '#1a1a2e' : '#8b8680',
          }}
        >
          <option value="">Auto-detect</option>
          {frameworks.map((fw) => (
            <option key={fw.value} value={fw.value}>
              {fw.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
