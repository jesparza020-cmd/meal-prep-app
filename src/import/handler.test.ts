import { describe, it, expect, vi } from 'vitest'
import { handleImport } from './handler'
import type { DraftRecipe } from './draft'

const draft: DraftRecipe = {
  name: 'X', baseServingLabel: '1', slot: 'dinner',
  ingredients: [], steps: [], nutrition: null,
}

const jsonldHtml = `<script type="application/ld+json">
{"@type":"Recipe","name":"From JSONLD","recipeIngredient":["salt"],"recipeInstructions":"Cook.",
"nutrition":{"calories":"100 kcal","proteinContent":"1 g","carbohydrateContent":"2 g","fatContent":"3 g"}}
</script>`

describe('handleImport', () => {
  it('uses JSON-LD for a url and skips Claude when complete', async () => {
    const extract = vi.fn()
    const res = await handleImport(
      { type: 'url', url: 'https://x.test/r' },
      { fetchHtml: async () => jsonldHtml, extract },
    )
    expect(res.draft.name).toBe('From JSONLD')
    expect(res.source).toEqual({ kind: 'url', ref: 'https://x.test/r' })
    expect(extract).not.toHaveBeenCalled()
  })

  it('falls back to Claude text extraction when no JSON-LD', async () => {
    const extract = vi.fn().mockResolvedValue(draft)
    const res = await handleImport(
      { type: 'url', url: 'https://x.test/r' },
      { fetchHtml: async () => '<html><body>plain page text</body></html>', extract },
    )
    expect(extract).toHaveBeenCalledOnce()
    expect((extract.mock.calls[0][0] as { kind: string }).kind).toBe('text')
    expect(res.draft).toEqual(draft)
  })

  it('routes image input straight to Claude', async () => {
    const extract = vi.fn().mockResolvedValue(draft)
    const res = await handleImport(
      { type: 'image', data: 'b64', mediaType: 'image/png' },
      { fetchHtml: async () => '', extract },
    )
    expect((extract.mock.calls[0][0] as { kind: string }).kind).toBe('image')
    expect(res.source).toEqual({ kind: 'image' })
  })

  it('routes pdf input straight to Claude', async () => {
    const extract = vi.fn().mockResolvedValue(draft)
    await handleImport({ type: 'pdf', data: 'b64' }, { fetchHtml: async () => '', extract })
    expect((extract.mock.calls[0][0] as { kind: string }).kind).toBe('pdf')
  })
})
