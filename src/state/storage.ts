import type { AppState, Recipe } from '../types'
import { SEED_RECIPES } from '../data/seedRecipes'

const KEY = 'meal-prep-state-v1'

const EMPTY: AppState = {
  targets: null,
  customRecipes: [],
  deletedSeedIds: [],
  history: [],
}

export function loadState(): AppState {
  if (typeof localStorage === 'undefined') return { ...EMPTY }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<AppState>
    return {
      targets: parsed.targets ?? null,
      customRecipes: parsed.customRecipes ?? [],
      deletedSeedIds: parsed.deletedSeedIds ?? [],
      history: parsed.history ?? [],
    }
  } catch {
    return { ...EMPTY }
  }
}

export function saveState(state: AppState): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(state))
}

/** Seed library minus hidden/edited seeds, plus the user's custom recipes. */
export function effectiveRecipes(state: AppState): Recipe[] {
  const hidden = new Set(state.deletedSeedIds)
  const seed = SEED_RECIPES.filter((r) => !hidden.has(r.id))
  return [...seed, ...state.customRecipes]
}
