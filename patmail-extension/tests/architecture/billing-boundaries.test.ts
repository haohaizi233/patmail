import { describe, expect, it } from 'vitest'
import { evaluateArchitecture, scanProjectDependencies } from '../../scripts/architecture/architecture-check.mjs'

describe('billing presentation boundaries', () => {
  it('ensures BillingWorkflowPage.vue has zero direct infrastructure or billing engine coupling', () => {
    const inventory = scanProjectDependencies()
    const billingViolations = evaluateArchitecture(inventory).filter(
      v => v.rule === 'D-presentation-no-direct-infra',
    )
    expect(billingViolations).toEqual([])
  })
})
