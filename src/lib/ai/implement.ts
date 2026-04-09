import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

let _client: Anthropic | null = null
function getClient() {
  if (!_client) _client = new Anthropic()
  return _client
}

interface FileChange {
  path: string
  content: string
  action: 'create' | 'update'
}

interface ImplementationResult {
  branch: string
  prUrl: string
  prNumber: number
  filesChanged: number
}

export async function implementRoadmapItem(
  itemId: string,
  githubToken: string,
): Promise<ImplementationResult | null> {
  const admin = createAdminClient()

  // Get the roadmap item + project
  const { data: item } = await admin
    .from('roadmap_items')
    .select('*, projects(repo_url, name, framework)')
    .eq('id', itemId)
    .single()

  if (!item || !item.prd_content) return null

  const project = item.projects as unknown as {
    repo_url: string | null
    name: string
    framework: string | null
  }
  if (!project?.repo_url) return null

  const repoMatch = project.repo_url.match(/github\.com\/([^/]+\/[^/]+)/)
  if (!repoMatch) return null
  const repo = repoMatch[1].replace(/\.git$/, '')

  // Update build status
  await admin
    .from('roadmap_items')
    .update({ build_status: 'pr_creating' })
    .eq('id', itemId)

  const prd = item.prd_content as Record<string, unknown>

  // 1. Get repo file tree for context
  const ghHeaders = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'SelfImprove-App',
  }

  const treeRes = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`,
    { headers: ghHeaders },
  )

  let fileTree = ''
  if (treeRes.ok) {
    const tree = await treeRes.json()
    const files = tree.tree
      ?.filter(
        (f: { type: string; path: string }) =>
          f.type === 'blob' &&
          !f.path.includes('node_modules') &&
          !f.path.includes('.next'),
      )
      .map((f: { path: string }) => f.path)
    fileTree = files?.slice(0, 200).join('\n') || ''
  }

  // 2. Read the specific files mentioned in PRD
  const filesToModify =
    (prd.files_to_modify as Array<{ path: string; changes: string }>) || []
  const fileContents: Record<string, string> = {}

  for (const f of filesToModify.slice(0, 10)) {
    try {
      const fileRes = await fetch(
        `https://api.github.com/repos/${repo}/contents/${f.path}`,
        {
          headers: {
            ...ghHeaders,
            Accept: 'application/vnd.github.v3.raw',
          },
        },
      )
      if (fileRes.ok) {
        fileContents[f.path] = await fileRes.text()
      }
    } catch {
      /* file might not exist yet */
    }
  }

  // 3. Call Claude to generate the implementation
  const client = getClient()
  const existingFilesContext = Object.entries(fileContents)
    .map(
      ([path, content]) =>
        `### ${path}\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\``,
    )
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: `You are a senior developer implementing a feature based on a PRD. Output ONLY a JSON array of file changes. Each entry has: {"path": "file/path.ts", "content": "full file content", "action": "create" or "update"}. Output valid JSON only, no markdown fences, no explanation.`,
    messages: [
      {
        role: 'user',
        content: `## PRD: ${item.title}

### Problem
${prd.problem || item.description}

### Solution
${prd.solution || ''}

### Acceptance Criteria
${((prd.acceptance_criteria as string[]) || []).map((c) => `- ${c}`).join('\n')}

### Files to Modify
${filesToModify.map((f) => `- ${f.path}: ${f.changes}`).join('\n')}

### Test Requirements
${((prd.test_requirements as string[]) || []).map((t) => `- ${t}`).join('\n')}

## Repository Context
Framework: ${project.framework || 'Unknown'}

### File Tree (partial)
${fileTree.slice(0, 3000)}

### Existing File Contents
${existingFilesContext}

Generate the complete file changes as a JSON array. For updated files, output the COMPLETE new file content. For new files, output the full content.`,
      },
    ],
  })

  // 4. Parse the response
  const responseText =
    response.content[0].type === 'text' ? response.content[0].text : ''

  let changes: FileChange[]
  try {
    // Try to parse directly, or extract JSON from the response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    changes = JSON.parse(jsonMatch?.[0] || responseText)
  } catch {
    console.error('[implement] Failed to parse Claude response')
    await admin
      .from('roadmap_items')
      .update({ build_status: 'approved' })
      .eq('id', itemId)
    return null
  }

  if (!changes || changes.length === 0) {
    await admin
      .from('roadmap_items')
      .update({ build_status: 'approved' })
      .eq('id', itemId)
    return null
  }

  // 5. Create branch via GitHub API
  const branchName = `selfimprove/${item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 50)}-${Date.now()}`

  // Get default branch SHA
  const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: ghHeaders,
  })
  const repoData = await repoRes.json()
  const defaultBranch = repoData.default_branch || 'main'

  const refRes = await fetch(
    `https://api.github.com/repos/${repo}/git/ref/heads/${defaultBranch}`,
    { headers: ghHeaders },
  )
  const refData = await refRes.json()
  const baseSha = refData.object?.sha

  if (!baseSha) {
    await admin
      .from('roadmap_items')
      .update({ build_status: 'approved' })
      .eq('id', itemId)
    return null
  }

  // Create the branch
  await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
    method: 'POST',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    }),
  })

  // 6. Commit each file change
  for (const change of changes) {
    const encoded = Buffer.from(change.content).toString('base64')

    // Check if file exists (to get its SHA for update)
    let existingSha: string | undefined
    if (change.action === 'update') {
      const existingRes = await fetch(
        `https://api.github.com/repos/${repo}/contents/${change.path}?ref=${branchName}`,
        { headers: ghHeaders },
      )
      if (existingRes.ok) {
        const existing = await existingRes.json()
        existingSha = existing.sha
      }
    }

    await fetch(
      `https://api.github.com/repos/${repo}/contents/${change.path}`,
      {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${change.action === 'create' ? 'Add' : 'Update'} ${change.path}\n\nImplements: ${item.title}\nSelfImprove roadmap item: ${itemId}`,
          content: encoded,
          branch: branchName,
          ...(existingSha ? { sha: existingSha } : {}),
        }),
      },
    )
  }

  // 7. Create PR
  const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: 'POST',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: item.title,
      body: `## ${item.title}\n\n${prd.problem || item.description}\n\n### Solution\n${prd.solution || ''}\n\n### Acceptance Criteria\n${((prd.acceptance_criteria as string[]) || [])
        .map((c) => `- [ ] ${c}`)
        .join('\n')}\n\n---\n*Auto-implemented by [SelfImprove](https://selfimprove-iota.vercel.app) — AI Product Manager*\n\nCloses #${item.github_issue_number || ''}`,
      head: branchName,
      base: defaultBranch,
    }),
  })

  if (!prRes.ok) {
    console.error('[implement] PR creation failed:', await prRes.text())
    await admin
      .from('roadmap_items')
      .update({ build_status: 'approved' })
      .eq('id', itemId)
    return null
  }

  const pr = await prRes.json()

  // 8. Update roadmap item
  await admin
    .from('roadmap_items')
    .update({
      build_status: 'pr_created',
      pr_url: pr.html_url,
      pr_number: pr.number,
    })
    .eq('id', itemId)

  return {
    branch: branchName,
    prUrl: pr.html_url,
    prNumber: pr.number,
    filesChanged: changes.length,
  }
}
