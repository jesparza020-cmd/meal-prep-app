import type { Macros, Slot } from '../types'
import { SLOTS } from '../types'
import type { DraftIngredient, DraftRecipe } from './draft'

const SCRIPT_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

function firstNumber(s: string): number | null {
  const m = s.replace(',', '.').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

function parseIngredient(line: string): DraftIngredient {
  const m = line.trim().match(/^([\d.,/]+)\s*([a-zA-Z]+)?\s+(.*)$/)
  if (m && firstNumber(m[1]) !== null) {
    return { name: m[3].trim(), qty: firstNumber(m[1])!, unit: (m[2] ?? '').trim() }
  }
  return { name: line.trim(), qty: 1, unit: '' }
}

function toSteps(instructions: unknown): string[] {
  if (typeof instructions === 'string') {
    return instructions.split('\n').map((s) => s.trim()).filter(Boolean)
  }
  if (Array.isArray(instructions)) {
    return instructions
      .map((it) => (typeof it === 'string' ? it : it && typeof it === 'object' ? String((it as Record<string, unknown>).text ?? '') : ''))
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

function toNutrition(n: unknown): Macros | null {
  if (!n || typeof n !== 'object') return null
  const o = n as Record<string, unknown>
  const kcal = firstNumber(String(o.calories ?? ''))
  const protein = firstNumber(String(o.proteinContent ?? ''))
  const carbs = firstNumber(String(o.carbohydrateContent ?? ''))
  const fat = firstNumber(String(o.fatContent ?? ''))
  if (kcal === null || protein === null || carbs === null || fat === null) return null
  return { kcal, protein, carbs, fat }
}

function toSlot(category: unknown): Slot {
  const c = String(category ?? '').toLowerCase()
  for (const s of SLOTS) if (c.includes(s)) return s
  if (c.includes('dessert') || c.includes('drink') || c.includes('smoothie')) return 'snack'
  return 'dinner'
}

function typeMatches(node: Record<string, unknown>): boolean {
  const t = node['@type']
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))
}

function findRecipeNode(parsed: unknown): Record<string, unknown> | null {
  const stack: unknown[] = [parsed]
  while (stack.length) {
    const cur = stack.pop()
    if (Array.isArray(cur)) stack.push(...cur)
    else if (cur && typeof cur === 'object') {
      const obj = cur as Record<string, unknown>
      if (typeMatches(obj)) return obj
      if (Array.isArray(obj['@graph'])) stack.push(...(obj['@graph'] as unknown[]))
    }
  }
  return null
}

export function parseJsonLdRecipe(html: string): DraftRecipe | null {
  let match: RegExpExecArray | null
  SCRIPT_RE.lastIndex = 0
  while ((match = SCRIPT_RE.exec(html)) !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(match[1].trim())
    } catch {
      continue
    }
    const node = findRecipeNode(parsed)
    if (!node || typeof node.name !== 'string' || !node.name.trim()) continue
    const ings = Array.isArray(node.recipeIngredient) ? (node.recipeIngredient as unknown[]) : []
    const yieldVal = node.recipeYield
    return {
      name: node.name.trim(),
      baseServingLabel: Array.isArray(yieldVal) ? String(yieldVal[0] ?? '1 serving') : String(yieldVal ?? '1 serving'),
      slot: toSlot(node.recipeCategory),
      ingredients: ings.map((i) => parseIngredient(String(i))),
      steps: toSteps(node.recipeInstructions),
      nutrition: toNutrition(node.nutrition),
    }
  }
  return null
}
