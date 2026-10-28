import { describe, expect, it, vi } from 'vitest'
import type { EasyTransport } from '../../../src/api/transport'
import type { ApiResult } from '../../../src/api/types'
import {
  buildGetFileNameParams, downloadRecipe, NAME_BATCH, readGeneratedFileNames, resolveDownloadFileNames, selectionFromControls, stripApplicationNoDot
} from '../../../src/mail/download-name'

const TEMPLATE = 'd9896997-1e83-4c7d-9a49-da69ba56e7aa'
const FILE = '603ca943-a07a-4894-9461-29dff2d60c4b'
/** 265 个文件正好是 7 批（6 批满 40 + 25），能验证 5 路并发及后续批次乱序补位。 */
const FILES = Array.from({ length: 265 }, (_, index) =>
  `603ca943-a07a-4894-9461-${String(index).padStart(12, '0')}`)
const GENERATED = FILES.map((_, index) => `文件${index}.pdf`)
const SELECTION = { newFilename: 'file_desc', fileNameType: 'colname' }

function controlledNames() {
  const pending: { ids: string[]; signal?: AbortSignal; finish: (result?: ApiResult<unknown>) => void }[] = []
  let active = 0
  let peak = 0
  const transport = {
    async post(operation: string, params: URLSearchParams, signal?: AbortSignal) {
      expect(operation).toBe('getFileName')
      const ids = params.get('file_ids')!.split(';')
      expect(ids.length).toBeLessThanOrEqual(NAME_BATCH)
      active += 1
      peak = Math.max(peak, active)
      return new Promise<ApiResult<unknown>>(resolve => {
        pending.push({ ids, signal, finish(result) {
          active -= 1
          resolve(result ?? {
            ok: true,
            data: {
              file_names: ids.map(id => GENERATED[FILES.indexOf(id)]).join(';'),
              ClientInfo: { IsLogin: true, Status: true, Result: false }
            }
          })
        } })
      })
    }
  } as unknown as EasyTransport
  return { transport, pending, peak: () => peak }
}

describe('下载名称', () => {
  it('选中模板时记下配方，不把空列当成名称', () => {
    expect(selectionFromControls({
      templateId: TEMPLATE,
      column: '',
      label: '微众官文',
      template: { newFilename: 'case_volume;官文', fileNameType: 'colname;txt' }
    })).toEqual({
      templateId: TEMPLATE,
      newFilename: 'case_volume;官文',
      fileNameType: 'colname;txt',
      label: '微众官文'
    })
    expect(selectionFromControls({ column: '' })).toBeNull()
    expect(selectionFromControls({ column: 'case_volume', label: '我方文号' })).toEqual({
      column: 'case_volume',
      newFilename: 'case_volume',
      fileNameType: 'colname',
      label: '我方文号'
    })
    expect(downloadRecipe('case_volume;', 'colname;txt')).toBeNull()
  })

  it('GetFileName 按文件顺序带回生成名', async () => {
    const params = buildGetFileNameParams([FILE], { newFilename: 'file_desc', fileNameType: 'colname' })
    expect(params?.get('Call')).toBe('GetFileName')
    expect(params?.get('file_ids')).toBe(FILE)
    expect(params?.get('new_filename')).toBe('file_desc')
    expect(readGeneratedFileNames({
      file_names: '证书.pdf',
      ClientInfo: { Status: true, Result: false, Message: null }
    }, 1)).toEqual(['证书.pdf'])

    const transport = {
      async post(operation: string) {
        if (operation === 'fileTempList') {
          return {
            ok: true as const,
            data: { TempNameList: [{ id: TEMPLATE, new_filename: 'case_volume;官文', file_name_type: 'colname;txt' }] }
          }
        }
        return {
          ok: true as const,
          data: { file_names: 'PA1官文.pdf', ClientInfo: { Status: true } }
        }
      }
    }
    const named = await resolveDownloadFileNames(transport as unknown as EasyTransport, [FILE], { templateId: TEMPLATE })
    expect(named).toEqual({ ok: true, data: ['PA1官文.pdf'] })
  })

  it('最多同时生成五批名称，乱序完成后仍逐项对应原文件且进度按完成文件数递增', async () => {
    const { transport, pending, peak } = controlledNames()
    const progress: number[][] = []
    const named = resolveDownloadFileNames(transport, FILES, SELECTION, {
      onProgress: (done, total) => progress.push([done, total])
    })
    await vi.waitFor(() => expect(pending).toHaveLength(5))
    pending[3].finish()
    await vi.waitFor(() => expect(pending).toHaveLength(6))
    pending[1].finish()
    await vi.waitFor(() => expect(pending).toHaveLength(7))
    pending[5].finish()
    pending[0].finish()
    pending[2].finish()
    pending[4].finish()
    pending[6].finish()
    expect(await named).toEqual({ ok: true, data: GENERATED })
    expect(peak()).toBe(5)
    expect(progress).toEqual([[0, 265], [40, 265], [80, 265], [120, 265], [160, 265], [200, 265], [240, 265], [265, 265]])
  })

  it.each([
    { label: '单批网络失败', response: { ok: false, error: { code: 'NETWORK_ERROR', message: '无法连接 EASY。' } } as ApiResult<unknown>, code: 'NETWORK_ERROR' },
    { label: '单批登录失效', response: { ok: true, data: { ClientInfo: { IsLogin: false, Status: true }, file_names: GENERATED.slice(0, 20).join(';') } } as ApiResult<unknown>, code: 'SESSION_EXPIRED' },
    { label: '单批名称数量不足', response: { ok: true, data: { ClientInfo: { IsLogin: true, Status: true }, file_names: '只有一个.pdf' } } as ApiResult<unknown>, code: 'INVALID_RESPONSE' }
  ])('$label 后停止派发并取消其余请求，不返回残缺名称', async ({ response, code }) => {
    const { transport, pending } = controlledNames()
    const progress: number[][] = []
    const named = resolveDownloadFileNames(transport, FILES, SELECTION, {
      onProgress: (done, total) => progress.push([done, total])
    })
    await vi.waitFor(() => expect(pending).toHaveLength(5))
    pending[1].finish(response)
    await vi.waitFor(() => expect(pending[0].signal?.aborted).toBe(true))
    for (const batch of pending.filter((_, index) => index !== 1)) batch.finish()
    expect(await named).toMatchObject({ ok: false, error: { code } })
    expect(pending).toHaveLength(5)
    expect(progress).toEqual([[0, 265]])
  })

  it('取消时停止派发并取消正在生成名称的请求', async () => {
    const { transport, pending } = controlledNames()
    const controller = new AbortController()
    const named = resolveDownloadFileNames(transport, FILES, SELECTION, { signal: controller.signal })
    await vi.waitFor(() => expect(pending).toHaveLength(5))
    controller.abort()
    expect(pending.every(batch => batch.signal?.aborted)).toBe(true)
    for (const batch of pending) batch.finish()
    expect(await named).toMatchObject({ ok: false, error: { code: 'REQUEST_ABORTED' } })
    expect(pending).toHaveLength(5)
  })

  it('已取消时不再读取模板或生成名称', async () => {
    let requests = 0
    const transport = { async post() {
      requests += 1
      return { ok: true, data: { ClientInfo: { Status: true }, file_names: '文件.pdf' } }
    } } as unknown as EasyTransport
    const controller = new AbortController()
    controller.abort()
    expect(await resolveDownloadFileNames(transport, [FILE], SELECTION, { signal: controller.signal }))
      .toMatchObject({ ok: false, error: { code: 'REQUEST_ABORTED' } })
    expect(requests).toBe(0)
  })

  it('生成名的公共响应标记已登出时不能接受名称', () => {
    expect(readGeneratedFileNames({ ClientInfo: { Status: true, IsLogin: false }, file_names: '文件.pdf' }, 1)).toBeNull()
  })

  it('模板响应标记登录失效时不使用缓存配方继续生成名称', async () => {
    const calls: string[] = []
    const transport = { async post(operation: string) {
      calls.push(operation)
      return { ok: true, data: { ClientInfo: { IsLogin: false, Status: true }, file_names: '文件.pdf' } }
    } } as unknown as EasyTransport
    expect(await resolveDownloadFileNames(transport, [FILE], { templateId: TEMPLATE, ...SELECTION }))
      .toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED' } })
    expect(calls).toEqual(['fileTempList'])
  })

  it('下载文件名里申请号去掉校验点，扩展名的小数点不动', () => {
    expect(stripApplicationNoDot('202610026334.9-清洗液监测系统及其监测方法-专利申请受理通知书.pdf'))
      .toBe('2026100263349-清洗液监测系统及其监测方法-专利申请受理通知书.pdf')
    expect(stripApplicationNoDot('202610026334.9.pdf')).toBe('2026100263349.pdf')
    expect(stripApplicationNoDot('202610026334.9PA25111422CND-YS-驳回决定.pdf'))
      .toBe('2026100263349PA25111422CND-YS-驳回决定.pdf')
    // 校验位是 X 的申请号同样去点；名字本身以 X 开头接在数字校验位后时也要去点
    expect(stripApplicationNoDot('202311613183.X-磁悬浮骨骼、潜热器及潜热器制造方法-手续合格通知书.pdf'))
      .toBe('202311613183X-磁悬浮骨骼、潜热器及潜热器制造方法-手续合格通知书.pdf')
    expect(stripApplicationNoDot('202311613183.x-小写校验位.pdf')).toBe('202311613183x-小写校验位.pdf')
    expect(stripApplicationNoDot('202610026334.9X射线检测装置-受理通知书.pdf')).toBe('2026100263349X射线检测装置-受理通知书.pdf')
    expect(stripApplicationNoDot('97123456.7-老案-受理通知书.pdf')).toBe('971234567-老案-受理通知书.pdf')
    expect(stripApplicationNoDot('PA25111422CND-YS-驳回决定.pdf')).toBe('PA25111422CND-YS-驳回决定.pdf')
    expect(stripApplicationNoDot('2026.6.2默认不在我所复审.pdf')).toBe('2026.6.2默认不在我所复审.pdf')
    expect(stripApplicationNoDot('2026100263341.9-十三位不算申请号.pdf')).toBe('2026100263341.9-十三位不算申请号.pdf')
    expect(stripApplicationNoDot('202610026334.91-小数不是申请号.pdf')).toBe('202610026334.91-小数不是申请号.pdf')
  })
})
