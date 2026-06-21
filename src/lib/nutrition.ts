import type { Macros } from '../types'

export function scaleMacros(m: Macros, scale: number): Macros {
  return {
    kcal: m.kcal * scale,
    protein: m.protein * scale,
    carbs: m.carbs * scale,
    fat: m.fat * scale,
  }
}

export const r0 = (n: number) => Math.round(n)
export const r1 = (n: number) => Math.round(n * 10) / 10

/** % difference of actual vs target, signed. */
export function pctDiff(actual: number, target: number): number {
  if (!target) return 0
  return ((actual - target) / target) * 100
}

/** Derive calories from macros (4/4/9 rule). */
export function kcalFromMacros(protein: number, carbs: number, fat: number): number {
  return protein * 4 + carbs * 4 + fat * 9
}
