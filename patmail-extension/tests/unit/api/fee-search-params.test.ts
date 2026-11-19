import { describe, expect, it } from 'vitest'
import {
  buildFeeSearchParams,
  buildFeeSearchAmountParams
} from '../../../src/api/fee-search-params'
import { FEE_COMMON_CELLS } from '../../../src/api/fee-form'

describe('fee search params builder', () => {
  it('includes mandatory audit field log_pagename=FeeSearch.aspx for EASY Report.ashx', () => {
    const res = buildFeeSearchParams({
      pageIndex: 1,
      pageSize: 20,
      case_volume: 'PA2411768CN-EP'
    })
    expect(res.ok).toBe(true)
    expect(res.data.get('Call')).toBe('FeeSearch')
    expect(res.data.get('log_pagename')).toBe('FeeSearch.aspx')
    expect(res.data.get('case_volume')).toBe('PA2411768CN-EP')
    expect(res.data.get('first_applicant')).toBe('0')
    expect(res.data.get('colsel')).toContain(';case_volume;')
  })

  it('preserves log_pagename when building amount params', () => {
    const res = buildFeeSearchAmountParams({
      pageIndex: 1,
      pageSize: 20,
      finish_date_from: '2026-08-01',
      finish_date_to: '2026-11-19'
    })
    expect(res.ok).toBe(true)
    expect(res.data.get('Call')).toBe('FeeSearchTotalAmount')
    expect(res.data.get('log_pagename')).toBe('FeeSearch.aspx')
    expect(res.data.get('finish_date_from')).toBe('2026-08-01')
    expect(res.data.get('finish_date_to')).toBe('2026-11-19')
  })

  it('aligns date fields in FEE_COMMON_CELLS: 开卷日期 -> createtime, 费用创建日期 -> create_date', () => {
    const openCell = FEE_COMMON_CELLS.find(c => c.kind === 'dates' && c.label === '开卷日期')
    expect(openCell).toBeDefined()
    if (openCell && openCell.kind === 'dates') {
      expect(openCell.start).toBe('createtime_from')
      expect(openCell.end).toBe('createtime_to')
      expect(openCell.empty).toBe('createtime_isnull')
    }

    const feeCreateCell = FEE_COMMON_CELLS.find(c => c.kind === 'dates' && c.label === '费用创建日期')
    expect(feeCreateCell).toBeDefined()
    if (feeCreateCell && feeCreateCell.kind === 'dates') {
      expect(feeCreateCell.start).toBe('create_date_from')
      expect(feeCreateCell.end).toBe('create_date_to')
      expect(feeCreateCell.empty).toBe('create_date_isnull')
    }
  })

  it('strips literal null/undefined sentinels and sends EASY default boolean flags & empty fields', () => {
    const res = buildFeeSearchParams({
      pageIndex: 1,
      pageSize: 10,
      case_volume: 'PA2411768CN-EP',
      case_type: '31D1A147-2931-43B5-94AE-B72B1525BA8A',
      Case_direction: 'IO',
      fee_class: 'T',
      finish_date_from: '2026-08-01',
      finish_date_to: '2026-11-19',
      receive_account_id: 'null',
      customer_id: '[]',
      fields: {
        receive_account_id: 'null',
        business_coop: 'undefined',
        case_agency: 'NULL',
        customer_id: '[]',
        ruleOutcustomer_id: '{}',
        Call: 'Hijack',
        log_pagename: 'Wrong.aspx'
      }
    })
    expect(res.ok).toBe(true)
    const p = res.data
    // Must never send literal "null", "undefined", "[]", or "{}" for select/named/date/customer fields
    expect(p.get('receive_account_id')).toBe('')
    expect(p.get('business_coop')).toBe('')
    expect(p.get('case_agency')).toBe('')
    expect(p.get('customer_id')).toBe('')
    expect(p.get('ruleOutcustomer_id')).toBe('')
    // System params must not be overwritten by fields bag
    expect(p.get('Call')).toBe('FeeSearch')
    expect(p.get('log_pagename')).toBe('FeeSearch.aspx')
    expect(p.get('fee_page_type')).toBe('')
    expect(p.get('_t')).toMatch(/^\d+$/)
    // All 10 EASY boolean flags default explicitly to "false"
    for (const flag of [
      'is_fuzzy_query_case_volume',
      'is_accurate_query_sort',
      'is_fuzzy_query_app_no',
      'is_point_app_no',
      'is_fuzzy_query_pct_app_no',
      'is_fuzzy_query_issue_no',
      'pay_due_date_is_agent_fee',
      'pay_status_is_agent_fee',
      'pay_date_is_agent_fee',
      'office_no_is_agent_fee'
    ]) {
      expect(p.get(flag)).toBe('false')
    }
    expect(p.get('first_applicant')).toBe('0')

    // Amount request inherits sanitization and default flags
    const amountRes = buildFeeSearchAmountParams({
      pageIndex: 1,
      pageSize: 10,
      case_volume: 'PA2411768CN-EP',
      receive_account_id: 'null',
      fields: { receive_account_id: 'null' }
    })
    expect(amountRes.data.get('Call')).toBe('FeeSearchTotalAmount')
    expect(amountRes.data.get('receive_account_id')).toBe('')
    expect(amountRes.data.get('is_fuzzy_query_case_volume')).toBe('false')
  })
})
