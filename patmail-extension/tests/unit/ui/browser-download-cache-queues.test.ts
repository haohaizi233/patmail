import { expect, it } from 'vitest'
import { BrowserStreamDownloads } from '../../../src/background/browser-download'
import type { BrowserDownloadStore, BrowserDownloadTask } from '../../../src/browser-download/types'

it('一个附件的缓存写入等待提交时，其他附件的信息查询不排在同一个任务队列后', async () => {
  let task: BrowserDownloadTask | null = null, entered!: () => void, release!: () => void
  const writing = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  const store = { async create(value: BrowserDownloadTask) { task = value }, async get() { return task },
    async update(_id: string, value: Partial<BrowserDownloadTask>) { Object.assign(task!, value) }, async names() { return {} },
    async info() { return { receivedBytes: 0, complete: false } }, async append() { entered(); await gate }
  } as unknown as BrowserDownloadStore
  const broker = new BrowserStreamDownloads(store, async () => ({ ok: true }))
  const started = await broker.command({ action: 'start', fileName: 'test.zip', manifest: {}, targetId: 'target' }, 1, 'owner'), token = started.token!
  const write = broker.command({ action: 'cache', command: 'write', index: 0, token, offset: 0, data: 'YQ==' }, 1, 'owner')
  await writing
  const query = broker.command({ action: 'cache', command: 'info', index: 1, token }, 1, 'owner')
  let completed = false
  try { completed = await Promise.race([query.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 100))]) }
  finally { release(); await write; await query }
  expect(completed).toBe(true)
})
