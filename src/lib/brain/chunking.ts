/**
 * Markdown chunker for `brain_chunks`.
 *
 * Splits a compiled page into retrieval-friendly chunks respecting heading
 * boundaries. Keeps each chunk under a soft token budget (~4 chars/token) so
 * the chunks remain usable for keyword search today and for semantic search
 * once embeddings land.
 *
 * Pure utility, no I/O — makes it easy to unit test.
 */

export type MarkdownChunk = {
  index: number
  content: string
  heading: string | null
  tokenEstimate: number
}

export type ChunkOptions = {
  /** Target tokens per chunk. Defaults to 480 (~1920 characters). */
  targetTokens?: number
  /** Hard cap on tokens per chunk. Defaults to 800. */
  maxTokens?: number
}

const DEFAULT_TARGET_TOKENS = 480
const DEFAULT_MAX_TOKENS = 800

/** Rough token estimate: 4 characters per token (OpenAI/Anthropic heuristic). */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

/**
 * Split markdown into chunks aligned to heading boundaries, then pack small
 * sections together until they approach `targetTokens`, never exceeding
 * `maxTokens`. Paragraphs larger than the cap are hard-split as a last resort.
 */
export function chunkMarkdown(
  markdown: string,
  options: ChunkOptions = {},
): MarkdownChunk[] {
  const target = options.targetTokens ?? DEFAULT_TARGET_TOKENS
  const max = Math.max(target, options.maxTokens ?? DEFAULT_MAX_TOKENS)

  if (!markdown || markdown.trim().length === 0) return []

  const sections = splitByHeading(markdown)
  const chunks: MarkdownChunk[] = []
  let buffer = ''
  let bufferTokens = 0
  let bufferHeading: string | null = null

  const flush = () => {
    const content = buffer.trim()
    if (content.length === 0) return
    chunks.push({
      index: chunks.length,
      content,
      heading: bufferHeading,
      tokenEstimate: estimateTokens(content),
    })
    buffer = ''
    bufferTokens = 0
    bufferHeading = null
  }

  for (const section of sections) {
    const sectionTokens = estimateTokens(section.body)

    // Oversized section: flush buffer, then hard-split this section.
    if (sectionTokens > max) {
      flush()
      const pieces = hardSplit(section.body, max)
      for (const piece of pieces) {
        chunks.push({
          index: chunks.length,
          content: piece.trim(),
          heading: section.heading,
          tokenEstimate: estimateTokens(piece),
        })
      }
      continue
    }

    // Would overflow target: flush first, start fresh with this section.
    if (bufferTokens > 0 && bufferTokens + sectionTokens > target) {
      flush()
    }

    if (buffer.length === 0) {
      bufferHeading = section.heading
    }
    buffer += (buffer.length > 0 ? '\n\n' : '') + section.body
    bufferTokens += sectionTokens
  }

  flush()
  return chunks
}

type HeadingSection = { heading: string | null; body: string }

function splitByHeading(markdown: string): HeadingSection[] {
  const lines = markdown.split('\n')
  const sections: HeadingSection[] = []
  let heading: string | null = null
  let buffer: string[] = []

  const push = () => {
    const body = buffer.join('\n').trim()
    if (body.length === 0) return
    sections.push({ heading, body })
    buffer = []
  }

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line)
    if (headingMatch) {
      push()
      heading = headingMatch[2].trim()
      buffer.push(line)
    } else {
      buffer.push(line)
    }
  }
  push()
  return sections
}

function hardSplit(body: string, max: number): string[] {
  const charBudget = max * 4
  const paragraphs = body.split(/\n{2,}/)
  const pieces: string[] = []
  let current = ''
  for (const para of paragraphs) {
    if (para.length >= charBudget) {
      if (current) {
        pieces.push(current)
        current = ''
      }
      for (let i = 0; i < para.length; i += charBudget) {
        pieces.push(para.slice(i, i + charBudget))
      }
      continue
    }
    if (current.length + para.length + 2 > charBudget) {
      pieces.push(current)
      current = para
    } else {
      current = current ? `${current}\n\n${para}` : para
    }
  }
  if (current) pieces.push(current)
  return pieces
}
