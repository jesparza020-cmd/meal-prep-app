# New Meal Plan Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-click week generator with a guided multi-step "New meal plan" flow (review targets → configure each meal type → generate → review & tweak → approve → save to History with full detail view).

**Architecture:** Pure planner functions (`generatePlan`, `recalcScales`, eligibility helpers) drive a wizard component tree under a new `PlanTab` wrapper that toggles between the existing read-only `PlanView` and the new `NewPlanWizard`. A shared `MealCard` is reused by plan view, wizard review, and a new clickable History detail. `WeekPlan` slot maps become partial to allow excluding meal types.

**Tech Stack:** React 19, TypeScript, Vite, Vitest. State persisted in localStorage via existing `state/storage.ts`.

## Global Constraints

- No new runtime dependencies (only `react`/`react-dom` allowed).
- Plans persist only on Approve; drafts never enter `history`.
- Iterate slots as `SLOTS.filter((s) => plan.slots[s])` everywhere (partial plans).
- Existing `solver.test.ts` and `planner.test.ts` must stay green.
- Multi-slot tagging is lunch/dinner only; base matching is case-insensitive ingredient substring; Change search is filtered to the slot being changed.

---

### Task 1: Eligibility + slot helpers and partial WeekPlan types

**Files:**
- Modify: `src/types.ts`
- Test: `src/lib/eligibility.test.ts` (create)

**Interfaces:**
- Produces:
  - `slotsFor(recipe: Recipe): Slot[]` → `recipe.usableForSlots ?? [recipe.slot]`
  - `eligibleForSlot(recipe: Recipe, slot: Slot): boolean`
  - `Recipe.usableForSlots?: Slot[]`
  - `SlotConfig` and `PlanConfig` types
  - `WeekPlan.slots: Partial<Record<Slot, string>>`, `WeekPlan.scales: Partial<Record<Slot, number>>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/eligibility.test.ts
import { describe, it, expect } from 'vitest'
import { slotsFor, eligibleForSlot } from '../types'
import type { Recipe } from '../types'

function mk(over: Partial<Recipe>): Recipe {
  return {
    id: 'x', name: 'x', slot: 'dinner', baseServingLabel: '1',
    perServing: { kcal: 300, protein: 25, carbs: 30, fat: 10 },
    ingredients: [], steps: [], minScale: 0.5, maxScale: 3, source: 'seed',
    ...over,
  }
}

describe('eligibility', () => {
  it('defaults eligibility to the primary slot', () => {
    const r = mk({ slot: 'dinner' })
    expect(slotsFor(r)).toEqual(['dinner'])
    expect(eligibleForSlot(r, 'dinner')).toBe(true)
    expect(eligibleForSlot(r, 'lunch')).toBe(false)
  })

  it('honors usableForSlots when present', () => {
    const r = mk({ slot: 'dinner', usableForSlots: ['lunch', 'dinner'] })
    expect(eligibleForSlot(r, 'lunch')).toBe(true)
    expect(eligibleForSlot(r, 'dinner')).toBe(true)
    expect(eligibleForSlot(r, 'snack')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- eligibility`
Expected: FAIL — `slotsFor` / `eligibleForSlot` not exported.

- [ ] **Step 3: Edit `src/types.ts`**

Add `usableForSlots?: Slot[]` to the `Recipe` interface (after `source`). Change `WeekPlan`:

```ts
export interface WeekPlan {
  weekStartISO: string
  slots: Partial<Record<Slot, string>>
  scales: Partial<Record<Slot, number>>
  totals: Macros
  targets: Targets
}
```

Add the config types and helpers at the end of the file:

```ts
export interface SlotConfig {
  include: boolean
  mode: 'random' | 'base' | 'exact'
  base?: string
  recipeId?: string
}

export type PlanConfig = Record<Slot, SlotConfig>

export function slotsFor(recipe: Recipe): Slot[] {
  return recipe.usableForSlots ?? [recipe.slot]
}

export function eligibleForSlot(recipe: Recipe, slot: Slot): boolean {
  return slotsFor(recipe).includes(slot)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- eligibility`
Expected: PASS.

- [ ] **Step 5: Run full test + typecheck**

Run: `npm test && npx tsc -b`
Expected: PASS. (Type errors in planner/components from partial slots are addressed in later tasks; if `tsc` flags them now, that is expected and fixed in Tasks 2/5/8 — only `npm test` must be green here.)

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/eligibility.test.ts
git commit -m "feat: add slot eligibility helpers and partial WeekPlan types"
```

---

### Task 2: `generatePlan` with include/base/exact modes

**Files:**
- Modify: `src/lib/planner.ts`
- Test: `src/lib/planner.test.ts` (add cases)

**Interfaces:**
- Consumes: `eligibleForSlot`, `SlotConfig`, `PlanConfig`, partial `WeekPlan` (Task 1); `solveScales` (existing).
- Produces:
  - `defaultConfig(): PlanConfig` — all slots `{ include: true, mode: 'random' }`.
  - `generatePlan(recipes: Recipe[], target: Targets, config: PlanConfig, history: WeekPlan[], rng?: () => number): WeekPlan`
  - `generateWeek` re-implemented as `generatePlan(recipes, target, defaultConfig(), history, rng)`.

- [ ] **Step 1: Write the failing tests (append to `src/lib/planner.test.ts`)**

```ts
import { generatePlan, defaultConfig } from './planner'
import type { PlanConfig } from '../types'

function cfg(over: Partial<Record<Slot, Partial<import('../types').SlotConfig>>> = {}): PlanConfig {
  const base = defaultConfig()
  for (const k of Object.keys(over) as Slot[]) base[k] = { ...base[k], ...over[k]! }
  return base
}

describe('generatePlan', () => {
  it('omits excluded slots from the plan', () => {
    const plan = generatePlan(library(), target, cfg({ snack: { include: false } }), [])
    expect(plan.slots.snack).toBeUndefined()
    expect(plan.slots.breakfast).toBeDefined()
  })

  it('honors an exact recipe pick', () => {
    const lib = library()
    const chosen = lib.find((r) => r.slot === 'dinner')!
    const plan = generatePlan(
      lib, target, cfg({ dinner: { mode: 'exact', recipeId: chosen.id } }), [],
    )
    expect(plan.slots.dinner).toBe(chosen.id)
  })

  it('matches a base by ingredient name', () => {
    const lib = library()
    const chicken = recipe('dinner', {})
    chicken.ingredients = [{ name: 'Grilled Chicken', qty: 150, unit: 'g' }]
    const tofu = recipe('dinner', {})
    tofu.ingredients = [{ name: 'Tofu', qty: 150, unit: 'g' }]
    const onlyDinner = lib.filter((r) => r.slot !== 'dinner').concat(chicken, tofu)
    const plan = generatePlan(
      onlyDinner, target, cfg({ dinner: { mode: 'base', base: 'chicken' } }), [],
    )
    expect(plan.slots.dinner).toBe(chicken.id)
  })

  it('treats a dinner recipe tagged for lunch as a lunch candidate', () => {
    const lib = library().filter((r) => r.slot !== 'lunch')
    const dual = recipe('dinner', {})
    dual.usableForSlots = ['lunch', 'dinner']
    const plan = generatePlan(
      lib.concat(dual), target, cfg({ lunch: { mode: 'exact', recipeId: dual.id } }), [],
    )
    expect(plan.slots.lunch).toBe(dual.id)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- planner`
Expected: FAIL — `generatePlan` / `defaultConfig` not exported.

- [ ] **Step 3: Rewrite `src/lib/planner.ts`**

```ts
import type { PlanConfig, Recipe, Slot, Targets, WeekPlan } from '../types'
import { SLOTS, eligibleForSlot } from '../types'
import { solveScales, type SolverItem } from './solver'

const ATTEMPTS = 40

function mondayISO(d = new Date()): string {
  const date = new Date(d)
  const day = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date.toISOString().slice(0, 10)
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

export function defaultConfig(): PlanConfig {
  const c = {} as PlanConfig
  for (const s of SLOTS) c[s] = { include: true, mode: 'random' }
  return c
}

/** Eligible candidates for a slot, narrowed by the slot's config mode. */
function candidatesFor(recipes: Recipe[], slot: Slot, cfg: PlanConfig[Slot]): Recipe[] {
  const eligible = recipes.filter((r) => eligibleForSlot(r, slot))
  if (cfg.mode === 'exact' && cfg.recipeId) {
    const exact = eligible.filter((r) => r.id === cfg.recipeId)
    if (exact.length > 0) return exact
  }
  if (cfg.mode === 'base' && cfg.base?.trim()) {
    const needle = cfg.base.trim().toLowerCase()
    const matched = eligible.filter((r) =>
      r.ingredients.some((ing) => ing.name.toLowerCase().includes(needle)),
    )
    if (matched.length > 0) return matched
  }
  return eligible
}

export function generatePlan(
  recipes: Recipe[],
  target: Targets,
  config: PlanConfig,
  history: WeekPlan[],
  rng: () => number = Math.random,
): WeekPlan {
  const included = SLOTS.filter((s) => config[s].include)
  if (included.length === 0) throw new Error('Select at least one meal type.')

  const lastWeek = history[history.length - 1]

  const recency = new Map<string, number>()
  for (let k = history.length - 1; k >= 0; k--) {
    const weeksAgo = history.length - k
    for (const s of SLOTS) {
      const id = history[k].slots[s]
      if (id && !recency.has(id)) recency.set(id, weeksAgo)
    }
  }

  // Build pools per included slot; random mode avoids last week when possible.
  const pools = {} as Record<Slot, Recipe[]>
  for (const s of included) {
    const pool = candidatesFor(recipes, s, config[s])
    if (pool.length === 0) {
      throw new Error(`No meals available for ${s}. Add one or change its settings.`)
    }
    if (config[s].mode === 'random') {
      const avoid = lastWeek?.slots[s]
      const eligible = avoid ? pool.filter((r) => r.id !== avoid) : pool
      pools[s] = eligible.length > 0 ? eligible : pool
    } else {
      pools[s] = pool
    }
  }

  let best:
    | { chosen: Record<Slot, Recipe>; scales: number[]; totals: WeekPlan['totals']; score: number }
    | null = null

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const chosen = {} as Record<Slot, Recipe>
    for (const s of included) chosen[s] = pick(pools[s], rng)

    const items: SolverItem[] = included.map((s) => ({
      perServing: chosen[s].perServing,
      minScale: chosen[s].minScale,
      maxScale: chosen[s].maxScale,
    }))
    const { scales, totals, error } = solveScales(items, target)

    let penalty = 0
    for (const s of included) {
      const wa = recency.get(chosen[s].id)
      if (wa !== undefined) penalty += 1 / wa
    }
    const score = error + penalty * 1e-4

    if (!best || score < best.score) best = { chosen, scales, totals, score }
  }

  const b = best!
  const slots: WeekPlan['slots'] = {}
  const scales: WeekPlan['scales'] = {}
  included.forEach((s, i) => {
    slots[s] = b.chosen[s].id
    scales[s] = b.scales[i]
  })

  return { weekStartISO: mondayISO(), slots, scales, totals: b.totals, targets: target }
}

export function generateWeek(
  recipes: Recipe[],
  target: Targets,
  history: WeekPlan[],
  rng: () => number = Math.random,
): WeekPlan {
  return generatePlan(recipes, target, defaultConfig(), history, rng)
}
```

- [ ] **Step 4: Run planner tests**

Run: `npm test -- planner`
Expected: PASS (old `generateWeek` cases + new `generatePlan` cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/planner.ts src/lib/planner.test.ts
git commit -m "feat: config-driven generatePlan with include/base/exact modes"
```

---

### Task 3: `recalcScales` for post-change re-solve

**Files:**
- Modify: `src/lib/planner.ts`
- Test: `src/lib/planner.test.ts` (add cases)

**Interfaces:**
- Consumes: partial `WeekPlan`, `solveScales`.
- Produces: `recalcScales(recipes: Recipe[], plan: WeekPlan, target: Targets): WeekPlan` — returns a new plan with the same `slots` and `weekStartISO`, recomputed `scales` and `totals`.

- [ ] **Step 1: Write the failing test (append to `planner.test.ts`)**

```ts
import { recalcScales } from './planner'

describe('recalcScales', () => {
  it('recomputes scales within each recipe\'s bounds for the current slots', () => {
    const lib = library()
    const plan = generatePlan(lib, target, defaultConfig(), [])
    // Swap dinner to a different recipe, then recalc.
    const otherDinner = lib.find((r) => r.slot === 'dinner' && r.id !== plan.slots.dinner)!
    const swapped: WeekPlan = { ...plan, slots: { ...plan.slots, dinner: otherDinner.id } }
    const out = recalcScales(lib, swapped, target)

    for (const s of Object.keys(out.slots) as Slot[]) {
      const r = lib.find((x) => x.id === out.slots[s])!
      expect(out.scales[s]!).toBeGreaterThanOrEqual(r.minScale)
      expect(out.scales[s]!).toBeLessThanOrEqual(r.maxScale)
    }
    expect(out.totals.kcal).toBeGreaterThan(target.kcal * 0.8)
    expect(out.totals.kcal).toBeLessThan(target.kcal * 1.2)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- planner`
Expected: FAIL — `recalcScales` not exported.

- [ ] **Step 3: Add to `src/lib/planner.ts`**

```ts
export function recalcScales(
  recipes: Recipe[],
  plan: WeekPlan,
  target: Targets,
): WeekPlan {
  const byId = new Map(recipes.map((r) => [r.id, r]))
  const slots = SLOTS.filter((s) => plan.slots[s])
  const items: SolverItem[] = slots.map((s) => {
    const r = byId.get(plan.slots[s]!)
    if (!r) throw new Error(`Recipe ${plan.slots[s]} not found for ${s}.`)
    return { perServing: r.perServing, minScale: r.minScale, maxScale: r.maxScale }
  })
  const { scales, totals } = solveScales(items, target)
  const nextScales: WeekPlan['scales'] = {}
  slots.forEach((s, i) => { nextScales[s] = scales[i] })
  return { ...plan, scales: nextScales, totals, targets: target }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- planner`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planner.ts src/lib/planner.test.ts
git commit -m "feat: recalcScales re-solves portions after a meal swap"
```

---

### Task 4: Extract shared `MealCard` component

**Files:**
- Create: `src/components/MealCard.tsx`
- Modify: `src/components/PlanView.tsx`

**Interfaces:**
- Produces: `MealCard({ slotLabel, recipe, scale })` — the existing card markup (slot tag, portion, macros, expandable ingredients/steps). Exact prop types: `slotLabel: string; recipe: Recipe | undefined; scale: number | undefined`.

- [ ] **Step 1: Create `src/components/MealCard.tsx`**

Move the `MealCard` function currently inside `PlanView.tsx` (lines ~85-152) into its own file. Make `scale` optional and default the readout when undefined:

```tsx
import { useState } from 'react'
import type { Macros, Recipe } from '../types'
import { r0, r1, scaleMacros } from '../lib/nutrition'

export function MealCard({
  slotLabel,
  recipe,
  scale,
}: {
  slotLabel: string
  recipe: Recipe | undefined
  scale: number | undefined
}) {
  const [open, setOpen] = useState(false)
  const s = scale ?? 1

  if (!recipe) {
    return (
      <div className="card">
        <div className="card-head">
          <span className="slot-tag">{slotLabel}</span>
        </div>
        <p className="muted">This recipe was removed. Generate a new plan to replace it.</p>
      </div>
    )
  }

  const m: Macros = scaleMacros(recipe.perServing, s)

  return (
    <div className="card">
      <div className="card-head">
        <span className="slot-tag">{slotLabel}</span>
        <span className="portion">{r1(s)}× portion</span>
      </div>
      <h3>{recipe.name}</h3>
      <p className="muted small">{r1(s)} × {recipe.baseServingLabel}</p>
      <div className="macros">
        <span><strong>{r0(m.kcal)}</strong> kcal</span>
        <span><strong>{r0(m.protein)}</strong>g P</span>
        <span><strong>{r0(m.carbs)}</strong>g C</span>
        <span><strong>{r0(m.fat)}</strong>g F</span>
      </div>
      <button className="link" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide' : 'How to make it'}
      </button>
      {open && (
        <div className="details">
          {recipe.ingredients.length > 0 && (
            <>
              <h4>Ingredients (per serving)</h4>
              <ul>
                {recipe.ingredients.map((ing, i) => (
                  <li key={i}>{r1(ing.qty * s)} {ing.unit} {ing.name}</li>
                ))}
              </ul>
            </>
          )}
          {recipe.steps.length > 0 && (
            <>
              <h4>Steps</h4>
              <ol>
                {recipe.steps.map((step, i) => (<li key={i}>{step}</li>))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `PlanView.tsx`**

Delete the inline `MealCard` function. Add `import { MealCard } from './MealCard'`. Update the slot loop to iterate present slots only:

```tsx
{SLOTS.filter((slot) => plan.slots[slot]).map((slot) => {
  const recipe = recipesById.get(plan.slots[slot]!)
  const scale = plan.scales[slot]
  return <MealCard key={slot} slotLabel={SLOT_LABELS[slot]} recipe={recipe} scale={scale} />
})}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc -b`
Expected: PASS (PlanView still compiles; `MealCard` import resolves).

- [ ] **Step 4: Commit**

```bash
git add src/components/MealCard.tsx src/components/PlanView.tsx
git commit -m "refactor: extract reusable MealCard component"
```

---

### Task 5: Lunch/dinner interchange toggle in Meals editor

**Files:**
- Modify: `src/components/Meals.tsx`

**Interfaces:**
- Consumes: `Recipe.usableForSlots`, `slot` state in `RecipeEditor`.
- Produces: editor persists `usableForSlots: ['lunch','dinner']` when the toggle is on (and the slot is lunch or dinner); omits the field otherwise.

- [ ] **Step 1: Add state + UI in `RecipeEditor` (in `Meals.tsx`)**

After the `slot` state line, add:

```tsx
const [dualLunchDinner, setDualLunchDinner] = useState(
  (recipe?.usableForSlots ?? []).includes('lunch') &&
  (recipe?.usableForSlots ?? []).includes('dinner'),
)
```

Add the toggle UI right after the slot `<div className="field">…</div>`, shown only for lunch/dinner:

```tsx
{(slot === 'lunch' || slot === 'dinner') && (
  <label className="field checkbox-field">
    <input
      type="checkbox"
      checked={dualLunchDinner}
      onChange={(e) => setDualLunchDinner(e.target.checked)}
    />
    <span>Also usable for {slot === 'lunch' ? 'dinner' : 'lunch'}</span>
  </label>
)}
```

- [ ] **Step 2: Persist in `save()`**

In the `save` function, build the recipe and conditionally set `usableForSlots`:

```tsx
const usableForSlots =
  dualLunchDinner && (slot === 'lunch' || slot === 'dinner')
    ? (['lunch', 'dinner'] as Slot[])
    : undefined
const r: Recipe = {
  // ...existing fields...
  ...(usableForSlots ? { usableForSlots } : {}),
  source: 'custom',
}
```

- [ ] **Step 3: Add minimal checkbox styling to `src/index.css`**

```css
.checkbox-field { flex-direction: row; align-items: center; gap: 8px; }
.checkbox-field input { width: auto; }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Meals.tsx src/index.css
git commit -m "feat: tag lunch/dinner meals as interchangeable in editor"
```

---

### Task 6: `MealSearch` slot-filtered picker

**Files:**
- Create: `src/components/MealSearch.tsx`

**Interfaces:**
- Consumes: `eligibleForSlot`, `Recipe`, `Slot`.
- Produces: `MealSearch({ slot, recipes, onPick, onCancel })` — text box + filtered list of recipes eligible for `slot`; clicking a row calls `onPick(recipe)`. Props: `slot: Slot; recipes: Recipe[]; onPick: (r: Recipe) => void; onCancel: () => void`.

- [ ] **Step 1: Create `src/components/MealSearch.tsx`**

```tsx
import { useMemo, useState } from 'react'
import type { Recipe, Slot } from '../types'
import { SLOT_LABELS, eligibleForSlot } from '../types'
import { r0 } from '../lib/nutrition'

export function MealSearch({
  slot,
  recipes,
  onPick,
  onCancel,
}: {
  slot: Slot
  recipes: Recipe[]
  onPick: (r: Recipe) => void
  onCancel: () => void
}) {
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return recipes
      .filter((r) => eligibleForSlot(r, slot))
      .filter((r) => !needle || r.name.toLowerCase().includes(needle))
  }, [q, recipes, slot])

  return (
    <div className="panel">
      <div className="row-between">
        <h3>Choose a {SLOT_LABELS[slot]}</h3>
        <button className="link" onClick={onCancel}>Cancel</button>
      </div>
      <div className="field">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search meals…" />
      </div>
      {results.length === 0 && <p className="muted small">No matching meals for this slot.</p>}
      {results.map((r) => (
        <div className="meal-row" key={r.id}>
          <div>
            <div className="meal-name">{r.name}</div>
            <div className="muted small">{r0(r.perServing.kcal)} kcal · {r0(r.perServing.protein)}P {r0(r.perServing.carbs)}C {r0(r.perServing.fat)}F</div>
          </div>
          <button className="link" onClick={() => onPick(r)}>Pick</button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/MealSearch.tsx
git commit -m "feat: slot-filtered MealSearch picker"
```

---

### Task 7: `NewPlanWizard` (steps 1-5)

**Files:**
- Create: `src/components/NewPlanWizard.tsx`

**Interfaces:**
- Consumes: `generatePlan`, `recalcScales`, `defaultConfig` (planner); `MealCard`, `MealSearch`; `eligibleForSlot`, `PlanConfig`, `WeekPlan`, `Targets`.
- Produces: `NewPlanWizard({ recipes, targets, history, onApprove, onCancel, onGoToTargets })` — props: `recipes: Recipe[]; targets: Targets; history: WeekPlan[]; onApprove: (p: WeekPlan) => void; onCancel: () => void; onGoToTargets: () => void`.

- [ ] **Step 1: Create `src/components/NewPlanWizard.tsx`**

```tsx
import { useMemo, useState } from 'react'
import type { PlanConfig, Recipe, Slot, Targets, WeekPlan } from '../types'
import { SLOTS, SLOT_LABELS, eligibleForSlot } from '../types'
import { defaultConfig, generatePlan, recalcScales } from '../lib/planner'
import { r0 } from '../lib/nutrition'
import { MealCard } from './MealCard'
import { MealSearch } from './MealSearch'

type Step = 'targets' | 'config' | 'review'

export function NewPlanWizard({
  recipes,
  targets,
  history,
  onApprove,
  onCancel,
  onGoToTargets,
}: {
  recipes: Recipe[]
  targets: Targets
  history: WeekPlan[]
  onApprove: (p: WeekPlan) => void
  onCancel: () => void
  onGoToTargets: () => void
}) {
  const [step, setStep] = useState<Step>('targets')
  const [config, setConfig] = useState<PlanConfig>(() => defaultConfig())
  const [plan, setPlan] = useState<WeekPlan | null>(null)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changing, setChanging] = useState<Slot | null>(null)

  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes])

  const setSlot = (s: Slot, patch: Partial<PlanConfig[Slot]>) =>
    setConfig((c) => ({ ...c, [s]: { ...c[s], ...patch } }))

  const generate = () => {
    try {
      setPlan(generatePlan(recipes, targets, config, history))
      setDirty(false)
      setError(null)
      setStep('review')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // ----- Step 1: review targets -----
  if (step === 'targets') {
    const rows = [
      ['Calories', r0(targets.kcal), 'kcal'],
      ['Protein', r0(targets.protein), 'g'],
      ['Carbs', r0(targets.carbs), 'g'],
      ['Fat', r0(targets.fat), 'g'],
    ] as const
    return (
      <section className="panel">
        <div className="row-between">
          <h2>New meal plan</h2>
          <button className="link" onClick={onCancel}>Cancel</button>
        </div>
        <p className="muted small">Step 1 of 3 · Review your daily targets</p>
        <div className="totals">
          {rows.map(([label, val, unit]) => (
            <div className="total-pill" key={label}>
              <span className="total-label">{label}</span>
              <span className="total-value">{val}{unit}</span>
            </div>
          ))}
        </div>
        <button className="link" onClick={onGoToTargets}>Edit targets</button>
        <button className="primary" onClick={() => setStep('config')}>Next</button>
      </section>
    )
  }

  // ----- Step 2: configure slots -----
  if (step === 'config') {
    return (
      <section>
        <div className="panel">
          <div className="row-between">
            <h2>Configure meals</h2>
            <button className="link" onClick={onCancel}>Cancel</button>
          </div>
          <p className="muted small">Step 2 of 3 · Choose which meals and how to fill them</p>
          {error && <p className="error-text">{error}</p>}
        </div>
        {SLOTS.map((slot) => {
          const c = config[slot]
          const eligible = recipes.filter((r) => eligibleForSlot(r, slot))
          return (
            <div className="panel" key={slot}>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={c.include}
                  onChange={(e) => setSlot(slot, { include: e.target.checked })}
                />
                <strong>{SLOT_LABELS[slot]}</strong>
              </label>
              {c.include && (
                <>
                  <div className="field">
                    <label>How to fill it</label>
                    <select
                      value={c.mode}
                      onChange={(e) => setSlot(slot, { mode: e.target.value as PlanConfig[Slot]['mode'] })}
                    >
                      <option value="random">Random meal</option>
                      <option value="base">By base ingredient</option>
                      <option value="exact">Pick exact meal</option>
                    </select>
                  </div>
                  {c.mode === 'base' && (
                    <div className="field">
                      <label>Base ingredient</label>
                      <input
                        value={c.base ?? ''}
                        onChange={(e) => setSlot(slot, { base: e.target.value })}
                        placeholder="e.g. chicken, eggs, yogurt"
                      />
                    </div>
                  )}
                  {c.mode === 'exact' && (
                    <div className="field">
                      <label>Meal</label>
                      <select
                        value={c.recipeId ?? ''}
                        onChange={(e) => setSlot(slot, { recipeId: e.target.value })}
                      >
                        <option value="">Select a meal…</option>
                        {eligible.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
        <div className="panel grid2">
          <button className="ghost" onClick={() => setStep('targets')}>Back</button>
          <button className="primary" onClick={generate}>Generate plan</button>
        </div>
      </section>
    )
  }

  // ----- Step 3: review draft -----
  if (!plan) return null
  const presentSlots = SLOTS.filter((s) => plan.slots[s])

  if (changing) {
    return (
      <MealSearch
        slot={changing}
        recipes={recipes}
        onCancel={() => setChanging(null)}
        onPick={(r) => {
          setPlan((p) => (p ? { ...p, slots: { ...p.slots, [changing]: r.id } } : p))
          setDirty(true)
          setChanging(null)
        }}
      />
    )
  }

  const recalc = () => {
    setPlan((p) => (p ? recalcScales(recipes, p, targets) : p))
    setDirty(false)
  }

  return (
    <section>
      <div className="panel">
        <div className="row-between">
          <h2>Review plan</h2>
          <button className="link" onClick={onCancel}>Cancel</button>
        </div>
        <p className="muted small">Step 3 of 3 · Swap any meal, then approve</p>
      </div>
      {presentSlots.map((slot) => (
        <div key={slot}>
          <MealCard
            slotLabel={SLOT_LABELS[slot]}
            recipe={recipesById.get(plan.slots[slot]!)}
            scale={plan.scales[slot]}
          />
          <div className="panel" style={{ marginTop: -8 }}>
            <button className="link" onClick={() => setChanging(slot)}>Change this meal</button>
          </div>
        </div>
      ))}
      <div className="panel">
        {dirty ? (
          <button className="primary" onClick={recalc}>Recalculate portions</button>
        ) : (
          <button className="primary" onClick={() => onApprove(plan)}>Approve meal plan</button>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Add error/styling helpers to `src/index.css`**

```css
.error-text { color: #b3261e; font-size: 0.9rem; }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/NewPlanWizard.tsx src/index.css
git commit -m "feat: NewPlanWizard multi-step plan builder"
```

---

### Task 8: `PlanTab` wrapper + PlanView button + App wiring

**Files:**
- Create: `src/components/PlanTab.tsx`
- Modify: `src/components/PlanView.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `PlanView`, `NewPlanWizard`.
- Produces: `PlanTab({ plan, targets, recipes, recipesById, history, onApprove, onGoToTargets })`. `PlanView` gains `onNewPlan: () => void` replacing `onRegenerate`.

- [ ] **Step 1: Update `PlanView.tsx` button + props**

Change the `Props` interface: replace `onRegenerate: () => void` with `onNewPlan: () => void`. Replace both buttons currently calling `onRegenerate` ("Generate this week" / "🔀 Generate a new week") with:

```tsx
<button className="primary" onClick={onNewPlan}>＋ New meal plan</button>
```

(The empty-state button text becomes "New meal plan" too.)

- [ ] **Step 2: Create `src/components/PlanTab.tsx`**

```tsx
import { useState } from 'react'
import type { Recipe, Targets, WeekPlan } from '../types'
import { PlanView } from './PlanView'
import { NewPlanWizard } from './NewPlanWizard'

export function PlanTab({
  plan,
  targets,
  recipes,
  recipesById,
  history,
  onApprove,
  onGoToTargets,
}: {
  plan: WeekPlan | null
  targets: Targets | null
  recipes: Recipe[]
  recipesById: Map<string, Recipe>
  history: WeekPlan[]
  onApprove: (p: WeekPlan) => void
  onGoToTargets: () => void
}) {
  const [wizard, setWizard] = useState(false)

  if (wizard && targets) {
    return (
      <NewPlanWizard
        recipes={recipes}
        targets={targets}
        history={history}
        onCancel={() => setWizard(false)}
        onGoToTargets={onGoToTargets}
        onApprove={(p) => {
          onApprove(p)
          setWizard(false)
        }}
      />
    )
  }

  return (
    <PlanView
      plan={plan}
      targets={targets}
      recipesById={recipesById}
      onNewPlan={() => setWizard(true)}
      onGoToTargets={onGoToTargets}
    />
  )
}
```

- [ ] **Step 3: Wire into `App.tsx`**

Replace the `import { PlanView }` line with `import { PlanTab } from './components/PlanTab'`. Replace `regenerate` usage: the Plan tab block becomes:

```tsx
{tab === 'plan' && (
  <PlanTab
    plan={current}
    targets={state.targets}
    recipes={recipes}
    recipesById={recipesById}
    history={state.history}
    onApprove={(p) => setState((s) => ({ ...s, history: [...s.history, p] }))}
    onGoToTargets={() => setTab('targets')}
  />
)}
```

Remove the now-unused `regenerate` function and the `generateWeek` import from `App.tsx`.

- [ ] **Step 4: Typecheck + test**

Run: `npx tsc -b && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PlanTab.tsx src/components/PlanView.tsx src/App.tsx
git commit -m "feat: launch New meal plan wizard from Plan tab"
```

---

### Task 9: History detail view

**Files:**
- Modify: `src/components/History.tsx`

**Interfaces:**
- Consumes: `MealCard`, partial `WeekPlan`, `pctDiff`, `r0`.
- Produces: clickable history rows → detail view with totals vs targets + `MealCard`s; Back returns to the list.

- [ ] **Step 1: Rewrite `src/components/History.tsx`**

```tsx
import { useState } from 'react'
import type { Recipe, WeekPlan } from '../types'
import { SLOTS, SLOT_LABELS } from '../types'
import { pctDiff, r0 } from '../lib/nutrition'
import { MealCard } from './MealCard'

interface Props {
  history: WeekPlan[]
  recipesById: Map<string, Recipe>
}

export function History({ history, recipesById }: Props) {
  const [selected, setSelected] = useState<number | null>(null)

  if (history.length === 0) {
    return (
      <section className="panel">
        <h2>History</h2>
        <p className="muted">
          Approved plans show up here. The planner uses them to avoid repeating last
          week's meals.
        </p>
      </section>
    )
  }

  // selected indexes into the original (chronological) history array.
  if (selected !== null && history[selected]) {
    const wk = history[selected]
    const present = SLOTS.filter((s) => wk.slots[s])
    const rows: { label: string; actual: number; target: number; unit: string }[] = [
      { label: 'Calories', actual: r0(wk.totals.kcal), target: r0(wk.targets.kcal), unit: 'kcal' },
      { label: 'Protein', actual: r0(wk.totals.protein), target: r0(wk.targets.protein), unit: 'g' },
      { label: 'Carbs', actual: r0(wk.totals.carbs), target: r0(wk.targets.carbs), unit: 'g' },
      { label: 'Fat', actual: r0(wk.totals.fat), target: r0(wk.targets.fat), unit: 'g' },
    ]
    return (
      <section>
        <div className="panel">
          <div className="row-between">
            <h2>Week of {wk.weekStartISO}</h2>
            <button className="link" onClick={() => setSelected(null)}>← Back</button>
          </div>
          <div className="totals">
            {rows.map((row) => {
              const diff = pctDiff(row.actual, row.target)
              const cls = Math.abs(diff) <= 6 ? 'good' : Math.abs(diff) <= 15 ? 'ok' : 'off'
              return (
                <div className={`total-pill ${cls}`} key={row.label}>
                  <span className="total-label">{row.label}</span>
                  <span className="total-value">{row.actual}{row.unit}</span>
                  <span className="total-target">target {row.target}{row.unit}</span>
                </div>
              )
            })}
          </div>
        </div>
        {present.map((s) => (
          <MealCard
            key={s}
            slotLabel={SLOT_LABELS[s]}
            recipe={recipesById.get(wk.slots[s]!)}
            scale={wk.scales[s]}
          />
        ))}
      </section>
    )
  }

  const weeks = history
    .map((wk, idx) => ({ wk, idx }))
    .reverse()

  return (
    <section>
      <div className="panel">
        <h2>History</h2>
        <p className="muted small">Most recent first. Tap a week to see the full plan.</p>
      </div>
      {weeks.map(({ wk, idx }, order) => (
        <button className="panel history-card" key={`${wk.weekStartISO}-${idx}`} onClick={() => setSelected(idx)}>
          <div className="row-between">
            <h3>Week of {wk.weekStartISO}</h3>
            {order === 0 && <span className="badge">current</span>}
          </div>
          <ul className="history-list">
            {SLOTS.filter((s) => wk.slots[s]).map((s) => (
              <li key={s}>
                <span className="muted small">{SLOT_LABELS[s]}</span>
                <span>{recipesById.get(wk.slots[s]!)?.name ?? '(removed)'}</span>
              </li>
            ))}
          </ul>
        </button>
      ))}
    </section>
  )
}
```

- [ ] **Step 2: Add `history-card` styling to `src/index.css`**

```css
.history-card { display: block; width: 100%; text-align: left; cursor: pointer; border: none; font: inherit; }
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc -b && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/History.tsx src/index.css
git commit -m "feat: clickable History detail with full plan view"
```

---

### Task 10: End-to-end verification in the browser

**Files:** none (manual verification via dev server).

- [ ] **Step 1:** Start the dev server (`preview_start`) and load the app.
- [ ] **Step 2:** Plan tab → "New meal plan" → Step 1 shows targets → Next.
- [ ] **Step 3:** Step 2 → exclude Snack, set Dinner mode to "By base" with "chicken", set Breakfast to an exact meal → Generate plan.
- [ ] **Step 4:** Step 3 shows cards without Snack; dinner contains a chicken recipe. Click "Change this meal" on lunch → search filtered to lunch-eligible → pick one → footer becomes "Recalculate portions" → click it → reverts to "Approve meal plan".
- [ ] **Step 5:** Approve → returns to Plan view showing the new plan → History tab lists the week → tap it → full detail with totals + meal cards.
- [ ] **Step 6:** Confirm no console errors (`preview_console_logs`); capture a screenshot of the wizard review step.

---

## Self-Review Notes

- **Spec coverage:** targets review (Task 7 step 1), include/base/exact config (Tasks 2, 7), generation (Task 2), review + change (Tasks 6, 7), approve↔recalculate toggle (Tasks 3, 7), save-on-approve (Task 8), History detail (Task 9). Multi-slot lunch/dinner: Tasks 1, 5. Base-by-ingredient: Task 2. ✓
- **Type consistency:** `slotsFor`/`eligibleForSlot`, `generatePlan`/`recalcScales`/`defaultConfig`, `MealCard` props, partial `WeekPlan` slots used consistently across tasks. ✓
- **No placeholders:** every code step contains full code. ✓
