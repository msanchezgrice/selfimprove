import { describe, it, expect } from 'vitest'
import type {
  OrgRow, OrgInsert,
  ProjectRow, ProjectInsert,
  SignalRow, SignalInsert,
  RoadmapItemRow, RoadmapItemInsert,
  ProjectSettingsRow, ProjectSettingsInsert,
} from './database'

describe('database types', () => {
  it('OrgInsert requires name and slug only', () => {
    const insert: OrgInsert = { name: 'Test', slug: 'test' }
    expect(insert.name).toBe('Test')
  })

  it('ProjectInsert requires org_id, name, slug, allowed_domains', () => {
    const insert: ProjectInsert = {
      org_id: '123', name: 'My Project', slug: 'my-project', allowed_domains: [],
    }
    expect(insert.org_id).toBe('123')
  })

  it('SignalInsert requires project_id, type, content', () => {
    const insert: SignalInsert = { project_id: '123', type: 'feedback', content: 'test', metadata: {} }
    expect(insert.type).toBe('feedback')
  })

  it('ProjectSettingsInsert requires only project_id', () => {
    const insert: ProjectSettingsInsert = { project_id: '123' }
    expect(insert.project_id).toBe('123')
  })

  it('RoadmapItemInsert requires project_id, title, category, and several fields', () => {
    const insert: RoadmapItemInsert = {
      project_id: '123',
      title: 'Test',
      description: 'desc',
      category: 'feature',
      origin: 'signals',
      confidence: 80,
      scope: 'small',
      strategy: 'Build it',
      impact: 8,
      upside: 'More users',
      size: 3,
      evidence_trail: [],
      thinking_traces: [],
      acceptance_criteria: [],
      files_to_modify: [],
      risks: [],
    }
    expect(insert.category).toBe('feature')
  })
})
