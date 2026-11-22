import { describe, expect, it } from 'vitest'
import { checkArchitecture, evaluateArchitecture, scanProjectDependencies } from '../../scripts/architecture-check.mjs'

describe('architecture dependency direction', () => {
  it('passes overall architecture ratchet check without hard errors or new violations', () => {
    const report = checkArchitecture()
    expect(report.hardErrors).toEqual([])
    expect(report.newRatchetViolations).toEqual([])
    expect(report.passed).toBe(true)
  })

  it('forbids Application layer from importing Presentation or Vue components', () => {
    const inventory = scanProjectDependencies()
    const violations = evaluateArchitecture(inventory).filter(v => v.rule === 'B-application-no-ui')
    expect(violations).toEqual([])
  })

  it('maintains zero runtime circular dependencies across the codebase', () => {
    const inventory = scanProjectDependencies()
    expect(inventory.cycles).toEqual([])
    const cycleViolations = evaluateArchitecture(inventory).filter(v => v.rule === 'E-no-cycles')
    expect(cycleViolations).toEqual([])
  })
})
