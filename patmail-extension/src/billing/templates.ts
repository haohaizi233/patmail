import type { FeeSearchRow } from '../api/fee-search-types'
import {
  countryOfCase, feeMatterKey, groupFeeCases, groupFeeEvents, isTranslationFee, matchedBillDate, officialKind, patentTypeLabel, pctSelectionProblem, rateOf, round2, sumAmount,
  uniqueText, missingCurrencies, sortFeeRows, translationWordCount, wordBasedTranslation, type BillInfo, type EventGroup, type OfficialKind
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
    id: 'general-foreign', label: '格尔涉外请款单', fileBase: '格尔涉外请款单',
    summary: '一事项一行：官费按新申请/年费/生效/IDS/RCE/授权分列，外所代理费、汇率、税费、翻译费、内所代理费。',
    queryPreset: {
      fileFields: { flow_direction: 'IO', filetype: '付款INVOICE' },
      fileStepOptional: false,
      feeFields: { case_type: PATENT_CASE_TYPE_ID, Case_direction: 'IO', fee_class: 'O,A,T' },
      feeClassLabel: '官费 + 代理费 + 第三方费用',
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
      feeFields: { case_type: PATENT_CASE_TYPE_ID, Case_direction: 'IO', fee_class: 'O,A,T' },
      feeClassLabel: '官费 + 代理费 + 第三方费用',
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
      { key: 'title', label: '表头标题（留空使用默认标题）', cells: ['A1'], default: '' },
      { key: 'client', label: '客户名称（留空取 EASY 客户）', cells: ['A3'], default: '' },
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
  rateSourceUrl?: string
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

// ---------------------------------------------------------------- 格尔涉外请款单

const GENERAL_COLUMN: Partial<Record<OfficialKind, string>> = {
  new: 'I', annual: 'J', validation: 'K', ids: 'L', rce: 'M', grant: 'N'
}

function cnyAmount(row: FeeSearchRow, rates: Record<string, number>): number {
  const rate = rateOf(row.currency, rates) ?? 1
  return round2(row.amount * rate)
}

function foreignEvents(rows: FeeSearchRow[], mergeCnyForeign: boolean): EventGroup[] {
  const matterKey = (row: Pick<FeeSearchRow, 'caseVolume' | 'procId' | 'ctrlProc' | 'finishDate'>) =>
    row.procId.trim() ? feeMatterKey(row) : JSON.stringify([row.caseVolume, row.ctrlProc.trim(), row.finishDate])
  const byMatter = new Map<string, EventGroup[]>()
  for (const event of groupFeeEvents(rows, matterKey)) {
    event.translation.push(...event.internalAgent.filter(isTranslationFee))
    event.internalAgent = event.internalAgent.filter(row => !isTranslationFee(row))
    const key = matterKey(event)
    const groups = byMatter.get(key) ?? []
    groups.push(event)
    byMatter.set(key, groups)
  }
  return [...byMatter.values()].flatMap(groups => {
    const anchor = groups.find(group => group.currency !== 'CNY' && (group.official.length || group.agent.length)) ?? groups[0]
    for (const group of groups) {
      if (group === anchor) continue
      anchor.internalAgent.push(...group.internalAgent)
      anchor.translation.push(...group.translation)
      group.internalAgent = []
      group.translation = []
      if (mergeCnyForeign && group.currency === 'CNY') {
        anchor.official.push(...group.official)
        anchor.agent.push(...group.agent)
        group.official = []
        group.agent = []
      }
    }
    return groups.filter(group => group.official.length || group.agent.length || group.internalAgent.length || group.translation.length)
  })
}

function fillGeneral(book: XlsxBook, input: BillingInput, warnings: string[]): number {
  const sheetName = book.sheets[0]?.name ?? ''
  const sheet = book.sheet(sheetName)
  const events = foreignEvents(input.rows, true)
  const billedCurrencies = new Set<string>()
  sheet.resizeBlocks({ firstRow: 5, blockSize: 1, oldCount: 2, newCount: events.length })
  events.forEach((group, index) => {
    const row = 5 + index
    const cells: Record<string, string | number | null> = {
      A: index + 1, B: group.customerVolume, C: group.caseVolume, D: group.appNo, E: group.caseName,
      F: excelSerial(group.appDate), G: patentTypeLabel(group.applyType), H: group.applicant
    }
    for (const col of ['I', 'J', 'K', 'L', 'M', 'N']) cells[col] = '/'
    const pending = (fee: FeeSearchRow, reason: string) => {
      const detail = `${fee.feeType || '费用'} ${fee.amount} ${normalizeCurrency(fee.currency)}（${reason}，未纳入合计）`
      warnings.push(`${group.caseVolume}「${group.ctrlProc}」${detail}。`)
    }
    const totals = new Map<string, number>()
    for (const fee of group.official) {
      if (fee.amount === 0) continue
      if (normalizeCurrency(fee.currency) === 'CNY') {
        pending(fee, 'EASY 以人民币登记，待核对当地币种')
        continue
      }
      const kind = officialKind(/^海外申请官费$/.test(fee.feeType) ? { ...fee, feeType: '' } : fee)
      const col = GENERAL_COLUMN[kind]
      if (!col || /外代费/.test(fee.feeType)) {
        pending(fee, '待核对费用类别')
        continue
      }
      totals.set(col, round2((totals.get(col) ?? 0) + fee.amount))
    }
    for (const [col, amount] of totals) cells[col] = amount
    // S 列公式为 ROUND((O+P)*R+Q,2)，P 列绝不能写文本 '/'（否则 Excel 计算出 #VALUE!）
    const foreignAgent = group.agent.filter(fee => normalizeCurrency(fee.currency) !== 'CNY')
    group.agent.filter(fee => normalizeCurrency(fee.currency) === 'CNY' && fee.amount !== 0)
      .forEach(fee => pending(fee, 'EASY 以人民币登记，待核对当地币种'))
    cells.P = foreignAgent.length ? sumAmount(foreignAgent) : null
    cells.R = totals.size || foreignAgent.length ? rateOf(group.currency, input.rates) : null
    if (cells.R !== null) {
      billedCurrencies.add(group.currency)
    }
    // T 列为翻译费总额（折合 CNY），若有翻译费则填入，让总计 W = SUM(S:T, V) 完整包含翻译费
    const translationCny = group.translation.length
      ? round2(group.translation.reduce((sum, fee) => sum + cnyAmount(fee, input.rates), 0))
      : null
    cells.T = translationCny
    const counts = group.translation.map(translationWordCount)
    cells.U = counts.length && counts.every(count => count !== null)
      ? counts.reduce<number>((total, count) => total + (count ?? 0), 0) : '/'
    if (counts.some(count => count === null)) {
      const known = counts.reduce<number>((total, count) => total + (count ?? 0), 0)
      const note = known ? `已登记 ${known} 字，另有翻译字数待核对` : '翻译字数待核对'
      warnings.push(`${group.caseVolume}「${group.ctrlProc}」${note}。`)
    }
    cells.V = group.internalAgent.length
      ? round2(group.internalAgent.reduce((sum, fee) => sum + cnyAmount(fee, input.rates), 0))
      : null
    cells.X = group.ctrlProc
    cells.Y = excelSerial(group.finishDate)
    for (const [col, value] of Object.entries(cells)) sheet.setCell(`${col}${row}`, value)
  })
  if (billedCurrencies.size > 1) {
    const footerRow = 5 + events.length
    for (const col of ['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']) {
      const cell = `${col}${footerRow}`
      if (sheet.hasFormula(cell)) sheet.setCell(cell, null)
    }
    warnings.push('存在多种账单币种，合计行仅汇总人民币金额。')
  }
  sheet.setCell('R3', `汇率\n（${input.rateDate}）`)
  const period = /(\d{4})年\s*(1[0-2]|0?[1-9])月/.exec(input.headers.title ?? '')
  const today = input.today ?? new Date()
  const year = period?.[1] ?? today.getFullYear()
  const month = period ? Number(period[2]) : today.getMonth() + 1
  book.renameSheet(sheetName, `格尔${year}年${month}月涉外`)
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
  chargeOverhead: boolean,
  billDate: string
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
  const sourceRows = [...group.agent, ...group.official, ...group.internalAgent, ...group.translation]
  const rawText = (row: FeeSearchRow, key: string) => typeof row.raw[key] === 'string' ? row.raw[key] : ''
  const recordedCountries = uniqueText(sourceRows.map(row => rawText(row, 'country')))
  const customers = uniqueText(sourceRows.map(row => row.customerName))
  const suppliers = uniqueText([...group.agent, ...group.official].map(row => rawText(row, 'agency_name_cn')))
  const officialDates = uniqueText(group.official.map(row => rawText(row, 'law_fee_date')))
  const descriptions = uniqueText(group.agent.map(row => rawText(row, 'fee_desc')).filter(text =>
    text && !group.agent.some(row => row.feeType === text)
  ))
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
    F: patentTypeLabel(group.applyType), G: group.appNo, H: excelSerial(group.appDate),
    I: recordedCountries.length === 1 ? recordedCountries[0] : countryOfCase(group.caseVolume),
    J: entrust.trim() || (customers.length === 1 ? customers[0] : ''), K: excelSerial(group.finishDate), L: excelSerial(billDate), M: group.ctrlProc,
    O: officialName || null, P: officialAmount, Q: officialAmount === null ? null : rate,
    AG: officialAmount === null ? '' : `${officialName}${amountText(officialAmount, cur)}`, AH: suppliers.join('、') || null
  }
  for (const [col, value] of Object.entries(top)) sheet.setCell(`${col}${r0}`, value)
  if (sheet.hasFormula(`AP${r0}`)) {
    sheet.setCell(`AP${r0}`, officialDates.length === 1 ? excelSerial(officialDates[0]) : null)
  }
  sheet.setCell(`S${r1}`, agentAmount)
  sheet.setCell(`T${r1}`, agentAmount === null ? null : rate)
  sheet.setCell(`AG${r1}`, agentAmount === null ? '' : [
    `${group.ctrlProc}外所代理费${amountText(agentAmount, cur)}`, ...descriptions
  ].join('；'))
  const words = group.translation.map(translationWordCount)
  if (words.length && words.every(count => count !== null)) {
    sheet.setCell(`W${r2}`, words.reduce<number>((total, count) => total + (count ?? 0), 0))
  }
  const breakdown = group.translation.length === 1 ? wordBasedTranslation(group.translation[0]) : null
  if (breakdown) sheet.setCell(`X${r2}`, breakdown.pricePerThousand / 1000)
  sheet.setCell(`Y${r2}`, translationCny)
  sheet.setCell(`Z${r2}`, internalAgentCny)
  sheet.setCell(`AA${r2}`, review || null)
  sheet.setCell(`AB${r2}`, bank || null)
  const parts = [
    translationCny ? `译${translationCny}CNY${breakdown ? `（${breakdown.words} 字 × ${breakdown.pricePerThousand} 元/千字）` : ''}` : '',
    internalAgentCny ? `代${internalAgentCny}` : '',
    review ? `审${review}` : '',
    bank ? `银${bank}` : '',
    `税${tax}CNY`
  ].filter(Boolean)
  sheet.setCell(`AG${r2}`, parts.join('+'))
}

export function mideaForeignGroups(inputRows: FeeSearchRow[], warnings?: string[]): EventGroup[] {
  const rows = inputRows.filter(row => {
    if (row.feeClass !== 'O' || (normalizeCurrency(row.currency) !== 'CNY' && !/外代费/.test(row.feeType))) return true
    if (row.amount !== 0) warnings?.push(`${row.caseVolume}「${row.ctrlProc}」${row.feeType} ${row.amount} ${normalizeCurrency(row.currency)} 待核对原币或费用类别，未计入海外官费。`)
    return false
  })
  return foreignEvents(rows, false)
}

function fillMideaForeign(book: XlsxBook, input: BillingInput, warnings: string[]): number {
  const events = mideaForeignGroups(input.rows, warnings)
  if (!events.length) throw new Error('所选费用均缺少可确认的海外官费原币或费用分类，无法生成美的涉外清单。')
  const customers = uniqueText(input.rows.map(row => row.customerName))
  if (customers.length > 1) warnings.push(`本批费用涉及 ${customers.length} 个 EASY 客户，请按事业部和开票主体核对导出范围。`)
  for (const group of events) {
    if (group.translation.some(row => translationWordCount(row) === null)) warnings.push(`${group.caseVolume}「${group.ctrlProc}」翻译费已填，字数待核对。`)
  }
  const entrust = input.headers.entrust ?? ''
  const sheets = MIDEA_FOREIGN_SHEETS.map(name => book.sheet(name))
  const seenEvents = new Set<string>()
  const chargeFlags = events.map(group => {
    const key = feeMatterKey(group)
    if (seenEvents.has(key)) {
      warnings.push(`${group.caseVolume}「${group.ctrlProc}」含多种币别已拆块填写，仅首块计入审核费与银行费，请核对。`)
      return false
    }
    seenEvents.add(key)
    return true
  })
  const billDates = events.map(group => {
    const date = matchedBillDate(group, input.bills[group.caseVolume])
    if (!date) warnings.push(`${group.caseVolume}「${group.ctrlProc}」未能确认海外账单日，已留空，请核对。`)
    return date
  })
  for (const sheet of sheets) {
    sheet.resizeBlocks({ firstRow: 7, blockSize: 3, oldCount: 3, newCount: events.length })
    sheet.setCell('X6', '单价（元/字或词）')
    events.forEach((group, index) => fillMideaForeignBlock(sheet, group, index, 7 + index * 3, input, entrust, chargeFlags[index], billDates[index]))
  }
  const summary = book.sheet('账单汇总')
  const footer = 7 + events.length * 3
  const detail = `'${MIDEA_FOREIGN_SHEETS[0]}'!`
  summary.setFormula('M5', `${detail}V${footer}`)
  summary.setFormula('L5', `${detail}AF${footer}-M5`)
  const period = /(\d{4})年\s*(\d{1,2}(?:[-–—至]\d{1,2})?)月/.exec(input.headers.title ?? '')
  if (period) {
    const heading = customers.length === 1 ? customers[0] : '涉外'
    summary.setCell('A1', `${heading}${period[1]}年（${period[2]}）月专利申请费用账单汇总`)
  }
  if (customers.length > 1) summary.setCell('B5', '多客户待核对')
  else if (customers[0] && customers[0] !== '美的小家电事业部') summary.setCell('B5', customers[0])
  const rates = book.sheet('汇率截图')
  rates.removeDrawings()
  rates.setCell('A1', '本次导出汇率')
  rates.setCell('A2', input.rateDate)
  rates.setCell('A3', input.rateSourceUrl ?? '')
  const currencies = uniqueText(events.flatMap(event =>
    [...event.official, ...event.agent, ...event.translation, ...event.internalAgent].map(row => normalizeCurrency(row.currency))
  ))
  for (const [index, currency] of currencies.entries()) {
    const row = index + 5
    rates.setCell(`A${row}`, currency)
    rates.setCell(`B${row}`, rateOf(currency, input.rates))
  }
  if (warnings.length) rates.setCell(`A${6 + currencies.length}`, '导出待核对事项')
  for (const [index, warning] of warnings.entries()) rates.setCell(`A${7 + currencies.length + index}`, warning)
  rates.refreshDimension()
  return events.length
}

// ---------------------------------------------------------------- 美的 PCT 费用清单

const PCT_TEMPLATE_SHEET = 'PCT费用明细'

function fillMideaPct(book: XlsxBook, input: BillingInput, warnings: string[]): number {
  const sheet = book.sheet(PCT_TEMPLATE_SHEET)
  const summary = book.sheet('账单汇总')
  const customer = input.rows[0].customerName.trim()
  const dates = input.rows.map(row => excelSerial(row.finishDate))
  const knownDates = dates.filter(date => date !== null).sort((a, b) => a - b)
  const toDateText = (serial: number) => new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10)
  const first = knownDates[0]
  const last = knownDates.at(-1)
  const period = first === undefined || last === undefined ? '事项完成日待核对'
    : `事项完成日 ${toDateText(first)}${first === last ? '' : ` 至 ${toDateText(last)}`}${knownDates.length < dates.length ? '（部分缺失）' : ''}`
  if (knownDates.length < dates.length) warnings.push(`${dates.length - knownDates.length} 笔费用缺少有效的处理事项完成日，请核对账期。`)
  summary.setCell('A1', `${customer} PCT 费用账单汇总 · ${period}`)
  summary.setCell('B6', customer)
  const applicants = uniqueText(input.rows.map(row => row.applicant))
  if (applicants.length > 1) warnings.push(`本批费用涉及 ${applicants.length} 个申请人，请按实际开票主体核对。`)
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
      else apply += amount
    }
    const agent = round2(group.agent.reduce((total, fee) => total + cnyAmount(fee, input.rates), 0))
    const field = (label: string, values: string[]) => {
      const usable = uniqueText(values)
      if (usable.length !== 1) warnings.push(`${group.caseVolume} 的${label}${usable.length ? '存在多个值' : '缺失'}，已留空。`)
      return usable.length === 1 ? usable[0] : null
    }
    const appDates = [...new Set(group.rows.map(fee => excelSerial(fee.appDate)).filter(date => date !== null))]
    if (appDates.length !== 1) warnings.push(`${group.caseVolume} 的申请日${appDates.length ? '存在多个值' : '缺失'}，已留空。`)
    const cells: Record<string, string | number | null> = {
      A: index + 1, B: field('客户案号', group.rows.map(fee => fee.caseVolumeCustomer)), C: group.caseVolume,
      D: field('案件名称', group.rows.map(fee => fee.caseName)),
      E: field('申请类型', group.rows.map(fee => fee.applyType.trim().replace(/专利$/, ''))),
      F: group.ctrlProc || null, G: field('申请号', group.rows.map(fee => fee.appNo)),
      H: appDates.length === 1 ? appDates[0] : null, I: apply ? round2(apply) : null, J: search ? round2(search) : null,
      K: extra ? round2(extra) : null, L: agent || null, N: null
    }
    for (const [col, value] of Object.entries(cells)) sheet.setCell(`${col}${row}`, value)
  })
  // 模板的页脚日期在第 14 行，明细原占 2 行。
  sheet.setCell(`K${12 + cases.length}`, excelSerial(input.today ?? new Date()))
  return cases.length
}

// ---------------------------------------------------------------- 入口

export async function fillBillingTemplate(id: BillingTemplateId, template: Uint8Array, input: BillingInput): Promise<BillingResult> {
  if (!input.rows.length) throw new Error('还没有选中的费用记录。')
  if (id === 'midea-pct') {
    const problem = pctSelectionProblem(input.rows)
    if (problem) throw new Error(problem)
  }
  if (id === 'midea-foreign' && [input.options.reviewFee, input.options.bankFee].some(fee => !Number.isFinite(fee) || fee < 0)) {
    throw new Error('审核费和银行费须填写为大于或等于 0 的金额。')
  }
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
    : [book.sheet(id === 'general-foreign' ? (book.sheets[0]?.name ?? '') : PCT_TEMPLATE_SHEET)]
  const headers = id === 'midea-pct' ? {
    ...defaultHeaders(id, today),
    ...input.headers,
    title: input.headers.title?.trim() || '世纪恒程知识产权代理事务所 · 美的 PCT 费用清单',
    client: input.headers.client?.trim().replace(/^客户名称\s*[：:]\s*/, '') || input.rows[0].customerName.trim()
  } : input.headers
  if (id === 'midea-pct') headers.client = `客户名称：${headers.client}`
  applyHeaders(headerSheets, info, headers)
  const unknownCurrency = uniqueText(input.rows.map(row => normalizeCurrency(row.currency))).filter(code => code.length !== 3)
  if (unknownCurrency.length) warnings.push(`币别「${unknownCurrency.join('、')}」不是标准代码，请核对汇率。`)
  const bytes = await book.save()
  return { bytes, fileName: `${info.fileBase}-${stamp(today)}.xlsx`, warnings, blockCount }
}
