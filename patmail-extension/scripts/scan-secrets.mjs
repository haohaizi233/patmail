#!/usr/bin/env node
/**
 * 密钥与敏感信息扫描（Phase 5 的 Secret Scanning）。
 *
 * 模式：
 *   pnpm scan:secrets                 # 扫描工作树（PR 门禁用，快）
 *   pnpm scan:secrets --history       # 扫描全部 Git 历史补丁（一次性审计 / 定期安全任务）
 *   pnpm scan:secrets --write-baseline # 把当前发现写入 ci/secret-allowlist.json（必须人工填 reason）
 *
 * 规则分层：
 *   error：私钥、Token、Cookie/Authorization、AKIA、JWT、禁入文件名（*.pem / credentials.json …）
 *   warn ：业务数据（HAR/ DOM/ API/ UI/ 客户名单 JSON）里的个人信息，登记审计记录，不打印正文
 * 例外管理：ci/secret-allowlist.json 按「指纹 + 失效日期」登记，逾期未续期即重新失败。
 * 报告只写指纹，绝不写密钥正文。
 *
 * 产出：test-results/ci/secret-scan.json
 */
import { createHash } from 'node:crypto'
import { execSync, spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const repoRoot = execSync('git rev-parse --show-toplevel', { cwd: root, encoding: 'utf8' }).trim()
const reportDir = join(root, 'test-results', 'ci')
const allowlistPath = join(root, 'ci', 'secret-allowlist.json')
const mode = process.argv.includes('--history') ? 'history' : 'tree'
const writeBaseline = process.argv.includes('--write-baseline')

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '__pycache__',
  '.idea',
  'test-results',
  'coverage',
  'delivery',
  '_diff_tmp',
  'dist',
  '.pnpm',
])
const MAX_FILE_BYTES = 8 * 1024 * 1024

// 业务数据目录：个人信息登记为 warn（已登记资产），凭据仍然是 error。路径相对 Git 仓库根。
const BUSINESS_DATA_DIRS = [
  'HAR/',
  'DOM/',
  'API/',
  'UI/',
  'public/assets/',
  'patmail-extension/src/assets/',
  'patmail-extension/public/assets/',
]
const isBusinessData = name => BUSINESS_DATA_DIRS.some(prefix => name.startsWith(prefix))
const isTestData = name => name.split('/').includes('tests')

// ---- 内容规则 ----
// 顺序即优先级：越具体的规则越靠前，generic 兜底。
const CONTENT_RULES = [
  { rule: 'private-key-pem', severity: 'error', pattern: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY(?: BLOCK)?-----/ },
  { rule: 'certificate-pem', severity: 'warn', pattern: /-----BEGIN [A-Z0-9 ]*CERTIFICATE-----/ },
  {
    rule: 'github-token',
    severity: 'error',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  },
  { rule: 'aws-access-key', severity: 'error', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { rule: 'slack-token', severity: 'error', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { rule: 'jwt', severity: 'error', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  {
    rule: 'bearer-auth-header',
    severity: 'error',
    pattern: /Authorization["']?\s*[:=]\s*["']?(?:Bearer|Basic)\s+[A-Za-z0-9+/._-]{8,}/i,
  },
  {
    rule: 'cookie-header',
    severity: 'error',
    pattern:
      /["']?(?:set-cookie|cookie)["']?\s*[:=]\s*["']?[^"'\n]*(?:sess|token|sid|jsessionid|asp\.net_sessionid)[^"'\n]*=[^;"'\n]{8,}/i,
  },
  {
    rule: 'generic-api-key',
    severity: 'error',
    pattern:
      /\b(?:api[_-]?key|secret|access[_-]?token|password|passwd|credential)\b\s*[:=]\s*["']?[A-Za-z0-9+/_-]{20,}["']?/i,
  },
  { rule: 'pii-email', severity: 'warn', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { rule: 'pii-phone', severity: 'warn', pattern: /\b1[3-9]\d{9}\b/ },
]
// ---- 文件名规则（含 Git 历史里的路径）----
const NAME_RULES = [
  { rule: 'name-private-key', severity: 'error', pattern: /\.(pem|key|p12|pfx)$/i },
  {
    rule: 'name-credentials',
    severity: 'error',
    pattern: /(^|\/)(credentials\.json|cookies\.txt|id_token.*|.*\.pem)$/i,
  },
  { rule: 'name-env-file', severity: 'error', pattern: /(^|\/)\.env(\..*)?$/i },
]

const normalizePath = name => name.replaceAll(sep, '/').replace(/^\.\//, '')
const fingerprint = text => createHash('sha256').update(text.trim()).digest('hex').slice(0, 16)

const findings = []
const seen = new Set()
function record({ file, line, rule, severity, matched, note }) {
  const fp = fingerprint(`${rule}|${matched}`)
  const key = `${fp}|${file}|${line}`
  if (seen.has(key)) return
  seen.add(key)
  findings.push({ file, line, rule, severity, fingerprint: fp, ...(note ? { note } : {}) })
}

function scanText(file, text, startLine = 1) {
  const name = normalizePath(file)
  if (name.endsWith('secret-allowlist.json')) return
  const business = isBusinessData(name)
  const testCode = isTestData(name)
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    for (const rule of CONTENT_RULES) {
      const match = rule.pattern.exec(line)
      if (!match) continue
      // 测试代码里的"示例凭据形状"降级为 warn；真实密钥形状（PEM/AKIA/JWT…）仍为 error。
      let severity = rule.severity
      if (testCode && rule.rule === 'generic-api-key') severity = 'warn'
      if (business && rule.rule === 'generic-api-key') severity = 'warn'
      record({ file: name, line: startLine + index, rule: rule.rule, severity, matched: match[0] })
      break // 每行只记最先命中的规则
    }
  }
}

function scanName(name) {
  const normalized = normalizePath(name)
  for (const rule of NAME_RULES) {
    if (rule.pattern.test(normalized)) {
      record({
        file: normalized,
        line: 0,
        rule: rule.rule,
        severity: rule.severity,
        matched: normalized,
        note: '文件名规则命中',
      })
    }
  }
}

// ---- 工作树扫描（Git 口径：已跟踪 + 未忽略的未跟踪文件；本地被 .gitignore 排除的文件不入库，自然不在扫描面）----
async function scanTree() {
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (listed.status !== 0) {
    console.error(listed.stderr || 'git ls-files 失败。')
    process.exit(1)
  }
  const names = listed.stdout.split('\0').filter(Boolean)
  let scanned = 0
  for (const name of names) {
    const rel = normalizePath(name)
    if (rel.split('/').some(segment => SKIP_DIRS.has(segment))) continue
    scanName(rel)
    const absolute = join(repoRoot, name)
    if (!existsSync(absolute)) continue // 历史残留索引项
    if (statSync(absolute).size > MAX_FILE_BYTES) continue
    const head = readFileSync(absolute).subarray(0, 1024)
    if (head.includes(0)) continue // 二进制文件只做文件名规则
    scanText(rel, readFileSync(absolute, 'utf8'))
    scanned += 1
  }
  return scanned
}

// ---- Git 历史扫描（一次进程，流式解析补丁）----
async function scanHistory() {
  return await new Promise((resolve, reject) => {
    const child = spawn('git', ['log', '--all', '-p', '--no-color', '--no-renames'], { cwd: repoRoot })
    const lines = createInterface({ input: child.stdout })
    let currentFile = ''
    let newLine = 0
    let scannedCommits = 0
    let inHunk = false
    lines.on('line', line => {
      if (line.startsWith('commit ')) {
        scannedCommits += 1
        inHunk = false
        return
      }
      const fileHeader = /^\+\+\+ b\/(.+)$/.exec(line)
      if (fileHeader) {
        currentFile = normalizePath(fileHeader[1])
        scanName(currentFile)
        inHunk = false
        return
      }
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
      if (hunk) {
        newLine = Number(hunk[1])
        inHunk = true
        return
      }
      if (!inHunk || !currentFile) return
      if (line.startsWith('+')) {
        scanText(currentFile, line.slice(1), newLine)
        newLine += 1
      } else if (!line.startsWith('-')) {
        newLine += 1
      }
    })
    lines.on('close', () => resolve(scannedCommits))
    child.on('error', reject)
    child.stderr.resume()
  })
}

// ---- 执行扫描 ----
const scannedUnits = mode === 'history' ? await scanHistory() : await scanTree()

// ---- 例外登记 ----
const allowlist = existsSync(allowlistPath)
  ? JSON.parse(readFileSync(allowlistPath, 'utf8'))
  : { meta: {}, entries: [] }
const today = new Date().toISOString().slice(0, 10)
const allowlisted = []
const violations = []
for (const finding of findings) {
  const entry = (allowlist.entries ?? []).find(
    item => item.fingerprint === finding.fingerprint && (!item.file || normalizePath(item.file) === finding.file),
  )
  if (entry && entry.expires >= today) {
    allowlisted.push({ ...finding, reason: entry.reason, expires: entry.expires })
    continue
  }
  if (entry && entry.expires < today) {
    violations.push({ ...finding, problem: `例外已过期（${entry.expires}），需要复审续期或整改` })
    continue
  }
  violations.push(finding)
}

const errorCount = violations.filter(item => item.severity === 'error').length
const warnCount = findings.filter(
  item =>
    item.severity === 'warn' &&
    !allowlisted.some(allowed => allowed.fingerprint === item.fingerprint && allowed.file === item.file),
).length

if (writeBaseline) {
  // 只登记 error 级历史发现（warn 是审计记录，本来就不拦截）。
  const entries = findings
    .filter(item => item.severity === 'error')
    .map(item => ({
      fingerprint: item.fingerprint,
      rule: item.rule,
      file: item.file,
      reason: 'TODO(人工复审后填写：为什么可以保留、整改计划是什么)',
      addedAt: today,
      expires: new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    }))
  const merged = [...(allowlist.entries ?? [])]
  for (const entry of entries) {
    if (!merged.some(item => item.fingerprint === entry.fingerprint && item.file === entry.file)) merged.push(entry)
  }
  mkdirSync(dirname(allowlistPath), { recursive: true })
  writeFileSync(
    allowlistPath,
    `${JSON.stringify({ meta: { note: '按指纹登记的扫描例外；expires 之后自动重新失败，reason 必须人工填写。' }, entries: merged }, null, 2)}\n`,
  )
  console.log(`已把 ${entries.length} 条发现写入 ${allowlistPath}，请逐条填写 reason 后提交。`)
}

mkdirSync(reportDir, { recursive: true })
const report = {
  generatedAt: new Date().toISOString(),
  mode,
  scanned: { units: scannedUnits, label: mode === 'history' ? '提交补丁' : '文本文件' },
  totals: { findings: findings.length, errors: errorCount, warnings: warnCount, allowlisted: allowlisted.length },
  violations,
  allowlisted,
  warnings: findings.filter(item => item.severity === 'warn'),
}
writeFileSync(join(reportDir, 'secret-scan.json'), `${JSON.stringify(report, null, 2)}\n`)

console.log(
  `密钥扫描（${mode === 'history' ? 'Git 历史' : '工作树'}）：${findings.length} 条发现，${errorCount} 条 error，${warnCount} 条 warn，${allowlisted.length} 条已登记例外。`,
)
for (const item of violations.slice(0, 20)) {
  const marker = item.severity === 'error' ? '✗' : '·'
  console.error(
    `${marker} ${item.severity.toUpperCase()} ${item.rule} ${item.file}${item.line ? `:${item.line}` : ''} [${item.fingerprint}]${item.problem ? ` ${item.problem}` : ''}`,
  )
}
if (violations.length > 20) console.error(`  …其余 ${violations.length - 20} 条见 test-results/ci/secret-scan.json`)
if (errorCount > 0 && !writeBaseline) {
  console.error('密钥扫描失败：新密钥/凭据不得进入仓库。历史存量请走 --write-baseline 登记（含 reason 与失效日期）。')
  process.exit(1)
}
if (writeBaseline) process.exit(0)
console.log('密钥扫描通过。')
