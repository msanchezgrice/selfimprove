import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

function getClient() {
  if (!_client) {
    _client = new Anthropic() // Uses ANTHROPIC_API_KEY env var automatically
  }
  return _client
}

type JsonSchema = {
  type: string
  properties?: Record<string, unknown>
  required?: string[]
  items?: unknown
  [key: string]: unknown
}

interface CallClaudeOptions<T> {
  prompt: string
  system?: string
  schema: JsonSchema
  schemaName: string
  schemaDescription?: string
  model?: string
  maxTokens?: number
  temperature?: number
}

export async function callClaude<T>({
  prompt,
  system,
  schema,
  schemaName,
  schemaDescription,
  model = 'claude-sonnet-4-6',
  maxTokens = 4096,
  temperature = 0,
}: CallClaudeOptions<T>): Promise<T> {
  const client = getClient()

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }],
    tools: [
      {
        name: schemaName,
        description: schemaDescription || `Structured output for ${schemaName}`,
        input_schema: schema as Anthropic.Messages.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: schemaName },
  })

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === 'tool_use'
  )

  if (!toolUseBlock) {
    throw new Error(`No tool_use block in Claude response for ${schemaName}`)
  }

  return toolUseBlock.input as T
}

export async function callClaudeBatch<T>(
  calls: CallClaudeOptions<T>[]
): Promise<T[]> {
  return Promise.all(calls.map((call) => callClaude(call)))
}
