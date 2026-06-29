/// <reference types="@cloudflare/workers-types" />
import Anthropic from '@anthropic-ai/sdk'
import { handleImport, type ImportRequest } from '../../src/import/handler'
import { extractRecipe, type ExtractInput } from '../../src/import/extract'

interface Env {
  ANTHROPIC_API_KEY: string
}

const MAX_DATA_CHARS = 7_000_000 // ~5 MB of base64

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function fetchHtml(url: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are supported')
  }
  const res = await fetch(parsed.toString(), {
    redirect: 'follow',
    headers: { 'user-agent': 'MealPrepPlanner/1.0 (+recipe-import)' },
  })
  if (!res.ok) throw new Error(`Could not fetch page (${res.status})`)
  return (await res.text()).slice(0, 1_500_000)
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: ImportRequest
  try {
    body = (await context.request.json()) as ImportRequest
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (body.type === 'image' && (body.data?.length ?? 0) > MAX_DATA_CHARS) {
    return json({ error: 'Image too large (max ~5 MB)' }, 413)
  }
  if (body.type === 'pdf' && (body.data?.length ?? 0) > MAX_DATA_CHARS) {
    return json({ error: 'PDF too large (max ~5 MB)' }, 413)
  }

  const client = new Anthropic({ apiKey: context.env.ANTHROPIC_API_KEY })

  try {
    const result = await handleImport(body, {
      fetchHtml,
      extract: (input: ExtractInput) => extractRecipe(client, input),
    })
    return json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed'
    return json({ error: message }, 502)
  }
}
