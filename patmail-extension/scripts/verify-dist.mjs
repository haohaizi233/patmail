#!/usr/bin/env node
/**
 * 构建产物完整性与交付安全校验（Phase 7 的 pnpm verify:dist）。
 *
 * 对着 dist/ 实际文件检查：
 *   1. 构建文件完整（入口、图标、静态资源、许可文本）；
 *   2. Manifest 指向的入口都存在；
 *   3. Node.js 运行时依赖没有误入扩展（node: 内置模块、process.binding）；
 *   4. Python 桥接没有被当成正式依赖（.py / .ps1 / local-download/）；
 *   5. 没有敏感密钥（文件名规则 + PEM/Token 内容规则）；
 *   6. 没有测试夹具混入（tests/ fixtures/ *.test.*）；
 *   7. 关键静态资源完整；
 *   8. 浏览器能否加载由 E2E Smoke（tests/e2e/extension.e2e.mjs）真实覆盖，这里保证加载前提成立。
 *
 * 同时产出 SHA-256 校验清单，供发布追溯使用。
 * 用法：pnpm verify:dist；node scripts/verify-dist.mjs --delivery 强制交付校验（禁止占位豁免）
 * 产出：test-results/ci/dist-report.json、test-results/ci/artifact-manifest.json
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { forbiddenDeliveryName } from './delivery-guard.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const distDir = join(root, 'dist')
const reportDir = join(root, 'test-results', 'ci')
const publicRelease = process.argv.includes('--public')
const modelEnvironments = [process.env]
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  const path = join(root, name)
  if (existsSync(path)) modelEnvironments.push(parseEnv(readFileSync(path, 'utf8')))
}
const retiredModelKeys = modelEnvironments
  .flatMap(env => ['VITE_AGENT_DEFAULT_KEY', 'VITE_AGENT_FALLBACK_KEY'].map(name => env[name]?.trim()))
  .filter(Boolean)
  .flatMap(key => {
    const quoted = JSON.stringify(key)
    // Short historical values can occur inside unrelated words or numbers.
    return key.length >= 12
      ? [key, quoted.slice(1, -1)]
      : [quoted, `'${key.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`, `\`${key}\``]
  })

const REQUIRED_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'app.html',
  'popup.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'assets/sme-customers.json',
  'licenses/zip.js.txt',
  '使用说明.txt',
]
const FORBIDDEN_DIR_NAMES = new Set([
  'node_modules',
  'local-download',
  'tests',
  'test',
  'fixtures',
  '__pycache__',
  '.git',
])
const FORBIDDEN_FILE_RULES = [
  { test: /\.py$/i, reason: 'Python 桥接脚本不能进交付产物' },
  { test: /\.ps1$/i, reason: 'PowerShell 调试脚本不能进交付产物' },
  { test: /\.(test|spec)\.[cm]?[jt]s$/i, reason: '测试文件不能进交付产物' },
  { test: /^\.env(\..*)?$/i, reason: '环境变量文件不能进交付产物' },
  { test: /^cookies\.txt$/i, reason: 'Cookie 文件不能进交付产物' },
  { test: /\.(pem|key|p12|pfx)$/i, reason: '私钥/证书文件不能进交付产物' },
]
const NODE_RUNTIME_PATTERNS = [
  { pattern: /from\s+['"]node:/, reason: '引用 Node.js 内置模块' },
  { pattern: /require\(\s*['"]node:/, reason: '引用 Node.js 内置模块' },
  {
    pattern: /require\(\s*['"](fs|path|child_process|http|https|net|os|crypto)['"]\s*\)/,
    reason: '引用 Node.js 运行时模块',
  },
  { pattern: /process\.binding\(/, reason: '调用 process.binding' },
]
const SECRET_PATTERNS = [
  { rule: 'private-key-pem', pattern: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY(?: BLOCK)?-----/ },
  { rule: 'github-token', pattern: /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/ },
  { rule: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/ },
  { rule: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
]

const problems = []
const records = []
const fail = message => problems.push(message)
const note = message => records.push(message)

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(absolute))
    else files.push(absolute)
  }
  return files
}

if (!existsSync(distDir)) {
  console.error('dist/ 不存在，先执行 pnpm build。')
  process.exit(1)
}

const files = walk(distDir).sort()
const relativeNames = files.map(file => relative(distDir, file).replaceAll('\\', '/'))

// ---- 1/2/7. 入口与关键静态资源完整 ----
const distManifestPath = join(distDir, 'manifest.json')
if (!existsSync(distManifestPath)) {
  fail('dist/manifest.json 不存在')
} else {
  const manifest = JSON.parse(readFileSync(distManifestPath, 'utf8'))
  const referenced = [
    manifest.background?.service_worker,
    ...(manifest.content_scripts ?? []).flatMap(item => [...(item.js ?? []), ...(item.css ?? [])]),
    ...Object.values(manifest.icons ?? {}),
    ...(manifest.action?.default_icon ? Object.values(manifest.action.default_icon) : []),
    ...(manifest.web_accessible_resources ?? []).flatMap(item =>
      (item.resources ?? []).filter(name => !name.includes('*')),
    ),
  ].filter(Boolean)
  for (const name of referenced) {
    if (!relativeNames.includes(name.replaceAll('\\', '/'))) fail(`Manifest 引用的文件缺失：${name}`)
  }
  note(`Manifest 引用 ${referenced.length} 个文件，逐一确认存在`)
}
for (const name of REQUIRED_FILES) {
  if (!relativeNames.includes(name)) fail(`构建产物缺关键文件：${name}`)
}
const avatarCount = relativeNames.filter(name => name.startsWith('avatars/avatar-')).length
if (avatarCount < 20) fail(`avatars 目录不完整（${avatarCount} 个，预期 ≥20）`)
else note(`avatars 共 ${avatarCount} 个头像资源`)

// ---- 中小客户快照：占位内容不得混入正式交付 ----
// 真实名单由 scripts/pull-sme-customers.py 生成（敏感数据不入仓）；无数据环境（CI / SME_SNAPSHOT_STUB=1）
// 走 ensure-sme-snapshot.mjs 的空占位（"stub": true）。占位构建只允许显式豁免的环境，其余一律拦下。
const smeSnapshotPath = join(distDir, 'assets', 'sme-customers.json')
if (existsSync(smeSnapshotPath)) {
  let snapshot = null
  try {
    snapshot = JSON.parse(readFileSync(smeSnapshotPath, 'utf8'))
  } catch {
    fail('assets/sme-customers.json 不是合法 JSON')
  }
  if (publicRelease) {
    const fields = snapshot && Object.keys(snapshot).sort().join(',')
    if (
      fields !== 'count,customers,stub,takenAt' ||
      snapshot.stub !== true ||
      snapshot.count !== 0 ||
      snapshot.takenAt !== '' ||
      !Array.isArray(snapshot.customers) ||
      snapshot.customers.length !== 0
    ) {
      fail('公开发布只允许标准空客户快照。请在干净检出中启用 SME_SNAPSHOT_STUB=1 重新构建。')
    } else {
      note('公开发布客户快照：空占位，无本地客户记录')
    }
  } else if (snapshot) {
    const isStub = snapshot.stub === true || (Array.isArray(snapshot.customers) && snapshot.customers.length === 0)
    if (isStub) {
      const message =
        'assets/sme-customers.json 是占位快照（不含真实客户名单），不可交付：正式交付前在有数据库权限的机器上跑 scripts/pull-sme-customers.py 后重新构建'
      if (!process.argv.includes('--delivery') && process.env.SME_SNAPSHOT_STUB === '1') note(`⚠ ${message}`)
      else fail(message)
    } else if (Array.isArray(snapshot.customers)) {
      note(`中小客户快照含 ${snapshot.customers.length} 条客户记录（takenAt ${snapshot.takenAt ?? '未知'}）`)
    }
  }
}

// ---- 3-6. 交付禁入物 ----
for (const name of relativeNames) {
  const segments = name.split('/')
  const base = segments[segments.length - 1]
  if (segments.some(segment => FORBIDDEN_DIR_NAMES.has(segment))) fail(`交付产物含禁入目录路径：${name}`)
  for (const rule of FORBIDDEN_FILE_RULES) {
    if (rule.test.test(base)) fail(`${rule.reason}：${name}`)
  }
  const blocked = forbiddenDeliveryName(base)
  if (blocked) fail(`交付产物含禁入文件（${blocked}）：${name}`)
}
for (const file of files) {
  const name = relative(distDir, file).replaceAll('\\', '/')
  if (retiredModelKeys.length && /\.(?:[cm]?js|json|html|map|css|txt)$/i.test(name)) {
    const artifact = readFileSync(file)
    if (retiredModelKeys.some(key => artifact.includes(key))) {
      fail(`交付产物含已退役的模型凭据：${name}`)
    }
  }
  if (statSync(file).size > 8 * 1024 * 1024) continue
  if (!/\.(js|mjs|cjs|json|html|css|txt)$/i.test(name)) continue
  const text = readFileSync(file, 'utf8')
  for (const rule of NODE_RUNTIME_PATTERNS) {
    if (rule.pattern.test(text)) fail(`${rule.reason}：${name}`)
  }
  for (const rule of SECRET_PATTERNS) {
    if (rule.pattern.test(text)) fail(`交付产物含疑似密钥（${rule.rule}）：${name}`)
  }
  if (name === 'package.json') fail('dist 根目录不应出现 package.json（避免被当成 Node 包）')
}

// ---- SHA-256 清单 ----
const artifacts = files.map(file => {
  const data = readFileSync(file)
  return {
    path: relative(distDir, file).replaceAll('\\', '/'),
    size: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  }
})

// ---- 留档比对（--against <artifact-manifest.json>）：先于自产清单执行 ----
// 自产清单只保证本次构建内部一致，「篡改任一字节」要靠与上一次留档清单比对发现。
const againstIndex = process.argv.indexOf('--against')
if (againstIndex !== -1) {
  const againstPath = process.argv[againstIndex + 1]
  if (!againstPath || !existsSync(againstPath)) {
    console.error('用法：node scripts/verify-dist.mjs --against <已留档的 artifact-manifest.json>')
    process.exit(1)
  }
  const recorded = JSON.parse(readFileSync(againstPath, 'utf8'))
  const current = new Map(artifacts.map(item => [item.path, item.sha256]))
  for (const item of recorded.files ?? []) {
    const now = current.get(item.path)
    if (!now) fail(`留档清单中的文件缺失：${item.path}`)
    else if (now !== item.sha256) fail(`文件内容与留档 SHA-256 清单不一致：${item.path}`)
  }
  const recordedPaths = new Set((recorded.files ?? []).map(item => item.path))
  for (const item of artifacts) {
    if (!recordedPaths.has(item.path)) fail(`出现留档清单之外的新文件：${item.path}`)
  }
  note(`留档 SHA-256 清单比对 ${recordedPaths.size} 个文件，逐一比对哈希`)
}

const combined = createHash('sha256')
for (const item of artifacts) combined.update(`${item.path}\n${item.sha256}\n`)
const artifactManifest = {
  generatedAt: new Date().toISOString(),
  fileCount: artifacts.length,
  totalBytes: artifacts.reduce((sum, item) => sum + item.size, 0),
  combinedDigest: combined.digest('hex'),
  files: artifacts,
}
mkdirSync(reportDir, { recursive: true })
writeFileSync(join(reportDir, 'artifact-manifest.json'), `${JSON.stringify(artifactManifest, null, 2)}\n`)

const report = {
  generatedAt: new Date().toISOString(),
  fileCount: artifacts.length,
  combinedDigest: artifactManifest.combinedDigest,
  problems,
  records,
}
writeFileSync(join(reportDir, 'dist-report.json'), `${JSON.stringify(report, null, 2)}\n`)

if (problems.length > 0) {
  for (const message of problems) console.error(`✗ ${message}`)
  console.error(`构建产物校验失败：${problems.length} 个问题。`)
  process.exit(1)
}
for (const message of records) console.log(`  · ${message}`)
console.log(
  `构建产物校验通过：${artifacts.length} 个文件，组合摘要 ${artifactManifest.combinedDigest.slice(0, 16)}…（清单见 test-results/ci/artifact-manifest.json）。`,
)
