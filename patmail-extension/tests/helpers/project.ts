import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 测试专用的项目路径解析。
 *
 * 测试文件分布在 tests/ 的多层目录里，直接用 `../src` 或 `process.cwd()` 推算
 * 项目根目录会在移动文件后失效。这里从当前文件向上找到最近的 package.json，
 * 即 patmail-extension 的项目根目录。
 */
function findProjectRoot(start: string): string {
  let dir = start
  for (let step = 0; step < 8; step += 1) {
    if (existsSync(resolve(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('找不到 patmail-extension 项目根目录')
}

export const projectRoot = findProjectRoot(dirname(fileURLToPath(import.meta.url)))

/** 相对项目根目录拼路径 */
export const projectPath = (...segments: string[]): string => resolve(projectRoot, ...segments)

/** 相对 src/ 拼路径 */
export const srcPath = (...segments: string[]): string => resolve(projectRoot, 'src', ...segments)

/** EASY 接口文档位于工程根目录的同级 API/ 目录 */
export const apiDocsPath = (...segments: string[]): string => resolve(projectRoot, '..', 'API', ...segments)
