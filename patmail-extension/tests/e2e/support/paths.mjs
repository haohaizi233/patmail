import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 项目根一律从本模块向上找最近的 package.json 推算，脚本不再用"自身目录上一级"硬猜。
const supportDir = path.dirname(fileURLToPath(import.meta.url))

function findProjectRoot(startDir) {
  let dir = startDir
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error('找不到 package.json，无法定位 patmail-extension 项目根目录。')
    dir = parent
  }
}

export const projectRoot = findProjectRoot(supportDir)
export const testResultsDir = path.join(projectRoot, 'test-results')
// test-results 目录约定：
//   ci/ junit/ coverage/  CI 规范产物（ci-check / vitest / vitest --coverage 写）
//   delivery/             pack-delivery / pack-source 打包产物
//   tmp/                  e2e 一次性临时目录（扩展副本、浏览器 profile、下载落盘），24h 自动清理
//   reports/              e2e / 审计脚本产出的 json、png 报告（resultPath 统一指向）
//   logs/ debug/ live/    归档性质：历史日志、一次性探针脚本、手动调试 profile。
export const e2eTmpDir = path.join(testResultsDir, 'tmp')
export const reportsDir = path.join(testResultsDir, 'reports')
// tmp/ 保留策略与 CDP 观察者日志一致：只保留最近 24 小时，过期条目在下次新建副本时顺手清理。
// 按修改时间淘汰：正在运行的 e2e 临时目录都是刚创建的，不会被误删；单个清理失败也不影响测试。
const TMP_RETENTION_MS = 24 * 60 * 60 * 1000

function pruneStaleTmpEntries(now = Date.now()) {
  try {
    const cutoff = now - TMP_RETENTION_MS
    for (const item of readdirSync(e2eTmpDir, { withFileTypes: true })) {
      const candidate = path.join(e2eTmpDir, item.name)
      if (statSync(candidate).mtimeMs > cutoff) continue
      rmSync(candidate, { recursive: true, force: true, maxRetries: 2 })
    }
  } catch {
    // 清理属于尽力而为：目录可能正被并行 e2e 进程占用，留给下一轮再清。
  }
}

/** e2e 一次性临时目录统一落 test-results/tmp/，按前缀隔离。 */
export function tmpPath(name) {
  mkdirSync(e2eTmpDir, { recursive: true })
  return path.join(e2eTmpDir, name)
}
// 路径决定解压扩展的 Origin。每次隔离，避免夹具账号撤销真实用户的下载授权。
function isolatedDist() {
  const source = path.join(projectRoot, 'dist')
  if (!existsSync(source)) throw new Error('请先构建扩展 dist，再运行浏览器测试。')
  const target = mkdtempSync(tmpPath('extension-'))
  cpSync(source, target, { recursive: true })
  pruneStaleTmpEntries()
  if (process.env.PATMAIL_TEST_BRIDGE_PORT) {
    const port = Number(process.env.PATMAIL_TEST_BRIDGE_PORT)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('测试桥接端口无效。')
    const patch = directory => {
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, item.name)
        if (item.isDirectory()) patch(file)
        else if (item.name.endsWith('.js')) {
          const before = readFileSync(file, 'utf8')
          const after = before.replaceAll('http://127.0.0.1:42843', `http://127.0.0.1:${port}`)
          if (before !== after) writeFileSync(file, after)
        }
      }
    }
    patch(target)
  }
  return target
}
export const distDir = path.resolve(process.env.PATMAIL_TEST_DIST || isolatedDist())
export const fixturesDir = path.join(projectRoot, 'tests', 'fixtures')
export const fixturePagePath = path.join(fixturesDir, 'page.html')
export const docsWorkflowsDir = path.join(projectRoot, 'docs', 'workflows')

export function resultPath(name) {
  return path.join(reportsDir, name)
}
