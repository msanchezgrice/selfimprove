import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chunkMarkdown } from '@/lib/brain/chunking'
import { FOCUS_MODES, type FocusMode } from '@/lib/brain/design'
import type { BrainPageRow } from '@/lib/types/database'

/**
 * Read the active `current_focus` page for a project.
 */
export async function GET(
  _req: NextRequest,
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

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', id)
    .single()
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data: page } = await admin
    .from('brain_pages')
    .select('*')
    .eq('project_id', id)
    .eq('kind', 'current_focus')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!page) {
    return NextResponse.json({
      focus: null,
      modes: FOCUS_MODES.map((mode) => ({ name: mode.name, description: mode.description })),
    })
  }

  const { data: version } = await admin
    .from('brain_page_versions')
    .select('content_md, key_facts, change_summary, created_at, version')
    .eq('page_id', page.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    focus: {
      slug: page.slug,
      title: page.title,
      summary: page.summary,
      content: version?.content_md ?? '',
      version: version?.version ?? null,
      updatedAt: version?.created_at ?? page.updated_at,
    },
    modes: FOCUS_MODES.map((mode) => ({ name: mode.name, description: mode.description })),
  })
}

/**
 * Upsert the `current_focus` brain_page for a project.
 *
 * Body: `{ mode: 'conversion' | 'ux_quality' | ... , note?: string }`
 *
 * The upsert is append-only: we set `brain_pages.slug` to the focus-mode
 * name, overwrite the summary with the mode's description (plus optional
 * note), and insert a new `brain_page_versions` row at version n+1.
 * Existing versions stay intact so the history is auditable.
 */
export async function PUT(
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

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .single()
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await req.json().catch(() => null)) as
    | { mode?: string; note?: string }
    | null
  if (!body || typeof body.mode !== 'string') {
    return NextResponse.json({ error: 'mode is required' }, { status: 400 })
  }

  const mode = FOCUS_MODES.find((candidate) => candidate.name === body.mode)
  if (!mode) {
    return NextResponse.json(
      {
        error: 'Unknown focus mode',
        allowed: FOCUS_MODES.map((m) => m.name),
      },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  const content = renderFocusContent(project.name, mode, note)
  const summary = note
    ? `${mode.description} — ${note.slice(0, 160)}`
    : mode.description

  // Archive any previously-active focus page for this project that does NOT
  // match the new slug. Keeping a single active current_focus row is what
  // resolve-context assumes.
  const { data: existingActive } = await admin
    .from('brain_pages')
    .select('id, slug')
    .eq('project_id', id)
    .eq('kind', 'current_focus')
    .eq('status', 'active')

  for (const row of (existingActive ?? []) as Array<Pick<BrainPageRow, 'id' | 'slug'>>) {
    if (row.slug === mode.name) continue
    await admin
      .from('brain_pages')
      .update({ status: 'archived', stale_reason: `superseded by focus=${mode.name}` })
      .eq('id', row.id)
  }

  // Upsert the page for the new mode.
  const { data: existingForMode } = await admin
    .from('brain_pages')
    .select('id')
    .eq('project_id', id)
    .eq('kind', 'current_focus')
    .eq('slug', mode.name)
    .maybeSingle()

  let pageId: string | null = null
  if (existingForMode) {
    const { data: updated } = await admin
      .from('brain_pages')
      .update({
        title: `Current Focus — ${mode.name}`,
        summary,
        status: 'active',
        importance: 95,
        freshness_score: 100,
        stale_reason: null,
      })
      .eq('id', existingForMode.id)
      .select('id')
      .single()
    pageId = (updated as { id: string } | null)?.id ?? existingForMode.id
  } else {
    const { data: inserted, error: insertError } = await admin
      .from('brain_pages')
      .insert({
        project_id: id,
        slug: mode.name,
        kind: 'current_focus',
        title: `Current Focus — ${mode.name}`,
        summary,
        status: 'active',
        importance: 95,
        freshness_score: 100,
      })
      .select('id')
      .single()
    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message ?? 'Failed to insert focus page' },
        { status: 500 },
      )
    }
    pageId = (inserted as { id: string }).id
  }

  if (!pageId) {
    return NextResponse.json({ error: 'Could not upsert focus page' }, { status: 500 })
  }

  // Append a new version so the change is auditable.
  const { data: latestVersion } = await admin
    .from('brain_page_versions')
    .select('version')
    .eq('page_id', pageId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = ((latestVersion as { version: number } | null)?.version ?? 0) + 1

  const { data: versionRow } = await admin
    .from('brain_page_versions')
    .insert({
      page_id: pageId,
      version: nextVersion,
      content_md: content,
      outline: [],
      key_facts: [
        `focus_mode=${mode.name}`,
        `raises=${mode.raises.join('; ')}`,
        `lowers=${mode.lowers.join('; ')}`,
      ],
      open_questions:
        note.length > 0
          ? []
          : ['Why did we choose this focus mode now? Record the reason in the note field.'],
      change_summary: note
        ? `User set focus to ${mode.name}: ${note.slice(0, 160)}`
        : `User set focus to ${mode.name}`,
      compiled_from: { skill: 'set-focus', user_id: user.id },
      created_by: `user:${user.id}`,
    })
    .select('id')
    .single()

  if (versionRow) {
    const versionId = (versionRow as { id: string }).id
    const chunks = chunkMarkdown(content).map((chunk) => ({
      page_id: pageId,
      page_version_id: versionId,
      chunk_index: chunk.index,
      content: chunk.content,
      token_estimate: chunk.tokenEstimate,
      metadata: chunk.heading ? { heading: chunk.heading } : {},
    }))
    if (chunks.length > 0) {
      await admin.from('brain_chunks').insert(chunks)
    }
  }

  return NextResponse.json({
    focus: {
      slug: mode.name,
      title: `Current Focus — ${mode.name}`,
      summary,
      version: nextVersion,
    },
  })
}

function renderFocusContent(projectName: string, mode: FocusMode, note: string): string {
  return `# Current Focus — ${mode.name}

## Mode
${mode.description}

## Raises (these become higher-signal during roadmap ranking)
${mode.raises.map((entry) => `- ${entry}`).join('\n')}

## Lowers (these become lower-signal during roadmap ranking)
${mode.lowers.map((entry) => `- ${entry}`).join('\n')}

## Note from the user
${note || '_none_'}

## How this changes behavior
- \`roadmap-synthesis\` loads this page FIRST and weights clusters by \`need_alignment\` against \`${mode.name}\`.
- \`prd-author\` preserves this as the "why now" framing when drafting PRDs.
- \`impact-review\` uses this to explain whether an item was promoted for the right reason.

_Project: ${projectName}_
`
}
