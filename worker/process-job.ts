import { execFileSync, ExecFileSyncOptions } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function run(cmd: string, args: string[], opts?: ExecFileSyncOptions): string {
  return execFileSync(cmd, args, {
    timeout: 120_000, // 2min default for git commands
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
    encoding: 'utf-8', // must come last so spread can't override to Buffer
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
    run('git', ['clone', '--depth', '50', cloneUrl, workDir])

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
  const cwdOpts: ExecFileSyncOptions = { cwd: workDir }

  // Set git identity for commits
  run('git', ['config', 'user.email', 'bot@selfimprove.dev'], cwdOpts)
  run('git', ['config', 'user.name', 'SelfImprove Bot'], cwdOpts)

  const branchName = `selfimprove/auto-${Date.now()}`
  run('git', ['checkout', '-b', branchName], cwdOpts)

  console.log(`[worker] Running Claude Code for implementation...`)

  // Write prompt and constraints to temp files
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

  const claudeTimeout: ExecFileSyncOptions = { cwd: workDir, timeout: 1_800_000 }

  let stdout = ''
  try {
    // Read prompt file in Node.js instead of using $(cat ...) shell substitution
    const promptContent = await readFile(promptFile, 'utf-8')
    stdout = run('claude', ['-p', promptContent, '--allowedTools', 'Edit,Write,Read,Glob,Grep', '--output-format', 'text'], claudeTimeout)
  } catch (err) {
    console.log('[worker] First attempt failed, retrying with simplified prompt...')
    // Retry with a simpler, more focused prompt
    const simplePrompt = `Make the following changes to the codebase. Be minimal and focused.\n\n${job.prompt.slice(0, 2000)}`
    stdout = run('claude', ['-p', simplePrompt, '--allowedTools', 'Edit,Write,Read,Glob,Grep', '--output-format', 'text'], claudeTimeout)
  }

  console.log(`[worker] Claude Code output: ${stdout.slice(0, 500)}`)

  const diffStat = run('git', ['diff', '--stat'], cwdOpts)
  const untrackedFiles = run('git', ['ls-files', '--others', '--exclude-standard'], cwdOpts)

  if (!diffStat && !untrackedFiles) {
    throw new Error('Claude Code made no changes')
  }

  run('git', ['add', '-A'], cwdOpts)
  const commitMsg = `feat: ${job.prompt.slice(0, 50).replace(/"/g, "'").replace(/\n/g, ' ')}...\n\nImplemented by SelfImprove AI`
  run('git', ['commit', '-m', commitMsg], cwdOpts)
  run('git', ['push', 'origin', branchName], cwdOpts)

  const prBody = `## Auto-Implementation\n\n${job.prompt.slice(0, 500)}\n\n---\n*Auto-implemented by [SelfImprove](${process.env.NEXT_PUBLIC_APP_URL || 'https://selfimprove-iota.vercel.app'})*`

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

  const promptFile = join(workDir, '.selfimprove-prompt.txt')
  await writeFile(promptFile, job.prompt)

  // Add constraints for scan (read-only, no installs)
  const claudeMd = join(workDir, 'CLAUDE.md')
  await writeFile(claudeMd, `# Worker Constraints
- Do NOT run npm install or any package manager commands
- Do NOT modify any files — this is a read-only scan
- Focus on reading and analyzing the codebase
`)

  const claudeTimeout: ExecFileSyncOptions = { cwd: workDir, timeout: 1_800_000 }

  let stdout = ''
  try {
    // Read prompt file in Node.js instead of using $(cat ...) shell substitution
    const promptContent = await readFile(promptFile, 'utf-8')
    stdout = run('claude', ['-p', promptContent, '--allowedTools', 'Read,Glob,Grep', '--output-format', 'text'], claudeTimeout)
  } catch (err) {
    console.log('[worker] First scan attempt failed, retrying with simplified prompt...')
    const simplePrompt = `Analyze this codebase. Be concise.\n\n${job.prompt.slice(0, 2000)}`
    stdout = run('claude', ['-p', simplePrompt, '--allowedTools', 'Read,Glob,Grep', '--output-format', 'text'], claudeTimeout)
  }

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
