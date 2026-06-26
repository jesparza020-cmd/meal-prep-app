import { useState } from 'react'
import type { Recipe, Targets, WeekPlan } from '../types'
import { PlanView } from './PlanView'
import { NewPlanWizard } from './NewPlanWizard'

export function PlanTab({
  plan,
  targets,
  recipes,
  recipesById,
  history,
  onApprove,
  onGoToTargets,
}: {
  plan: WeekPlan | null
  targets: Targets | null
  recipes: Recipe[]
  recipesById: Map<string, Recipe>
  history: WeekPlan[]
  onApprove: (p: WeekPlan) => void
  onGoToTargets: () => void
}) {
  const [wizard, setWizard] = useState(false)

  if (wizard && targets) {
    return (
      <NewPlanWizard
        recipes={recipes}
        targets={targets}
        history={history}
        onCancel={() => setWizard(false)}
        onGoToTargets={onGoToTargets}
        onApprove={(p) => {
          onApprove(p)
          setWizard(false)
        }}
      />
    )
  }

  return (
    <PlanView
      plan={plan}
      targets={targets}
      recipesById={recipesById}
      onNewPlan={() => setWizard(true)}
      onGoToTargets={onGoToTargets}
    />
  )
}
