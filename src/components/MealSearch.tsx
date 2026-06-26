import { useMemo, useState } from 'react'
import type { Recipe, Slot } from '../types'
import { SLOT_LABELS, eligibleForSlot } from '../types'
import { r0 } from '../lib/nutrition'

export function MealSearch({
  slot,
  recipes,
  onPick,
  onCancel,
}: {
  slot: Slot
  recipes: Recipe[]
  onPick: (r: Recipe) => void
  onCancel: () => void
}) {
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return recipes
      .filter((r) => eligibleForSlot(r, slot))
      .filter((r) => !needle || r.name.toLowerCase().includes(needle))
  }, [q, recipes, slot])

  return (
    <div className="panel">
      <div className="row-between">
        <h3>Choose a {SLOT_LABELS[slot]}</h3>
        <button className="link" onClick={onCancel}>Cancel</button>
      </div>
      <div className="field">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search meals…" />
      </div>
      {results.length === 0 && <p className="muted small">No matching meals for this slot.</p>}
      {results.map((r) => (
        <div className="meal-row" key={r.id}>
          <div>
            <div className="meal-name">{r.name}</div>
            <div className="muted small">{r0(r.perServing.kcal)} kcal · {r0(r.perServing.protein)}P {r0(r.perServing.carbs)}C {r0(r.perServing.fat)}F</div>
          </div>
          <button className="link" onClick={() => onPick(r)}>Pick</button>
        </div>
      ))}
    </div>
  )
}
