import { expect, it, vi } from 'vitest'
import { resolveDownloadFileNames } from '../../../src/mail/download-name'
import type { EasyTransport } from '../../../src/api/transport'
it('已验证身份后恢复持久命名批次，不要求缓存伪造原站ClientInfo也不重新命名', async () => {
  const transport = { post: async () => { throw new Error('缓存完整时不能重新命名') } } as unknown as EasyTransport
  const response = await resolveDownloadFileNames(transport, ['00000000-0000-4000-8000-000000000001'],
    { newFilename: 'file_name', fileNameType: 'colname' }, { resolvedBatches: { '0': ['cached.pdf'] } })
  expect(response).toEqual({ ok: true, data: ['cached.pdf'] })
})

const IDS = Array.from({ length: 42 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)
const RECIPE = { newFilename: 'file_name', fileNameType: 'colname' }

it('混合缓存只请求缺少名称的ID，按原40项偏移合并并通知整批', async () => {
  const requested: string[][] = []
  const batches: Array<[number, string[]]> = []
  const progress: number[] = []
  const transport = { async post(_operation: string, params: URLSearchParams) {
    const ids = params.get('file_ids')!.split(';')
    requested.push(ids)
    return { ok: true, data: { ClientInfo: { Status: true }, file_names: ids.map(id => `${id}.pdf`).join(';') } }
  } } as unknown as EasyTransport
  const resolvedNames = Object.fromEntries(IDS.filter((_, index) => index !== 1 && index !== 40).map(id => [id, `cached-${id}.pdf`]))
  const result = await resolveDownloadFileNames(transport, IDS, RECIPE, {
    resolvedNames, concurrency: 1,
    onBatch: async (offset, names) => { batches.push([offset, names]) },
    onProgress: done => progress.push(done)
  })
  const expected = IDS.map((id, index) => index === 1 || index === 40 ? `${id}.pdf` : `cached-${id}.pdf`)
  expect(requested).toEqual([[IDS[1]], [IDS[40]]])
  expect(result).toEqual({ ok: true, data: expected })
  expect(batches).toEqual([[0, expected.slice(0, 40)], [40, expected.slice(40)]])
  expect(progress).toEqual([0, 40, 42])
})

it('逐ID名称完整时无需GetFileName，仍读取模板并回调原批次', async () => {
  const calls: string[] = []
  const batches: Array<[number, string[]]> = []
  const transport = { async post(operation: string) {
    calls.push(operation)
    return { ok: true, data: { TempNameList: [{ id: IDS[0], new_filename: 'file_desc', file_name_type: 'colname' }] } }
  } } as unknown as EasyTransport
  const result = await resolveDownloadFileNames(transport, IDS.slice(0, 2), { templateId: IDS[0], ...RECIPE }, {
    resolvedNames: { [IDS[0]]: 'cached-one.pdf', [IDS[1]]: 'cached-two.pdf' },
    onBatch: async (offset, names) => { batches.push([offset, names]) }
  })
  expect(calls).toEqual(['fileTempList'])
  expect(result).toEqual({ ok: true, data: ['cached-one.pdf', 'cached-two.pdf'] })
  expect(batches).toEqual([[0, ['cached-one.pdf', 'cached-two.pdf']]])
})

it.each(['', '  ', 'a;b.pdf', 'x'.repeat(181), 42])('逐ID缓存名称无效时失败关闭并立即通知消费者：%s', async cached => {
  const calls: string[] = []
  const onFailure = vi.fn()
  const onBatch = vi.fn()
  const transport = { async post(operation: string) {
    calls.push(operation)
    return { ok: true, data: { ClientInfo: { Status: true }, file_names: 'network.pdf' } }
  } } as unknown as EasyTransport
  const result = await resolveDownloadFileNames(transport, [IDS[0]], RECIPE, {
    resolvedNames: { [IDS[0]]: cached } as Record<string, string>, onFailure, onBatch
  })
  expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_RESPONSE' } })
  expect(calls).toEqual([])
  expect(onBatch).not.toHaveBeenCalled()
  expect(onFailure).toHaveBeenCalledExactlyOnceWith(result)
})
