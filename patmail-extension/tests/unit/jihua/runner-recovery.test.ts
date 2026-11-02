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

  it('pauses the pipeline on an upstream 524 and preserves sent intents without replaying uploads', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => makeRow(index, `20211008506${String(index).padStart(2, '0')}`))
    const ctx = setup(rows)
    ctx.transport.upload = vi.fn(async (_file: File, _material: Material, _id: string, beforeSend: () => Promise<void>) => {
      await beforeSend()
      throw new Error('OA 上传失败（HTTP 524）；结果未确认。')
    })
    ctx.transport.receipt = vi.fn(async () => ({ state: 'failed' as const, error: 'OA 上传失败（HTTP 524）；结果未确认。' }))

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    expect(ctx.task.status).toBe('paused')
    expect(ctx.transport.upload).toHaveBeenCalled()
    expect(vi.mocked(ctx.transport.upload).mock.calls.length).toBeLessThanOrEqual(6)
    expect(rows.slice(6).every(row => row.status === 'pending' && !row.intent)).toBe(true)
    expect(rows.filter(row => row.intent?.sent).every(row => row.status === 'failed' && /524/.test(row.error))).toBe(true)
    expect(ctx.task.errors.some(error => /暂停新上传/.test(error))).toBe(true)
    const sentCount = vi.mocked(ctx.transport.upload).mock.calls.length
    // Retry only the uncertain rows: the original receipt is observed, never multipart again.
    rows.forEach(row => { row.selected = Boolean(row.intent?.sent) })
    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()
    expect(ctx.transport.upload).toHaveBeenCalledTimes(sentCount)
    expect(ctx.updateBodies).toHaveLength(0)
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
