#!/usr/bin/env node
/**
 * PatMail 架构边界静态分析与门禁检查（pnpm architecture:check）。
 *
 * 使用 TypeScript Compiler API 与 Vue SFC 编译器解析真实 AST 依赖，区分：
 *   - 运行时静态 import / re-export / dynamic import / require
 *   - Type-only import / export
 *   - Vite import.meta.glob 与 Chrome Runtime 消息通道依赖
 *
 * 检查十一项核心架构规则（A-K，支持历史例外棘轮控制，严禁新增违规、未解析内部依赖与新增循环依赖）。
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
  'hague/protocol/ast-action-parser.mjs',
  'workflow/reviewer-resolver.ts',
])

const BILLING_ENGINE_MODULES = new Set([
  'billing/fee-model.ts',
  'billing/pbc-rates.ts',
  'billing/template-assets.ts',
  'billing/templates.ts',
  'billing/xlsx-engine.ts',
])

const AGENT_FORBIDDEN_BUSINESS_MODULES = new Set([
  'customer/limit-mail-submit.ts',
  'mail/assemble.ts',
  'customer/workflow-mail.ts',
  'customer/pct-recipients.ts',
  'workflow/reviewer-resolver.ts',
])

const MAIL_UI_PROTECTED_FILES = new Set([
  'app/pages/TasksPage.vue',
  'app/components/WorkflowMailEntry.vue',
  'app/components/FileManageMail.vue',
  'app/components/LimitMonitorQuery.vue',
  'app/pages/LimitsPage.vue',
  'floating/MailWorkspace.vue',
])

const MAIL_FORBIDDEN_IN_UI = new Set([
  'mail/assemble.ts',
  'mail/planner.ts',
  'mail/fingerprint.ts',
  'customer/limit-mail-submit.ts',
  'customer/file-manage-submit.ts',
  'customer/file-manage-plan.ts',
  'customer/workflow-mail.ts',
  'customer/pct-recipients.ts',
  'workflow/reviewer-resolver.ts',
])

const ZERO_CYCLE_PREFIXES = ['application/', 'domain/', 'agent/tools/', 'billing/', 'hague/protocol/']
const ZERO_CYCLE_FILES = new Set(['hague/gateway.ts', 'background/message-registry.ts'])

const HAGUE_PRODUCTION_MODULES = new Set([
  'hague/http-driver.ts',
  'hague/http-context.ts',
  'hague/draft-runner.ts',
  'hague/draft-batch.ts',
  'hague/draft-page.ts',
  'hague/plan-identity.ts',
  'hague/draft-recovery.ts',
  'hague/gateway.ts',
  'hague/action-state.ts',
])

const HAGUE_FORBIDDEN_DIAGNOSTICS = new Set([
  'hague/diagnostics/reports.ts',
  'hague/diagnostics/replay.ts',
  'hague/diagnostics/fixtures.ts',
  'hague/diagnostics/export.ts',
])

export const COMPOSITION_ROOTS = new Map([
  ['app/composables/useBillingWorkflow.ts', new Set(['infrastructure/billing/billing-adapters.ts'])],
  ['app/composables/useMailSubmission.ts', new Set(['infrastructure/mail/mail-letter-gateway-adapter.ts'])],
  ['background/agent.ts', new Set(['infrastructure/mail/easy-mail-gateway-adapter.ts'])],
])

function loadTsconfigPathAliases(extensionRoot) {
  const tsconfigPath = join(extensionRoot, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) return []
  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfigPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: diagnostic => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      },
    },
  )
  const options = parsed?.options
  const baseUrl = options?.baseUrl ?? options?.pathsBasePath ?? extensionRoot
  const rules = []
  for (const [pattern, targets] of Object.entries(options?.paths ?? {})) {
    const starIndex = pattern.indexOf('*')
    rules.push({
      prefix: starIndex >= 0 ? pattern.slice(0, starIndex) : pattern,
      suffix: starIndex >= 0 ? pattern.slice(starIndex + 1) : '',
      wildcard: starIndex >= 0,
      targets: targets.map(target => ({ baseUrl, target })),
    })
  }
  // Match TypeScript: exact keys win, followed by the wildcard with the longest prefix.
  return rules.sort((a, b) => Number(a.wildcard) - Number(b.wildcard) || b.prefix.length - a.prefix.length)
}

function walkSourceFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'assets' || entry.name === 'node_modules') continue
      walkSourceFiles(full, out)
    } else if (/\.(?:[cm]?[tj]s|[tj]sx|vue)$/.test(entry.name) && !/\.d\.[cm]?ts$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function stripViteImportSuffix(specifier) {
  return specifier.split(/[?#]/, 1)[0]
}

function resolveCandidateFile(base, srcRoot) {
  const substitutions = [
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.jsx$/, '.tsx'),
    base.replace(/\.mjs$/, '.mts'),
    base.replace(/\.cjs$/, '.cts'),
  ].filter(candidate => candidate !== base)
  const candidates = [
    ...substitutions,
    base,
    `${base}.ts`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.jsx`,
    `${base}.vue`,
    `${base}.d.ts`,
    join(base, 'index.ts'),
    join(base, 'index.mts'),
    join(base, 'index.cts'),
    join(base, 'index.tsx'),
    join(base, 'index.js'),
    join(base, 'index.mjs'),
    join(base, 'index.cjs'),
    join(base, 'index.jsx'),
    join(base, 'index.d.ts'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return relative(srcRoot, candidate).replaceAll('\\', '/')
    }
  }
  return null
}

function resolveImportTarget(fromFile, specifier, srcRoot, tsAliases = []) {
  const clean = stripViteImportSuffix(specifier)
  if (clean.startsWith('.')) {
    return { internalSpecifier: true, target: resolveCandidateFile(resolve(dirname(fromFile), clean), srcRoot) }
  }
  for (const rule of tsAliases) {
    if (rule.wildcard) {
      if (
        clean.length < rule.prefix.length + rule.suffix.length ||
        !clean.startsWith(rule.prefix) ||
        !clean.endsWith(rule.suffix)
      )
        continue
      const matched = clean.slice(rule.prefix.length, clean.length - rule.suffix.length)
      for (const entry of rule.targets) {
        const replaced = entry.target.includes('*') ? entry.target.replace('*', matched) : entry.target
        const resolved = resolveCandidateFile(resolve(entry.baseUrl, replaced), srcRoot)
        if (resolved) return { internalSpecifier: true, target: resolved }
      }
      return { internalSpecifier: true, target: null }
    }
    if (clean === rule.prefix) {
      for (const entry of rule.targets) {
        const resolved = resolveCandidateFile(resolve(entry.baseUrl, entry.target), srcRoot)
        if (resolved) return { internalSpecifier: true, target: resolved }
      }
      return { internalSpecifier: true, target: null }
    }
  }
  return { internalSpecifier: false, target: null }
}

function topModule(file) {
  if (!file.includes('/')) return 'root'
  const parts = file.split('/')
  if (parts[0] === 'application' && parts.length > 2) return `application/${parts[1]}`
  if (parts[0] === 'app' && parts.length > 2) return `app/${parts[1]}`
  return parts[0]
}

function detectLayer(file) {
  if (
    file.startsWith('app/') ||
    file.startsWith('floating/') ||
    file.startsWith('popup/') ||
    file.startsWith('shell/')
  ) {
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
  if (
    file.startsWith('infrastructure/') ||
    file.startsWith('background/') ||
    file.startsWith('content/') ||
    file.startsWith('api/') ||
    file.startsWith('recovery/') ||
    file.startsWith('storage/') ||
    file.startsWith('browser-download/') ||
    file === 'billing/xlsx-engine.ts' ||
    file === 'billing/template-assets.ts' ||
    file === 'billing/pbc-rates.ts'
  ) {
    return 'Infrastructure'
  }
  if (
    file.startsWith('shared/') ||
    file.startsWith('utils/') ||
    file.startsWith('schema/') ||
    file.startsWith('settings/')
  ) {
    return 'Shared'
  }
  return 'BusinessModule'
}

function scanScriptAst(
  file,
  srcRoot,
  code,
  lineOffset,
  edges,
  runtimeSignals,
  unresolvedImports,
  tsAliases,
  scriptLang,
) {
  const scriptFile = scriptLang ? `${file}.${scriptLang}` : file
  const sf = ts.createSourceFile(scriptFile, code, ts.ScriptTarget.Latest, true)
  const from = relative(srcRoot, file).replaceAll('\\', '/')
  const literal = ts.isStringLiteralLike
  const exportedBindings = new Set()
  for (const statement of sf.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      !statement.isTypeOnly &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (!element.isTypeOnly) exportedBindings.add((element.propertyName ?? element.name).text)
      }
    } else if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      exportedBindings.add(statement.expression.text)
    }
  }

  const addEdge = (specifier, kind, isTypeOnly, node) => {
    const { internalSpecifier, target } = resolveImportTarget(file, specifier, srcRoot, tsAliases)
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    const resolvedLine = line + 1 + lineOffset
    if (internalSpecifier && !target) {
      unresolvedImports.push({ from, specifier, kind, line: resolvedLine })
    }
    edges.push({
      from,
      to: target,
      specifier,
      kind,
      isTypeOnly,
      line: resolvedLine,
      external: !internalSpecifier,
    })
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && literal(node.moduleSpecifier)) {
      const clause = node.importClause
      let isTypeOnly = Boolean(clause?.isTypeOnly)
      if (!isTypeOnly && !clause?.name && clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        const elems = clause.namedBindings.elements
        if (elems.length > 0 && elems.every(el => el.isTypeOnly)) isTypeOnly = true
      }
      const bindings = clause?.namedBindings
      const forwardsBinding =
        !isTypeOnly &&
        (exportedBindings.has(clause?.name?.text) ||
          (bindings &&
            (ts.isNamespaceImport(bindings)
              ? exportedBindings.has(bindings.name.text)
              : bindings.elements.some(element => !element.isTypeOnly && exportedBindings.has(element.name.text)))))
      addEdge(node.moduleSpecifier.text, forwardsBinding ? 're-export' : 'static-import', isTypeOnly, node)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && literal(node.moduleSpecifier)) {
      const clause = node.exportClause
      const isTypeOnly =
        node.isTypeOnly ||
        Boolean(
          clause && ts.isNamedExports(clause) && clause.elements.length && clause.elements.every(el => el.isTypeOnly),
        )
      addEdge(node.moduleSpecifier.text, 're-export', isTypeOnly, node)
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && literal(node.argument.literal)) {
      addEdge(node.argument.literal.text, 'import-type', true, node)
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      literal(node.moduleReference.expression)
    ) {
      addEdge(node.moduleReference.expression.text, 'require', node.isTypeOnly, node)
    } else if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length > 0 &&
        literal(node.arguments[0])
      ) {
        addEdge(node.arguments[0].text, 'dynamic-import', false, node)
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length > 0 &&
        literal(node.arguments[0])
      ) {
        addEdge(node.arguments[0].text, 'require', false, node)
      } else if (ts.isPropertyAccessExpression(node.expression) && node.expression.getText(sf) === 'import.meta.glob') {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
        runtimeSignals.push({
          from,
          type: 'vite-glob',
          detail: node.arguments[0]?.getText(sf) ?? '',
          line: line + 1 + lineOffset,
        })
      }
    } else if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const owner = ts.isIdentifier(node.expression) ? node.expression.text : ''
      const key = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : literal(node.argumentExpression)
          ? node.argumentExpression.text
          : ''
      let type
      if (owner === 'MessageType') type = 'message-type'
      else if (owner === 'chrome' || ((owner === 'window' || owner === 'globalThis') && key === 'chrome')) {
        type = 'chrome-api'
      } else if (
        owner === 'document' ||
        owner === 'window' ||
        (owner === 'globalThis' && /^(?:document|window)$/.test(key))
      ) {
        type = 'dom-api'
      }
      if (type) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
        runtimeSignals.push({ from, type, detail: node.getText(sf), line: line + 1 + lineOffset })
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
  const tsAliases = loadTsconfigPathAliases(extensionRoot)
  const files = walkSourceFiles(srcRoot).sort()
  const relFiles = files.map(f => relative(srcRoot, f).replaceAll('\\', '/'))

  const edges = []
  const runtimeSignals = []
  const unresolvedImports = []

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    if (file.endsWith('.vue')) {
      const { descriptor } = parseSfc(source)
      for (const block of [descriptor.script, descriptor.scriptSetup]) {
        if (!block) continue
        const lineOffset = block.loc.start.line - 1
        if (block.src) {
          const from = relative(srcRoot, file).replaceAll('\\', '/')
          const { internalSpecifier, target } = resolveImportTarget(file, block.src, srcRoot, tsAliases)
          if (internalSpecifier && !target) {
            unresolvedImports.push({ from, specifier: block.src, kind: 'sfc-script', line: lineOffset + 1 })
          }
          edges.push({
            from,
            to: target,
            specifier: block.src,
            kind: 'sfc-script',
            isTypeOnly: false,
            line: lineOffset + 1,
            external: !internalSpecifier,
          })
          continue
        }
        scanScriptAst(
          file,
          srcRoot,
          block.content,
          lineOffset,
          edges,
          runtimeSignals,
          unresolvedImports,
          tsAliases,
          block.lang ?? 'js',
        )
      }
    } else {
      scanScriptAst(file, srcRoot, source, 0, edges, runtimeSignals, unresolvedImports, tsAliases)
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
      unresolvedImportCount: unresolvedImports.length,
    },
    cycles,
    unresolvedImports,
    matrix,
    edges,
    runtimeSignals,
  }
}

function buildBarrelReexportMap(internalRuntime) {
  const map = new Map()
  for (const edge of internalRuntime) {
    if (edge.kind !== 're-export') continue
    if (!map.has(edge.from)) map.set(edge.from, new Set())
    map.get(edge.from).add(edge.to)
  }
  return map
}

function expandTransitiveTargets(directTarget, barrelReexports) {
  const expanded = new Set([directTarget])
  const queue = [directTarget]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const next of barrelReexports.get(current) ?? []) {
      if (expanded.has(next)) continue
      expanded.add(next)
      queue.push(next)
    }
  }
  return expanded
}

function isProtectedMailUiFile(file) {
  return (
    MAIL_UI_PROTECTED_FILES.has(file) ||
    /^(?:app\/(?:pages|components)|floating)\/.*Mail.*\.vue$/.test(file) ||
    file.startsWith('app/composables/')
  )
}

function isBillingPageFile(file) {
  return file === 'app/pages/BillingWorkflowPage.vue' || /^app\/pages\/.*Billing.*\.vue$/.test(file)
}

function isHagueProductionModule(file) {
  return HAGUE_PRODUCTION_MODULES.has(file) || file.startsWith('hague/protocol/')
}

export function evaluateArchitecture(inventory) {
  const violations = []
  const runtimeEdges = inventory.edges.filter(edge => !edge.isTypeOnly)
  const internalRuntime = runtimeEdges.filter(edge => edge.to && !edge.to.startsWith('..'))
  const barrelReexports = buildBarrelReexportMap(internalRuntime)
  const targetsOf = edge => expandTransitiveTargets(edge.to, barrelReexports)
  const pushViolation = item => violations.push(item)

  // Rule A: Domain Purity
  for (const edge of runtimeEdges) {
    const isDomain = edge.from.startsWith('domain/') || CORE_DOMAIN_FILES.has(edge.from)
    if (!isDomain) continue
    if (edge.specifier === 'vue' || edge.specifier.startsWith('vue/')) {
      pushViolation({
        id: `domain-vue:${edge.from}->${edge.specifier}`,
        rule: 'A-domain-purity',
        severity: 'error',
        from: edge.from,
        to: edge.specifier,
        line: edge.line,
        reason: 'Domain 模块不得直接导入 Vue',
      })
    }
    if (!edge.to || edge.to.startsWith('..')) continue
    for (const target of targetsOf(edge)) {
      if (/^(app|floating|popup|shell|background|content)\//.test(target)) {
        pushViolation({
          id: `domain-layer:${edge.from}->${target}`,
          rule: 'A-domain-purity',
          severity: 'error',
          from: edge.from,
          to: target,
          line: edge.line,
          reason: 'Domain 模块不得直接依赖 Presentation / Background / Content 运行时层',
        })
      }
    }
  }
  for (const signal of inventory.runtimeSignals) {
    const isDomain = signal.from.startsWith('domain/') || CORE_DOMAIN_FILES.has(signal.from)
    if (!isDomain) continue
    if (signal.type === 'chrome-api' || signal.type === 'dom-api') {
      pushViolation({
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
    for (const target of targetsOf(edge)) {
      if (target.endsWith('.vue') || /^(app|floating|popup|shell)\//.test(target)) {
        pushViolation({
          id: `app-to-ui:${edge.from}->${target}`,
          rule: 'B-application-no-ui',
          severity: 'error',
          from: edge.from,
          to: target,
          line: edge.line,
          reason: 'Application 服务不得依赖 Vue 组件或 Presentation 界面模块',
        })
      }
    }
  }

  // Rule C: Agent -> Direct Domain / Business Submission Bypass
  for (const edge of internalRuntime) {
    const isAgent = edge.from.startsWith('agent/') || edge.from === 'background/agent.ts'
    if (!isAgent) continue
    for (const target of targetsOf(edge)) {
      if (AGENT_FORBIDDEN_BUSINESS_MODULES.has(target)) {
        pushViolation({
          id: `agent-domain-bypass:${edge.from}->${target}`,
          rule: 'C-agent-through-application',
          severity: 'ratchet',
          from: edge.from,
          to: target,
          line: edge.line,
          reason: 'Agent 层应通过 MailApplicationService 调用发文/审核人/邮编规则，不得直接耦合领域实现',
        })
      }
    }
  }

  // Rule D: Presentation -> Direct Billing Execution Infrastructure (Generalized)
  for (const edge of internalRuntime) {
    const isPresentationUi =
      edge.from.startsWith('app/pages/') ||
      edge.from.startsWith('app/components/') ||
      edge.from.startsWith('floating/') ||
      edge.from.startsWith('popup/') ||
      edge.from.startsWith('shell/')
    const isNonRootComposable = edge.from.startsWith('app/composables/') && !COMPOSITION_ROOTS.has(edge.from)
    if (!isPresentationUi && !isNonRootComposable) continue

    const checksBillingEngines =
      edge.from.startsWith('app/pages/') ||
      edge.from.startsWith('app/components/') ||
      edge.from.startsWith('floating/') ||
      isNonRootComposable
    const checksBillingRecovery = isBillingPageFile(edge.from)

    for (const target of targetsOf(edge)) {
      if (target.startsWith('infrastructure/')) {
        pushViolation({
          id: `presentation-direct-infra:${edge.from}->${target}`,
          rule: 'D-presentation-no-direct-infra',
          severity: 'error',
          from: edge.from,
          to: target,
          line: edge.line,
          reason:
            'Presentation 界面与非组合根 Composable 不得直接依赖 infrastructure 适配器，请通过组合根与 Application 层交互',
        })
      } else if (
        (checksBillingEngines && BILLING_ENGINE_MODULES.has(target)) ||
        (checksBillingRecovery && target === 'recovery/client.ts')
      ) {
        pushViolation({
          id: `billing-page-direct:${edge.from}->${target}`,
          rule: 'D-presentation-no-direct-infra',
          severity: 'error',
          from: edge.from,
          to: target,
          line: edge.line,
          reason:
            '页面与普通 Composable 应通过 useBillingWorkflow 调用 BillingApplicationService，不得直接依赖请款引擎或基础设施',
        })
      }
    }
  }

  // Rule E: Target Scope Circular Dependencies
  for (const cycle of inventory.cycles) {
    const touchesStrictScope = cycle.some(
      file => ZERO_CYCLE_PREFIXES.some(prefix => file.startsWith(prefix)) || ZERO_CYCLE_FILES.has(file),
    )
    if (touchesStrictScope) {
      pushViolation({
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

  // Rule F: Cross-Runtime Isolation (MV3 Service Worker / Content Script)
  for (const edge of internalRuntime) {
    for (const target of targetsOf(edge)) {
      if (edge.from.startsWith('background/') && (target.startsWith('content/') || target.endsWith('.vue'))) {
        pushViolation({
          id: `bg-to-dom:${edge.from}->${target}`,
          rule: 'F-runtime-isolation',
          severity: 'error',
          from: edge.from,
          to: target,
          line: edge.line,
          reason: 'Service Worker (background/) 不得导入 Content Script 或 Vue 组件',
        })
      }
      if (edge.from.startsWith('content/') && target.startsWith('background/')) {
        pushViolation({
          id: `content-to-bg:${edge.from}->${target}`,
          rule: 'F-runtime-isolation',
          severity: 'error',
          from: edge.from,
          to: target,
          line: edge.line,
          reason: 'Content Script 不得直接导入 Service Worker 运行时模块，必须通过消息协议通信',
        })
      }
    }
  }

  // Rule G: Protected Mail UI -> MailApplicationService Facade Enforcement
  for (const edge of internalRuntime) {
    if (!isProtectedMailUiFile(edge.from)) continue
    for (const target of targetsOf(edge)) {
      if (MAIL_FORBIDDEN_IN_UI.has(target)) {
        pushViolation({
          id: `mail-ui-bypass:${edge.from}->${target}`,
          rule: 'G-mail-ui-through-application',
          severity: 'error',
          from: edge.from,
          to: target,
          line: edge.line,
          reason: '受治发文 UI 应通过 MailApplicationService 调用发文/收件人/审核人逻辑，不得直接耦合领域模块',
        })
      }
    }
  }

  // Rule H: Application Layer Free of MV3 Transport, Infrastructure and UI Signals
  for (const edge of internalRuntime) {
    if (!edge.from.startsWith('application/')) continue
    for (const target of targetsOf(edge)) {
      if (
        target === 'shared/message.ts' ||
        target === 'shared/guards.ts' ||
        /^(?:infrastructure|background|content)\//.test(target)
      ) {
        pushViolation({
          id: `application-transport-leak:${edge.from}->${target}`,
          rule: 'H-application-no-transport-leak',
          severity: 'error',
          from: edge.from,
          to: target,
          line: edge.line,
          reason: 'Application 层只能依赖领域与 Ports 抽象，不得耦合 Chrome 消息总线或基础设施实现',
        })
      }
    }
  }
  for (const signal of inventory.runtimeSignals) {
    if (!signal.from.startsWith('application/')) continue
    if (signal.type === 'chrome-api' || signal.type === 'message-type' || signal.type === 'dom-api') {
      pushViolation({
        id: `application-runtime-signal:${signal.from}:${signal.detail}`,
        rule: 'H-application-no-transport-leak',
        severity: 'error',
        from: signal.from,
        to: signal.detail,
        line: signal.line,
        reason: `Application 层不得直接访问扩展传输或浏览器 API（${signal.detail}）`,
      })
    }
  }

  // Rule I: Hague Production & Protocol Kernel vs Diagnostics / Research Boundary
  for (const edge of internalRuntime) {
    if (!isHagueProductionModule(edge.from)) continue
    for (const target of targetsOf(edge)) {
      const hitsForbiddenDiag =
        target.startsWith('hague/diagnostics/ast/') ||
        HAGUE_FORBIDDEN_DIAGNOSTICS.has(target) ||
        target.startsWith('hague/research/')
      const protocolImportsAnyDiag = edge.from.startsWith('hague/protocol/') && target.startsWith('hague/diagnostics/')
      if (hitsForbiddenDiag || protocolImportsAnyDiag) {
        pushViolation({
          id: `hague-diag-leak:${edge.from}->${target}`,
          rule: 'I-hague-protocol-vs-diagnostics',
          severity: 'error',
          from: edge.from,
          to: target,
          line: edge.line,
          reason: '海牙生产驱动与纯协议内核不得依赖旁路 AST/回放/研究诊断模块',
        })
      }
    }
  }

  // Rule J: Zero Unresolved Internal / Relative Imports
  for (const unresolved of inventory.unresolvedImports ?? []) {
    pushViolation({
      id: `unresolved-import:${unresolved.from}:${unresolved.line}:${unresolved.specifier}`,
      rule: 'J-no-unresolved-internal-imports',
      severity: 'error',
      from: unresolved.from,
      to: unresolved.specifier,
      line: unresolved.line,
      reason: `存在无法解析的内部/相对导入目标：${unresolved.specifier}`,
    })
  }

  // Rule K: Composition Root Registry for Infrastructure Imports
  for (const edge of internalRuntime) {
    if (edge.from.startsWith('infrastructure/')) continue
    const allowedTargets = COMPOSITION_ROOTS.get(edge.from)
    for (const target of targetsOf(edge)) {
      if (!target.startsWith('infrastructure/')) continue
      if (allowedTargets?.has(target)) continue
      pushViolation({
        id: `unregistered-infra-importer:${edge.from}->${target}`,
        rule: 'K-composition-root-registry',
        severity: 'error',
        from: edge.from,
        to: target,
        line: edge.line,
        reason: '仅已登记的 Composition Root 可直接装配 infrastructure 适配器',
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
      unresolvedImports: inventory.unresolvedImports,
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
  const baselineCycleCount = baseline.cycleCount ?? 0
  const cycleRegression = inventory.cycles.length > baselineCycleCount

  const report = {
    generatedAt: new Date().toISOString(),
    fileCount: inventory.fileCount,
    runtimeInternalEdges: inventory.summary.runtimeInternalEdges,
    typeOnlyEdges: inventory.summary.typeOnlyEdges,
    cycleCount: inventory.cycles.length,
    baselineCycleCount,
    cycleRegression,
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
    console.log(
      `提示：已清理 ${report.staleBaselineIds.length} 项历史违规，请运行 node scripts/architecture-check.mjs --write-baseline 收紧基线。`,
    )
  }
  if (!report.passed) {
    if (report.cycleRegression) {
      console.error(`✗ 运行时循环依赖超出基线：${report.cycleCount}（基线 ${report.baselineCycleCount}）`)
    }
    for (const v of [...report.hardErrors, ...report.newRatchetViolations]) {
      console.error(`✗ [${v.rule}] ${v.from}:${v.line} -> ${v.to} (${v.reason})`)
    }
    process.exitCode = 1
  }
}
