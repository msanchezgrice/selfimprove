/**
 * scripts/sync-skills.ts
 *
 * CLI wrapper around `syncSkillRegistry` for local / CI use. Reads
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment (same as
 * the worker) and syncs `docs/brain/skills/*.md` into `brain_skill_files`.
 *
 * Run with:
 *   tsx scripts/sync-skills.ts
 * or:
 *   npx -y tsx scripts/sync-skills.ts
 */

import { createClient } from '@supabase/supabase-js'

import { syncSkillRegistry } from '../src/lib/brain/skill-registry'

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[sync-skills] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const report = await syncSkillRegistry(supabase)

  console.log(JSON.stringify(report, null, 2))
  if (report.errors.length > 0) {
    console.error(`[sync-skills] ${report.errors.length} error(s). Exit 1.`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[sync-skills] fatal:', err)
  process.exit(1)
})
