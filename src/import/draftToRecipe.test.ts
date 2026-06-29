import { describe, it, expect } from 'vitest'
import { draftToRecipe } from './draftToRecipe'
import type { DraftRecipe } from './draft'

const base: DraftRecipe = {
  name: 'Oats',
  baseServingLabel: '1 bowl',
  slot: 'breakfast',
  ingredients: [{ name: 'oats', qty: 60, unit: 'g' }],
  steps: ['Mix.'],
  nutrition: { kcal: 400, protein: 18, carbs: 58, fat: 14 },
}

describe('draftToRecipe', () => {
  it('maps a draft with nutrition into a custom Recipe', () => {
    const r = draftToRecipe(base, { kind: 'url', ref: 'https://x.test/r' })
    expect(r.source).toBe('custom')
    expect(r.perServing).toEqual({ kcal: 400, protein: 18, carbs: 58, fat: 14 })
    expect(r.minScale).toBe(0.5)
    expect(r.maxScale).toBe(2.5)
    expect(r.importedFrom).toEqual({ kind: 'url', ref: 'https://x.test/r' })
    expect(r.id).toMatch(/^c\d+$/)
  })

  it('zeroes macros when nutrition is null', () => {
    const r = draftToRecipe({ ...base, nutrition: null }, { kind: 'image' })
    expect(r.perServing).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
    expect(r.importedFrom).toEqual({ kind: 'image' })
  })
})
