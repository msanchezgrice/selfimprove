import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn().mockImplementation(function () {
    return { messages: { create: mockCreate } }
  })
  return { default: MockAnthropic }
})

describe('callClaude', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the cached _client singleton between tests
    vi.resetModules()
  })

  const schema = {
    type: 'object' as const,
    properties: { answer: { type: 'string' } },
    required: ['answer'],
  }

  it('returns the tool_use block input when present', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'tool_use', id: 'tu_1', name: 'test_tool', input: { answer: 'hello' } },
      ],
    })

    const { callClaude } = await import('./call-claude')
    const result = await callClaude<{ answer: string }>({
      prompt: 'Say hello',
      schema,
      schemaName: 'test_tool',
    })

    expect(result).toEqual({ answer: 'hello' })
  })

  it('throws when no tool_use block in response', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'I cannot use the tool' },
      ],
    })

    const { callClaude } = await import('./call-claude')
    await expect(
      callClaude({ prompt: 'Say hello', schema, schemaName: 'test_tool' })
    ).rejects.toThrow('No tool_use block in Claude response for test_tool')
  })

  it('passes correct parameters to Anthropic', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'tool_use', id: 'tu_1', name: 'my_schema', input: { answer: 'ok' } },
      ],
    })

    const { callClaude } = await import('./call-claude')
    await callClaude({
      prompt: 'Test prompt',
      system: 'You are helpful',
      schema,
      schemaName: 'my_schema',
      schemaDescription: 'A test schema',
      model: 'claude-sonnet-4-6',
      maxTokens: 2048,
      temperature: 0.5,
    })

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      temperature: 0.5,
      system: 'You are helpful',
      messages: [{ role: 'user', content: 'Test prompt' }],
      tools: [
        {
          name: 'my_schema',
          description: 'A test schema',
          input_schema: schema,
        },
      ],
      tool_choice: { type: 'tool', name: 'my_schema' },
    })
  })

  it('callClaudeBatch runs calls in parallel', async () => {
    mockCreate
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tu_1', name: 'a', input: { answer: 'first' } }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tu_2', name: 'b', input: { answer: 'second' } }],
      })

    const { callClaudeBatch } = await import('./call-claude')
    const results = await callClaudeBatch<{ answer: string }>([
      { prompt: 'First', schema, schemaName: 'a' },
      { prompt: 'Second', schema, schemaName: 'b' },
    ])

    expect(results).toEqual([{ answer: 'first' }, { answer: 'second' }])
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })
})
