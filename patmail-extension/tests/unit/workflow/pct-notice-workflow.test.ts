import { describe, expect, it } from 'vitest'
import { createDefaultNoticeDownloadQuery, createDefaultNoticeImportQuery } from '../../../src/api/notice-params'
import type { NoticeInitData } from '../../../src/api/notice-types'
import { xlsxBytes } from '../../../src/customer/xlsx-table'
import { MessageType, type ContentRequest, type ContentResponse, type MessageBridge } from '../../../src/shared/message'
import {
  buildUnimportedUnionSheet,
  extractUnimportedReplayRecords,
  isReplayRowUnimported,
  mergeUnimportedUnion,
  parseNoticeExportTable
} from '../../../src/workflow/pct-notice-excel'
import {
  adaptImportQueryForSystem,
  isPctDownloadRow,
  mergeCpcAccounts,
  partitionImportRows,
  runStep1ExportUnimportedUnion,
  runSystemParallelPipeline
} from '../../../src/workflow/pct-notice-runner'

function toBase64(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes
  let binary = ''
  for (let i = 0; i < arr.length; i += 1) binary += String.fromCharCode(arr[i])
  return btoa(binary)
}

describe('pct-notice-excel', () => {
  it('parses xlsx, HTML table .xls, and SpreadsheetML XML .xls', async () => {
    const xlsxBuf = xlsxBytes([
      ['来文名称', '发文序列号', '官方发文日', '申请号', '发明创造名称', '账户', '是否导入系统'],
      ['国际检索报告', 'XLH001', '2026-11-01', 'PCT/CN2026/001', '一种发明', '账号A', '未导入'],
      ['补正通知书', 'XLH002', '2026-11-02', 'PCT/CN2026/002', '另一种发明', '账号A', '已导入']
    ])
    const xlsxRows = await parseNoticeExportTable(xlsxBuf)
    expect(xlsxRows).toHaveLength(3)
    expect(xlsxRows[1][1]).toBe('XLH001')

    const html = `<html><body><table>
      <tr><th>来文名称</th><th>发文序列号</th><th>是否导入系统</th></tr>
      <tr><td>缴费通知书</td><td>XLH003</td><td>未导入</td></tr>
    </table></body></html>`
    const htmlRows = await parseNoticeExportTable(new TextEncoder().encode(html).buffer, 'application/vnd.ms-excel')
    expect(htmlRows).toEqual([
      ['来文名称', '发文序列号', '是否导入系统'],
      ['缴费通知书', 'XLH003', '未导入']
    ])

    const xml = `<?xml version="1.0"?><Workbook><Worksheet><Table>
      <Row><Cell><Data>来文名称</Data></Cell><Cell><Data>发文序列号</Data></Cell><Cell><Data>是否导入系统</Data></Cell></Row>
      <Row><Cell><Data>审查意见</Data></Cell><Cell ss:Index="3"><Data>未导入</Data></Cell></Row>
    </Table></Worksheet></Workbook>`
    const xmlRows = await parseNoticeExportTable(new TextEncoder().encode(xml).buffer)
    expect(xmlRows[1]).toEqual(['审查意见', '', '未导入'])
  })

  it('filters unimported rows and merges dual-system union without duplicates', () => {
    expect(isReplayRowUnimported('未导入')).toBe(true)
    expect(isReplayRowUnimported('')).toBe(true)
    expect(isReplayRowUnimported('已导入')).toBe(false)
    expect(isReplayRowUnimported('是')).toBe(false)

    const largeRecords = extractUnimportedReplayRecords(
      [
        ['来文名称', '发文序列号', '官方发文日', '申请号', '发明创造名称', '账户', '是否导入系统'],
        ['国际检索报告', 'XLH001', '2026-11-01', 'PCT/CN2026/001', '发明A', '账号1', '未导入'],
        ['补正通知书', 'XLH002', '2026-11-02', 'PCT/CN2026/002', '发明B', '账号1', '已导入']
      ],
      { system: 'large', accountLabel: '账号1' }
    )
    const smeRecords = extractUnimportedReplayRecords(
      [
        ['来文名称', '发文序列号', '官方发文日', '申请号', '发明创造名称', '账户', '是否导入系统'],
        ['国际检索报告', 'XLH001', '2026-11-01', 'PCT/CN2026/001', '发明A', '账号1', '未导入'],
        ['受理通知书', 'XLH003', '2026-11-03', 'PCT/CN2026/003', '发明C', '账号1', '未导入']
      ],
      { system: 'sme', accountLabel: '账号1' }
    )
    expect(largeRecords).toHaveLength(1)
    expect(smeRecords).toHaveLength(2)

    const merged = mergeUnimportedUnion([...largeRecords, ...smeRecords])
    expect(merged).toHaveLength(2)
    expect(merged[0].systems).toEqual(['large', 'sme'])
    expect(merged[1].systems).toEqual(['sme'])

    const sheet = buildUnimportedUnionSheet(merged)
    expect(sheet[0][0]).toBe('来源系统')
    expect(sheet[1][0]).toBe('大客户、中小客户')
    expect(sheet[2][0]).toBe('中小客户')
  })
})

describe('pct-notice-runner', () => {
  it('merges CPC accounts by label and adapts import dictionary GUIDs', () => {
    const accounts = mergeCpcAccounts(
      [{ value: 'L1', label: '总部账号' }, { value: 'L2', label: '大客户专属' }],
      [{ value: 'S1', label: '总部账号' }, { value: 'S2', label: '中小专属' }]
    )
    expect(accounts).toEqual([
      { key: '总部账号', label: '总部账号', largeId: 'L1', smeId: 'S1' },
      { key: '大客户专属', label: '大客户专属', largeId: 'L2' },
      { key: '中小专属', label: '中小专属', smeId: 'S2' }
    ])

    const largeInit: NoticeInitData = {
      applyTypes: [{ value: 'L_PCT', label: 'PCT国际阶段' }],
      agencies: [{ value: 'L_AG', label: '华进' }],
      directions: [{ value: 'L_DIR', label: '外向内' }],
      applyTags: [],
      branches: [],
      countries: [],
      fileTypes: [],
      users: [{ id: 'L_U1', name: '张三', parentId: '' }],
      cpcAccounts: [],
      defaultTzsStartDate: '2026-01-01',
      handCount: 0,
      nolaiutoCount: 0,
      warnings: []
    }
    const smeInit: NoticeInitData = {
      ...largeInit,
      applyTypes: [{ value: 'S_PCT', label: 'PCT国际阶段' }],
      agencies: [{ value: 'S_AG', label: '华进' }],
      directions: [{ value: 'S_DIR', label: '外向内' }],
      users: [{ id: 'S_U1', name: '张三', parentId: '' }]
    }
    const base = {
      ...createDefaultNoticeImportQuery(),
      status: '1' as const,
      apply_type: 'L_PCT',
      agency_id: 'L_AG',
      flow_direction: 'L_DIR',
      assayer: 'L_U1'
    }
    const adapted = adaptImportQueryForSystem(base, largeInit, smeInit)
    expect(adapted.status).toBe('0')
    expect(adapted.apply_type).toBe('S_PCT')
    expect(adapted.agency_id).toBe('S_AG')
    expect(adapted.flow_direction).toBe('S_DIR')
    expect(adapted.assayer).toBe('S_U1')
  })

  it('detects PCT/ rows and partitions import rows properly', () => {
    expect(isPctDownloadRow({ ShenQingH: 'PCT/CN2026/001' })).toBe(true)
    expect(isPctDownloadRow({ ShenQingH: 'pct/us2026/123' })).toBe(true)
    expect(isPctDownloadRow({ ShenQingH: '202610000123.4' })).toBe(false)

    const part = partitionImportRows([
      { oa_id: 'oa1', case_volume: '' },
      { oa_id: 'oa2', case_volume: 'P1001', is_finish: 1 },
      { oa_id: 'oa3', case_volume: 'P1002', is_finish: 0 }
    ])
    expect(part.nonSystemRows.map(r => r.oa_id)).toEqual(['oa1'])
    expect(part.closedCaseRows.map(r => r.oa_id)).toEqual(['oa2'])
    expect(part.normalRows.map(r => r.oa_id)).toEqual(['oa3'])
  })

  it('runs step 1 parallel export + union and parallel system pipeline (steps 4 -> 5 -> 6)', async () => {
    const largeXlsx = xlsxBytes([
      ['来文名称', '发文序列号', '官方发文日', '申请号', '发明创造名称', '账户', '是否导入系统'],
      ['国际检索报告', 'XLH_BOTH', '2026-11-01', 'PCT/CN2026/001', '发明1', '总部', '未导入'],
      ['补正通知书', 'XLH_DONE', '2026-11-02', 'PCT/CN2026/002', '发明2', '总部', '已导入']
    ])
    const smeHtml = `<table>
      <tr><th>来文名称</th><th>发文序列号</th><th>官方发文日</th><th>申请号</th><th>发明创造名称</th><th>账户</th><th>是否导入系统</th></tr>
      <tr><td>国际检索报告</td><td>XLH_BOTH</td><td>2026-11-01</td><td>PCT/CN2026/001</td><td>发明1</td><td>总部</td><td>未导入</td></tr>
      <tr><td>书面意见</td><td>XLH_SME</td><td>2026-11-03</td><td>PCT/CN2026/003</td><td>发明3</td><td>总部</td><td>未导入</td></tr>
    </table>`

    const createMockBridge = (mode: 'large' | 'sme', calls: string[]): MessageBridge => {
      let importSearchCount = 0
      return {
        async request(message: ContentRequest): Promise<ContentResponse> {
          if (message.type === MessageType.ExportNotice) {
            const acc = message.payload.tab === 'replay' ? message.payload.query.account : ''
            calls.push(`${mode}:export:${acc}`)
            const fileBase64 = mode === 'large'
              ? toBase64(largeXlsx)
              : toBase64(new TextEncoder().encode(smeHtml))
            return {
              type: MessageType.ExportNoticeResult,
              payload: {
                ok: true,
                data: {
                  status: 'download_completed',
                  async: false,
                  fileBase64,
                  fileName: `${mode}.xls`,
                  mimeType: mode === 'large' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/html',
                  message: 'ok'
                }
              }
            }
          }
          if (message.type === MessageType.SearchNotice) {
            const tab = message.payload.tab
            calls.push(`${mode}:search:${tab}`)
            if (tab === 'download') {
              return {
                type: MessageType.SearchNoticeResult,
                payload: {
                  ok: true,
                  data: {
                    tab: 'download',
                    rows: [
                      { fid: `${mode}_pct_1`, ShenQingH: 'PCT/CN2026/001' },
                      { fid: `${mode}_cn_1`, ShenQingH: '202610000999.1' }
                    ],
                    total: 2,
                    pageIndex: 1,
                    pageSize: 200
                  }
                }
              }
            }
            if (tab === 'replay') {
              return {
                type: MessageType.SearchNoticeResult,
                payload: {
                  ok: true,
                  data: {
                    tab: 'replay',
                    rows: [
                      { fid: `${mode}_rep_1`, fawenxlh: 'XLH1', status: '未导入' },
                      { fid: `${mode}_rep_2`, fawenxlh: 'XLH2', status: 'finish' }
                    ],
                    total: 2,
                    pageIndex: 1,
                    pageSize: 200
                  }
                }
              }
            }
            if (tab === 'import') {
              importSearchCount += 1
              const rows = importSearchCount === 1
                ? [
                    { oa_id: `${mode}_other`, case_volume: '' },
                    { oa_id: `${mode}_mine_1`, case_volume: 'P001', is_finish: 0 }
                  ]
                : [
                    { oa_id: `${mode}_other`, case_volume: '' },
                    { oa_id: `${mode}_mine_2`, case_volume: 'P002', is_finish: 0 }
                  ]
              return {
                type: MessageType.SearchNoticeResult,
                payload: {
                  ok: true,
                  data: { tab: 'import', rows, total: rows.length, pageIndex: 1, pageSize: 200 }
                }
              }
            }
          }
          if (message.type === MessageType.NoticeAction) {
            calls.push(`${mode}:action:${message.payload.action}`)
            return {
              type: MessageType.NoticeActionResult,
              payload: { ok: true, data: { ok: true, message: 'ok' } }
            }
          }
          throw new Error(`Unexpected message: ${message.type}`)
        }
      }
    }

    const largeCalls: string[] = []
    const smeCalls: string[] = []
    const largeBridge = createMockBridge('large', largeCalls)
    const smeBridge = createMockBridge('sme', smeCalls)
    const accounts = [{ key: '总部', label: '总部', largeId: 'L_ACC', smeId: 'S_ACC' }]

    const step1 = await runStep1ExportUnimportedUnion({
      largeBridge,
      smeBridge,
      accounts,
      replayQuery: {
        applyType: '2',
        applyNo: '',
        caseName: '',
        noticeName: '',
        xlh: '',
        startTime: '',
        endTime: ''
      }
    })
    expect(step1.large.unimportedRows).toBe(1)
    expect(step1.sme.unimportedRows).toBe(2)
    expect(step1.mergedRows).toHaveLength(2)

    const [largeProg, smeProg] = await Promise.all([
      runSystemParallelPipeline({
        mode: 'large',
        bridge: largeBridge,
        accounts,
        replayQuery: { applyType: '2', applyNo: '', caseName: '', noticeName: '', xlh: '', startTime: '', endTime: '' },
        downloadQuery: { ...createDefaultNoticeDownloadQuery(), status: 'unprocess' },
        importQuery: createDefaultNoticeImportQuery(),
        initData: null,
        onProgress: () => undefined
      }),
      runSystemParallelPipeline({
        mode: 'sme',
        bridge: smeBridge,
        accounts,
        replayQuery: { applyType: '2', applyNo: '', caseName: '', noticeName: '', xlh: '', startTime: '', endTime: '' },
        downloadQuery: { ...createDefaultNoticeDownloadQuery(), status: 'unprocess' },
        importQuery: createDefaultNoticeImportQuery(),
        initData: null,
        onProgress: () => undefined
      })
    ])

    expect(largeProg.deletedPctCount).toBe(1)
    expect(largeProg.analyzedReplayCount).toBe(2)
    expect(largeProg.importRound1Count).toBe(1)
    expect(largeProg.importRound2Count).toBe(1)
    expect(largeProg.nonSystemFilteredCount).toBe(2)

    expect(smeProg.deletedPctCount).toBe(1)
    expect(smeProg.analyzedReplayCount).toBe(2)
    expect(smeProg.importRound1Count).toBe(1)
    expect(smeProg.importRound2Count).toBe(1)
    expect(smeProg.nonSystemFilteredCount).toBe(2)

    expect(largeCalls).toEqual([
      'large:export:L_ACC',
      'large:search:download',
      'large:action:deleteDownloadOa',
      'large:search:replay',
      'large:action:downloadTzsList',
      'large:search:import',
      'large:action:importCheck',
      'large:action:importNotice',
      'large:search:import',
      'large:action:importCheck',
      'large:action:importNotice'
    ])
    expect(smeCalls).toEqual([
      'sme:export:S_ACC',
      'sme:search:download',
      'sme:action:deleteDownloadOa',
      'sme:search:replay',
      'sme:action:downloadTzsList',
      'sme:search:import',
      'sme:action:importCheck',
      'sme:action:importNotice',
      'sme:search:import',
      'sme:action:importCheck',
      'sme:action:importNotice'
    ])
  })
})
