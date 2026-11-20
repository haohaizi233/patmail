import type { FeeSearchRow } from '../api/fee-search-types'
import {
  countryOfCase, groupFeeCases, groupFeeEvents, latestBillDate, officialKind, patentTypeLabel, rateOf, round2, sumAmount,
  uniqueText, missingCurrencies, sortFeeRows, type BillInfo, type EventGroup, type OfficialKind
} from './fee-model'
import { normalizeCurrency } from './pbc-rates'
import { excelSerial, XlsxBook, type SheetEditor } from './xlsx-engine'

export type BillingTemplateId = 'general-foreign' | 'midea-foreign' | 'midea-pct'

export const BILLING_TAX_RATE = 0.0672

export function formatLocalDate(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface HeaderField {
  key: string
  label: string
  cells: string[]
  /** 默认文案；{y}{m}{d} 会替换成今天。 */
  default: string
}

export const PATENT_CASE_TYPE_ID = '31D1A147-2931-43B5-94AE-B72B1525BA8A'

export interface TemplateQueryPreset {
  /** 步骤 1 文件管理自动预填字段 */
  fileFields: Record<string, string>
  /** 步骤 1 是否可选（PCT 导官费+代理费，常直接在步骤 2 检索） */
  fileStepOptional: boolean
  /** 步骤 2 费用查询自动预填字段 */
  feeFields: Record<string, string>
  /** 费用查询预填说明 */
  feeClassLabel: string
  /** 默认审核费 / 银行费（元/事项） */
  defaultOptions: BillingOptions
}

export interface BillingTemplateInfo {
  id: BillingTemplateId
  label: string
  summary: string
  fileBase: string
  headers: HeaderField[]
  queryPreset: TemplateQueryPreset
}

export const BILLING_TEMPLATES: BillingTemplateInfo[] = [
  {
    id: 'general-foreign', label: '通用涉外请款单', fileBase: '涉外请款单',
    summary: '一事项一行：官费按新申请/年费/生效/IDS/RCE/授权分列，外所代理费、汇率、税费、翻译费、内所代理费。',
    queryPreset: {
      fileFields: { flow_direction: 'IO', filetype: '付款INVOICE' },
      fileStepOptional: false,
      feeFields: { case_type: PATENT_CASE_TYPE_ID, Case_direction: 'IO', fee_class: 'T' },
      feeClassLabel: '第三方费用',
      defaultOptions: { reviewFee: 0, bankFee: 0 }
    },
    headers: [
      { key: 'title', label: '表头标题', cells: ['A1'], default: '世纪恒程事务所{y}年{m}月份国外专利费用请款单' },
      { key: 'ids', label: '知易通编号 / 请款单编号', cells: ['A2'], default: '知易通编号：  请款单编号：' }
    ]
  },
  {
    id: 'midea-foreign', label: '美的涉外费用清单', fileBase: '美的涉外费用清单',
    summary: '一事项一块（官费 / 外所代理费 / 内所代理费三行），含 IPMS 导入辅助列，两张清单表同时填写。',
    queryPreset: {
      fileFields: { flow_direction: 'IO', filetype: '付款INVOICE' },
      fileStepOptional: false,
      feeFields: { case_type: PATENT_CASE_TYPE_ID, Case_direction: 'IO', fee_class: 'T' },
      feeClassLabel: '第三方费用',
      defaultOptions: { reviewFee: 100, bankFee: 250 }
    },
    headers: [
      { key: 'title', label: '表头标题', cells: ['A1'], default: '{y}年{m}月费用清单_涉外案件' },
      { key: 'client', label: '客户名称（发票抬头）', cells: ['A3'], default: '客户名称（发票抬头）：' },
      { key: 'billNo', label: '账单编号', cells: ['AE2'], default: '账单编号：' },
      { key: 'eid', label: '知易通编号', cells: ['AD3'], default: '' },
      { key: 'billDate', label: '账单日期', cells: ['AE3'], default: '账单日期：{y}-{m}-{d}' },
      { key: 'entrust', label: '案件委托人（每行）', cells: [], default: '' }
    ]
  },
  {
    id: 'midea-pct', label: '美的 PCT 费用清单', fileBase: '美的PCT费用清单',
    summary: '一案一行：PCT 国际申请费 / 检索费 / 附加费 / 我方代理费，金额折人民币。',
    queryPreset: {
      fileFields: { flow_direction: 'IO', filetype: '付款INVOICE' },
      fileStepOptional: true,
      feeFields: { case_type: PATENT_CASE_TYPE_ID, Case_direction: 'IO', fee_class: 'O,A' },
      feeClassLabel: '官费 + 我方代理费',
      defaultOptions: { reviewFee: 0, bankFee: 0 }
    },
    headers: [
      { key: 'title', label: '表头标题', cells: ['A1'], default: '{y}年世纪恒程知识产权代理事务所-美的国外专利PCT费用清单' },
      { key: 'client', label: '客户名称', cells: ['A3'], default: '客户名称：' },
      { key: 'sendDate', label: '发文日期', cells: ['G3'], default: '发文日期：{y}-{m}-{d}' },
      { key: 'ids', label: '知易通编号 / 财务编号', cells: ['I3'], default: '知易通编号： 财务编号：' }
    ]
  }
]

export function defaultHeaders(id: BillingTemplateId, today = new Date()): Record<string, string> {
  const info = BILLING_TEMPLATES.find(item => item.id === id)
  const y = String(today.getFullYear())
  const m = String(today.getMonth() + 1)
  const d = String(today.getDate())
  const out: Record<string, string> = {}
  for (const field of info?.headers ?? []) out[field.key] = field.default.replace('{y}', y).replace('{m}', m).replace('{d}', d)
  return out
}

export interface BillingOptions {
  /** 账单审核费（元，每个事项）。 */
  reviewFee: number
  /** 银行费（元，每个事项；0 表示不收）。 */
  bankFee: number
}

export interface BillingInput {
  rows: FeeSearchRow[]
  bills: Record<string, BillInfo[]>
  /** 币种 → 1 单位折合人民币（已含人工修改）。 */
  rates: Record<string, number>
  rateDate: string
  headers: Record<string, string>
  options: BillingOptions
  today?: Date
}

export interface BillingResult {
  bytes: Uint8Array
  fileName: string
  warnings: string[]
  blockCount: number
}

function stamp(today: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${today.getFullYear()}${p(today.getMonth() + 1)}${p(today.getDate())}`
}

function applyHeaders(sheets: SheetEditor[], info: BillingTemplateInfo, headers: Record<string, string>): void {
  for (const field of info.headers) {
    const value = headers[field.key]
    if (value === undefined || !field.cells.length) continue
    for (const sheet of sheets) for (const cell of field.cells) sheet.setCell(cell, value)
  }
}

function requireRates(input: BillingInput): void {
  const missing = missingCurrencies(input.rows, input.rates)
  if (missing.length) throw new Error(`缺少汇率：${missing.join('、')}。先读取人民银行汇率，或在汇率表里手工填写。`)
}

function amountText(amount: number, currency: string): string {
  return `${amount}${currency}`
}

// ---------------------------------------------------------------- 通用涉外请款单

const GENERAL_COLUMN: Record<OfficialKind, string> = {
  new: 'I', annual: 'J', validation: 'K', ids: 'L', rce: 'M', grant: 'N', pctApply: 'I', pctSearch: 'I', pctExtra: 'I', other: 'I'
}

function cnyAmount(row: FeeSearchRow, rates: Record<string, number>): number {
  const rate = rateOf(row.currency, rates) ?? 1
  return round2(row.amount * rate)
}

function fillGeneral(book: XlsxBook, input: BillingInput, warnings: string[]): number {
  const sheetName = book.sheets[0]?.name ?? ''
  const sheet = book.sheet(sheetName)
  const events = groupFeeEvents(input.rows)
  sheet.resizeBlocks({ firstRow: 5, blockSize: 1, oldCount: 2, newCount: events.length })
  events.forEach((group, index) => {
    const row = 5 + index
    const cells: Record<string, string | number | null> = {
      A: index + 1, B: group.customerVolume, C: group.caseVolume, D: group.appNo, E: group.caseName,
      F: excelSerial(group.appDate), G: patentTypeLabel(group.applyType), H: group.applicant
    }
    for (const col of ['I', 'J', 'K', 'L', 'M', 'N']) cells[col] = '/'
    const totals = new Map<string, number>()
    for (const fee of group.official) {
      const kind = officialKind(fee, 'foreign')
      if (kind === 'other') warnings.push(`${group.caseVolume}「${fee.feeType || fee.ctrlProc}」没有认出官费类别，已计入「新申请」列，请核对。`)
      const col = GENERAL_COLUMN[kind]
      totals.set(col, round2((totals.get(col) ?? 0) + fee.amount))
    }
    for (const [col, amount] of totals) cells[col] = amount
    // S 列公式为 ROUND((O+P)*R+Q,2)，P 列绝不能写文本 '/'（否则 Excel 计算出 #VALUE!）
    cells.P = group.agent.length ? sumAmount(group.agent) : null
    cells.R = rateOf(group.currency, input.rates)
    // T 列为翻译费总额（折合 CNY），若有翻译费则填入，让总计 W = SUM(S:T, V) 完整包含翻译费
    const translationCny = group.translation.length
      ? round2(group.translation.reduce((sum, fee) => sum + cnyAmount(fee, input.rates), 0))
      : null
    cells.T = translationCny
    cells.U = '/'
    cells.V = group.internalAgent.length
      ? round2(group.internalAgent.reduce((sum, fee) => sum + cnyAmount(fee, input.rates), 0))
      : null
    cells.X = uniqueText([group.ctrlProc, ...group.official.map(fee => fee.feeType), ...group.translation.map(f => f.feeType)]).join('；')
    cells.Y = excelSerial(group.finishDate)
    for (const [col, value] of Object.entries(cells)) sheet.setCell(`${col}${row}`, value)
  })
  sheet.setCell('R3', `汇率\n（以账单当月为准${input.rateDate}）`)
  return events.length
}

// ---------------------------------------------------------------- 美的涉外费用清单

const MIDEA_FOREIGN_SHEETS = ['线下专利请款表A-生活电器2026M7-9', '线下专利请款表A-生活电器2026M7-9 (2)']

function fillMideaForeignBlock(
  sheet: SheetEditor,
  group: EventGroup,
  index: number,
  base: number,
  input: BillingInput,
  entrust: string,
  chargeOverhead: boolean
): void {
  const rate = rateOf(group.currency, input.rates)
  const officialName = uniqueText(group.official.map(fee => fee.feeType)).join('、')
  const officialAmount = group.official.length ? sumAmount(group.official) : null
  const agentAmount = group.agent.length ? sumAmount(group.agent) : null
  const translationCny = group.translation.length
    ? round2(group.translation.reduce((sum, fee) => sum + cnyAmount(fee, input.rates), 0))
    : null
  const internalAgentCny = group.internalAgent.length
    ? round2(group.internalAgent.reduce((sum, fee) => sum + cnyAmount(fee, input.rates), 0))
    : null
  const cur = group.currency
  const billDate = latestBillDate(input.bills[group.caseVolume])
  const review = chargeOverhead ? input.options.reviewFee : 0
  const bank = chargeOverhead ? input.options.bankFee : 0
  const officialCny = officialAmount === null || rate === null ? 0 : round2(officialAmount * rate)
  const agentCny = agentAmount === null || rate === null ? 0 : round2(agentAmount * rate)
  const tax = round2((officialCny + agentCny) * BILLING_TAX_RATE)
  const r0 = base
  const r1 = base + 1
  const r2 = base + 2
  const top: Record<string, string | number | null> = {
    A: index + 1, B: group.customerVolume, C: group.caseVolume, D: group.caseName, E: group.applicant,
    F: patentTypeLabel(group.applyType), G: group.appNo, H: excelSerial(group.appDate), I: countryOfCase(group.caseVolume),
    J: entrust, K: excelSerial(group.finishDate), L: excelSerial(billDate), M: group.ctrlProc,
    O: officialName || '无', P: officialAmount, Q: officialAmount === null ? null : rate,
    AG: officialAmount === null ? '' : `${officialName}${amountText(officialAmount, cur)}`, AH: null
  }
  for (const [col, value] of Object.entries(top)) sheet.setCell(`${col}${r0}`, value)
  sheet.setCell(`S${r1}`, agentAmount)
  sheet.setCell(`T${r1}`, agentAmount === null ? null : rate)
  sheet.setCell(`AG${r1}`, agentAmount === null ? '' : `${group.ctrlProc}外所代理费${amountText(agentAmount, cur)}`)
  sheet.setCell(`Y${r2}`, translationCny)
  sheet.setCell(`Z${r2}`, internalAgentCny)
  sheet.setCell(`AA${r2}`, review || null)
  sheet.setCell(`AB${r2}`, bank || null)
  const parts = [
    translationCny ? `译${translationCny}CNY` : '',
    internalAgentCny ? `代${internalAgentCny}` : '',
    review ? `审${review}` : '',
    bank ? `银${bank}` : '',
    `税${tax}CNY`
  ].filter(Boolean)
  sheet.setCell(`AG${r2}`, parts.join('+'))
}

function fillMideaForeign(book: XlsxBook, input: BillingInput, warnings: string[]): number {
  const events = groupFeeEvents(input.rows)
  const entrust = input.headers.entrust ?? ''
  const sheets = MIDEA_FOREIGN_SHEETS.map(name => book.sheet(name))
  const seenEvents = new Set<string>()
  const chargeFlags = events.map(group => {
    const key = `${group.caseVolume}\u0001${group.ctrlProc}`
    if (seenEvents.has(key)) {
      warnings.push(`${group.caseVolume}「${group.ctrlProc}」含多种币别已拆块填写，仅首块计入审核费与银行费，请核对。`)
      return false
    }
    seenEvents.add(key)
    return true
  })
  for (const sheet of sheets) {
    sheet.resizeBlocks({ firstRow: 7, blockSize: 3, oldCount: 3, newCount: events.length })
    events.forEach((group, index) => fillMideaForeignBlock(sheet, group, index, 7 + index * 3, input, entrust, chargeFlags[index] ?? true))
  }
  return events.length
}

// ---------------------------------------------------------------- 美的 PCT 费用清单

function fillMideaPct(book: XlsxBook, input: BillingInput, warnings: string[]): number {
  const sheet = book.sheet('生活电器2026M7-9')
  const cases = groupFeeCases(input.rows)
  sheet.resizeBlocks({ firstRow: 6, blockSize: 1, oldCount: 2, newCount: cases.length })
  cases.forEach((group, index) => {
    const row = 6 + index
    let apply = 0
    let search = 0
    let extra = 0
    for (const fee of group.official) {
      const amount = cnyAmount(fee, input.rates)
      const kind = officialKind(fee, 'pct')
      if (kind === 'pctSearch') search += amount
      else if (kind === 'pctExtra') extra += amount
      else {
        if (kind !== 'pctApply') warnings.push(`${group.caseVolume}「${fee.feeType || fee.ctrlProc}」不是 PCT 国际申请费/检索费/附加费，已计入「PCT 国际申请费」列，请核对。`)
        apply += amount
      }
    }
    const agent = round2(group.agent.reduce((total, fee) => total + cnyAmount(fee, input.rates), 0))
    const proc = group.ctrlProc
    const cells: Record<string, string | number | null> = {
      A: index + 1, B: group.customerVolume, C: group.caseVolume, D: group.caseName,
      E: patentTypeLabel(group.applyType), F: /新申请|国际申请|PCT/.test(proc) ? '新申请' : proc, G: group.appNo,
      H: excelSerial(group.appDate), I: apply ? round2(apply) : null, J: search ? round2(search) : null,
      K: extra ? round2(extra) : null, L: agent || null, N: null
    }
    for (const [col, value] of Object.entries(cells)) sheet.setCell(`${col}${row}`, value)
  })
  // 页脚「敬呈」日期
  const targetRow = 12 + cases.length
  for (const n of [targetRow, targetRow + 1, targetRow - 1]) {
    const val = sheet.valueOf(`K${n}`)
    if (typeof val === 'number' && !sheet.hasFormula(`K${n}`)) {
      sheet.setCell(`K${n}`, excelSerial(input.today ?? new Date()))
      break
    }
  }
  return cases.length
}

// ---------------------------------------------------------------- 入口

export async function fillBillingTemplate(id: BillingTemplateId, template: Uint8Array, input: BillingInput): Promise<BillingResult> {
  if (!input.rows.length) throw new Error('还没有选中的费用记录。')
  requireRates(input)
  const info = BILLING_TEMPLATES.find(item => item.id === id)
  if (!info) throw new Error('未知的请款表模板。')
  const today = input.today ?? new Date()
  const sortedInput: BillingInput = { ...input, rows: sortFeeRows(input.rows) }
  const book = await XlsxBook.open(template)
  // 清理模板根级 #REF! 失效格，保留下游汇总/小计计算公式
  book.clearRootRefFormulas()
  const warnings: string[] = []
  let blockCount = 0
  if (id === 'general-foreign') blockCount = fillGeneral(book, sortedInput, warnings)
  else if (id === 'midea-foreign') blockCount = fillMideaForeign(book, sortedInput, warnings)
  else blockCount = fillMideaPct(book, sortedInput, warnings)
  const headerSheets = id === 'midea-foreign'
    ? MIDEA_FOREIGN_SHEETS.map(name => book.sheet(name))
    : [book.sheet(id === 'general-foreign' ? (book.sheets[0]?.name ?? '') : '生活电器2026M7-9')]
  applyHeaders(headerSheets, info, input.headers)
  const unknownCurrency = uniqueText(input.rows.map(row => normalizeCurrency(row.currency))).filter(code => code.length !== 3)
  if (unknownCurrency.length) warnings.push(`币别「${unknownCurrency.join('、')}」不是标准代码，请核对汇率。`)
  const bytes = await book.save()
  return { bytes, fileName: `${info.fileBase}-${stamp(today)}.xlsx`, warnings, blockCount }
}
