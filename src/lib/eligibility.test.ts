import { describe, it, expect } from 'vitest'
import { slotsFor, eligibleForSlot } from '../types'
import type { Recipe } from '../types'

function mk(over: Partial<Recipe>): Recipe {
  return {
    id: 'x', name: 'x', slot: 'dinner', baseServingLabel: '1',
    perServing: { kcal: 300, protein: 25, carbs: 30, fat: 10 },
    ingredients: [], steps: [], minScale: 0.5, maxScale: 3, source: 'seed',
    ...over,
  }
}

describe('eligibility', () => {
  it('defaults eligibility to the primary slot', () => {
    const r = mk({ slot: 'dinner' })
    expect(slotsFor(r)).toEqual(['dinner'])
    expect(eligibleForSlot(r, 'dinner')).toBe(true)
    expect(eligibleForSlot(r, 'lunch')).toBe(false)
  })

  it('honors usableForSlots when present', () => {
    const r = mk({ slot: 'dinner', usableForSlots: ['lunch', 'dinner'] })
    expect(eligibleForSlot(r, 'lunch')).toBe(true)
    expect(eligibleForSlot(r, 'dinner')).toBe(true)
    expect(eligibleForSlot(r, 'snack')).toBe(false)
  })
})
