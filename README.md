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

AI's role is **offline**: regenerate or expand `src/data/seedRecipes.ts` in Claude
Code whenever you want fresh meals, then redeploy.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/meal-prep-app/
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
