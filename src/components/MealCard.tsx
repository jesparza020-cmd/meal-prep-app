import { useState } from 'react'
import type { Macros, Recipe } from '../types'
import { r0, r1, scaleMacros } from '../lib/nutrition'

export function MealCard({
  slotLabel,
  recipe,
  scale,
}: {
  slotLabel: string
  recipe: Recipe | undefined
  scale: number | undefined
}) {
  const [open, setOpen] = useState(false)
  const s = scale ?? 1

  if (!recipe) {
    return (
      <div className="card">
        <div className="card-head">
          <span className="slot-tag">{slotLabel}</span>
        </div>
        <p className="muted">This recipe was removed. Generate a new plan to replace it.</p>
      </div>
    )
  }

  const m: Macros = scaleMacros(recipe.perServing, s)

  return (
    <div className="card">
      <div className="card-head">
        <span className="slot-tag">{slotLabel}</span>
        <span className="portion">{r1(s)}× portion</span>
      </div>
      <h3>{recipe.name}</h3>
      <p className="muted small">{r1(s)} × {recipe.baseServingLabel}</p>
      <div className="macros">
        <span><strong>{r0(m.kcal)}</strong> kcal</span>
        <span><strong>{r0(m.protein)}</strong>g P</span>
        <span><strong>{r0(m.carbs)}</strong>g C</span>
        <span><strong>{r0(m.fat)}</strong>g F</span>
      </div>
      <button className="link" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide' : 'How to make it'}
      </button>
      {open && (
        <div className="details">
          {recipe.ingredients.length > 0 && (
            <>
              <h4>Ingredients (per serving)</h4>
              <ul>
                {recipe.ingredients.map((ing, i) => (
                  <li key={i}>{r1(ing.qty * s)} {ing.unit} {ing.name}</li>
                ))}
              </ul>
            </>
          )}
          {recipe.steps.length > 0 && (
            <>
              <h4>Steps</h4>
              <ol>
                {recipe.steps.map((step, i) => (<li key={i}>{step}</li>))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  )
}
