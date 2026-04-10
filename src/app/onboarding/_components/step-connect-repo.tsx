'use client'

import { useState, useMemo } from 'react'
import { GitBranch, Search, Lock, Loader2, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'

type GitHubRepo = {
  full_name: string
  name: string
  html_url: string
  description: string | null
  language: string | null
  default_branch: string
  private: boolean
  updated_at: string
}

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

function CliOption() {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const prompt = `Set up SelfImprove for this project.\n\n1. Get my GitHub token by running: gh auth token\n2. Call POST https://selfimprove-iota.vercel.app/api/cli/init with Authorization: Bearer GITHUB_TOKEN and body: {"repo_url": "THIS_REPO_URL", "site_url": "PRODUCTION_URL"}\n3. Open the dashboard_url from the response in my browser.`

  return (
    <div className="mb-4 rounded-xl border" style={{ borderColor: '#e8e4de' }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm"
        style={{ color: '#8b8680' }}
      >
        <span>Or set up via CLI — paste into Claude Code, Cursor, or Codex</span>
        <span style={{ fontSize: '12px' }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <div className="relative">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(prompt)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="absolute top-2 right-2 px-2.5 py-1 rounded-md text-xs font-medium z-10"
              style={{
                backgroundColor: copied ? 'rgba(5,150,105,0.2)' : 'rgba(255,255,255,0.15)',
                color: copied ? '#6ee7b7' : '#94a3b8',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <pre
              className="rounded-lg p-3 pr-16 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap"
              style={{ backgroundColor: '#1a1a2e', color: '#e2e0dc', margin: 0 }}
            >
              {prompt}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

const frameworks = [
  { value: 'nextjs', label: 'Next.js' },
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'other', label: 'Other' },
]

const languageToFramework: Record<string, string> = {
  TypeScript: 'nextjs',
  JavaScript: 'nextjs',
  Vue: 'vue',
  Svelte: 'svelte',
}

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
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoError, setRepoError] = useState<string | null>(null)
  const [reposFetched, setReposFetched] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [autoDetected, setAutoDetected] = useState<{ field: string; value: string }[]>([])
  const [tokenExpired, setTokenExpired] = useState(false)

  const handleReconnect = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/onboarding`,
        scopes: 'repo',
      },
    })
  }

  const filteredRepos = useMemo(() => {
    if (!searchQuery) return repos
    const q = searchQuery.toLowerCase()
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    )
  }, [repos, searchQuery])

  const fetchRepos = async () => {
    setLoadingRepos(true)
    setRepoError(null)
    try {
      const res = await fetch('/api/github/repos')
      if (!res.ok) {
        const body = await res.json()
        if (res.status === 400 && body.error?.includes('Re-login')) {
          setTokenExpired(true)
          setRepoError('GitHub token expired.')
        } else {
          setRepoError(body.error || 'Failed to fetch repos')
        }
        return
      }
      const data = await res.json()
      setRepos(data.repos)
      setReposFetched(true)
    } catch {
      setRepoError('Network error fetching repos')
    } finally {
      setLoadingRepos(false)
    }
  }

  const selectRepo = (repo: GitHubRepo) => {
    setSelectedRepo(repo)
    setRepoUrl(repo.html_url)

    const detected: { field: string; value: string }[] = []

    // Auto-fill project name from repo name
    if (!projectName) {
      const prettyName = repo.name
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
      setProjectName(prettyName)
      detected.push({ field: 'Project name', value: prettyName })
    }

    // Auto-detect framework from language
    if (!framework && repo.language) {
      const detectedFw = languageToFramework[repo.language]
      if (detectedFw) {
        setFramework(detectedFw)
        const label = frameworks.find((f) => f.value === detectedFw)?.label ?? detectedFw
        detected.push({ field: 'Framework', value: label })
      }
    }

    detected.push({ field: 'Repo URL', value: repo.html_url })
    setAutoDetected(detected)
  }

  const clearSelection = () => {
    setSelectedRepo(null)
    setAutoDetected([])
  }

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

      {/* CLI alternative */}
      <CliOption />

      {/* GitHub repo picker */}
      {!reposFetched && !selectedRepo && (
        <div>
          <button
            type="button"
            onClick={fetchRepos}
            disabled={loadingRepos}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-sm font-medium transition-colors"
            style={{
              borderColor: '#e8e4de',
              color: '#1a1a2e',
              backgroundColor: '#faf8f5',
            }}
          >
            {loadingRepos ? (
              <>
                <Loader2 size={16} className="animate-spin" style={{ color: '#6366f1' }} />
                Loading repos...
              </>
            ) : (
              <>
                <GitBranch size={16} />
                Connect via GitHub
              </>
            )}
          </button>
          {repoError && (
            <div
              className="flex items-start gap-2 mt-2 p-3 rounded-xl text-sm"
              style={{ backgroundColor: tokenExpired ? '#fffbeb' : '#fef2f2', color: tokenExpired ? '#92400e' : '#dc2626' }}
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="flex flex-col gap-2">
                {tokenExpired ? (
                  <>
                    <span>Your GitHub session has expired.</span>
                    <button
                      type="button"
                      onClick={handleReconnect}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: '#1a1a2e',
                        color: '#ffffff',
                      }}
                    >
                      <RefreshCw size={14} />
                      Re-connect GitHub
                    </button>
                  </>
                ) : (
                  <span>{repoError}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Repo list dropdown */}
      {reposFetched && !selectedRepo && (
        <div>
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: '#e8e4de' }}
          >
            <div
              className="flex items-center gap-2 px-3 py-2 border-b"
              style={{ borderColor: '#e8e4de', backgroundColor: '#faf8f5' }}
            >
              <Search size={14} style={{ color: '#8b8680' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search repositories..."
                className="flex-1 text-sm bg-transparent outline-none"
                style={{ color: '#1a1a2e' }}
              />
              <span className="text-xs" style={{ color: '#8b8680' }}>
                {filteredRepos.length} repos
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filteredRepos.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm" style={{ color: '#8b8680' }}>
                  No repos found
                </div>
              ) : (
                filteredRepos.map((repo) => (
                  <button
                    key={repo.full_name}
                    type="button"
                    onClick={() => selectRepo(repo)}
                    className="w-full text-left px-4 py-2.5 border-b last:border-b-0 transition-colors hover:bg-gray-50"
                    style={{ borderColor: '#f0ede8' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: '#1a1a2e' }}>
                        {repo.full_name}
                      </span>
                      {repo.private && (
                        <Lock size={12} style={{ color: '#8b8680' }} />
                      )}
                      {repo.language && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-md shrink-0"
                          style={{ backgroundColor: '#f5f3ef', color: '#8b8680' }}
                        >
                          {repo.language}
                        </span>
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: '#8b8680' }}>
                        {repo.description}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setReposFetched(false); setRepos([]) }}
            className="mt-2 text-xs font-medium"
            style={{ color: '#8b8680' }}
          >
            or enter URL manually
          </button>
        </div>
      )}

      {/* Selected repo badge + auto-detected fields */}
      {selectedRepo && (
        <div>
          <div
            className="flex items-center justify-between px-3 py-2.5 rounded-xl border"
            style={{ borderColor: '#d1fae5', backgroundColor: '#ecfdf5' }}
          >
            <div className="flex items-center gap-2">
              <GitBranch size={16} style={{ color: '#059669' }} />
              <span className="text-sm font-medium" style={{ color: '#065f46' }}>
                {selectedRepo.full_name}
              </span>
              {selectedRepo.private && (
                <Lock size={12} style={{ color: '#059669' }} />
              )}
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs font-medium"
              style={{ color: '#059669' }}
            >
              Change
            </button>
          </div>
          {autoDetected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {autoDetected.map((d) => (
                <span
                  key={d.field}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                  style={{ backgroundColor: '#ecfdf5', color: '#059669' }}
                >
                  <CheckCircle2 size={12} />
                  {d.field} detected
                </span>
              ))}
            </div>
          )}
        </div>
      )}

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
            backgroundColor: selectedRepo ? '#faf8f5' : '#ffffff',
          }}
          readOnly={!!selectedRepo}
        />
        {!selectedRepo && !reposFetched && (
          <p className="mt-1 text-xs" style={{ color: '#8b8680' }}>
            Or use the GitHub button above to pick from your repos
          </p>
        )}
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
