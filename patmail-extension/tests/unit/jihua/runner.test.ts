import { describe, expect, it, vi } from 'vitest'
import { JihuaRunner } from '../../../src/jihua/runner'
import type { Attachment, JihuaRepository, JihuaRow, JihuaTask, JihuaTransport } from '../../../src/jihua/types'

const session = { key: 'owner', tabId: 1, documentId: 'doc', title: 'OA' }
function row(index = 0, app = '2021100850612'): JihuaRow {
  return { id: `file-${index}`, rootId: 'root', relativePath: `${index}.pdf`, fileName: `${app}-Case-递交合并档.pdf`,
    extension: 'pdf', applicationNo: app, caseName: 'Case', description: '递交合并档', materialKey: 'PATENT_REQUEST',
    selected: true, status: 'pending', error: '', attempts: 0, updatedAt: 0 }
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
