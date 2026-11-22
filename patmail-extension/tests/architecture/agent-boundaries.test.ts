import { describe, expect, it } from 'vitest'
import { checkArchitecture } from '../../scripts/architecture-check.mjs'

describe('agent layer boundaries', () => {
  it('prevents any new direct domain bypasses from Agent layer', () => {
    const report = checkArchitecture()
    const newAgentViolations = report.newRatchetViolations.filter(v => v.rule === 'C-agent-through-application')
    expect(newAgentViolations).toEqual([])
  })
})
