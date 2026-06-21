import type { Recipe, WeekPlan } from '../types'
import { SLOTS, SLOT_LABELS } from '../types'

interface Props {
  history: WeekPlan[]
  recipesById: Map<string, Recipe>
}

export function History({ history, recipesById }: Props) {
  if (history.length === 0) {
    return (
      <section className="panel">
        <h2>History</h2>
        <p className="muted">
          Past weeks show up here. The planner uses them to avoid repeating last
          week's meals.
        </p>
      </section>
    )
  }

  const weeks = [...history].reverse()

  return (
    <section>
      <div className="panel">
        <h2>History</h2>
        <p className="muted small">Most recent first. Used to avoid week-over-week repeats.</p>
      </div>
      {weeks.map((wk, idx) => (
        <div className="panel" key={`${wk.weekStartISO}-${idx}`}>
          <div className="row-between">
            <h3>Week of {wk.weekStartISO}</h3>
            {idx === 0 && <span className="badge">current</span>}
          </div>
          <ul className="history-list">
            {SLOTS.map((s) => {
              const r = recipesById.get(wk.slots[s])
              return (
                <li key={s}>
                  <span className="muted small">{SLOT_LABELS[s]}</span>
                  <span>{r?.name ?? '(removed)'}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
