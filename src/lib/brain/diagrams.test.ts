import { describe, expect, it } from 'vitest'

import { BRAIN_DIAGRAMS, getBrainDiagram } from './diagrams'

describe('brain diagrams', () => {
  it('defines the core visual set for the review page', () => {
    expect(BRAIN_DIAGRAMS).toHaveLength(5)
    expect(BRAIN_DIAGRAMS.map((diagram) => diagram.slug)).toEqual([
      'thin-harness-fat-skills',
      'today-vs-v1',
      'resolver-learning-loop',
      'always-on-head-of-product-agent',
      'hop-agent-runtime-control-plane',
    ])
  })

  it('shows the article thesis as a layered skills, harness, and foundation stack', () => {
    const diagram = getBrainDiagram('thin-harness-fat-skills')

    expect(diagram.zones.map((zone) => zone.label)).toEqual([
      'Fat Skills',
      'Thin Harness',
      'Deterministic Foundation',
    ])
    expect(diagram.nodes.some((node) => node.id === 'resolver')).toBe(true)
    expect(diagram.nodes.some((node) => node.id === 'roadmap-skill')).toBe(true)
    expect(
      diagram.edges.some(
        (edge) => edge.from === 'resolver' && edge.to === 'context-loader',
      ),
    ).toBe(true)
  })

  it('contrasts the current one-shot pipeline with the v1 project brain flow', () => {
    const diagram = getBrainDiagram('today-vs-v1')

    expect(diagram.zones.map((zone) => zone.label)).toEqual(['Today', 'Project Brain v1'])
    expect(diagram.nodes.some((node) => node.id === 'one-shot-prompt')).toBe(true)
    expect(diagram.nodes.some((node) => node.id === 'project-brain')).toBe(true)
    expect(
      diagram.edges.some(
        (edge) => edge.from === 'project-brain' && edge.to === 'resolver-v1',
      ),
    ).toBe(true)
  })

  it('captures the resolver and learning loop feeding back into skills and rules', () => {
    const diagram = getBrainDiagram('resolver-learning-loop')

    expect(diagram.nodes.some((node) => node.id === 'impact-review')).toBe(true)
    expect(diagram.nodes.some((node) => node.id === 'skill-file')).toBe(true)
    expect(
      diagram.edges.some(
        (edge) => edge.from === 'impact-review' && edge.to === 'skill-file',
      ),
    ).toBe(true)
    expect(
      diagram.edges.some(
        (edge) => edge.from === 'impact-review' && edge.to === 'resolver-rules',
      ),
    ).toBe(true)
  })

  it('shows how an always-on head of product agent interfaces with the project brain and action surfaces', () => {
    const diagram = getBrainDiagram('always-on-head-of-product-agent')

    expect(diagram.zones.map((zone) => zone.label)).toEqual([
      'Observe',
      'Decide',
      'Act',
      'Steward',
    ])
    expect(diagram.nodes.some((node) => node.id === 'hop-agent')).toBe(true)
    expect(diagram.nodes.some((node) => node.id === 'project-brain-hub')).toBe(true)
    expect(diagram.nodes.some((node) => node.id === 'human-review')).toBe(true)
    expect(
      diagram.edges.some(
        (edge) => edge.from === 'project-brain-hub' && edge.to === 'hop-agent',
      ),
    ).toBe(true)
    expect(
      diagram.edges.some(
        (edge) => edge.from === 'hop-agent' && edge.to === 'implementation-queue',
      ),
    ).toBe(true)
    expect(
      diagram.edges.some(
        (edge) => edge.from === 'learning-loop' && edge.to === 'skills-rules',
      ),
    ).toBe(true)
  })

  it('shows what the head of product agent runs on cron, webhook, and manual approval paths', () => {
    const diagram = getBrainDiagram('hop-agent-runtime-control-plane')

    expect(diagram.zones.map((zone) => zone.label)).toEqual([
      'Cron',
      'Webhook',
      'Agent Core',
      'Manual Approval',
    ])
    expect(diagram.nodes.some((node) => node.id === 'hourly-sweep')).toBe(true)
    expect(diagram.nodes.some((node) => node.id === 'signal-webhook')).toBe(true)
    expect(diagram.nodes.some((node) => node.id === 'runtime-hop-agent')).toBe(true)
    expect(diagram.nodes.some((node) => node.id === 'approve-build')).toBe(true)
    expect(
      diagram.edges.some(
        (edge) => edge.from === 'hourly-sweep' && edge.to === 'runtime-hop-agent',
      ),
    ).toBe(true)
    expect(
      diagram.edges.some(
        (edge) => edge.from === 'signal-webhook' && edge.to === 'runtime-hop-agent',
      ),
    ).toBe(true)
    expect(
      diagram.edges.some(
        (edge) => edge.from === 'runtime-hop-agent' && edge.to === 'approve-build',
      ),
    ).toBe(true)
  })
})
