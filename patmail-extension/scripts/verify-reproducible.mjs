#!/usr/bin/env node
/**
 * 构建可复现性验证（Phase 7 构建一致性）。
 *
 * 在同一受控环境连续执行两次 pnpm build:ci，对 dist/ 全部文件逐项算 SHA-256 比较：
 *   - 完全一致 → 可复现；
 *   - 有差异 → 列出差异文件与摘要，判定非确定性来源，不删除任何输出来"凑一致"。
 *
 * 用法：pnpm verify:repro
 * 产出：test-results/ci/repro-report.json
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const distDir = join(root, 'dist')
const reportDir = join(root, 'test-results', 'ci')
const buildCommand = process.env.PATMAIL_BUILD_COMMAND || 'pnpm build:ci'

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(absolute))
    else files.push(absolute)
  }
  return files
}

function snapshot(label) {
  if (!existsSync(distDir)) {
    console.error('dist/ 不存在，构建没有产出。')
    process.exit(1)
  }
  const entries = {}
  for (const file of walk(distDir).sort()) {
    const name = relative(distDir, file).replaceAll('\\', '/')
    entries[name] = createHash('sha256').update(readFileSync(file)).digest('hex')
  }
  const combined = createHash('sha256')
  for (const [name, digest] of Object.entries(entries)) combined.update(`${name}\n${digest}\n`)
  return { label, fileCount: Object.keys(entries).length, combinedDigest: combined.digest('hex'), files: entries }
}

function build() {
  const [command, ...args] = buildCommand.split(' ')
  const started = Date.now()
  const run = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (run.status !== 0) {
    console.error(`构建失败：${buildCommand}`)
    process.exit(run.status ?? 1)
  }
  return Date.now() - started
}

console.log(`[1/2] 第一次构建：${buildCommand}`)
const firstBuildMs = build()
const first = snapshot('build-1')
console.log(`[2/2] 第二次构建：${buildCommand}`)
const secondBuildMs = build()
const second = snapshot('build-2')

const allNames = new Set([...Object.keys(first.files), ...Object.keys(second.files)])
const onlyInFirst = []
const onlyInSecond = []
const changed = []
for (const name of allNames) {
  const before = first.files[name]
  const after = second.files[name]
  if (!before) onlyInSecond.push(name)
  else if (!after) onlyInFirst.push(name)
  else if (before !== after) changed.push({ path: name, first: before, second: after })
}
const reproducible = onlyInFirst.length === 0 && onlyInSecond.length === 0 && changed.length === 0

const report = {
  generatedAt: new Date().toISOString(),
  buildCommand,
  reproducible,
  firstBuildMs,
  secondBuildMs,
  fileCount: allNames.size,
  combinedDigest: { first: first.combinedDigest, second: second.combinedDigest },
  onlyInFirst,
  onlyInSecond,
  changed,
}
mkdirSync(reportDir, { recursive: true })
writeFileSync(join(reportDir, 'repro-report.json'), `${JSON.stringify(report, null, 2)}\n`)

if (reproducible) {
  console.log(`两次构建完全一致：${allNames.size} 个文件，组合摘要 ${first.combinedDigest.slice(0, 16)}…`)
  process.exit(0)
}
console.error(`两次构建不一致（新增 ${onlyInSecond.length}、缺失 ${onlyInFirst.length}、内容变化 ${changed.length}）。`)
for (const item of changed.slice(0, 20)) console.error(`  ✗ 内容变化：${item.path}`)
for (const name of onlyInFirst.slice(0, 10)) console.error(`  ✗ 仅第一次出现：${name}`)
for (const name of onlyInSecond.slice(0, 10)) console.error(`  ✗ 仅第二次出现：${name}`)
console.error('请定位非确定性来源（时间戳、随机 chunk 名、Map 迭代顺序等），不要删除输出文件来凑一致。')
process.exit(1)
