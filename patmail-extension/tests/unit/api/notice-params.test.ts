import { describe, expect, it } from 'vitest'
import {
  buildNoticeExportPayload,
  buildNoticeSearchPayload,
  createDefaultNoticeCertQuery,
  createDefaultNoticeDownloadQuery,
  createDefaultNoticeHandExcelQuery,
  createDefaultNoticeHandHisQuery,
  createDefaultNoticeHandQuery,
  createDefaultNoticeImportQuery,
  createDefaultNoticeNolaiutoQuery,
  createDefaultNoticeReplayQuery,
  filterNoticeRowsByKeyword,
  noticeRowKey
} from '../../../src/api/notice-params'

describe('notice-params', () => {
  it('routes import search between SearchNotice (status=0) and GetImportNoticeList (status=1) and keeps exact EASY spelling', () => {
    const q0 = {
      ...createDefaultNoticeImportQuery(),
      case_volume: 'PA001',
      is_fuzzy_query_case_volume: true,
      is_hz_interfice: true,
      is_speed_checkd: '1' as const,
      hearing_the_case: '0' as const,
      files_is_case: '1' as const
    }
    const r0 = buildNoticeSearchPayload({ tab: 'import', query: q0 })
    expect(r0.operation).toBe('noticeSearch')
    expect(r0.params.get('Call')).toBe('SearchNotice')
    expect(r0.params.get('is_fuzzy_query_case_volume')).toBe('true')
    expect(r0.params.get('is_hz_interfice')).toBe('1')
    expect(r0.params.get('is_speed_checkd')).toBe('1')
    expect(r0.params.get('hearing_the_case')).toBe('0')
    expect(r0.params.get('files_is_case')).toBe('1')
    expect(r0.params.get('log_pagename')).toBe('NoticeInfo.aspx')

    const q1 = { ...q0, status: '1' as const, is_hz_interfice: false }
    const r1 = buildNoticeSearchPayload({ tab: 'import', query: q1 })
    expect(r1.operation).toBe('noticeImportList')
    expect(r1.params.get('Call')).toBe('GetImportNoticeList')
    expect(r1.params.get('is_hz_interfice')).toBe('')
  })

  it('builds payloads for all remaining 7 Notice tabs cleanly', () => {
    const dl = buildNoticeSearchPayload({
      tab: 'download',
      query: { ...createDefaultNoticeDownloadQuery('2026-10-01'), account: 'acc-1', status: 'unprocess' }
    })
    expect(dl.operation).toBe('noticeUnProcessTzsList')
    expect(dl.params.get('Call')).toBe('GetUnProcessTzsList')
    expect(dl.params.get('startTime')).toBe('2026-10-01')
    expect(dl.params.get('status')).toBe('unprocess')

    const cert = buildNoticeSearchPayload({
      tab: 'cert',
      query: { ...createDefaultNoticeCertQuery(), xlh: 'XLH-99', status: '3' }
    })
    expect(cert.operation).toBe('noticeCertList')
    expect(cert.params.get('Call')).toBe('GetCertList')
    expect(cert.params.get('xlh')).toBe('XLH-99')

    const replay = buildNoticeSearchPayload({
      tab: 'replay',
      query: { ...createDefaultNoticeReplayQuery('acc-2'), applyType: '2', noticeName: '审查' }
    })
    expect(replay.operation).toBe('noticeReplayTzsList')
    expect(replay.params.get('Call')).toBe('GetReplayTzsList')
    expect(replay.params.get('applyType')).toBe('2')
    expect(replay.params.get('noticeName')).toBe('审查')

    const hand = buildNoticeSearchPayload({
      tab: 'hand',
      query: { ...createDefaultNoticeHandQuery(), assayer: 'u1' }
    })
    expect(hand.operation).toBe('noticeHandList')
    expect(hand.params.get('Call')).toBe('GetHandNoticeList')
    expect(hand.params.get('assayer')).toBe('u1')

    const handHis = buildNoticeSearchPayload({
      tab: 'handHis',
      query: { ...createDefaultNoticeHandHisQuery(), assayer: 'u2' }
    })
    expect(handHis.operation).toBe('noticeHandHisList')
    expect(handHis.params.get('Call')).toBe('GetHandHisList')

    const nolaiuto = buildNoticeSearchPayload({
      tab: 'nolaiuto',
      query: createDefaultNoticeNolaiutoQuery()
    })
    expect(nolaiuto.operation).toBe('noticeNolaiutoList')
    expect(nolaiuto.params.get('Call')).toBe('GetNolaiuto')

    const excel = buildNoticeSearchPayload({
      tab: 'handExcel',
      query: { ...createDefaultNoticeHandExcelQuery(), is_download: '已下载', is_handle: '0' }
    })
    expect(excel.operation).toBe('noticeHandExcelList')
    expect(excel.params.get('Call')).toBe('GethandExcelList')
    expect(excel.params.get('is_download')).toBe('已下载')
    expect(excel.params.get('is_handle')).toBe('0')
  })

  it('builds entity-encoded e_coulums for all 4 export tabs', () => {
    const imp = buildNoticeExportPayload({
      tab: 'import',
      query: { ...createDefaultNoticeImportQuery(), agency_id: 'ag-1' }
    })
    expect(imp.operation).toBe('noticeExportReport')
    expect(imp.params.get('Call')).toBe('ReportNoticeExcel')
    expect(imp.params.get('log_pagename')).toBe('IhgAdvExport.aspx')
    expect(imp.params.get('e_coulums')).toContain('&lt;agency_id&gt;代理机构&lt;/agency_id&gt;')

    const dl = buildNoticeExportPayload({ tab: 'download', query: createDefaultNoticeDownloadQuery() })
    expect(dl.params.get('Call')).toBe('ExportExcelTzsList')

    const cert = buildNoticeExportPayload({ tab: 'cert', query: createDefaultNoticeCertQuery() })
    expect(cert.params.get('Call')).toBe('GetCertListExport')

    const replay = buildNoticeExportPayload({ tab: 'replay', query: createDefaultNoticeReplayQuery() })
    expect(replay.params.get('Call')).toBe('ExportExcelTwoTzsList')
  })

  it('filters quick keyword rows and resolves stable row keys per tab', () => {
    const rows = [
      { oa_id: 'oa-1', oa_name: '专利申请受理通知书', ShenQingH: '202610001' },
      { oa_id: 'oa-2', oa_name: '费用减缴审批通知书', case_volume: 'PA9988' }
    ]
    expect(filterNoticeRowsByKeyword(rows, 'PA9988')).toHaveLength(1)
    expect(filterNoticeRowsByKeyword(rows, '')).toHaveLength(2)

    expect(noticeRowKey('download', { fid: 'f-1', oa_id: 'oa-1' })).toBe('f-1')
    expect(noticeRowKey('handExcel', { doc_no: 'D-123' })).toBe('D-123')
    expect(noticeRowKey('import', { oa_id: 'oa-9' })).toBe('oa-9')
  })
})
