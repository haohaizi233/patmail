#!/usr/bin/env node
/**
 * CI 报告生成器（Phase 10）。
 *
 * 汇总 test-results/ 下各校验脚本的真实产出，生成：
 *   - test-results/ci/summary.json  机器可读
 *   - test-results/ci/summary.md   人类可读（并追加到 $GITHUB_STEP_SUMMARY）
 * 没有结果文件的指标一律标记 NOT RUN，绝不显示为 PASS。
 *
 * 用法：
 *   pnpm ci:report                    # 汇总当前 test-results
 *   pnpm ci:report -- --gate          # 汇总并把 FAIL/BLOCKED 作为退出码（CI 汇总门禁）
 *   pnpm ci:report -- --coverage-gate # 覆盖率防退化门禁（对照 ci/coverage-baseline.json）
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const resultsDir = join(root, 'test-results')
const reportDir = join(resultsDir, 'ci')
const args = process.argv.slice(2)
const gate = args.includes('--gate')
const coverageGate = args.includes('--coverage-gate')

const readJson = path => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

// ---- 环境信息 ----
const git = command => spawnSync(command, { cwd: root, encoding: 'utf8', shell: true }).stdout?.trim() ?? ''
const chromiumVersion = (() => {
  const browsers = readJson(join(root, 'node_modules', 'playwright-core', 'browsers.json'))
  return browsers?.browsers?.find(item => item.name === 'chromium')?.browserVersion ?? 'unknown'
})()
const environment = {
  commit: git('git rev-parse HEAD') || 'unknown',
  branch: git('git rev-parse --abbrev-ref HEAD') || 'unknown',
  node: process.version,
  pnpm: git('pnpm -v') || 'unknown',
  chromium: chromiumVersion,
  platform: `${process.platform} ${process.arch}`,
}

// ---- 各分项 ----
const step = name => readJson(join(reportDir, 'steps', `${name}.json`))
const stepStatus = name => {
  const record = step(name)
  if (!record) return { status: 'NOT RUN', detail: '本次运行没有执行' }
  return {
    status: record.status === 'pass' ? 'PASS' : 'FAIL',
    detail: `${record.command}（${(record.durationMs / 1000).toFixed(1)}s，exit=${record.exitCode}）`,
    durationMs: record.durationMs,
  }
}

const junit = level => {
  const path = join(resultsDir, 'junit', `${level}.xml`)
  if (!existsSync(path)) return null
  const text = readFileSync(path, 'utf8')
  const totals = { tests: 0, failures: 0, errors: 0, skipped: 0 }
  for (const match of text.matchAll(/<testsuite\b[^>]*>/g)) {
    const tag = match[0]
    for (const key of Object.keys(totals)) {
      const value = new RegExp(`${key}="(\\d+)"`).exec(tag)
      if (value) totals[key] += Number(value[1])
    }
  }
  return totals
}
const testRow = level => {
  const totals = junit(level)
  if (!totals) return { status: 'NOT RUN', detail: '本次运行没有执行' }
  const failed = totals.failures + totals.errors
  return {
    status: failed > 0 ? 'FAIL' : 'PASS',
    detail: `${totals.tests} 用例：${totals.tests - failed - totals.skipped} 通过 / ${failed} 失败 / ${totals.skipped} 跳过`,
    ...totals,
  }
}

const e2eReport = () => {
  const groups = ['smoke', 'full', 'legacy', 'all']
    .map(group => readJson(join(reportDir, `e2e-${group}.json`)))
    .filter(Boolean)
  const suites = groups.flatMap(item => item.suites ?? [])
  if (groups.length === 0) return { status: 'NOT RUN', detail: '本次运行没有执行' }
  const blocked = groups.filter(item => item.status === 'blocked')
  const failed = suites.filter(item => item.status === 'fail')
  return {
    status: blocked.length > 0 ? 'BLOCKED' : failed.length > 0 ? 'FAIL' : 'PASS',
    detail:
      `${groups.map(item => item.group).join('+')}：${suites.filter(item => item.status === 'pass').length}/${suites.length} 场景通过` +
      (blocked.length > 0 ? `（${blocked.length} 组被前置条件阻断）` : ''),
    suites: suites.length,
  }
}

const coverageReport = () => {
  const summary = readJson(join(resultsDir, 'coverage', 'coverage-summary.json'))
  if (!summary) return { status: 'NOT RUN', detail: '本次运行没有执行' }
  const total = summary.total ?? {}
  const pick = key => ({ pct: total[key]?.pct ?? 0, covered: total[key]?.covered ?? 0, total: total[key]?.total ?? 0 })
  // 核心业务模块独立口径（任务书 Phase 2.3：mail/ workflow/ automation/ background/ browser-download）。
  const core = {}
  for (const module of ['mail', 'workflow', 'automation', 'background', 'browser-download']) {
    const files = Object.entries(summary).filter(
      ([file]) => file !== 'total' && file.replaceAll('\\', '/').includes(`/src/${module}/`),
    )
    const aggregate = key => {
      const covered = files.reduce((sum, [, data]) => sum + (data[key]?.covered ?? 0), 0)
      const totalValue = files.reduce((sum, [, data]) => sum + (data[key]?.total ?? 0), 0)
      return {
        covered,
        total: totalValue,
        pct: totalValue === 0 ? 100 : Number(((covered / totalValue) * 100).toFixed(2)),
      }
    }
    core[module] = { lines: aggregate('lines'), branches: aggregate('branches'), functions: aggregate('functions') }
  }
  return {
    status: 'PASS',
    detail: `Lines ${pick('lines').pct}% / Branches ${pick('branches').pct}% / Functions ${pick('functions').pct}%`,
    total: {
      lines: pick('lines'),
      branches: pick('branches'),
      functions: pick('functions'),
      statements: pick('statements'),
    },
    core,
  }
}

const eslintReport = (() => {
  const files = readJson(join(reportDir, 'eslint.json'))
  if (!Array.isArray(files)) return null
  return files.reduce(
    (sum, file) => ({ errors: sum.errors + file.errorCount, warnings: sum.warnings + file.warningCount }),
    { errors: 0, warnings: 0 },
  )
})()
const lintRow = () => {
  const base = stepStatus('lint')
  return eslintReport
    ? { ...base, detail: `${base.detail}；存量 ${eslintReport.errors} errors / ${eslintReport.warnings} warnings` }
    : base
}

const manifestReport = readJson(join(reportDir, 'manifest-report.json'))
const distReport = readJson(join(reportDir, 'dist-report.json'))
const reproReport = readJson(join(reportDir, 'repro-report.json'))
const secretReport = readJson(join(reportDir, 'secret-scan.json'))
const licenseReport = readJson(join(reportDir, 'license-report.json'))

const securityRow = () => {
  const parts = []
  let status = 'NOT RUN'
  if (secretReport) {
    parts.push(
      `密钥扫描：${secretReport.totals.errors} error / ${secretReport.totals.warnings} warn / ${secretReport.totals.allowlisted} 例外`,
    )
    status = secretReport.totals.errors > 0 ? 'FAIL' : 'PASS'
  }
  if (licenseReport) {
    parts.push(`许可：${licenseReport.results.length} 直接依赖，${licenseReport.problems.length} 问题`)
    status = licenseReport.problems.length > 0 ? 'FAIL' : status === 'NOT RUN' ? 'PASS' : status
  }
  if (manifestReport)
    parts.push(`Manifest：${manifestReport.problems.length} 问题 / ${manifestReport.warnings} 审计记录`)
  if (distReport) parts.push(`产物：${distReport.fileCount} 文件，组合摘要 ${distReport.combinedDigest.slice(0, 16)}…`)
  if (reproReport) parts.push(`可复现：${reproReport.reproducible ? '一致' : '不一致'}`)
  return { status, detail: parts.join('；') || '本次运行没有执行' }
}

const artifactRow = () => {
  if (!distReport) return { status: 'NOT RUN', detail: '本次运行没有执行' }
  return {
    status: distReport.problems.length > 0 ? 'FAIL' : 'PASS',
    detail: `${distReport.fileCount} 文件，SHA-256 清单见 test-results/ci/artifact-manifest.json`,
  }
}

const rows = {
  Typecheck: stepStatus('typecheck'),
  Lint: lintRow(),
  Format: stepStatus('format'),
  Unit: testRow('unit'),
  Integration: testRow('integration'),
  Regression: testRow('regression'),
  E2E: e2eReport(),
  Coverage: coverageReport(),
  Build: stepStatus('build'),
  Security: securityRow(),
  Artifacts: artifactRow(),
}
const durationMs =
  Object.values(rows).reduce((sum, row) => sum + (row.durationMs ?? 0), 0) +
  (readJson(join(reportDir, 'ci-check.json'))?.totalMs ?? 0)

const summary = {
  generatedAt: new Date().toISOString(),
  environment,
  rows,
  durationMs,
  overall: Object.values(rows).some(row => row.status === 'FAIL')
    ? 'FAIL'
    : Object.values(rows).some(row => row.status === 'BLOCKED')
      ? 'BLOCKED'
      : Object.values(rows).some(row => row.status === 'NOT RUN')
        ? 'PARTIAL'
        : 'PASS',
}

mkdirSync(reportDir, { recursive: true })
writeFileSync(join(reportDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)

const markdown = [
  '# PatMail CI 报告',
  '',
  `| 项目 | 值 |`,
  `| --- | --- |`,
  `| Commit | \`${summary.environment.commit.slice(0, 12)}\` |`,
  `| Branch | \`${summary.environment.branch}\` |`,
  `| Node | ${summary.environment.node} |`,
  `| pnpm | ${summary.environment.pnpm} |`,
  `| Chromium | ${summary.environment.chromium} |`,
  `| 总耗时 | ${(durationMs / 1000).toFixed(1)}s |`,
  `| 总体 | **${summary.overall}** |`,
  '',
  '| 指标 | 状态 | 内容 |',
  '| --- | --- | --- |',
  ...Object.entries(rows).map(([name, row]) => `| ${name} | ${row.status} | ${row.detail.replace(/\|/g, '\\|')} |`),
  '',
  '> 状态口径：PASS=已执行且通过；FAIL=已执行且失败；NOT RUN=本次没有执行（不等于通过）；BLOCKED=前置条件缺失被阻断。',
  '',
].join('\n')
writeFileSync(join(reportDir, 'summary.md'), markdown)

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`)
}
console.log(markdown)

// ---- 覆盖率防退化门禁 ----
if (coverageGate) {
  const coverage = rows.Coverage
  const baselinePath = join(root, 'ci', 'coverage-baseline.json')
  if (coverage.status === 'NOT RUN') {
    console.error('覆盖率门禁：本次没有覆盖率数据，不能放行。')
    process.exit(1)
  }
  const current = coverage.total
  if (!existsSync(baselinePath)) {
    mkdirSync(dirname(baselinePath), { recursive: true })
    writeFileSync(
      baselinePath,
      `${JSON.stringify({ meta: { note: '覆盖率防退化基线：低于基线即失败；只允许在明确说明后上调。' }, total: current, core: coverage.core }, null, 2)}\n`,
    )
    console.log(`覆盖率基线已写入 ${baselinePath}。`)
    process.exit(0)
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  const regressions = []
  for (const key of ['lines', 'branches', 'functions']) {
    const before = baseline.total?.[key]?.pct ?? 0
    const now = current[key].pct
    if (now < before) regressions.push(`${key} ${before}% → ${now}%`)
    for (const [module, data] of Object.entries(baseline.core ?? {})) {
      const coreBefore = data[key]?.pct ?? 0
      const coreNow = coverage.core?.[module]?.[key]?.pct ?? 0
      if (coreNow < coreBefore) regressions.push(`${module} ${key} ${coreBefore}% → ${coreNow}%`)
    }
  }
  if (regressions.length > 0) {
    for (const line of regressions) console.error(`✗ 覆盖率退化：${line}`)
    process.exit(1)
  }
  console.log('覆盖率防退化门禁通过。')
  process.exit(0)
}

// ---- 汇总门禁 ----
if (gate) {
  const failing = Object.entries(rows).filter(([, row]) => row.status === 'FAIL' || row.status === 'BLOCKED')
  if (failing.length > 0) {
    for (const [name, row] of failing) console.error(`✗ ${name}：${row.status}（${row.detail}）`)
    process.exit(1)
  }
  console.log('CI 汇总门禁通过。')
}
