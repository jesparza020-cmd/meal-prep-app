/// <reference types="@cloudflare/workers-types" />
import Anthropic from '@anthropic-ai/sdk'
import { handleImport, type ImportRequest } from '../../src/import/handler'
import { extractRecipe, type ExtractInput } from '../../src/import/extract'
import { isBlockedHost } from '../../src/import/ssrf'

interface Env {
  ANTHROPIC_API_KEY: string
}

const MAX_DATA_CHARS = 7_000_000 // ~5 MB of base64
const MAX_HTML_BYTES = 1_500_000
const MAX_REDIRECTS = 3

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function parseAllowedUrl(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are supported')
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error('URL host is not allowed')
  }
  return parsed
}

async function fetchHtml(url: string): Promise<string> {
  let current = parseAllowedUrl(url)
  let hopsLeft = MAX_REDIRECTS
  let res: Response

  while (true) {
    res = await fetch(current.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: { 'user-agent': 'MealPrepPlanner/1.0 (+recipe-import)' },
    })

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      if (hopsLeft <= 0) throw new Error('Too many redirects')
      const next = new URL(res.headers.get('location')!, current)
      current = parseAllowedUrl(next.toString())
      hopsLeft -= 1
      continue
    }

    break
  }

  if (!res.ok) throw new Error(`Could not fetch page (${res.status})`)

  if (!res.body) {
    return (await res.text()).slice(0, MAX_HTML_BYTES)
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (total + value.length > MAX_HTML_BYTES) {
      const remaining = MAX_HTML_BYTES - total
      if (remaining > 0) chunks.push(value.subarray(0, remaining))
      total += remaining > 0 ? remaining : 0
      await reader.cancel()
      break
    }
    chunks.push(value)
    total += value.length
  }

  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(combined)
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
