import { describe, expect, it } from 'vitest'
import {
  buildFeeSearchParams,
  buildFeeSearchAmountParams,
  buildFeeColsel,
  FEE_SEARCH_DEFAULT_COLUMNS
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
})
