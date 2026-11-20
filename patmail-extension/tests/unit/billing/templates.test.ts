import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { FeeSearchRow } from '../../../src/api/fee-search-types'
import { BILLING_TEMPLATES, defaultHeaders, fillBillingTemplate } from '../../../src/billing/templates'
import { XlsxBook } from '../../../src/billing/xlsx-engine'

const ASSETS_DIR = path.resolve(__dirname, '../../../src/assets/billing')

function readAsset(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(ASSETS_DIR, file)))
}

function mockFeeRow(partial: Partial<FeeSearchRow>): FeeSearchRow {
  return {
    feeId: 'fee-1',
    caseId: 'case-1',
    procId: 'proc-1',
    sn: 1,
    caseVolume: 'PA2411768CN-EP',
    caseVolumeCustomer: 'CL-001',
    caseStatus: '正常',
    applyType: '发明',
    businessType: '专利',
    noticeStatus: '',
    requestStatus: '',
    receiveStatus: '',
    payStatus: '',
    amount: 1500,
    currency: 'EUR',
    rate: 7.85,
    targetAmount: 11775,
    targetCurrency: 'CNY',
    reviewStage: '',
    feeType: '申请费',
    appNo: 'EP2026001',
    appDate: '2026-05-10',
    requestNo: '',
    paymentNo: '',
    ctrlProc: '进入欧洲国家阶段',
    feeClassName: '第三方费用',
    feeClass: 'T',
    createTime: '2026-08-01',
    payDueDate: '2026-09-01',
    caseName: '无线通信装置',
    customerName: '测试科技股份有限公司',
    applicant: '测试科技股份有限公司',
    recieveAmount: '',
    billNo: '',
    invoiceNo: '',
    requestDate: '',
    payDate: '',
    receiveDueDate: '',
    receiveDate: '',
    finishDate: '2026-08-20',
    feeCustomer: '欧洲专利代理事务所',
    flowUser: '',
    raw: {},
    ...partial
  }
}

describe('billing templates filler', () => {
  it('uses the recorded overseas bill date and reconciled translation calculation for Midea', async () => {
    const rows = [
      mockFeeRow({ feeId: 'outside', customerName: '美的小家电事业部', feeType: '合作所代理费', amount: 1400,
        currency: 'USD', raw: { fee_desc: '主动修改费用', out_bill_date: '2026-07-22', agency_name_cn: 'K&L' } }),
      mockFeeRow({ feeId: 'translate', feeType: '合作所代理费', currency: 'CNY', amount: 1797.12,
        raw: { fee_desc: '7488 字*240 元/千字= 1797.12 元' } }),
      mockFeeRow({ feeId: 'official', feeClass: 'O', feeType: '海外申请官费', currency: 'CNY', amount: 10381.21 })
    ]
    const result = await fillBillingTemplate('midea-foreign', readAsset('qingkuan-midea-foreign.xlsx'), {
      rows, bills: {}, rates: { USD: 7 }, rateDate: '2026-11-20', headers: defaultHeaders('midea-foreign'),
      options: { reviewFee: 100, bankFee: 250 }
    })
    const book = await XlsxBook.open(result.bytes)
    expect(result.blockCount).toBe(1)
    for (const { name } of book.sheets.slice(1, 3)) {
      const sheet = book.sheet(name)
      expect(['L7', 'P7', 'S8', 'W9', 'X9', 'Y9', 'AH7'].map(cell => sheet.valueOf(cell)))
        .toEqual([46225, null, 1400, 7488, 0.24, 1797.12, 'K&L'])
    }
    expect(result.warnings.join(' ')).toContain('10381.21 CNY')
    expect(book.sheet(book.sheets[1].name).hasFormula('AP7')).toBe(false)
    const rates = book.sheet('汇率截图')
    expect(rates.valueOf('A1')).toBe('本次导出汇率')
    expect(rates.valueOf('B5')).toBe(7)
    expect(book.doc(book.sheets[3].path).getElementsByTagName('drawing').length).toBe(0)
  })
  it('fills the historical Goer validation row with independently verified fee components', async () => {
    const rows = [
      mockFeeRow({ feeId: 'gov', feeClass: 'O', feeType: '生效官费', amount: 52 }),
      mockFeeRow({ feeId: 'agent', feeType: '合作所代理费', amount: 1527 }),
      mockFeeRow({ feeId: 'translation', feeClass: 'A', feeType: '翻译费', currency: 'CNY', amount: 6630, raw: { word_count: '4,420' } }),
      mockFeeRow({ feeId: 'internal', feeClass: 'A', feeType: '合同金额', currency: 'CNY', amount: 6500 })
    ]
    const result = await fillBillingTemplate('general-foreign', readAsset('qingkuan-general-foreign.xlsx'), {
      rows, bills: {}, rates: { EUR: 7.85 }, rateDate: '2026-11-05',
      headers: defaultHeaders('general-foreign', new Date(2026, 9, 1)),
      options: { reviewFee: 0, bankFee: 0 }
    })
    const book = await XlsxBook.open(result.bytes)
    expect(book.sheets[0].name).toBe('格尔2026年10月涉外')
    const sheet = book.sheet(book.sheets[0].name)
    expect(result.blockCount).toBe(1)
    expect(['K5', 'P5', 'T5', 'U5', 'V5'].map(cell => sheet.valueOf(cell))).toEqual([52, 1527, 6630, 4420, 6500])
    expect(sheet.formulaOf('W5')).toBe('SUM(S5:T5,V5)')
  })

  it('preserves different live amounts and keeps unverified original-currency official fees out of totals', async () => {
    const result = await fillBillingTemplate('general-foreign', readAsset('qingkuan-general-foreign.xlsx'), {
      rows: [
        mockFeeRow({ feeId: 'o', feeClass: 'O', feeType: '海外申请官费', currency: 'CNY', amount: 1000, ctrlProc: '指定国生效' }),
        mockFeeRow({ feeId: 't', feeType: '合作所代理费', amount: 682, ctrlProc: '指定国生效' }),
        mockFeeRow({ feeId: 'a', feeClass: 'A', feeType: '合同金额', currency: 'CNY', amount: 1000, ctrlProc: '指定国生效' })
      ],
      bills: {}, rates: { EUR: 7.3446 }, rateDate: '2026-11-20',
      headers: defaultHeaders('general-foreign'), options: { reviewFee: 0, bankFee: 0 }
    })
    const book = await XlsxBook.open(result.bytes)
    const sheet = book.sheet(book.sheets[0].name)
    expect(result.blockCount).toBe(1)
    expect(['I5', 'K5', 'P5', 'T5', 'U5', 'V5'].map(cell => sheet.valueOf(cell))).toEqual(['/', '/', 682, null, '/', 1000])
    expect(sheet.valueOf('X5')).toBe('指定国生效')
    expect(result.warnings.join(' ')).toContain('1000 CNY（EASY 以人民币登记，待核对当地币种')
  })
  it('fills general-foreign template, expands blocks and preserves Excel formulas', async () => {
    const rawTemplate = readAsset('qingkuan-general-foreign.xlsx')
    const rows: FeeSearchRow[] = [
      mockFeeRow({ feeId: 'f1', caseVolume: 'PA2411768CN-EP', ctrlProc: '进入EP', feeType: '新申请官费', amount: 1200, currency: 'EUR' }),
      mockFeeRow({ feeId: 'f2', caseVolume: 'PA2411768CN-EP', ctrlProc: '进入EP', feeType: '外所代理费', amount: 800, currency: 'EUR', feeCustomer: 'EP Agent' }),
      mockFeeRow({ feeId: 'f3', caseVolume: 'PA2411769CN-US', caseVolumeCustomer: 'CL-002', ctrlProc: '答复审查意见', feeType: 'RCE官费', amount: 600, currency: 'USD' }),
      mockFeeRow({ feeId: 'f4', caseVolume: 'PA2411770CN-JP', caseVolumeCustomer: 'CL-003', ctrlProc: '年费缴纳', feeType: '第3年年费', amount: 35000, currency: 'JPY' })
    ]

    const rates = { EUR: 7.85, USD: 7.25, JPY: 0.048 }
    const headers = defaultHeaders('general-foreign', new Date('2026-11-19'))
    const result = await fillBillingTemplate('general-foreign', rawTemplate, {
      rows,
      bills: {
        'PA2411768CN-EP': [{ fileName: 'INV-B-001.pdf', billNo: 'B-001', matter: '进入EP', date: '2026-08-15', caseVolume: 'PA2411768CN-EP', versionSuffix: '' }]
      },
      rates,
      rateDate: '2026-11-19',
      headers,
      options: { reviewFee: 200, bankFee: 50 },
      today: new Date('2026-11-19')
    })

    expect(result.fileName).toBe('格尔涉外请款单-20261119.xlsx')
    expect(result.blockCount).toBe(3) // 3 distinct (caseVolume + ctrlProc) events

    // Verify output xlsx structure
    const book = await XlsxBook.open(result.bytes)
    const sheet = book.sheet(book.sheets[0].name)

    // Formula checks: row 5, 6, 7 should have formulas for CNY and total
    expect(sheet.hasFormula('O5')).toBe(true) // 官费外币合计
    expect(sheet.hasFormula('Q5')).toBe(true) // 外币合计 (官费+代理费)
    expect(sheet.hasFormula('S5')).toBe(true) // 人民币合计 (外币合计*汇率)
    expect(sheet.hasFormula('W5')).toBe(true) // 人民币总额

    // Cells checks
    expect(sheet.valueOf('C5')).toBe('PA2411768CN-EP')
    expect(sheet.valueOf('I5')).toBe(1200) // 新申请官费
    expect(sheet.valueOf('P5')).toBe(800) // 外所代理费
    expect(sheet.valueOf('R5')).toBe(7.85) // EUR汇率
    // 纯官费无外所代理费行（row 6）：P6 不能为 '/'，避免 S6=ROUND((O6+P6)*R6+Q6,2) 报 #VALUE!
    expect(sheet.valueOf('P6')).toBeNull()

    // Summary row formula should encompass rows 5 to 7
    const summaryFormula = sheet.formulaOf('S8')
    expect(summaryFormula).toContain('SUM(S5:S7)')
    expect(sheet.hasFormula('P8')).toBe(false)
  })

  it('fills midea-foreign template with 3-row blocks and duplicate sheets', async () => {
    const rawTemplate = readAsset('qingkuan-midea-foreign.xlsx')
    const rows: FeeSearchRow[] = [
      mockFeeRow({ feeId: 'f1', caseVolume: 'PA2411768CN-EP', ctrlProc: '申请', feeType: '申请费', amount: 1500, currency: 'EUR' }),
      mockFeeRow({ feeId: 'f2', caseVolume: 'PA2411768CN-EP', ctrlProc: '申请', feeType: '外所代理费', amount: 900, currency: 'EUR' })
    ]

    const rates = { EUR: 7.85 }
    const headers = defaultHeaders('midea-foreign', new Date('2026-11-19'))
    headers.client = '广东美的生活电器制造有限公司'
    headers.entrust = '美的生活电器'

    const result = await fillBillingTemplate('midea-foreign', rawTemplate, {
      rows,
      bills: {
        'PA2411768CN-EP': [{ fileName: 'INV-EP-01.pdf', billNo: 'INV-EP-01', matter: '申请', date: '2026-08-10', caseVolume: 'PA2411768CN-EP', versionSuffix: '' }]
      },
      rates,
      rateDate: '2026-11-19',
      headers,
      options: { reviewFee: 200, bankFee: 50 },
      today: new Date('2026-11-19')
    })

    expect(result.blockCount).toBe(1)
    const book = await XlsxBook.open(result.bytes)
    expect(book.sheets.length).toBeGreaterThanOrEqual(2)

    for (const name of ['线下专利请款表A-生活电器2026M7-9', '线下专利请款表A-生活电器2026M7-9 (2)']) {
      const sheet = book.sheet(name)
      // Block base row is 7
      expect(sheet.valueOf('C7')).toBe('PA2411768CN-EP')
      expect(sheet.valueOf('P7')).toBe(1500)
      expect(sheet.valueOf('Q7')).toBe(7.85)
      // Row 8 is agent fee
      expect(sheet.valueOf('S8')).toBe(900)
      expect(sheet.valueOf('T8')).toBe(7.85)
      // Row 9 is review & bank fee
      expect(sheet.valueOf('AA9')).toBe(200)
      expect(sheet.valueOf('AB9')).toBe(50)

      // Check formulas on column R, U, W, Z, AC, AF
      expect(sheet.hasFormula('R7')).toBe(true) // P7*Q7
      expect(sheet.hasFormula('U8')).toBe(true) // S8*T8
      expect(sheet.hasFormula('AF7')).toBe(true) // Total
    }

    // 账单汇总：根级 #REF! 已清理，下游汇总公式和跨表引用保留并正确平移到 AF10
    const summary = book.sheet('账单汇总')
    expect(summary.hasFormula('L4')).toBe(false)
    expect(summary.hasFormula('M4')).toBe(false)
    expect(summary.hasFormula('J6')).toBe(false)
    expect(summary.formulaOf('L5')).toBe("'线下专利请款表A-生活电器2026M7-9'!AF10-M5")
    expect(summary.formulaOf('M5')).toBe("'线下专利请款表A-生活电器2026M7-9'!V10")
    expect(summary.hasFormula('N4')).toBe(true)
    expect(summary.hasFormula('N7')).toBe(true)
    expect(summary.hasFormula('L8')).toBe(true)
  })

  it('fills midea-pct template (1 row per case)', async () => {
    const rawTemplate = readAsset('qingkuan-midea-pct.xlsx')
    const rows: FeeSearchRow[] = [
      mockFeeRow({ feeId: 'f1', caseVolume: 'PA2411768CN-WO', ctrlProc: '国际申请', feeClass: 'O', feeType: 'PCT国际申请费', amount: 1330, currency: 'USD' }),
      mockFeeRow({ feeId: 'f2', caseVolume: 'PA2411768CN-WO', ctrlProc: '国际申请', feeClass: 'O', feeType: 'PCT检索费', amount: 2100, currency: 'USD' }),
      mockFeeRow({ feeId: 'f3', caseVolume: 'PA2411768CN-WO', ctrlProc: '国际申请', feeClass: 'A', feeType: '事务所代理费', amount: 5000, currency: 'CNY' })
    ].map(row => ({ ...row, customerName: '美的小家电事业部' }))
    rows[0].caseVolumeCustomer = ''
    rows[1].ctrlProc = 'PCT初步审查'

    const rates = { USD: 7.25, CNY: 1 }
    const today = new Date(2026, 10, 19)
    const headers = defaultHeaders('midea-pct', today)
    headers.client = '广东美的生活电器制造有限公司'

    const result = await fillBillingTemplate('midea-pct', rawTemplate, {
      rows,
      bills: {},
      rates,
      rateDate: '2026-11-19',
      headers,
      options: { reviewFee: 0, bankFee: 0 },
      today
    })

    expect(result.blockCount).toBe(1)
    const book = await XlsxBook.open(result.bytes)
    const sheet = book.sheet('PCT费用明细')

    expect(sheet.valueOf('C6')).toBe('PA2411768CN-WO')
    expect(sheet.valueOf('B6')).toBe('CL-001')
    expect(sheet.valueOf('F6')).toBe('国际申请；PCT初步审查')
    expect(sheet.valueOf('N6')).toBeNull()
    expect(sheet.valueOf('K13')).toBe(46345)
    // USD 1330 * 7.25 = 9642.5
    expect(sheet.valueOf('I6')).toBe(9642.5)
    // USD 2100 * 7.25 = 15225
    expect(sheet.valueOf('J6')).toBe(15225)
    // CNY 5000
    expect(sheet.valueOf('L6')).toBe(5000)
    // Column M is formula (SUM I6:L6)
    expect(sheet.hasFormula('M6')).toBe(true)
    // 账单汇总：根级 #REF! 已清理，跨表引用与下游汇总公式保留并随行数平移到第 7 行
    const summary = book.sheet('账单汇总')
    expect(summary.hasFormula('L4')).toBe(false)
    expect(summary.hasFormula('L5')).toBe(false)
    expect(summary.valueOf('A1')).toContain('2026-08-20')
    expect(summary.valueOf('B6')).toBe('美的小家电事业部')
    expect(summary.formulaOf('J6')).toBe("'PCT费用明细'!I7")
    expect(summary.formulaOf('K6')).toBe("'PCT费用明细'!L7")
    expect(summary.hasFormula('N6')).toBe(true)
    expect(summary.hasFormula('N7')).toBe(true)
  })

  it.each([
    ['云南电网', '美的小家电事业部', /美的客户/],
    ['美的小家电事业部', '美的新能源事业部', /同一客户/],
    ['', '美的小家电事业部', /客户名称缺失/]
  ])('rejects an unsafe PCT customer scope (%s, %s)', async (first, second, message) => {
    const rows = [first, second].map((customerName, index) => mockFeeRow({
      customerName, feeId: String(index), caseVolume: `PA260000${index}PCT`, feeType: 'PCT国际申请费',
      feeClass: 'O', currency: 'CNY'
    }))
    await expect(fillBillingTemplate('midea-pct', readAsset('qingkuan-midea-pct.xlsx'), {
      rows, bills: {}, rates: {}, rateDate: '2026-11-20', headers: defaultHeaders('midea-pct'),
      options: { reviewFee: 0, bankFee: 0 }
    })).rejects.toThrow(message)
  })

  it('provides template-specific smart query presets (foreign=T, pct=O,A) and default midea overhead', () => {
    const general = BILLING_TEMPLATES.find(t => t.id === 'general-foreign')!
    const mideaForeign = BILLING_TEMPLATES.find(t => t.id === 'midea-foreign')!
    const mideaPct = BILLING_TEMPLATES.find(t => t.id === 'midea-pct')!
    expect(general.queryPreset.feeFields.fee_class).toBe('O,A,T')
    expect(mideaForeign.queryPreset.feeFields.fee_class).toBe('O,A,T')
    expect(mideaForeign.queryPreset.defaultOptions).toEqual({ reviewFee: 100, bankFee: 250 })
    expect(mideaPct.queryPreset.feeFields.fee_class).toBe('O,A')
    expect(mideaPct.queryPreset.fileStepOptional).toBe(true)
  })

  it('charges separately for same-name matters with different procIds', async () => {
    const result = await fillBillingTemplate('midea-foreign', readAsset('qingkuan-midea-foreign.xlsx'), {
      rows: [mockFeeRow({}), mockFeeRow({ feeId: 'f2', procId: 'proc-2' })],
      bills: {}, rates: { EUR: 7.85 }, rateDate: '2026-11-20', headers: defaultHeaders('midea-foreign'),
      options: { reviewFee: 100, bankFee: 250 }
    })
    const book = await XlsxBook.open(result.bytes)
    const sheet = book.sheet(book.sheets[1].name)
    expect([sheet.valueOf('AA9'), sheet.valueOf('AA12'), sheet.valueOf('AB12')]).toEqual([100, 100, 250])
  })

  it('matches overseas invoice dates per matter and leaves ambiguous dates blank', async () => {
    const a = mockFeeRow({ billNo: 'B1' })
    const b = mockFeeRow({ feeId: 'f2', procId: 'proc-2', ctrlProc: '答辩', sn: 2 })
    const bills = ['B1', 'B2'].map((billNo, index) => ({
      billNo, date: `2026-10-0${index + 1}`, caseVolume: a.caseVolume, matter: '',
      fileName: `${billNo}.pdf`, versionSuffix: ''
    }))
    const result = await fillBillingTemplate('midea-foreign', readAsset('qingkuan-midea-foreign.xlsx'), {
      rows: [a, b], bills: { [a.caseVolume]: bills }, rates: { EUR: 7.85 }, rateDate: '2026-11-20',
      headers: defaultHeaders('midea-foreign'), options: { reviewFee: 100, bankFee: 250 }
    })
    const book = await XlsxBook.open(result.bytes)
    const sheet = book.sheet(book.sheets[1].name)
    expect(sheet.valueOf('L7')).toBe(46296)
    expect(sheet.valueOf('L10')).toBeNull()
    expect(result.warnings).toHaveLength(1)
  })

  it.each([
    { caseVolume: 'PA123PCT', feeClass: 'T', feeType: '翻译费' },
    { caseVolume: 'PA123-EP', feeClass: 'O', feeType: '申请费' },
    { caseVolume: 'PA123PCT', feeClass: 'O', feeType: '国家阶段申请费' },
    { caseVolume: 'PA123PCT', feeClass: 'O', feeType: '初步审查费（PCT国际）' },
    { caseVolume: 'PA123PCT', feeClass: 'O', feeType: '优先权文件传送费（PCT国际）' },
    { caseVolume: 'PA123PCT', feeClass: 'O', feeType: '年费' }
  ])('blocks an unsupported PCT row (%j)', fee => {
    return expect(fillBillingTemplate('midea-pct', readAsset('qingkuan-midea-pct.xlsx'), {
      rows: [mockFeeRow({ ...fee, ctrlProc: '', currency: 'CNY' })],
      bills: {}, rates: {}, rateDate: '2026-11-20', headers: defaultHeaders('midea-pct'),
      options: { reviewFee: 0, bankFee: 0 }
    })).rejects.toThrow(/PCT/)
  })

  it('charges midea-foreign review/bank fee only once when a single event splits across currencies', async () => {
    const rawTemplate = readAsset('qingkuan-midea-foreign.xlsx')
    const result = await fillBillingTemplate('midea-foreign', rawTemplate, {
      rows: [
        mockFeeRow({ feeId: 'f1', caseVolume: 'PA2411768CN-EP', ctrlProc: '申请', feeType: '申请费', amount: 1000, currency: 'EUR' }),
        mockFeeRow({ feeId: 'f2', caseVolume: 'PA2411768CN-EP', ctrlProc: '申请', feeType: '外所代理费', amount: 500, currency: 'USD' })
      ],
      bills: {},
      rates: { EUR: 7.8, USD: 7.2 },
      rateDate: '2026-11-19',
      headers: defaultHeaders('midea-foreign', new Date('2026-11-19')),
      options: { reviewFee: 100, bankFee: 250 },
      today: new Date('2026-11-19')
    })
    expect(result.blockCount).toBe(2)
    expect(result.warnings.some(w => w.includes('仅首块计入审核费与银行费'))).toBe(true)
    const book = await XlsxBook.open(result.bytes)
    const sheet = book.sheet('线下专利请款表A-生活电器2026M7-9')
    expect(sheet.valueOf('AA9')).toBe(100)
    expect(sheet.valueOf('AB9')).toBe(250)
    expect(sheet.valueOf('AA12')).toBeNull()
    expect(sheet.valueOf('AB12')).toBeNull()
  })

  it('throws descriptive error if required currency exchange rate is missing', async () => {
    const rawTemplate = readAsset('qingkuan-general-foreign.xlsx')
    const rows: FeeSearchRow[] = [
      mockFeeRow({ currency: 'CHF', amount: 800 })
    ]

    await expect(fillBillingTemplate('general-foreign', rawTemplate, {
      rows,
      bills: {},
      rates: { USD: 7.2 },
      rateDate: '2026-11-19',
      headers: {},
      options: { reviewFee: 0, bankFee: 0 }
    })).rejects.toThrow(/缺少汇率.*CHF/)
  })

  it('correctly places translation fee into column T for general-foreign and column Y for midea-foreign', async () => {
    // 1. 通用涉外模板
    const generalTpl = readAsset('qingkuan-general-foreign.xlsx')
    const generalRes = await fillBillingTemplate('general-foreign', generalTpl, {
      rows: [
        mockFeeRow({ feeId: 'f1', caseVolume: 'PA2411768CN-EP', ctrlProc: '进入EP', feeType: '新申请官费', amount: 1000, currency: 'EUR' }),
        mockFeeRow({ feeId: 'f2', caseVolume: 'PA2411768CN-EP', ctrlProc: '进入EP', feeType: '说明书翻译费', amount: 200, currency: 'EUR' })
      ],
      bills: {},
      rates: { EUR: 7.85 },
      rateDate: '2026-11-19',
      headers: {},
      options: { reviewFee: 0, bankFee: 0 }
    })
    const generalBook = await XlsxBook.open(generalRes.bytes)
    const generalSheet = generalBook.sheet(generalBook.sheets[0].name)
    // T5 应记录翻译费 200 EUR 折合 1570 CNY
    expect(generalSheet.valueOf('T5')).toBe(1570)

    // 2. 美的涉外模板
    const mideaTpl = readAsset('qingkuan-midea-foreign.xlsx')
    const mideaRes = await fillBillingTemplate('midea-foreign', mideaTpl, {
      rows: [
        mockFeeRow({ feeId: 'f1', caseVolume: 'PA2411768CN-EP', ctrlProc: '进入EP', feeType: '新申请官费', amount: 1000, currency: 'EUR' }),
        mockFeeRow({ feeId: 'f2', caseVolume: 'PA2411768CN-EP', ctrlProc: '进入EP', feeType: '说明书翻译费', amount: 200, currency: 'EUR' })
      ],
      bills: {},
      rates: { EUR: 7.85 },
      rateDate: '2026-11-19',
      headers: {},
      options: { reviewFee: 100, bankFee: 250 }
    })
    const mideaBook = await XlsxBook.open(mideaRes.bytes)
    const mideaSheet = mideaBook.sheet('线下专利请款表A-生活电器2026M7-9')
    // Y9 应记录国内所翻译费 1570
    expect(mideaSheet.valueOf('Y9')).toBe(1570)
    // AG9 说明文字应包含 译1570CNY
    expect(String(mideaSheet.valueOf('AG9'))).toContain('译1570CNY')
  })

  it('separates events by procId even when ctrlProc name is the same', async () => {
    const rawTemplate = readAsset('qingkuan-general-foreign.xlsx')
    const rows: FeeSearchRow[] = [
      mockFeeRow({ feeId: 'f1', procId: 'proc-oa-1', caseVolume: 'PA2411768CN-EP', ctrlProc: '答复审查意见', feeType: '官费', amount: 300, currency: 'EUR' }),
      mockFeeRow({ feeId: 'f2', procId: 'proc-oa-2', caseVolume: 'PA2411768CN-EP', ctrlProc: '答复审查意见', feeType: '官费', amount: 400, currency: 'EUR' })
    ]

    const result = await fillBillingTemplate('general-foreign', rawTemplate, {
      rows,
      bills: {},
      rates: { EUR: 7.85 },
      rateDate: '2026-11-19',
      headers: {},
      options: { reviewFee: 0, bankFee: 0 }
    })
    // 两个不同 procId 的 OA 事项，应该分为两个独立的 block 行
    expect(result.blockCount).toBe(2)
  })
})
