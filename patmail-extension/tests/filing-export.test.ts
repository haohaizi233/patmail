import { describe, expect, it } from 'vitest'
import {
  acceptorAfter,
  acceptorUserIds,
  filingExportRows,
  filingFlowHistoryParams,
  filingFlowDirectionText,
  FILING_EXPORT_HEADERS,
  readFilingFlowHistory,
  readUserInfo,
  userInfoParams,
  type FilingFlowRow
} from '../src/api/filing-export'
import { collectFilingExport, filingExportSheet } from '../src/workflow/filing-export'
import { normalizeFilingSearch } from '../src/api/filing-search-normalizer'
import type { FilingSearchRow } from '../src/api/filing-search-types'
import { xlsxBookBytes } from '../src/customer/xlsx-table'

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

  it('一次退回一行，我方文号只写第一行', () => {
    const rows = filingExportRows(filing(), flow, id => (id === 'user-9' ? '电学三部' : ''))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      caseVolume: 'PA261111285CND',
      applyDate: '2026-10-22',
      flowDirection: '内-外',
      returnedBy: '余佳希',
      acceptedBy: '刘斌斌',
      acceptedDept: '电学三部',
      returnReason: '没有盖章',
      caseStatus: '审定'
    })
    expect(rows[1]).toMatchObject({ caseVolume: '', returnedBy: '高艳丽', returnReason: '补照片' })
    expect(rows[1].applyDate).toBe('2026-10-22')
    expect(rows[1].flowDirection).toBe('内-外')
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
    expect(rows[0]).toMatchObject({ caseVolume: 'PA261111285CND', returnedBy: '', returnReason: '', acceptedBy: '' })
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
})

describe('递交导出表', () => {
  it('七列顺序固定，导出冻结首行', () => {
    expect([...FILING_EXPORT_HEADERS]).toEqual(['我方文号', '申请日', '案件流向', '流程专员（退回者）', '代理师（接受者）', '代理师所属部门', '退回的原因', '案件状态'])
    const sheet = filingExportSheet([filingExportRows(filing(), [flowRow()], () => '')[0]])
    expect(sheet.rows[0]).toEqual([...FILING_EXPORT_HEADERS])
    expect(sheet.freezeHeader).toBe(true)
    expect(sheet.rows[1][0]).toBe('PA261111285CND')
    const bytes = new TextDecoder().decode(new Uint8Array(xlsxBookBytes([sheet])))
    expect(bytes).toContain('ySplit="1"')
    expect(bytes).toContain('state="frozen"')
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
