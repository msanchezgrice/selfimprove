import { readFile } from 'fs/promises'
import path from 'path'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { BrainSkillFileRow } from '@/lib/types/database'

import { BRAIN_SKILLS, type BrainSkill } from './design'

/**
 * Sync the on-disk skill markdown (docs/brain/skills/*.md) into the
 * `brain_skill_files` DB table that `project-brain-v1.md` calls out as the
 * durable, auditable source of truth for skill content.
 *
 * Keeping the typed registry (`BRAIN_SKILLS` in design.ts) authoritative
 * and treating the DB as a mirror has two properties we want:
 *   - `design.ts` stays the spec (new skills are born there first).
 *   - The DB is browsable and maintainable without a redeploy (future
 *     skill-editor UI, plus `check-resolvable` can audit drift).
 */

export type SkillSyncReport = {
  synced: number
  unchanged: number
  retired: number
  errors: string[]
  details: Array<{
    slug: string
    action: 'inserted' | 'updated' | 'unchanged' | 'retired' | 'error'
    message?: string
  }>
}

export type SkillRegistrySource = {
  /** Where markdown files live. Defaults to CWD when absent. */
  repoRoot?: string
  /** Override the skill list (useful for tests). */
  skills?: BrainSkill[]
}

/**
 * Read each skill's markdown from disk and upsert into `brain_skill_files`.
 * Skills present in the DB but not in the typed registry are marked
 * `status='retired'` (not deleted) so the history is preserved.
 */
export async function syncSkillRegistry(
  supabase: SupabaseClient,
  source: SkillRegistrySource = {},
): Promise<SkillSyncReport> {
  const repoRoot = source.repoRoot ?? process.cwd()
  const skills = source.skills ?? BRAIN_SKILLS

  const report: SkillSyncReport = {
    synced: 0,
    unchanged: 0,
    retired: 0,
    errors: [],
    details: [],
  }

  const { data: existingRows } = await supabase
    .from('brain_skill_files')
    .select('id, slug, name, description, task_type, content_md, input_schema, status')

  const bySlug = new Map<string, BrainSkillFileRow>()
  for (const row of (existingRows ?? []) as BrainSkillFileRow[]) {
    bySlug.set(row.slug, row)
  }

  const seenSlugs = new Set<string>()

  for (const skill of skills) {
    seenSlugs.add(skill.slug)
    try {
      const contentMd = await readFile(path.join(repoRoot, skill.filePath), 'utf8')
      const schema = buildInputSchema(skill)
      const existing = bySlug.get(skill.slug)

      if (!existing) {
        const { error } = await supabase.from('brain_skill_files').insert({
          slug: skill.slug,
          name: skill.name,
          description: skill.description,
          task_type: skill.taskType,
          content_md: contentMd,
          input_schema: schema,
          status: 'active',
        })
        if (error) {
          report.errors.push(`${skill.slug}: ${error.message}`)
          report.details.push({ slug: skill.slug, action: 'error', message: error.message })
          continue
        }
        report.synced += 1
        report.details.push({ slug: skill.slug, action: 'inserted' })
        continue
      }

      const changed =
        existing.name !== skill.name ||
        existing.description !== skill.description ||
        existing.task_type !== skill.taskType ||
        existing.content_md !== contentMd ||
        existing.status !== 'active' ||
        JSON.stringify(existing.input_schema) !== JSON.stringify(schema)

      if (!changed) {
        report.unchanged += 1
        report.details.push({ slug: skill.slug, action: 'unchanged' })
        continue
      }

      const { error } = await supabase
        .from('brain_skill_files')
        .update({
          name: skill.name,
          description: skill.description,
          task_type: skill.taskType,
          content_md: contentMd,
          input_schema: schema,
          status: 'active',
        })
        .eq('id', existing.id)
      if (error) {
        report.errors.push(`${skill.slug}: ${error.message}`)
        report.details.push({ slug: skill.slug, action: 'error', message: error.message })
        continue
      }
      report.synced += 1
      report.details.push({ slug: skill.slug, action: 'updated' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      report.errors.push(`${skill.slug}: ${message}`)
      report.details.push({ slug: skill.slug, action: 'error', message })
    }
  }

  // Retire DB rows that are no longer in the typed registry.
  for (const [slug, row] of bySlug) {
    if (seenSlugs.has(slug)) continue
    if (row.status === 'retired') continue
    const { error } = await supabase
      .from('brain_skill_files')
      .update({ status: 'retired' })
      .eq('id', row.id)
    if (error) {
      report.errors.push(`${slug}: retire failed: ${error.message}`)
      report.details.push({ slug, action: 'error', message: error.message })
      continue
    }
    report.retired += 1
    report.details.push({ slug, action: 'retired' })
  }

  return report
}

/**
 * Lookup helper that prefers the DB row (so edits in the future skill
 * editor take precedence) and falls back to the typed registry + disk
 * when the DB row is missing or retired. Used by runners that want to
 * load the skill's procedural markdown at invocation time.
 */
export async function loadSkillMarkdown(
  supabase: SupabaseClient,
  slug: string,
  repoRoot: string = process.cwd(),
): Promise<string | null> {
  const { data } = await supabase
    .from('brain_skill_files')
    .select('content_md, status')
    .eq('slug', slug)
    .maybeSingle()
  const row = data as Pick<BrainSkillFileRow, 'content_md' | 'status'> | null
  if (row && row.status === 'active' && row.content_md) {
    return row.content_md
  }
  const registered = BRAIN_SKILLS.find((skill) => skill.slug === slug)
  if (!registered) return null
  try {
    return await readFile(path.join(repoRoot, registered.filePath), 'utf8')
  } catch {
    return null
  }
}

function buildInputSchema(skill: BrainSkill): Record<string, unknown> {
  return {
    type: 'object',
    properties: Object.fromEntries(
      skill.inputParameters.map((name) => [name, { type: 'string' }]),
    ),
    required: skill.inputParameters,
    additionalProperties: false,
  }
}
