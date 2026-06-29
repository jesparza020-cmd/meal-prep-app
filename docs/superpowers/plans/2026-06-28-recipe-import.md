# Recipe Import (Image / PDF / Web Link) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user import a recipe from an image, a PDF, or a web-page URL and save it as a custom recipe, by extracting it into the app's structured `Recipe` shape via a Cloudflare Pages serverless function backed by the Claude API.

**Architecture:** Migrate hosting from GitHub Pages → Cloudflare Pages (static PWA + a `functions/api/import.ts` serverless function in one project). The function holds the Claude key and does server-side URL fetching. All extraction logic lives in isomorphic, unit-tested modules under `src/import/` (so it runs in both the Worker and Vitest); the function file is a thin host adapter. The browser sends the source to `/api/import`, gets back a `DraftRecipe`, and opens the **existing** `RecipeEditor` pre-filled for review before save.

**Tech Stack:** React 19, TypeScript, Vite, vite-plugin-pwa, Vitest, Cloudflare Pages Functions (Workers runtime), `@anthropic-ai/sdk`.

## Global Constraints

- React `^19.2.6`, TypeScript `~6.0.2`, Vite `^8` — do not change major versions.
- **New runtime dependency:** `@anthropic-ai/sdk` only. **New dev dependencies:** `wrangler`, `@cloudflare/workers-types`. Add nothing else.
- State stays in `localStorage` via [src/state/storage.ts](../../../src/state/storage.ts); recipes keep the `Recipe` shape from [src/types.ts](../../../src/types.ts).
- **No macro estimation.** Capture nutrition only when the source explicitly provides all of kcal + protein + carbs + fat; otherwise `nutrition` is `null` and the user enters macros in the review screen.
- Extraction model constant: `claude-opus-4-8` (single config constant, changeable later).
- Tests use Vitest (`npm test` → `vitest run`); test env is `node`. Logic modules are TDD'd; UI is verified in the running app (no jsdom/testing-library is added).
- Code style: follow neighboring files — no semicolons, single quotes, 2-space indent (match [src/components/Meals.tsx](../../../src/components/Meals.tsx)).
- New custom recipes get `source: 'custom'` and an id of the form `` `c${Date.now()}` `` (match existing `RecipeEditor`).

---

## File Structure

**Created:**
- `src/import/draft.ts` — `DraftRecipe`/`DraftIngredient` types + `validateDraft()` runtime validator (shared client + Worker).
- `src/import/jsonld-recipe.ts` — pure `parseJsonLdRecipe(html)` → `DraftRecipe | null`.
- `src/import/draftToRecipe.ts` — pure `draftToRecipe(draft, source)` → `Recipe`.
- `src/import/extractionSchema.ts` — JSON schema + prompt text for Claude structured output.
- `src/import/extract.ts` — `extractRecipe(client, input)` → `{ draft }` (Claude client injected).
- `src/import/handler.ts` — `handleImport(body, deps)` orchestration (host-agnostic, fully testable).
- `src/import/api.ts` — browser fetch wrapper `importRecipe(payload)`.
- `src/components/ImportModal.tsx` — source picker + upload/paste + loading + error UI.
- `functions/api/import.ts` — thin Cloudflare Pages adapter calling `handleImport`.
- `wrangler.toml` — Pages project config (output dir, compat flags).
- Test files alongside: `src/import/draft.test.ts`, `jsonld-recipe.test.ts`, `draftToRecipe.test.ts`, `extract.test.ts`, `handler.test.ts`, `api.test.ts`.

**Modified:**
- `src/types.ts` — add `ImportSource` type and `Recipe.importedFrom?`.
- `src/components/Meals.tsx` — add "Import recipe" button; render `ImportModal`; extend `RecipeEditor` to accept a pre-filled draft + `macrosMissing` banner; preserve `importedFrom` on save.
- `vite.config.ts` — drop `base`, fix manifest `start_url`/`scope`, add `navigateFallbackDenylist` for `/api/`.
- `package.json` — deps + scripts.
- `.gitignore` — add `.dev.vars`.
- `README.md` — Cloudflare Pages deploy + env-var notes.

**Deleted:**
- `.github/workflows/deploy.yml` — GitHub Pages workflow (replaced by Cloudflare auto-deploy).

---

### Task 1: Draft types + validator

**Files:**
- Modify: `src/types.ts` (add `ImportSource`, `Recipe.importedFrom`)
- Create: `src/import/draft.ts`
- Test: `src/import/draft.test.ts`

**Interfaces:**
- Consumes: `Macros`, `Slot`, `SLOTS` from `src/types.ts`.
- Produces: `DraftIngredient`, `DraftRecipe`, `validateDraft(value: unknown): DraftRecipe` (throws `Error` on invalid), and `ImportSource` (on `Recipe`).

- [ ] **Step 1: Add `ImportSource` and `importedFrom` to types**

In `src/types.ts`, add after the `Recipe` interface's existing fields (inside the interface, before the closing brace add the field; add the interface above it):

```ts
export interface ImportSource {
  kind: 'image' | 'pdf' | 'url';
  ref?: string; // source URL for url imports
}
```

And add to the `Recipe` interface:

```ts
  importedFrom?: ImportSource; // provenance for imported recipes
```

- [ ] **Step 2: Write the failing test**

Create `src/import/draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateDraft } from './draft'

const valid = {
  name: 'Oats',
  baseServingLabel: '1 bowl',
  slot: 'breakfast',
  ingredients: [{ name: 'oats', qty: 60, unit: 'g' }],
  steps: ['Mix.'],
  nutrition: { kcal: 400, protein: 18, carbs: 58, fat: 14 },
}

describe('validateDraft', () => {
  it('accepts a valid draft', () => {
    expect(validateDraft(valid)).toEqual(valid)
  })

  it('accepts null nutrition', () => {
    const d = validateDraft({ ...valid, nutrition: null })
    expect(d.nutrition).toBeNull()
  })

  it('rejects a bad slot', () => {
    expect(() => validateDraft({ ...valid, slot: 'brunch' })).toThrow()
  })

  it('rejects a missing name', () => {
    const { name, ...rest } = valid
    expect(() => validateDraft(rest)).toThrow()
  })

  it('rejects partial nutrition', () => {
    expect(() => validateDraft({ ...valid, nutrition: { kcal: 400 } })).toThrow()
  })

  it('coerces non-array ingredients to an error', () => {
    expect(() => validateDraft({ ...valid, ingredients: 'oats' })).toThrow()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/import/draft.test.ts`
Expected: FAIL with "Cannot find module './draft'".

- [ ] **Step 4: Write the implementation**

Create `src/import/draft.ts`:

```ts
import type { ImportSource, Macros, Slot } from '../types'
import { SLOTS } from '../types'

export type { ImportSource }

export interface DraftIngredient {
  name: string
  qty: number
  unit: string
}

export interface DraftRecipe {
  name: string
  baseServingLabel: string
  slot: Slot
  ingredients: DraftIngredient[]
  steps: string[]
  nutrition: Macros | null
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function num(v: unknown): number {
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error('expected number')
  return v
}

function str(v: unknown): string {
  if (typeof v !== 'string') throw new Error('expected string')
  return v
}

function macros(v: unknown): Macros | null {
  if (v === null) return null
  if (!isObj(v)) throw new Error('nutrition must be object or null')
  return { kcal: num(v.kcal), protein: num(v.protein), carbs: num(v.carbs), fat: num(v.fat) }
}

export function validateDraft(value: unknown): DraftRecipe {
  if (!isObj(value)) throw new Error('draft must be an object')
  const slot = str(value.slot)
  if (!SLOTS.includes(slot as Slot)) throw new Error(`invalid slot: ${slot}`)
  if (!Array.isArray(value.ingredients)) throw new Error('ingredients must be an array')
  if (!Array.isArray(value.steps)) throw new Error('steps must be an array')
  return {
    name: str(value.name),
    baseServingLabel: str(value.baseServingLabel),
    slot: slot as Slot,
    ingredients: value.ingredients.map((i) => {
      if (!isObj(i)) throw new Error('ingredient must be object')
      return { name: str(i.name), qty: num(i.qty), unit: str(i.unit) }
    }),
    steps: value.steps.map((s) => str(s)),
    nutrition: macros(value.nutrition),
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/import/draft.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/import/draft.ts src/import/draft.test.ts
git commit -m "feat: DraftRecipe type and validator for recipe import"
```

---

### Task 2: schema.org JSON-LD parser

**Files:**
- Create: `src/import/jsonld-recipe.ts`
- Test: `src/import/jsonld-recipe.test.ts`

**Interfaces:**
- Consumes: `DraftRecipe`, `DraftIngredient` from `src/import/draft.ts`; `Macros`, `Slot` from `src/types.ts`.
- Produces: `parseJsonLdRecipe(html: string): DraftRecipe | null`.

- [ ] **Step 1: Write the failing test**

Create `src/import/jsonld-recipe.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseJsonLdRecipe } from './jsonld-recipe'

const withNutrition = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Recipe","name":"Test Bowl",
"recipeYield":"2 servings","recipeCategory":"Breakfast",
"recipeIngredient":["60 g rolled oats","200 ml milk"],
"recipeInstructions":[{"@type":"HowToStep","text":"Mix."},{"@type":"HowToStep","text":"Chill."}],
"nutrition":{"@type":"NutritionInformation","calories":"400 kcal","proteinContent":"18 g","carbohydrateContent":"58 g","fatContent":"14 g"}}
</script></head><body></body></html>`

const graphNoNutrition = `<script type="application/ld+json">
{"@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Plain","recipeIngredient":["salt"],"recipeInstructions":"Cook it."}]}
</script>`

describe('parseJsonLdRecipe', () => {
  it('parses name, yield, ingredients, steps, nutrition', () => {
    const d = parseJsonLdRecipe(withNutrition)!
    expect(d.name).toBe('Test Bowl')
    expect(d.baseServingLabel).toBe('2 servings')
    expect(d.slot).toBe('breakfast')
    expect(d.ingredients[0]).toEqual({ name: 'rolled oats', qty: 60, unit: 'g' })
    expect(d.steps).toEqual(['Mix.', 'Chill.'])
    expect(d.nutrition).toEqual({ kcal: 400, protein: 18, carbs: 58, fat: 14 })
  })

  it('finds Recipe inside @graph and yields null nutrition + default slot', () => {
    const d = parseJsonLdRecipe(graphNoNutrition)!
    expect(d.name).toBe('Plain')
    expect(d.slot).toBe('dinner')
    expect(d.steps).toEqual(['Cook it.'])
    expect(d.nutrition).toBeNull()
  })

  it('returns null when there is no Recipe node', () => {
    expect(parseJsonLdRecipe('<html><body>no jsonld</body></html>')).toBeNull()
  })

  it('returns null on malformed json-ld', () => {
    expect(parseJsonLdRecipe('<script type="application/ld+json">{bad</script>')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/import/jsonld-recipe.test.ts`
Expected: FAIL with "Cannot find module './jsonld-recipe'".

- [ ] **Step 3: Write the implementation**

Create `src/import/jsonld-recipe.ts` (regex-based, no DOMParser — works in the Workers runtime):

```ts
import type { Macros, Slot } from '../types'
import { SLOTS } from '../types'
import type { DraftIngredient, DraftRecipe } from './draft'

const SCRIPT_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

function firstNumber(s: string): number | null {
  const m = s.replace(',', '.').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

function parseIngredient(line: string): DraftIngredient {
  const m = line.trim().match(/^([\d.,/]+)\s*([a-zA-Z]+)?\s+(.*)$/)
  if (m && firstNumber(m[1]) !== null) {
    return { name: m[3].trim(), qty: firstNumber(m[1])!, unit: (m[2] ?? '').trim() }
  }
  return { name: line.trim(), qty: 1, unit: '' }
}

function toSteps(instructions: unknown): string[] {
  if (typeof instructions === 'string') {
    return instructions.split('\n').map((s) => s.trim()).filter(Boolean)
  }
  if (Array.isArray(instructions)) {
    return instructions
      .map((it) => (typeof it === 'string' ? it : it && typeof it === 'object' ? String((it as Record<string, unknown>).text ?? '') : ''))
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

function toNutrition(n: unknown): Macros | null {
  if (!n || typeof n !== 'object') return null
  const o = n as Record<string, unknown>
  const kcal = firstNumber(String(o.calories ?? ''))
  const protein = firstNumber(String(o.proteinContent ?? ''))
  const carbs = firstNumber(String(o.carbohydrateContent ?? ''))
  const fat = firstNumber(String(o.fatContent ?? ''))
  if (kcal === null || protein === null || carbs === null || fat === null) return null
  return { kcal, protein, carbs, fat }
}

function toSlot(category: unknown): Slot {
  const c = String(category ?? '').toLowerCase()
  for (const s of SLOTS) if (c.includes(s)) return s
  if (c.includes('dessert') || c.includes('drink') || c.includes('smoothie')) return 'snack'
  return 'dinner'
}

function typeMatches(node: Record<string, unknown>): boolean {
  const t = node['@type']
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))
}

function findRecipeNode(parsed: unknown): Record<string, unknown> | null {
  const stack: unknown[] = [parsed]
  while (stack.length) {
    const cur = stack.pop()
    if (Array.isArray(cur)) stack.push(...cur)
    else if (cur && typeof cur === 'object') {
      const obj = cur as Record<string, unknown>
      if (typeMatches(obj)) return obj
      if (Array.isArray(obj['@graph'])) stack.push(...(obj['@graph'] as unknown[]))
    }
  }
  return null
}

export function parseJsonLdRecipe(html: string): DraftRecipe | null {
  let match: RegExpExecArray | null
  SCRIPT_RE.lastIndex = 0
  while ((match = SCRIPT_RE.exec(html)) !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(match[1].trim())
    } catch {
      continue
    }
    const node = findRecipeNode(parsed)
    if (!node || typeof node.name !== 'string' || !node.name.trim()) continue
    const ings = Array.isArray(node.recipeIngredient) ? (node.recipeIngredient as unknown[]) : []
    const yieldVal = node.recipeYield
    return {
      name: node.name.trim(),
      baseServingLabel: Array.isArray(yieldVal) ? String(yieldVal[0] ?? '1 serving') : String(yieldVal ?? '1 serving'),
      slot: toSlot(node.recipeCategory),
      ingredients: ings.map((i) => parseIngredient(String(i))),
      steps: toSteps(node.recipeInstructions),
      nutrition: toNutrition(node.nutrition),
    }
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/import/jsonld-recipe.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/import/jsonld-recipe.ts src/import/jsonld-recipe.test.ts
git commit -m "feat: schema.org JSON-LD recipe parser"
```

---

### Task 3: draftToRecipe mapper

**Files:**
- Create: `src/import/draftToRecipe.ts`
- Test: `src/import/draftToRecipe.test.ts`

**Interfaces:**
- Consumes: `DraftRecipe` from `src/import/draft.ts`; `ImportSource`, `Recipe` from `src/types.ts`.
- Produces: `draftToRecipe(draft: DraftRecipe, source: ImportSource): Recipe`.

- [ ] **Step 1: Write the failing test**

Create `src/import/draftToRecipe.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { draftToRecipe } from './draftToRecipe'
import type { DraftRecipe } from './draft'

const base: DraftRecipe = {
  name: 'Oats',
  baseServingLabel: '1 bowl',
  slot: 'breakfast',
  ingredients: [{ name: 'oats', qty: 60, unit: 'g' }],
  steps: ['Mix.'],
  nutrition: { kcal: 400, protein: 18, carbs: 58, fat: 14 },
}

describe('draftToRecipe', () => {
  it('maps a draft with nutrition into a custom Recipe', () => {
    const r = draftToRecipe(base, { kind: 'url', ref: 'https://x.test/r' })
    expect(r.source).toBe('custom')
    expect(r.perServing).toEqual({ kcal: 400, protein: 18, carbs: 58, fat: 14 })
    expect(r.minScale).toBe(0.5)
    expect(r.maxScale).toBe(2.5)
    expect(r.importedFrom).toEqual({ kind: 'url', ref: 'https://x.test/r' })
    expect(r.id).toMatch(/^c\d+$/)
  })

  it('zeroes macros when nutrition is null', () => {
    const r = draftToRecipe({ ...base, nutrition: null }, { kind: 'image' })
    expect(r.perServing).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
    expect(r.importedFrom).toEqual({ kind: 'image' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/import/draftToRecipe.test.ts`
Expected: FAIL with "Cannot find module './draftToRecipe'".

- [ ] **Step 3: Write the implementation**

Create `src/import/draftToRecipe.ts`:

```ts
import type { ImportSource, Recipe } from '../types'
import type { DraftRecipe } from './draft'

export function draftToRecipe(draft: DraftRecipe, source: ImportSource): Recipe {
  return {
    id: `c${Date.now()}`,
    name: draft.name,
    slot: draft.slot,
    baseServingLabel: draft.baseServingLabel || '1 serving',
    perServing: draft.nutrition ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    ingredients: draft.ingredients,
    steps: draft.steps,
    minScale: 0.5,
    maxScale: 2.5,
    source: 'custom',
    importedFrom: source,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/import/draftToRecipe.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/import/draftToRecipe.ts src/import/draftToRecipe.test.ts
git commit -m "feat: map DraftRecipe to a custom Recipe"
```

---

### Task 4: Claude extraction (schema + extract)

**Files:**
- Create: `src/import/extractionSchema.ts`
- Create: `src/import/extract.ts`
- Test: `src/import/extract.test.ts`

**Interfaces:**
- Consumes: `DraftRecipe`, `validateDraft` from `src/import/draft.ts`.
- Produces:
  - `EXTRACTION_MODEL: string`, `DRAFT_JSON_SCHEMA`, `EXTRACTION_PROMPT` from `extractionSchema.ts`.
  - `type ExtractInput = { kind: 'text'; text: string } | { kind: 'image'; data: string; mediaType: string } | { kind: 'pdf'; data: string }`
  - `extractRecipe(client: ClaudeLike, input: ExtractInput): Promise<DraftRecipe>` from `extract.ts`, where `ClaudeLike` is the minimal slice of the Anthropic client used (so tests pass a fake).

- [ ] **Step 1: Write the failing test**

Create `src/import/extract.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/import/extract.test.ts`
Expected: FAIL with "Cannot find module './extract'".

- [ ] **Step 3: Write the schema module**

Create `src/import/extractionSchema.ts`:

```ts
import { SLOTS } from '../types'

export const EXTRACTION_MODEL = 'claude-opus-4-8'

export const DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    baseServingLabel: { type: 'string' },
    slot: { type: 'string', enum: [...SLOTS] },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          qty: { type: 'number' },
          unit: { type: 'string' },
        },
        required: ['name', 'qty', 'unit'],
      },
    },
    steps: { type: 'array', items: { type: 'string' } },
    nutrition: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            kcal: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
          },
          required: ['kcal', 'protein', 'carbs', 'fat'],
        },
        { type: 'null' },
      ],
    },
  },
  required: ['name', 'baseServingLabel', 'slot', 'ingredients', 'steps', 'nutrition'],
} as const

export const EXTRACTION_PROMPT = [
  'Extract this single recipe into the required JSON shape.',
  'Quantify each ingredient with a numeric qty and a unit (use "each" for countable items, "" if unknown).',
  'Pick the most fitting meal slot.',
  'Set "nutrition" ONLY if the source explicitly states calories AND protein AND carbs AND fat per serving.',
  'If any of those four are missing or absent, set "nutrition" to null. Never estimate or invent nutrition numbers.',
].join(' ')
```

- [ ] **Step 4: Write the extract module**

Create `src/import/extract.ts`:

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/import/extract.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/import/extractionSchema.ts src/import/extract.ts src/import/extract.test.ts
git commit -m "feat: Claude structured extraction for recipe import"
```

---

### Task 5: Import orchestration handler

**Files:**
- Create: `src/import/handler.ts`
- Test: `src/import/handler.test.ts`

**Interfaces:**
- Consumes: `parseJsonLdRecipe` (Task 2), `extractRecipe`/`ExtractInput` (Task 4), `DraftRecipe`/`ImportSource` (Tasks 1/3).
- Produces:
  - `type ImportRequest = { type: 'image'; data: string; mediaType: string } | { type: 'pdf'; data: string } | { type: 'url'; url: string }`
  - `type ImportResponse = { draft: DraftRecipe; source: ImportSource }`
  - `interface ImportDeps { fetchHtml(url: string): Promise<string>; extract(input: ExtractInput): Promise<DraftRecipe> }`
  - `handleImport(body: ImportRequest, deps: ImportDeps): Promise<ImportResponse>`

- [ ] **Step 1: Write the failing test**

Create `src/import/handler.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/import/handler.test.ts`
Expected: FAIL with "Cannot find module './handler'".

- [ ] **Step 3: Write the implementation**

Create `src/import/handler.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/import/handler.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/import/handler.ts src/import/handler.test.ts
git commit -m "feat: import orchestration handler (url/image/pdf routing)"
```

---

### Task 6: Cloudflare Pages function + wrangler config + deps

**Files:**
- Create: `functions/api/import.ts`
- Create: `wrangler.toml`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `handleImport`, `ImportRequest` (Task 5); `extractRecipe` (Task 4); `@anthropic-ai/sdk` default export.
- Produces: an HTTP `POST /api/import` endpoint (no exported TS symbols).

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install @anthropic-ai/sdk
npm install -D wrangler @cloudflare/workers-types
```
Expected: packages added to `package.json`; no errors.

- [ ] **Step 2: Add the dev script to package.json**

In `package.json` `"scripts"`, add (build then serve the Pages project + functions locally):

```json
    "dev:cf": "npm run build && wrangler pages dev dist"
```

- [ ] **Step 3: Create wrangler.toml**

Create `wrangler.toml`:

```toml
name = "meal-prep-app"
pages_build_output_dir = "dist"
compatibility_date = "2026-06-01"
compatibility_flags = ["nodejs_compat"]
```

- [ ] **Step 4: Ignore local secrets**

Add to `.gitignore` (new line at end):

```
.dev.vars
```

- [ ] **Step 5: Write the function**

Create `functions/api/import.ts`:

```ts
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
```

- [ ] **Step 6: Verify the build still compiles**

Run: `npm run build`
Expected: `tsc -b` and `vite build` succeed (the function is bundled by Cloudflare at deploy, not by `tsc -b`; this step confirms the app build is unbroken).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json wrangler.toml .gitignore functions/api/import.ts
git commit -m "feat: Cloudflare Pages /api/import function and config"
```

---

### Task 7: Hosting migration (drop GitHub Pages base path)

**Files:**
- Modify: `vite.config.ts`
- Delete: `.github/workflows/deploy.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: app served from `/` with API calls not intercepted by the service worker.

- [ ] **Step 1: Update vite.config.ts**

In `vite.config.ts`: remove the `base: '/meal-prep-app/',` line. In the `manifest`, change `start_url` and `scope` from `'/meal-prep-app/'` to `'/'`. Add a `workbox` option to the `VitePWA(...)` config so the SW never serves `/api/*` as a navigation fallback:

```ts
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'Meal Prep Planner',
        short_name: 'MealPrep',
        description: 'Weekly meal-prep plans scaled to your calorie and macro targets.',
        theme_color: '#16a34a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
```

- [ ] **Step 2: Delete the GitHub Pages workflow**

Run:
```bash
git rm .github/workflows/deploy.yml
```

- [ ] **Step 3: Document Cloudflare Pages deploy in README.md**

Append to `README.md`:

```markdown
## Deployment (Cloudflare Pages)

This app deploys to Cloudflare Pages (static PWA + the `functions/` serverless API).

1. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, select this repo.
2. Build settings: **Build command** `npm run build`, **Build output directory** `dist`. Functions in `functions/` are detected automatically.
3. Add the environment variable **`ANTHROPIC_API_KEY`** (Settings → Environment variables) for Production and Preview.
4. Push to the default branch to trigger a deploy.

### Local development

- Frontend only: `npm run dev` (the `/api/import` call will fail without the function).
- Full app + function: create a `.dev.vars` file with `ANTHROPIC_API_KEY=sk-ant-...` (git-ignored), then run `npm run dev:cf`.
```

- [ ] **Step 4: Verify the build produces root-relative asset paths**

Run: `npm run build`
Then confirm root-relative paths (no `/meal-prep-app/` prefix):
```bash
grep -c "/meal-prep-app/" dist/index.html
```
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts README.md
git commit -m "chore: migrate hosting from GitHub Pages to Cloudflare Pages"
```

---

### Task 8: Browser API client

**Files:**
- Create: `src/import/api.ts`
- Test: `src/import/api.test.ts`

**Interfaces:**
- Consumes: `ImportRequest`, `ImportResponse` from `src/import/handler.ts`.
- Produces: `importRecipe(req: ImportRequest): Promise<ImportResponse>` (throws `Error` with the server message on failure).

- [ ] **Step 1: Write the failing test**

Create `src/import/api.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/import/api.test.ts`
Expected: FAIL with "Cannot find module './api'".

- [ ] **Step 3: Write the implementation**

Create `src/import/api.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/import/api.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/import/api.ts src/import/api.test.ts
git commit -m "feat: browser client for /api/import"
```

---

### Task 9: ImportModal component

**Files:**
- Create: `src/components/ImportModal.tsx`

**Interfaces:**
- Consumes: `importRecipe` (Task 8), `draftToRecipe` (Task 3), `Recipe` (types), `ImportResponse` (Task 5).
- Produces: `ImportModal` component:
  ```ts
  function ImportModal(props: {
    onCancel: () => void
    onImported: (recipe: Recipe, macrosMissing: boolean) => void
  }): JSX.Element
  ```
  On success it converts the draft via `draftToRecipe` and calls `onImported(recipe, draft.nutrition == null)`.

- [ ] **Step 1: Write the component**

Create `src/components/ImportModal.tsx`:

```tsx
import { useState } from 'react'
import type { Recipe } from '../types'
import { importRecipe } from '../import/api'
import { draftToRecipe } from '../import/draftToRecipe'

type Mode = 'image' | 'pdf' | 'url'

const MAX_BYTES = 5 * 1024 * 1024

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1)) // strip data: prefix
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export function ImportModal({
  onCancel,
  onImported,
}: {
  onCancel: () => void
  onImported: (recipe: Recipe, macrosMissing: boolean) => void
}) {
  const [mode, setMode] = useState<Mode>('image')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setError(null)
    setLoading(true)
    try {
      let res
      if (mode === 'url') {
        if (!url.trim()) throw new Error('Enter a recipe URL')
        res = await importRecipe({ type: 'url', url: url.trim() })
      } else {
        if (!file) throw new Error('Choose a file')
        if (file.size > MAX_BYTES) throw new Error('File too large (max 5 MB)')
        const data = await fileToBase64(file)
        res =
          mode === 'image'
            ? await importRecipe({ type: 'image', data, mediaType: file.type || 'image/jpeg' })
            : await importRecipe({ type: 'pdf', data })
      }
      onImported(draftToRecipe(res.draft, res.source), res.draft.nutrition == null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel">
      <h2>Import a recipe</h2>

      <div className="field">
        <label>Source</label>
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          <option value="image">Photo / screenshot</option>
          <option value="pdf">PDF</option>
          <option value="url">Web link</option>
        </select>
      </div>

      {mode === 'url' ? (
        <div className="field">
          <label>Recipe URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/best-oatmeal"
            inputMode="url"
          />
        </div>
      ) : (
        <div className="field">
          <label>{mode === 'image' ? 'Image file' : 'PDF file'}</label>
          <input
            type="file"
            accept={mode === 'image' ? 'image/*' : 'application/pdf'}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {error && <p className="muted small danger">{error}</p>}

      <div className="grid2">
        <button className="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button className="primary" onClick={run} disabled={loading}>
          {loading ? 'Importing…' : 'Import'}
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (component is imported in Task 10; a build here confirms no type errors in the file itself once referenced — if `tsc -b` prunes unused files, the real check happens in Task 10. Run `npx tsc -b` and confirm no errors.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ImportModal.tsx
git commit -m "feat: ImportModal for recipe import (image/pdf/url)"
```

---

### Task 10: Wire import into Meals + macros-missing review banner

**Files:**
- Modify: `src/components/Meals.tsx`

**Interfaces:**
- Consumes: `ImportModal` (Task 9); existing `RecipeEditor`, `onAdd` prop.
- Produces: an "Import recipe" entry point; `RecipeEditor` extended with an optional `macrosMissing` prop that empties the macro fields, shows a banner, and blocks save until macros are entered.

- [ ] **Step 1: Add import + modal state to `Meals`**

At the top of `src/components/Meals.tsx`, add the import:

```tsx
import { ImportModal } from './ImportModal'
```

In the `Meals` function, add state alongside `editing`/`creating`:

```tsx
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState<{ recipe: Recipe; macrosMissing: boolean } | null>(null)
```

- [ ] **Step 2: Render the modal and the pre-filled editor**

Replace the existing `if (creating || editing) { ... }` block with:

```tsx
  if (importing) {
    return (
      <ImportModal
        onCancel={() => setImporting(false)}
        onImported={(recipe, macrosMissing) => {
          setImporting(false)
          setImported({ recipe, macrosMissing })
        }}
      />
    )
  }

  if (imported) {
    return (
      <RecipeEditor
        recipe={imported.recipe}
        macrosMissing={imported.macrosMissing}
        onCancel={() => setImported(null)}
        onSubmit={(r) => {
          onAdd(r)
          setImported(null)
        }}
      />
    )
  }

  if (creating || editing) {
    return (
      <RecipeEditor
        recipe={editing}
        onCancel={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSubmit={(r) => {
          if (editing) onUpdate(editing, r)
          else onAdd(r)
          setCreating(false)
          setEditing(null)
        }}
      />
    )
  }
```

- [ ] **Step 3: Add the "Import recipe" button**

In the `row-between` header `div`, replace the single button with both buttons:

```tsx
      <div className="panel row-between">
        <h2>Your meals</h2>
        <div className="meal-actions">
          <button className="ghost small-btn" onClick={() => setImporting(true)}>⬆ Import</button>
          <button className="primary small-btn" onClick={() => setCreating(true)}>+ Add meal</button>
        </div>
      </div>
```

- [ ] **Step 4: Extend `RecipeEditor` to accept `macrosMissing`**

Change the `RecipeEditor` signature and macro initial state. Update the function params:

```tsx
function RecipeEditor({
  recipe,
  onSubmit,
  onCancel,
  macrosMissing = false,
}: {
  recipe: Recipe | null
  onSubmit: (r: Recipe) => void
  onCancel: () => void
  macrosMissing?: boolean
}) {
```

Change the three macro `useState` initializers so they start empty when macros are missing:

```tsx
  const [protein, setProtein] = useState(macrosMissing ? '' : String(recipe?.perServing.protein ?? 25))
  const [carbs, setCarbs] = useState(macrosMissing ? '' : String(recipe?.perServing.carbs ?? 30))
  const [fat, setFat] = useState(macrosMissing ? '' : String(recipe?.perServing.fat ?? 10))
```

- [ ] **Step 5: Preserve `importedFrom` and gate save on macros**

In the `save` function, add a macro guard after the existing `if (!name.trim()) return` and preserve provenance on the built recipe. Replace the `save` function body's guard and the `r` object's tail:

```tsx
  const macrosEntered = protein !== '' && carbs !== '' && fat !== ''

  const save = () => {
    if (!name.trim()) return
    if (!macrosEntered) return
    const usableForSlots =
      dualLunchDinner && (slot === 'lunch' || slot === 'dinner')
        ? (['lunch', 'dinner'] as Slot[])
        : undefined
    const r: Recipe = {
      id: recipe?.source === 'custom' ? recipe.id : `c${Date.now()}`,
      name: name.trim(),
      slot,
      baseServingLabel: servingLabel.trim() || '1 serving',
      perServing: { kcal, protein: p, carbs: c, fat: f },
      ingredients: parseIngredients(ingredients),
      steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
      minScale: Number(minScale) || 0.5,
      maxScale: Number(maxScale) || 2.5,
      source: 'custom',
      ...(usableForSlots ? { usableForSlots } : {}),
      ...(recipe?.importedFrom ? { importedFrom: recipe.importedFrom } : {}),
    }
    onSubmit(r)
  }
```

- [ ] **Step 6: Show the banner and disable the save button**

Right after the `<h2>{recipe ? 'Edit meal' : 'Add meal'}</h2>` line in `RecipeEditor`, add:

```tsx
      {macrosMissing && (
        <p className="muted small danger">
          Macro data could not be found — please enter protein, carbs, and fat below.
        </p>
      )}
```

And change the Save button to disable until macros are entered:

```tsx
        <button className="primary" onClick={save} disabled={!macrosEntered}>Save meal</button>
```

- [ ] **Step 7: Verify the full build and type-check pass**

Run: `npm run build`
Expected: `tsc -b` and `vite build` succeed with no errors.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests pass (existing `lib/` tests + the new `import/` tests).

- [ ] **Step 9: Manual smoke test (running app)**

Run `npm run dev`, open the Meals tab, and confirm: the "⬆ Import" button appears; clicking it shows the source picker; choosing "Web link" / entering a URL and clicking Import shows the loading state. (Full end-to-end import requires the function — run `npm run dev:cf` with a `.dev.vars` `ANTHROPIC_API_KEY` set, then import a real recipe URL and confirm the editor opens pre-filled. For a source with no nutrition, confirm the red banner shows and Save is disabled until macros are typed.)

- [ ] **Step 10: Commit**

```bash
git add src/components/Meals.tsx
git commit -m "feat: wire recipe import into Meals with macro-entry review"
```

---

## Self-Review Notes

- **Spec coverage:** §2 backend → Tasks 6/7; §4 function/JSON-LD/Claude/limits → Tasks 2/4/5/6; §5 frontend flow (entry, modal, review, save) → Tasks 9/10; §6 data model → Task 1 (+ draftToRecipe Task 3); §7 module boundaries → all task file layout; §8 error handling → Tasks 6 (server messages, 413/502), 8 (client error surfacing), 10 (macro gate); §9 v2 seam → `ImportRequest` discriminated union (Task 5). No estimation anywhere (Task 4 prompt + schema, Task 3 zeroes).
- **Refinement vs spec:** the spec named a separate `RecipeReviewForm`; the plan instead **reuses the existing `RecipeEditor`** (DRY — it already covers every field) and the spec's separate `macrosFound` boolean is derived client-side from `draft.nutrition == null` (single source of truth) rather than carried as a redundant field.
- **Type consistency:** `DraftRecipe`/`DraftIngredient` (Task 1) flow unchanged through Tasks 2–5, 9; `ImportRequest`/`ImportResponse`/`ImportDeps` (Task 5) reused verbatim in Tasks 6 and 8; `ClaudeLike`/`ExtractInput` (Task 4) reused in Task 6; `draftToRecipe(draft, source)` signature consistent across Tasks 3, 9.
