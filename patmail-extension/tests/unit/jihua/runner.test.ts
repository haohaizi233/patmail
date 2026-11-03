import { describe, expect, it, vi } from 'vitest'
import { JihuaError } from '../../../src/jihua/client'
import { JihuaRunner } from '../../../src/jihua/runner'
import type { Attachment, JihuaRepository, JihuaRow, JihuaTask, JihuaTransport } from '../../../src/jihua/types'

const session = { key: 'owner', tabId: 1, documentId: 'doc', title: 'OA' }
function row(index = 0, app = '2021100850612'): JihuaRow {
  return { id: `file-${index}`, rootId: 'root', relativePath: `${index}.pdf`, fileName: `${app}-Case-递交合并档.pdf`,
    extension: 'pdf', applicationNo: app, caseName: 'Case', description: '递交合并档', materialKey: 'PATENT_REQUEST',
    selected: true, status: 'pending', error: '', attempts: 0, updatedAt: 0 }
}
function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function setup(rows = [row()]) {
  const task: JihuaTask = { id: 'task', createdAt: 0, updatedAt: 0, status: 'ready', roots: [], rows, scannedFiles: rows.length, excludedFiles: 0, errors: [] }
  const saved: JihuaTask[] = []
  const files = new Map(rows.map(item => [item.id, { kind: 'file' as const, name: item.fileName,
    getFile: vi.fn(async () => new File(['%PDF-1.7\ncontent'], item.fileName, { type: 'application/pdf' })) }]))
  const repository: JihuaRepository = { save: vi.fn(async (value: JihuaTask) => { saved.push(JSON.parse(JSON.stringify(value)) as JihuaTask) }),
    load: vi.fn(async () => null), archiveAndCreate: vi.fn(async () => undefined), listHistory: vi.fn(async () => []), findArchivedUploads: vi.fn(async () => []),
    restoreTask: vi.fn(async () => task), getFile: vi.fn(async (id: string) => files.get(id)), putFile: vi.fn(), putRoot: vi.fn(), getRoots: vi.fn(async () => []), clear: vi.fn() }
  const stored = new Map<string, Record<string, Attachment[]>>()
  let sequence = 0
  let saveFailure: Error | null = null
  const request = vi.fn(async (path: string, method?: string, body?: unknown) => {
    if (method === 'POST') {
      if (saveFailure) throw saveFailure
      const value = body as Record<string, unknown>
      const form = value.patentParameter as { ID: string }
      const fields = stored.get(form.ID) ?? {}
      for (const [key, list] of Object.entries(value)) if (key.endsWith('AppendixList')) fields[key] = (list as string[]).map(ID => ({ ID }))
      stored.set(form.ID, fields)
      return { code: 200 }
    }
    if (path.includes('?')) {
      const number = new URL(path, 'https://test').searchParams.get('PATENT_NUM')!
      return { code: 200, rows: [{ ID: number, PATENT_NO: number }], total: 1 }
    }
    const id = decodeURIComponent(path.split('/').at(-1)!)
    return { code: 200, data: { patentParameter: { ID: id, PATENT_NO: id, IS_HAVE_GER: 'TRUE' },
      ...Object.fromEntries(Object.entries(stored.get(id) ?? {}).map(([key, value]) => [`${key}Obj`, value])) } }
  })
  const transport: JihuaTransport = { session, checkSession: vi.fn(async () => {}), request,
    upload: vi.fn<JihuaTransport['upload']>(async (_file, _material, _id, beforeSend) => { await beforeSend(); return { code: 200, data: [{ ID: `upload-${++sequence}` }] } }),
    receipt: vi.fn(async () => ({ state: 'missing' as const })) }
  return { task, repository, transport, stored, saved, files, failUpdate(error: Error | null) { saveFailure = error } }
}

describe('Jihua six-lane durable pipeline', () => {
  it('never reads local bytes when the platform already has the material', async () => {
    const ctx = setup()
    ctx.stored.set('2021100850612', { patentRequestAppendixList: [{ ID: 'existing' }] })
    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()
    expect(ctx.task.rows[0]?.status).toBe('already')
    expect(ctx.files.get('file-0')?.getFile).not.toHaveBeenCalled()
    expect(ctx.transport.upload).not.toHaveBeenCalled()
  })
  it('durably records a receipt before association and only succeeds after readback', async () => {
    const ctx = setup()
    ctx.transport.acknowledge = vi.fn(async () => {
      expect(ctx.saved.some(snapshot => snapshot.rows[0]?.receipt?.attachments[0]?.ID === 'upload-1')).toBe(true)
    })
    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()
    expect(ctx.task.rows[0]?.status).toBe('success')
    expect(ctx.saved.some(snapshot => snapshot.rows[0]?.receipt?.attachments[0]?.ID === 'upload-1' && snapshot.rows[0].status !== 'success')).toBe(true)
    expect(ctx.stored.get('2021100850612')?.patentRequestAppendixList).toEqual([{ ID: 'upload-1' }])
  })
  it('resumes an association failure using the old receipt without retransmitting bytes', async () => {
    const ctx = setup()
    ctx.failUpdate(new Error('VPN network failed'))
    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()
    expect(ctx.task.rows[0]?.status).toBe('failed')
    expect(ctx.task.rows[0]?.receipt?.attachments[0]?.ID).toBe('upload-1')
    ctx.failUpdate(null)
    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()
    expect(ctx.task.rows[0]?.status).toBe('success')
    expect(ctx.transport.upload).toHaveBeenCalledTimes(1)
  })
  it('reconciles a lost update response by reading back the uploaded attachment ID', async () => {
    const ctx = setup()
    const original: JihuaTransport['request'] = ctx.transport.request
    ctx.transport.request = vi.fn(async (...args: Parameters<JihuaTransport['request']>) => {
      const value = await original(...args)
      if (args[1] === 'POST') throw new Error('message port closed after commit')
      return value
    })
    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()
    expect(ctx.task.rows[0]?.status).toBe('success')
    expect(ctx.transport.upload).toHaveBeenCalledTimes(1)
  })
  it('does not replay an upload whose sent request lost its source document and receipt', async () => {
    const ctx = setup()
    ctx.task.session = session
    ctx.task.rows[0].intent = { requestId: 'old-request', sessionKey: session.key, tabId: 1, documentId: 'old-document', sent: true }
    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()
    expect(ctx.task.rows[0]?.status).toBe('failed')
    expect(ctx.task.rows[0]?.error).toMatch(/回执|确认/)
    expect(ctx.transport.upload).not.toHaveBeenCalled()
  })
  it('isolates a historical sent row with a changed document from valid material siblings', async () => {
    const rows = [row(0), row(1), row(2)]
    for (const item of rows) item.materialKey = 'FIRST_RESULT'
    rows[0].intent = { requestId: 'old-document-request', sessionKey: session.key, tabId: session.tabId,
      documentId: 'old-document', sent: true, materialKey: 'FIRST_RESULT', applicationNo: rows[0].applicationNo }
    const ctx = setup(rows)

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    expect(rows.map(item => item.status)).toEqual(['failed', 'success', 'success'])
    expect(rows[0]?.error).toMatch(/原页面回执不可用/)
    expect(rows[0]?.intent).toMatchObject({ requestId: 'old-document-request', sent: true })
    expect(ctx.transport.receipt).not.toHaveBeenCalled()
    expect(ctx.transport.upload).toHaveBeenCalledTimes(2)
    expect(ctx.stored.get('2021100850612')?.firstResultAppendixList).toEqual([{ ID: 'upload-1' }, { ID: 'upload-2' }])
  })
  it.each(['missing', 'pending', 'failed'] as const)('isolates a historical %s upload receipt from a valid material sibling', async state => {
    const rows = [row(0), row(1)]
    for (const item of rows) item.materialKey = 'FIRST_RESULT'
    rows[0].intent = { requestId: `old-${state}-request`, sessionKey: session.key, tabId: session.tabId,
      documentId: session.documentId, sent: true, materialKey: 'FIRST_RESULT', applicationNo: rows[0].applicationNo }
    const ctx = setup(rows)
    ctx.transport.receipt = vi.fn<JihuaTransport['receipt']>(async () => state === 'failed'
      ? { state, error: 'The old upload failed without a usable receipt' }
      : { state })

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    expect(rows.map(item => item.status)).toEqual(['failed', 'success'])
    expect(rows[0]?.intent).toMatchObject({ requestId: `old-${state}-request`, sent: true })
    expect(rows[0]?.error).toMatch(state === 'failed' ? /old upload failed/ : /回执|确认/)
    expect(ctx.transport.upload).toHaveBeenCalledTimes(1)
    expect(ctx.stored.get('2021100850612')?.firstResultAppendixList).toEqual([{ ID: 'upload-1' }])
  })
  it('isolates an invalid historical receipt payload from a valid material sibling', async () => {
    const rows = [row(0), row(1)]
    for (const item of rows) item.materialKey = 'FIRST_RESULT'
    rows[0].intent = { requestId: 'old-invalid-receipt', sessionKey: session.key, tabId: session.tabId,
      documentId: session.documentId, sent: true, materialKey: 'FIRST_RESULT', applicationNo: rows[0].applicationNo }
    const ctx = setup(rows)
    ctx.transport.receipt = vi.fn(async () => ({ state: 'done' as const, value: { code: 200, data: [] } }))

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    expect(rows.map(item => item.status)).toEqual(['failed', 'success'])
    expect(rows[0]?.error).toMatch(/没有附件 ID/)
    expect(rows[0]?.intent).toMatchObject({ requestId: 'old-invalid-receipt', sent: true })
    expect(ctx.transport.upload).toHaveBeenCalledTimes(1)
    expect(ctx.stored.get('2021100850612')?.firstResultAppendixList).toEqual([{ ID: 'upload-1' }])
  })
  it('retains and associates an existing valid receipt beside a historical unknown row', async () => {
    const rows = [row(0), row(1)]
    for (const item of rows) item.materialKey = 'FIRST_RESULT'
    rows[0].intent = { requestId: 'old-document-request', sessionKey: session.key, tabId: session.tabId,
      documentId: 'old-document', sent: true, materialKey: 'FIRST_RESULT', applicationNo: rows[0].applicationNo }
    rows[1].receipt = { attachments: [{ ID: 'retained-sibling-receipt' }] }
    const ctx = setup(rows)

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    expect(rows.map(item => item.status)).toEqual(['failed', 'success'])
    expect(rows[1]?.receipt?.attachments).toEqual([{ ID: 'retained-sibling-receipt' }])
    expect(ctx.transport.upload).not.toHaveBeenCalled()
    expect(ctx.stored.get('2021100850612')?.firstResultAppendixList).toEqual([{ ID: 'retained-sibling-receipt' }])
  })
  it('keeps a historical receipt session failure as a global pause', async () => {
    const rows = [row(0), row(1)]
    for (const item of rows) item.materialKey = 'FIRST_RESULT'
    rows[0].intent = { requestId: 'old-session-request', sessionKey: session.key, tabId: session.tabId,
      documentId: session.documentId, sent: true, materialKey: 'FIRST_RESULT', applicationNo: rows[0].applicationNo }
    const ctx = setup(rows)
    ctx.transport.receipt = vi.fn(async () => { throw new JihuaError('OA 登录已失效', 'session') })

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    expect(ctx.task.status).toBe('paused')
    expect(ctx.task.pauseReason).toBe('OA 登录已失效')
    expect(rows.map(item => item.status)).toEqual(['pending', 'pending'])
    expect(rows[0]?.intent).toMatchObject({ requestId: 'old-session-request', sent: true })
    expect(ctx.transport.upload).not.toHaveBeenCalled()
  })
  it('keeps a historical receipt platform outage on the global recovery path', async () => {
    const rows = [row(0), row(1)]
    for (const item of rows) item.materialKey = 'FIRST_RESULT'
    rows[0].intent = { requestId: 'old-outage-request', sessionKey: session.key, tabId: session.tabId,
      documentId: session.documentId, sent: true, materialKey: 'FIRST_RESULT', applicationNo: rows[0].applicationNo }
    const ctx = setup(rows)
    ctx.transport.receipt = vi.fn(async () => { throw new Error('HTTP 524 while reading old receipt') })

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport, { recoveryDelaysMs: [0] }).run()

    expect(rows.map(item => item.status)).toEqual(['failed', 'failed'])
    expect(rows.every(item => item.error.includes('HTTP 524'))).toBe(true)
    expect(rows[0]?.intent).toMatchObject({ requestId: 'old-outage-request', sent: true })
    expect(ctx.transport.upload).not.toHaveBeenCalled()
    expect(ctx.task.recovery).toBeUndefined()
  })
  it('propagates storage failure while persisting an isolated historical receipt error', async () => {
    const rows = [row(0), row(1)]
    for (const item of rows) item.materialKey = 'FIRST_RESULT'
    rows[0].intent = { requestId: 'old-storage-request', sessionKey: session.key, tabId: session.tabId,
      documentId: 'old-document', sent: true, materialKey: 'FIRST_RESULT', applicationNo: rows[0].applicationNo }
    const ctx = setup(rows)
    ctx.repository.save = vi.fn(async (snapshot: JihuaTask) => {
      if (snapshot.rows[0]?.status === 'failed') throw new Error('quota exceeded while saving row failure')
    })

    await expect(new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run())
      .rejects.toThrow(/quota exceeded while saving row failure/)

    expect(rows[0]?.intent).toMatchObject({ requestId: 'old-storage-request', sent: true })
    expect(ctx.transport.upload).not.toHaveBeenCalled()
  })
  it('cancels a pending historical receipt read without uploading siblings', async () => {
    const rows = [row(0), row(1)]
    for (const item of rows) item.materialKey = 'FIRST_RESULT'
    rows[0].intent = { requestId: 'old-cancel-request', sessionKey: session.key, tabId: session.tabId,
      documentId: session.documentId, sent: true, materialKey: 'FIRST_RESULT', applicationNo: rows[0].applicationNo }
    const ctx = setup(rows)
    const receiptStarted = deferred()
    const receiptResult = deferred<{ state: 'missing' }>()
    ctx.transport.receipt = vi.fn<JihuaTransport['receipt']>(async () => {
      receiptStarted.resolve()
      return receiptResult.promise
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    const running = runner.run()

    await receiptStarted.promise
    runner.cancel()
    await running
    receiptResult.resolve({ state: 'missing' })

    expect(ctx.task.status).toBe('cancelled')
    expect(rows[0]?.intent).toMatchObject({ requestId: 'old-cancel-request', sent: true })
    expect(ctx.transport.upload).not.toHaveBeenCalled()
  })
  it('uses six application lanes while serializing files within the same case', async () => {
    const rows = Array.from({ length: 9 }, (_, i) => row(i, `20211008506${String(i).padStart(2, '0')}`))
    const ctx = setup(rows)
    let active = 0; let peak = 0
    ctx.transport.upload = vi.fn<JihuaTransport['upload']>(async (_file, _material, _id, beforeSend) => {
      await beforeSend(); peak = Math.max(peak, ++active)
      await new Promise(resolve => setTimeout(resolve, 10)); active--
      return { code: 200, data: [{ ID: `u-${_id}` }] }
    })
    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()
    expect(peak).toBe(6)
    expect(ctx.task.rows.every(item => item.status === 'success')).toBe(true)
  })
  it('stops before side effects if durable storage fails', async () => {
    const ctx = setup()
    ctx.repository.save = vi.fn(async () => { throw new Error('quota exceeded') })
    await expect(new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()).rejects.toThrow(/quota/)
    expect(ctx.transport.upload).not.toHaveBeenCalled()
  })
  it('rejects a renamed source or a webpage disguised as a PDF before upload', async () => {
    for (const renamed of [true, false]) {
      const ctx = setup()
      ctx.files.get('file-0')!.getFile = vi.fn(async () => new File([renamed ? '%PDF-1.7' : '<!doctype html><html>login</html>'], renamed ? 'another-case.pdf' : ctx.task.rows[0].fileName))
      await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()
      expect(ctx.task.rows[0].status).toBe('failed')
      expect(ctx.task.rows[0].error).toMatch(renamed ? /重命名/ : /网页/)
      expect(ctx.transport.upload).not.toHaveBeenCalled()
    }
  })
  it('isolates an invalid local file and still uploads and associates valid sibling rows', async () => {
    const rows = [row(0), row(1), row(2)]
    for (const item of rows) item.materialKey = 'FIRST_RESULT'
    const ctx = setup(rows)
    ctx.files.get(rows[1].id)!.getFile = vi.fn(async () => new File(['not a PDF'], rows[1].fileName, { type: 'application/pdf' }))

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    expect(rows.map(item => item.status)).toEqual(['success', 'failed', 'success'])
    expect(rows[1]?.error).toMatch(/PDF/)
    expect(ctx.transport.upload).toHaveBeenCalledTimes(2)
    expect(ctx.stored.get('2021100850612')?.firstResultAppendixList).toEqual([{ ID: 'upload-1' }, { ID: 'upload-2' }])
  })
  it('isolates missing handles and local file read errors to their own rows', async () => {
    const rows = [row(0), row(1), row(2), row(3)]
    for (const item of rows) item.materialKey = 'FIRST_RESULT'
    const ctx = setup(rows)
    ctx.files.delete(rows[1].id)
    ctx.files.get(rows[2].id)!.getFile = vi.fn(async () => { throw new Error('local file read failed') })

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    expect(rows.map(item => item.status)).toEqual(['success', 'failed', 'failed', 'success'])
    expect(rows[1]?.error).toMatch(/句柄丢失/)
    expect(rows[2]?.error).toBe('local file read failed')
    expect(ctx.transport.upload).toHaveBeenCalledTimes(2)
    expect(ctx.stored.get('2021100850612')?.firstResultAppendixList).toEqual([{ ID: 'upload-1' }, { ID: 'upload-2' }])
  })
  it('keeps each local error when every row in a material category is invalid', async () => {
    const rows = [row(0), row(1)]
    for (const item of rows) item.materialKey = 'FIRST_RESULT'
    const ctx = setup(rows)
    ctx.files.get(rows[0].id)!.getFile = vi.fn(async () => new File(['not a PDF'], rows[0].fileName, { type: 'application/pdf' }))
    ctx.files.delete(rows[1].id)

    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()

    expect(rows.map(item => item.status)).toEqual(['failed', 'failed'])
    expect(rows[0]?.error).toMatch(/PDF/)
    expect(rows[1]?.error).toMatch(/句柄丢失/)
    expect(ctx.transport.upload).not.toHaveBeenCalled()
    expect(vi.mocked(ctx.transport.request).mock.calls.filter(([, method]) => method === 'POST')).toHaveLength(0)
    expect(ctx.stored.size).toBe(0)
  })
  it('propagates storage failure while saving an isolated local preflight error', async () => {
    const rows = [row(0), row(1)]
    for (const item of rows) item.materialKey = 'FIRST_RESULT'
    const ctx = setup(rows)
    ctx.files.get(rows[0].id)!.getFile = vi.fn(async () => new File(['not a PDF'], rows[0].fileName, { type: 'application/pdf' }))
    ctx.repository.save = vi.fn(async (snapshot: JihuaTask) => {
      if (snapshot.rows[0]?.status === 'failed') throw new Error('quota exceeded')
    })

    await expect(new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()).rejects.toThrow(/quota exceeded/)

    expect(ctx.transport.upload).not.toHaveBeenCalled()
  })
  it('propagates repository storage failure while loading a file handle', async () => {
    const ctx = setup()
    ctx.repository.getFile = vi.fn(async () => { throw new Error('IndexedDB read failed') })

    await expect(new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()).rejects.toThrow(/IndexedDB read failed/)

    expect(ctx.transport.upload).not.toHaveBeenCalled()
  })
  it('does not start a staged upload when another lane fails its file read during the sent checkpoint', async () => {
    const rows = [row(0, '2021100850612'), row(1, '2021100850613')]
    const ctx = setup(rows)
    const first = rows[0]
    const second = rows[1]
    const secondGroupCheckpoint = deferred()
    const sentCheckpointStarted = deferred()
    const releaseSentCheckpoint = deferred()
    const secondFileReadStarted = deferred()
    const storageError = new Error('IndexedDB read failed in second lane')
    const save = ctx.repository.save.bind(ctx.repository)
    const getFile = ctx.repository.getFile.bind(ctx.repository)
    ctx.repository.save = vi.fn(async (snapshot: JihuaTask) => {
      const savedSecond = snapshot.rows.find(item => item.id === second.id)
      if (savedSecond?.attempts === 1 && savedSecond.record) secondGroupCheckpoint.resolve()
      const savedFirst = snapshot.rows.find(item => item.id === first.id)
      if (savedFirst?.intent?.sent && savedFirst.status === 'uploading') {
        sentCheckpointStarted.resolve()
        await releaseSentCheckpoint.promise
      }
      await save(snapshot)
    })
    ctx.repository.getFile = vi.fn(async (id: string) => {
      if (id === first.id) await secondGroupCheckpoint.promise
      if (id === second.id) {
        await sentCheckpointStarted.promise
        secondFileReadStarted.resolve()
        throw storageError
      }
      return getFile(id)
    })
    let startedMultipartRequests = 0
    ctx.transport.upload = vi.fn<JihuaTransport['upload']>(async (_file, _material, _requestId, beforeSend) => {
      await beforeSend()
      startedMultipartRequests++
      return { code: 200, data: [{ ID: `upload-${startedMultipartRequests}` }] }
    })
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    const running = runner.run()

    await secondFileReadStarted.promise
    await new Promise(resolve => setTimeout(resolve, 0))
    releaseSentCheckpoint.resolve()
    await expect(running).rejects.toBe(storageError)

    expect(startedMultipartRequests).toBe(0)
    expect(first.intent).toMatchObject({ sent: true })
    expect(ctx.saved.some(snapshot => snapshot.rows.find(item => item.id === first.id)?.intent?.sent === true)).toBe(true)
    expect(first.receipt).toBeUndefined()
  })
  it('preserves an in-flight upload receipt when paused, then resumes the association', async () => {
    const ctx = setup()
    const runner = new JihuaRunner(ctx.task, ctx.repository, ctx.transport)
    ctx.transport.upload = vi.fn<JihuaTransport['upload']>(async (_file, _material, _id, beforeSend) => { await beforeSend(); runner.pause(); return { code: 200, data: [{ ID: 'paused-upload' }] } })
    await runner.run()
    expect(ctx.task.status).toBe('paused')
    expect(ctx.task.rows[0]?.receipt?.attachments[0]?.ID).toBe('paused-upload')
    expect(ctx.stored.size).toBe(0)
    await new JihuaRunner(ctx.task, ctx.repository, ctx.transport).run()
    expect(ctx.task.rows[0]?.status).toBe('success')
    expect(ctx.transport.upload).toHaveBeenCalledTimes(1)
  })
})
