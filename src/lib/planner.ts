import type { Recipe, Slot, Targets, WeekPlan } from '../types'
import { SLOTS } from '../types'
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

/**
 * Build one week's meal set: one recipe per slot, portions scaled to the daily
 * target. Excludes the previous week's pick per slot (relaxing only when a slot
 * has no alternative) and softly prefers recipes not used recently.
 */
export function generateWeek(
  recipes: Recipe[],
  target: Targets,
  history: WeekPlan[],
  rng: () => number = Math.random,
): WeekPlan {
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

  // Eligible candidates per slot.
  const pools = {} as Record<Slot, Recipe[]>
  for (const s of SLOTS) {
    const pool = recipes.filter((r) => r.slot === s)
    if (pool.length === 0) {
      throw new Error(`No recipes available for slot "${s}". Add at least one.`)
    }
    const avoid = lastWeek?.slots[s]
    const eligible = avoid ? pool.filter((r) => r.id !== avoid) : pool
    pools[s] = eligible.length > 0 ? eligible : pool
  }

  let best:
    | { chosen: Record<Slot, Recipe>; scales: number[]; totals: WeekPlan['totals']; score: number }
    | null = null

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const chosen = {} as Record<Slot, Recipe>
    for (const s of SLOTS) chosen[s] = pick(pools[s], rng)

    const items: SolverItem[] = SLOTS.map((s) => ({
      perServing: chosen[s].perServing,
      minScale: chosen[s].minScale,
      maxScale: chosen[s].maxScale,
    }))
    const { scales, totals, error } = solveScales(items, target)

    // Tiny tie-breaking nudge toward less-recently-used recipes.
    let penalty = 0
    for (const s of SLOTS) {
      const wa = recency.get(chosen[s].id)
      if (wa !== undefined) penalty += 1 / wa
    }
    const score = error + penalty * 1e-4

    if (!best || score < best.score) best = { chosen, scales, totals, score }
  }

  const b = best!
  const slots = {} as Record<Slot, string>
  const scales = {} as Record<Slot, number>
  SLOTS.forEach((s, i) => {
    slots[s] = b.chosen[s].id
    scales[s] = b.scales[i]
  })

  return { weekStartISO: mondayISO(), slots, scales, totals: b.totals, targets: target }
}
