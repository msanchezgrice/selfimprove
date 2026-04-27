import { describe, expect, it } from 'vitest'

import { chunkMarkdown, estimateTokens } from './chunking'

describe('estimateTokens', () => {
  it('returns 0 for empty strings', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('a'.repeat(400))).toBe(100)
  })
})

describe('chunkMarkdown', () => {
  it('returns an empty array for empty input', () => {
    expect(chunkMarkdown('')).toEqual([])
    expect(chunkMarkdown('   \n  \n')).toEqual([])
  })

  it('packs small sections together under the target token budget', () => {
    const markdown = `# Overview\n\nShort intro paragraph.\n\n## Notes\n\nAnother short paragraph.`
    const chunks = chunkMarkdown(markdown, { targetTokens: 120, maxTokens: 200 })
    expect(chunks.length).toBe(1)
    expect(chunks[0]?.content).toContain('# Overview')
    expect(chunks[0]?.content).toContain('## Notes')
    expect(chunks[0]?.heading).toBe('Overview')
    expect(chunks[0]?.tokenEstimate).toBeGreaterThan(0)
  })

  it('splits at heading boundaries when the target is exceeded', () => {
    const body = 'lorem ipsum '.repeat(120)
    const markdown = `# Section A\n\n${body}\n\n# Section B\n\n${body}`
    const chunks = chunkMarkdown(markdown, { targetTokens: 200, maxTokens: 400 })
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks[0]?.heading).toBe('Section A')
    expect(chunks[chunks.length - 1]?.heading).toBe('Section B')
  })

  it('hard-splits oversized sections to respect maxTokens', () => {
    const huge = 'a'.repeat(4000) // ~1000 tokens
    const chunks = chunkMarkdown(`# Big\n\n${huge}`, { targetTokens: 200, maxTokens: 200 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.tokenEstimate).toBeLessThanOrEqual(220) // 10% tolerance for trim
    }
  })

  it('uses the most recent heading on each chunk', () => {
    const markdown = `# Top\n\nPre-heading paragraph.\n\n## Nested\n\nNested paragraph.`
    const chunks = chunkMarkdown(markdown)
    expect(chunks[0]?.heading).toBe('Top')
  })
})
