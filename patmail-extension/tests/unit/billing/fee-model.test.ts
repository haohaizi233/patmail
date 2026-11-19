import { describe, expect, it } from 'vitest'
import type { FeeSearchRow } from '../../../src/api/fee-search-types'
import {
  countryOfCase,
  groupFeeCases,
  groupFeeEvents,
  isForeignAgentFee,
  isInternalAgentFee,
  latestBillDate,
  missingCurrencies,
  officialKind
} from '../../../src/billing/fee-model'

function row(partial: Partial<FeeSearchRow>): FeeSearchRow {
  return {
    feeId: 'fee-1',
    caseId: 'case-1',
    procId: 'proc-1',
    sn: 1,
    caseVolume: 'PA2411768CN-EP',
    caseVolumeCustomer: 'CL-001',
    caseStatus: '正常',
    applyType: '发明专利',
    businessType: '专利',
    noticeStatus: '',
    requestStatus: '',
    receiveStatus: '',
    payStatus: '',
    amount: 100,
    currency: 'EUR',
    rate: 7.5,
    targetAmount: 750,
    targetCurrency: 'CNY',
    reviewStage: '',
    feeType: '申请费',
    appNo: 'EP001',
    appDate: '2026-01-01',
    requestNo: '',
    paymentNo: '',
    ctrlProc: '新申请',
    feeClassName: '第三方费用',
    feeClass: 'T',
    createTime: '',
    payDueDate: '',
    caseName: '测试装置',
    customerName: '测试客户',
    applicant: '测试申请人',
    recieveAmount: '',
    billNo: '',
    invoiceNo: '',
    requestDate: '',
    payDate: '',
    receiveDueDate: '',
    receiveDate: '',
    finishDate: '2026-08-01',
    feeCustomer: '',
    flowUser: '',
    raw: {},
    ...partial
  }
}

describe('billing fee-model', () => {
  it('distinguishes internal agency fees, foreign agent fees, and official fees', () => {
    const internal = row({ feeClass: 'A', feeType: '国内代理费', currency: 'CNY' })
    const foreignAgent = row({ feeClass: 'T', feeType: '外所律师费', currency: 'USD' })
    const official = row({ feeClass: 'T', feeType: '新申请官费', currency: 'EUR' })
    const pctOfficial = row({ feeClass: 'O', feeType: 'PCT国际申请费', currency: 'CNY' })

    expect(isInternalAgentFee(internal)).toBe(true)
    expect(isForeignAgentFee(internal)).toBe(false)

    expect(isInternalAgentFee(foreignAgent)).toBe(false)
    expect(isForeignAgentFee(foreignAgent)).toBe(true)

    expect(isInternalAgentFee(official)).toBe(false)
    expect(isForeignAgentFee(official)).toBe(false)

    expect(isInternalAgentFee(pctOfficial)).toBe(false)
    expect(isForeignAgentFee(pctOfficial)).toBe(false)
  })

  it('prioritizes feeType over ctrlProc in officialKind and separates foreign vs pct modes', () => {
    // 处理事项含「进入欧洲国家阶段」，但费用名称明确为「新申请官费」时应归入 new 而非 validation
    expect(officialKind(row({ ctrlProc: '进入欧洲国家阶段', feeType: '新申请官费' }), 'foreign')).toBe('new')
    // feeType 无关键词时回退 ctrlProc
    expect(officialKind(row({ ctrlProc: '进入欧洲国家阶段', feeType: '官方费用' }), 'foreign')).toBe('validation')
    // 涉外模式下的检索费不静默归入 pctSearch
    expect(officialKind(row({ ctrlProc: '实审', feeType: '检索费' }), 'foreign')).toBe('other')
    // PCT 模式下准确识别国际申请费、检索费、附加费
    expect(officialKind(row({ feeType: 'PCT申请费' }), 'pct')).toBe('pctApply')
    expect(officialKind(row({ feeType: 'PCT检索费' }), 'pct')).toBe('pctSearch')
    expect(officialKind(row({ feeType: '超页附加费' }), 'pct')).toBe('pctExtra')
  })

  it('groups foreign events with separate internalAgent bucket and PCT cases with official + agent', () => {
    const events = groupFeeEvents([
      row({ feeId: '1', feeClass: 'T', feeType: '新申请官费', amount: 500, currency: 'EUR' }),
      row({ feeId: '2', feeClass: 'T', feeType: '外所服务费', amount: 300, currency: 'EUR' }),
      row({ feeId: '3', feeClass: 'A', feeType: '内所代理费', amount: 1500, currency: 'CNY' })
    ])
    expect(events).toHaveLength(2)
    expect(events[0].official).toHaveLength(1)
    expect(events[0].agent).toHaveLength(1)
    expect(events[1].internalAgent).toHaveLength(1)

    const cases = groupFeeCases([
      row({ feeId: 'p1', caseVolume: 'PA2601-WO', feeClass: 'O', feeType: 'PCT国际申请费', amount: 9220, currency: 'CNY' }),
      row({ feeId: 'p2', caseVolume: 'PA2601-WO', feeClass: 'A', feeType: 'PCT代理费', amount: 1000, currency: 'CNY' })
    ])
    expect(cases).toHaveLength(1)
    expect(cases[0].official).toHaveLength(1)
    expect(cases[0].agent).toHaveLength(1)
  })

  it('maps country suffix, picks latest bill date, and reports missing currencies', () => {
    expect(countryOfCase('PA2411768CN-EP')).toBe('欧洲专利局')
    expect(countryOfCase('PA2411768CN-US')).toBe('美国')
    expect(latestBillDate([
      { fileName: 'a.pdf', caseVolume: 'V1', billNo: '1', matter: '', date: '2026-08-01', versionSuffix: '' },
      { fileName: 'b.pdf', caseVolume: 'V1', billNo: '2', matter: '', date: '2026-09-12', versionSuffix: '' }
    ])).toBe('2026-09-12')
    expect(missingCurrencies([row({ currency: 'CHF' }), row({ currency: 'CNY' })], { USD: 7.1 })).toEqual(['CHF'])
  })
})
