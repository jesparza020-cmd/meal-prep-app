import { describe, it, expect, vi } from 'vitest'
import { extractRecipe, type ClaudeLike } from './extract'

function fakeClient(draftJson: object): ClaudeLike {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(draftJson) }],
      }),
    },
  }
}

const draft = {
  name: 'Soup',
  baseServingLabel: '1 bowl',
  slot: 'lunch',
  ingredients: [{ name: 'carrot', qty: 2, unit: 'each' }],
  steps: ['Boil.'],
  nutrition: null,
}

describe('extractRecipe', () => {
  it('returns a validated draft from a text input', async () => {
    const client = fakeClient(draft)
    const result = await extractRecipe(client, { kind: 'text', text: 'recipe text' })
    expect(result).toEqual(draft)
    expect(client.messages.create).toHaveBeenCalledOnce()
  })

  it('sends an image block for image input', async () => {
    const client = fakeClient(draft)
    await extractRecipe(client, { kind: 'image', data: 'b64', mediaType: 'image/png' })
    const arg = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const blocks = arg.messages[0].content
    expect(blocks.some((b: { type: string }) => b.type === 'image')).toBe(true)
  })

  it('throws when the model returns invalid JSON', async () => {
    const client: ClaudeLike = {
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'not json' }] }) },
    }
    await expect(extractRecipe(client, { kind: 'text', text: 'x' })).rejects.toThrow()
  })
})
