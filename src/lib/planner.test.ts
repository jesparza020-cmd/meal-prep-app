import { describe, it, expect } from 'vitest'
import { generateWeek, generatePlan, defaultConfig, recalcScales } from './planner'
import type { Recipe, Targets, WeekPlan, Slot, PlanConfig, SlotConfig } from '../types'

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

function cfg(over: Partial<Record<Slot, Partial<SlotConfig>>> = {}): PlanConfig {
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

describe('generatePlan calorie balance', () => {
  it('keeps each meal near its slot share instead of a lopsided split', () => {
    const b = recipe('breakfast', {})
    const l = recipe('lunch', {})
    const d = recipe('dinner', {})
    const lib = [b, l, d]
    // Macros are 5x the per-serving sum, so any distribution hits the macro
    // totals; only the per-meal kcal share decides the split.
    const t: Targets = { kcal: 1500, protein: 125, carbs: 150, fat: 50 }
    const config = defaultConfig()
    config.snack.include = false
    config.shake.include = false

    const plan = generatePlan(lib, t, config, [])

    const kcalFor = (slot: Slot) => {
      const r = lib.find((x) => x.id === plan.slots[slot])!
      return r.perServing.kcal * (plan.scales[slot] ?? 0)
    }
    const bk = kcalFor('breakfast')
    const ln = kcalFor('lunch')
    const dn = kcalFor('dinner')

    // Shares over breakfast/lunch/dinner: 25/30/30 -> ~29.4/35.3/35.3% of 1500
    // => ~441 / ~529 / ~529, not a flat 500/500/500.
    expect(bk).toBeGreaterThan(400)
    expect(bk).toBeLessThan(480)
    expect(ln).toBeGreaterThan(500)
    expect(dn).toBeGreaterThan(500)
    expect(bk).toBeLessThan(ln)
    expect(plan.totals.kcal).toBeGreaterThan(1450)
    expect(plan.totals.kcal).toBeLessThan(1550)
  })
})

describe('recalcScales', () => {
  it('recomputes scales within each recipe\'s bounds for the current slots', () => {
    const lib = library()
    const plan = generatePlan(lib, target, defaultConfig(), [])
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
