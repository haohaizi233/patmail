import { describe, expect, it } from 'vitest'
import { buildFeeQueryXml, readFeeQueryXml } from '../../../src/api/fee-form'
import { historyDeleteRequest, historyRequest, historySaveRequest, isHistorySurface } from '../../../src/api/query-history'
import { readTemplateJson, templateJsonFileName, templateJsonText } from '../../../src/query/template-json'
import { isMessage } from '../../../src/shared/message'

describe('fee query history template support', () => {
  it('builds EASY history requests for fee surface with query_type=FeeSearch', () => {
    expect(isHistorySurface('fee')).toBe(true)
    expect(historyRequest('fee', '').get('query_type')).toBe('FeeSearch')
    expect(historyRequest('fee', '').get('log_pagename')).toBe('FeeSearch.aspx')
    expect(historySaveRequest('fee', '年费核对', '', '<xmlRoot></xmlRoot>').get('query_type')).toBe('FeeSearch')
    expect(historyDeleteRequest('fee', '11111111-2222-3333-4444-555555555555').get('log_pagename')).toBe('FeeSearch.aspx')
  })

  it('round-trips FeeSearch query_xml including EASY customer JSON, applicant/charge_dept DOM mapping, and checkboxes', () => {
    const xml = buildFeeQueryXml({
      fields: {
        case_volume: 'PA2601250PCT',
        applicant_id: 'app-1,app-2',
        charge_dept_id: 'dept-9',
        pay_status: '0',
        filing_date_start: '2026-01-01'
      },
      checks: {
        is_fuzzy_query_case_volume: true,
        first_applicant: true,
        pay_due_date_isnull: true
      },
      displayValues: {
        applicant_id: '申请人甲,申请人乙',
        charge_dept_id: '发明部'
      },
      customers: [{ id: 'cust-1', name: '布雷博股份公司' }],
      ruleOutCustomers: [{ id: 'cust-9', name: '排除客户' }]
    })

    expect(xml).toContain('<applicant>app-1,app-2</applicant>')
    expect(xml).toContain('<charge_dept>dept-9</charge_dept>')
    expect(xml).toContain('<customer_id>["cust-1"]</customer_id>')
    expect(xml).toContain('<customer_id_text>[{"value":"cust-1","text":"布雷博股份公司"}]</customer_id_text>')
    expect(xml).toContain('<is_fuzzy_query_case_volume>on</is_fuzzy_query_case_volume>')

    // Verify double-wrapped <xmlRoot> (as EASY sometimes saves) parses identically
    const parsed = readFeeQueryXml(`<xmlRoot>${xml}</xmlRoot>`)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data.fields.case_volume).toBe('PA2601250PCT')
    expect(parsed.data.fields.applicant_id).toBe('app-1,app-2')
    expect(parsed.data.fields.charge_dept_id).toBe('dept-9')
    expect(parsed.data.fields.customer_id).toBe('cust-1')
    expect(parsed.data.fields.filing_date_start).toBe('2026-01-01')
    expect(parsed.data.customers).toEqual([{ id: 'cust-1', name: '布雷博股份公司' }])
    expect(parsed.data.ruleOutCustomers).toEqual([{ id: 'cust-9', name: '排除客户' }])
    expect(parsed.data.checks).toEqual({
      is_fuzzy_query_case_volume: true,
      first_applicant: true,
      pay_due_date_isnull: true
    })
  })

  it('supports FeeSearch template JSON export/import and message validation', () => {
    const json = templateJsonText('FeeSearch', {
      fields: { case_volume: 'PA2601250PCT', pay_status: '0', is_fuzzy_query_case_volume: 'on' },
      displayValues: { pay_status: '未缴费' }
    })
    expect(templateJsonFileName('FeeSearch', '对账模板', new Date(2026, 10, 18, 15, 0, 5))).toBe('查询模板-费用查询-对账模板-20261118-150005.json')
    const read = readTemplateJson(json, 'FeeSearch')
    expect(read.ok).toBe(true)
    if (read.ok) {
      expect(read.conditions.fields).toEqual({ case_volume: 'PA2601250PCT', pay_status: '0', is_fuzzy_query_case_volume: 'on' })
    }
    const cross = readTemplateJson(json, 'LimitMonitor')
    expect(cross.ok).toBe(false)

    expect(isMessage({ type: 'LIST_HISTORY_QUERIES', payload: { force: true, surface: 'fee' } })).toBe(true)
    expect(isMessage({ type: 'GET_HISTORY_QUERY', payload: { queryId: '11111111-2222-3333-4444-555555555555', surface: 'fee' } })).toBe(true)
    expect(isMessage({ type: 'SAVE_HISTORY_QUERY', payload: { title: '测试', queryId: '', queryXml: '<xmlRoot></xmlRoot>', surface: 'fee' } })).toBe(true)
    expect(isMessage({ type: 'DELETE_HISTORY_QUERY', payload: { queryId: '11111111-2222-3333-4444-555555555555', surface: 'fee' } })).toBe(true)
  })
})
