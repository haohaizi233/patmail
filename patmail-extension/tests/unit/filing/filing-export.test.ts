import { describe, expect, it } from 'vitest'
import {
  acceptorAfter,
  acceptorUserIds,
  filingExportRows,
  filingFlowHistoryParams,
  filingFlowDirectionText,
  filingReturnTop,
  filingRowsCurrent,
  FILING_EXPORT_HEADERS,
  readFilingFlowHistory,
  readUserInfo,
  userInfoParams,
  type FilingExportRow,
  type FilingFlowRow
} from '../../../src/api/filing-export'
import { collectFilingExport, filingExportSheet } from '../../../src/workflow/filing-export'
import { normalizeFilingSearch } from '../../../src/api/filing-search-normalizer'
import type { FilingSearchRow } from '../../../src/api/filing-search-types'
import { xlsxBookBytes, readXlsxSheets } from '../../../src/customer/xlsx-table'

const client = { ClientInfo: { IsLogin: true, Status: true, Result: true, Message: null } }

function flowRow(overrides: Partial<FilingFlowRow> = {}): FilingFlowRow {
  return {
    nodeName: '同案人意见审核',
    auditUserId: 'user-1',
    auditUserName: '余佳希',
    auditType: '退回',
    auditTime: '2026-10-22 16:26:58',
    remark: '没有盖章',
    ...overrides
  }
}

function filing(overrides: Partial<FilingSearchRow> = {}): FilingSearchRow {
  return {
    filingId: '6739422c-a570-48a4-900a-f3a4ea2da689',
    caseId: 'case-1', procId: 'proc-1', caseVolume: 'PA261111285CND', caseName: '检测方法',
    customerName: '客户A', customerCode: '84b3adbf', applyType: '发明', ctrlProc: '新申请',
    intDueDate: '2026-10-10', filingDate: '2026-10-22', caseType: '专利', branchDept: '深圳分部',
    createUser: '冯志文', createTime: '2026-10-21', flowStatus: '', appNo: '202310481777.3',
    customerVolume: '', appDate: '2026-10-22', caseStatus: '审定', flowDirection: 'IO',
    ...overrides
  }
}

describe('递交导出取数', () => {
  it('流程历史按 obj_id 递交流程读，人员浮窗只带 user_id', () => {
    const flow = filingFlowHistoryParams('6739422c-a570-48a4-900a-f3a4ea2da689')
    expect(flow?.get('Call')).toBe('GetFlowHistory')
    expect(flow?.get('obj_id')).toBe('6739422c-a570-48a4-900a-f3a4ea2da689')
    expect(flow?.get('log_pagename')).toBe('Finished.aspx')
    expect(filingFlowHistoryParams('不合法 id')).toBeNull()
    const user = userInfoParams('227BFA59-A8A7-4EC6-928D-50FB5C29F960')
    expect(user?.get('Call')).toBe('ShowUserInfo')
    expect(user?.get('user_id')).toBe('227BFA59-A8A7-4EC6-928D-50FB5C29F960')
    expect(userInfoParams('')).toBeNull()
  })

  it('流程历史读出阶段、办理人、结果和意见', () => {
    const parsed = readFilingFlowHistory({
      ...client,
      Result: [
        { node_name_zh_cn: '启动流程', audit_user_id: 'user-9', audit_cn_name: '刘斌斌', audit_type_zh_cn: '提交', audit_time: '2026-10-22 17:35:17', remark: '报送' },
        { node_name_zh_cn: '同案人意见审核', audit_user_id: 'user-1', audit_cn_name: '余佳希', audit_type_zh_cn: '退回', audit_time: '2026-10-22 16:26:58', remark: '没有盖章' }
      ]
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data).toHaveLength(2)
    expect(parsed.data[1]).toEqual({
      nodeName: '同案人意见审核', auditUserId: 'user-1', auditUserName: '余佳希',
      auditType: '退回', auditTime: '2026-10-22 16:26:58', remark: '没有盖章'
    })
    expect(readFilingFlowHistory({ ClientInfo: { IsLogin: false }, Result: [] }).ok).toBe(false)
    expect(readFilingFlowHistory({ ...client, Result: '不是数组' }).ok).toBe(false)
  })

  it('人员浮窗读部门，外壳不确定也认', () => {
    const wrapped = readUserInfo({ ...client, User: { cn_name: '刘斌斌', dept_full_name: '电学三部', email: 'a@b.com', tel: '123' } }, 'user-9')
    expect(wrapped.ok).toBe(true)
    if (wrapped.ok) expect(wrapped.data.deptFullName).toBe('电学三部')
    const flat = readUserInfo({ cn_name: '余佳希', dept_full_name: '机械四部', email: '', tel: '' }, 'user-1')
    expect(flat.ok).toBe(true)
    if (flat.ok) expect(flat.data).toMatchObject({ userId: 'user-1', cnName: '余佳希', deptFullName: '机械四部' })
    expect(readUserInfo('不是对象', 'user-1').ok).toBe(false)
  })
})

describe('递交导出行', () => {
  const flow: FilingFlowRow[] = [
    flowRow({ nodeName: '启动流程', auditUserId: 'user-9', auditUserName: '刘斌斌', auditType: '提交', remark: '' }),
    flowRow({ nodeName: '同案人意见审核', auditUserId: 'user-1', auditUserName: '余佳希', auditType: '退回', remark: '没有盖章' }),
    flowRow({ nodeName: '实质审查', auditUserId: 'user-9', auditUserName: '刘斌斌', auditType: '提交', remark: '' }),
    flowRow({ nodeName: '同案人意见审核', auditUserId: 'user-2', auditUserName: '高艳丽', auditType: '退回', remark: '补照片' }),
    flowRow({ nodeName: '启动流程', auditUserId: 'user-9', auditUserName: '刘斌斌', auditType: '提交', remark: '' })
  ]

  it('一次退回一行，重复退回的行我方文号照常写', () => {
    const rows = filingExportRows(filing(), flow, id => (id === 'user-9' ? '电学三部' : ''))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      returned: true,
      caseVolume: 'PA261111285CND',
      applyDate: '2026-10-22',
      flowDirection: '内-外',
      ctrlProc: '新申请',
      returnedBy: '余佳希',
      acceptedBy: '刘斌斌',
      acceptedDept: '电学三部',
      returnReason: '没有盖章',
      caseStatus: '审定'
    })
    expect(rows[1]).toMatchObject({ returned: true, caseVolume: 'PA261111285CND', returnedBy: '高艳丽', returnReason: '补照片' })
    expect(rows[1].applyDate).toBe('2026-10-22')
    expect(rows[1].flowDirection).toBe('内-外')
    expect(rows[1].ctrlProc).toBe('新申请')
    expect(rows[1].caseStatus).toBe('审定')
  })

  it('案件流向按代码翻成案件页上的中文名，认不出就原样写', () => {
    expect(filingFlowDirectionText('II')).toBe('内-内')
    expect(filingFlowDirectionText('OO')).toBe('外-外')
    expect(filingFlowDirectionText('其他')).toBe('其他')
    const rows = filingExportRows(filing({ flowDirection: 'OO' }), [flowRow()], () => '')
    expect(rows[0].flowDirection).toBe('外-外')
  })

  it('申请日为空时用申请事项的完成日', () => {
    const rows = filingExportRows(filing({ appDate: '' }), [flowRow()], () => '')
    expect(rows[0].applyDate).toBe('2026-10-22')
  })

  it('代理师是退回后第一个启动流程的人，没有就取下一位办理人', () => {
    expect(acceptorAfter(flow, 1)?.auditUserName).toBe('刘斌斌')
    expect(acceptorAfter(flow, 3)?.auditUserName).toBe('刘斌斌')
    const shortFlow = [flowRow(), flowRow({ nodeName: '实质审查', auditUserId: 'user-8', auditUserName: '接手人', auditType: '提交' })]
    expect(acceptorAfter(shortFlow, 0)?.auditUserName).toBe('接手人')
    const rows = filingExportRows(filing(), shortFlow, () => '')
    expect(rows[0].acceptedBy).toBe('接手人')
    expect(filingExportRows(filing(), [flowRow()], () => '')[0].acceptedBy).toBe('')
  })

  it('一件没有退回也出一行，免得导出里少件', () => {
    const rows = filingExportRows(filing(), [flowRow({ auditType: '提交', remark: '' })], () => '')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ returned: false, caseVolume: 'PA261111285CND', returnedBy: '', returnReason: '', acceptedBy: '' })
  })

  it('接手人按人去重取部门', () => {
    expect(acceptorUserIds(flow).sort()).toEqual(['user-9'])
  })
})

describe('递交导出编排', () => {
  it('逐件出行、按人去重读部门，读不到的记问题不停整批', async () => {
    const filings = [filing(), filing({ filingId: '6739422c-a570-48a4-900a-f3a4ea2da680', caseVolume: 'PA2' })]
    const userCalls: string[] = []
    const seen: Array<{ index: number; count: number }> = []
    const result = await collectFilingExport(filings, {
      readFlow: async () => ({ ok: true, data: [flowRow(), flowRow({ nodeName: '启动流程', auditUserId: 'user-9', auditUserName: '刘斌斌', auditType: '提交', remark: '' })] }),
      readUser: async userId => {
        userCalls.push(userId)
        return { ok: true, data: { userId, cnName: '刘斌斌', deptFullName: '电学三部', email: '', tel: '' } }
      }
    }, {
      onFiling: (index, lines) => seen.push({ index, count: lines.length })
    })
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].acceptedDept).toBe('电学三部')
    expect(result.problems).toEqual([])
    // 两件的接手人都是 user-9，部门只查一次。
    expect(userCalls).toEqual(['user-9'])
    expect(seen.map(item => item.index).sort()).toEqual([0, 1])
  })

  it('缺编号的件记问题，行留空', async () => {
    const result = await collectFilingExport([filing({ filingId: '' })], {
      readFlow: async () => ({ ok: true, data: [] }),
      readUser: async () => ({ ok: true, data: { userId: 'u', cnName: '', deptFullName: '', email: '', tel: '' } })
    })
    expect(result.lines).toHaveLength(0)
    expect(result.problems[0]).toContain('PA261111285CND')
  })

  it('读流程历史偶发失败自己重试一轮，不写问题行', async () => {
    let calls = 0
    const result = await collectFilingExport([filing()], {
      readFlow: async () => {
        calls += 1
        if (calls === 1) return { ok: false, error: { code: 'NETWORK_ERROR', message: '网关异常，服务暂不可用' } }
        return { ok: true, data: [flowRow()] }
      },
      readUser: async () => ({ ok: true, data: { userId: 'u', cnName: '', deptFullName: '', email: '', tel: '' } })
    })
    expect(calls).toBe(2)
    expect(result.problems).toEqual([])
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].returnReason).toBe('没有盖章')
  })

  it('行档里已有的件不再打接口，取数从断点接着走', async () => {
    const carried = filingExportRows(filing(), [flowRow()], () => '')
    let flowCalls = 0
    const seen: number[] = []
    const result = await collectFilingExport(
      [filing(), filing({ filingId: '6739422c-a570-48a4-900a-f3a4ea2da680', caseVolume: 'PA2' })],
      {
        readFlow: async () => {
          flowCalls += 1
          return { ok: true, data: [flowRow()] }
        },
        readUser: async () => ({ ok: true, data: { userId: 'u', cnName: '', deptFullName: '', email: '', tel: '' } })
      },
      {
        known: index => (index === 0 ? carried : undefined),
        onFiling: index => { seen.push(index) }
      }
    )
    // 第一件从行档直接拿，接口只打第二件的一次。
    expect(flowCalls).toBe(1)
    expect(seen.sort()).toEqual([0, 1])
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].caseVolume).toBe('PA261111285CND')
  })
})

describe('递交导出表', () => {
  it('九列顺序固定，导出冻结首行', () => {
    expect([...FILING_EXPORT_HEADERS]).toEqual(['我方文号', '申请日', '案件流向', '处理事项', '流程专员（退回者）', '代理师（接受者）', '代理师所属部门', '退回的原因', '案件状态'])
    const sheet = filingExportSheet([filingExportRows(filing(), [flowRow()], () => '')[0]])
    expect(sheet.rows[0]).toEqual([...FILING_EXPORT_HEADERS])
    expect(sheet.freezeHeader).toBe(true)
    expect(sheet.rows[1][0]).toBe('PA261111285CND')
    const bytes = new TextDecoder().decode(new Uint8Array(xlsxBookBytes([sheet])))
    expect(bytes).toContain('ySplit="1"')
    expect(bytes).toContain('state="frozen"')
    expect(bytes).toContain('<cols>')
    expect(bytes).toContain('customWidth="1"')
  })

  it('列宽按内容算最合适列宽，全角字按两个算', () => {
    const sheet = filingExportSheet([filingExportRows(filing(), [flowRow()], () => '')[0]])
    const bytes = new TextDecoder().decode(new Uint8Array(xlsxBookBytes([sheet])))
    // 「我方文号」表头 4 个全角字是 8 单位，内容 PA261111285CND 是 14 半角，取长的再加 2 空。
    expect(bytes).toContain('<col min="1" max="1" width="16" customWidth="1"/>')
    // 「处理事项」表头和内容「新申请」都是 4 个全角字，8 单位 + 2 空。
    expect(bytes).toContain('<col min="4" max="4" width="10" customWidth="1"/>')
    // 「流程专员（退回者）」9 个全角字是 18 单位，比内容「余佳希」长。
    expect(bytes).toContain('<col min="5" max="5" width="20" customWidth="1"/>')
    // 内容比表头长就撑开该列，短列保持小宽度。
    const wide = new TextDecoder().decode(new Uint8Array(xlsxBookBytes([{
      name: 'x',
      rows: [['甲', '说明'], ['乙', '这是一个很长很长很长的中文内容，要把这一列撑开']]
    }])))
    expect(wide).toContain('<col min="1" max="1" width="6" customWidth="1"/>')
    expect(wide).toContain('<col min="2" max="2" width="48" customWidth="1"/>')
  })
})

describe('前10大退回统计', () => {
  function exportLine(caseVolume: string, returned = true): FilingExportRow {
    return {
      returned, caseVolume, applyDate: '2026-10-22', flowDirection: '内-外', ctrlProc: '新申请',
      returnedBy: returned ? '余佳希' : '', acceptedBy: returned ? '刘斌斌' : '', acceptedDept: '电学三部',
      returnReason: returned ? '没有盖章' : '', caseStatus: '审定'
    }
  }

  it('按我方文号数退回次数，没有退回的占位行不算', () => {
    const lines = [exportLine('PA1'), exportLine('PA1'), exportLine('PA1'), exportLine('PA2'), exportLine('PA3', false)]
    expect(filingReturnTop(lines)).toEqual([
      { caseVolume: 'PA1', count: 3 },
      { caseVolume: 'PA2', count: 1 }
    ])
  })

  it('退回多的在前，只取前 10；旧账本装回的行按退回者或原因回推', () => {
    const many = Array.from({ length: 12 }, (_, index) => exportLine(`PA${index + 1}`))
    many.push(exportLine('PA1'), exportLine('PA1'))
    const top = filingReturnTop(many)
    expect(top).toHaveLength(10)
    expect(top[0]).toEqual({ caseVolume: 'PA1', count: 3 })
    // 行档里装回的旧版行没有 returned 这一位，退回行照样算，空行不算。
    const oldReturn = [{ ...exportLine('PA9'), returned: undefined } as unknown as FilingExportRow]
    expect(filingReturnTop(oldReturn)).toEqual([{ caseVolume: 'PA9', count: 1 }])
    const oldBlank = [{ ...exportLine('PA9', false), returned: undefined } as unknown as FilingExportRow]
    expect(filingReturnTop(oldBlank)).toEqual([])
    expect(filingReturnTop([])).toEqual([])
  })

  it('旧版行档装回的行认出来，整批件重新取', () => {
    const fresh = [exportLine('PA1'), exportLine('PA1', false)]
    expect(filingRowsCurrent(fresh)).toBe(true)
    const stale = [exportLine('PA1'), { ...exportLine('PA1'), returned: undefined } as unknown as FilingExportRow]
    expect(filingRowsCurrent(stale)).toBe(false)
    expect(filingRowsCurrent([])).toBe(true)
  })
})

describe('导出表下的前10大退回图', () => {
  function exportLine(caseVolume: string, returned = true): FilingExportRow {
    return {
      returned, caseVolume, applyDate: '2026-10-22', flowDirection: '内-外', ctrlProc: '新申请',
      returnedBy: returned ? '余佳希' : '', acceptedBy: returned ? '刘斌斌' : '', acceptedDept: '电学三部',
      returnReason: returned ? '没有盖章' : '', caseStatus: '审定'
    }
  }

  it('表格下方顺延横向柱状图，图下面附它引用的两列数据', () => {
    const lines = [exportLine('PA1'), exportLine('PA1'), exportLine('PA2'), exportLine('PA3', false)]
    const sheet = filingExportSheet(lines)
    const chart = sheet.chart
    if (!chart) throw new Error('应该带前10大退回图。')
    expect(chart.title).toBe('前10大退回（按我方文号）')
    expect(chart.bars).toEqual([{ label: 'PA1', value: 2 }, { label: 'PA2', value: 1 }])
    // 表格占前 4 行，空两行再上图，图不压着数据行。
    expect(chart.anchor.firstRow).toBe(lines.length + 3)
    expect(chart.firstRow).toBe(chart.anchor.lastRow + 2)
    expect(sheet.rows[chart.firstRow - 1]).toEqual(['我方文号', '退回次数'])
    expect(sheet.rows[chart.firstRow]).toEqual(['PA1', 2])
    expect(sheet.rows[chart.lastRow]).toEqual(['PA2', 1])
    expect(chart.labelColumn).toBe(0)
    expect(chart.valueColumn).toBe(1)
  })

  it('xlsx 里写原生横向柱状图部件，一次都没有退回不带图', () => {
    const sheet = filingExportSheet([exportLine('PA1'), exportLine('PA1'), exportLine('PA2')])
    const chart = sheet.chart
    if (!chart) throw new Error('应该带前10大退回图。')
    const bytes = new TextDecoder().decode(new Uint8Array(xlsxBookBytes([sheet])))
    expect(bytes).toContain('<c:barChart>')
    expect(bytes).toContain('<c:barDir val="bar"/>')
    expect(bytes).toContain('前10大退回（按我方文号）')
    expect(bytes).toContain('xl/charts/chart1.xml')
    expect(bytes).toContain('xl/drawings/drawing1.xml')
    expect(bytes).toContain('<drawing r:id="rId1"/>')
    // 柱子引用图下面那两列，另外缓存一份值；次数写成数值格，不然 Excel 会把图读成全 0。
    const first = chart.firstRow + 1
    const last = chart.lastRow + 1
    expect(bytes).toContain(`$A$${first}:$A$${last}`)
    expect(bytes).toContain(`$B$${first}:$B$${last}`)
    expect(bytes).toContain('<c:v>PA1</c:v>')
    expect(bytes).toContain(`<c r="B${first}"><v>2</v></c>`)
    // 全批没有退回就不出图，也不挂 drawing。
    const plain = filingExportSheet([exportLine('PA1', false)])
    expect(plain.chart).toBeUndefined()
    const plainBytes = new TextDecoder().decode(new Uint8Array(xlsxBookBytes([plain])))
    expect(plainBytes).not.toContain('<c:barChart>')
    expect(plainBytes).not.toContain('<drawing r:id="rId1"/>')
  })

  it('带图的表还能读回行，导入不受图表部件影响', async () => {
    const sheet = filingExportSheet([exportLine('PA1'), exportLine('PA1')])
    const read = await readXlsxSheets(xlsxBookBytes([sheet]))
    expect(read[0]?.rows[0]).toEqual([...FILING_EXPORT_HEADERS])
    expect(read[0]?.rows[1]?.[0]).toBe('PA1')
  })
})

describe('递交导出列表字段', () => {
  it('查询结果行带上申请日和案件状态', () => {
    const result = normalizeFilingSearch({
      ...client,
      TableRows: [{ filing_id: 'f-1', case_volume: 'PA1', app_date: '2026-10-22', case_status: '审定', filing_date: '2026-10-23', flow_direction: 'IO' }],
      TableRowsCount: '1'
    }, { fields: {}, pageIndex: 1, pageSize: 10 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items[0]).toMatchObject({ appDate: '2026-10-22', caseStatus: '审定', filingDate: '2026-10-23', flowDirection: 'IO' })
  })
})
