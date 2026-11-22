import { describe, expect, it } from 'vitest'
import { COMPOSITION_ROOTS, evaluateArchitecture, scanProjectDependencies } from '../../scripts/architecture-check.mjs'

describe('MV3 and protocol runtime boundaries', () => {
  it('enforces strict isolation for MV3 runtimes, Application ports, Hague protocol kernel, unresolved imports, and composition roots', () => {
    const inventory = scanProjectDependencies()
    const violations = evaluateArchitecture(inventory)
    expect(violations.filter(v => v.rule === 'F-runtime-isolation')).toEqual([])
    expect(violations.filter(v => v.rule === 'H-application-no-transport-leak')).toEqual([])
    expect(violations.filter(v => v.rule === 'I-hague-protocol-vs-diagnostics')).toEqual([])
    expect(violations.filter(v => v.rule === 'J-no-unresolved-internal-imports')).toEqual([])
    expect(violations.filter(v => v.rule === 'K-composition-root-registry')).toEqual([])
    expect(inventory.unresolvedImports ?? []).toEqual([])
    expect([...COMPOSITION_ROOTS.keys()].sort()).toEqual([
      'app/composables/useBillingWorkflow.ts',
      'background/agent.ts',
    ])
  })
})
