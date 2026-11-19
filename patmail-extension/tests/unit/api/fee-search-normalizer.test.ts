import { describe, expect, it } from 'vitest'
import { normalizeFeeSearch } from '../../../src/api/fee-search-normalizer'

const clientInfo = { IsLogin: true, Status: true, Result: true, Message: null, Url: null }
const query = { pageIndex: 1, pageSize: 20 }

describe('FeeSearch 响应标准化 (normalizeFeeSearch)', () => {
  it('correctly parses EASY standard format with rows and total', () => {
    const response = {
      total: 1,
      rows: [
        {
          case_volume: 'PA2411768CN-EP',
          fee_class: 'T',
          fee_class_name: '第三方费用',
          amount: 825,
          currency_id: 'EUR',
          target_amount: 6859.215,
          target_currency_id: 'CNY',
          ctrl_proc: '维持费',
          fee_type: '合作所代理费',
          finish_date: '2026-11-16',
          create_time: '2024-09-13',
          fee_id: '22909E1E-10DB-48E1-BB96-3206CE75D093'
        }
      ],
      ClientInfo: clientInfo
    }

    const result = normalizeFeeSearch(response, query)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.total).toBe(1)
      expect(result.data.rows.length).toBe(1)
      const row = result.data.rows[0]
      expect(row.caseVolume).toBe('PA2411768CN-EP')
      expect(row.feeClass).toBe('T')
      expect(row.amount).toBe(825)
      expect(row.currency).toBe('EUR')
      expect(row.targetAmount).toBe(6859.215)
      expect(result.data.summary.pageThirdPartyFee).toBe(825)
      expect(result.data.summary.pageOfficialFee).toBe(0)
      expect(result.data.summary.pageAgentFee).toBe(0)
    }
  })

  it('supports legacy TableRows and TableRowsCount fallback', () => {
    const response = {
      TableRowsCount: '2',
      TableRows: [
        { case_volume: 'PA001', fee_class: 'O', amount: 100, fee_id: 'id-1' },
        { case_volume: 'PA002', fee_class: 'A', amount: 200, fee_id: 'id-2' }
      ],
      ClientInfo: clientInfo
    }

    const result = normalizeFeeSearch(response, query)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.total).toBe(2)
      expect(result.data.rows.length).toBe(2)
      expect(result.data.summary.pageOfficialFee).toBe(100)
      expect(result.data.summary.pageAgentFee).toBe(200)
    }
  })

  it('rejects session expired response from ClientInfo', () => {
    const response = {
      total: 0,
      rows: [],
      ClientInfo: { IsLogin: false, Status: false }
    }
    const result = normalizeFeeSearch(response, query)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('SESSION_EXPIRED')
    }
  })
})
