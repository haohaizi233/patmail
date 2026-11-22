import { describe, expect, it } from 'vitest'
import { evaluateArchitecture, scanProjectDependencies } from '../../scripts/architecture-check.mjs'

describe('MV3 and protocol runtime boundaries', () => {
  it('enforces strict isolation between Service Worker, Content Script, and Hague AST analyzer', () => {
    const inventory = scanProjectDependencies()
    const runtimeViolations = evaluateArchitecture(inventory).filter(v => v.rule === 'F-runtime-isolation')
    expect(runtimeViolations).toEqual([])
  })
})
