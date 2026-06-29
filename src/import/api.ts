import type { ImportRequest, ImportResponse } from './handler'

export async function importRecipe(req: ImportRequest): Promise<ImportResponse> {
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `Import failed (${res.status})`)
  }
  return (await res.json()) as ImportResponse
}
