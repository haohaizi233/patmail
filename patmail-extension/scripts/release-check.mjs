#!/usr/bin/env node
/**
 * 发布前校验（Phase 9，不发布、不签名）。
 *
 * 核对并记录：
 *   - 版本一致性：package.json / manifest.json / dist/manifest.json / Git Tag（如有）；
 *   - Git Commit、构建环境摘要；
 *   - 测试通过摘要（test-results/ci/summary.json）；
 *   - 构建产物 SHA-256 清单（test-results/ci/artifact-manifest.json）；
 *   - 发布产物名称与存在性（patmail-source.zip / patmail-delivery.zip）。
 *
 * 明确不做：Chrome Web Store 发布、CRX 签名、私钥访问。历史 dist.pem 只作为风险登记存在。
 *
 * 用法：pnpm release:check [--tag vX.Y.Z]（tag 缺省取 GITHUB_REF_NAME）
 * 产出：test-results/ci/release-report.json
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const reportDir = join(root, 'test-results', 'ci')
const args = process.argv.slice(2)
const tagIndex = args.indexOf('--tag')
const tagArgument =
  tagIndex >= 0 ? args[tagIndex + 1] : process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : ''

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const problems = []
const fail = message => problems.push(message)

const pkg = readJson(join(root, 'package.json'))
const manifest = readJson(join(root, 'manifest.json'))
const distManifest = existsSync(join(root, 'dist', 'manifest.json'))
  ? readJson(join(root, 'dist', 'manifest.json'))
  : null

// ---- 版本一致性 ----
if (pkg.version !== manifest.version)
  fail(`package.json(${pkg.version}) 与 manifest.json(${manifest.version}) 版本不一致`)
if (distManifest && distManifest.version !== manifest.version)
  fail(`dist/manifest.json(${distManifest.version}) 与源码 manifest 版本不一致`)
if (tagArgument) {
  const tagVersion = tagArgument.replace(/^v/, '')
  if (tagVersion !== manifest.version) fail(`Git Tag ${tagArgument} 与 manifest 版本 ${manifest.version} 不一致`)
}
if (!distManifest) fail('dist/manifest.json 不存在，先执行 pnpm build')

// ---- 构建产物清单 ----
const artifactManifest = existsSync(join(reportDir, 'artifact-manifest.json'))
  ? readJson(join(reportDir, 'artifact-manifest.json'))
  : null
if (!artifactManifest) fail('缺少 test-results/ci/artifact-manifest.json，先执行 pnpm verify:dist')

// ---- 测试摘要 ----
const summary = existsSync(join(reportDir, 'summary.json')) ? readJson(join(reportDir, 'summary.json')) : null

// ---- 发布产物 ----
const archives = ['patmail-source.zip', 'patmail-delivery.zip'].map(name => {
  const path = join(root, 'test-results', name)
  const present = existsSync(path)
  if (!present) fail(`发布产物缺失：${name}（先执行 pnpm pack:source / pnpm pack:delivery）`)
  return { name, present, bytes: present ? statSync(path).size : 0 }
})

const git = command => {
  try {
    return execSync(command, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  version: manifest.version,
  tag: tagArgument || null,
  commit: git('git rev-parse HEAD'),
  branch: git('git rev-parse --abbrev-ref HEAD'),
  environment: {
    node: process.version,
    packageManager: pkg.packageManager ?? null,
    platform: `${process.platform} ${process.arch}`,
    buildCommand: pkg.scripts?.build ?? null,
  },
  testSummary: summary
    ? {
        overall: summary.overall,
        rows: Object.fromEntries(Object.entries(summary.rows).map(([name, row]) => [name, row.status])),
      }
    : null,
  artifacts: artifactManifest
    ? {
        fileCount: artifactManifest.fileCount,
        combinedDigest: artifactManifest.combinedDigest,
        digest: artifactManifest.files.map(item => ({ path: item.path, sha256: item.sha256 })),
      }
    : null,
  archives,
  problems,
}
mkdirSync(reportDir, { recursive: true })
writeFileSync(join(reportDir, 'release-report.json'), `${JSON.stringify(report, null, 2)}\n`)

console.log(
  `发布前校验：版本 ${report.version}${report.tag ? `（tag ${report.tag}）` : ''}，commit ${report.commit.slice(0, 12)}。`,
)
if (report.artifacts)
  console.log(
    `  · 构建产物 ${report.artifacts.fileCount} 文件，组合摘要 ${report.artifacts.combinedDigest.slice(0, 16)}…`,
  )
if (report.testSummary) console.log(`  · 测试摘要：${report.testSummary.overall}`)
for (const archive of report.archives)
  console.log(`  · ${archive.name}：${archive.present ? `${archive.bytes} 字节` : '缺失'}`)
if (problems.length > 0) {
  for (const message of problems) console.error(`✗ ${message}`)
  console.error('发布前校验失败。')
  process.exit(1)
}
console.log('发布前校验通过（不含签名与发布动作）。')
