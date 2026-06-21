import { describe, it, expect } from 'vitest'
import { generateWeek } from './planner'
import type { Recipe, Targets, WeekPlan, Slot } from '../types'

let idc = 0
function recipe(slot: Slot, m: Partial<Recipe['perServing']>): Recipe {
  idc += 1
  return {
    id: `r${idc}`,
    name: `${slot}-${idc}`,
    slot,
    baseServingLabel: '1 serving',
    perServing: { kcal: 300, protein: 25, carbs: 30, fat: 10, ...m },
    ingredients: [],
    steps: [],
    minScale: 0.5,
    maxScale: 3,
    source: 'seed',
  }
}

function library(): Recipe[] {
  const slots: Slot[] = ['breakfast', 'lunch', 'snack', 'shake', 'dinner']
  const lib: Recipe[] = []
  for (const s of slots) {
    for (let i = 0; i < 3; i++) lib.push(recipe(s, {}))
  }
  return lib
}

const target: Targets = { kcal: 2200, protein: 180, carbs: 200, fat: 70 }

describe('generateWeek', () => {
  it('returns exactly one recipe per slot', () => {
    const plan = generateWeek(library(), target, [])
    expect(Object.keys(plan.slots).sort()).toEqual(
      ['breakfast', 'dinner', 'lunch', 'shake', 'snack'].sort(),
    )
    for (const s of Object.values(plan.slots)) expect(typeof s).toBe('string')
  })

  it('does not reuse any of the previous week\'s recipes when alternatives exist', () => {
    const lib = library()
    const first = generateWeek(lib, target, [])
    const history: WeekPlan[] = [first]
    const second = generateWeek(lib, target, history)

    for (const slot of Object.keys(second.slots) as Slot[]) {
      expect(second.slots[slot]).not.toBe(first.slots[slot])
    }
  })

  it('relaxes gracefully when a slot has only one recipe', () => {
    // One library; keep only a single 'shake' option.
    const lib = library()
    const shakes = lib.filter((r) => r.slot === 'shake')
    const onlyShake = shakes[0]
    const trimmed = lib.filter((r) => r.slot !== 'shake').concat(onlyShake)

    const first = generateWeek(trimmed, target, [])
    const second = generateWeek(trimmed, target, [first])
    // Forced to repeat the single shake rather than fail.
    expect(second.slots.shake).toBe(onlyShake.id)
  })

  it('produces totals that land near the calorie target', () => {
    const plan = generateWeek(library(), target, [])
    expect(plan.totals.kcal).toBeGreaterThan(target.kcal * 0.9)
    expect(plan.totals.kcal).toBeLessThan(target.kcal * 1.1)
  })
})
