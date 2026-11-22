import { describe, expect, it } from 'vitest'
import { evaluateArchitecture, scanProjectDependencies } from '../../scripts/architecture-check.mjs'

describe('domain layer purity', () => {
  it('ensures core domain modules do not runtime-import Vue, UI, Background, Content or DOM/Chrome APIs', () => {
    const inventory = scanProjectDependencies()
    const domainViolations = evaluateArchitecture(inventory).filter(v => v.rule === 'A-domain-purity')
    expect(domainViolations).toEqual([])
  })
})
