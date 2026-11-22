import { describe, expect, it } from 'vitest'
import { checkArchitecture } from '../../scripts/architecture-check.mjs'

describe('billing presentation boundaries', () => {
  it('prevents any new direct infrastructure coupling in BillingWorkflowPage.vue', () => {
    const report = checkArchitecture()
    const newBillingViolations = report.newRatchetViolations.filter(
      v => v.rule === 'D-presentation-no-direct-infra',
    )
    expect(newBillingViolations).toEqual([])
  })
})
