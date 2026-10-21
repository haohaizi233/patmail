import { describe, expect, it } from 'vitest'
import {
  buildFilingSearchElement, buildFilingSearchParams, FILING_ELEMENT_NODES, splitFilingCtrlProcIds
} from '../src/api/filing-search-params'
import { normalizeFilingSearch } from '../src/api/filing-search-normalizer'
import { FILING_BLOCKS, FILING_OPTION_KEYS, FILING_SELECTS, filingCellKeys, filingDraftFields } from '../src/api/filing-form'
import { isMessage, MessageType } from '../src/shared/message'

function paramsOf(result: ReturnType<typeof buildFilingSearchParams>): URLSearchParams {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

function clientInfo(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ClientInfo: { IsLogin: true, Status: true, Result: true, Message: null, OtherInfo: {}, IsNewWindow: false, WebPath: 'http://183.36.43.66:88', ErrorCode: false, Asyn: false },
    TableRows: null,
    TableRowsCount: '0',
    ...extra
  }
}

describe('递交管理查询参数', () => {
  it('组 Element 时把 43 个标签全写出来，空条件是空标签', () => {
    const element = buildFilingSearchElement({ case_volume: 'PA2619787CND-YS' })
    expect(FILING_ELEMENT_NODES).toHaveLength(43)
    for (const node of FILING_ELEMENT_NODES) {
      expect(element).toContain(`&lt;${node}&gt;`)
    }
    expect(element).toContain('&lt;case_volume&gt;PA2619787CND-YS&lt;/case_volume&gt;')
    expect(element).toContain('&lt;customer&gt;&lt;/customer&gt;')
  })

  it('树形框的显示文本写进 _text、txtSearch 标签，值里的 & < > 转义', () => {
    const element = buildFilingSearchElement(
      { ctrl_proc: '6dd56b2b-1e1a-4e8b-9ac0-760cd305506a', case_name: 'A<B&C' },
      { ctrl_proc: '新申请' }
    )
    expect(element).toContain('&lt;ctrl_proc_text&gt;新申请&lt;/ctrl_proc_text&gt;')
    expect(element).toContain('&lt;ctrl_proc_idtxtSearch&gt;新申请&lt;/ctrl_proc_idtxtSearch&gt;')
    expect(element).toContain('&lt;audituseridtxtSearch&gt;&lt;/audituseridtxtSearch&gt;')
    expect(element).toContain('&lt;case_name&gt;A&lt;B&amp;C&lt;/case_name&gt;')
  })

  it('请求体是 Call=GetFinished，Element、colsel、_t、log_pagename 齐全', () => {
    const params = paramsOf(buildFilingSearchParams({
      fields: { case_volume: 'PA2619787CND-YS', case_type: '31D1A147-2931-43B5-94AE-B72B1525BA8A' },
      pageIndex: 1,
      pageSize: 10
    }, () => 1792565725605))
    expect(params.get('Call')).toBe('GetFinished')
    expect(params.get('pageIndex')).toBe('1')
    expect(params.get('pageSize')).toBe('10')
    expect(params.get('log_pagename')).toBe('Finished.aspx')
    expect(params.get('_t')).toBe('1792565725605')
    expect(params.get('colsel')).toContain(';undefined;case_volume;')
    expect(params.get('Element')).toContain('&lt;case_volume&gt;PA2619787CND-YS&lt;/case_volume&gt;')
    expect(params.get('Element')).toContain('&lt;case_type&gt;31D1A147-2931-43B5-94AE-B72B1525BA8A&lt;/case_type&gt;')
  })

  it('没有条件时把本环境的案件类型补进 case_type', () => {
    const params = paramsOf(buildFilingSearchParams({ fields: {}, pageIndex: 1, pageSize: 10 }))
    expect(params.get('Element')).toMatch(/&lt;case_type&gt;[0-9a-f-]{36}&lt;\/case_type&gt;/i)
  })

  it('拒绝不能提交的项目、越界页码和非内部 ID 的处理事项', () => {
    expect(buildFilingSearchParams({ fields: { Call: 'GetFinished' }, pageIndex: 1, pageSize: 10 }).ok).toBe(false)
    expect(buildFilingSearchParams({ fields: {}, pageIndex: 0, pageSize: 10 }).ok).toBe(false)
    expect(buildFilingSearchParams({ fields: {}, pageIndex: 1, pageSize: 200 }).ok).toBe(false)
    expect(buildFilingSearchParams({ fields: { ctrl_proc: '新申请' }, pageIndex: 1, pageSize: 10 }).ok).toBe(false)
    expect(buildFilingSearchParams({ fields: { activity: '新申请' }, pageIndex: 1, pageSize: 10 }).ok).toBe(false)
  })

  it('日期条件只收 yyyy-MM-dd，和原站 WdatePicker 的提交值一致', () => {
    const ok = paramsOf(buildFilingSearchParams({
      fields: { create_date_start: '2026-10-01', create_date_end: '2026-10-21' },
      pageIndex: 1,
      pageSize: 10
    }))
    expect(ok.get('Element')).toContain('&lt;create_date_start&gt;2026-10-01&lt;/create_date_start&gt;')
    expect(ok.get('Element')).toContain('&lt;create_date_end&gt;2026-10-21&lt;/create_date_end&gt;')
    expect(buildFilingSearchParams({ fields: { create_date_start: '2026/10/01' }, pageIndex: 1, pageSize: 10 }).ok).toBe(false)
    expect(buildFilingSearchParams({ fields: { create_date_start: '2026-10-1' }, pageIndex: 1, pageSize: 10 }).ok).toBe(false)
    expect(buildFilingSearchParams({ fields: { create_date_start: '2026-13-01' }, pageIndex: 1, pageSize: 10 }).ok).toBe(false)
    expect(buildFilingSearchParams({ fields: { create_date_start: '' }, pageIndex: 1, pageSize: 10 }).ok).toBe(true)
  })

  it('处理事项多选拆成内部 ID', () => {
    expect(splitFilingCtrlProcIds('6dd56b2b-1e1a-4e8b-9ac0-760cd305506a, 7cfa95b5-19b6-4fa2-bf8a-70af0992b1dd'))
      .toHaveLength(2)
    expect(splitFilingCtrlProcIds('新申请')).toEqual([])
  })
})

describe('递交管理表单', () => {
  it('条件格子对得上查询条件，日期格子的起止都有键', () => {
    const keys = FILING_BLOCKS.flatMap(filingCellKeys)
    for (const key of ['case_volume', 'ctrl_proc', 'activity', 'business_coop', 'audit_type', 'create_date_start', 'finish_date_end']) {
      expect(keys).toContain(key)
    }
    for (const cell of FILING_BLOCKS) {
      for (const key of filingCellKeys(cell)) expect(key.length).toBeGreaterThan(0)
    }
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('下拉取值照抄原站：签约单位走 table5，历史审核记录走流程节点，办理类型和纸质通知是固定码', () => {
    expect(FILING_SELECTS.is_paper_notice).toEqual([
      { value: '', label: 'ALL' }, { value: '1', label: '是' }, { value: '0', label: '否' }
    ])
    expect(FILING_SELECTS.audit_type.map(item => item.value)).toEqual(['', 'submit', 'handover', 'reject', 'withdraw'])
    expect(FILING_SELECTS.flow_direction.map(item => item.value)).toEqual(['', 'II', 'IO', 'OI', 'OO'])
    expect(FILING_OPTION_KEYS.business_coop).toBe('filingContract')
    expect(FILING_OPTION_KEYS.history).toBe('filingFlowNode')
    expect(FILING_OPTION_KEYS.apply_type).toBe('limitApplyType')
    expect(FILING_OPTION_KEYS.case_type).toBe('filingCaseType')
  })

  it('草稿只收有值的主条件，显示文本另存', () => {    const draft = filingDraftFields({
      case_volume: ' PA2619787CND-YS ',
      ctrl_proc: '6dd56b2b-1e1a-4e8b-9ac0-760cd305506a',
      ctrl_proc_text: '新申请',
      customer: '',
      audit_type: '退问'
    })
    expect(draft.fields).toEqual({
      case_volume: 'PA2619787CND-YS',
      ctrl_proc: '6dd56b2b-1e1a-4e8b-9ac0-760cd305506a',
      audit_type: '退问'
    })
    expect(draft.displayValues).toEqual({ ctrl_proc: '新申请' })
  })
})

describe('递交管理响应', () => {
  const query = { fields: {}, pageIndex: 1, pageSize: 10 }

  it('TableRows 为 null 时是 0 行，不是失败', () => {
    const result = normalizeFilingSearch(clientInfo(), query)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items).toEqual([])
    expect(result.data.total).toBe(0)
    expect(result.data.totalPages).toBe(0)
  })

  it('读出行字段并按 TableRowsCount 分页', () => {
    const result = normalizeFilingSearch(clientInfo({
      TableRows: [{
        filing_id: '6739422c-a570-48a4-900a-f3a4ea2da689',
        case_id: '5ac34e3d-cdba-4d33-a808-ab3ed811f633',
        proc_id: '315eeb5a-d410-49a8-803a-489267c1f97a',
        case_volume: 'PA2619787CND-YS',
        case_name: '工控机检测方法',
        customer_name: '歌尔股份有限公司',
        customer_code: '84b3adbf',
        apply_type: '发明',
        ctrl_proc: '新申请',
        int_due_date: '2026-10-10',
        filing_date: '2026-10-13',
        case_type: '专利',
        branch_dept: '深圳分部',
        create_user: '冯志文',
        create_time: '2026-10-21',
        flow_status: '',
        app_no: '202310481777.3',
        customer_volume: 'ZTE-2023-000269-CN'
      }],
      TableRowsCount: '67'
    }), query)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.total).toBe(67)
    expect(result.data.totalPages).toBe(7)
    expect(result.data.items[0]).toMatchObject({
      filingId: '6739422c-a570-48a4-900a-f3a4ea2da689',
      caseVolume: 'PA2619787CND-YS',
      customerVolume: 'ZTE-2023-000269-CN'
    })
    expect(result.data.items[0].flowStatus).toBe('')
  })

  it('登录失效、Status 为 false、缺列表各自报各自的错', () => {
    const expired = normalizeFilingSearch(clientInfo({
      ClientInfo: { IsLogin: false, Status: true, Result: true, Message: null }
    }), query)
    expect(expired.ok).toBe(false)
    if (expired.ok) return
    expect(expired.error.code).toBe('SESSION_EXPIRED')

    const refused = normalizeFilingSearch(clientInfo({
      ClientInfo: { IsLogin: true, Status: false, Result: false, Message: '系统繁忙' }
    }), query)
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.error.code).toBe('BUSINESS_ERROR')

    const missing = normalizeFilingSearch({ ClientInfo: { IsLogin: true, Status: true, Result: true } }, query)
    expect(missing.ok).toBe(false)
    if (missing.ok) return
    expect(missing.error.code).toBe('INVALID_RESPONSE')
  })
})

describe('递交查询消息', () => {
  it('消息体校验走同一套守卫', () => {
    const payload = { query: { fields: { case_volume: 'PA2619787CND-YS' }, pageIndex: 1, pageSize: 10 }, timeoutMs: 120_000 }
    expect(isMessage({ type: MessageType.SearchFiling, payload })).toBe(true)
    expect(isMessage({ type: MessageType.SearchFiling, payload: { query: { ...payload.query, pageIndex: 0 } } })).toBe(false)
    expect(isMessage({ type: MessageType.SearchFiling, payload: { query: { ...payload.query, fields: { Call: 'x' } } } })).toBe(false)
    expect(isMessage({ type: MessageType.SearchFilingResult, payload: { ok: true, data: { items: [], total: 0, pageIndex: 1, pageSize: 10, totalPages: 0 } } })).toBe(true)
  })
})
