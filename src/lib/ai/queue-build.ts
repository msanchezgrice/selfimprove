import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/crypto'

export async function queueImplementJob(
  roadmapItemId: string,
  projectId: string,
  repoUrl: string,
  githubToken: string,
  prompt: string,
) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('build_jobs')
    .insert({
      roadmap_item_id: roadmapItemId,
      project_id: projectId,
      job_type: 'implement',
      repo_url: repoUrl,
      github_token: encrypt(githubToken),
      prompt,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function queueScanJob(
  projectId: string,
  repoUrl: string,
  githubToken: string,
) {
  const supabase = createAdminClient()

  const prompt = `Analyze this codebase thoroughly. Look for:
1. BUGS: Runtime errors, logic bugs, edge cases that would break
2. SECURITY: SQL injection, XSS, auth bypasses, exposed secrets, insecure dependencies
3. PERFORMANCE: N+1 queries, missing indexes, unnecessary re-renders, large bundles, missing caching
4. ACCESSIBILITY: Missing alt text, no keyboard nav, missing ARIA, color contrast
5. CODE QUALITY: Dead code, duplicated logic, missing error handling, inconsistent patterns
6. MISSING TESTS: Critical paths without test coverage
7. UX ISSUES: Confusing flows, missing loading states, no error messages, broken mobile

For each finding, output a JSON object with:
{"findings": [{"category": "bug|security|performance|accessibility|quality|tests|ux", "severity": "high|medium|low", "title": "short title", "description": "what's wrong and how to fix it", "file": "path/to/file.ts", "line": 123}]}

Be thorough. Read the actual code, don't just guess from file names.`

  const { data, error } = await supabase
    .from('build_jobs')
    .insert({
      project_id: projectId,
      job_type: 'scan',
      repo_url: repoUrl,
      github_token: encrypt(githubToken),
      prompt,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}
