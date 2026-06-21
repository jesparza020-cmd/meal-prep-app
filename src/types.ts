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
}

export type Targets = Macros;

export interface WeekPlan {
  weekStartISO: string;
  slots: Record<Slot, string>; // slot -> recipe id
  scales: Record<Slot, number>; // slot -> portion multiplier
  totals: Macros;
  targets: Targets;
}

export interface AppState {
  targets: Targets | null;
  customRecipes: Recipe[];
  deletedSeedIds: string[];
  history: WeekPlan[];
}
