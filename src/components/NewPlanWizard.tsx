import { useMemo, useState } from 'react'
import type { PlanConfig, Recipe, Slot, Targets, WeekPlan } from '../types'
import { SLOTS, SLOT_LABELS, eligibleForSlot } from '../types'
import { defaultConfig, generatePlan, recalcScales } from '../lib/planner'
import { r0 } from '../lib/nutrition'
import { MealCard } from './MealCard'
import { MealSearch } from './MealSearch'

type Step = 'targets' | 'config' | 'review'

export function NewPlanWizard({
  recipes,
  targets,
  history,
  onApprove,
  onCancel,
  onGoToTargets,
}: {
  recipes: Recipe[]
  targets: Targets
  history: WeekPlan[]
  onApprove: (p: WeekPlan) => void
  onCancel: () => void
  onGoToTargets: () => void
}) {
  const [step, setStep] = useState<Step>('targets')
  const [config, setConfig] = useState<PlanConfig>(() => defaultConfig())
  const [plan, setPlan] = useState<WeekPlan | null>(null)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changing, setChanging] = useState<Slot | null>(null)

  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes])

  const setSlot = (s: Slot, patch: Partial<PlanConfig[Slot]>) =>
    setConfig((c) => ({ ...c, [s]: { ...c[s], ...patch } }))

  const generate = () => {
    try {
      setPlan(generatePlan(recipes, targets, config, history))
      setDirty(false)
      setError(null)
      setStep('review')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // ----- Step 1: review targets -----
  if (step === 'targets') {
    const rows = [
      ['Calories', r0(targets.kcal), 'kcal'],
      ['Protein', r0(targets.protein), 'g'],
      ['Carbs', r0(targets.carbs), 'g'],
      ['Fat', r0(targets.fat), 'g'],
    ] as const
    return (
      <section className="panel">
        <div className="row-between">
          <h2>New meal plan</h2>
          <button className="link" onClick={onCancel}>Cancel</button>
        </div>
        <p className="muted small">Step 1 of 3 · Review your daily targets</p>
        <div className="totals">
          {rows.map(([label, val, unit]) => (
            <div className="total-pill" key={label}>
              <span className="total-label">{label}</span>
              <span className="total-value">{val}{unit}</span>
            </div>
          ))}
        </div>
        <button className="link" onClick={onGoToTargets}>Edit targets</button>
        <button className="primary" onClick={() => setStep('config')}>Next</button>
      </section>
    )
  }

  // ----- Step 2: configure slots -----
  if (step === 'config') {
    return (
      <section>
        <div className="panel">
          <div className="row-between">
            <h2>Configure meals</h2>
            <button className="link" onClick={onCancel}>Cancel</button>
          </div>
          <p className="muted small">Step 2 of 3 · Choose which meals and how to fill them</p>
          {error && <p className="error-text">{error}</p>}
        </div>
        {SLOTS.map((slot) => {
          const c = config[slot]
          const eligible = recipes.filter((r) => eligibleForSlot(r, slot))
          return (
            <div className="panel" key={slot}>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={c.include}
                  onChange={(e) => setSlot(slot, { include: e.target.checked })}
                />
                <strong>{SLOT_LABELS[slot]}</strong>
              </label>
              {c.include && (
                <>
                  <div className="field">
                    <label>How to fill it</label>
                    <select
                      value={c.mode}
                      onChange={(e) => setSlot(slot, { mode: e.target.value as PlanConfig[Slot]['mode'] })}
                    >
                      <option value="random">Random meal</option>
                      <option value="base">By base ingredient</option>
                      <option value="exact">Pick exact meal</option>
                    </select>
                  </div>
                  {c.mode === 'base' && (
                    <div className="field">
                      <label>Base ingredient</label>
                      <input
                        value={c.base ?? ''}
                        onChange={(e) => setSlot(slot, { base: e.target.value })}
                        placeholder="e.g. chicken, eggs, yogurt"
                      />
                    </div>
                  )}
                  {c.mode === 'exact' && (
                    <div className="field">
                      <label>Meal</label>
                      <select
                        value={c.recipeId ?? ''}
                        onChange={(e) => setSlot(slot, { recipeId: e.target.value })}
                      >
                        <option value="">Select a meal…</option>
                        {eligible.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
        <div className="panel grid2">
          <button className="ghost" onClick={() => setStep('targets')}>Back</button>
          <button className="primary" onClick={generate}>Generate plan</button>
        </div>
      </section>
    )
  }

  // ----- Step 3: review draft -----
  if (!plan) return null

  if (changing) {
    const slot = changing
    return (
      <MealSearch
        slot={slot}
        recipes={recipes}
        onCancel={() => setChanging(null)}
        onPick={(r) => {
          setPlan((p) => (p ? { ...p, slots: { ...p.slots, [slot]: r.id } } : p))
          setDirty(true)
          setChanging(null)
        }}
      />
    )
  }

  const presentSlots = SLOTS.filter((s) => plan.slots[s])

  const recalc = () => {
    setPlan((p) => (p ? recalcScales(recipes, p, targets) : p))
    setDirty(false)
  }

  return (
    <section>
      <div className="panel">
        <div className="row-between">
          <h2>Review plan</h2>
          <button className="link" onClick={onCancel}>Cancel</button>
        </div>
        <p className="muted small">Step 3 of 3 · Swap any meal, then approve</p>
      </div>
      {presentSlots.map((slot) => (
        <div key={slot}>
          <MealCard
            slotLabel={SLOT_LABELS[slot]}
            recipe={recipesById.get(plan.slots[slot]!)}
            scale={plan.scales[slot]}
          />
          <div className="panel change-row">
            <button className="link" onClick={() => setChanging(slot)}>Change this meal</button>
          </div>
        </div>
      ))}
      <div className="panel">
        {dirty ? (
          <button className="primary" onClick={recalc}>Recalculate portions</button>
        ) : (
          <button className="primary" onClick={() => onApprove(plan)}>Approve meal plan</button>
        )}
      </div>
    </section>
  )
}
