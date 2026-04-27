/**
 * scripts/cold-start-cluster.ts
 *
 * One-shot: cluster the existing roadmap_items backlog (typically 1,000+
 * pre-v1.1 briefs) into a small set of opportunity_clusters, link each
 * brief back via opportunity_cluster_id, and seed each cluster's
 * latest_brief_md with a short synthesis comment.
 *
 * Usage:
 *   tsx scripts/cold-start-cluster.ts <projectId>
 *   tsx scripts/cold-start-cluster.ts <projectId> --dry-run
 *   tsx scripts/cold-start-cluster.ts <projectId> --limit 200
 */

import { createClient } from '@supabase/supabase-js'

import { applyColdStartCluster } from '../src/lib/brain/cold-start-cluster'

async function main() {
  const projectId = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  const limitArgIdx = process.argv.indexOf('--limit')
  const limit = limitArgIdx > 0 ? Number.parseInt(process.argv[limitArgIdx + 1] ?? '', 10) : undefined

  if (!projectId) {
    console.error('Usage: tsx scripts/cold-start-cluster.ts <projectId> [--dry-run] [--limit N]')
    process.exit(1)
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const report = await applyColdStartCluster(supabase, projectId, { dryRun, limit })

  console.log(JSON.stringify(report, null, 2))
  if (report.errors.length > 0) {
    console.error(`[cold-start] ${report.errors.length} error(s).`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[cold-start] fatal:', err)
  process.exit(1)
})
