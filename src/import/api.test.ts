import { describe, it, expect, vi, afterEach } from 'vitest'
import { importRecipe } from './api'

afterEach(() => vi.restoreAllMocks())

describe('importRecipe', () => {
  it('POSTs to /api/import and returns the parsed response', async () => {
    const payload = { draft: { name: 'X' }, source: { kind: 'url' } }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await importRecipe({ type: 'url', url: 'https://x.test' })
    expect(res).toEqual(payload)
    expect(fetchMock).toHaveBeenCalledWith('/api/import', expect.objectContaining({ method: 'POST' }))
  })

  it('throws the server error message on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'PDF too large (max ~5 MB)' }),
    }))
    await expect(importRecipe({ type: 'pdf', data: 'b64' })).rejects.toThrow('PDF too large')
  })
})
