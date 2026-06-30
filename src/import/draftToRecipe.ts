import type { ImportSource, Recipe } from '../types'
import type { DraftRecipe } from './draft'

export function draftToRecipe(draft: DraftRecipe, source: ImportSource): Recipe {
  return {
    id: `c${Date.now()}`,
    name: draft.name,
    slot: draft.slot,
    baseServingLabel: draft.baseServingLabel || '1 serving',
    perServing: draft.nutrition ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    ingredients: draft.ingredients,
    steps: draft.steps,
    minScale: 0.5,
    maxScale: 2.5,
    source: 'custom',
    importedFrom: source,
  }
}
