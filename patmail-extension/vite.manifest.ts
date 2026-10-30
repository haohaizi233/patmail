import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Plugin } from 'vite'

const root = import.meta.dirname
const LOCK_ERRORS = new Set(['EBUSY', 'EPERM', 'EACCES'])

function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code : undefined
}

async function retryLocked<T>(operation: () => T, deadline: number): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return operation()
    } catch (error) {
      const remaining = deadline - Date.now()
      if (!LOCK_ERRORS.has(errorCode(error) ?? '') || remaining <= 0) throw error
      await new Promise(resolve => setTimeout(resolve, Math.min(50 * 2 ** attempt, 1000, remaining)))
    }
  }
}

async function copyBuildFile(from: string, to: string, deadline: number): Promise<void> {
  let temporary: string | undefined
  let failure: unknown
  let cleanupFailure: unknown
  try {
    const source = await retryLocked(() => readFileSync(from), deadline)
    const current = await retryLocked(() => {
      try {
        return readFileSync(to)
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return null
        throw error
      }
    }, deadline)
    if (!current?.equals(source)) {
      await retryLocked(() => mkdirSync(dirname(to), { recursive: true }), deadline)
      const staged = `${to}.${randomUUID()}.tmp`
      temporary = staged
      // 只覆盖本次构建拥有的暂存文件；完整复制后才替换正式文件。
      await retryLocked(() => copyFileSync(from, staged), deadline)
      await retryLocked(() => renameSync(staged, to), deadline)
    }
  } catch (error) {
    failure = error
  } finally {
    if (temporary) {
      const staged = temporary
      try {
        await retryLocked(() => rmSync(staged, { force: true }), deadline)
      } catch (error) {
        cleanupFailure = error
      }
    }
  }
  if (failure || cleanupFailure) {
    const cause = failure ?? cleanupFailure
    const code = errorCode(cause)
    const cleanup = cleanupFailure ? `；暂存文件未能清理：${temporary}` : ''
    throw Object.assign(new Error(`构建文件写入失败 (${code ?? 'unknown'})：${from} -> ${to}${cleanup}`, { cause }), { code })
  }
}

/** 两段构建都将 manifest 与交付说明同步到 dist。 */
export function copyManifestPlugin(): Plugin {
  return {
    name: 'copy-manifest',
    async writeBundle() {
      // 三份交付文件共用五秒锁等待时限，持续占用仍明确使构建失败。
      const deadline = Date.now() + 5000
      const from = resolve(root, 'manifest.json')
      const to = resolve(root, 'dist/manifest.json')
      await copyBuildFile(from, to, deadline)
      await copyBuildFile(resolve(root, 'delivery/使用说明.txt'), resolve(root, 'dist/使用说明.txt'), deadline)
      const licenseDir = resolve(root, 'dist/licenses')
      await copyBuildFile(resolve(root, 'node_modules/@zip.js/zip.js/LICENSE'), resolve(licenseDir, 'zip.js.txt'), deadline)
    }
  }
}
