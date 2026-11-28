#!/usr/bin/env node
import { EXTENSION_ROOT } from '../shared/paths.mjs'
/**
 * 依赖许可策略检查（Phase 5.1 的 License 策略）。
 *
 * 只审计 package.json 里声明的直接依赖（运行时 + 开发），从 node_modules/<pkg>/package.json
 * 读取 license 字段，对照 ci/license-policy.json：
 *   - allowed：常见宽松许可，直接放行；
 *   - exceptions：需要登记的许可（如 copyleft / 双许可），必须写 reason 与失效日期，逾期失败。
 * 传递依赖的完整清单由 pnpm licenses 人工复审（见 docs/ci/security-policy.md）。
 *
 * 用法：pnpm licenses:check
 * 产出：test-results/ci/license-report.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = EXTENSION_ROOT
const reportDir = join(root, 'test-results', 'ci')
const policyPath = join(root, 'ci', 'license-policy.json')

if (!existsSync(policyPath)) {
  console.error(`缺少 ${policyPath}，先建立许可策略清单。`)
  process.exit(1)
}
const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
const allowed = new Set(policy.allowed ?? [])
const today = new Date().toISOString().slice(0, 10)

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const declared = {
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
}

const results = []
const problems = []
for (const [name, range] of Object.entries(declared)) {
  const dependencyManifest = join(root, 'node_modules', ...name.split('/'), 'package.json')
  if (!existsSync(dependencyManifest)) {
    problems.push(`${name} 未安装，无法读取许可（先 pnpm install --frozen-lockfile）`)
    continue
  }
  const dependency = JSON.parse(readFileSync(dependencyManifest, 'utf8'))
  const license =
    typeof dependency.license === 'string'
      ? dependency.license
      : Array.isArray(dependency.licenses)
        ? dependency.licenses.map(item => item.type ?? item).join(' OR ')
        : 'UNKNOWN'
  // 双许可（"A OR B"）允许择一采用；只要有一个分支在允许清单里，就按该分支登记。
  const elected = license
    .split(/\s+OR\s+/i)
    .map(item => item.replace(/^\(|\)$/g, '').trim())
    .find(item => allowed.has(item))
  const entry = { name, range, version: dependency.version, license, elected: elected ?? null, verdict: 'allowed' }
  if (elected) {
    results.push(entry)
    continue
  }
  const exception = (policy.exceptions ?? []).find(item => item.name === name)
  if (exception && exception.expires >= today) {
    results.push({ ...entry, verdict: 'exception', reason: exception.reason, expires: exception.expires })
    continue
  }
  entry.verdict = 'blocked'
  entry.problem = exception
    ? `例外已过期（${exception.expires}），需复审续期或更换依赖`
    : `许可 ${license} 不在允许清单，也没有登记例外`
  results.push(entry)
  problems.push(`${name}@${dependency.version}：${entry.problem}`)
}

mkdirSync(reportDir, { recursive: true })
writeFileSync(
  join(reportDir, 'license-report.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), allowed: [...allowed], results, problems }, null, 2)}\n`,
)

const exceptions = results.filter(item => item.verdict === 'exception')
console.log(
  `许可检查：${results.length} 个直接依赖，${results.filter(item => item.verdict === 'allowed').length} 个标准许可，${exceptions.length} 个登记例外。`,
)
for (const item of exceptions)
  console.log(`  · 例外 ${item.name}@${item.version} ${item.license}（至 ${item.expires}）：${item.reason}`)
if (problems.length > 0) {
  for (const message of problems) console.error(`✗ ${message}`)
  console.error('许可策略检查失败。')
  process.exit(1)
}
console.log('许可策略检查通过。')
