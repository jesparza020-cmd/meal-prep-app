import { useState } from 'react'
import type { Ingredient, Recipe, Slot } from '../types'
import { SLOTS, SLOT_LABELS } from '../types'
import { kcalFromMacros, r0 } from '../lib/nutrition'

interface Props {
  recipes: Recipe[]
  onAdd: (r: Recipe) => void
  onUpdate: (original: Recipe, updated: Recipe) => void
  onDelete: (r: Recipe) => void
}

export function Meals({ recipes, onAdd, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [creating, setCreating] = useState(false)

  if (creating || editing) {
    return (
      <RecipeEditor
        recipe={editing}
        onCancel={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSubmit={(r) => {
          if (editing) onUpdate(editing, r)
          else onAdd(r)
          setCreating(false)
          setEditing(null)
        }}
      />
    )
  }

  return (
    <section>
      <div className="panel row-between">
        <h2>Your meals</h2>
        <button className="primary small-btn" onClick={() => setCreating(true)}>+ Add meal</button>
      </div>
      {SLOTS.map((slot) => {
        const list = recipes.filter((r) => r.slot === slot)
        return (
          <div className="panel" key={slot}>
            <h3 className="slot-heading">{SLOT_LABELS[slot]} <span className="muted small">({list.length})</span></h3>
            {list.map((r) => (
              <div className="meal-row" key={r.id}>
                <div>
                  <div className="meal-name">{r.name}{r.source === 'custom' && <span className="badge">custom</span>}</div>
                  <div className="muted small">{r0(r.perServing.kcal)} kcal · {r0(r.perServing.protein)}P {r0(r.perServing.carbs)}C {r0(r.perServing.fat)}F</div>
                </div>
                <div className="meal-actions">
                  <button className="link" onClick={() => setEditing(r)}>Edit</button>
                  <button className="link danger" onClick={() => onDelete(r)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </section>
  )
}

function parseIngredients(text: string): Ingredient[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, qty, unit] = line.split('|').map((s) => s.trim())
      return { name: name ?? line, qty: Number(qty) || 1, unit: unit ?? '' }
    })
}

function ingredientsToText(ings: Ingredient[]): string {
  return ings.map((i) => `${i.name} | ${i.qty} | ${i.unit}`).join('\n')
}

function RecipeEditor({
  recipe,
  onSubmit,
  onCancel,
}: {
  recipe: Recipe | null
  onSubmit: (r: Recipe) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(recipe?.name ?? '')
  const [slot, setSlot] = useState<Slot>(recipe?.slot ?? 'breakfast')
  const [dualLunchDinner, setDualLunchDinner] = useState(
    (recipe?.usableForSlots ?? []).includes('lunch') &&
      (recipe?.usableForSlots ?? []).includes('dinner'),
  )
  const [servingLabel, setServingLabel] = useState(recipe?.baseServingLabel ?? '1 serving')
  const [protein, setProtein] = useState(String(recipe?.perServing.protein ?? 25))
  const [carbs, setCarbs] = useState(String(recipe?.perServing.carbs ?? 30))
  const [fat, setFat] = useState(String(recipe?.perServing.fat ?? 10))
  const [minScale, setMinScale] = useState(String(recipe?.minScale ?? 0.5))
  const [maxScale, setMaxScale] = useState(String(recipe?.maxScale ?? 2.5))
  const [ingredients, setIngredients] = useState(ingredientsToText(recipe?.ingredients ?? []))
  const [steps, setSteps] = useState((recipe?.steps ?? []).join('\n'))

  const p = Number(protein) || 0
  const c = Number(carbs) || 0
  const f = Number(fat) || 0
  const kcal = Math.round(kcalFromMacros(p, c, f))

  const save = () => {
    if (!name.trim()) return
    const usableForSlots =
      dualLunchDinner && (slot === 'lunch' || slot === 'dinner')
        ? (['lunch', 'dinner'] as Slot[])
        : undefined
    const r: Recipe = {
      id: recipe?.source === 'custom' ? recipe.id : `c${Date.now()}`,
      name: name.trim(),
      slot,
      baseServingLabel: servingLabel.trim() || '1 serving',
      perServing: { kcal, protein: p, carbs: c, fat: f },
      ingredients: parseIngredients(ingredients),
      steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
      minScale: Number(minScale) || 0.5,
      maxScale: Number(maxScale) || 2.5,
      source: 'custom',
      ...(usableForSlots ? { usableForSlots } : {}),
    }
    onSubmit(r)
  }

  return (
    <section className="panel">
      <h2>{recipe ? 'Edit meal' : 'Add meal'}</h2>

      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken & rice bowl" />
      </div>
      <div className="field">
        <label>Slot</label>
        <select value={slot} onChange={(e) => setSlot(e.target.value as Slot)}>
          {SLOTS.map((s) => (
            <option key={s} value={s}>{SLOT_LABELS[s]}</option>
          ))}
        </select>
      </div>
      {(slot === 'lunch' || slot === 'dinner') && (
        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={dualLunchDinner}
            onChange={(e) => setDualLunchDinner(e.target.checked)}
          />
          <span>Also usable for {slot === 'lunch' ? 'dinner' : 'lunch'}</span>
        </label>
      )}
      <div className="field">
        <label>Base serving label</label>
        <input value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} />
      </div>

      <div className="grid3">
        <div className="field"><label>Protein (g)</label><input inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} /></div>
        <div className="field"><label>Carbs (g)</label><input inputMode="numeric" value={carbs} onChange={(e) => setCarbs(e.target.value)} /></div>
        <div className="field"><label>Fat (g)</label><input inputMode="numeric" value={fat} onChange={(e) => setFat(e.target.value)} /></div>
      </div>
      <div className="kcal-readout"><span>Per serving</span><strong>{kcal} kcal</strong></div>

      <div className="grid2">
        <div className="field"><label>Min portion ×</label><input inputMode="decimal" value={minScale} onChange={(e) => setMinScale(e.target.value)} /></div>
        <div className="field"><label>Max portion ×</label><input inputMode="decimal" value={maxScale} onChange={(e) => setMaxScale(e.target.value)} /></div>
      </div>

      <div className="field">
        <label>Ingredients <span className="muted small">(one per line: name | qty | unit)</span></label>
        <textarea rows={4} value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder={'chicken breast | 150 | g\nrice | 180 | g'} />
      </div>
      <div className="field">
        <label>Steps <span className="muted small">(one per line)</span></label>
        <textarea rows={3} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </div>

      <div className="grid2">
        <button className="ghost" onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={save}>Save meal</button>
      </div>
    </section>
  )
}
