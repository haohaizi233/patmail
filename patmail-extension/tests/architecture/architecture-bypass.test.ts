import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  evaluateArchitecture,
  scanProjectDependencies,
  type ProjectInventory,
} from '../../scripts/architecture-check.mjs'

function makeInventory(partial: Partial<ProjectInventory> = {}): ProjectInventory {
  return {
    scannedAt: '2026-11-22T00:00:00.000Z',
    srcRoot: 'patmail-extension/src',
    fileCount: 0,
    files: [],
    summary: {
      totalEdges: 0,
      runtimeInternalEdges: 0,
      typeOnlyEdges: 0,
      externalImports: [],
      cycleCount: 0,
      unresolvedImportCount: 0,
    },
    cycles: [],
    unresolvedImports: [],
    matrix: {},
    edges: [],
    runtimeSignals: [],
    ...partial,
  }
}

function runtimeEdge(from: string, to: string, kind: 'static-import' | 're-export' = 'static-import', line = 1) {
  return { from, to, specifier: `./${to}`, kind, isTypeOnly: false, line, external: false }
}

describe('architecture gate negative & bypass resistance tests', () => {
  it('guards file and deadline entry points, including composables and transitive barrels', () => {
    const violations = evaluateArchitecture(
      makeInventory({
        edges: [
          runtimeEdge('app/components/FileManageMail.vue', 'customer/file-manage-submit.ts'),
          runtimeEdge('app/pages/LimitsPage.vue', 'customer/letters.ts'),
          runtimeEdge('customer/letters.ts', 'customer/limit-mail-submit.ts', 're-export'),
          runtimeEdge('app/composables/useBypass.ts', 'customer/file-manage-plan.ts'),
          { ...runtimeEdge('app/composables/useBypass.ts', 'customer/file-manage-submit.ts'), isTypeOnly: true },
        ],
      }),
    )
    expect(violations.filter(v => v.rule === 'G-mail-ui-through-application').map(v => [v.from, v.to])).toEqual([
      ['app/components/FileManageMail.vue', 'customer/file-manage-submit.ts'],
      ['app/pages/LimitsPage.vue', 'customer/limit-mail-submit.ts'],
      ['app/composables/useBypass.ts', 'customer/file-manage-plan.ts'],
    ])
  })

  it('resolves inherited JSONC aliases with exact and longest-prefix precedence', () => {
    withFixture(
      {
        'config/base.json': `{
        // TypeScript config comments and trailing commas are valid.
        "compilerOptions": {
          "paths": {
            "@/*": ["../src/shared/*"],
            "@/billing/*": ["../src/infrastructure/billing/*"],
            "@/exact": ["../src/infrastructure/billing/adapter.mts"],
          },
        },
      }`,
        'tsconfig.json': '{"extends":"./config/base.json"}',
        'src/app/pages/Future.vue': `<script setup lang="ts">
        import '@/billing/adapter.mjs?raw#section'
        import '@/exact'
      </script>`,
        'src/shared/billing/adapter.mjs': 'export {}',
        'src/shared/exact.ts': 'export {}',
        'src/infrastructure/billing/adapter.mts': 'export {}',
      },
      root => {
        const inventory = scanProjectDependencies(root)
        expect(inventory.unresolvedImports).toEqual([])
        expect(inventory.edges.map(edge => edge.to)).toEqual(Array(2).fill('infrastructure/billing/adapter.mts'))
        expect(evaluateArchitecture(inventory).filter(v => v.rule === 'K-composition-root-registry')).toHaveLength(2)
      },
    )
  })

  it('checks module variants and records browser dependencies through global and bracket access', () => {
    withFixture(
      {
        'src/application/leak.mts': `import './service.cjs'
        globalThis.chrome?.offscreen?.createDocument({})
        chrome['downloads'].search({})
        globalThis.document.querySelector('main')
      `,
        'src/application/service.cts': "import './leak.mjs'",
      },
      root => {
        const inventory = scanProjectDependencies(root)
        expect(inventory.unresolvedImports).toEqual([])
        expect(inventory.cycles).toEqual([['application/leak.mts', 'application/service.cts']])
        expect(evaluateArchitecture(inventory).filter(v => v.rule === 'H-application-no-transport-leak')).toHaveLength(
          3,
        )
      },
    )
  })

  it('blocks newly added pages and unregistered composables from importing infrastructure or billing engines', () => {
    const violations = evaluateArchitecture(
      makeInventory({
        edges: [
          runtimeEdge(
            'app/pages/FutureReportPage.vue',
            'infrastructure/billing/billing-adapters.ts',
            'static-import',
            3,
          ),
          runtimeEdge('app/pages/FutureReportPage.vue', 'billing/xlsx-engine.ts', 'static-import', 4),
          runtimeEdge(
            'app/composables/useAdHocHelper.ts',
            'infrastructure/mail/easy-mail-gateway-adapter.ts',
            'static-import',
            2,
          ),
        ],
      }),
    )
    const byRule = (from: string, rule: string) => violations.some(v => v.from === from && v.rule === rule)
    expect(byRule('app/pages/FutureReportPage.vue', 'D-presentation-no-direct-infra')).toBe(true)
    expect(byRule('app/pages/FutureReportPage.vue', 'K-composition-root-registry')).toBe(true)
    expect(byRule('app/composables/useAdHocHelper.ts', 'D-presentation-no-direct-infra')).toBe(true)
    expect(byRule('app/composables/useAdHocHelper.ts', 'K-composition-root-registry')).toBe(true)
  })

  it('catches Agent and Mail UI domain bypasses routed transitively through a barrel re-export', () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'patmail-arch-barrel-'))
    try {
      mkdirSync(join(tmpRoot, 'src', 'agent', 'tools'), { recursive: true })
      mkdirSync(join(tmpRoot, 'src', 'app', 'pages'), { recursive: true })
      mkdirSync(join(tmpRoot, 'src', 'mail'), { recursive: true })
      writeFileSync(join(tmpRoot, 'src', 'mail', 'assemble.ts'), 'export function assembleMail() { return null }\n')
      writeFileSync(join(tmpRoot, 'src', 'mail', 'index.ts'), "export { assembleMail } from './bindings'\n")
      writeFileSync(
        join(tmpRoot, 'src', 'mail', 'bindings.ts'),
        "import { assembleMail as assemble } from './assemble'\nexport { assemble as assembleMail }\n",
      )
      writeFileSync(
        join(tmpRoot, 'src', 'agent', 'tools', 'bypass.ts'),
        "import { assembleMail } from '../../mail'\nexport const run = assembleMail\n",
      )
      writeFileSync(
        join(tmpRoot, 'src', 'app', 'pages', 'TasksPage.vue'),
        '<script setup lang="ts">\nimport { assembleMail } from \'../../mail\'\nvoid assembleMail\n</script>\n',
      )

      const inventory = scanProjectDependencies(tmpRoot)
      const violations = evaluateArchitecture(inventory)
      expect(
        violations.some(
          v =>
            v.from === 'agent/tools/bypass.ts' &&
            v.to === 'mail/assemble.ts' &&
            v.rule === 'C-agent-through-application',
        ),
      ).toBe(true)
      expect(
        violations.some(
          v =>
            v.from === 'app/pages/TasksPage.vue' &&
            v.to === 'mail/assemble.ts' &&
            v.rule === 'G-mail-ui-through-application',
        ),
      ).toBe(true)
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })

  it('blocks Application layer coupling to shared/message.ts or chrome.* signals', () => {
    const violations = evaluateArchitecture(
      makeInventory({
        edges: [runtimeEdge('application/mail/leak.ts', 'shared/message.ts', 'static-import', 5)],
        runtimeSignals: [
          { from: 'application/billing/leak.ts', type: 'chrome-api', detail: 'chrome.downloads.download', line: 12 },
          { from: 'application/billing/leak.ts', type: 'message-type', detail: 'MessageType.EASY_SUBMIT', line: 15 },
        ],
      }),
    )
    expect(violations.filter(v => v.rule === 'H-application-no-transport-leak').length).toBe(3)
  })

  it('blocks Hague production driver and protocol kernel from importing diagnostics AST, reports or store', () => {
    const violations = evaluateArchitecture(
      makeInventory({
        edges: [
          runtimeEdge('hague/http-driver.ts', 'hague/diagnostics/ast/analyzer.mjs', 'static-import', 3),
          runtimeEdge('hague/http-driver.ts', 'hague/diagnostics/reports.ts', 'static-import', 4),
          runtimeEdge('hague/protocol/jsf-action-extractor.ts', 'hague/diagnostics/store.ts', 'static-import', 2),
        ],
      }),
    )
    const ruleI = violations.filter(v => v.rule === 'I-hague-protocol-vs-diagnostics')
    expect(ruleI.map(v => `${v.from}->${v.to}`)).toEqual([
      'hague/http-driver.ts->hague/diagnostics/ast/analyzer.mjs',
      'hague/http-driver.ts->hague/diagnostics/reports.ts',
      'hague/protocol/jsf-action-extractor.ts->hague/diagnostics/store.ts',
    ])
  })

  it('allows pure type-only imports without false positives and rejects strict-scope runtime cycles and unresolved imports', () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'patmail-arch-cycle-'))
    try {
      mkdirSync(join(tmpRoot, 'src', 'application', 'mail'), { recursive: true })
      mkdirSync(join(tmpRoot, 'src', 'infrastructure', 'mail'), { recursive: true })
      mkdirSync(join(tmpRoot, 'src', 'hague', 'protocol'), { recursive: true })
      writeFileSync(
        join(tmpRoot, 'src', 'infrastructure', 'mail', 'adapter.ts'),
        'export interface MailPort { ok: boolean }\n',
      )
      writeFileSync(
        join(tmpRoot, 'src', 'application', 'mail', 'service.ts'),
        "import type { MailPort } from '../../infrastructure/mail/adapter'\nimport { stepB } from './cycle-b'\nexport const a = (p: MailPort) => stepB(p)\n",
      )
      writeFileSync(
        join(tmpRoot, 'src', 'application', 'mail', 'cycle-b.ts'),
        "import { a } from './service'\nexport const stepB = (x: unknown) => (x ? a : null)\n",
      )
      writeFileSync(
        join(tmpRoot, 'src', 'hague', 'protocol', 'broken.ts'),
        "import { missing } from './does-not-exist'\nexport const broken = missing\n",
      )

      const inventory = scanProjectDependencies(tmpRoot)
      const violations = evaluateArchitecture(inventory)
      expect(violations.some(v => v.rule === 'H-application-no-transport-leak')).toBe(false)
      expect(violations.some(v => v.rule === 'K-composition-root-registry')).toBe(false)
      expect(violations.some(v => v.rule === 'E-no-cycles')).toBe(true)
      expect(
        violations.some(
          v =>
            v.rule === 'J-no-unresolved-internal-imports' &&
            v.from === 'hague/protocol/broken.ts' &&
            v.to === './does-not-exist',
        ),
      ).toBe(true)
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})

function withFixture(files: Record<string, string>, run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'patmail-arch-'))
  try {
    for (const [relative, contents] of Object.entries(files)) {
      const path = join(root, relative)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, contents)
    }
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
