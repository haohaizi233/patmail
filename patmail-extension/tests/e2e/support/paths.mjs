import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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
// 路径决定解压扩展的 Origin。每次隔离，避免夹具账号撤销真实用户的下载授权。
function isolatedDist() {
  const source = path.join(projectRoot, 'dist')
  if (!existsSync(source)) throw new Error('请先构建扩展 dist，再运行浏览器测试。')
  mkdirSync(testResultsDir, { recursive: true })
  const target = mkdtempSync(path.join(testResultsDir, 'extension-'))
  cpSync(source, target, { recursive: true })
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
  return path.join(testResultsDir, name)
}
