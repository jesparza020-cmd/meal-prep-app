import { useState } from 'react'
import type { Recipe, WeekPlan } from '../types'
import { SLOTS, SLOT_LABELS } from '../types'
import { pctDiff, r0 } from '../lib/nutrition'
import { MealCard } from './MealCard'

interface Props {
  history: WeekPlan[]
  recipesById: Map<string, Recipe>
}

export function History({ history, recipesById }: Props) {
  const [selected, setSelected] = useState<number | null>(null)

  if (history.length === 0) {
    return (
      <section className="panel">
        <h2>History</h2>
        <p className="muted">
          Approved plans show up here. The planner uses them to avoid repeating last
          week's meals.
        </p>
      </section>
    )
  }

  // `selected` indexes into the original (chronological) history array.
  if (selected !== null && history[selected]) {
    const wk = history[selected]
    const present = SLOTS.filter((s) => wk.slots[s])
    const rows: { label: string; actual: number; target: number; unit: string }[] = [
      { label: 'Calories', actual: r0(wk.totals.kcal), target: r0(wk.targets.kcal), unit: 'kcal' },
      { label: 'Protein', actual: r0(wk.totals.protein), target: r0(wk.targets.protein), unit: 'g' },
      { label: 'Carbs', actual: r0(wk.totals.carbs), target: r0(wk.targets.carbs), unit: 'g' },
      { label: 'Fat', actual: r0(wk.totals.fat), target: r0(wk.targets.fat), unit: 'g' },
    ]
    return (
      <section>
        <div className="panel">
          <div className="row-between">
            <h2>Week of {wk.weekStartISO}</h2>
            <button className="link" onClick={() => setSelected(null)}>← Back</button>
          </div>
          <div className="totals">
            {rows.map((row) => {
              const diff = pctDiff(row.actual, row.target)
              const cls = Math.abs(diff) <= 6 ? 'good' : Math.abs(diff) <= 15 ? 'ok' : 'off'
              return (
                <div className={`total-pill ${cls}`} key={row.label}>
                  <span className="total-label">{row.label}</span>
                  <span className="total-value">{row.actual}{row.unit}</span>
                  <span className="total-target">target {row.target}{row.unit}</span>
                </div>
              )
            })}
          </div>
        </div>
        {present.map((s) => (
          <MealCard
            key={s}
            slotLabel={SLOT_LABELS[s]}
            recipe={recipesById.get(wk.slots[s]!)}
            scale={wk.scales[s]}
          />
        ))}
      </section>
    )
  }

  const weeks = history.map((wk, idx) => ({ wk, idx })).reverse()

  return (
    <section>
      <div className="panel">
        <h2>History</h2>
        <p className="muted small">Most recent first. Tap a week to see the full plan.</p>
      </div>
      {weeks.map(({ wk, idx }, order) => (
        <button className="panel history-card" key={`${wk.weekStartISO}-${idx}`} onClick={() => setSelected(idx)}>
          <div className="row-between">
            <h3>Week of {wk.weekStartISO}</h3>
            {order === 0 && <span className="badge">current</span>}
          </div>
          <ul className="history-list">
            {SLOTS.filter((s) => wk.slots[s]).map((s) => (
              <li key={s}>
                <span className="muted small">{SLOT_LABELS[s]}</span>
                <span>{recipesById.get(wk.slots[s]!)?.name ?? '(removed)'}</span>
              </li>
            ))}
          </ul>
        </button>
      ))}
    </section>
  )
}
