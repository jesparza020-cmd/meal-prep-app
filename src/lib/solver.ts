import type { Macros, Targets } from '../types'

export interface SolverItem {
  perServing: Macros
  minScale: number
  maxScale: number
  targetKcal?: number // soft per-meal calorie target; omitted = no balance pull
}

export interface SolverResult {
  scales: number[]
  totals: Macros
  error: number // weighted relative residual; lower is better
}

type Dim = keyof Macros
const DIMS: Dim[] = ['kcal', 'protein', 'carbs', 'fat']

// Preference weights: prioritise hitting calories, then protein, then carbs/fat.
const PREF: Record<Dim, number> = { kcal: 3, protein: 2, carbs: 1, fat: 1 }

// Soft pull of each meal toward its share of the daily calories. Kept below the
// daily-kcal preference (3) so balance never overrides hitting the day's total.
const SHARE_PREF = 1

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

function totalsFor(items: SolverItem[], scales: number[]): Macros {
  const t: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  items.forEach((item, i) => {
    for (const d of DIMS) t[d] += item.perServing[d] * scales[i]
  })
  return t
}

/**
 * Find a portion multiplier per item so the summed macros land as close as
 * possible to the daily target, respecting each item's min/max scale.
 *
 * Minimises a weighted relative least-squares error via projected coordinate
 * descent. Each coordinate's optimum is a closed-form quadratic minimum, so a
 * handful of sweeps converges reliably for this small (5-variable) problem.
 */
export function solveScales(items: SolverItem[], target: Targets): SolverResult {
  const n = items.length
  // Relative weights so calories (in the thousands) don't dominate grams.
  const w: Record<Dim, number> = {
    kcal: PREF.kcal / Math.max(target.kcal, 1) ** 2,
    protein: PREF.protein / Math.max(target.protein, 1) ** 2,
    carbs: PREF.carbs / Math.max(target.carbs, 1) ** 2,
    fat: PREF.fat / Math.max(target.fat, 1) ** 2,
  }
  const wShare = SHARE_PREF / Math.max(target.kcal, 1) ** 2

  // Initialise uniformly to roughly hit the calorie target.
  const baseKcal = items.reduce((s, it) => s + it.perServing.kcal, 0)
  const init = baseKcal > 0 ? target.kcal / baseKcal : 1
  const scales = items.map((it) => clamp(init, it.minScale, it.maxScale))

  for (let iter = 0; iter < 300; iter++) {
    let maxDelta = 0
    for (let i = 0; i < n; i++) {
      const a = items[i].perServing
      // Residual from all other items, per dimension.
      let num = 0
      let den = 0
      for (const d of DIMS) {
        let others = -target[d]
        for (let j = 0; j < n; j++) {
          if (j !== i) others += items[j].perServing[d] * scales[j]
        }
        num += w[d] * a[d] * others
        den += w[d] * a[d] * a[d]
      }
      // Soft per-meal calorie target: a penalty in this item's own scale only.
      const tk = items[i].targetKcal
      if (tk !== undefined) {
        num += wShare * a.kcal * -tk
        den += wShare * a.kcal * a.kcal
      }
      const ideal = den > 0 ? -num / den : scales[i]
      const next = clamp(ideal, items[i].minScale, items[i].maxScale)
      maxDelta = Math.max(maxDelta, Math.abs(next - scales[i]))
      scales[i] = next
    }
    if (maxDelta < 1e-6) break
  }

  const totals = totalsFor(items, scales)
  let error = 0
  for (const d of DIMS) error += w[d] * (totals[d] - target[d]) ** 2
  // Fold per-meal balance into the score so the planner prefers balanceable combos.
  items.forEach((item, i) => {
    if (item.targetKcal !== undefined) {
      error += wShare * (item.perServing.kcal * scales[i] - item.targetKcal) ** 2
    }
  })

  return { scales, totals, error }
}
