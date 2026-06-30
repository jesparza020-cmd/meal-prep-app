import { describe, it, expect } from 'vitest'
import { validateDraft } from './draft'

const valid = {
  name: 'Oats',
  baseServingLabel: '1 bowl',
  slot: 'breakfast',
  ingredients: [{ name: 'oats', qty: 60, unit: 'g' }],
  steps: ['Mix.'],
  nutrition: { kcal: 400, protein: 18, carbs: 58, fat: 14 },
}

describe('validateDraft', () => {
  it('accepts a valid draft', () => {
    expect(validateDraft(valid)).toEqual(valid)
  })

  it('accepts null nutrition', () => {
    const d = validateDraft({ ...valid, nutrition: null })
    expect(d.nutrition).toBeNull()
  })

  it('rejects a bad slot', () => {
    expect(() => validateDraft({ ...valid, slot: 'brunch' })).toThrow()
  })

  it('rejects a missing name', () => {
    const rest: Partial<typeof valid> = { ...valid }
    delete rest.name
    expect(() => validateDraft(rest)).toThrow()
  })

  it('rejects partial nutrition', () => {
    expect(() => validateDraft({ ...valid, nutrition: { kcal: 400 } })).toThrow()
  })

  it('coerces non-array ingredients to an error', () => {
    expect(() => validateDraft({ ...valid, ingredients: 'oats' })).toThrow()
  })
})
