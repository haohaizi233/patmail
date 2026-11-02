import { describe, expect, it, vi } from 'vitest'
import { JihuaError } from '../../../src/jihua/client'
import { JihuaRunner } from '../../../src/jihua/runner'
import type { JihuaRepository, JihuaRow, JihuaTask, JihuaTransport, LocalFileHandle, Material } from '../../../src/jihua/types'

const session = { key: 'owner', tabId: 1, documentId: 'doc-1', title: 'OA' }

function makeRow(index: number, applicationNo = '2021100850612', materialKey = 'PATENT_REQUEST'): JihuaRow {
  const description = materialKey === 'APPLY_FILE' ? '新申请文档' : materialKey === 'ACPT_NOTICE' ? '专利申请受理通知书' : '递交合并档'
  return {
    id: `root-${index}:${index}.pdf`,
    rootId: `root-${index}`,
    relativePath: `${index}.pdf`,
    fileName: `${applicationNo}-案件-${description}.pdf`,
    extension: 'pdf',
    applicationNo,
    caseName: '案件',
    description,
    materialKey,
    selected: true,
    status: 'pending',
    error: '',
    attempts: 0,
    updatedAt: 0,
  }
}

function makeHandle(name: string): LocalFileHandle {
  return {
    kind: 'file',
    name,
    getFile: vi.fn(async () => new File(['%PDF-1.7\ncontent'], name, { type: 'application/pdf' })),
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

function deferredValue<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function setup(rows = [makeRow(0)]) {
  const task: JihuaTask = {
    id: 'task-1', createdAt: 1, updatedAt: 1, status: 'ready', roots: [], rows,
    scannedFiles: rows.length, excludedFiles: 0, errors: [],
  }
  const files = new Map(rows.map(row => [row.id, makeHandle(row.fileName)]))
  const stored = new Map<string, Record<string, Array<{ ID: string }>>>()
  const updateBodies: Array<Record<string, unknown>> = []
  const uploadResults: Array<{ requestId: string; materialKey: string; id: string }> = []
  const receiptValues = new Map<string, unknown>()
  const hooks: {
    lookupFails?: (applicationNo: string) => boolean
    beforeDetail?: (recordId: string, read: number) => Promise<void>
    beforeUpdate?: (body: Record<string, unknown>) => Promise<void>
  } = {}
  let detailReads = 0
  let activeUpdates = 0
  let peakUpdates = 0

  const request: JihuaTransport['request'] = vi.fn(async (path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) => {
    if (method === 'POST') {
      const update = body as Record<string, unknown>
      updateBodies.push(update)
      activeUpdates++
      peakUpdates = Math.max(peakUpdates, activeUpdates)
      try {
        await hooks.beforeUpdate?.(update)
        const form = update.patentParameter as { ID: string }
        const fields = stored.get(form.ID) ?? {}
        for (const [key, ids] of Object.entries(update)) {
          if (key.endsWith('AppendixList')) fields[key] = (ids as string[]).map(ID => ({ ID }))
        }
        stored.set(form.ID, fields)
        return { code: 200 }
      } finally {
        activeUpdates--
      }
    }

    if (path.includes('?')) {
      const applicationNo = new URL(path, 'https://example.test').searchParams.get('PATENT_NUM') ?? ''
      if (hooks.lookupFails?.(applicationNo)) return { code: 401, msg: 'session expired' }
      return { code: 200, total: 1, rows: [{ ID: `case-${applicationNo}`, PATENT_NO: applicationNo, PATENT_NAME: 'Case' }] }
    }

    const recordId = decodeURIComponent(path.split('/').at(-1) ?? '')
    const read = ++detailReads
    await hooks.beforeDetail?.(recordId, read)
    const applicationNo = recordId.slice('case-'.length)
    const attachments = stored.get(recordId) ?? {}
    return {
      code: 200,
      data: {
        patentParameter: { ID: recordId, PATENT_NO: applicationNo, IS_FAST: 'TRUE', IS_HAVE_GER: 'TRUE', IS_REVIEW: 'TRUE' },
        ...Object.fromEntries(Object.entries(attachments).map(([key, list]) => [`${key}Obj`, list])),
      },
    }
  })

  const repository: JihuaRepository = {
    save: vi.fn(async () => undefined),
    load: vi.fn(async () => null),
    archiveAndCreate: vi.fn(async () => undefined),
    listHistory: vi.fn(async () => []),
    findArchivedUploads: vi.fn(async () => []),
    restoreTask: vi.fn(async () => task),
    getFile: vi.fn(async (id: string) => files.get(id)),
    putFile: vi.fn(async () => undefined),
    putRoot: vi.fn(async () => undefined),
    getRoots: vi.fn(async () => []),
    clear: vi.fn(async () => undefined),
  }
  const upload: JihuaTransport['upload'] = vi.fn(async (_file: File, material: Material, requestId: string, beforeSend: () => Promise<void>) => {
    await beforeSend()
    const id = `upload-${uploadResults.length + 1}`
    uploadResults.push({ requestId, materialKey: material.key, id })
    const result = { code: 200, data: [{ ID: id }] }
    receiptValues.set(requestId, result)
    return result
  })
  const receipt: JihuaTransport['receipt'] = vi.fn(async (requestId: string) => {
    const value = receiptValues.get(requestId)
    return value ? { state: 'done' as const, value } : { state: 'missing' as const }
  })
  const transport: JihuaTransport = {
    session,
    checkSession: vi.fn(async () => undefined),
    request,
    upload,
    receipt,
  }

  return {
    task, files, stored, updateBodies, uploadResults, hooks, repository, transport,
    get peakUpdates() { return peakUpdates },
  }
}

describe('Jihua runner recovery boundaries', () => {
  it.each(['pause', 'cancel'] as const)('retains %s requested while an explicit circuit reset is being saved', async action => {
    const ctx = setup()
    ctx.task.status = 'paused'
    ctx.task.writeFailureStreak = { upload: 3, association: 0, circuitOpen: true }
    const saving = deferred()
    const release = deferred()
    vi.spyOn(ctx.repository, 'save').mockImplementationOnce(async () => { saving.resolve(); await release.promise })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    const running = runner.run({ resetWriteFailureStreak: true })
    await saving.promise
    runner[action]()
    release.resolve()
    await running
    expect(ctx.task.status).toBe(action === 'pause' ? 'paused' : 'cancelled')
    expect(ctx.transport.request).not.toHaveBeenCalled()
    expect(ctx.transport.upload).not.toHaveBeenCalled()
  })

  it('fences an inherited upload from another account while processing other materials', async () => {
    const inherited = makeRow(0)
    inherited.intent = { requestId: 'foreign', sessionKey: 'other-account', tabId: 8, documentId: 'other-doc', sent: true }
    inherited.receipt = { attachments: [{ ID: 'foreign-attachment' }] }
    const current = makeRow(1, inherited.applicationNo, 'APPLY_FILE')
    const rig = setup([inherited, current])
    await new JihuaRunner(rig.task, rig.repository, rig.transport).run()
    expect(inherited.status).toBe('failed')
    expect(inherited.error).toContain('其他季华账号')
    expect(current.status).toBe('success')
    expect(rig.transport.upload).toHaveBeenCalledOnce()
    expect(JSON.stringify(rig.updateBodies)).not.toContain('foreign-attachment')
  })
  it.each([
    ['%PDF-1.7\ncontent', '实际是 PDF'],
    ['PK\u0003\u0004container', '实际是 ZIP 容器'],
  ])('explains a mislabeled DOC without sending it: %s', async (content, expected) => {
    const row = makeRow(0)
    row.extension = 'doc'
    row.fileName = row.fileName.replace(/\.pdf$/, '.doc')
    const ctx = setup([row])
    ctx.files.set(row.id, { kind: 'file', name: row.fileName, getFile: async () => new File([content], row.fileName) })
    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()
    expect(row.status).toBe('failed')
    expect(row.error).toContain(expected)
    expect(row.intent).toBeUndefined()
    expect(ctx.transport.upload).not.toHaveBeenCalled()
  })

  it('uses one healthy read probe to resume queued applications without replaying failed uploads', async () => {
    const rows = Array.from({ length: 7 }, (_, index) => makeRow(index, `20211008506${String(index).padStart(2, '0')}`))
    const ctx = setup(rows)
    ctx.transport.upload = vi.fn(async (file: File, _material: Material, _id: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      if (file.name === rows[0]?.fileName) throw new Error('OA 上传失败（HTTP 524）；结果未确认。')
      return { code: 200, data: [{ ID: `ok-${file.name}` }] }
    })
    ctx.transport.receipt = vi.fn(async () => ({ state: 'failed' as const, error: 'OA 上传失败（HTTP 524）；结果未确认。' }))
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport, { recoveryDelaysMs: [0, 0, 0] })

    await runner.run()

    expect(ctx.task.status).toBe('failed')
    expect(ctx.transport.upload).toHaveBeenCalledTimes(7)
    expect(rows[0]).toMatchObject({ status: 'failed', intent: { sent: true } })
    expect(rows[0]?.error).toContain('524')
    expect(rows.slice(1).every(row => row.status === 'success')).toBe(true)
    expect(ctx.task.errors.some(error => /正在执行健康检查/.test(error))).toBe(true)
    expect(ctx.task.pauseReason).toBeUndefined()
    expect(ctx.task.recovery).toBeUndefined()
    expect(ctx.transport.checkSession).toHaveBeenCalledTimes(9)
    expect(vi.mocked(ctx.transport.request).mock.calls.filter(([path]) => typeof path === 'string' && path.includes('?'))).toHaveLength(8)
    const sentCount = vi.mocked(ctx.transport.upload).mock.calls.length
    const updateCount = ctx.updateBodies.length
    // An explicit later resume observes each original receipt without replaying multipart.
    rows.forEach(row => { row.selected = Boolean(row.intent?.sent) })
    await runner.run()
    expect(ctx.transport.upload).toHaveBeenCalledTimes(sentCount)
    expect(ctx.updateBodies).toHaveLength(updateCount)
    expect(ctx.task.pauseReason).toBeUndefined()
  })

  it('pauses after three failed health probes and leaves queued rows pending', async () => {
    const rows = Array.from({ length: 7 }, (_, index) => makeRow(index, `20211008506${String(index).padStart(2, '0')}`))
    const ctx = setup(rows)
    const save = vi.spyOn(ctx.repository, 'save')
    const request = ctx.transport.request
    const queries = new Map<string, number>()
    ctx.transport.request = vi.fn(async (path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) => {
      if (path.includes('?')) {
        const applicationNo = new URL(path, 'https://example.test').searchParams.get('PATENT_NUM') ?? ''
        const count = (queries.get(applicationNo) ?? 0) + 1
        queries.set(applicationNo, count)
        if (count > 1) return { code: 524, msg: 'OA 请求失败（HTTP 524）；结果未确认。' }
      }
      return request(path, method, body)
    })
    ctx.transport.upload = vi.fn(async (file: File, _material: Material, _id: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      if (file.name === rows[0]?.fileName) throw new Error('OA 上传失败（HTTP 524）；结果未确认。')
      return { code: 200, data: [{ ID: `ok-${file.name}` }] }
    })
    ctx.transport.receipt = vi.fn(async () => ({ state: 'failed' as const, error: 'OA 上传失败（HTTP 524）；结果未确认。' }))
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport, { recoveryDelaysMs: [0, 0, 0] })

    await runner.run()

    expect(ctx.task.status).toBe('paused')
    expect(ctx.task.pauseReason).toContain('3 次')
    expect(ctx.task.pauseReason).toContain('HTTP 524')
    expect(ctx.task.recovery).toBeUndefined()
    expect(ctx.transport.upload).toHaveBeenCalledTimes(6)
    expect(rows[0]).toMatchObject({ status: 'failed', intent: { sent: true } })
    expect(rows.slice(1, 6).every(row => row.status === 'success')).toBe(true)
    expect(rows[6]).toMatchObject({ status: 'pending', selected: true })
    expect([...queries.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0)).toBe(3)
    expect(ctx.transport.checkSession).toHaveBeenCalledTimes(10)
    expect(new Set(save.mock.calls.map(([snapshot]) => snapshot.recovery?.attempt).filter(Boolean))).toEqual(new Set([1, 2, 3]))
  })

  it('pauses immediately when the health probe reports an expired session', async () => {
    const rows = [makeRow(0, '2021100850600')]
    const ctx = setup(rows)
    const request = ctx.transport.request
    const queries = new Map<string, number>()
    ctx.transport.request = vi.fn(async (path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) => {
      if (path.includes('?')) {
        const applicationNo = new URL(path, 'https://example.test').searchParams.get('PATENT_NUM') ?? ''
        const count = (queries.get(applicationNo) ?? 0) + 1
        queries.set(applicationNo, count)
        if (count > 1) return { code: 401, msg: '季华登录已失效，请重新连接 OA 页面。' }
      }
      return request(path, method, body)
    })
    ctx.transport.upload = vi.fn(async (_file: File, _material: Material, _id: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      throw new Error('OA 上传失败（HTTP 524）；结果未确认。')
    })
    ctx.transport.receipt = vi.fn(async () => ({ state: 'failed' as const, error: 'OA 上传失败（HTTP 524）；结果未确认。' }))
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport, { recoveryDelaysMs: [0, 0, 0] })

    await runner.run()

    expect(ctx.task.status).toBe('paused')
    expect(ctx.task.pauseReason).toContain('登录已失效')
    expect(ctx.task.recovery).toBeUndefined()
    expect(ctx.transport.upload).toHaveBeenCalledOnce()
    expect(ctx.transport.checkSession).toHaveBeenCalledTimes(3)
  })

  it('treats a transient fetch failure as availability loss, not an expired session', async () => {
    const row = makeRow(0)
    const ctx = setup([row])
    ctx.transport.upload = vi.fn(async (_file: File, _material: Material, _id: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      throw new TypeError('Failed to fetch')
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport, { recoveryDelaysMs: [0] })

    await runner.run()

    expect(row.status).toBe('failed')
    expect(row.error).toContain('Failed to fetch')
    expect(ctx.task.pauseReason).toBeUndefined()
    expect(ctx.task.recovery).toBeUndefined()
    expect(ctx.transport.checkSession).toHaveBeenCalledTimes(3)
    expect(vi.mocked(ctx.transport.request).mock.calls.filter(([path]) => typeof path === 'string' && path.includes('?'))).toHaveLength(2)
  })

  it('routes an unconfirmed association HTTP 524 through recovery and preserves its streak until association succeeds', async () => {
    const first = makeRow(0, '2021100850612')
    const second = makeRow(1, '2021100850613')
    second.selected = false
    second.status = 'failed'
    second.error = '手动关联重试。'
    const ctx = setup([first, second])
    const save = vi.spyOn(ctx.repository, 'save')
    const request = ctx.transport.request
    const probeStarted = deferred()
    const releaseProbe = deferredValue<unknown>()
    let firstSearches = 0
    let firstUpdates = 0
    ctx.transport.request = vi.fn(async (path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, requestId?: string) => {
      if (method === 'POST' && (body as { patentParameter?: { ID?: string } })?.patentParameter?.ID === `case-${first.applicationNo}`) {
        firstUpdates++
        throw new Error('OA 请求失败（HTTP 524）；结果未确认。')
      }
      if (path.includes('?') && new URL(path, 'https://example.test').searchParams.get('PATENT_NUM') === first.applicationNo && ++firstSearches === 2) {
        probeStarted.resolve()
        return releaseProbe.promise
      }
      return request(path, method, body, requestId)
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport, { recoveryDelaysMs: [0, 0, 0] })
    const run = runner.run()

    await probeStarted.promise
    expect(first.status).toBe('failed')
    expect(first.error).toContain('HTTP 524')
    expect(ctx.task.writeFailureStreak?.association).toBe(1)
    expect(save.mock.calls.some(([snapshot]) => snapshot.writeFailureStreak?.association === 1 && snapshot.recovery?.attempt === 1)).toBe(true)
    expect(firstUpdates).toBe(1)
    expect(await runner.enqueue([second.id])).toBe(1)
    releaseProbe.resolve({ code: 200, total: 1, rows: [{ ID: `case-${first.applicationNo}`, PATENT_NO: first.applicationNo }] })
    await run

    expect(firstUpdates).toBe(1)
    expect(first.status).toBe('failed')
    expect(second.status).toBe('success')
    expect(ctx.task.writeFailureStreak?.association).toBe(0)
    expect(ctx.task.pauseReason).toBeUndefined()
  })

  it('counts an association write as successful when readback confirms it after an HTTP 524 callback', async () => {
    const row = makeRow(0)
    const ctx = setup([row])
    ctx.task.writeFailureStreak = { upload: 1, association: 2 }
    const request = ctx.transport.request
    ctx.transport.request = vi.fn(async (path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, requestId?: string) => {
      const result = await request(path, method, body, requestId)
      if (method === 'POST' && path.includes('/update')) throw new Error('OA 请求失败（HTTP 524）；结果未确认。')
      return result
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport, { recoveryDelaysMs: [0] })

    await runner.run()

    expect(row.status).toBe('success')
    expect(ctx.updateBodies).toHaveLength(1)
    expect(ctx.task.writeFailureStreak).toEqual({ upload: 0, association: 0 })
    expect(ctx.task.recovery).toBeUndefined()
    expect(ctx.task.pauseReason).toBeUndefined()
    expect(vi.mocked(ctx.transport.request).mock.calls.filter(([path]) => typeof path === 'string' && path.includes('?'))).toHaveLength(1)
  })

  it('persists upload failure streaks across recovery probes and runner reconstruction until the circuit opens', async () => {
    const first = makeRow(0, '2021100850612')
    const ctx = setup([first])
    const save = vi.spyOn(ctx.repository, 'save')
    let task = ctx.task
    task.writeFailureStreak = { upload: 0, association: 0 }
    const failUpload: JihuaTransport['upload'] = vi.fn(async (_file: File, _material: Material, _requestId: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      throw new Error('OA 上传失败（HTTP 524）；结果未确认。')
    })
    ctx.transport.upload = failUpload
    ctx.transport.receipt = vi.fn(async () => ({ state: 'failed' as const, error: 'HTTP 524' }))

    for (const [index, next] of [makeRow(1, '2021100850613'), makeRow(2, '2021100850614')].entries()) {
      if (index > 0) {
        const persisted = save.mock.calls.at(-1)?.[0]
        expect(persisted?.writeFailureStreak?.upload).toBe(index)
        task = JSON.parse(JSON.stringify(persisted)) as JihuaTask
        task.rows.forEach(row => { row.selected = false })
        task.rows.push(next)
        task.scannedFiles++
        ctx.files.set(next.id, makeHandle(next.fileName))
      }
      next.selected = true
      next.status = 'pending'
      const runner = new JihuaRunner(task, ctx.repository, ctx.transport, { recoveryDelaysMs: [0, 0, 0] })
      await runner.run()
      expect(task.writeFailureStreak?.upload).toBe(index + 1)
      expect(task.recovery).toBeUndefined()
      expect(task.pauseReason).toBeUndefined()
      expect(task.status).toBe('failed')
    }

    const persisted = save.mock.calls.at(-1)?.[0]
    expect(persisted?.writeFailureStreak?.upload).toBe(2)
    task = JSON.parse(JSON.stringify(persisted)) as JihuaTask
    task.rows.forEach(row => { row.selected = false })
    const third = makeRow(3, '2021100850615')
    const concurrent = Array.from({ length: 5 }, (_, index) => makeRow(index + 4, `20211008506${String(index + 6).padStart(2, '0')}`))
    const waiting = makeRow(9, '2021100850699')
    task.rows.push(third, ...concurrent, waiting)
    task.scannedFiles += 7
    for (const row of [third, ...concurrent, waiting]) ctx.files.set(row.id, makeHandle(row.fileName))
    for (const row of [third, ...concurrent, waiting]) { row.selected = true; row.status = 'pending' }
    const sixSent = deferred()
    const failThird = deferred()
    const settleConcurrent = deferred()
    const circuitSaved = deferred()
    let started = 0
    const concurrentNames = new Set(concurrent.map(row => row.fileName))
    ctx.transport.upload = vi.fn(async (file: File, _material: Material, _requestId: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      if (++started === 6) sixSent.resolve()
      if (file.name === third.fileName) {
        await failThird.promise
        throw new Error('OA 上传失败（HTTP 524）；结果未确认。')
      }
      if (concurrentNames.has(file.name)) {
        await settleConcurrent.promise
        return { code: 200, data: [{ ID: `settled-${file.name}` }] }
      }
      throw new Error(`Unexpected upload for ${file.name}`)
    })
    save.mockImplementation(async snapshot => {
      if (snapshot.pauseReason?.includes('上传写入连续 3 次')) circuitSaved.resolve()
    })
    const runner = new JihuaRunner(task, ctx.repository, ctx.transport, { recoveryDelaysMs: [0, 0, 0] })
    const run = runner.run()

    await sixSent.promise
    failThird.resolve()
    await circuitSaved.promise
    const circuitSnapshot = save.mock.calls.find(([snapshot]) => snapshot.writeFailureStreak?.upload === 3 && snapshot.pauseReason?.includes('上传写入连续 3 次'))?.[0]
    expect(circuitSnapshot?.recovery).toBeUndefined()
    expect(task.writeFailureStreak?.upload).toBe(3)
    settleConcurrent.resolve()
    await run

    expect(task.status).toBe('paused')
    expect(task.pauseReason).toContain('上传写入连续 3 次')
    expect(task.writeFailureStreak?.upload).toBe(0)
    expect(task.writeFailureStreak?.circuitOpen).toBe(true)
    expect(third.status).toBe('failed')
    expect(concurrent.every(row => row.status === 'pending' && row.intent?.sent && row.receipt?.attachments.length)).toBe(true)
    expect(waiting).toMatchObject({ status: 'pending', selected: true })
    expect(waiting.intent).toBeUndefined()
    expect(ctx.transport.upload).toHaveBeenCalledTimes(6)

    await new JihuaRunner(task, ctx.repository, ctx.transport, { recoveryDelaysMs: [0] }).run()
    expect(task.status).toBe('paused')
    expect(ctx.transport.upload).toHaveBeenCalledTimes(6)
  })

  it.each(['pause', 'cancel'] as const)('interrupts a blocked recovery probe promptly on %s', async mode => {
    const row = makeRow(0)
    const ctx = setup([row])
    const request = ctx.transport.request
    const probeStarted = deferred()
    const releaseProbe = deferredValue<unknown>()
    let searches = 0
    ctx.transport.request = vi.fn(async (path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) => {
      if (path.includes('?') && ++searches === 2) {
        probeStarted.resolve()
        return releaseProbe.promise
      }
      return request(path, method, body)
    })
    ctx.transport.upload = vi.fn(async (_file: File, _material: Material, _id: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      throw new Error('OA 上传失败（HTTP 524）；结果未确认。')
    })
    ctx.transport.receipt = vi.fn(async () => ({ state: 'failed' as const, error: 'HTTP 524' }))
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport, { recoveryDelaysMs: [0, 0, 0] })
    const run = runner.run()

    await probeStarted.promise
    expect(ctx.task.recovery?.attempt).toBe(1)
    if (mode === 'pause') runner.pause()
    else runner.cancel()
    await run

    expect(ctx.task.status).toBe(mode === 'pause' ? 'paused' : 'cancelled')
    expect(ctx.task.recovery).toBeUndefined()
    expect(ctx.transport.upload).toHaveBeenCalledTimes(1)
    expect(ctx.updateBodies).toHaveLength(0)

    releaseProbe.resolve({ code: 200, total: 1, rows: [{ ID: `case-${row.applicationNo}`, PATENT_NO: row.applicationNo }] })
    await Promise.resolve()
    await Promise.resolve()
    expect(ctx.transport.upload).toHaveBeenCalledTimes(1)
    expect(ctx.updateBodies).toHaveLength(0)
  })

  it.each(['pause', 'cancel'] as const)('interrupts the recovery backoff promptly on %s', async mode => {
    const row = makeRow(0)
    const ctx = setup([row])
    const recoverySaved = deferred()
    ctx.repository.save = vi.fn(async (snapshot: JihuaTask) => {
      if (snapshot.recovery) recoverySaved.resolve()
    })
    ctx.transport.upload = vi.fn(async (_file: File, _material: Material, _id: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      throw new Error('OA 上传失败（HTTP 524）；结果未确认。')
    })
    ctx.transport.receipt = vi.fn(async () => ({ state: 'failed' as const, error: 'HTTP 524' }))
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport, { recoveryDelaysMs: [500] })
    const run = runner.run()

    await recoverySaved.promise
    if (mode === 'pause') runner.pause()
    else runner.cancel()
    const settledQuickly = await Promise.race([
      run.then(() => true),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 120)),
    ])
    if (!settledQuickly) {
      runner.cancel()
      await run
    }

    expect(settledQuickly).toBe(true)
    expect(ctx.task.status).toBe(mode === 'pause' ? 'paused' : 'cancelled')
    expect(ctx.task.recovery).toBeUndefined()
    expect(ctx.transport.checkSession).toHaveBeenCalledTimes(2)
  })

  it('holds same-application manual retries and other queued work behind recovery', async () => {
    const active = makeRow(0, '2021100850612')
    const sameApplicationRetry = makeRow(1, active.applicationNo, 'APPLY_FILE')
    const otherRetry = makeRow(2, '2021100850613')
    for (const row of [sameApplicationRetry, otherRetry]) {
      row.selected = false
      row.status = 'failed'
      row.error = '等待人工重试。'
    }
    const ctx = setup([active, sameApplicationRetry, otherRetry])
    const request = ctx.transport.request
    const probeStarted = deferred()
    const releaseProbe = deferredValue<unknown>()
    let activeSearches = 0
    ctx.transport.request = vi.fn(async (path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) => {
      if (path.includes('?')) {
        const applicationNo = new URL(path, 'https://example.test').searchParams.get('PATENT_NUM') ?? ''
        if (applicationNo === active.applicationNo && ++activeSearches === 2) {
          probeStarted.resolve()
          return releaseProbe.promise
        }
      }
      return request(path, method, body)
    })
    const sameApplicationStarted = deferred()
    const otherStarted = deferred()
    ctx.transport.upload = vi.fn(async (file: File, _material: Material, _id: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      if (file.name === active.fileName) throw new Error('OA 上传失败（HTTP 524）；结果未确认。')
      if (file.name === sameApplicationRetry.fileName) sameApplicationStarted.resolve()
      if (file.name === otherRetry.fileName) otherStarted.resolve()
      return { code: 200, data: [{ ID: `uploaded-${file.name}` }] }
    })
    ctx.transport.receipt = vi.fn(async () => ({ state: 'failed' as const, error: 'HTTP 524' }))
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport, { recoveryDelaysMs: [0, 0, 0] })
    const run = runner.run()

    await probeStarted.promise
    expect(await runner.enqueue([sameApplicationRetry.id, otherRetry.id])).toBe(2)
    expect(ctx.transport.upload).toHaveBeenCalledTimes(1)
    expect(sameApplicationRetry.status).toBe('pending')
    expect(otherRetry.status).toBe('pending')

    releaseProbe.resolve({ code: 200, total: 1, rows: [{ ID: `case-${active.applicationNo}`, PATENT_NO: active.applicationNo }] })
    await Promise.all([sameApplicationStarted.promise, otherStarted.promise])
    expect(ctx.transport.upload).toHaveBeenCalledTimes(3)
    await run
    expect(active.status).toBe('failed')
    expect(sameApplicationRetry.status).toBe('success')
    expect(otherRetry.status).toBe('success')
  })

  it('appends a different application while all six upload lanes are occupied', async () => {
    const rows = Array.from({ length: 7 }, (_, index) => makeRow(index, `20211008506${String(index).padStart(2, '0')}`))
    const appended = rows[6]
    appended.selected = false
    appended.status = 'failed'
    appended.error = '上次查询失败。'
    const ctx = setup(rows)
    const release = new Map(rows.map(row => [row.id, deferred()]))
    const sixStarted = deferred()
    const appendedStarted = deferred()
    const save = vi.spyOn(ctx.repository, 'save')
    let initialStarted = 0
    let activeUploads = 0
    let peakUploads = 0
    ctx.transport.upload = vi.fn(async (file: File, _material: Material, _requestId: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      activeUploads++
      peakUploads = Math.max(peakUploads, activeUploads)
      if (file.name === appended.fileName) appendedStarted.resolve()
      else if (++initialStarted === 6) sixStarted.resolve()
      await release.get(rows.find(row => row.fileName === file.name)!.id)!.promise
      activeUploads--
      return { code: 200, data: [{ ID: `uploaded-${file.name}` }] }
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    const run = runner.run()

    await sixStarted.promise
    expect(await runner.enqueue([appended.id])).toBe(1)
    expect(appended).toMatchObject({ selected: true, status: 'pending', error: '上次查询失败。' })
    expect(save.mock.calls.some(([snapshot]) =>
      snapshot.rows.some(row => row.id === appended.id && row.status === 'pending' && row.selected),
    )).toBe(true)
    expect(ctx.transport.upload).toHaveBeenCalledTimes(6)

    release.get(rows[0].id)!.resolve()
    await appendedStarted.promise
    expect(ctx.transport.upload).toHaveBeenCalledTimes(7)
    expect(peakUploads).toBeLessThanOrEqual(6)

    for (const row of rows.slice(1)) release.get(row.id)!.resolve()
    await run
    expect(appended.status).toBe('success')
    expect(peakUploads).toBeLessThanOrEqual(6)
  })

  it('serializes same-application requeues and ignores a duplicate enqueue click', async () => {
    const first = makeRow(0)
    const appended = makeRow(1, first.applicationNo, 'APPLY_FILE')
    appended.materialKey = ''
    appended.selected = false
    appended.status = 'unmatched'
    appended.error = '请手动选择材料。'
    const ctx = setup([first, appended])
    const releaseFirst = deferred()
    const releaseAppended = deferred()
    const firstStarted = deferred()
    const appendedStarted = deferred()
    ctx.transport.upload = vi.fn(async (file: File, _material: Material, _requestId: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      if (file.name === first.fileName) {
        firstStarted.resolve()
        await releaseFirst.promise
      } else {
        appendedStarted.resolve()
        await releaseAppended.promise
      }
      return { code: 200, data: [{ ID: `uploaded-${file.name}` }] }
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    const run = runner.run()

    await firstStarted.promise
    expect(await runner.enqueue([appended.id], new Map([[appended.id, 'APPLY_FILE']]))).toBe(1)
    expect(appended.materialKey).toBe('APPLY_FILE')
    expect(await runner.enqueue([appended.id])).toBe(0)
    expect(ctx.transport.upload).toHaveBeenCalledTimes(1)

    releaseFirst.resolve()
    await appendedStarted.promise
    expect(ctx.transport.upload).toHaveBeenCalledTimes(2)
    releaseAppended.resolve()
    await run
    expect(appended.status).toBe('success')
  })

  it('honors clearing a material before requeue without uploading under the old mapping', async () => {
    const row = makeRow(0)
    row.status = 'failed'
    const ctx = setup([row])
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    expect(await runner.enqueue([row.id], new Map([[row.id, '']]))).toBe(1)
    expect(row.materialKey).toBe('')
    await runner.run()
    expect(row.status).toBe('unmatched')
    expect(ctx.transport.upload).not.toHaveBeenCalled()
  })

  it('preserves queued intent and receipt and reuses them instead of posting again', async () => {
    const recovered = makeRow(0, '2021100850612')
    const retained = makeRow(1, '2021100850613')
    for (const row of [recovered, retained]) {
      row.selected = false
      row.status = 'failed'
      row.error = '上次上传需要核对。'
      row.attempts = 3
      row.record = { id: `case-${row.applicationNo}`, type: 'INVENTION', applicationNo: row.applicationNo }
    }
    recovered.intent = {
      requestId: 'recovered-request', sessionKey: session.key, tabId: session.tabId,
      documentId: session.documentId, sent: true, materialKey: recovered.materialKey,
      applicationNo: recovered.applicationNo,
    }
    retained.intent = {
      requestId: 'retained-request', sessionKey: session.key, tabId: session.tabId,
      documentId: session.documentId, sent: true, materialKey: retained.materialKey,
      applicationNo: retained.applicationNo,
    }
    retained.receipt = { attachments: [{ ID: 'retained-attachment' }] }
    const recoveredIntent = recovered.intent
    const retainedIntent = retained.intent
    const retainedReceipt = retained.receipt
    const recoveredRecord = recovered.record
    const retainedRecord = retained.record
    const ctx = setup([recovered, retained])
    ctx.transport.receipt = vi.fn(async requestId => requestId === 'recovered-request'
      ? { state: 'done' as const, value: { code: 200, data: [{ ID: 'recovered-attachment' }] } }
      : { state: 'missing' as const })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)

    expect(await runner.enqueue([recovered.id, retained.id], new Map([
      [recovered.id, 'APPLY_FILE'], [retained.id, 'APPLY_FILE'],
    ]))).toBe(2)
    expect(recovered).toMatchObject({ selected: true, status: 'pending', error: '上次上传需要核对。', attempts: 3, materialKey: 'PATENT_REQUEST' })
    expect(retained).toMatchObject({ selected: true, status: 'pending', error: '上次上传需要核对。', attempts: 3, materialKey: 'PATENT_REQUEST' })
    expect(recovered.intent).toBe(recoveredIntent)
    expect(retained.intent).toBe(retainedIntent)
    expect(retained.receipt).toBe(retainedReceipt)
    expect(recovered.record).toBe(recoveredRecord)
    expect(retained.record).toBe(retainedRecord)

    await runner.run()

    expect(ctx.transport.receipt).toHaveBeenCalledTimes(1)
    expect(ctx.transport.receipt).toHaveBeenCalledWith('recovered-request')
    expect(ctx.transport.upload).not.toHaveBeenCalled()
    expect(JSON.stringify(ctx.updateBodies)).toContain('recovered-attachment')
    expect(JSON.stringify(ctx.updateBodies)).toContain('retained-attachment')
    expect(recovered.status).toBe('success')
    expect(retained.status).toBe('success')
  })

  it('keeps a row enqueued after workers drain pending for the next resume', async () => {
    const completed = makeRow(0, '2021100850612')
    const late = makeRow(1, '2021100850613')
    late.selected = false
    late.status = 'failed'
    late.error = '需要再次核对。'
    const ctx = setup([completed, late])
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    let enqueuePromise: Promise<number> | undefined
    const originalSave = ctx.repository.save.bind(ctx.repository)
    ctx.repository.save = vi.fn(async (snapshot: JihuaTask) => {
      if (snapshot.status === 'completed' && !enqueuePromise) enqueuePromise = runner.enqueue([late.id])
      await originalSave(snapshot)
    })

    await runner.run()
    expect(enqueuePromise).toBeDefined()
    expect(await enqueuePromise).toBe(1)
    expect(late).toMatchObject({ selected: true, status: 'pending', error: '需要再次核对。' })
    expect(ctx.task.status).toBe('paused')
    expect(ctx.task.pauseReason).toContain('队列已结束')
    expect(ctx.transport.upload).toHaveBeenCalledTimes(1)
  })

  it.each(['pause', 'cancel'] as const)('persists a requeue during %s without reviving the current run', async mode => {
    const active = makeRow(0, '2021100850612')
    const queued = makeRow(1, '2021100850613')
    queued.selected = false
    queued.status = 'failed'
    queued.error = '待人工重试。'
    const ctx = setup([active, queued])
    const save = vi.spyOn(ctx.repository, 'save')
    const uploadStarted = deferred()
    const finishUpload = deferredValue<unknown>()
    ctx.transport.upload = vi.fn(async (_file: File, _material: Material, _requestId: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      uploadStarted.resolve()
      return finishUpload.promise
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    const run = runner.run()

    await uploadStarted.promise
    if (mode === 'pause') runner.pause()
    else runner.cancel()
    expect(await runner.enqueue([queued.id])).toBe(1)
    expect(queued).toMatchObject({ selected: true, status: 'pending', error: '待人工重试。' })

    if (mode === 'pause') {
      finishUpload.resolve({ code: 200, data: [{ ID: 'active-upload' }] })
      await run
      expect(ctx.task.status).toBe('paused')
    } else {
      await run
      expect(ctx.task.status).toBe('cancelled')
      finishUpload.resolve({ code: 200, data: [{ ID: 'late-active-upload' }] })
      await Promise.resolve()
      await Promise.resolve()
    }

    expect(queued.status).toBe('pending')
    expect(ctx.transport.upload).toHaveBeenCalledTimes(1)
    expect(save.mock.calls.some(([snapshot]) =>
      snapshot.rows.some(row => row.id === queued.id && row.status === 'pending' && row.selected && row.error === '待人工重试。'),
    )).toBe(true)
  })

  it.each(['OA 上传失败（HTTP 524）；结果未确认。', '无法连接季华 OA；上传结果未确认，请先回读核对。'])(
    'does not treat an old failed receipt as a new outage when resuming other cases: %s', async error => {
    const old = makeRow(0, '2021100850612')
    old.status = 'failed'
    old.intent = { requestId: 'old-524', sessionKey: session.key, tabId: session.tabId, documentId: session.documentId,
      sent: true, materialKey: old.materialKey, applicationNo: old.applicationNo }
    const fresh = makeRow(1, '2021100850613')
    const ctx = setup([old, fresh])
    ctx.transport.receipt = vi.fn(async () => ({ state: 'failed' as const, error }))
    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()
    expect(old.status).toBe('failed')
    expect(old.intent.requestId).toBe('old-524')
    expect(fresh.status).toBe('success')
    expect(ctx.transport.upload).toHaveBeenCalledTimes(1)
    expect(ctx.task.status).toBe('failed')
    })

  it('does not post an association if paused during the pre-save detail read', async () => {
    const ctx = setup()
    const readStarted = deferred()
    const releaseRead = deferred()
    ctx.hooks.beforeDetail = async (_recordId, read) => {
      if (read === 2) {
        readStarted.resolve()
        await releaseRead.promise
      }
    }
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    const run = runner.run()

    await readStarted.promise
    runner.pause()
    releaseRead.resolve()
    await run

    expect(ctx.updateBodies).toHaveLength(0)
    expect(ctx.task.status).toBe('paused')
  })

  it('cancels an unresolved upload quickly and ignores its late receipt', async () => {
    const ctx = setup()
    const save = vi.spyOn(ctx.repository, 'save')
    const uploadStarted = deferred()
    const finishUpload = deferredValue<unknown>()
    ctx.transport.upload = vi.fn(async (_file: File, _material: Material, _requestId: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      uploadStarted.resolve()
      return finishUpload.promise
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    const run = runner.run()

    await uploadStarted.promise
    runner.cancel()
    runner.cancel()
    await run

    expect(ctx.task.status).toBe('cancelled')
    expect(ctx.task.rows[0]?.status).toBe('pending')
    expect(ctx.task.rows[0]?.intent).toMatchObject({ sent: true })
    expect(ctx.task.rows[0]?.receipt).toBeUndefined()
    expect(ctx.updateBodies).toHaveLength(0)
    const savesWhenSettled = save.mock.calls.length

    finishUpload.resolve({ code: 200, data: [{ ID: 'late-upload' }] })
    await Promise.resolve()
    await Promise.resolve()

    expect(ctx.task.rows[0]?.receipt).toBeUndefined()
    expect(ctx.updateBodies).toHaveLength(0)
    expect(save).toHaveBeenCalledTimes(savesWhenSettled)
  })

  it('keeps pause graceful and waits for an in-flight upload result', async () => {
    const ctx = setup()
    const uploadStarted = deferred()
    const finishUpload = deferredValue<unknown>()
    ctx.transport.upload = vi.fn(async (_file: File, _material: Material, _requestId: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      uploadStarted.resolve()
      return finishUpload.promise
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    let settled = false
    const run = runner.run().then(() => { settled = true })

    await uploadStarted.promise
    runner.pause()
    await Promise.resolve()
    expect(settled).toBe(false)

    finishUpload.resolve({ code: 200, data: [{ ID: 'pause-upload-result' }] })
    await run

    expect(settled).toBe(true)
    expect(ctx.task.status).toBe('paused')
    expect(ctx.task.rows[0]?.receipt?.attachments).toEqual([{ ID: 'pause-upload-result' }])
    expect(ctx.updateBodies).toHaveLength(0)
  })

  it('does not start upload if cancellation lands during the durable sent checkpoint', async () => {
    const ctx = setup()
    const checkpointStarted = deferred()
    const releaseCheckpoint = deferred()
    const save = vi.fn(async (snapshot: JihuaTask) => {
      if (snapshot.rows[0]?.intent?.sent) {
        checkpointStarted.resolve()
        await releaseCheckpoint.promise
      }
    })
    ctx.repository.save = save
    ctx.transport.upload = vi.fn(async (_file: File, _material: Material, _requestId: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      ctx.uploadResults.push({ requestId: 'should-not-send', materialKey: 'PATENT_REQUEST', id: 'should-not-send' })
      return { code: 200, data: [{ ID: 'should-not-send' }] }
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    const run = runner.run()

    await checkpointStarted.promise
    runner.cancel()
    releaseCheckpoint.resolve()
    await run

    expect(ctx.task.status).toBe('cancelled')
    expect(ctx.task.rows[0]?.intent).toMatchObject({ sent: true })
    expect(ctx.uploadResults).toHaveLength(0)
    expect(ctx.updateBodies).toHaveLength(0)
  })

  it('cancels a hung lookup before any local file read and fences its late result', async () => {
    const ctx = setup()
    const save = vi.spyOn(ctx.repository, 'save')
    const lookupStarted = deferred()
    const finishLookup = deferredValue<unknown>()
    const fileHandle = ctx.files.get(ctx.task.rows[0].id)!
    const getFile = vi.spyOn(fileHandle, 'getFile')
    ctx.transport.request = vi.fn(async () => {
      lookupStarted.resolve()
      return finishLookup.promise
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    const run = runner.run()

    await lookupStarted.promise
    runner.cancel()
    await run
    expect(ctx.task.status).toBe('cancelled')
    expect(getFile).not.toHaveBeenCalled()
    expect(ctx.transport.upload).not.toHaveBeenCalled()
    const savesWhenSettled = save.mock.calls.length

    finishLookup.resolve({ code: 200, total: 1, rows: [{ ID: 'late-case', PATENT_NO: ctx.task.rows[0].applicationNo }] })
    await Promise.resolve()
    await Promise.resolve()

    expect(getFile).not.toHaveBeenCalled()
    expect(ctx.transport.upload).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledTimes(savesWhenSettled)
  })

  it('cancels while waiting for the local file handle without reading or sending it', async () => {
    const ctx = setup()
    const save = vi.spyOn(ctx.repository, 'save')
    const fileLookupStarted = deferred()
    const finishFileLookup = deferredValue<LocalFileHandle | undefined>()
    const fileHandle = ctx.files.get(ctx.task.rows[0].id)!
    const getFile = vi.spyOn(fileHandle, 'getFile')
    ctx.repository.getFile = vi.fn(async () => {
      fileLookupStarted.resolve()
      return finishFileLookup.promise
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    const run = runner.run()

    await fileLookupStarted.promise
    runner.cancel()
    await run
    expect(ctx.task.status).toBe('cancelled')
    expect(getFile).not.toHaveBeenCalled()
    expect(ctx.transport.upload).not.toHaveBeenCalled()
    const savesWhenSettled = save.mock.calls.length

    finishFileLookup.resolve(fileHandle)
    await Promise.resolve()
    await Promise.resolve()

    expect(getFile).not.toHaveBeenCalled()
    expect(ctx.transport.upload).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledTimes(savesWhenSettled)
  })

  it('durably cancels during the initial session check and ignores its late result', async () => {
    const ctx = setup()
    const save = vi.spyOn(ctx.repository, 'save')
    const checkStarted = deferred()
    const finishCheck = deferred()
    ctx.transport.checkSession = vi.fn(async () => {
      checkStarted.resolve()
      await finishCheck.promise
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    const run = runner.run()

    await checkStarted.promise
    runner.cancel()
    await run

    expect(ctx.task.status).toBe('cancelled')
    expect(ctx.task.session).toBeUndefined()
    expect(save).toHaveBeenCalledTimes(1)
    const savesWhenSettled = save.mock.calls.length
    finishCheck.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(ctx.task.status).toBe('cancelled')
    expect(ctx.task.session).toBeUndefined()
    expect(save).toHaveBeenCalledTimes(savesWhenSettled)
  })

  it('holds the Web Lock until the cancelled task checkpoint is durable', async () => {
    const ctx = setup()
    const checkStarted = deferred()
    const finishCheck = deferred()
    const cancelledSaveStarted = deferred()
    const finishCancelledSave = deferred()
    ctx.transport.checkSession = vi.fn(async () => {
      checkStarted.resolve()
      await finishCheck.promise
    })
    const save = vi.fn(async (snapshot: JihuaTask) => {
      if (snapshot.status === 'cancelled') {
        cancelledSaveStarted.resolve()
        await finishCancelledSave.promise
      }
    })
    ctx.repository.save = save
    let lockBodyFinished = false
    const request = vi.fn(async (_name: string, _options: unknown, callback: (lock: Lock | null) => Promise<void>) => {
      try { await callback({ name: 'jihua-test-lock' } as Lock) }
      finally { lockBodyFinished = true }
    })
    vi.stubGlobal('navigator', { locks: { request } })

    try {
      const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
      const run = runner.run()
      await checkStarted.promise
      runner.cancel()
      await cancelledSaveStarted.promise

      expect(lockBodyFinished).toBe(false)
      finishCancelledSave.resolve()
      await run
      expect(lockBodyFinished).toBe(true)
      expect(ctx.task.status).toBe('cancelled')

      const savesWhenSettled = save.mock.calls.length
      finishCheck.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(save).toHaveBeenCalledTimes(savesWhenSettled)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('uploads one copy when separate roots point to the same physical ordinary file', async () => {
    const rows = [makeRow(0), makeRow(1)]
    const ctx = setup(rows)
    const first = ctx.files.get(rows[0].id)!
    const second = ctx.files.get(rows[1].id)!
    const secondGetFile = vi.spyOn(second, 'getFile')
    first.isSameEntry = vi.fn(async other => other === second)
    second.isSameEntry = vi.fn(async other => other === first)

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    expect(ctx.uploadResults).toHaveLength(1)
    expect(rows[0]?.status).toBe('success')
    expect(rows[1]?.status).toBe('excluded')
    expect(rows[1]?.error).toContain('同一物理文件')
    expect(secondGetFile).not.toHaveBeenCalled()
  })

  it('serializes different material updates for one application and keeps prior attachments', async () => {
    const applicationNo = '2021100850612'
    const rows = [makeRow(0, applicationNo), makeRow(1, applicationNo, 'APPLY_FILE')]
    const ctx = setup(rows)
    ctx.stored.set(`case-${applicationNo}`, { statusRightAppendixList: [{ ID: 'pre-existing' }] })
    ctx.hooks.beforeUpdate = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    expect(ctx.peakUpdates).toBe(1)
    expect(ctx.updateBodies).toHaveLength(2)
    expect(ctx.updateBodies[0]?.statusRightAppendixList).toEqual(['pre-existing'])
    expect(ctx.updateBodies[1]?.statusRightAppendixList).toEqual(['pre-existing'])
    expect(ctx.updateBodies[1]?.patentRequestAppendixList).toEqual(['upload-1'])
    expect(ctx.stored.get(`case-${applicationNo}`)?.applyFileAppendixList).toEqual([{ ID: 'upload-2' }])
    expect(rows.every(row => row.status === 'success')).toBe(true)
  })

  it('stops other application lanes after a global session failure', async () => {
    const rows = [makeRow(0, '2021100850612'), makeRow(1, '2021100850613')]
    const ctx = setup(rows)
    const releaseOtherLane = deferred()
    const otherLaneWaiting = deferred()
    const sessionFailureSaved = deferred()
    let checks = 0
    ctx.transport.checkSession = vi.fn(async () => {
      checks++
      if (checks === 2) {
        await otherLaneWaiting.promise
        throw new JihuaError('session expired', 'session')
      }
      if (checks === 3) {
        otherLaneWaiting.resolve()
        await releaseOtherLane.promise
      }
    })
    ctx.repository.save = vi.fn(async (snapshot: JihuaTask) => {
      if (snapshot.errors.some(error => error.includes('session expired'))) sessionFailureSaved.resolve()
    })
    const run = new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    await otherLaneWaiting.promise
    await sessionFailureSaved.promise
    releaseOtherLane.resolve()
    await run

    expect(ctx.uploadResults).toHaveLength(0)
    expect(ctx.updateBodies).toHaveLength(0)
    expect(ctx.task.status).toBe('paused')
  })

  it('blocks all lookup and upload side effects when the task owner changed', async () => {
    const ctx = setup()
    ctx.task.session = { ...session, key: 'previous-owner' }
    const firstRowHandle = ctx.files.get(ctx.task.rows[0].id)!
    const firstGetFile = vi.spyOn(firstRowHandle, 'getFile')

    await expect(new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()).rejects.toThrow(/会话已变化/)

    expect(ctx.task.pauseReason).toContain('会话已变化')
    expect(ctx.transport.request).not.toHaveBeenCalled()
    expect(ctx.transport.upload).not.toHaveBeenCalled()
    expect(firstGetFile).not.toHaveBeenCalled()
  })

  it('rejects multiple OFC files before reading any file bytes', async () => {
    const rows = [makeRow(0, '2021100850612', 'ACPT_NOTICE'), makeRow(1, '2021100850612', 'ACPT_NOTICE')]
    const ctx = setup(rows)
    const firstGetFile = vi.spyOn(ctx.files.get(rows[0].id)!, 'getFile')
    const secondGetFile = vi.spyOn(ctx.files.get(rows[1].id)!, 'getFile')

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    expect(rows.map(row => row.status)).toEqual(['unmatched', 'unmatched'])
    expect(firstGetFile).not.toHaveBeenCalled()
    expect(secondGetFile).not.toHaveBeenCalled()
    expect(ctx.uploadResults).toHaveLength(0)
  })

  it('recovers a durable upload receipt before reading bytes or starting another upload', async () => {
    const row = makeRow(0)
    row.intent = {
      requestId: 'saved-request', sessionKey: session.key, tabId: session.tabId,
      documentId: session.documentId, sent: true, materialKey: row.materialKey, applicationNo: row.applicationNo,
    }
    const ctx = setup([row])
    const fileGetFile = vi.spyOn(ctx.files.get(row.id)!, 'getFile')
    ctx.transport.receipt = vi.fn(async requestId => requestId === 'saved-request'
      ? { state: 'done' as const, value: { code: 200, data: [{ ID: 'recovered-attachment' }] } }
      : { state: 'missing' as const })

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    expect(ctx.transport.receipt).toHaveBeenCalledWith('saved-request')
    expect(ctx.transport.upload).not.toHaveBeenCalled()
    expect(fileGetFile).not.toHaveBeenCalled()
    expect(row.receipt?.attachments).toEqual([{ ID: 'recovered-attachment' }])
    expect(row.status).toBe('success')
  })
})
