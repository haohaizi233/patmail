import type { FeeSearchRow } from '../api/fee-search-types'
import { parseBillFileName } from '../mail/bill-detector'
import { normalizeCurrency } from './pbc-rates'

/** 文件管理里「只选账单」得到的账单信息（缓存，填表时取海外账单日）。 */
export interface BillInfo {
  fileName: string
  caseVolume: string
  billNo: string
  matter: string
  /** yyyy-mm-dd */
  date: string
  versionSuffix: string
}

export function billInfoFromFile(file: { fileName: string; caseVolume?: string }): BillInfo | null {
  const parsed = parseBillFileName(file.fileName, file.caseVolume)
  if (!parsed.isBill) return null
  const date = formatBillDate(parsed.date)
  return {
    fileName: file.fileName,
    caseVolume: file.caseVolume?.trim() || parsed.caseNo || '',
    billNo: parsed.billNo ?? '',
    matter: parsed.matter ?? '',
    date,
    versionSuffix: parsed.versionSuffix ?? ''
  }
}

function formatBillDate(raw: string | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length !== 8) return ''
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

/** 同一我方文号下取最新的账单日期。 */
export function latestBillDate(bills: BillInfo[] | undefined): string {
  return (bills ?? []).map(item => item.date).filter(Boolean).sort().at(-1) ?? ''
}

export function matchedBillDate(group: EventGroup, bills: BillInfo[] | undefined): string {
  const recordedDates = uniqueText([...group.agent, ...group.official, ...group.translation.filter(row => row.feeClass === 'T')].map(row =>
    typeof row.raw.out_bill_date === 'string' ? row.raw.out_bill_date.trim().slice(0, 10).replaceAll('/', '-') : ''
  )).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
  if (recordedDates.length) return recordedDates.length === 1 ? recordedDates[0] : ''
  const normalize = (value: string) => value.trim().toUpperCase()
  const identifiers = uniqueText(
    [...group.official, ...group.agent, ...group.internalAgent, ...group.translation]
      .map(row => row.billNo || row.invoiceNo)
  ).map(normalize)
  const candidates = bills ?? []
  const byNumber = candidates.filter(bill => identifiers.includes(normalize(bill.billNo)))
  const matter = normalize(group.ctrlProc)
  const byMatter = candidates.filter(bill => matter && normalize(bill.matter) === matter)
  const matches = identifiers.length ? byNumber : byMatter.length ? byMatter : candidates
  if (identifiers.length && !identifiers.every(id => byNumber.some(bill => normalize(bill.billNo) === id))) return ''
  const dates = new Set(matches.map(bill => bill.date))
  return dates.size === 1 ? matches[0]?.date ?? '' : ''
}

export function isUnrequestedFee(row: FeeSearchRow): boolean {
  return !row.requestNo.trim() && /^(?:0|未请款)$/.test(row.requestStatus.trim())
}

export function uniqueCaseVolumes(files: Array<{ caseVolume?: string }>): string[] {
  const seen = new Set<string>()
  for (const file of files) {
    const value = file.caseVolume?.trim()
    if (value) seen.add(value)
  }
  return [...seen]
}

const COUNTRY_BY_SUFFIX: Record<string, string> = {
  EP: '欧洲专利局', US: '美国', JP: '日本', KR: '韩国', DE: '德国', FR: '法国', GB: '英国', IN: '印度', CA: '加拿大',
  AU: '澳大利亚', RU: '俄罗斯', BR: '巴西', SG: '新加坡', HK: '中国香港', TW: '中国台湾', ID: '印度尼西亚',
  MY: '马来西亚', TH: '泰国', VN: '越南', MX: '墨西哥', IT: '意大利', ES: '西班牙', CH: '瑞士', TR: '土耳其',
  SA: '沙特阿拉伯', ZA: '南非', IL: '以色列', NZ: '新西兰', PL: '波兰', NL: '荷兰', SE: '瑞典', AE: '阿联酋'
}

/** 我方文号尾巴（-EP、-US…）对应的申请国家/地区；认不出来就原样返回尾巴。 */
export function countryOfCase(caseVolume: string): string {
  const suffix = /-([A-Za-z]{2,4})$/.exec(caseVolume.trim())?.[1]?.toUpperCase() ?? ''
  if (!suffix) return ''
  return COUNTRY_BY_SUFFIX[suffix] ?? suffix
}

export function isInternalAgentFee(row: FeeSearchRow): boolean {
  return row.feeClass === 'A' || /内所代理|我方代理/.test(row.feeType)
}

export function isTranslationFee(row: FeeSearchRow): boolean {
  return /翻译|译文|校对|translate|translation/i.test(row.feeType) ||
    (row.feeClass !== 'O' && !row.feeType.trim() && /翻译|译文/i.test(row.ctrlProc)) ||
    wordBasedTranslation(row) !== null
}

/** EASY 中有些合作所代理费实际是按千字收费的翻译。仅认可金额可核对的明确人民币算式。 */
export function wordBasedTranslation(row: FeeSearchRow): { words: number; pricePerThousand: number } | null {
  const description = row.raw.fee_desc
  if (row.feeClass === 'O' || normalizeCurrency(row.currency) !== 'CNY' || typeof description !== 'string') return null
  const match = /^([\d,]+)\s*(?:字|词)\s*[*×xX]\s*([\d,.]+)\s*元\s*[/／]\s*千(?:字|词)\s*[=＝]\s*([\d,.]+)\s*元$/.exec(description.trim())
  if (!match) return null
  const [words, pricePerThousand, amount] = match.slice(1).map(value => Number(value.replaceAll(',', '')))
  if (!Number.isSafeInteger(words) || words <= 0 || pricePerThousand <= 0 ||
      amount !== row.amount || round2(words * pricePerThousand / 1000) !== amount) return null
  return { words, pricePerThousand }
}

export function isPctCase(row: FeeSearchRow): boolean {
  return /(?:PCT|-WO)$/i.test(row.caseVolume) || /PCT\s*(?:国际阶段|国际申请)|国际阶段/.test(row.businessType)
}

export function feeMatterKey(row: Pick<FeeSearchRow, 'caseVolume' | 'procId' | 'ctrlProc'>): string {
  return JSON.stringify([row.caseVolume, row.procId.trim() || row.ctrlProc.trim()])
}

export function translationWordCount(row: FeeSearchRow): number | null {
  const value = row.raw.word_count
  const text = typeof value === 'number' || typeof value === 'string' ? String(value).trim() : ''
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return wordBasedTranslation(row)?.words ?? null
  const count = Number(text.replace(/,/g, ''))
  return Number.isSafeInteger(count) && count > 0 ? count : null
}

export function isForeignAgentFee(row: FeeSearchRow): boolean {
  if (isInternalAgentFee(row) || isTranslationFee(row) || row.feeClass === 'O') return false
  return /代理|律师|服务费|外所|答辩|代办/i.test(row.feeType)
}

export function isAgentFee(row: FeeSearchRow): boolean {
  return isInternalAgentFee(row) || isForeignAgentFee(row)
}

export type OfficialKind = 'new' | 'annual' | 'validation' | 'ids' | 'rce' | 'grant' | 'pctApply' | 'pctSearch' | 'pctExtra' | 'other'

function classifyOfficialText(text: string, mode: 'foreign' | 'pct'): OfficialKind | null {
  const clean = text.trim()
  if (!clean) return null
  if (mode === 'pct') {
    if (/国家阶段|年费|维持|授权|办登/.test(clean)) return null
    if (/检索费/.test(clean)) return 'pctSearch'
    if (/附加费|超页|超项/.test(clean)) return 'pctExtra'
    if (/国际申请费|PCT.*申请费|^(?:新)?申请费$/i.test(clean)) return 'pctApply'
    return null
  }
  // 优先匹配更具体的特征词，避免「国家阶段申请费」先命中「申请费」
  if (/IDS/i.test(clean)) return 'ids'
  if (/RCE/i.test(clean)) return 'rce'
  if (/年费|维持/.test(clean)) return 'annual'
  if (/授权|办登|登记|发证/.test(clean)) return 'grant'
  if (/生效|进入.*国家|国家阶段|validation/i.test(clean)) return 'validation'
  if (/新申请|申请费|filing/i.test(clean)) return 'new'
  return null
}

/** 优先按费用名称判定官费类别，未命中时再回退处理事项，避免处理事项抢占费用名称。 */
export function officialKind(row: FeeSearchRow, mode: 'foreign' | 'pct' = 'foreign'): OfficialKind {
  if (mode === 'pct') return classifyOfficialText(row.feeType, mode) ?? 'other'
  return classifyOfficialText(row.feeType, mode) ?? classifyOfficialText(row.ctrlProc, mode) ?? 'other'
}

export function pctFeeProblem(row: FeeSearchRow): string {
  if (!row.caseVolume.trim() || !isPctCase(row)) return '无法确认是 PCT 国际阶段案卷'
  if (isTranslationFee(row)) return 'PCT 模板没有翻译费列'
  if (row.feeClass !== 'A' && (row.feeClass !== 'O' || officialKind(row, 'pct') === 'other')) {
    return row.feeClass === 'O' ? '模板没有对应的 PCT 官费列' : '不属于 PCT 官费或我方代理费'
  }
  if (!row.feeId.trim() || !Number.isFinite(row.amount) || !row.currency.trim()) return '费用编号、金额或币别缺失或无效'
  return ''
}

export function isMideaPctCustomer(name: string): boolean {
  return name.trim().includes('美的')
}

export function pctSelectionProblem(
  rows: FeeSearchRow[],
  options: { allowMultipleCustomers?: boolean } = {}
): string {
  const customers = uniqueText(rows.map(row => row.customerName))
  const feeIds = new Set<string>()
  const caseIds = new Map<string, string>()
  for (const row of rows) {
    const problem = pctFeeProblem(row)
    if (problem) return `${row.caseVolume}「${row.feeType || row.feeId}」：${problem}。`
    if (!row.customerName.trim()) return `${row.caseVolume} 的 EASY 客户名称缺失，请核对原站。`
    if (!isMideaPctCustomer(row.customerName)) return `${row.caseVolume} 属于「${row.customerName}」，请只选择美的客户的费用。`
    const feeId = row.feeId.trim()
    if (feeIds.has(feeId)) return `费用「${feeId}」重复，请核对勾选范围。`
    feeIds.add(feeId)
    const volume = row.caseVolume.trim()
    const id = row.caseId.trim().toLowerCase()
    if (!id) continue
    const previous = caseIds.get(volume)
    if (previous && previous !== id) return `${volume} 对应多个 EASY 案件，请核对后再导出。`
    caseIds.set(volume, id)
  }
  return !options.allowMultipleCustomers && customers.length > 1
    ? 'PCT 请款单每次只能导出同一客户的费用，请按事业部分别导出。'
    : ''
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function patentTypeLabel(applyType: string): string {
  const text = applyType.trim().replace(/专利$/, '')
  return text || '发明'
}

export interface EventGroup {
  caseVolume: string
  customerVolume: string
  caseName: string
  applicant: string
  appNo: string
  appDate: string
  applyType: string
  procId: string
  ctrlProc: string
  finishDate: string
  currency: string
  official: FeeSearchRow[]
  /** 外所代理费（涉外模板）或全部代理费（PCT 模板）。 */
  agent: FeeSearchRow[]
  /** 内所代理费（feeClass = 'A'），避免在涉外模板里错按外币汇率折算。 */
  internalAgent: FeeSearchRow[]
  /** 翻译费（通用模板 T 列，美的模板 Y 列），避免误入官费计税。 */
  translation: FeeSearchRow[]
}

/** 按「案件 + 处理事项 + 币种」归并：官费、外所代理费和翻译费落在同一个事项块里；内所代理费单列。优先使用 procId 识别唯一业务事项。 */
export function groupFeeEvents(rows: FeeSearchRow[], matterKey: (row: FeeSearchRow) => string = feeMatterKey): EventGroup[] {
  const groups = new Map<string, EventGroup>()
  for (const row of sortFeeRows(rows)) {
    const currency = normalizeCurrency(row.currency)
    const key = `${matterKey(row)}\u0001${currency}`
    let group = groups.get(key)
    if (!group) {
      group = {
        caseVolume: row.caseVolume, customerVolume: row.caseVolumeCustomer, caseName: row.caseName,
        applicant: row.applicant, appNo: row.appNo, appDate: row.appDate, applyType: row.applyType,
        procId: row.procId || '', ctrlProc: row.ctrlProc, finishDate: row.finishDate, currency,
        official: [], agent: [], internalAgent: [], translation: []
      }
      groups.set(key, group)
    }
    if (!group.finishDate && row.finishDate) group.finishDate = row.finishDate
    if (!group.applicant && row.applicant) group.applicant = row.applicant
    if (isInternalAgentFee(row)) group.internalAgent.push(row)
    else if (isTranslationFee(row)) group.translation.push(row)
    else if (isForeignAgentFee(row)) group.agent.push(row)
    else group.official.push(row)
  }
  return [...groups.values()]
}

/** 同一案件的多个事项合成一行（PCT 请款表一案一行：官费 + 我方代理费）。汇总该案件所有处理事项名称。 */
export function groupFeeCases(rows: FeeSearchRow[]): Array<EventGroup & { rows: FeeSearchRow[] }> {
  const groups = new Map<string, EventGroup & { rows: FeeSearchRow[] }>()
  for (const row of sortFeeRows(rows)) {
    const currency = normalizeCurrency(row.currency)
    const caseVolume = row.caseVolume.trim()
    let group = groups.get(caseVolume)
    if (!group) {
      group = {
        caseVolume, customerVolume: row.caseVolumeCustomer, caseName: row.caseName,
        applicant: row.applicant, appNo: row.appNo, appDate: row.appDate, applyType: row.applyType,
        procId: row.procId || '', ctrlProc: row.ctrlProc, finishDate: row.finishDate, currency,
        official: [], agent: [], internalAgent: [], translation: [], rows: []
      }
      groups.set(caseVolume, group)
    }
    group.rows.push(row)
    if (row.feeClass === 'A') group.agent.push(row)
    else if (isTranslationFee(row)) group.translation.push(row)
    else group.official.push(row)
  }
  // 综合案件下的全部事项名称，避免多事项被首行覆盖
  for (const group of groups.values()) {
    const procs = uniqueText(group.rows.map(r => r.ctrlProc))
    if (procs.length > 0) {
      group.ctrlProc = procs.join('；')
    }
  }
  return [...groups.values()]
}

export function sortFeeRows(rows: FeeSearchRow[]): FeeSearchRow[] {
  return [...rows].sort((a, b) => {
    if (a.sn !== undefined && b.sn !== undefined && a.sn !== b.sn) {
      return a.sn - b.sn
    }
    const caseCmp = (a.caseVolume || '').localeCompare(b.caseVolume || '')
    if (caseCmp !== 0) return caseCmp
    return (a.feeId || '').localeCompare(b.feeId || '')
  })
}

export function sumAmount(rows: FeeSearchRow[]): number {
  return round2(rows.reduce((total, row) => total + (Number.isFinite(row.amount) ? row.amount : 0), 0))
}

export function uniqueText(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))]
}

/** 汇率表：币种 → 1 单位折合人民币；CNY 固定 1。缺币种返回 null。 */
export function rateOf(currency: string, rates: Record<string, number>): number | null {
  const code = normalizeCurrency(currency)
  if (code === 'CNY') return 1
  const value = rates[code]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function missingCurrencies(rows: FeeSearchRow[], rates: Record<string, number>): string[] {
  const missing = new Set<string>()
  for (const row of rows) {
    const trimmed = (row.currency ?? '').trim()
    if (!trimmed) {
      missing.add(`未填写币别(文号:${row.caseVolume || row.feeId})`)
      continue
    }
    const code = normalizeCurrency(trimmed)
    if (rateOf(code, rates) === null) {
      missing.add(code)
    }
  }
  return [...missing]
}

export const BILLING_SNAPSHOT_RAW_FIELDS = [
  'word_count',
  'fee_desc',
  'out_bill_date',
  'agency_name_cn',
  'country',
  'law_fee_date',
] as const

/** 规范化单条费用行：仅保留填表与请款查重所需的原始字段，保证首导与草稿恢复指纹一致。 */
export function cleanFeeRowForSnapshot(row: FeeSearchRow): FeeSearchRow {
  const raw = Object.fromEntries(
    BILLING_SNAPSHOT_RAW_FIELDS.flatMap(key => {
      const value = row.raw[key]
      return typeof value === 'string' || typeof value === 'number' ? [[key, value]] : []
    }),
  )
  return { ...row, raw }
}
