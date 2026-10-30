import { expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { IDBFactory as FakeIDBFactory, IDBKeyRange as FakeKeyRange } from 'fake-indexeddb'
import { createBrowserDownloadStore } from '../../../src/browser-download/store'
import type { BrowserDownloadTask } from '../../../src/browser-download/types'

// jsdom 没有 SubtleCrypto/IndexedDB；store 的摘要与键域分别靠 Node webcrypto 与 fake-indexeddb。
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
if (!('IDBKeyRange' in globalThis)) Object.defineProperty(globalThis, 'IDBKeyRange', { value: FakeKeyRange, configurable: true })

const TARGET = '12345678-1234-4abc-8def-1234567890ab'
const task = (taskId: string, patch: Partial<BrowserDownloadTask> = {}): BrowserDownloadTask => ({
  taskId,
  owner: 'legacy:1',
  fileName: '华峰官文查询.zip',
  manifest: { items: [{ fileId: 'a' }] },
  state: 'running',
  zipCreatedAt: '2026-10-30T00:00:00.000Z',
  updatedAt: Date.now(),
  ...patch
})
const make = () => createBrowserDownloadStore(new FakeIDBFactory() as unknown as IDBFactory)
const bytes = (...values: number[]) => Uint8Array.from(values)

it('创建后能读回任务与清单，重复或缺身份的创建被拒', async () => {
  const store = make()
  await store.create(task('one'))
  expect(await store.get('one')).toMatchObject({ taskId: 'one', owner: 'legacy:1', fileName: '华峰官文查询.zip', state: 'running' })
  expect((await store.get('one'))?.manifest).toEqual({ items: [{ fileId: 'a' }] })
  expect(await store.get('missing')).toBeNull()
  await expect(store.create(task('one'))).rejects.toThrow('Download task already exists')
  await expect(store.create(task(''))).rejects.toThrow('Missing task identity')
  await expect(store.create(task('two', { owner: '' }))).rejects.toThrow('Missing task identity')
})

it('update 写入完成、失败与去重计数，非法计数被拒', async () => {
  const store = make()
  await store.create(task('one'))
  await store.update('one', { state: 'paused', completedBytes: 128, failedCount: 1, deduplicatedCount: 3, updatedAt: Date.now() - 1000 })
  expect(await store.get('one')).toMatchObject({ state: 'paused', completedBytes: 128, failedCount: 1, deduplicatedCount: 3 })
  expect((await store.get('one'))?.updatedAt).toBeLessThan(Date.now())
  await store.update('one', { failedCount: 2 })
  expect((await store.get('one'))?.failedCount).toBe(2)
  expect((await store.get('one'))?.deduplicatedCount).toBe(3)
  await expect(store.update('one', { deduplicatedCount: -1 })).rejects.toThrow('Invalid cache offset or size')
  await expect(store.update('one', { deduplicatedCount: 1.5 })).rejects.toThrow('Invalid cache offset or size')
  await expect(store.update('one', { failedCount: Number.NaN })).rejects.toThrow('Invalid cache offset or size')
  await expect(store.update('one', { completedBytes: -1 })).rejects.toThrow('Invalid cache offset or size')
  await expect(store.update('missing', { deduplicatedCount: 1 })).rejects.toThrow('Download task does not exist')
  expect((await store.get('one'))?.deduplicatedCount).toBe(3)
})

it('update 校验目标身份格式，显式清空不算非法', async () => {
  const store = make()
  await store.create(task('one'))
  await store.update('one', { activeTargetId: TARGET })
  expect((await store.get('one'))?.activeTargetId).toBe(TARGET)
  await expect(store.update('one', { activeTargetId: 'not-a-uuid' })).rejects.toThrow('Invalid active target UUID')
  await expect(store.update('one', { activeTargetId: '' })).rejects.toThrow('Invalid active target UUID')
  await store.update('one', { activeTargetId: undefined })
  expect((await store.get('one'))?.activeTargetId).toBeUndefined()
})

it('完成回执后任务冻结，update 不再接受状态改写', async () => {
  const store = make()
  await store.create(task('one'))
  await expect(store.update('one', { state: 'done' })).rejects.toThrow('Use complete to commit a done receipt')
  await store.reset('one', 'archive', {})
  await store.append('one', 'archive', 0, bytes(1, 2, 3))
  await store.finishBlob('one', 'archive')
  await store.complete('one', 3)
  expect(await store.get('one')).toMatchObject({ state: 'done', completedBytes: 3 })
  await expect(store.update('one', { state: 'paused' })).rejects.toThrow('Download task already completed')
  await expect(store.complete('one', 4)).rejects.toThrow('Completion receipt conflict')
  await store.complete('one', 3)
})

it('重置与追加维护水位，重叠写校验前缀，乱序写被拒', async () => {
  const store = make()
  await store.create(task('one'))
  expect(await store.info('one', 'archive')).toEqual({ receivedBytes: 0, complete: false })
  await store.reset('one', 'archive', {})
  await store.append('one', 'archive', 0, bytes(1, 2, 3))
  expect(await store.info('one', 'archive')).toMatchObject({ receivedBytes: 3, complete: false })
  expect([...(await store.read('one', 'archive', 0))]).toEqual([1, 2, 3])
  expect([...(await store.read('one', 'archive', 1, 2))]).toEqual([2, 3])
  await store.append('one', 'archive', 1, bytes(2, 3, 4))
  expect([...(await store.read('one', 'archive', 0))]).toEqual([1, 2, 3, 4])
  await expect(store.append('one', 'archive', 1, bytes(9, 9))).rejects.toThrow('Download cache overlap conflict')
  await expect(store.append('one', 'archive', 10, bytes(1))).rejects.toThrow('Non-contiguous cache write')
  await expect(store.info('one', -1)).rejects.toThrow('Invalid cache offset or size')
})

it('封存或完成的缓存不再接受新字节', async () => {
  const store = make()
  await store.create(task('one'))
  await store.reset('one', 0, {})
  await store.append('one', 0, 0, bytes(7, 8))
  await store.finishBlob('one', 0)
  expect(await store.info('one', 0)).toMatchObject({ receivedBytes: 2, complete: true })
  await expect(store.append('one', 0, 2, bytes(9))).rejects.toThrow('Blob is complete')
  await store.append('one', 0, 0, bytes(7, 8))
  await store.update('one', { state: 'sealed' })
  await expect(store.reset('one', 'archive', {})).rejects.toThrow('Archive is sealed')
  await expect(store.append('one', 'archive', 0, bytes(1))).rejects.toThrow('Blob is complete')
})

it('finishBlob 校验声明长度，元数据字段先过口径检查', async () => {
  const store = make()
  await store.create(task('one'))
  await store.reset('one', 0, { totalBytes: 4, etag: '"v1"', lastModified: 'Wed, 30 Oct 2026 00:00:00 GMT' })
  await store.append('one', 0, 0, bytes(1, 2))
  await expect(store.finishBlob('one', 0)).rejects.toThrow('Blob size does not match expected total')
  await expect(store.append('one', 0, 2, bytes(3, 4, 5))).rejects.toThrow('Blob exceeds expected size')
  await store.append('one', 0, 2, bytes(3, 4))
  await store.finishBlob('one', 0, { sourceNotice: '网关提示' })
  expect(await store.info('one', 0)).toMatchObject({ receivedBytes: 4, complete: true, etag: '"v1"', sourceNotice: '网关提示' })
  await expect(store.reset('one', 0, { skipReason: ' ' })).rejects.toThrow('Invalid skip reason')
  await expect(store.reset('one', 0, { sourceNotice: 'x'.repeat(1001) })).rejects.toThrow('Invalid source notice')
  await expect(store.reset('one', 0, { totalBytes: -1 })).rejects.toThrow('Invalid cache offset or size')
})

it('名称批次可保存、可整体读回，重复与交叉冲突被拒', async () => {
  const store = make()
  await store.create(task('one'))
  await store.saveNames('one', 0, ['甲.pdf', '乙.pdf'])
  expect(await store.names('one')).toEqual({ '0': ['甲.pdf', '乙.pdf'] })
  await store.saveNames('one', 2, ['丙.pdf'])
  expect(await store.names('one')).toEqual({ '0': ['甲.pdf', '乙.pdf'], '2': ['丙.pdf'] })
  await expect(store.saveNames('one', 0, ['甲.pdf', '丁.pdf'])).rejects.toThrow('Download names batch conflict')
  await expect(store.saveNames('one', 1, ['乙2.pdf'])).rejects.toThrow('Download names overlap conflict')
  await expect(store.saveNames('one', 1, ['乙.pdf'])).resolves.toBeUndefined()
})

it('skipped 只统计确认不可用的附件缓存', async () => {
  const store = make()
  await store.create(task('one'))
  await store.reset('one', 0, {})
  await store.append('one', 0, 0, bytes(1))
  await store.finishBlob('one', 0, { skipReason: '文件不存在或权限不足' })
  await store.reset('one', 1, {})
  await store.append('one', 1, 0, bytes(2))
  await store.finishBlob('one', 1)
  await store.reset('one', 'archive', {})
  await store.append('one', 'archive', 0, bytes(3))
  await store.finishBlob('one', 'archive', { skipReason: '归档说明不算附件' })
  expect(await store.skipped?.('one')).toBe(1)
})

it('超期的暂停任务在下次打开时清理，discard 立即清空', async () => {
  const store = make()
  await store.create(task('old'))
  await store.reset('old', 0, {})
  await store.append('old', 0, 0, bytes(1))
  await store.saveNames('old', 0, ['a.pdf'])
  // update 不会续命：把回收时钟调回八天前，缓存行一起按 taskId 清走。
  await store.update('old', { state: 'paused', updatedAt: Date.now() - 8 * 86400000 })
  await store.create(task('fresh'))
  // 任意一次打开都会触发回收：old 及其缓存整批消失，fresh 原样保留。
  expect(await store.get('fresh')).toMatchObject({ taskId: 'fresh' })
  expect(await store.get('old')).toBeNull()
  await store.discard('fresh')
  expect(await store.get('fresh')).toBeNull()
  await expect(store.names('fresh')).rejects.toThrow('Download task does not exist')
  await expect(store.info('fresh', 0)).rejects.toThrow('Download task does not exist')
})

it('并发追加同一段只提交一次，后续写看到新水位', async () => {
  const store = make()
  await store.create(task('one'))
  await store.reset('one', 0, {})
  const block = Uint8Array.from({ length: 300 * 1024 }, (_, index) => index % 251)
  await Promise.all([
    store.append('one', 0, 0, block),
    store.append('one', 0, 0, block)
  ])
  expect((await store.info('one', 0)).receivedBytes).toBe(block.length)
  expect([...(await store.read('one', 0, 0, 3))]).toEqual([0, 1, 2])
  expect([...(await store.read('one', 0, 256 * 1024, 3))]).toEqual([...block.subarray(256 * 1024, 256 * 1024 + 3)])
})
