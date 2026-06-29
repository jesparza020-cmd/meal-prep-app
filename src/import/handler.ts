import type { ImportSource } from '../types'
import type { DraftRecipe } from './draft'
import type { ExtractInput } from './extract'
import { parseJsonLdRecipe } from './jsonld-recipe'

export type ImportRequest =
  | { type: 'image'; data: string; mediaType: string }
  | { type: 'pdf'; data: string }
  | { type: 'url'; url: string }

export interface ImportResponse {
  draft: DraftRecipe
  source: ImportSource
}

export interface ImportDeps {
  fetchHtml(url: string): Promise<string>
  extract(input: ExtractInput): Promise<DraftRecipe>
}

// Strip tags/script/style to readable text for the Claude fallback.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20000)
}

export async function handleImport(body: ImportRequest, deps: ImportDeps): Promise<ImportResponse> {
  if (body.type === 'image') {
    const draft = await deps.extract({ kind: 'image', data: body.data, mediaType: body.mediaType })
    return { draft, source: { kind: 'image' } }
  }
  if (body.type === 'pdf') {
    const draft = await deps.extract({ kind: 'pdf', data: body.data })
    return { draft, source: { kind: 'pdf' } }
  }
  const html = await deps.fetchHtml(body.url)
  const fromJsonLd = parseJsonLdRecipe(html)
  if (fromJsonLd) return { draft: fromJsonLd, source: { kind: 'url', ref: body.url } }
  const draft = await deps.extract({ kind: 'text', text: htmlToText(html) })
  return { draft, source: { kind: 'url', ref: body.url } }
}
