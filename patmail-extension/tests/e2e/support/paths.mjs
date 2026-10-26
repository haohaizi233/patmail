import { existsSync } from 'node:fs'
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
export const distDir = path.resolve(process.env.PATMAIL_TEST_DIST || path.join(projectRoot, 'dist'))
export const testResultsDir = path.join(projectRoot, 'test-results')
export const fixturesDir = path.join(projectRoot, 'tests', 'fixtures')
export const fixturePagePath = path.join(fixturesDir, 'page.html')
export const docsWorkflowsDir = path.join(projectRoot, 'docs', 'workflows')

export function resultPath(name) {
  return path.join(testResultsDir, name)
}
