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

## Deploy to GitHub Pages + install on your phone

1. Create a GitHub repo named **`meal-prep-app`** (the name must match `base` in
   `vite.config.ts`; change both if you use a different name).
2. Push this project to the repo's `main` branch.
3. In the repo: **Settings → Pages → Build and deployment → Source = GitHub Actions.**
4. The included workflow (`.github/workflows/deploy.yml`) builds and publishes on
   every push. Your app will be at
   `https://<your-username>.github.io/meal-prep-app/`.
5. On your iPhone, open that URL in Safari → **Share → Add to Home Screen.**
   It now opens like a native app and works offline.

> Data lives only on the device you use. To move to a new phone you'd re-enter
> targets and any custom meals (single-device by design for v1).
