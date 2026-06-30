export type Slot = 'breakfast' | 'lunch' | 'snack' | 'shake' | 'dinner';

export const SLOTS: Slot[] = ['breakfast', 'lunch', 'snack', 'shake', 'dinner'];

export const SLOT_LABELS: Record<Slot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  shake: 'Protein Shake',
  dinner: 'Dinner',
};

export interface Macros {
  kcal: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
}

export interface Ingredient {
  name: string;
  qty: number; // per single base serving
  unit: string;
}

export interface ImportSource {
  kind: 'image' | 'pdf' | 'url';
  ref?: string; // source URL for url imports
}

export interface Recipe {
  id: string;
  name: string;
  slot: Slot;
  baseServingLabel: string; // e.g. "1 bowl", "1 scoop + 250ml milk"
  perServing: Macros;
  ingredients: Ingredient[];
  steps: string[];
  minScale: number; // smallest portion multiplier allowed
  maxScale: number; // largest portion multiplier allowed
  source: 'seed' | 'custom';
  usableForSlots?: Slot[]; // slots this meal can fill; defaults to [slot]
  importedFrom?: ImportSource; // provenance for imported recipes
}

export type Targets = Macros;

export interface WeekPlan {
  weekStartISO: string;
  slots: Partial<Record<Slot, string>>; // slot -> recipe id (subset allowed)
  scales: Partial<Record<Slot, number>>; // slot -> portion multiplier
  totals: Macros;
  targets: Targets;
}

export interface SlotConfig {
  include: boolean;
  mode: 'random' | 'base' | 'exact';
  base?: string;
  recipeId?: string;
}

export type PlanConfig = Record<Slot, SlotConfig>;

/** Slots a recipe is eligible to fill (defaults to its primary slot). */
export function slotsFor(recipe: Recipe): Slot[] {
  return recipe.usableForSlots ?? [recipe.slot];
}

export function eligibleForSlot(recipe: Recipe, slot: Slot): boolean {
  return slotsFor(recipe).includes(slot);
}

export interface AppState {
  targets: Targets | null;
  customRecipes: Recipe[];
  deletedSeedIds: string[];
  history: WeekPlan[];
}
