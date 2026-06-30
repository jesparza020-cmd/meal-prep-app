import { validateDraft, type DraftRecipe } from './draft'
import { DRAFT_JSON_SCHEMA, EXTRACTION_MODEL, EXTRACTION_PROMPT } from './extractionSchema'

export type ExtractInput =
  | { kind: 'text'; text: string }
  | { kind: 'image'; data: string; mediaType: string }
  | { kind: 'pdf'; data: string }

// Minimal slice of the Anthropic SDK client we depend on (keeps tests fake-able).
export interface ClaudeLike {
  messages: {
    create(args: unknown): Promise<{ content: Array<{ type: string; text?: string }> }>
  }
}

function buildContent(input: ExtractInput): unknown[] {
  if (input.kind === 'text') {
    return [{ type: 'text', text: `${EXTRACTION_PROMPT}\n\nRECIPE SOURCE:\n${input.text}` }]
  }
  if (input.kind === 'image') {
    return [
      { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.data } },
      { type: 'text', text: EXTRACTION_PROMPT },
    ]
  }
  return [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.data } },
    { type: 'text', text: EXTRACTION_PROMPT },
  ]
}

export async function extractRecipe(client: ClaudeLike, input: ExtractInput): Promise<DraftRecipe> {
  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 16000,
    output_config: { format: { type: 'json_schema', schema: DRAFT_JSON_SCHEMA } },
    messages: [{ role: 'user', content: buildContent(input) }],
  })
  const textBlock = response.content.find((b) => b.type === 'text' && b.text)
  if (!textBlock?.text) throw new Error('No text content in extraction response')
  return validateDraft(JSON.parse(textBlock.text))
}
