import { useState } from 'react'
import type { Targets } from '../types'
import { kcalFromMacros, r0 } from '../lib/nutrition'

interface Props {
  initial: Targets | null
  onSave: (t: Targets) => void
}

const DEFAULT: Targets = { kcal: 2200, protein: 170, carbs: 220, fat: 70 }

export function TargetsForm({ initial, onSave }: Props) {
  const start = initial ?? DEFAULT
  const [protein, setProtein] = useState(String(start.protein))
  const [carbs, setCarbs] = useState(String(start.carbs))
  const [fat, setFat] = useState(String(start.fat))

  const p = Number(protein) || 0
  const c = Number(carbs) || 0
  const f = Number(fat) || 0
  const kcal = r0(kcalFromMacros(p, c, f))

  const submit = () => onSave({ kcal, protein: p, carbs: c, fat: f })

  return (
    <section className="panel">
      <h2>Daily targets</h2>
      <p className="muted">
        Set the macros you want each day to hit. Calories are calculated from them
        (4 / 4 / 9). The planner scales meal portions to land on these numbers.
      </p>

      <div className="field">
        <label>Protein (g)</label>
        <input inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} />
      </div>
      <div className="field">
        <label>Carbs (g)</label>
        <input inputMode="numeric" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
      </div>
      <div className="field">
        <label>Fat (g)</label>
        <input inputMode="numeric" value={fat} onChange={(e) => setFat(e.target.value)} />
      </div>

      <div className="kcal-readout">
        <span>Daily calories</span>
        <strong>{kcal} kcal</strong>
      </div>

      <button className="primary" onClick={submit}>
        Save targets
      </button>
    </section>
  )
}
