#!/usr/bin/env node
/**
 * E2E 分组执行器（PR Smoke / Full E2E / Legacy Compatibility）。
 *
 * 每个 *.e2e.mjs 都是独立进程、独立扩展副本（tests/e2e/support/paths.mjs 用 mkdtemp 隔离
 * dist 与下载目录），端口全部走 listen(0) 动态分配，因此串行执行即可保证互不干扰。
 *
 * 分组（详见 docs/ci/e2e-matrix.md）：
 *   smoke  = 扩展启动 + Service Worker + EASY 绑定 + 文件查询 + 期限查询（PR 快速门禁）
 *   full   = smoke + 全页工作台场景（workspace，已知红，见 docs/ci/e2e-matrix.md）
 *            + 原生下载 / ZIP / 取消 / 续传 / 分页 / 故障注入等完整场景
 *   legacy = 旧 Python 桥接下载协议兼容（127.0.0.1:42843）+ 桥接单元测试
 *
 * 用法：node scripts/run-e2e.mjs [smoke|full|legacy|all|<suite 名>] [--bail]
 * 产出：test-results/ci/e2e-<group>.json
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const reportDir = join(root, 'test-results', 'ci')

// needs：python = 需要 python 命令（ZIP 校验 / 桥接）；bridge = 需要 scripts/stream-download-bridge.py。
const SUITES = {
  extension: { file: 'tests/e2e/extension.e2e.mjs', needs: [] },
  workspace: { file: 'tests/e2e/workspace.e2e.mjs', needs: [] },
  limits: { file: 'tests/e2e/limit-query.e2e.mjs', needs: [] },
  download: { file: 'tests/e2e/download.e2e.mjs', needs: [] },
  'browser-download': { file: 'tests/e2e/native-browser-download.e2e.mjs', needs: [] },
  'file-pages': { file: 'tests/e2e/file-pages.e2e.mjs', needs: [] },
  'download-editor': { file: 'tests/e2e/download-editor.e2e.mjs', needs: [] },
  'browser-download-store': { file: 'tests/e2e/browser-download-store.e2e.mjs', needs: [] },
  'native-stream-lifetime': { file: 'tests/e2e/native-stream-lifetime.e2e.mjs', needs: [] },
  'native-pipeline-fault': { file: 'tests/e2e/native-pipeline-fault.e2e.mjs', needs: [] },
  'resume-protocol': { file: 'tests/e2e/resume-protocol.e2e.mjs', needs: [] },
  docs: { file: 'tests/e2e/docs.e2e.mjs', needs: [] },
  'stream-download': { file: 'tests/e2e/stream-download.e2e.mjs', needs: ['python', 'bridge'] },
  'durable-download': { file: 'tests/e2e/durable-download.e2e.mjs', needs: ['python', 'bridge'] },
  'stream-bridge-unittest': {
    command: 'python -m unittest discover -s tests -p *bridge_test.py',
    needs: ['python'],
    description: 'Python 桥接协议单元测试',
  },
}
const GROUPS = {
  smoke: ['extension', 'limits'],
  full: [
    'extension',
    'limits',
    'workspace',
    'download',
    'browser-download',
    'file-pages',
    'download-editor',
    'browser-download-store',
    'native-stream-lifetime',
    'native-pipeline-fault',
    'resume-protocol',
    'docs',
  ],
  legacy: ['stream-download', 'durable-download', 'stream-bridge-unittest'],
}

const args = process.argv.slice(2)
const bail = args.includes('--bail')
const requested = args.filter(item => !item.startsWith('--'))[0] ?? 'smoke'

let selection
let group
if (GROUPS[requested]) {
  group = requested
  selection = GROUPS[requested]
} else if (SUITES[requested]) {
  group = requested
  selection = [requested]
} else if (requested === 'all') {
  group = 'all'
  selection = [...new Set(Object.values(GROUPS).flat())]
} else {
  console.error(
    `未知分组或场景：${requested}（可选：${[...Object.keys(GROUPS), 'all', ...Object.keys(SUITES)].join(' / ')}）`,
  )
  process.exit(2)
}

// ---- 前置条件 ----
const problems = []
if (!existsSync(join(root, 'dist', 'manifest.json'))) problems.push('dist/ 不存在，先执行 pnpm build。')
const needsPython = selection.some(name => SUITES[name].needs.includes('python'))
if (needsPython) {
  const probe = spawnSync('python', ['--version'], { encoding: 'utf8' })
  if (probe.status !== 0) problems.push('本组用例需要 python 命令（ZIP 校验 / 旧桥接协议），当前环境没有。')
}
for (const name of selection) {
  if (SUITES[name].needs.includes('bridge') && !existsSync(join(root, 'scripts', 'stream-download-bridge.py'))) {
    problems.push(`${name} 需要 scripts/stream-download-bridge.py，文件缺失。`)
  }
  if (SUITES[name].file && !existsSync(join(root, SUITES[name].file))) {
    problems.push(`${name} 的脚本缺失：${SUITES[name].file}`)
  }
}
if (problems.length > 0) {
  for (const message of problems) console.error(`✗ ${message}`)
  mkdirSync(reportDir, { recursive: true })
  writeFileSync(
    join(reportDir, `e2e-${group}.json`),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), group, status: 'blocked', problems, suites: [] }, null, 2)}\n`,
  )
  console.error('E2E 前置条件不满足，记为 BLOCKED，不能当作通过。')
  process.exit(1)
}

// ---- 串行执行 ----
const results = []
for (const name of selection) {
  const suite = SUITES[name]
  const command = suite.command ?? `node ${suite.file}`
  console.log(`\n=== [E2E:${group}] ${name} ===`)
  const startedAt = new Date().toISOString()
  const started = Date.now()
  const run = spawnSync(command, { cwd: root, shell: true, stdio: 'inherit' })
  const durationMs = Date.now() - started
  const status = run.status === 0 ? 'pass' : 'fail'
  results.push({
    name,
    command,
    status,
    exitCode: run.status ?? 1,
    durationMs,
    startedAt,
    finishedAt: new Date().toISOString(),
  })
  console.log(`=== [E2E:${group}] ${name} ${status.toUpperCase()}（${(durationMs / 1000).toFixed(1)}s）===`)
  if (status === 'fail' && bail) break
}

const failed = results.filter(item => item.status === 'fail')
const report = {
  generatedAt: new Date().toISOString(),
  group,
  status: failed.length === 0 ? 'pass' : 'fail',
  scenarios: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  suites: results,
}
mkdirSync(reportDir, { recursive: true })
writeFileSync(join(reportDir, `e2e-${group}.json`), `${JSON.stringify(report, null, 2)}\n`)

console.log(`\nE2E 分组 ${group}：${report.passed}/${report.scenarios} 通过。`)
if (failed.length > 0) {
  console.error(`失败场景：${failed.map(item => item.name).join(', ')}`)
  process.exit(1)
}
