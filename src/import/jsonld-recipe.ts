import type { Macros, Slot } from '../types'
import { SLOTS } from '../types'
import type { DraftIngredient, DraftRecipe } from './draft'

const SCRIPT_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

function firstNumber(s: string): number | null {
  const m = s.replace(',', '.').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

function parseQty(s: string): number | null {
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const fraction = s.match(/^(\d+)\/(\d+)$/)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])
  return firstNumber(s)
}

function parseIngredient(line: string): DraftIngredient {
  const trimmed = line.trim()
  const m = trimmed.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s+(.*)$/)
  if (m) {
    const qty = parseQty(m[1])
    if (qty !== null) {
      const rest = m[2].trim()
      const unitMatch = rest.match(/^([a-zA-Z]+)\s+(.+)$/)
      if (unitMatch) {
        return { name: unitMatch[2].trim(), qty, unit: unitMatch[1].trim() }
      }
      return { name: rest, qty, unit: '' }
    }
  }
  return { name: trimmed, qty: 1, unit: '' }
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
