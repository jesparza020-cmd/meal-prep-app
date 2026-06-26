import { useEffect, useMemo, useState } from 'react'
import type { AppState, Recipe, Targets, WeekPlan } from './types'
import { effectiveRecipes, loadState, saveState } from './state/storage'
import { TargetsForm } from './components/TargetsForm'
import { PlanTab } from './components/PlanTab'
import { Meals } from './components/Meals'
import { History } from './components/History'

type Tab = 'plan' | 'meals' | 'targets' | 'history'

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [tab, setTab] = useState<Tab>(() => (loadState().targets ? 'plan' : 'targets'))

  useEffect(() => {
    saveState(state)
  }, [state])

  const recipes = useMemo(() => effectiveRecipes(state), [state])
  const recipesById = useMemo(
    () => new Map(recipes.map((r) => [r.id, r])),
    [recipes],
  )

  const setTargets = (t: Targets) => {
    setState((s) => ({ ...s, targets: t }))
    setTab('plan')
  }

  const approvePlan = (plan: WeekPlan) =>
    setState((s) => ({ ...s, history: [...s.history, plan] }))

  const addRecipe = (r: Recipe) =>
    setState((s) => ({ ...s, customRecipes: [...s.customRecipes, r] }))

  const updateRecipe = (original: Recipe, updated: Recipe) =>
    setState((s) => {
      if (original.source === 'seed') {
        return {
          ...s,
          deletedSeedIds: [...new Set([...s.deletedSeedIds, original.id])],
          customRecipes: [...s.customRecipes, { ...updated, source: 'custom' }],
        }
      }
      return {
        ...s,
        customRecipes: s.customRecipes.map((r) => (r.id === original.id ? updated : r)),
      }
    })

  const deleteRecipe = (r: Recipe) =>
    setState((s) =>
      r.source === 'seed'
        ? { ...s, deletedSeedIds: [...new Set([...s.deletedSeedIds, r.id])] }
        : { ...s, customRecipes: s.customRecipes.filter((x) => x.id !== r.id) },
    )

  const current = state.history[state.history.length - 1] ?? null

  return (
    <div className="app">
      <header className="topbar">
        <h1>🍱 Meal Prep Planner</h1>
      </header>

      <main className="content">
        {tab === 'plan' && (
          <PlanTab
            plan={current}
            targets={state.targets}
            recipes={recipes}
            recipesById={recipesById}
            history={state.history}
            onApprove={approvePlan}
            onGoToTargets={() => setTab('targets')}
          />
        )}
        {tab === 'targets' && (
          <TargetsForm initial={state.targets} onSave={setTargets} />
        )}
        {tab === 'meals' && (
          <Meals
            recipes={recipes}
            onAdd={addRecipe}
            onUpdate={updateRecipe}
            onDelete={deleteRecipe}
          />
        )}
        {tab === 'history' && (
          <History history={state.history} recipesById={recipesById} />
        )}
      </main>

      <nav className="tabbar">
        <button className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}>
          <span>📅</span>Plan
        </button>
        <button className={tab === 'meals' ? 'active' : ''} onClick={() => setTab('meals')}>
          <span>🥗</span>Meals
        </button>
        <button className={tab === 'targets' ? 'active' : ''} onClick={() => setTab('targets')}>
          <span>🎯</span>Targets
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          <span>🕓</span>History
        </button>
      </nav>
    </div>
  )
}
