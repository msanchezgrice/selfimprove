import { describe, expect, it } from 'vitest'

import { BRAIN_SKILLS } from '@/lib/brain/design'

import { auditResolverHealth, type AuditInputBundle } from './check-resolvable'

function trigger(
  overrides: Partial<AuditInputBundle['triggers'][number]> = {},
): AuditInputBundle['triggers'][number] {
  return {
    resolver_type: 'skill',
    trigger_phrase: 'default phrase',
    trigger_kind: 'user_phrase',
    target_skill_slug: 'roadmap-synthesis',
    priority: 10,
    status: 'active',
    ...overrides,
  }
}

function run(
  overrides: Partial<AuditInputBundle['recentRuns'][number]> = {},
): AuditInputBundle['recentRuns'][number] {
  return {
    status: 'completed',
    error: null,
    skill_slug: 'roadmap-synthesis',
    task_type: 'generate_roadmap',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('auditResolverHealth', () => {
  it('flags every skill with zero triggers as a dark capability', () => {
    const { issues, fixes } = auditResolverHealth({
      skills: BRAIN_SKILLS,
      triggers: [],
      recentRuns: [],
    })
    const darkSlugs = issues.filter((i) => i.kind === 'dark_capability').map((i) => i.description)
    for (const skill of BRAIN_SKILLS) {
      expect(darkSlugs.some((desc) => desc.includes(skill.slug))).toBe(true)
    }
    expect(fixes.every((fix) => fix.kind === 'add_trigger')).toBe(true)
    expect(fixes).toHaveLength(BRAIN_SKILLS.length)
  })

  it('does not flag a skill that has at least one active trigger', () => {
    const triggers = BRAIN_SKILLS.map((skill) =>
      trigger({
        trigger_phrase: `phrase-${skill.slug}`,
        target_skill_slug: skill.slug,
      }),
    )
    const { issues } = auditResolverHealth({ skills: BRAIN_SKILLS, triggers, recentRuns: [] })
    expect(issues.filter((i) => i.kind === 'dark_capability')).toEqual([])
  })

  it('flags triggers pointing at unknown skill slugs', () => {
    const triggers = [
      ...BRAIN_SKILLS.map((skill) =>
        trigger({ trigger_phrase: `p-${skill.slug}`, target_skill_slug: skill.slug }),
      ),
      trigger({ trigger_phrase: 'ghost phrase', target_skill_slug: 'ghost-skill' }),
    ]
    const { issues, fixes } = auditResolverHealth({
      skills: BRAIN_SKILLS,
      triggers,
      recentRuns: [],
    })
    expect(issues.some((i) => i.kind === 'unmatched' && i.description.includes('ghost-skill'))).toBe(true)
    expect(fixes.some((fix) => fix.kind === 'remove_trigger' && fix.target === 'ghost phrase')).toBe(true)
  })

  it('flags overlapping trigger phrases across skills', () => {
    const triggers = [
      ...BRAIN_SKILLS.map((skill) =>
        trigger({ trigger_phrase: `p-${skill.slug}`, target_skill_slug: skill.slug }),
      ),
      trigger({ trigger_phrase: 'ship it', target_skill_slug: 'roadmap-synthesis' }),
      trigger({ trigger_phrase: 'ship it', target_skill_slug: 'prd-author' }),
    ]
    const { issues, fixes } = auditResolverHealth({
      skills: BRAIN_SKILLS,
      triggers,
      recentRuns: [],
    })
    expect(issues.some((i) => i.kind === 'overlap' && i.description.includes('ship it'))).toBe(true)
    expect(fixes.some((fix) => fix.kind === 'change_priority' && fix.target.includes('ship it'))).toBe(true)
  })

  it('surfaces misrouting evidence from failed brain_runs', () => {
    const triggers = BRAIN_SKILLS.map((skill) =>
      trigger({ trigger_phrase: `p-${skill.slug}`, target_skill_slug: skill.slug }),
    )
    const { issues } = auditResolverHealth({
      skills: BRAIN_SKILLS,
      triggers,
      recentRuns: [
        run({ status: 'failed', error: 'no skill matched the phrase' }),
        run({ skill_slug: 'retired-skill' }),
      ],
    })
    expect(issues.some((i) => i.kind === 'false_negative')).toBe(true)
    expect(
      issues.some((i) => i.kind === 'unmatched' && i.description.includes('retired-skill')),
    ).toBe(true)
  })

  it('ignores retired triggers', () => {
    const triggers = [
      ...BRAIN_SKILLS.map((skill) =>
        trigger({ trigger_phrase: `p-${skill.slug}`, target_skill_slug: skill.slug }),
      ),
      trigger({
        trigger_phrase: 'stale phrase',
        target_skill_slug: 'ghost-skill',
        status: 'retired',
      }),
    ]
    const { issues } = auditResolverHealth({
      skills: BRAIN_SKILLS,
      triggers,
      recentRuns: [],
    })
    expect(issues.some((i) => i.description.includes('stale phrase'))).toBe(false)
  })
})
