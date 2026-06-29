# Per-Meal Calorie Balance — Design

**Date:** 2026-06-28
**Status:** Approved

## Problem

The portion solver only optimizes the *daily total* of each macro. It has no
notion of how calories are distributed across meals, so any split that sums to
the target is treated as optimal. This produces lopsided plans — e.g. breakfast
175 kcal, lunch 1300, snack 119, dinner 1400 — because the solver freely slams
calorie-dense meals to their `maxScale` and light meals to their `minScale` as
long as the day adds up.

The only existing guardrails are per-recipe `minScale`/`maxScale` clamps
([solver.ts:54](../../../src/lib/solver.ts), [solver.ts:72](../../../src/lib/solver.ts)),
which bound a single meal's portion but never balance meals against each other.

## Goal

Make generated (and recalculated) plans distribute calories across meals in a
sensible way, so no single meal dominates, without rigidly boxing any meal or
producing infeasible plans.

## Approach

Add **soft per-meal calorie-share targets** to the solver's weighted
least-squares objective. Each included meal gets a target share of the daily
calories; the solver is pulled toward those shares but yields when a recipe's
scale bounds make a share unreachable. A soft target behaves like a fuzzy range,
giving the balancing benefit without hard-constraint machinery (no
"no feasible solution" cases).

Rejected alternatives:
- **Hard ranges per meal** — require a hinge penalty that breaks the clean
  closed-form coordinate descent and can yield infeasible plans. Not worth the
  complexity for this need.
- **Tightening `minScale`/`maxScale`** — a data-only band-aid that narrows
  extremes but never actively balances.
- **User-configurable shares** — deferred (YAGNI). Defaults live in code and are
  tunable; can be promoted to UI later if needed.

## Design

### 1. Default shares (in code, tunable)

A constant in `src/lib/planner.ts`:

| Slot      | Share |
|-----------|-------|
| breakfast | 25%   |
| lunch     | 30%   |
| dinner    | 30%   |
| snack     | 10%   |
| shake     | 5%    |

These sum to 100% across all five slots. A given week may include only a subset,
so the included slots' shares are **normalized to sum to 1** before use. Example:
a breakfast+lunch+dinner week normalizes 25/30/30 → ~29.4% / 35.3% / 35.3%.

Each included slot's calorie target is `normalizedShare × dailyKcal`.

### 2. Solver change (core)

Extend `SolverItem` with an optional field:

```ts
export interface SolverItem {
  perServing: Macros
  minScale: number
  maxScale: number
  targetKcal?: number // soft per-meal calorie target; omitted = no balance pull
}
```

For any item with `targetKcal` defined, add a soft penalty term to the
objective:

```
w_share · (scale_i · perServing_i.kcal − targetKcal_i)²
```

This term is quadratic in that meal's own scale and references no other meal, so
it integrates directly into the existing per-coordinate closed-form optimum
([solver.ts:58-74](../../../src/lib/solver.ts)). Concretely, in the coordinate
update for item `i`:

- `den += w_share · a_i.kcal · a_i.kcal`
- `num += w_share · a_i.kcal · (−targetKcal_i)`

with `ideal = −num / den` unchanged. The same penalty term is also added to the
final `error` so the planner's multi-attempt search prefers recipe combinations
that *can* balance.

**Weight:** `w_share = SHARE_PREF / max(dailyKcal, 1)²`, mirroring how the
existing kcal weight is normalized ([solver.ts:44-49](../../../src/lib/solver.ts)).
`SHARE_PREF` starts at ~1 (vs the daily-kcal preference of 3), keeping the share
pull subordinate to hitting the daily total and protein so balance never starves
protein. It is a single tunable constant; the tests below confirm the chosen
value behaves.

### 3. Planner + recalc wiring

Add a helper:

```ts
function shareTargets(included: Slot[], dailyKcal: number): Record<Slot, number>
```

It looks up each included slot's default share, normalizes over the included
set, and returns `normalizedShare × dailyKcal` per slot.

Both `generatePlan` ([planner.ts:94-98](../../../src/lib/planner.ts)) and
`recalcScales` ([planner.ts:131-135](../../../src/lib/planner.ts)) call it and
attach `targetKcal` to each `SolverItem`, so manual swaps and recalculations
stay balanced too.

### 4. Tests

- **solver.test.ts**
  - Given two recipes where an unbalanced split would still hit the daily total,
    assert each meal lands near its `targetKcal` share.
  - Assert a meal pinned by `minScale`/`maxScale` degrades gracefully (gets as
    close as its bounds allow) rather than failing or deadlocking.
  - Assert items with no `targetKcal` behave exactly as before (no regression).
- **planner.test.ts**
  - Assert a generated plan no longer produces extreme splits (no meal far above
    or below its share band) while daily totals stay on target.

## Out of Scope

- UI controls for shares (defaults are code-only for now).
- Per-slot hard calorie ceilings/floors.
- Per-meal balancing of protein/carbs/fat (calories only).

## Behavior Summary

No UI changes, no new persisted state. Existing plans regenerate balanced; the
old lopsided outcome becomes a high-error solution the solver avoids. Because the
target is soft, a slot whose only recipe cannot reach its share won't deadlock —
it gets as close as its scale bounds allow.
