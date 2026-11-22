#!/usr/bin/env node
/**
 * 统一 CI 门禁入口（pnpm ci:check）。
 *
 * 无参数：按顺序跑完全部门禁步骤（失败不中断，最后统一退出码）；
 * --steps a,b,c：只跑指定步骤（GitHub Actions 用它把步骤分发到并行 Job）；
 * --list：列出全部步骤。
 *
 * 每步执行结果写 test-results/ci/steps/<name>.json，汇总写 test-results/ci/ci-check.json，
 * 供 scripts/ci-report.mjs 生成最终报告。任何一步失败都会让 ci:check 以非零退出码结束。
 */
import { spawn } from 'node:child_process'
// eslint-disable-next-line no-unused-vars -- 存量豁免：保留解构占位与接口形态
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const reportDir = join(root, 'test-results', 'ci')
const stepsDir = join(reportDir, 'steps')
mkdirSync(stepsDir, { recursive: true })

const vitest = level =>
  `pnpm test:${level} --reporter=default --reporter=junit --outputFile=test-results/junit/${level}.xml`

// 顺序即执行顺序；GitHub Actions 按名字拆 Job，本地 ci:check 串行跑完。
const STEPS = [
  { name: 'typecheck', command: 'pnpm typecheck', description: 'TypeScript/Vue 静态类型检查' },
  { name: 'architecture', command: 'pnpm architecture:check', description: '架构分层边界与依赖方向门禁' },
  { name: 'lint', command: 'pnpm lint', description: 'ESLint 基线棘轮门禁' },
  { name: 'format', command: 'pnpm format:check', description: 'Prettier 格式检查' },
  { name: 'unit', command: vitest('unit'), description: '单元测试' },
  { name: 'integration', command: vitest('integration'), description: '集成测试' },
  { name: 'regression', command: vitest('regression'), description: '历史业务契约回归' },
  { name: 'build', command: 'pnpm build:ci', description: '扩展构建（vue-tsc + vite 双段）' },
  { name: 'manifest', command: 'pnpm verify:manifest', description: 'Manifest V3 合规校验' },
  { name: 'dist', command: 'pnpm verify:dist', description: '构建产物完整性与交付安全校验' },
  { name: 'secrets', command: 'pnpm scan:secrets', description: '密钥与敏感信息扫描（工作树）' },
  { name: 'licenses', command: 'pnpm licenses:check', description: '直接依赖许可策略检查' },
  { name: 'report', command: 'pnpm ci:report', description: '汇总 CI 报告' },
]

const args = process.argv.slice(2)
if (args.includes('--list')) {
  for (const step of STEPS) console.log(`${step.name.padEnd(12)} ${step.description}（${step.command}）`)
  process.exit(0)
}
const stepsIndex = args.indexOf('--steps')
const selected =
  stepsIndex >= 0 ? args[stepsIndex + 1].split(',').map(item => item.trim()) : STEPS.map(step => step.name)
const unknown = selected.filter(name => !STEPS.some(step => step.name === name))
if (unknown.length > 0) {
  console.error(`未知步骤：${unknown.join(', ')}`)
  process.exit(2)
}

function runStep(step) {
  return new Promise(resolve => {
    const env = { ...process.env }
    if (step.name === 'build' && process.platform === 'win32') env.RAYON_NUM_THREADS ??= '2'
    const child = spawn(step.command, { cwd: root, shell: true, env, stdio: ['inherit', 'pipe', 'pipe'] })
    let resourceError = false
    let spawnError
    for (const [stream, output] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      let tail = ''
      stream.on('data', chunk => {
        const text = tail + chunk.toString()
        resourceError ||=
          /out of memory|zone allocation failed|cannot allocate memory|memory allocation of \d+ bytes failed|ERR_WORKER_OUT_OF_MEMORY/i.test(
            text,
          )
        tail = text.slice(-256)
      })
      stream.pipe(output, { end: false })
    }
    child.on('error', error => {
      spawnError = error.code ?? error.name
    })
    child.on('close', (exitCode, signal) => {
      const failureKind =
        exitCode === 0
          ? undefined
          : resourceError || spawnError === 'ENOMEM'
            ? 'resource'
            : spawnError
              ? 'spawn'
              : signal
                ? 'signal'
                : 'command'
      resolve({ exitCode, signal, spawnError, failureKind })
    })
  })
}

const results = []
for (const name of selected) {
  const step = STEPS.find(item => item.name === name)
  console.log(`\n=== [${step.name}] ${step.description} ===`)
  console.log(`$ ${step.command}`)
  const startedAt = new Date().toISOString()
  const started = Date.now()
  const run = await runStep(step)
  const durationMs = Date.now() - started
  const status = run.exitCode === 0 ? 'pass' : 'fail'
  const result = {
    name: step.name,
    command: step.command,
    status,
    exitCode: run.exitCode,
    signal: run.signal,
    spawnError: run.spawnError,
    failureKind: run.failureKind,
    durationMs,
    startedAt,
    finishedAt: new Date().toISOString(),
  }
  results.push(result)
  writeFileSync(join(stepsDir, `${step.name}.json`), `${JSON.stringify(result, null, 2)}\n`)
  console.log(`=== [${step.name}] ${status.toUpperCase()}（${(durationMs / 1000).toFixed(1)}s）===`)
}

const summary = {
  generatedAt: new Date().toISOString(),
  totalMs: results.reduce((sum, item) => sum + item.durationMs, 0),
  failed: results.filter(item => item.status === 'fail').map(item => item.name),
  steps: results,
}
writeFileSync(join(reportDir, 'ci-check.json'), `${JSON.stringify(summary, null, 2)}\n`)

const failed = summary.failed
console.log(
  `\nci:check 完成：${results.length} 步，${failed.length} 步失败，总耗时 ${(summary.totalMs / 1000).toFixed(1)}s。`,
)
if (failed.length > 0) {
  console.error(`失败步骤：${failed.join(', ')}`)
  process.exit(1)
}
