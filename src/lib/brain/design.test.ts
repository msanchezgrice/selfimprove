import { describe, expect, it } from 'vitest'

import {
  BRAIN_TABLES,
  getResolverRules,
  getTaskBlueprint,
  getTaskSkill,
} from './design'

describe('brain design', () => {
  it('returns roadmap resolver rules in priority order', () => {
    const rules = getResolverRules('generate_roadmap')

    expect(rules.length).toBeGreaterThan(3)
    expect(rules[0]?.pageKind).toBe('current_focus')
    expect(rules[0]?.required).toBe(true)
    expect(rules.map((rule) => rule.priority)).toEqual(
      [...rules.map((rule) => rule.priority)].sort((a, b) => a - b),
    )
  })

  it('describes the prd task as a mixed latent and deterministic workflow', () => {
    const blueprint = getTaskBlueprint('generate_prd')

    expect(blueprint.name).toBe('PRD Author')
    expect(blueprint.latentStages.length).toBeGreaterThan(1)
    expect(blueprint.deterministicStages).toContain(
      'Resolve project overview, current focus, repo map, safety rules, and recent shipped changes.',
    )
    expect(blueprint.writes).toContain('roadmap_items.prd_content')
    expect(blueprint.writes).toContain('brain_runs')
  })

  it('maps each task to a fat skill definition', () => {
    const roadmapSkill = getTaskSkill('generate_roadmap')
    const prdSkill = getTaskSkill('generate_prd')
    const resolverAuditSkill = getTaskSkill('audit_resolver')

    expect(roadmapSkill.slug).toBe('roadmap-synthesis')
    expect(prdSkill.slug).toBe('prd-author')
    expect(resolverAuditSkill.slug).toBe('check-resolvable')
    expect(roadmapSkill.inputParameters).toContain('PROJECT_ID')
    expect(prdSkill.inputParameters).toContain('ROADMAP_ITEM_ID')
    expect(resolverAuditSkill.writes).toContain('resolver_audits')
  })

  it('defines the core project brain tables', () => {
    const tableNames = BRAIN_TABLES.map((table) => table.name)

    expect(tableNames).toContain('brain_pages')
    expect(tableNames).toContain('brain_page_versions')
    expect(tableNames).toContain('brain_skill_files')
    expect(tableNames).toContain('brain_resolver_rules')
    expect(tableNames).toContain('brain_runs')
    expect(tableNames).toContain('opportunity_clusters')
    expect(tableNames).toContain('resolver_audits')
  })
})
