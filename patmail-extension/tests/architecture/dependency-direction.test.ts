import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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

it('distinguishes mixed default imports from type-only imports and re-exports', () => {
  withSources(
    {
      'application/service.ts': `import page, { type Page } from '../app/page'
export { type Page } from '../app/page'
type Contract = import('../app/page').Page
const load = () => import(\`../app/page\`)`,
      'app/page.ts': 'export type Page = string; export default 1',
    },
    root => {
      const inventory = scanProjectDependencies(root)
      expect(inventory.edges.map(edge => edge.isTypeOnly)).toEqual([false, true, true, false])
      expect(evaluateArchitecture(inventory).filter(v => v.rule === 'B-application-no-ui')).toHaveLength(2)
    },
  )
})

it('tracks external Vue script blocks and billing infrastructure imports', () => {
  withSources(
    {
      'app/pages/BillingWorkflowPage.vue': '<script src="../../infrastructure/billing/adapter.ts"></script>',
      'infrastructure/billing/adapter.ts': 'export default {}',
    },
    root => {
      const inventory = scanProjectDependencies(root)
      expect(inventory.files).toContainEqual({
        file: 'infrastructure/billing/adapter.ts',
        layer: 'Infrastructure',
        module: 'infrastructure',
      })
      expect(evaluateArchitecture(inventory)).toEqual([
        expect.objectContaining({ rule: 'D-presentation-no-direct-infra', to: 'infrastructure/billing/adapter.ts' }),
      ])
    },
  )
})

it('reports cycle count regressions outside the strict scope', () => {
  withSources(
    {
      'shared/a.ts': "import './b'",
      'shared/b.ts': "import './a'",
    },
    root => {
      expect(checkArchitecture({ extensionRoot: root })).toMatchObject({
        passed: false,
        cycleRegression: true,
        cycleCount: 1,
        baselineCycleCount: 0,
      })
    },
  )
})

function withSources(sources: Record<string, string>, run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'patmail-architecture-'))
  try {
    for (const [name, contents] of Object.entries(sources)) {
      const path = join(root, 'src', name)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, contents)
    }
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
