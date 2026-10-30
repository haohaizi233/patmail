import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyManifestPlugin } from '../../../vite.manifest'

const io = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  copyFileSync: vi.fn<(from: string, to: string) => void>(),
  readFileSync: vi.fn<(path: string) => Buffer>(),
  renameSync: vi.fn<(from: string, to: string) => void>(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn<(path: string) => void>()
}))
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, ...io, default: { ...actual, ...io } }
})

const root = resolve(import.meta.dirname, '../../..')
const manifest = resolve(root, 'dist/manifest.json')
const sources = [
  ['manifest.json', 'dist/manifest.json'],
  ['delivery/使用说明.txt', 'dist/使用说明.txt'],
  ['node_modules/@zip.js/zip.js/LICENSE', 'dist/licenses/zip.js.txt']
]

function fsError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`filesystem ${code}`), { code })
}

async function writeBundle(): Promise<void> {
  const hook = copyManifestPlugin().writeBundle
  if (typeof hook !== 'function') throw new Error('writeBundle hook missing')
  await (hook as () => void | Promise<void>)()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  io.files.clear()
  for (const [source] of sources) io.files.set(resolve(root, source), Buffer.from(source))
  io.readFileSync.mockImplementation(path => {
    const bytes = io.files.get(path)
    if (!bytes) throw fsError('ENOENT')
    return bytes
  })
  io.copyFileSync.mockImplementation((from, to) => {
    io.files.set(to, Buffer.from(io.readFileSync(from)))
  })
  io.renameSync.mockImplementation((from, to) => {
    io.files.set(to, io.readFileSync(from))
    io.files.delete(from)
  })
  io.rmSync.mockImplementation(path => { io.files.delete(path) })
})
afterEach(() => vi.useRealTimers())

describe('build delivery files under Windows file locks', () => {
  it('retries a transient EBUSY copy and publishes all required files', async () => {
    io.copyFileSync.mockImplementationOnce(() => { throw fsError('EBUSY') })
    const result = expect(writeBundle()).resolves.toBeUndefined()
    await vi.runAllTimersAsync()
    await result
    for (const [source, target] of sources) {
      expect(io.files.get(resolve(root, target))).toEqual(io.files.get(resolve(root, source)))
    }
    expect([...io.files.keys()].some(path => path.endsWith('.tmp'))).toBe(false)
  })

  it('does not overwrite unchanged files even when Windows denies writes', async () => {
    for (const [source, target] of sources) io.files.set(resolve(root, target), io.readFileSync(resolve(root, source)))
    io.copyFileSync.mockImplementation(() => { throw fsError('EBUSY') })
    await writeBundle()
    expect(io.copyFileSync).not.toHaveBeenCalled()
    expect(io.renameSync).not.toHaveBeenCalled()
  })

  it.each(['EBUSY', 'EPERM', 'EACCES'])('retries transient %s replacement while preserving the previous file', async code => {
    io.files.set(manifest, Buffer.from('old manifest'))
    io.renameSync.mockImplementationOnce(() => {
      expect(io.files.get(manifest)?.toString()).toBe('old manifest')
      throw fsError(code)
    })
    const result = expect(writeBundle()).resolves.toBeUndefined()
    await vi.runAllTimersAsync()
    await result
    expect(io.files.get(manifest)?.toString()).toBe('manifest.json')
  })

  it('fails after bounded retries, preserves the old file, and cleans temporary files', async () => {
    io.files.set(manifest, Buffer.from('old manifest'))
    const locked = fsError('EBUSY')
    io.renameSync.mockImplementation(() => { throw locked })
    const started = Date.now()
    const operation = writeBundle()
    const result = expect(operation).rejects.toMatchObject({ code: 'EBUSY' })
    const diagnostic = expect(operation).rejects.toThrow(manifest)
    await vi.runAllTimersAsync()
    await result
    await diagnostic
    expect(Date.now() - started).toBeLessThanOrEqual(5000)
    expect(io.renameSync.mock.calls.length).toBeGreaterThan(1)
    expect(io.renameSync.mock.calls.length).toBeLessThanOrEqual(12)
    expect(io.files.get(manifest)?.toString()).toBe('old manifest')
    expect([...io.files.keys()].some(path => path.endsWith('.tmp'))).toBe(false)
  })

  it('does not retry a missing source or overwrite its previous output', async () => {
    io.files.delete(resolve(root, 'manifest.json'))
    io.files.set(manifest, Buffer.from('old manifest'))
    await expect(writeBundle()).rejects.toMatchObject({ code: 'ENOENT' })
    expect(vi.getTimerCount()).toBe(0)
    expect(io.files.get(manifest)?.toString()).toBe('old manifest')
  })

  it('preserves the original lock error when temporary-file cleanup also fails', async () => {
    io.files.set(manifest, Buffer.from('old manifest'))
    const locked = fsError('EBUSY')
    io.renameSync.mockImplementation(() => { throw locked })
    io.rmSync.mockImplementation(() => { throw fsError('EACCES') })
    const operation = writeBundle()
    const original = expect(operation).rejects.toMatchObject({ code: 'EBUSY', cause: locked })
    const diagnostic = expect(operation).rejects.toThrow('暂存文件未能清理')
    await vi.runAllTimersAsync()
    await original
    await diagnostic
    expect(io.files.get(manifest)?.toString()).toBe('old manifest')
  })
})
