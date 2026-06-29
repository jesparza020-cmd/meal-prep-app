import { describe, it, expect } from 'vitest'
import { solveScales, type SolverItem } from './solver'
import type { Targets } from '../types'

const items: SolverItem[] = [
  { perServing: { kcal: 400, protein: 30, carbs: 40, fat: 12 }, minScale: 0.5, maxScale: 3 },
  { perServing: { kcal: 500, protein: 35, carbs: 50, fat: 18 }, minScale: 0.5, maxScale: 3 },
  { perServing: { kcal: 200, protein: 10, carbs: 25, fat: 8 }, minScale: 0.5, maxScale: 3 },
  { perServing: { kcal: 160, protein: 30, carbs: 6, fat: 2 }, minScale: 0.5, maxScale: 3 },
  { perServing: { kcal: 550, protein: 40, carbs: 45, fat: 20 }, minScale: 0.5, maxScale: 3 },
]

describe('solveScales', () => {
  it('hits a reachable calorie + macro target within tolerance', () => {
    // Target equals the uniform 1.5x sum, so a solution clearly exists within bounds.
    const target: Targets = { kcal: 2715, protein: 217.5, carbs: 249, fat: 90 }

    const { scales, totals } = solveScales(items, target)

    expect(scales).toHaveLength(5)
    expect(totals.kcal).toBeGreaterThan(target.kcal * 0.95)
    expect(totals.kcal).toBeLessThan(target.kcal * 1.05)
    expect(Math.abs(totals.protein - target.protein)).toBeLessThan(10)
    expect(Math.abs(totals.carbs - target.carbs)).toBeLessThan(15)
    expect(Math.abs(totals.fat - target.fat)).toBeLessThan(10)
  })

  it('respects min/max scale bounds even when the target is unreachable', () => {
    const target: Targets = { kcal: 99999, protein: 9999, carbs: 9999, fat: 9999 }

    const { scales } = solveScales(items, target)

    scales.forEach((s, i) => {
      expect(s).toBeGreaterThanOrEqual(items[i].minScale - 1e-9)
      expect(s).toBeLessThanOrEqual(items[i].maxScale + 1e-9)
    })
  })

  it('hits a different reachable target (protein-heavy) within calorie tolerance', () => {
    const target: Targets = { kcal: 2000, protein: 190, carbs: 150, fat: 60 }

    const { totals } = solveScales(items, target)

    expect(totals.kcal).toBeGreaterThan(target.kcal * 0.92)
    expect(totals.kcal).toBeLessThan(target.kcal * 1.08)
  })
})

describe('solveScales per-meal calorie targets', () => {
  it('pulls each meal toward its targetKcal share', () => {
    const items: SolverItem[] = [
      { perServing: { kcal: 100, protein: 5, carbs: 10, fat: 3 }, minScale: 0.1, maxScale: 20, targetKcal: 700 },
      { perServing: { kcal: 100, protein: 5, carbs: 10, fat: 3 }, minScale: 0.1, maxScale: 20, targetKcal: 300 },
    ]
    const target: Targets = { kcal: 1000, protein: 50, carbs: 100, fat: 30 }
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
    const target: Targets = { kcal: 1000, protein: 50, carbs: 100, fat: 30 }
    const { scales } = solveScales(items, target)
    expect(scales[0]).toBeLessThanOrEqual(2) // capped, no deadlock
    expect(scales[0]).toBeGreaterThan(1.5) // pushed toward its cap
  })

  it('behaves unchanged when no targetKcal is given', () => {
    const items: SolverItem[] = [
      { perServing: { kcal: 200, protein: 10, carbs: 20, fat: 6 }, minScale: 0.5, maxScale: 3 },
      { perServing: { kcal: 200, protein: 10, carbs: 20, fat: 6 }, minScale: 0.5, maxScale: 3 },
    ]
    const target: Targets = { kcal: 800, protein: 40, carbs: 80, fat: 24 }
    const { totals } = solveScales(items, target)
    expect(totals.kcal).toBeGreaterThan(760)
    expect(totals.kcal).toBeLessThan(840)
  })
})
