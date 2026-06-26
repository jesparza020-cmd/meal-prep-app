import type { PlanConfig, Recipe, Slot, Targets, WeekPlan } from '../types'
import { SLOTS, eligibleForSlot } from '../types'
import { solveScales, type SolverItem } from './solver'

const ATTEMPTS = 40

function mondayISO(d = new Date()): string {
  const date = new Date(d)
  const day = (date.getDay() + 6) % 7 // 0 = Monday
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date.toISOString().slice(0, 10)
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

/** Default config: every slot included, filled randomly. */
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

/**
 * Build a meal plan from a per-slot config. For each included slot a recipe is
 * chosen per its mode (exact id, base-ingredient match, or random avoiding last
 * week), then portions are scaled across the included slots to hit the target.
 */
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

  // weeks-ago that each recipe was last used (1 = last week).
  const recency = new Map<string, number>()
  for (let k = history.length - 1; k >= 0; k--) {
    const weeksAgo = history.length - k
    for (const s of SLOTS) {
      const id = history[k].slots[s]
      if (id && !recency.has(id)) recency.set(id, weeksAgo)
    }
  }

  // Candidate pool per included slot; random mode avoids last week if possible.
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

    // Tiny tie-breaking nudge toward less-recently-used recipes.
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

/** Re-solve portions for a plan's current recipes (e.g. after a manual swap). */
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

/**
 * Build one week's meal set with all slots filled randomly. Thin wrapper over
 * generatePlan kept for the original quick-generate behaviour and tests.
 */
export function generateWeek(
  recipes: Recipe[],
  target: Targets,
  history: WeekPlan[],
  rng: () => number = Math.random,
): WeekPlan {
  return generatePlan(recipes, target, defaultConfig(), history, rng)
}
