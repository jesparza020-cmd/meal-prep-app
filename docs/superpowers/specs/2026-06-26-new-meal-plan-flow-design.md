# New Meal Plan Flow — Design

**Date:** 2026-06-26
**Status:** Approved

## Goal

Replace the one-click "Generate a new week" button on the Plan tab with a guided,
multi-step "New meal plan" flow that lets the user review targets, configure each
meal type (include / base / exact), generate, review and tweak individual meals,
and finally approve — which saves the plan to History where it can be reopened in
full.

## Decisions (locked)

- **Base matching:** auto, by ingredient substring. Picking a base for a slot
  randomly selects among eligible recipes whose ingredient names contain the typed
  base text (fallback to the full eligible pool if none match).
- **Multi-slot tagging:** lunch/dinner only. Each meal keeps one primary slot;
  lunch and dinner meals can be tagged usable for the other. Breakfast/snack/shake
  stay single-slot.
- **Change search:** filtered to meals eligible for the slot being changed.
- **Existing button:** replaced by the new flow (no quick-generate kept).
- **Exact-meal scaling:** exact picks are still portion-scaled by the solver to hit
  daily targets (consistent with current behavior).

## Data model (`src/types.ts`)

- `Recipe.usableForSlots?: Slot[]` — optional. Absent ⇒ eligible only for `slot`.
  Helper `slotsFor(recipe): Slot[]` returns `usableForSlots ?? [recipe.slot]`.
  Eligibility for a slot S: `slotsFor(recipe).includes(S)`.
- `WeekPlan.slots` and `WeekPlan.scales` become `Partial<Record<Slot, ...>>` so a
  plan can include a subset of meal types. All consumers iterate
  `SLOTS.filter((s) => plan.slots[s])`, preserving order and staying compatible
  with previously saved 5-slot history entries.
- New transient (non-persisted) type:
  ```ts
  interface SlotConfig {
    include: boolean
    mode: 'random' | 'base' | 'exact'
    base?: string
    recipeId?: string
  }
  type PlanConfig = Record<Slot, SlotConfig>
  ```

## Planner (`src/lib/planner.ts`)

- `slotsFor` / `eligibleForSlot` helpers (may live in types.ts or planner.ts).
- `generatePlan(recipes, targets, config, history, rng = Math.random): WeekPlan`
  - For each **included** slot, build eligible pool (`eligibleForSlot`).
  - mode `exact` → use `config[slot].recipeId`.
  - mode `base` → random among pool whose ingredient names contain `base`
    (case-insensitive); fallback to full pool if no match.
  - mode `random` → random pick, softly avoiding last week's pick for that slot.
  - Run existing `solveScales` across included slots → partial `WeekPlan`.
  - Throw a clear error if an included slot has no eligible recipe.
- `recalcScales(recipes, plan, targets): WeekPlan` — re-run solver for the plan's
  current recipes; return updated `scales` + `totals`. Used after a manual change.
- `generateWeek` retained as a thin wrapper over `generatePlan` with a default
  config (all slots included, random) so existing tests stay green.

## Components

- **`PlanTab.tsx`** (new) — owns `mode: 'view' | 'wizard'`. Renders `PlanView` in
  view mode; `NewPlanWizard` in wizard mode. Receives recipes, targets, current
  plan, history; calls `onApprove(plan)` to persist.
- **`PlanView.tsx`** — button changes from "Generate a new week" to "New meal plan"
  (`onNewPlan` prop). Card rendering extracted to shared `MealCard`.
- **`MealCard.tsx`** (new) — reusable meal card (slot tag, macros, expandable
  ingredients/steps). Used by PlanView, wizard review, and History detail.
- **`NewPlanWizard.tsx`** (new) — steps:
  1. Review targets (read-only + "Edit in Targets" link). Next.
  2. Configure slots: per slot Include toggle + mode (Random / By base / Exact);
     base text input or slot-filtered exact picker. Next → generate draft.
  3. Review draft: `MealCard`s with per-meal **Change** (slot-filtered search →
     replaces recipe, marks plan dirty). Footer button is **Approve meal plan**;
     when dirty it becomes **Recalculate portions** (runs `recalcScales`, clears
     dirty, reverts to Approve). Approve → `onApprove(plan)`, return to view.
- **`MealSearch.tsx`** (new, or inline) — slot-filtered text search over eligible
  recipes; used by exact-pick (step 2) and Change (step 3).
- **`Meals.tsx`** — add lunch/dinner interchange checkbox (visible only when the
  edited slot is lunch or dinner); persists `usableForSlots`.
- **`History.tsx`** — list rows become clickable → detail view (daily totals vs
  targets + every `MealCard` with ingredients/steps). Back returns to list.

## App wiring (`src/App.tsx`)

- Plan tab renders `PlanTab` instead of `PlanView`.
- `onApprove(plan)` appends the approved plan to `history` (replaces the current
  `regenerate` immediate-append behavior).

## Testing (TDD)

Planner unit tests (Vitest):
- base-match selects a recipe containing the base ingredient;
- lunch/dinner eligibility: a dinner-tagged-for-lunch recipe is a lunch candidate;
- excluded slot is absent from the resulting plan;
- exact pick is honored (recipe id present in plan);
- `recalcScales` returns scales within min/max and recomputed totals.
Existing `solver.test.ts` and `planner.test.ts` must stay green.

## Out of scope

- Persisting `PlanConfig` between sessions.
- Multi-slot tagging beyond lunch/dinner.
- Searching meals outside the slot being changed.
