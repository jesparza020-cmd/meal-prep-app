import type { ImportSource, Macros, Slot } from '../types'
import { SLOTS } from '../types'

export type { ImportSource }

export interface DraftIngredient {
  name: string
  qty: number
  unit: string
}

export interface DraftRecipe {
  name: string
  baseServingLabel: string
  slot: Slot
  ingredients: DraftIngredient[]
  steps: string[]
  nutrition: Macros | null
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function num(v: unknown): number {
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error('expected number')
  return v
}

function str(v: unknown): string {
  if (typeof v !== 'string') throw new Error('expected string')
  return v
}

function macros(v: unknown): Macros | null {
  if (v === null) return null
  if (!isObj(v)) throw new Error('nutrition must be object or null')
  return { kcal: num(v.kcal), protein: num(v.protein), carbs: num(v.carbs), fat: num(v.fat) }
}

export function validateDraft(value: unknown): DraftRecipe {
  if (!isObj(value)) throw new Error('draft must be an object')
  const slot = str(value.slot)
  if (!SLOTS.includes(slot as Slot)) throw new Error(`invalid slot: ${slot}`)
  if (!Array.isArray(value.ingredients)) throw new Error('ingredients must be an array')
  if (!Array.isArray(value.steps)) throw new Error('steps must be an array')
  return {
    name: str(value.name),
    baseServingLabel: str(value.baseServingLabel),
    slot: slot as Slot,
    ingredients: value.ingredients.map((i) => {
      if (!isObj(i)) throw new Error('ingredient must be object')
      return { name: str(i.name), qty: num(i.qty), unit: str(i.unit) }
    }),
    steps: value.steps.map((s) => str(s)),
    nutrition: macros(value.nutrition),
  }
}
