import { execaCommand } from 'execa'
import { createClient } from '@supabase/supabase-js'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

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
  // Create temp directory
  const workDir = await mkdtemp(join(tmpdir(), 'selfimprove-'))

  try {
    // Extract repo info
    const repoMatch = job.repo_url.match(/github\.com\/([^/]+\/[^/]+)/)
    if (!repoMatch) throw new Error('Invalid repo URL')
    const repo = repoMatch[1].replace(/\.git$/, '')

    // Clone the repo
    const cloneUrl = `https://x-access-token:${job.github_token}@github.com/${repo}.git`
    console.log(`[worker] Cloning ${repo}...`)
    await execaCommand(`git clone --depth 50 ${cloneUrl} ${workDir}`, { timeout: 120_000 })

    if (job.job_type === 'implement') {
      return await runImplement(job, workDir, repo)
    } else {
      return await runScan(job, workDir)
    }
  } finally {
    // Cleanup
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function runImplement(job: BuildJob, workDir: string, repo: string): Promise<Record<string, unknown>> {
  // Create a branch
  const branchName = `selfimprove/auto-${Date.now()}`
  await execaCommand(`git checkout -b ${branchName}`, { cwd: workDir })

  // Run Claude Code with the implementation prompt
  console.log(`[worker] Running Claude Code for implementation...`)
  const escapedPrompt = job.prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  const { stdout } = await execaCommand(
    `claude -p "${escapedPrompt}" --allowedTools Edit,Write,Bash,Read,Glob,Grep --output-format text`,
    {
      cwd: workDir,
      timeout: 600_000, // 10 minute timeout
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
    },
  )

  console.log(`[worker] Claude Code output: ${stdout.slice(0, 500)}`)

  // Check if there are changes
  const { stdout: diffStat } = await execaCommand('git diff --stat', { cwd: workDir })
  const { stdout: untrackedFiles } = await execaCommand('git ls-files --others --exclude-standard', { cwd: workDir })

  if (!diffStat.trim() && !untrackedFiles.trim()) {
    throw new Error('Claude Code made no changes')
  }

  // Stage and commit
  await execaCommand('git add -A', { cwd: workDir })
  await execaCommand(
    `git commit -m "feat: ${job.prompt.slice(0, 50)}...\n\nImplemented by SelfImprove AI"`,
    { cwd: workDir },
  )

  // Push
  await execaCommand(`git push origin ${branchName}`, { cwd: workDir })

  // Create PR
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

  // Update roadmap item
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
  // Run Claude Code with the scan prompt
  console.log(`[worker] Running Claude Code for codebase scan...`)
  const escapedPrompt = job.prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  const { stdout } = await execaCommand(
    `claude -p "${escapedPrompt}" --allowedTools Read,Glob,Grep,Bash --output-format text`,
    {
      cwd: workDir,
      timeout: 600_000,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
    },
  )

  // Parse findings from Claude's output
  let findings: Array<Record<string, unknown>> = []
  try {
    const jsonMatch = stdout.match(/\{[\s\S]*"findings"[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { findings?: Array<Record<string, unknown>> }
      findings = parsed.findings || []
    }
  } catch {
    // If can't parse JSON, treat the whole output as a single finding
    findings = [{ category: 'quality', severity: 'medium', title: 'Codebase Analysis', description: stdout.slice(0, 5000) }]
  }

  // Create signals from findings
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
    findings: findings.slice(0, 20), // Store first 20 in result
  }
}
