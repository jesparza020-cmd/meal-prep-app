import type { Recipe, Targets, WeekPlan } from '../types'
import { SLOTS, SLOT_LABELS } from '../types'
import { pctDiff, r0 } from '../lib/nutrition'
import { MealCard } from './MealCard'

interface Props {
  plan: WeekPlan | null
  targets: Targets | null
  recipesById: Map<string, Recipe>
  onNewPlan: () => void
  onGoToTargets: () => void
}

function fitClass(diff: number): string {
  const a = Math.abs(diff)
  if (a <= 6) return 'good'
  if (a <= 15) return 'ok'
  return 'off'
}

export function PlanView({ plan, targets, recipesById, onNewPlan, onGoToTargets }: Props) {
  if (!targets) {
    return (
      <section className="panel">
        <h2>No targets yet</h2>
        <p className="muted">Set your daily calorie and macro targets to get started.</p>
        <button className="primary" onClick={onGoToTargets}>Set targets</button>
      </section>
    )
  }

  if (!plan) {
    return (
      <section className="panel">
        <h2>This week</h2>
        <p className="muted">
          Generate a meal set: one breakfast, lunch, snack, protein shake and dinner,
          cooked once and eaten all week. Portions are scaled to hit your targets, and
          next week avoids what you just had.
        </p>
        <button className="primary" onClick={onNewPlan}>＋ New meal plan</button>
      </section>
    )
  }

  const totals = plan.totals
  const rows: { label: string; actual: number; target: number; unit: string }[] = [
    { label: 'Calories', actual: r0(totals.kcal), target: r0(targets.kcal), unit: 'kcal' },
    { label: 'Protein', actual: r0(totals.protein), target: r0(targets.protein), unit: 'g' },
    { label: 'Carbs', actual: r0(totals.carbs), target: r0(targets.carbs), unit: 'g' },
    { label: 'Fat', actual: r0(totals.fat), target: r0(targets.fat), unit: 'g' },
  ]

  return (
    <section>
      <div className="panel">
        <div className="row-between">
          <h2>Daily totals</h2>
          <span className="muted small">week of {plan.weekStartISO}</span>
        </div>
        <div className="totals">
          {rows.map((row) => {
            const diff = pctDiff(row.actual, row.target)
            return (
              <div className={`total-pill ${fitClass(diff)}`} key={row.label}>
                <span className="total-label">{row.label}</span>
                <span className="total-value">{row.actual}{row.unit}</span>
                <span className="total-target">target {row.target}{row.unit}</span>
              </div>
            )
          })}
        </div>
        <button className="primary" onClick={onNewPlan}>＋ New meal plan</button>
      </div>

      {SLOTS.filter((slot) => plan.slots[slot]).map((slot) => {
        const recipe = recipesById.get(plan.slots[slot]!)
        const scale = plan.scales[slot]
        return <MealCard key={slot} slotLabel={SLOT_LABELS[slot]} recipe={recipe} scale={scale} />
      })}
    </section>
  )
}
