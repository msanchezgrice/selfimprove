import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ResolverAuditFix,
  ResolverAuditRow,
} from '@/lib/types/database'

/**
 * Record that a maintainer applied one of the audit's suggested fixes.
 *
 * Body: `{ fixIndex: number, note?: string, applied?: boolean }`.
 *
 * This route is intentionally "annotation only" — it records the decision
 * in `resolver_audits.applied_changes[]` so the history is auditable.
 * Actually executing the fix (editing a trigger row, retiring a skill,
 * etc.) remains a human step; writing here just marks it done.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as
    | { fixIndex?: number; note?: string; applied?: boolean }
    | null
  if (!body || typeof body.fixIndex !== 'number' || body.fixIndex < 0) {
    return NextResponse.json({ error: 'fixIndex (number >= 0) is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: auditRow, error: loadError } = await admin
    .from('resolver_audits')
    .select('*')
    .eq('id', id)
    .single()
  if (loadError || !auditRow) {
    return NextResponse.json({ error: loadError?.message ?? 'Not found' }, { status: 404 })
  }
  const audit = auditRow as ResolverAuditRow

  // Verify the user has access to this audit's project (membership check
  // using the RLS-aware client; admin client is used only for the mutation
  // to avoid re-implementing the RLS policy inline).
  const { data: accessible } = await supabase
    .from('projects')
    .select('id')
    .eq('id', audit.project_id)
    .single()
  if (!accessible) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const suggested = (audit.suggested_fixes ?? []) as ResolverAuditFix[]
  if (body.fixIndex >= suggested.length) {
    return NextResponse.json(
      { error: `fixIndex out of range (audit has ${suggested.length} suggested fix(es))` },
      { status: 400 },
    )
  }
  const chosen = suggested[body.fixIndex]

  const appliedChanges = [...((audit.applied_changes ?? []) as ResolverAuditFix[])]
  appliedChanges.push({
    ...chosen,
    applied: body.applied ?? true,
    proposal: body.note
      ? `${chosen.proposal} — applied: ${body.note}`
      : `${chosen.proposal} — applied at ${new Date().toISOString()}`,
  })

  const { error: updateError } = await admin
    .from('resolver_audits')
    .update({ applied_changes: appliedChanges })
    .eq('id', id)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    auditId: id,
    applied: chosen,
    applied_changes_count: appliedChanges.length,
  })
}
