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
