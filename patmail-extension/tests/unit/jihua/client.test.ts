import { describe, expect, it, vi } from 'vitest'
import { JihuaClient, buildUpdate, parseUploadReceipt } from '../../../src/jihua/client'
import type { JihuaTransport } from '../../../src/jihua/types'

function transport(request: JihuaTransport['request']): JihuaTransport {
  return { session: { key: 'owner', tabId: 1, documentId: 'doc', title: 'OA' }, request,
    checkSession: vi.fn(), upload: vi.fn(), receipt: vi.fn() }
}

describe('Jihua exact matching and preserving updates', () => {
  it('queries PATENT_NUM and follows pages before resolving an exact normalized number', async () => {
    const request = vi.fn(async (path: string) => path.includes('pageNum=1')
      ? { code: 200, total: 2, rows: [{ ID: 'wrong', PATENT_NO: '2021100850613' }] }
      : { code: 200, total: 2, rows: [{ ID: 'right', PATENT_NO: 'CN202110085061.2', PATENT_NAME: 'Name' }] })
    const record = await new JihuaClient(transport(request)).findUnique('2021100850612')
    expect(record).toMatchObject({ id: 'right', type: 'INVENTION', applicationNo: '2021100850612' })
    expect(request.mock.calls[0]?.[0]).toContain('PATENT_NUM=2021100850612')
    expect(request.mock.calls).toHaveLength(2)
  })
  it('rejects multiple exact matches and unsupported patent types', async () => {
    const client = new JihuaClient(transport(vi.fn(async () => ({ code: 200, total: 2, rows: [
      { ID: 'a', PATENT_NO: '2021100850612' }, { ID: 'b', PATENT_NO: '2021100850612' }
    ] }))))
    await expect(client.findUnique('2021100850612')).rejects.toThrow(/多条/)
    await expect(client.findUnique('2023300850612')).rejects.toThrow(/外观|支持/)
  })
  it('preserves every other field and attachment and merges root-level ID arrays', () => {
    const detail = { form: { ID: 'case', PATENT_NO: '2021100850612', IS_HAVE_GER: 'TRUE', KEEP: 'preserved' },
      attachments: { applyFileAppendixList: [{ ID: 'old' }], customAppendixList: [{ ID: 'future' }], fastCheckReqFixAppendixList: [{ ID: 'reserved' }] } }
    const body = buildUpdate(detail, 'INVENTION', { applyFileAppendixList: [{ ID: 'new' }, { ID: 'old' }] })
    expect(body.patentParameter).toMatchObject({ KEEP: 'preserved', ID: 'case' })
    expect(body.applyFileAppendixList).toEqual(['old', 'new'])
    expect(body.customAppendixList).toEqual(['future'])
    expect(body.fastCheckReqFixAppendixList).toEqual(['reserved'])
    expect(detail.attachments.applyFileAppendixList).toEqual([{ ID: 'old' }])
  })
  it('requires confirmed business success and valid upload IDs; OCR failure is a warning', () => {
    expect(() => parseUploadReceipt({ code: 500, data: [{ ID: 'bad' }], msg: '拒绝' }, false)).toThrow('拒绝')
    expect(() => parseUploadReceipt({ code: 200, data: [{ APPENDIX_NAME: 'file' }] }, false)).toThrow(/ID/)
    const receipt = parseUploadReceipt({ code: 200, data: { appendixList: [{ ID: 'ok' }], IS_OFC_SUCCESS: false } }, true)
    expect(receipt).toMatchObject({ attachments: [{ ID: 'ok' }], ofcRecognized: false })
    expect(receipt.warning).toContain('识别')
  })
  it('refuses a wrong-case detail and malformed lists instead of silently clearing them', async () => {
    const record = { id: 'a', type: 'INVENTION' as const, applicationNo: '2021100850612' }
    const request = vi.fn(async () => ({ code: 200, data: { patentParameter: { ID: 'a', PATENT_NO: '2021100850613' } } }))
    await expect(new JihuaClient(transport(request)).detail(record)).rejects.toThrow(/不一致/)
    request.mockResolvedValue({ code: 200, data: { patentParameter: { ID: 'a', PATENT_NO: record.applicationNo }, applyFileAppendixListObj: {} } } as never)
    await expect(new JihuaClient(transport(request)).detail(record)).rejects.toThrow(/附件/)
  })
})
