#!/usr/bin/env node
/**
 * PatMail 架构边界静态分析与门禁检查（pnpm architecture:check）。
 *
 * 使用 TypeScript Compiler API 与 Vue SFC 编译器解析真实 AST 依赖，区分：
 *   - 运行时静态 import / re-export / dynamic import / require
 *   - Type-only import / export
 *   - Vite import.meta.glob 与 Chrome Runtime 消息通道依赖
 *
 * 检查六项核心架构规则（支持历史例外棘轮控制，严禁新增违规与新增循环依赖）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { parse: parseSfc } = require('vue/compiler-sfc')

const scriptRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const repoRoot = dirname(scriptRoot)

const CORE_DOMAIN_FILES = new Set([
  'billing/fee-model.ts',
  'mail/assemble.ts',
  'mail/bill-detector.ts',
  'mail/deduplicate.ts',
  'mail/fingerprint.ts',
  'mail/planner.ts',
  'mail/preview.ts',
  'mail/selection.ts',
  'hague/plan-identity.ts',
  'hague/draft-recovery.ts',
  'hague/action-state.ts',
  'workflow/reviewer-resolver.ts',
])

const BILLING_FORBIDDEN_IN_PAGE = new Set([
  'billing/fee-model.ts',
  'billing/pbc-rates.ts',
  'billing/template-assets.ts',
  'billing/templates.ts',
  'billing/xlsx-engine.ts',
  'recovery/client.ts',
])

const AGENT_FORBIDDEN_BUSINESS_MODULES = new Set([
  'customer/limit-mail-submit.ts',
  'mail/assemble.ts',
  'customer/workflow-mail.ts',
  'customer/pct-recipients.ts',
  'workflow/reviewer-resolver.ts',
])

const ZERO_CYCLE_PREFIXES = ['application/', 'domain/', 'agent/tools/', 'billing/']
const ZERO_CYCLE_FILES = new Set(['hague/gateway.ts', 'background/message-registry.ts'])

const HAGUE_PRODUCTION_RUNNERS = new Set([
  'hague/draft-runner.ts',
  'hague/draft-batch.ts',
  'hague/plan-identity.ts',
  'hague/draft-recovery.ts',
  'hague/gateway.ts',
])

function walkSourceFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'assets' || entry.name === 'node_modules') continue
      walkSourceFiles(full, out)
    } else if (/\.(ts|js|mjs|vue)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

function resolveRelativeTarget(fromFile, specifier, srcRoot) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.vue`,
    join(base, 'index.ts'),
    join(base, 'index.js'),
    join(base, 'index.mjs'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      const relPath = relative(srcRoot, candidate).replaceAll('\\', '/')
      if (!relPath.startsWith('..')) return relPath
      return `../${relPath}`
    }
  }
  return null
}

function topModule(file) {
  if (!file.includes('/')) return 'root'
  const parts = file.split('/')
  if (parts[0] === 'application' && parts.length > 2) return `application/${parts[1]}`
  if (parts[0] === 'app' && parts.length > 2) return `app/${parts[1]}`
  return parts[0]
}

function detectLayer(file) {
  if (file.startsWith('app/') || file.startsWith('floating/') || file.startsWith('popup/') || file.startsWith('shell/')) {
    return 'Presentation'
  }
  if (file.startsWith('agent/') || file === 'background/agent.ts') {
    return 'Agent'
  }
  if (file.startsWith('application/')) {
    return 'Application'
  }
  if (file.startsWith('domain/') || CORE_DOMAIN_FILES.has(file)) {
    return 'Domain'
  }
  if (file.startsWith('background/') || file.startsWith('content/') || file.startsWith('api/') || file.startsWith('recovery/') || file.startsWith('storage/') || file.startsWith('browser-download/') || file === 'billing/xlsx-engine.ts' || file === 'billing/template-assets.ts' || file === 'billing/pbc-rates.ts') {
    return 'Infrastructure'
  }
  if (file.startsWith('shared/') || file.startsWith('utils/') || file.startsWith('schema/') || file.startsWith('settings/')) {
    return 'Shared'
  }
  return 'BusinessModule'
}

function scanScriptAst(file, srcRoot, code, lineOffset, edges, runtimeSignals) {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const from = relative(srcRoot, file).replaceAll('\\', '/')

  const addEdge = (specifier, kind, isTypeOnly, node) => {
    const to = resolveRelativeTarget(file, specifier, srcRoot)
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    edges.push({
      from,
      to,
      specifier,
      kind,
      isTypeOnly,
      line: line + 1 + lineOffset,
      external: !specifier.startsWith('.'),
    })
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      let isTypeOnly = Boolean(clause?.isTypeOnly)
      if (!isTypeOnly && clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        const elems = clause.namedBindings.elements
        if (elems.length > 0 && elems.every(el => el.isTypeOnly)) isTypeOnly = true
      }
      addEdge(node.moduleSpecifier.text, 'static-import', isTypeOnly, node)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      addEdge(node.moduleSpecifier.text, 're-export', Boolean(node.isTypeOnly), node)
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
        addEdge(node.arguments[0].text, 'dynamic-import', false, node)
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
        addEdge(node.arguments[0].text, 'require', false, node)
      } else if (ts.isPropertyAccessExpression(node.expression) && node.expression.getText(sf) === 'import.meta.glob') {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
        runtimeSignals.push({ from, type: 'vite-glob', detail: node.arguments[0]?.getText(sf) ?? '', line: line + 1 + lineOffset })
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      const text = node.getText(sf)
      if (/^MessageType\.[A-Za-z0-9_]+$/.test(text) || /^chrome\.(?:runtime|tabs|storage|downloads)\.[A-Za-z0-9_]+$/.test(text)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
        runtimeSignals.push({
          from,
          type: text.startsWith('MessageType.') ? 'message-type' : 'chrome-api',
          detail: text,
          line: line + 1 + lineOffset,
        })
      } else if (/^(?:document|window)\.[A-Za-z0-9_]+$/.test(text)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
        runtimeSignals.push({ from, type: 'dom-api', detail: text, line: line + 1 + lineOffset })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

function findRuntimeCycles(nodes, runtimeEdges) {
  const adj = new Map()
  for (const edge of runtimeEdges) {
    if (!edge.to || edge.to.startsWith('..')) continue
    if (!adj.has(edge.from)) adj.set(edge.from, new Set())
    adj.get(edge.from).add(edge.to)
  }

  let index = 0
  const indices = new Map()
  const lowlink = new Map()
  const stack = []
  const onStack = new Set()
  const cycles = []

  function strongConnect(v) {
    indices.set(v, index)
    lowlink.set(v, index)
    index += 1
    stack.push(v)
    onStack.add(v)

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w)
        lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w)))
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v), indices.get(w)))
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc = []
      let w
      do {
        w = stack.pop()
        onStack.delete(w)
        scc.push(w)
      } while (w !== v)
      if (scc.length > 1 || (scc.length === 1 && adj.get(v)?.has(v))) {
        cycles.push(scc.sort())
      }
    }
  }

  for (const node of nodes) {
    if (!indices.has(node)) strongConnect(node)
  }
  return cycles
}

export function scanProjectDependencies(extensionRoot = scriptRoot) {
  const srcRoot = join(extensionRoot, 'src')
  const files = walkSourceFiles(srcRoot).sort()
  const relFiles = files.map(f => relative(srcRoot, f).replaceAll('\\', '/'))

  const edges = []
  const runtimeSignals = []

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    if (file.endsWith('.vue')) {
      const { descriptor } = parseSfc(source)
      if (descriptor.script) {
        scanScriptAst(file, srcRoot, descriptor.script.content, descriptor.script.loc.start.line - 1, edges, runtimeSignals)
      }
      if (descriptor.scriptSetup) {
        scanScriptAst(file, srcRoot, descriptor.scriptSetup.content, descriptor.scriptSetup.loc.start.line - 1, edges, runtimeSignals)
      }
    } else {
      scanScriptAst(file, srcRoot, source, 0, edges, runtimeSignals)
    }
  }

  const runtimeInternalEdges = edges.filter(edge => !edge.isTypeOnly && edge.to && !edge.to.startsWith('..'))
  const cycles = findRuntimeCycles(relFiles, runtimeInternalEdges)

  const matrix = {}
  for (const edge of runtimeInternalEdges) {
    const fromMod = topModule(edge.from)
    const toMod = topModule(edge.to)
    if (fromMod === toMod) continue
    matrix[fromMod] ??= {}
    matrix[fromMod][toMod] = (matrix[fromMod][toMod] ?? 0) + 1
  }

  return {
    scannedAt: new Date().toISOString(),
    srcRoot: relative(repoRoot, srcRoot).replaceAll('\\', '/'),
    fileCount: relFiles.length,
    files: relFiles.map(file => ({ file, layer: detectLayer(file), module: topModule(file) })),
    summary: {
      totalEdges: edges.length,
      runtimeInternalEdges: runtimeInternalEdges.length,
      typeOnlyEdges: edges.filter(edge => edge.isTypeOnly).length,
      externalImports: [...new Set(edges.filter(edge => edge.external).map(edge => edge.specifier))].sort(),
      cycleCount: cycles.length,
    },
    cycles,
    matrix,
    edges,
    runtimeSignals,
  }
}

export function evaluateArchitecture(inventory) {
  const violations = []
  const runtimeEdges = inventory.edges.filter(edge => !edge.isTypeOnly)
  const internalRuntime = runtimeEdges.filter(edge => edge.to && !edge.to.startsWith('..'))

  // Rule A: Domain Purity
  for (const edge of runtimeEdges) {
    const isDomain = edge.from.startsWith('domain/') || CORE_DOMAIN_FILES.has(edge.from)
    if (!isDomain) continue
    if (edge.specifier === 'vue' || edge.specifier.startsWith('vue/')) {
      violations.push({
        id: `domain-vue:${edge.from}->${edge.specifier}`,
        rule: 'A-domain-purity',
        severity: 'error',
        from: edge.from,
        to: edge.specifier,
        line: edge.line,
        reason: 'Domain 模块不得直接导入 Vue',
      })
    }
    if (edge.to && /^(app|floating|popup|shell|background|content)\//.test(edge.to)) {
      violations.push({
        id: `domain-layer:${edge.from}->${edge.to}`,
        rule: 'A-domain-purity',
        severity: 'error',
        from: edge.from,
        to: edge.to,
        line: edge.line,
        reason: 'Domain 模块不得直接依赖 Presentation / Background / Content 运行时层',
      })
    }
  }
  for (const signal of inventory.runtimeSignals) {
    const isDomain = signal.from.startsWith('domain/') || CORE_DOMAIN_FILES.has(signal.from)
    if (!isDomain) continue
    if (signal.type === 'chrome-api' || signal.type === 'dom-api') {
      violations.push({
        id: `domain-runtime-api:${signal.from}:${signal.detail}`,
        rule: 'A-domain-purity',
        severity: 'error',
        from: signal.from,
        to: signal.detail,
        line: signal.line,
        reason: `Domain 模块不得直接访问浏览器或 DOM API（${signal.detail}）`,
      })
    }
  }

  // Rule B: Application -> Presentation
  for (const edge of internalRuntime) {
    if (!edge.from.startsWith('application/')) continue
    if (edge.to.endsWith('.vue') || /^(app|floating|popup|shell)\//.test(edge.to)) {
      violations.push({
        id: `app-to-ui:${edge.from}->${edge.to}`,
        rule: 'B-application-no-ui',
        severity: 'error',
        from: edge.from,
        to: edge.to,
        line: edge.line,
        reason: 'Application 服务不得依赖 Vue 组件或 Presentation 界面模块',
      })
    }
  }

  // Rule C: Agent -> Direct Domain / Business Submission Bypass
  for (const edge of internalRuntime) {
    const isAgent = edge.from.startsWith('agent/') || edge.from === 'background/agent.ts'
    if (!isAgent) continue
    if (AGENT_FORBIDDEN_BUSINESS_MODULES.has(edge.to)) {
      violations.push({
        id: `agent-domain-bypass:${edge.from}->${edge.to}`,
        rule: 'C-agent-through-application',
        severity: 'ratchet',
        from: edge.from,
        to: edge.to,
        line: edge.line,
        reason: 'Agent 层应通过 MailApplicationService 调用发文/审核人/邮编规则，不得直接耦合领域实现',
      })
    }
  }

  // Rule D: Presentation -> Direct Billing Execution Infrastructure
  for (const edge of internalRuntime) {
    if (edge.from !== 'app/pages/BillingWorkflowPage.vue') continue
    if (BILLING_FORBIDDEN_IN_PAGE.has(edge.to)) {
      violations.push({
        id: `billing-page-direct:${edge.from}->${edge.to}`,
        rule: 'D-presentation-no-direct-infra',
        severity: 'ratchet',
        from: edge.from,
        to: edge.to,
        line: edge.line,
        reason: 'BillingWorkflowPage.vue 应通过 useBillingWorkflow 调用 BillingApplicationService，不得直接依赖 Excel/汇率/恢复基础设施',
      })
    }
  }

  // Rule E: Target Scope Circular Dependencies
  for (const cycle of inventory.cycles) {
    const touchesStrictScope = cycle.some(
      file => ZERO_CYCLE_PREFIXES.some(prefix => file.startsWith(prefix)) || ZERO_CYCLE_FILES.has(file),
    )
    if (touchesStrictScope) {
      violations.push({
        id: `cycle:${cycle.join('<->')}`,
        rule: 'E-no-cycles',
        severity: 'error',
        from: cycle[0],
        to: cycle.join(' -> '),
        line: 1,
        reason: '目标架构模块间不允许出现运行时循环依赖',
      })
    }
  }

  // Rule F: Cross-Runtime Isolation (MV3 + Hague Diagnostics AST)
  for (const edge of internalRuntime) {
    if (edge.from.startsWith('background/') && (edge.to.startsWith('content/') || edge.to.endsWith('.vue'))) {
      violations.push({
        id: `bg-to-dom:${edge.from}->${edge.to}`,
        rule: 'F-runtime-isolation',
        severity: 'error',
        from: edge.from,
        to: edge.to,
        line: edge.line,
        reason: 'Service Worker (background/) 不得导入 Content Script 或 Vue 组件',
      })
    }
    if (edge.from.startsWith('content/') && edge.to.startsWith('background/')) {
      violations.push({
        id: `content-to-bg:${edge.from}->${edge.to}`,
        rule: 'F-runtime-isolation',
        severity: 'error',
        from: edge.from,
        to: edge.to,
        line: edge.line,
        reason: 'Content Script 不得直接导入 Service Worker 运行时模块，必须通过消息协议通信',
      })
    }
    if (HAGUE_PRODUCTION_RUNNERS.has(edge.from) && edge.to.startsWith('hague/diagnostics/ast/')) {
      violations.push({
        id: `hague-runner-to-ast:${edge.from}->${edge.to}`,
        rule: 'F-runtime-isolation',
        severity: 'error',
        from: edge.from,
        to: edge.to,
        line: edge.line,
        reason: '海牙生产流程编排层不得直接依赖 AST 诊断分析器',
      })
    }
  }

  return violations
}

export function checkArchitecture({ writeBaseline = false, writeDocs = false, extensionRoot = scriptRoot } = {}) {
  const inventory = scanProjectDependencies(extensionRoot)
  const violations = evaluateArchitecture(inventory)
  const baselinePath = join(extensionRoot, 'ci', 'architecture-baseline.json')
  const reportDir = join(extensionRoot, 'test-results', 'ci')
  mkdirSync(reportDir, { recursive: true })

  if (writeDocs) {
    const slimInventory = {
      scannedAt: inventory.scannedAt,
      fileCount: inventory.fileCount,
      summary: inventory.summary,
      cycles: inventory.cycles,
      matrix: inventory.matrix,
      files: inventory.files,
      violations,
    }
    for (const dir of [join(repoRoot, 'docs', 'architecture'), join(extensionRoot, 'docs', 'architecture')]) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'dependency-inventory.json'), `${JSON.stringify(slimInventory, null, 2)}\n`)
    }
  }

  if (writeBaseline) {
    const ratchetIds = [...new Set(violations.filter(v => v.severity === 'ratchet').map(v => v.id))].sort()
    const payload = {
      meta: {
        generatedAt: new Date().toISOString(),
        note: '架构重构棘轮基线：只允许随着迁移减少直至归零，严禁新增任何违规或循环依赖。',
      },
      cycleCount: inventory.cycles.length,
      ratchetViolationIds: ratchetIds,
    }
    mkdirSync(dirname(baselinePath), { recursive: true })
    writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`)
  }

  const baseline = existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, 'utf8'))
    : { cycleCount: 0, ratchetViolationIds: [] }

  const hardErrors = violations.filter(v => v.severity === 'error')
  const allowedIds = new Set(baseline.ratchetViolationIds ?? [])
  const newRatchetViolations = violations.filter(v => v.severity === 'ratchet' && !allowedIds.has(v.id))
  const staleBaselineIds = [...allowedIds].filter(id => !violations.some(v => v.id === id))
  const cycleRegression = inventory.cycles.length > (baseline.cycleCount ?? 0)

  const report = {
    generatedAt: new Date().toISOString(),
    fileCount: inventory.fileCount,
    runtimeInternalEdges: inventory.summary.runtimeInternalEdges,
    typeOnlyEdges: inventory.summary.typeOnlyEdges,
    cycleCount: inventory.cycles.length,
    hardErrors,
    newRatchetViolations,
    remainingRatchetViolations: violations.filter(v => v.severity === 'ratchet'),
    staleBaselineIds,
    passed: hardErrors.length === 0 && newRatchetViolations.length === 0 && !cycleRegression,
  }

  writeFileSync(join(reportDir, 'architecture-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  return report
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = checkArchitecture({
    writeBaseline: process.argv.includes('--write-baseline'),
    writeDocs: process.argv.includes('--write-docs'),
  })
  console.log(
    `Architecture check: ${report.fileCount} files, ${report.runtimeInternalEdges} runtime edges, ${report.cycleCount} cycles, ${report.hardErrors.length} hard errors, ${report.remainingRatchetViolations.length} tracked legacy violations.`,
  )
  if (report.staleBaselineIds.length > 0) {
    console.log(`提示：已清理 ${report.staleBaselineIds.length} 项历史违规，请运行 node scripts/architecture-check.mjs --write-baseline 收紧基线。`)
  }
  if (!report.passed) {
    for (const v of [...report.hardErrors, ...report.newRatchetViolations]) {
      console.error(`✗ [${v.rule}] ${v.from}:${v.line} -> ${v.to} (${v.reason})`)
    }
    process.exitCode = 1
  }
}
