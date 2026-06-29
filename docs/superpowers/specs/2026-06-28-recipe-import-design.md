# Recipe Import (Image / PDF / Web Link) — Design

**Date:** 2026-06-28
**Status:** Approved design, pending implementation plan
**Scope:** v1 — import recipes from an image, a PDF, or a web page URL, and save them as custom recipes. TikTok/Instagram and video upload are explicitly **deferred to v2** (architecture reserves a seam for them).

---

## 1. Problem & Goal

Today the only way to add a recipe is to use a seeded recipe or hand-author a custom one. Every recipe in the app is highly structured ([src/types.ts](../../../src/types.ts) `Recipe`): it must carry `perServing` macros (kcal/protein/carbs/fat), a quantified `ingredients[]` list (name + qty + unit), `steps[]`, a `slot`, a `baseServingLabel`, and scale bounds — because the planner/solver consumes all of it.

**Goal:** let the user point at a recipe (photo, PDF, or URL) and get a pre-filled, editable `Recipe` they can review and save, without hand-typing the whole thing. The hard part is turning unstructured/multimodal input into the app's structured `Recipe` shape. A vision-capable LLM (the Claude API) is the right tool for that.

### Non-goals (v1)
- No macro **estimation**. If the source doesn't state nutrition, we say so and the user enters it (see §6).
- No TikTok/Instagram/social import.
- No video or audio upload (no transcription pipeline).
- No bulk/multi-recipe import.

---

## 2. Key constraint that drives the architecture

The app is currently a **100% client-side PWA** (React 19 + Vite, state in `localStorage`, hosted on GitHub Pages — see the `--base` path in [vite.config.ts](../../../vite.config.ts)). Two hard browser-security limits make a backend mandatory for this feature:

1. **The Claude API key cannot ship in browser JS.** It must live server-side.
2. **The browser cannot fetch arbitrary web pages** (CORS) — fetching a recipe URL must happen server-side.

**Decision: migrate hosting from GitHub Pages to a host that serves the static PWA *and* runs serverless functions in the same project (Cloudflare Pages, recommended; Vercel/Netlify equivalent).** Same repo, same push-to-deploy flow, one domain. The app code change is limited to: drop the `--base` path in `vite.config.ts`, add the host's config, and replace the GitHub Pages deploy workflow. This unlocks a single serverless function at `/api/import`.

> Image and PDF *could* technically work in a pure client-side app by having the user paste their own API key, but web-link import fundamentally cannot, and a user-pasted key is poor UX and a security footgun. We take the backend once, for all three input types.

---

## 3. Architecture overview

```
┌─────────────────────────── Browser (PWA) ───────────────────────────┐
│  ImportModal  ──pick source──▶  POST /api/import { type, payload }    │
│       ▲                                          │                    │
│       │                                          ▼                    │
│  RecipeReviewForm  ◀──── DraftRecipe + macrosFound ──────────────────┤
│       │                                                              │
│       └── user edits + fills macros ──▶ draftToRecipe() ──▶ storage  │
│                                          (customRecipes, source:custom)│
└──────────────────────────────────────────────────────────────────────┘
                                   │ (server)
        ┌──────────────────────────▼───────────────────────────┐
        │  /api/import  (serverless function, holds API key)     │
        │                                                        │
        │  type==='url'   → fetch HTML → jsonld-recipe.ts        │
        │                     ├ found & complete → DraftRecipe   │
        │                     └ else → strip to text → Claude    │
        │  type==='image' → Claude vision (image block)          │
        │  type==='pdf'   → Claude PDF (document block, base64)  │
        │                                                        │
        │  Claude call: structured output (output_config.format) │
        │  → validated DraftRecipe (nutrition only if in source) │
        └────────────────────────────────────────────────────────┘
```

---

## 4. Backend: the `/api/import` function

**Input:** `{ type: 'image' | 'pdf' | 'url', payload }`
- `image`: base64 data + media type (`image/png`, `image/jpeg`, `image/webp`)
- `pdf`: base64 data
- `url`: the page URL string

**Output:** `{ draft: DraftRecipe, macrosFound: boolean, source: ImportSource }`

### 4.1 Per-type logic
- **`url`** — server fetches the page HTML, then runs `jsonld-recipe.ts` to look for a `schema.org/Recipe` block (most recipe sites embed one, and it often includes `nutrition`). If a complete-enough block is found → build the `DraftRecipe` directly, **no Claude call** (fast, free). If absent or incomplete → strip the HTML to readable text and send that text to Claude.
- **`image`** — send the image straight to Claude as an `image` content block (vision). No OCR library.
- **`pdf`** — send the PDF straight to Claude as a `document` content block (`source.type: "base64"`, `media_type: "application/pdf"`), placed before the text instruction. Native Claude PDF support; no PDF library. (Limits: ≤32 MB request, ≤100 pages — recipe PDFs are tiny, but the function rejects oversized input up front.)

### 4.2 The Claude call
- **Surface:** a single Messages API call (`client.messages.create`) — this is one-shot structured extraction, not an agent. No Managed Agents.
- **Model:** default `claude-opus-4-8`. (`claude-sonnet-4-6` or `claude-haiku-4-5` are cheaper and likely adequate for this task; model id is a single config constant so it can be changed without code edits. Decision deferred to implementation — start with opus-4-8, measure, downgrade if quality holds.)
- **Structured output:** `output_config: { format: { type: "json_schema", schema: DRAFT_SCHEMA } }` so the response always validates to the `DraftRecipe` shape. (Note: structured outputs are incompatible with citations — we don't use citations.)
- **Prompt rules:** extract `name`, `baseServingLabel`, `ingredients[]` (name/qty/unit), `steps[]`, and a suggested `slot`. **Include nutrition only if it is explicitly stated in the source — never estimate or invent macros.** Set a `macrosFound` boolean accordingly.
- **Cost:** a few cents per import at most; $0 for URL imports resolved via JSON-LD.

### 4.3 Security & limits
- API key in a server env var only; never returned to the client.
- Reject payloads over a size cap (image/PDF byte limit) before calling Claude.
- Basic per-IP rate limiting on the function.
- For URL fetches: enforce an allowlist-free but sane fetch (timeout, max response size, follow a bounded number of redirects, reject non-HTTP(S) schemes and private/loopback addresses to avoid SSRF).

---

## 5. Frontend flow

1. **Entry point** — an "Import recipe" button next to the existing custom-recipe affordance (around [src/components/MealSearch.tsx](../../../src/components/MealSearch.tsx) / [src/components/Meals.tsx](../../../src/components/Meals.tsx)).
2. **ImportModal** — choose source: upload image, upload PDF, or paste a URL. Shows a loading state while `/api/import` runs.
3. **RecipeReviewForm** (the trust gate — nothing saves automatically):
   - Pre-filled `name`, `ingredients[]`, `steps[]`, `baseServingLabel`.
   - **Slot picker** — Claude's suggested `slot` is pre-selected; user confirms/changes.
   - If `macrosFound === false`: show banner **"Macro data could not be found — please enter it"** with empty, required kcal/protein/carbs/fat inputs. Save is blocked until macros are valid numbers.
   - `minScale`/`maxScale` default to `0.5`/`2.5` (matching seeds), editable.
4. **Save** — `draftToRecipe()` maps the reviewed draft to a `Recipe` with `source: 'custom'` and writes it through the existing `customRecipes` path in [src/state/storage.ts](../../../src/state/storage.ts). From there it flows into the planner/solver unchanged.

---

## 6. Data model changes

Reuse `Recipe` as-is. Add one optional provenance field to `Recipe` for traceability:

```ts
importedFrom?: { kind: 'image' | 'pdf' | 'url'; ref?: string } // ref = source URL for url imports
```

`DraftRecipe` is a separate, looser type (shared between server and client) representing extracted-but-unconfirmed data: same fields as `Recipe` minus `id`/`source`, with macros optional and a `slot` that is a suggestion. `draftToRecipe()` is the pure function that, given a `DraftRecipe` plus the user's review edits, produces a valid `Recipe`.

---

## 7. Module boundaries (each independently testable)

| Module | Responsibility | Tested how |
|---|---|---|
| `src/import/draft.ts` | `DraftRecipe` type + runtime validator (shared client/server) | unit |
| `src/import/jsonld-recipe.ts` | pure: HTML string → `DraftRecipe \| null` (+ macrosFound) | unit, no network |
| `src/import/draftToRecipe.ts` | pure: `DraftRecipe` + edits → `Recipe` | unit |
| `api/import.ts` | orchestration: route by type, fetch, call Claude | unit w/ Claude + fetch mocked |
| `src/components/ImportModal.tsx` | source selection + upload + loading | presentational |
| `src/components/RecipeReviewForm.tsx` | render/edit a `DraftRecipe`, enforce macro gate | presentational |

The three pure modules (`draft`, `jsonld-recipe`, `draftToRecipe`) are TDD targets — they carry the real logic and need no network or API key to test. The existing test setup is Vitest ([package.json](../../../package.json) `test` script), consistent with the current `*.test.ts` files in `src/lib/`.

---

## 8. Error handling

| Situation | Behavior |
|---|---|
| URL unreachable / blocks bots / non-recipe page | Clear message; suggest "screenshot it and upload the image instead." |
| Partial extraction (some fields missing) | Return what was found; user fills the rest in the review form. Never hard-fail. |
| No macros in source | `macrosFound: false` → review form shows the banner + required macro inputs. |
| File too large / wrong type | Rejected client-side before upload, with a specific message. |
| Claude/network/5xx error | Retry-able error message; the import is abandoned, nothing is saved. |
| Claude refusal (`stop_reason: "refusal"`) | Treat as extraction failure with a generic message (recipe content shouldn't trigger this, but handle it rather than crash). |

---

## 9. v2 seam (deferred, designed-for)

TikTok/Instagram links and video upload both reduce to: *acquire media → sample frames (ffmpeg) + transcribe audio (speech-to-text) → feed transcript + frame text to Claude → `DraftRecipe`.* Because v1 already standardizes on `DraftRecipe` → review form → save, v2 is **additive**: a new branch in `/api/import` (`type: 'video' | 'social'`) that produces a `DraftRecipe`, plus a heavier upload affordance in `ImportModal`. No rewrite of the review/save path. This is the only forward-looking accommodation in v1 — `/api/import`'s `type` is a discriminated union from the start so adding cases is clean.

---

## 10. Open implementation decisions (resolve during planning)

- Host choice: Cloudflare Pages vs Vercel vs Netlify (recommendation: Cloudflare Pages).
- Final extraction model: start `claude-opus-4-8`, evaluate `claude-sonnet-4-6`/`claude-haiku-4-5` for cost.
- "Complete enough" threshold for accepting JSON-LD without a Claude cleanup pass.
- Exact size caps and rate-limit numbers.
