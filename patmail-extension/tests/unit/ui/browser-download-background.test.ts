import { describe, expect, it, vi } from 'vitest'
import { BrowserStreamDownloads } from '../../../src/background/browser-download'
import type { BrowserDownloadStore, BrowserDownloadTask, BrowserBlob, BrowserFileRequest, BrowserFileReply } from '../../../src/browser-download/types'
import type { CachedFileInfo } from '../../../src/api/stream-cache'
import { isMessage, MessageType } from '../../../src/shared/message'

function fixture(nativeStatus?: (targetId: string) => Promise<{ state: 'inProgress' | 'complete'; receivedBytes: number } | undefined>) {
  const tasks = new Map<string, BrowserDownloadTask>(), blobs = new Map<string, Uint8Array>(), infos = new Map<string, CachedFileInfo>(), names = new Map<string, Record<string, string[]>>()
  const key = (id: string, blob: BrowserBlob) => `${id}/${blob}`
  const store: BrowserDownloadStore = {
    async create(task) { tasks.set(task.taskId, structuredClone(task)) },
    async get(id) { return structuredClone(tasks.get(id) ?? null) },
    async update(id, patch) { Object.assign(tasks.get(id)!, patch) },
    async info(id, blob) { return { complete: false, ...infos.get(key(id, blob)), receivedBytes: blobs.get(key(id, blob))?.length ?? 0 } },
    async reset(id, blob, meta) { blobs.set(key(id, blob), new Uint8Array()); infos.set(key(id, blob), { ...meta, receivedBytes: 0, complete: false }) },
    async append(id, blob, offset, bytes) {
      const old = blobs.get(key(id, blob)) ?? new Uint8Array()
      if (offset > old.length) throw Error('gap')
      for (let i = 0; i < Math.min(bytes.length, old.length - offset); i++) if (old[offset + i] !== bytes[i]) throw Error('prefix mismatch')
      const next = new Uint8Array(Math.max(old.length, offset + bytes.length)); next.set(old); next.set(bytes, offset); blobs.set(key(id, blob), next)
    },
    async finishBlob(id, blob, meta) { infos.set(key(id, blob), { ...await store.info(id, blob), ...meta, complete: true }) },
    async read(id, blob, offset, limit = 262144) { return (blobs.get(key(id, blob)) ?? new Uint8Array()).slice(offset, offset + limit) },
    async saveNames(id, offset, list) { const saved = names.get(id) ?? {}; saved[offset] = list.slice(); names.set(id, saved) },
    async names(id) { return structuredClone(names.get(id) ?? {}) },
    async complete(id, bytes) { Object.assign(tasks.get(id)!, { state: 'done', completedBytes: bytes }); for (const name of blobs.keys()) if (name.startsWith(id + '/')) blobs.delete(name) },
    async discard(id) { tasks.delete(id); for (const name of blobs.keys()) if (name.startsWith(id + '/')) blobs.delete(name) }
  }
  const calls: BrowserFileRequest[] = []
  let handler = async (_request: BrowserFileRequest): Promise<BrowserFileReply> => ({ ok: true })
  const host = async (request: BrowserFileRequest) => { calls.push(request); return handler(request) }
  const broker = new BrowserStreamDownloads(store, host, nativeStatus)
  const start = (extra = {}) => broker.command({ action: 'start', fileName: 'test.zip', manifest: { ids: [1] }, targetId: 'target', ...extra }, 10, 'owner')
  return { store, broker, host, calls, start, tasks, blobs, handler: (next: typeof handler) => { handler = next } }
}

describe('browser stream broker', () => {
  it('拒绝已超过前台等待期限的启动，不再打开无人接收的下载', async () => {
    const f = fixture()
    await expect(f.start({ expiresAt: Date.now() - 1 })).rejects.toThrow('初始化已超时')
    expect(f.calls).toHaveLength(0)
  })
  it('打开目标期间超过启动期限时关闭该目标并保留任务', async () => {
    const f = fixture(), expiresAt = Date.now() + 60_000
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    f.handler(async request => { if (request.action === 'open') await gate; return { ok: true } })
    const pending = f.start({ expiresAt })
    const assertion = expect(pending).rejects.toThrow('初始化已超时')
    await vi.waitFor(() => expect(f.calls).toHaveLength(1))
    const clock = vi.spyOn(Date, 'now').mockReturnValue(expiresAt + 1)
    try {
      release(); await assertion
      expect(f.calls.map(request => request.action)).toEqual(['open', 'pause'])
      expect([...f.tasks.values()][0]?.state).toBe('paused')
    } finally { clock.mockRestore() }
  })
  it('已封存任务恢复时从冻结名称重建同案件去重数', async () => {
    const f = fixture(), ids = ['a', 'b', 'c']
    const manifest = { deduplicate: true, stripAppNoDot: false, selection: {}, items: ids.map(fileId => ({ fileId, fileName: 'old.pdf' })), resolvedNames: { a: 'DIY.doc', b: 'DIY.docx', c: 'DIY.docx' }, caseScopes: { a: 'one', b: 'one', c: 'two' } }
    const first = await f.start({ manifest })
    await f.store.finishBlob(first.taskId!, 'archive')
    const restarted = new BrowserStreamDownloads(f.store, f.host)
    const restored = await restarted.command({ action: 'start', taskId: first.taskId, fileName: 'test.zip', targetId: 'next' }, 10, 'owner')
    expect(restored.info).toMatchObject({ sealed: true, deduplicatedCount: 1 })
  })
  it('封存已提交但任务失败数未提交时，重启start补齐回执摘要', async () => {
    const f = fixture(), first = await f.start()
    await f.store.finishBlob(first.taskId!, 'archive')
    f.store.skipped = async () => 1
    const restarted = new BrowserStreamDownloads(f.store, f.host)
    const restored = await restarted.command({ action: 'start', taskId: first.taskId, fileName: 'test.zip', targetId: 'next', manifest: { ids: [1] } }, 10, 'owner')
    expect(restored.info).toMatchObject({ sealed: true, failedCount: 1 })
  })
  it('keeps cache RPCs and pause responsive while the native consumer has not pulled ZIP bytes', async () => {
    const f = fixture(), started = await f.start(), token = started.token!
    let entered!: () => void, rejectWrite!: (error: Error) => void
    const writing = new Promise<void>(resolve => { entered = resolve })
    f.handler(async request => {
      if (request.action === 'write') { entered(); await new Promise<void>((_resolve, reject) => { rejectWrite = reject }) }
      if (request.action === 'pause') rejectWrite(new Error('native paused'))
      return { ok: true }
    })
    const output = f.broker.command({ action: 'write', token, sequence: 0, offset: 0, data: 'YWJj' }, 10, 'owner')
    const rejected = expect(output).rejects.toThrow('native paused')
    await writing
    const cache = f.broker.command({ action: 'cache', command: 'write', token, index: 1, offset: 0, data: 'YQ==' }, 10, 'owner')
    const completed = await Promise.race([cache.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 100))])
    if (!completed) { rejectWrite(new Error('native paused')); await rejected }
    expect(completed).toBe(true)
    await f.broker.pauseTask(started.taskId!, 'owner')
    await rejected
    expect((await f.store.info(started.taskId!, 1)).receivedBytes).toBe(1)
    expect((await f.store.info(started.taskId!, 'archive')).receivedBytes).toBe(3)
  })
  it('reports Chrome received bytes rather than cached archive bytes and propagates native cancellation', async () => {
    let cancelled = false
    const f = fixture(async () => { if (cancelled) throw new Error('Chrome 下载已取消'); return { state: 'inProgress', receivedBytes: 2 } })
    const started = await f.start(), token = started.token!
    await f.broker.command({ action: 'write', token, sequence: 0, offset: 0, data: 'YWJj' }, 10, 'owner')
    expect((await f.broker.command({ action: 'status', token }, 10, 'owner')).info?.receivedBytes).toBe(2)
    cancelled = true
    await expect(f.broker.command({ action: 'status', token }, 10, 'owner')).rejects.toThrow('Chrome 下载已取消')
    expect((await f.store.info(started.taskId!, 'archive')).receivedBytes).toBe(3)
  })
  it('answers status while an archive write is waiting for the browser sink', async () => {
    const f = fixture(), started = await f.start(), token = started.token!
    let releaseWrite!: () => void, notifyWrite!: () => void
    const writeEntered = new Promise<void>(resolve => { notifyWrite = resolve })
    const writeGate = new Promise<void>(resolve => { releaseWrite = resolve })
    f.handler(async request => {
      if (request.action === 'write') { notifyWrite(); await writeGate }
      return { ok: true }
    })
    const write = f.broker.command({ action: 'write', token, sequence: 0, offset: 0, data: 'YQ==' }, 10, 'owner')
    await writeEntered
    try {
      const status = f.broker.command({ action: 'status', token }, 10, 'owner')
      const result = await Promise.race([
        status.then(value => ({ completed: true as const, value })),
        new Promise<{ completed: false }>(resolve => setTimeout(() => resolve({ completed: false }), 100))
      ])
      expect(result.completed).toBe(true)
      if (result.completed) expect(result.value.info?.state).toBe('inProgress')
    } finally {
      releaseWrite()
      await write
    }
  })
  it('preempts a sink-blocked write on pause and retains the cached archive bytes', async () => {
    const f = fixture(), started = await f.start(), token = started.token!
    let abortWrite!: () => void, notifyWrite!: () => void
    const writeEntered = new Promise<void>(resolve => { notifyWrite = resolve })
    const writeGate = new Promise<void>((_, reject) => { abortWrite = () => reject(new Error('target paused')) })
    f.handler(async request => {
      if (request.action === 'write') { notifyWrite(); await writeGate }
      if (request.action === 'pause') abortWrite()
      return { ok: true }
    })
    const write = f.broker.command({ action: 'write', token, sequence: 0, offset: 0, data: 'YQ==' }, 10, 'owner')
    await writeEntered
    const pause = f.broker.pauseTask(started.taskId!, 'owner').then(tabs => ({ completed: true as const, tabs }))
    const result = await Promise.race([
      pause,
      new Promise<{ completed: false }>(resolve => setTimeout(() => resolve({ completed: false }), 100))
    ])
    const preemptedBeforeFallback = result.completed
    if (!result.completed) abortWrite()
    await expect(write).rejects.toThrow()
    const pauseResult = result.completed ? result : await pause
    expect(preemptedBeforeFallback).toBe(true)
    expect(pauseResult.completed).toBe(true)
    if (pauseResult.completed) expect(pauseResult.tabs).toEqual([10])
    expect(await f.store.get(started.taskId!)).toMatchObject({ state: 'paused' })
    expect((await f.store.info(started.taskId!, 'archive')).receivedBytes).toBe(1)
  })
  it.each(['pause', 'abort'] as const)('preempts a blocked write for the token %s command', async action => {
    const f = fixture(), started = await f.start(), token = started.token!
    let abortWrite!: () => void, notifyWrite!: () => void
    const writeEntered = new Promise<void>(resolve => { notifyWrite = resolve })
    const writeGate = new Promise<void>((_, reject) => { abortWrite = () => reject(new Error('target paused')) })
    f.handler(async request => {
      if (request.action === 'write') { notifyWrite(); await writeGate }
      if (request.action === 'pause') abortWrite()
      return { ok: true }
    })
    const write = f.broker.command({ action: 'write', token, sequence: 0, offset: 0, data: 'YQ==' }, 10, 'owner')
    await writeEntered
    const pause = f.broker.command({ action, token }, 10, 'owner').then(reply => ({ completed: true as const, reply }))
    const result = await Promise.race([
      pause,
      new Promise<{ completed: false }>(resolve => setTimeout(() => resolve({ completed: false }), 100))
    ])
    const preemptedBeforeFallback = result.completed
    if (!result.completed) abortWrite()
    await expect(write).rejects.toThrow()
    const pauseResult = result.completed ? result : await pause
    expect(preemptedBeforeFallback).toBe(true)
    expect(pauseResult.reply).toEqual({ ok: true })
    expect(await f.store.get(started.taskId!)).toMatchObject({ state: 'paused' })
    expect((await f.store.info(started.taskId!, 'archive')).receivedBytes).toBe(1)
  })
  it('keeps cached archive and a retryable close when token pause cannot close the target', async () => {
    const f = fixture(), started = await f.start(), token = started.token!
    await f.broker.command({ action: 'write', token, sequence: 0, offset: 0, data: 'YQ==' }, 10, 'owner')
    let closeAttempts = 0
    f.handler(async request => {
      if (request.action === 'pause') { closeAttempts++; return { ok: false, error: 'close failed' } }
      return { ok: true }
    })
    await expect(f.broker.command({ action: 'pause', token }, 10, 'owner')).rejects.toThrow('close failed')
    expect(closeAttempts).toBe(1)
    expect(await f.store.get(started.taskId!)).toMatchObject({ state: 'paused', activeTargetId: 'target' })
    expect((await f.store.info(started.taskId!, 'archive')).receivedBytes).toBe(1)
    f.handler(async () => ({ ok: true }))
    expect(await f.broker.pauseTask(started.taskId!, 'owner')).toEqual([10])
    expect(closeAttempts).toBe(1)
    expect((await f.store.info(started.taskId!, 'archive')).receivedBytes).toBe(1)
  })
  it('does not reload a large manifest or naming batches for source blocks and status polling', async () => {
    const f = fixture(), a = await f.start(), token = a.token!
    f.store.get = async () => { throw new Error('unexpected full manifest read') }
    f.store.names = async () => { throw new Error('unexpected naming batch read') }
    await f.broker.command({ action: 'cache', command: 'write', index: 0, token, offset: 0, data: 'YQ==' }, 10, 'owner')
    expect((await f.broker.command({ action: 'cache', command: 'info', index: 0, token }, 10, 'owner')).info?.receivedBytes).toBe(1)
    await f.broker.command({ action: 'write', token, sequence: 0, offset: 0, data: 'YQ==' }, 10, 'owner')
    const status = await f.broker.command({ action: 'status', token }, 10, 'owner')
    expect(status.info).toMatchObject({ state: 'inProgress', receivedBytes: 1, sealed: false })
    expect(status.info).not.toHaveProperty('manifest')
    await f.broker.command({ action: 'finish', token }, 10, 'owner')
    await f.broker.command({ action: 'complete', token }, 10, 'owner')
    expect((await f.broker.command({ action: 'status', token }, 10, 'owner')).info).toMatchObject({ completed: true, completedBytes: 1, state: 'complete' })
  })
  it('pauses the persisted target after restart, reports close failure, and can retry a departed host', async () => {
    const f = fixture(), a = await f.start()
    const restarted = new BrowserStreamDownloads(f.store, f.host)
    f.handler(async () => ({ ok: false, error: 'close still pending' }))
    await expect(restarted.pauseTask(a.taskId!, 'owner')).rejects.toThrow('close still pending')
    expect(f.calls.at(-1)).toMatchObject({ action: 'pause', targetId: 'target', taskId: a.taskId, owner: 'owner' })
    expect(await f.store.get(a.taskId!)).toMatchObject({ state: 'paused', activeTargetId: 'target' })
    f.handler(async () => ({ ok: false, error: 'page departed', code: 'HOST_GONE' }))
    expect(await restarted.pauseTask(a.taskId!, 'owner')).toEqual([])
  })
  it('retains the persisted writer and cache when discard cannot close after restart', async () => {
    const f = fixture(), a = await f.start()
    await f.broker.command({ action: 'write', token: a.token!, sequence: 0, offset: 0, data: 'YQ==' }, 10, 'owner')
    const restarted = new BrowserStreamDownloads(f.store, f.host)
    f.handler(async () => ({ ok: false, error: 'close failed' }))
    await expect(restarted.discardTask(a.taskId!, 'owner')).rejects.toThrow('close failed')
    expect(f.calls.at(-1)).toMatchObject({ action: 'pause', targetId: 'target', taskId: a.taskId })
    expect(await f.store.get(a.taskId!)).toMatchObject({ activeTargetId: 'target' })
    expect((await f.store.info(a.taskId!, 'archive')).receivedBytes).toBe(1)
    f.handler(async () => ({ ok: false, error: 'page departed', code: 'HOST_GONE' }))
    await restarted.discardTask(a.taskId!, 'owner')
    expect(await f.store.get(a.taskId!)).toBeNull()
  })
  it('accepts only an explicit HOST_GONE during old-target pause after the workbench refreshes', async () => {
    const f = fixture(), a = await f.start()
    f.handler(async request => request.action === 'pause' && request.targetId === 'target'
      ? { ok: false, error: 'old page gone', code: 'HOST_GONE' } : { ok: true })
    const b = await f.start({ taskId: a.taskId, targetId: 'new-page' })
    expect(b.token).toBeTruthy()
    expect(f.calls.slice(-2).map(c => [c.action, c.targetId])).toEqual([['pause', 'target'], ['open', 'new-page']])
    f.handler(async () => ({ ok: false, error: 'new page gone', code: 'HOST_GONE' }))
    await expect(f.broker.command({ action: 'write', token: b.token!, sequence: 0, offset: 0, data: 'YQ==' }, 10, 'owner')).rejects.toThrow('new page gone')
    await expect(f.start({ taskId: a.taskId, targetId: 'third-page' })).rejects.toThrow('new page gone')
  })
  it('persists target identity before opening and closes the previous writer after a service worker restart', async () => {
    const f = fixture()
    f.handler(async request => {
      if (request.action === 'open') expect((await f.store.get(request.taskId))?.activeTargetId).toBe(request.targetId)
      return { ok: true }
    })
    const a = await f.start()
    const restarted = new BrowserStreamDownloads(f.store, f.host)
    await restarted.command({ action: 'start', taskId: a.taskId, fileName: 'test.zip', targetId: 'new-worker' }, 10, 'owner')
    expect(f.calls.map(c => [c.action, c.targetId])).toEqual([['open', 'target'], ['pause', 'target'], ['open', 'new-worker']])
  })
  it('does not open a replacement after restart when the persisted old writer cannot close', async () => {
    const f = fixture(), a = await f.start()
    f.handler(async request => request.action === 'pause' ? { ok: false, error: 'close denied' } : { ok: true })
    const restarted = new BrowserStreamDownloads(f.store, f.host)
    await expect(restarted.command({ action: 'start', taskId: a.taskId, fileName: 'test.zip', targetId: 'new-worker' }, 10, 'owner')).rejects.toThrow('close denied')
    expect(f.calls.filter(c => c.action === 'open')).toHaveLength(1)
  })
  it('issues tokens accepted by the shared runtime message contract', async () => {
    const f = fixture(), created = await f.start()
    expect(isMessage({ type: MessageType.StreamDownloadResult, payload: created })).toBe(true)
    expect(isMessage({ type: MessageType.BrowserStreamDownload, payload: { action: 'write', token: created.token, sequence: 0, offset: 0, data: 'YQ==' } })).toBe(true)
  })
  it('requires a failed old-host close to be acknowledged before any later takeover opens', async () => {
    const f = fixture(), a = await f.start()
    f.handler(async request => request.action === 'pause' ? { ok: false, error: 'close failed' } : { ok: true })
    await expect(f.start({ taskId: a.taskId, targetId: 'next' })).rejects.toThrow('close failed')
    f.handler(async () => ({ ok: true }))
    await f.start({ taskId: a.taskId, targetId: 'next' })
    expect(f.calls.map(c => [c.action, c.targetId])).toEqual([['open', 'target'], ['pause', 'target'], ['pause', 'target'], ['open', 'next']])
  })
  it('cancels an in-flight start before it can gain a lease after tab/account departure', async () => {
    for (const mode of ['tab', 'owner']) {
      const f = fixture(); const pending = f.start()
      if (mode === 'tab') f.broker.cancelTab(10); else f.broker.revokeOtherOwners('next-owner')
      await expect(pending).rejects.toThrow()
      expect(f.calls.filter(c => c.action === 'open')).toHaveLength(0)
    }
  })
  it('retains a failed target write and retries exactly that block after a concrete host error', async () => {
    const f = fixture(), a = await f.start()
    const write = { action: 'write' as const, token: a.token!, sequence: 0, offset: 0, data: 'YQ==' }
    f.handler(async request => request.action === 'write' ? { ok: false, error: 'disk full' } : { ok: true })
    await expect(f.broker.command(write, 10, 'owner')).rejects.toThrow('disk full')
    expect((await f.store.info(a.taskId!, 'archive')).receivedBytes).toBe(1)
    f.handler(async () => ({ ok: true })); await f.broker.command(write, 10, 'owner')
    await f.broker.command({ action: 'finish', token: a.token! }, 10, 'owner')
    expect((await f.broker.command({ action: 'status', token: a.token! }, 10, 'owner')).info?.state).toBe('complete')
  })
  it('freezes manifest, rotates leases and keeps stable task and ZIP time', async () => {
    const f = fixture(), original = { ids: [1] }, a = await f.start({ manifest: original })
    original.ids.push(2)
    await f.broker.command({ action: 'checkpoint', token: a.token!, offset: 0, names: ['x'] }, 10, 'owner')
    const b = await f.start({ taskId: a.taskId })
    expect(b.taskId).toBe(a.taskId); expect(b.token).not.toBe(a.token)
    expect(b.info?.manifest).toMatchObject({ ids: [1], cachedNames: { 0: ['x'] } })
    expect(b.info?.zipCreatedAt).toBe(a.info?.zipCreatedAt)
    await expect(f.broker.command({ action: 'status', token: a.token! }, 10, 'owner')).rejects.toThrow()
    await expect(f.start({ taskId: a.taskId, manifest: { ids: [2] } })).rejects.toThrow()
    await expect(f.start({ taskId: 'missing', manifest: undefined })).rejects.toThrow()
  })
  it('requires matching owner and source tab for every command', async () => {
    const f = fixture(), a = await f.start()
    for (const [tab, owner] of [[11, 'owner'], [10, 'other']] as const) {
      await expect(f.broker.command({ action: 'write', token: a.token!, sequence: 0, offset: 0, data: 'YQ==' }, tab, owner)).rejects.toThrow()
      for (const action of ['pause', 'abort'] as const) await expect(f.broker.command({ action, token: a.token! }, tab, owner)).rejects.toThrow()
    }
    await expect(f.start({ taskId: a.taskId, fileName: 'different.zip' })).rejects.toThrow()
    await expect(f.broker.pauseTask(a.taskId!, 'other')).rejects.toThrow()
  })
  it('durably stores writes, accepts only exact last-block retries and rejects sequence gaps', async () => {
    const f = fixture(), a = await f.start(), write = { action: 'write' as const, token: a.token!, sequence: 0, offset: 0, data: 'YWJj' }
    f.handler(async request => { if (request.action === 'write') expect((await f.store.info(a.taskId!, 'archive')).receivedBytes).toBe(3); return { ok: true } })
    await f.broker.command(write, 10, 'owner'); await f.broker.command(write, 10, 'owner')
    expect(f.calls.filter(c => c.action === 'write')).toHaveLength(1)
    await expect(f.broker.command({ ...write, sequence: 2 }, 10, 'owner')).rejects.toThrow()
    await expect(f.broker.command({ ...write, data: 'eHl6' }, 10, 'owner')).rejects.toThrow()
  })
  it('keeps cache when target close fails and replays a sealed archive from zero on restart', async () => {
    const f = fixture(), a = await f.start()
    await f.broker.command({ action: 'write', token: a.token!, sequence: 0, offset: 0, data: 'YWJj' }, 10, 'owner')
    f.handler(async request => request.action === 'finish' ? { ok: false, error: 'permission revoked' } : { ok: true })
    await expect(f.broker.command({ action: 'finish', token: a.token! }, 10, 'owner')).rejects.toThrow('permission revoked')
    expect((await f.store.info(a.taskId!, 'archive')).receivedBytes).toBe(3)
    await expect(f.broker.command({ action: 'complete', token: a.token! }, 10, 'owner')).rejects.toThrow()
    f.handler(async () => ({ ok: true }))
    const b = await f.start({ taskId: a.taskId }); const before = f.calls.length
    await f.broker.command({ action: 'resume', token: b.token! }, 10, 'owner')
    expect(f.calls.slice(before).map(c => c.action)).toEqual(['write', 'finish'])
    expect(f.calls.at(-2)).toMatchObject({ offset: 0, data: 'YWJj' })
    expect((await f.broker.command({ action: 'status', token: b.token! }, 10, 'owner')).info).toMatchObject({ state: 'complete', sealed: true, receivedBytes: 3 })
    await f.broker.command({ action: 'complete', token: b.token! }, 10, 'owner')
    expect((await f.start({ taskId: a.taskId })).info).toMatchObject({ completed: true, completedBytes: 3 })
  })
  it('source cache and naming commands stay in the store without writing target', async () => {
    const f = fixture(), a = await f.start(), token = a.token!
    await f.broker.command({ action: 'cache', command: 'reset', index: 0, token, metadata: { etag: 'v1' } }, 10, 'owner')
    await f.broker.command({ action: 'cache', command: 'write', index: 0, token, offset: 0, data: 'YQ==' }, 10, 'owner')
    await f.broker.command({ action: 'cache', command: 'complete', index: 0, token }, 10, 'owner')
    expect((await f.broker.command({ action: 'cache', command: 'read', index: 0, token, offset: 0 }, 10, 'owner')).data).toBe('YQ==')
    expect((await f.broker.command({ action: 'cache', command: 'info', index: 0, token }, 10, 'owner')).info).toMatchObject({ complete: true, receivedBytes: 1, etag: 'v1' })
    expect(f.calls.map(c => c.action)).toEqual(['open'])
  })
  it('pause/discard and tab/account revocation invalidate tokens and retain paused bytes', async () => {
    const f = fixture(), a = await f.start()
    await f.broker.command({ action: 'write', token: a.token!, sequence: 0, offset: 0, data: 'YQ==' }, 10, 'owner')
    expect(await f.broker.pauseTask(a.taskId!, 'owner')).toEqual([10])
    expect((await f.store.info(a.taskId!, 'archive')).receivedBytes).toBe(1)
    await expect(f.broker.command({ action: 'status', token: a.token! }, 10, 'owner')).rejects.toThrow()
    const b = await f.start({ taskId: a.taskId }); f.broker.cancelTab(10)
    await expect(f.broker.command({ action: 'status', token: b.token! }, 10, 'owner')).rejects.toThrow()
    const c = await f.start({ taskId: a.taskId }); f.broker.revokeOtherOwners('other')
    await expect(f.broker.command({ action: 'status', token: c.token! }, 10, 'owner')).rejects.toThrow()
    await f.broker.discardTask(a.taskId!, 'owner'); expect(await f.store.get(a.taskId!)).toBeNull()
  })
  it('a late pause for the replaced lease cannot revoke a new start queued ahead of it', async () => {
    const f = fixture(), old = await f.start()
    const get = f.store.get.bind(f.store)
    let releaseStartRead!: () => void, releasePauseRead!: () => void, enteredStartRead!: () => void, enteredPauseRead!: () => void
    const startReadGate = new Promise<void>(resolve => { releaseStartRead = resolve })
    const pauseReadGate = new Promise<void>(resolve => { releasePauseRead = resolve })
    const startReadEntered = new Promise<void>(resolve => { enteredStartRead = resolve })
    const pauseReadEntered = new Promise<void>(resolve => { enteredPauseRead = resolve })
    let reads = 0
    f.store.get = async taskId => {
      reads++
      if (reads === 1) { enteredStartRead(); await startReadGate }
      if (reads === 2) { enteredPauseRead(); await pauseReadGate }
      return get(taskId)
    }

    const takeover = f.start({ taskId: old.taskId, targetId: 'next' })
    await startReadEntered
    const latePause = f.broker.command({ action: 'pause', token: old.token! }, 10, 'owner')
    releaseStartRead()
    const current = await takeover
    await pauseReadEntered

    let releaseReset!: () => void, enteredReset!: () => void
    const resetGate = new Promise<void>(resolve => { releaseReset = resolve })
    const resetEntered = new Promise<void>(resolve => { enteredReset = resolve })
    f.store.reset = async () => { enteredReset(); await resetGate }
    const reset = f.broker.command({ action: 'cache', command: 'reset', index: 0, token: current.token! }, 10, 'owner')
    await resetEntered
    releasePauseRead()
    releaseReset()
    await latePause

    await expect(reset).resolves.toMatchObject({ ok: true })
    await expect(f.broker.command({ action: 'status', token: current.token! }, 10, 'owner')).resolves.toMatchObject({ ok: true })
    expect(await f.store.get(old.taskId!)).toMatchObject({ state: 'running', activeTargetId: 'next' })
  })
  it('serializes concurrent takeover: old close precedes new open, stale queued writes fail', async () => {
    const f = fixture(), a = await f.start(); let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    f.handler(async request => { if (request.action === 'pause') await gate; return { ok: true } })
    const takeover = f.start({ taskId: a.taskId, targetId: 'next' })
    const stale = f.broker.command({ action: 'write', token: a.token!, sequence: 0, offset: 0, data: 'YQ==' }, 10, 'owner')
    const rejected = expect(stale).rejects.toThrow(); release(); await takeover; await rejected
    expect(f.calls.map(c => [c.action, c.targetId])).toEqual([['open', 'target'], ['pause', 'target'], ['open', 'next']])
  })
})
