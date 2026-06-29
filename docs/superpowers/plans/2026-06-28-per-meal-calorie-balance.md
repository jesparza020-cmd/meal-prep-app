# Per-Meal Calorie Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add soft per-meal calorie-share targets to the portion solver so generated and recalculated plans distribute calories sensibly across meals instead of lopsided splits that merely sum to the daily target.

**Architecture:** Extend the existing weighted least-squares solver with an optional per-item `targetKcal` penalty term (quadratic in that item's own scale, so it folds into the existing closed-form coordinate descent). The planner computes normalized per-slot calorie targets from fixed default shares and passes them into the solver for both fresh generation and recalculation after a swap.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Calories-only balancing; protein/carbs/fat balancing is out of scope.
- No UI changes, no new persisted state. Defaults live in code.
- Soft targets only — never produce infeasible/deadlocked plans.
- Default shares: breakfast 25%, lunch 30%, dinner 30%, snack 10%, shake 5%.
- `SHARE_PREF` constant starts at `1` (vs daily-kcal preference `3`), kept subordinate to the daily total and protein.

---

### Task 1: Solver — soft per-meal calorie target

**Files:**
- Modify: `src/lib/solver.ts`
- Test: `src/lib/solver.test.ts`

**Interfaces:**
- Consumes: existing `Macros`, `Targets` from `../types`.
- Produces: `SolverItem` gains optional `targetKcal?: number`. `solveScales(items: SolverItem[], target: Targets): SolverResult` unchanged in signature; items carrying `targetKcal` get pulled toward it.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/solver.test.ts`. Two meals, equal per-serving macros, daily target 1000 kcal. Without balancing the solver could pick any split; with a 70/30 `targetKcal` it should land near 700/300.

```ts
import { describe, it, expect } from 'vitest'
import { solveScales, type SolverItem } from './solver'

describe('solveScales per-meal calorie targets', () => {
  it('pulls each meal toward its targetKcal share', () => {
    const items: SolverItem[] = [
      { perServing: { kcal: 100, protein: 5, carbs: 10, fat: 3 }, minScale: 0.1, maxScale: 20, targetKcal: 700 },
      { perServing: { kcal: 100, protein: 5, carbs: 10, fat: 3 }, minScale: 0.1, maxScale: 20, targetKcal: 300 },
    ]
    const target = { kcal: 1000, protein: 50, carbs: 100, fat: 30 }
    const { scales } = solveScales(items, target)
    const kcal0 = items[0].perServing.kcal * scales[0]
    const kcal1 = items[1].perServing.kcal * scales[1]
    expect(kcal0).toBeGreaterThan(620)
    expect(kcal0).toBeLessThan(780)
    expect(kcal1).toBeGreaterThan(220)
    expect(kcal1).toBeLessThan(380)
    expect(kcal0 + kcal1).toBeGreaterThan(930) // daily total still ~on target
  })

  it('degrades gracefully when scale bounds prevent reaching the share', () => {
    const items: SolverItem[] = [
      { perServing: { kcal: 100, protein: 5, carbs: 10, fat: 3 }, minScale: 0.1, maxScale: 2, targetKcal: 700 },
      { perServing: { kcal: 100, protein: 5, carbs: 10, fat: 3 }, minScale: 0.1, maxScale: 20, targetKcal: 300 },
    ]
    const target = { kcal: 1000, protein: 50, carbs: 100, fat: 30 }
    const { scales } = solveScales(items, target)
    expect(scales[0]).toBeLessThanOrEqual(2) // capped, no deadlock
    expect(scales[0]).toBeGreaterThan(1.5) // pushed toward its cap
  })

  it('behaves unchanged when no targetKcal is given', () => {
    const items: SolverItem[] = [
      { perServing: { kcal: 200, protein: 10, carbs: 20, fat: 6 }, minScale: 0.5, maxScale: 3 },
      { perServing: { kcal: 200, protein: 10, carbs: 20, fat: 6 }, minScale: 0.5, maxScale: 3 },
    ]
    const target = { kcal: 800, protein: 40, carbs: 80, fat: 24 }
    const { totals } = solveScales(items, target)
    expect(totals.kcal).toBeGreaterThan(760)
    expect(totals.kcal).toBeLessThan(840)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/solver.test.ts`
Expected: the two `targetKcal` tests FAIL (no balancing yet); the "unchanged" test passes.

- [ ] **Step 3: Implement the per-meal penalty**

In `src/lib/solver.ts`:

Add the `targetKcal` field to the interface:

```ts
export interface SolverItem {
  perServing: Macros
  minScale: number
  maxScale: number
  targetKcal?: number // soft per-meal calorie target; omitted = no balance pull
}
```

Add the preference constant near `PREF`:

```ts
// Soft pull of each meal toward its share of the daily calories. Kept below the
// daily-kcal preference (3) so balance never overrides hitting the day's total.
const SHARE_PREF = 1
```

Inside `solveScales`, after the existing `w` weights are computed, add the share weight:

```ts
const wShare = SHARE_PREF / Math.max(target.kcal, 1) ** 2
```

In the coordinate-descent inner loop, after the `for (const d of DIMS)` accumulation of `num`/`den` for item `i`, add the per-meal term:

```ts
const tk = items[i].targetKcal
if (tk !== undefined) {
  num += wShare * a.kcal * -tk
  den += wShare * a.kcal * a.kcal
}
```

(`a` is `items[i].perServing`, already in scope.)

After computing `totals`, fold the share term into `error` so the planner's search prefers balanceable combos:

```ts
items.forEach((item, i) => {
  if (item.targetKcal !== undefined) {
    error += wShare * (item.perServing.kcal * scales[i] - item.targetKcal) ** 2
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/solver.test.ts`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/solver.ts src/lib/solver.test.ts
git commit -m "feat: soft per-meal calorie target in solver"
```

---

### Task 2: Planner — compute and pass normalized share targets

**Files:**
- Modify: `src/lib/planner.ts`
- Test: `src/lib/planner.test.ts`

**Interfaces:**
- Consumes: `SolverItem` with optional `targetKcal` (Task 1); `Slot`, `SLOTS`, `Targets` from `../types`.
- Produces: internal helper `shareTargets(included: Slot[], dailyKcal: number): Record<Slot, number>` returning a per-slot kcal target normalized over `included`. Both `generatePlan` and `recalcScales` attach `targetKcal` to each `SolverItem`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/planner.test.ts`. Build two recipes whose unbalanced split would still hit the daily total, and assert the generated plan keeps each meal within a sane band of its share. Use a seeded RNG if the existing tests do; otherwise `Math.random` is fine for the band assertion.

```ts
import { describe, it, expect } from 'vitest'
import { generatePlan, defaultConfig } from './planner'
import type { Recipe, Targets } from '../types'

function recipe(id: string, slot: Recipe['slot'], kcal: number): Recipe {
  return {
    id, name: id, slot, baseServingLabel: '1',
    perServing: { kcal, protein: kcal / 20, carbs: kcal / 8, fat: kcal / 30 },
    ingredients: [], steps: [], minScale: 0.25, maxScale: 6, source: 'custom',
  }
}

describe('generatePlan calorie balance', () => {
  it('keeps each meal near its slot share instead of a lopsided split', () => {
    const recipes: Recipe[] = [
      recipe('b', 'breakfast', 300),
      recipe('l', 'lunch', 300),
      recipe('d', 'dinner', 300),
    ]
    const target: Targets = { kcal: 1500, protein: 75, carbs: 188, fat: 50 }
    const config = defaultConfig()
    config.snack.include = false
    config.shake.include = false

    const plan = generatePlan(recipes, target, config, [])

    // Shares normalized over breakfast/lunch/dinner (25/30/30 -> ~29.4/35.3/35.3%).
    const kcalFor = (id: string, slot: keyof typeof plan.slots) =>
      recipes.find((r) => r.id === id)!.perServing.kcal * (plan.scales[slot] ?? 0)
    const bk = kcalFor('b', 'breakfast')
    const ln = kcalFor('l', 'lunch')
    const dn = kcalFor('d', 'dinner')

    // No meal should be wildly dominant; breakfast share (~441) < lunch/dinner (~529).
    expect(bk).toBeGreaterThan(330)
    expect(bk).toBeLessThan(560)
    expect(ln).toBeGreaterThan(420)
    expect(dn).toBeGreaterThan(420)
    expect(plan.totals.kcal).toBeGreaterThan(1400)
    expect(plan.totals.kcal).toBeLessThan(1600)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/planner.test.ts`
Expected: FAIL — `targetKcal` not yet passed, so balance bands may not hold (or the helper does not exist).

- [ ] **Step 3: Add the share helper and defaults**

In `src/lib/planner.ts`, add near the top (after imports):

```ts
/** Default fraction of daily calories per slot (normalized over included slots). */
const SLOT_SHARE: Record<Slot, number> = {
  breakfast: 0.25,
  lunch: 0.3,
  snack: 0.1,
  shake: 0.05,
  dinner: 0.3,
}

/** Per-slot calorie target, shares normalized over the included slots. */
function shareTargets(included: Slot[], dailyKcal: number): Record<Slot, number> {
  const sum = included.reduce((s, slot) => s + SLOT_SHARE[slot], 0)
  const out = {} as Record<Slot, number>
  for (const slot of included) {
    out[slot] = sum > 0 ? (SLOT_SHARE[slot] / sum) * dailyKcal : dailyKcal / included.length
  }
  return out
}
```

- [ ] **Step 4: Pass `targetKcal` in `generatePlan`**

In `generatePlan`, the `included` array already exists. Build the targets once before the attempt loop:

```ts
const kcalTargets = shareTargets(included, target.kcal)
```

Then in the per-attempt `items` mapping, add `targetKcal`:

```ts
const items: SolverItem[] = included.map((s) => ({
  perServing: chosen[s].perServing,
  minScale: chosen[s].minScale,
  maxScale: chosen[s].maxScale,
  targetKcal: kcalTargets[s],
}))
```

- [ ] **Step 5: Pass `targetKcal` in `recalcScales`**

In `recalcScales`, after `const slots = SLOTS.filter((s) => plan.slots[s])`, add:

```ts
const kcalTargets = shareTargets(slots, target.kcal)
```

Then in its `items` mapping, add `targetKcal: kcalTargets[s]` to the returned object:

```ts
const items: SolverItem[] = slots.map((s) => {
  const r = byId.get(plan.slots[s]!)
  if (!r) throw new Error(`Recipe ${plan.slots[s]} not found for ${s}.`)
  return {
    perServing: r.perServing,
    minScale: r.minScale,
    maxScale: r.maxScale,
    targetKcal: kcalTargets[s],
  }
})
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/planner.test.ts src/lib/solver.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/planner.ts src/lib/planner.test.ts
git commit -m "feat: balance per-meal calories via normalized slot shares"
```

---

### Task 3: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: all tests pass, including pre-existing `eligibility.test.ts`, `planner.test.ts`, `solver.test.ts`.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src`
Expected: no errors.

- [ ] **Step 3: Commit any incidental fixes**

If steps 1–2 surfaced fixes, commit them:

```bash
git add -A
git commit -m "fix: address typecheck/lint for calorie balance"
```

---

## Self-Review

**Spec coverage:** Default shares (Task 2 `SLOT_SHARE`), normalization over included slots (Task 2 `shareTargets`), solver penalty term + weight (Task 1), error-term inclusion (Task 1 Step 3), planner + recalc wiring (Task 2 Steps 4–5), solver + planner tests (Tasks 1–2). All spec sections covered.

**Placeholder scan:** No TBD/TODO; every code step shows full code.

**Type consistency:** `targetKcal?: number` defined in Task 1 and consumed in Task 2; `shareTargets` signature consistent across Steps 3–5; `SolverItem`/`Targets`/`Slot` names match existing source.
