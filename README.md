# 🍱 Meal Prep Planner

An installable phone web app (PWA) that builds a weekly **meal-prep plan** —
breakfast, lunch, snack, protein shake, dinner — and **scales each portion** so
every day hits your calorie and macro targets. Cook once, eat all week. Each new
week avoids the meals you had the week before.

## How it works

- **You set daily targets** (protein / carbs / fat → calories auto-calculated).
- **Generate a week** picks one recipe per slot and a deterministic solver
  (`src/lib/solver.ts`) finds the portion multiplier per meal so the day's totals
  land on your targets — no AI/API needed at runtime, works fully offline.
- **No repeats:** the planner (`src/lib/planner.ts`) excludes the previous week's
  meals and prefers least-recently-used ones, relaxing only if a slot runs out.
- **Your library, your way:** ships with ~40 easy meal-prep recipes; add / edit /
  delete your own from the **Meals** tab. Everything is stored on-device
  (`localStorage`) — no accounts, no backend.
- **Import recipes:** from the **Meals** tab, import a recipe from a photo, a PDF,
  or a web-page URL. A Cloudflare Pages function (`functions/api/import.ts`)
  extracts it into the app's structured shape via the Claude API; you review and
  edit it before saving. Web links prefer the page's embedded schema.org data and
  only call the model as a fallback.

Planning and portion-scaling are fully **offline** — no API needed at runtime.
The only online piece is recipe import (above) and regenerating
`src/data/seedRecipes.ts` in Claude Code when you want fresh seed meals.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/
npm test         # solver + planner unit tests
npm run build    # type-check + production build (PWA) into dist/
```

## Deployment (Cloudflare Pages)

This app deploys to Cloudflare Pages (static PWA + the `functions/` serverless API).

1. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, select this repo.
2. Build settings: **Build command** `npm run build`, **Build output directory** `dist`. Functions in `functions/` are detected automatically.
3. Add the environment variable **`ANTHROPIC_API_KEY`** (Settings → Environment variables) for Production and Preview.
4. Push to the default branch to trigger a deploy.

### Local development

- Frontend only: `npm run dev` (the `/api/import` call will fail without the function).
- Full app + function: create a `.dev.vars` file with `ANTHROPIC_API_KEY=sk-ant-...` (git-ignored), then run `npm run dev:cf`.

### Security follow-up before public launch

`/api/import` is an unauthenticated endpoint that calls the paid Claude API.
Server-side fetches are already guarded against SSRF (`src/import/ssrf.ts`, plus a
timeout, bounded redirects, and a response-size cap), but **per-IP rate limiting
is not yet implemented**. Add it before exposing the app to real traffic — e.g. a
[Cloudflare Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
or a KV counter keyed on `cf-connecting-ip` in `functions/api/import.ts`.
