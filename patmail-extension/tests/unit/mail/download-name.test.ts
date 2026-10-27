import { describe, expect, it } from 'vitest'
import type { EasyTransport } from '../../../src/api/transport'
import {
  buildGetFileNameParams, downloadRecipe, readGeneratedFileNames, resolveDownloadFileNames, selectionFromControls, stripApplicationNoDot
} from '../../../src/mail/download-name'

const TEMPLATE = 'd9896997-1e83-4c7d-9a49-da69ba56e7aa'
const FILE = '603ca943-a07a-4894-9461-29dff2d60c4b'

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
