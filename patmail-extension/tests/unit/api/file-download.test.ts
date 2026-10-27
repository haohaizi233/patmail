import { describe, expect, it } from 'vitest'
import { buildDownloadParams, downloadArchiveName, readDownloadHandle, DOWNLOAD_MAX_ITEMS } from '../../../src/api/file-download'

describe('下载打包参数', () => {
  it('照抄原站 DownLoad：file_no 和 file_name 一一对应，model 固定 FILE', () => {
    const params = buildDownloadParams(
      ['A00110397537', 'A00110352626'],
      ['2026100263349-清洗液监测系统及其监测方法-专利申请受理通知书.pdf', '2026100263349-清洗液监测系统及其监测方法-驳回决定.pdf']
    )
    expect(params?.get('Call')).toBe('DownLoad')
    expect(params?.get('file_no')).toBe('A00110397537;A00110352626')
    expect(params?.get('file_name')).toBe('2026100263349-清洗液监测系统及其监测方法-专利申请受理通知书.pdf;2026100263349-清洗液监测系统及其监测方法-驳回决定.pdf')
    expect(params?.get('model')).toBe('FILE')
    expect(params?.get('zip_name')).toBe('')
    expect(params?.get('zip_pwd')).toBe('')
    expect(params?.get('down_type')).toBe('')
    expect(params?.get('childpath')).toBe('')
    expect(params?.get('log_pagename')).toBe('FileSearch.aspx')
  })

  it('数量对不上、编号或名称里带分号都不给参数，数量不设产品上限', () => {
    expect(buildDownloadParams([], [])).toBeNull()
    expect(buildDownloadParams(['A1'], ['a.pdf', 'b.pdf'])).toBeNull()
    expect(buildDownloadParams(['A;1'], ['a.pdf'])).toBeNull()
    expect(buildDownloadParams(['A1'], ['a;b.pdf'])).toBeNull()
    expect(buildDownloadParams([''], ['a.pdf'])).toBeNull()
    // 下载数量不设限：300 个照样打包，只有超过护栏才拦。
    const many = Array.from({ length: 301 }, () => 'A1')
    expect(buildDownloadParams(many, many.map(() => 'a.pdf'))).not.toBeNull()
    const huge = Array.from({ length: DOWNLOAD_MAX_ITEMS + 1 }, () => 'A1')
    expect(buildDownloadParams(huge, huge.map(() => 'a.pdf'))).toBeNull()
  })
})

describe('下载打包响应', () => {
  it('原站 Result 是 false 也算成功，认 file_guid；0 个失败不带提示', () => {
    expect(readDownloadHandle({
      error: true,
      error_message: '文件不存在或权限不足,您共0个文件下载失败！',
      ClientInfo: { IsLogin: true, Status: true, Result: false },
      file_guid: '85ebabc1-cf99-490e-b5f7-298a77742012'
    })).toEqual({
      ok: true,
      data: { fileGuid: '85ebabc1-cf99-490e-b5f7-298a77742012', fileSize: null, notice: '' }
    })
  })

  it('有文件失败时把原站提示带出来，file_size 允许字符串', () => {
    expect(readDownloadHandle({
      error_message: '文件不存在或权限不足,您共2个文件下载失败！',
      ClientInfo: { IsLogin: true, Status: true },
      file_guid: '85ebabc1-cf99-490e-b5f7-298a77742012',
      file_size: '2048'
    })).toEqual({
      ok: true,
      data: {
        fileGuid: '85ebabc1-cf99-490e-b5f7-298a77742012',
        fileSize: 2048,
        notice: '文件不存在或权限不足,您共2个文件下载失败！'
      }
    })
  })

  it('没有 file_guid 是失败，登录失效按 SESSION_EXPIRED', () => {
    expect(readDownloadHandle({
      error_message: '文件不存在或权限不足',
      ClientInfo: { IsLogin: true, Status: true, Result: false }
    })).toMatchObject({ ok: false, error: { code: 'BUSINESS_ERROR' } })
    expect(readDownloadHandle({ ClientInfo: { IsLogin: false }, file_guid: '85ebabc1-cf99-490e-b5f7-298a77742012' }))
      .toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED' } })
    expect(readDownloadHandle(null)).toMatchObject({ ok: false, error: { code: 'INVALID_RESPONSE' } })
    expect(readDownloadHandle({ ClientInfo: { IsLogin: true }, file_guid: '  ' }))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_ERROR' } })
  })
})

describe('压缩包另存名', () => {
  it('用可读时间戳，不再沿用原站的 1793001423.zip', () => {
    expect(downloadArchiveName(new Date(2026, 9, 26, 16, 36, 5))).toBe('下载文件-20261026-163605.zip')
  })
})
