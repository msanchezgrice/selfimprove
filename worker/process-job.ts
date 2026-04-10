import { execSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function run(cmd: string, opts: { cwd?: string; timeout?: number } = {}): string {
  return execSync(cmd, {
    cwd: opts.cwd,
    timeout: opts.timeout || 120_000,
    encoding: 'utf-8',
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

interface BuildJob {
  id: string
  roadmap_item_id: string | null
  project_id: string
  job_type: 'implement' | 'scan'
  repo_url: string
  github_token: string
  prompt: string
}

export async function processJob(job: BuildJob): Promise<Record<string, unknown>> {
  const workDir = await mkdtemp(join(tmpdir(), 'selfimprove-'))

  try {
    const repoMatch = job.repo_url.match(/github\.com\/([^/]+\/[^/]+)/)
    if (!repoMatch) throw new Error('Invalid repo URL')
    const repo = repoMatch[1].replace(/\.git$/, '')

    const cloneUrl = `https://x-access-token:${job.github_token}@github.com/${repo}.git`
    console.log(`[worker] Cloning ${repo}...`)
    run(`git clone --depth 50 ${cloneUrl} ${workDir}`)

    if (job.job_type === 'implement') {
      return await runImplement(job, workDir, repo)
    } else {
      return await runScan(job, workDir)
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function runImplement(job: BuildJob, workDir: string, repo: string): Promise<Record<string, unknown>> {
  // Set git identity for commits
  run('git config user.email "bot@selfimprove.dev"', { cwd: workDir })
  run('git config user.name "SelfImprove Bot"', { cwd: workDir })

  const branchName = `selfimprove/auto-${Date.now()}`
  run(`git checkout -b ${branchName}`, { cwd: workDir })

  console.log(`[worker] Running Claude Code for implementation...`)

  // Write prompt and constraints to temp files
  const { writeFile } = await import('fs/promises')
  const promptFile = join(workDir, '.selfimprove-prompt.txt')
  await writeFile(promptFile, job.prompt)

  // Add CLAUDE.md to prevent Claude from running npm install (OOM risk)
  const claudeMd = join(workDir, 'CLAUDE.md')
  await writeFile(claudeMd, `# Worker Constraints
- Do NOT run npm install, npm ci, or any package manager install commands
- Do NOT run the dev server or build commands
- Focus only on editing source files to implement the requested changes
- Dependencies are already installed
- Make minimal, focused changes
`)

  const stdout = run(
    `claude -p "$(cat ${promptFile})" --allowedTools Edit,Write,Read,Glob,Grep --output-format text`,
    { cwd: workDir, timeout: 600_000 },
  )

  console.log(`[worker] Claude Code output: ${stdout.slice(0, 500)}`)

  const diffStat = run('git diff --stat', { cwd: workDir })
  const untrackedFiles = run('git ls-files --others --exclude-standard', { cwd: workDir })

  if (!diffStat && !untrackedFiles) {
    throw new Error('Claude Code made no changes')
  }

  run('git add -A', { cwd: workDir })
  const commitMsg = `feat: ${job.prompt.slice(0, 50).replace(/"/g, "'").replace(/\n/g, ' ')}...\n\nImplemented by SelfImprove AI`
  run(`git commit -m "${commitMsg}"`, { cwd: workDir })
  run(`git push origin ${branchName}`, { cwd: workDir })

  const prBody = `## Auto-Implementation\n\n${job.prompt.slice(0, 500)}\n\n---\n*Auto-implemented by [SelfImprove](https://selfimprove-iota.vercel.app)*`

  const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${job.github_token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'SelfImprove-Worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: job.prompt.slice(0, 80),
      body: prBody,
      head: branchName,
      base: 'main',
    }),
  })

  if (!prRes.ok) {
    const err = await prRes.text()
    throw new Error(`PR creation failed: ${err}`)
  }

  const pr = (await prRes.json()) as { html_url: string; number: number }

  if (job.roadmap_item_id) {
    await supabase
      .from('roadmap_items')
      .update({
        build_status: 'pr_created',
        pr_url: pr.html_url,
        pr_number: pr.number,
      })
      .eq('id', job.roadmap_item_id)
  }

  return {
    type: 'implement',
    prUrl: pr.html_url,
    prNumber: pr.number,
    branch: branchName,
    claudeOutput: stdout.slice(0, 2000),
  }
}

async function runScan(job: BuildJob, workDir: string): Promise<Record<string, unknown>> {
  console.log(`[worker] Running Claude Code for codebase scan...`)

  const { writeFile } = await import('fs/promises')
  const promptFile = join(workDir, '.selfimprove-prompt.txt')
  await writeFile(promptFile, job.prompt)

  // Add constraints for scan (read-only, no installs)
  const claudeMd = join(workDir, 'CLAUDE.md')
  await writeFile(claudeMd, `# Worker Constraints
- Do NOT run npm install or any package manager commands
- Do NOT modify any files — this is a read-only scan
- Focus on reading and analyzing the codebase
`)

  const stdout = run(
    `claude -p "$(cat ${promptFile})" --allowedTools Read,Glob,Grep --output-format text`,
    { cwd: workDir, timeout: 600_000 },
  )

  let findings: Array<Record<string, unknown>> = []
  try {
    const jsonMatch = stdout.match(/\{[\s\S]*"findings"[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { findings?: Array<Record<string, unknown>> }
      findings = parsed.findings || []
    }
  } catch {
    findings = [{ category: 'quality', severity: 'medium', title: 'Codebase Analysis', description: stdout.slice(0, 5000) }]
  }

  if (findings.length > 0) {
    const signals = findings.map(f => ({
      project_id: job.project_id,
      type: 'builder' as const,
      title: (f.title as string) || 'Codebase finding',
      content: (f.description as string) || '',
      metadata: {
        source: 'codebase_scan',
        category: f.category,
        severity: f.severity,
        file: f.file,
        line: f.line,
      },
      weight: f.severity === 'high' ? 4 : f.severity === 'medium' ? 2 : 1,
    }))

    await supabase.from('signals').insert(signals)
  }

  return {
    type: 'scan',
    findingsCount: findings.length,
    findings: findings.slice(0, 20),
  }
}
