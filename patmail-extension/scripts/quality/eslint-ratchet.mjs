#!/usr/bin/env node
import { EXTENSION_ROOT } from '../shared/paths.mjs'
/**
 * ESLint 基线棘轮（ratchet）门禁。
 *
 * 历史代码有存量告警（见 docs/ci/baseline-audit.md），一次性全量修复会淹没业务 diff，
 * 所以按规则维度冻结当前数量：
 *   - 数量低于基线：通过，并提示可以把基线收紧；
 *   - 数量高于基线或出现基线外的新规则：失败（新代码不得引入新问题）；
 *   - `--update` 显式重写基线（必须在变更说明里写清原因）。
 * 危险规则（浮空 Promise、误用 Promise 等）基线为 0，等价于硬门禁。
 *
 * 用法：
 *   node scripts/quality/eslint-ratchet.mjs            # 门禁
 *   node scripts/quality/eslint-ratchet.mjs --update   # 按当前结果重写基线
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { collectExemptions, compareExemptions } from './eslint-exemptions.mjs'

const root = EXTENSION_ROOT
const baselinePath = join(root, 'ci', 'eslint-baseline.json')
const exemptionsPath = join(root, 'ci', 'eslint-exemptions.json')
const reportDir = join(root, 'test-results', 'ci')
const reportPath = join(reportDir, 'eslint.json')
const update = process.argv.includes('--update')
const updateExemptions = process.argv.includes('--update-exemptions')

const eslintBin = join(root, 'node_modules', 'eslint', 'bin', 'eslint.js')
if (!existsSync(eslintBin)) {
  console.error('找不到本地 ESLint，先执行 pnpm install。')
  process.exit(1)
}
mkdirSync(reportDir, { recursive: true })
// Never reuse a previous report after an interrupted or failed ESLint process.
writeFileSync(reportPath, '')
const run = spawnSync(
  process.execPath,
  [eslintBin, '.', '-f', 'json', '--no-error-on-unmatched-pattern', '-o', reportPath],
  {
    cwd: root,
    encoding: 'utf8',
  },
)
// ESLint 退出码：0 无问题，1 有问题，2 运行/配置错误。配置错误必须直接失败。
if (run.status !== 0 && run.status !== 1) {
  console.error(run.stderr || run.stdout)
  console.error(`ESLint 未正常完成（退出码 ${run.status}，信号 ${run.signal ?? '无'}）。`)
  process.exit(2)
}
if (!existsSync(reportPath)) {
  console.error('ESLint 没有产出 JSON 报告。')
  process.exit(1)
}
const files = JSON.parse(readFileSync(reportPath, 'utf8'))
const exemptions = collectExemptions(files, root)
if (updateExemptions) {
  writeFileSync(exemptionsPath, `${JSON.stringify({ version: 1, exemptions }, null, 2)}\n`)
  console.log(`豁免登记已显式更新：${exemptions.length} 项；请审查并提交登记差异。`)
}
const exemptionViolations = compareExemptions(
  exemptions,
  existsSync(exemptionsPath) ? JSON.parse(readFileSync(exemptionsPath, 'utf8')).exemptions : undefined,
)
if (exemptionViolations.length) {
  for (const violation of exemptionViolations) console.error(violation)
  process.exit(1)
}
const counts = {}
let totalErrors = 0
let totalWarnings = 0
let filesWithIssues = 0
for (const file of files) {
  if (file.errorCount > 0 || file.warningCount > 0) filesWithIssues += 1
  totalErrors += file.errorCount
  totalWarnings += file.warningCount
  for (const message of file.messages) {
    const rule = message.ruleId ?? '(配置/解析错误)'
    const bucket = counts[rule] ?? (counts[rule] = { error: 0, warn: 0 })
    if (message.severity === 2) bucket.error += 1
    else bucket.warn += 1
  }
}

const current = {
  meta: {
    generatedAt: new Date().toISOString(),
    note: 'ESLint 基线：每条规则的历史存量。低于基线可收紧，高于基线即失败。',
  },
  totals: { errors: totalErrors, warnings: totalWarnings, filesWithIssues },
  rules: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
}

if (!update && !existsSync(baselinePath)) {
  console.error('缺少 lint 基线；不会自动接受当前告警。请显式运行 --update。')
  process.exit(1)
}
if (update) {
  mkdirSync(dirname(baselinePath), { recursive: true })
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`)
  console.log(`基线已写入 ${baselinePath}（errors=${totalErrors} warnings=${totalWarnings}）。`)
  if (update) process.exit(0)
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const violations = []
const ratchet = []
for (const [rule, now] of Object.entries(current.rules)) {
  const before = baseline.rules?.[rule]
  if (!before) {
    violations.push(`新规则出现存量问题：${rule}（error=${now.error} warn=${now.warn}），基线里没有这一条。`)
    continue
  }
  if (now.error > before.error || now.warn > before.warn) {
    violations.push(`超出基线：${rule} error ${before.error}→${now.error}，warn ${before.warn}→${now.warn}。`)
    continue
  }
  if (now.error < before.error || now.warn < before.warn) {
    ratchet.push(`${rule} error ${before.error}→${now.error}，warn ${before.warn}→${now.warn}，可收紧基线。`)
  }
}
for (const rule of Object.keys(baseline.rules ?? {})) {
  if (!current.rules[rule]) ratchet.push(`${rule} 已清零，可从基线删除。`)
}

console.log(
  `ESLint：${filesWithIssues} 个文件，${totalErrors} errors，${totalWarnings} warnings（基线 errors=${baseline.totals.errors} warnings=${baseline.totals.warnings}）。`,
)
for (const line of ratchet.slice(0, 10)) console.log(`  ↓ ${line}`)
if (ratchet.length > 10) console.log(`  ↓ …其余 ${ratchet.length - 10} 条可收紧项见 ${reportPath}`)
if (violations.length > 0) {
  for (const line of violations) console.error(`  ✗ ${line}`)
  console.error('ESLint 基线门禁失败：新代码不得增加历史存量问题。')
  process.exit(1)
}
console.log('ESLint 基线门禁通过。')
