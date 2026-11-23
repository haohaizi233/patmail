import { describe, expect, it } from 'vitest'
import {
  buildNoticeExportGroups,
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
  formatCertProcessStatus,
  formatDownloadProcessStatus,
  NOTICE_IMPORT_COMPLETED_COLUMNS,
  noticeRowKey,
  noticeTodayDateText
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

  it('uses original site defaults for download/cert tabs and formats process status badges', () => {
    expect(createDefaultNoticeDownloadQuery().status).toBe('unprocess')
    expect(createDefaultNoticeCertQuery().status).toBe('1')
    expect(NOTICE_IMPORT_COMPLETED_COLUMNS.length).toBeGreaterThan(0)

    expect(formatDownloadProcessStatus('download fail')).toEqual({ text: '通知书文件下载失败', tone: 'fail' })
    expect(formatDownloadProcessStatus('processing')).toEqual({ text: '处理中...', tone: 'warn' })
    expect(formatDownloadProcessStatus('fail', '自定义错误')).toEqual({ text: '自定义错误', tone: 'fail' })
    expect(formatDownloadProcessStatus('fail')).toEqual({ text: '通知书解析失败', tone: 'fail' })
    expect(formatDownloadProcessStatus('finish')).toEqual({ text: '解析完成', tone: 'ok' })
    expect(formatDownloadProcessStatus('')).toEqual({ text: '待下载', tone: '' })

    expect(formatCertProcessStatus('1')).toEqual({ text: '待下载', tone: 'warn' })
    expect(formatCertProcessStatus(2)).toEqual({ text: '已下载', tone: 'ok' })
    expect(formatCertProcessStatus('finish')).toEqual({ text: '解析完成', tone: 'ok' })
    expect(formatCertProcessStatus('error', '证书损坏')).toEqual({ text: '证书损坏', tone: 'fail' })
    expect(formatCertProcessStatus('unknown')).toEqual({ text: '状态异常', tone: 'fail' })
  })

  it('populates today date as default end date across notice query constructors', () => {
    const fixedNow = new Date(2026, 10, 23, 9, 15, 0)
    expect(noticeTodayDateText(fixedNow)).toBe('2026-11-23')

    const imp = createDefaultNoticeImportQuery(fixedNow)
    expect(imp.post_date_s).toBe('')
    expect(imp.post_date_e).toBe('2026-11-23')
    expect(imp.xiazairq_s).toBe('')
    expect(imp.xiazairq_e).toBe('2026-11-23')
    expect(imp.update_time_s).toBe('')
    expect(imp.update_time_e).toBe('2026-11-23')

    const dl = createDefaultNoticeDownloadQuery('2026-10-01', fixedNow)
    expect(dl.startTime).toBe('2026-10-01')
    expect(dl.endTime).toBe('2026-11-23')

    const cert = createDefaultNoticeCertQuery(fixedNow)
    expect(cert.startTime).toBe('')
    expect(cert.endTime).toBe('2026-11-23')

    const replay = createDefaultNoticeReplayQuery('acc-1', fixedNow)
    expect(replay.startTime).toBe('')
    expect(replay.endTime).toBe('2026-11-23')
  })

  it('builds grouped export columns for all 4 tabs and appends dynamic import condition fields', () => {
    const baseGroups = buildNoticeExportGroups('import', createDefaultNoticeImportQuery())
    expect(baseGroups.map(g => g.title)).toEqual(['案件信息', '文件信息', '著录项目'])
    expect(baseGroups[0].columns.some(c => c.value === 'agency_id')).toBe(false)

    const richQuery = {
      ...createDefaultNoticeImportQuery(),
      agency_id: 'ag-1',
      apply_type: 'IV',
      flow_direction: 'OO'
    }
    const richGroups = buildNoticeExportGroups('import', richQuery)
    expect(richGroups[0].columns.some(c => c.value === 'agency_id' && c.text === '代理机构')).toBe(true)
    expect(richGroups[0].columns.some(c => c.value === 'apply_type' && c.text === '申请类型')).toBe(true)
    expect(richGroups[0].columns.some(c => c.value === 'flow_direction' && c.text === '案件流向')).toBe(true)

    expect(buildNoticeExportGroups('download')[0].title).toBe('来文信息')
    expect(buildNoticeExportGroups('cert')[0].title).toBe('证书信息')
    expect(buildNoticeExportGroups('replay')[0].title).toBe('来文信息')
  })
})
