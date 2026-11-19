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

  it('strips EASY select null/undefined sentinel strings when reading or building FeeSearch XML', () => {
    const rawEasyXml = `<xmlRoot>
      <case_type>31D1A147-2931-43B5-94AE-B72B1525BA8A</case_type>
      <Case_direction>IO</Case_direction>
      <fee_class>T</fee_class>
      <receive_account_id>null</receive_account_id>
      <business_coop>undefined</business_coop>
      <case_agency>NULL</case_agency>
      <finish_date_from>null</finish_date_from>
      <customer_id>null</customer_id>
      <customer_id_text>null</customer_id_text>
      <ruleOutcustomer_id>undefined</ruleOutcustomer_id>
      <legacy_unused_select>null</legacy_unused_select>
      <fee_remark>null</fee_remark>
    </xmlRoot>`

    const parsed = readFeeQueryXml(rawEasyXml)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data.fields.case_type).toBe('31D1A147-2931-43B5-94AE-B72B1525BA8A')
    expect(parsed.data.fields.Case_direction).toBe('IO')
    expect(parsed.data.fields.fee_class).toBe('T')
    // Non-text select/named/date/customer sentinels must be stripped
    expect(parsed.data.fields.receive_account_id).toBeUndefined()
    expect(parsed.data.fields.business_coop).toBeUndefined()
    expect(parsed.data.fields.case_agency).toBeUndefined()
    expect(parsed.data.fields.finish_date_from).toBeUndefined()
    expect(parsed.data.fields.customer_id).toBeUndefined()
    expect(parsed.data.customers).toEqual([])
    expect(parsed.data.ruleOutCustomers).toEqual([])
    expect(parsed.data.unknownFields.legacy_unused_select).toBeUndefined()
    // Free-text field keeps literal text if user actually entered it
    expect(parsed.data.fields.fee_remark).toBe('null')

    // buildFeeQueryXml also drops null/undefined sentinels on non-text fields
    const rebuilt = buildFeeQueryXml({
      fields: {
        case_type: '31D1A147-2931-43B5-94AE-B72B1525BA8A',
        receive_account_id: 'null',
        business_coop: 'undefined',
        customer_id: '[]'
      }
    })
    expect(rebuilt).not.toContain('receive_account_id')
    expect(rebuilt).not.toContain('business_coop')
    expect(rebuilt).not.toContain('customer_id')
  })

  it('treats empty JSON arrays [] in customer_id / ruleOutcustomer_id XML as empty selection instead of dirty "[]" entry', () => {
    const emptyCustomerXml = `<xmlRoot>
      <case_type>31D1A147-2931-43B5-94AE-B72B1525BA8A</case_type>
      <customer_id>[]</customer_id>
      <customer_id_text>[]</customer_id_text>
      <ruleOutcustomer_id>[]</ruleOutcustomer_id>
      <ruleOutcustomer_id_text>[]</ruleOutcustomer_id_text>
    </xmlRoot>`

    const parsed = readFeeQueryXml(emptyCustomerXml)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data.customers).toEqual([])
    expect(parsed.data.ruleOutCustomers).toEqual([])
    expect(parsed.data.fields.customer_id).toBeUndefined()
    expect(parsed.data.displayValues.customer_id).toBeUndefined()
    expect(parsed.data.fields.ruleOutcustomer_id).toBeUndefined()

    const nullArrayXml = `<xmlRoot><customer_id>[null, "", "undefined"]</customer_id><customer_id_text>[]</customer_id_text></xmlRoot>`
    const parsedNullArr = readFeeQueryXml(nullArrayXml)
    expect(parsedNullArr.ok).toBe(true)
    if (parsedNullArr.ok) {
      expect(parsedNullArr.data.customers).toEqual([])
      expect(parsedNullArr.data.fields.customer_id).toBeUndefined()
    }

    const partialTextXml = `<xmlRoot><customer_id>["cust-1"]</customer_id><customer_id_text>[]</customer_id_text></xmlRoot>`
    const parsedPartial = readFeeQueryXml(partialTextXml)
    expect(parsedPartial.ok).toBe(true)
    if (parsedPartial.ok) {
      expect(parsedPartial.data.customers).toEqual([{ id: 'cust-1', name: 'cust-1' }])
    }
  })
})
