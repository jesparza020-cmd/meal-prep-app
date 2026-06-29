import { describe, it, expect } from 'vitest'
import { parseJsonLdRecipe } from './jsonld-recipe'

const withNutrition = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Recipe","name":"Test Bowl",
"recipeYield":"2 servings","recipeCategory":"Breakfast",
"recipeIngredient":["60 g rolled oats","200 ml milk"],
"recipeInstructions":[{"@type":"HowToStep","text":"Mix."},{"@type":"HowToStep","text":"Chill."}],
"nutrition":{"@type":"NutritionInformation","calories":"400 kcal","proteinContent":"18 g","carbohydrateContent":"58 g","fatContent":"14 g"}}
</script></head><body></body></html>`

const graphNoNutrition = `<script type="application/ld+json">
{"@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Plain","recipeIngredient":["salt"],"recipeInstructions":"Cook it."}]}
</script>`

describe('parseJsonLdRecipe', () => {
  it('parses name, yield, ingredients, steps, nutrition', () => {
    const d = parseJsonLdRecipe(withNutrition)!
    expect(d.name).toBe('Test Bowl')
    expect(d.baseServingLabel).toBe('2 servings')
    expect(d.slot).toBe('breakfast')
    expect(d.ingredients[0]).toEqual({ name: 'rolled oats', qty: 60, unit: 'g' })
    expect(d.steps).toEqual(['Mix.', 'Chill.'])
    expect(d.nutrition).toEqual({ kcal: 400, protein: 18, carbs: 58, fat: 14 })
  })

  it('finds Recipe inside @graph and yields null nutrition + default slot', () => {
    const d = parseJsonLdRecipe(graphNoNutrition)!
    expect(d.name).toBe('Plain')
    expect(d.slot).toBe('dinner')
    expect(d.steps).toEqual(['Cook it.'])
    expect(d.nutrition).toBeNull()
  })

  it('returns null when there is no Recipe node', () => {
    expect(parseJsonLdRecipe('<html><body>no jsonld</body></html>')).toBeNull()
  })

  it('returns null on malformed json-ld', () => {
    expect(parseJsonLdRecipe('<script type="application/ld+json">{bad</script>')).toBeNull()
  })
})

function recipeWithIngredients(ingredients: string[]): string {
  return `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Recipe","name":"Test","recipeIngredient":${JSON.stringify(ingredients)},"recipeInstructions":"Do it."}
</script>`
}

describe('parseIngredient via parseJsonLdRecipe', () => {
  it('parses whole number with unit', () => {
    const d = parseJsonLdRecipe(recipeWithIngredients(['60 g rolled oats']))!
    expect(d.ingredients[0]).toEqual({ name: 'rolled oats', qty: 60, unit: 'g' })
  })

  it('parses simple fraction', () => {
    const d = parseJsonLdRecipe(recipeWithIngredients(['1/2 cup sugar']))!
    expect(d.ingredients[0]).toEqual({ name: 'sugar', qty: 0.5, unit: 'cup' })
  })

  it('parses mixed fraction', () => {
    const d = parseJsonLdRecipe(recipeWithIngredients(['1 1/2 tsp salt']))!
    expect(d.ingredients[0]).toEqual({ name: 'salt', qty: 1.5, unit: 'tsp' })
  })

  it('parses unitless count', () => {
    const d = parseJsonLdRecipe(recipeWithIngredients(['2 eggs']))!
    expect(d.ingredients[0]).toEqual({ name: 'eggs', qty: 2, unit: '' })
  })

  it('falls back to qty 1 when there is no leading number', () => {
    const d = parseJsonLdRecipe(recipeWithIngredients(['salt to taste']))!
    expect(d.ingredients[0]).toEqual({ name: 'salt to taste', qty: 1, unit: '' })
  })
})
