import { describe, expect, it } from 'vitest'
import { downloadFilesRequestIssue, isMessage } from '../../../src/shared/message'

const item = { fileId: '603ca943-a07a-4894-9461-29dff2d60c4b', fileNo: 'A001', fileName: '通知.pdf' }
const payload = (fileName = item.fileName, selection: unknown = null) => ({ items: [{ ...item, fileName }], selection, stripAppNoDot: true })
const recipe = { newFilename: 'file_name', fileNameType: 'colname' }

describe('下载请求参数诊断', () => {
  it('1608个文件仍在允许范围内', () => {
    const request = { ...payload(), items: Array.from({ length: 1608 }, () => ({ ...item })) }
    expect(isMessage({ type: 'DOWNLOAD_FILES', payload: request })).toBe(true)
  })
  it.each(['原名;附录.pdf', '名'.repeat(181) + '.pdf'])('选择命名配方后原名只是元数据：%s', name => {
    expect(isMessage({ type: 'DOWNLOAD_FILES', payload: payload(name, recipe) })).toBe(true)
  })
  it.each(['原名;附录.pdf', '名'.repeat(181) + '.pdf'])('直接使用不安全原名时定位附件并提示设置名称', name => {
    const request = { ...payload(), items: [item, { ...item, fileName: name }] }
    expect(downloadFilesRequestIssue(request)).toMatch(/第2个附件.*设置下载名称/)
    expect(isMessage({ type: 'DOWNLOAD_FILES', payload: request })).toBe(false)
  })
  it('有配方也不接受无界元数据或无效文件标识', () => {
    expect(isMessage({ type: 'DOWNLOAD_FILES', payload: payload('名'.repeat(4097), recipe) })).toBe(false)
    expect(downloadFilesRequestIssue({ ...payload(), items: [{ ...item, fileId: 'bad' }] })).toContain('第1个附件')
    expect(downloadFilesRequestIssue({ ...payload(), items: [{ ...item, fileNo: 'a;b' }] })).toContain('文件编号')
  })
  it('控制字段、配方和转发信封仍须校验', () => {
    for (const extra of [{ stripAppNoDot: 'yes' }, { browserTarget: item.fileId }, { detached: true }, { taskId: 'bad' }, { selection: {} }, { extra: 1 }]) {
      const request = { ...payload(), ...extra }
      expect(downloadFilesRequestIssue(request)).not.toBe('')
      expect(isMessage({ type: 'WORKSPACE', payload: { action: 'forward', message: { type: 'DOWNLOAD_FILES', payload: request } } })).toBe(false)
    }
    expect(downloadFilesRequestIssue(payload())).toBe('')
  })
})
