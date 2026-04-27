import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { syncSkillRegistry } from '@/lib/brain/skill-registry'
import { verifySecret } from '@/lib/auth/verify-secret'

/**
 * Skill registry sync cron.
 *
 * Syncs `docs/brain/skills/*.md` into `brain_skill_files` so the DB mirror
 * the spec calls "the auditable source of truth" stays fresh. Safe to run
 * often — the sync is diff-based and only writes when content differs.
 *
 * Also retires DB rows whose slugs are no longer in the typed registry,
 * keeping the skill table MECE without dropping history.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader || !verifySecret(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const report = await syncSkillRegistry(supabase)
  return NextResponse.json(report)
}
