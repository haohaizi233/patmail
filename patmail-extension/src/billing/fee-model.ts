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

export function isForeignAgentFee(row: FeeSearchRow): boolean {
  if (isInternalAgentFee(row) || row.feeClass === 'O') return false
  return /代理|律师|服务费|外所|答辩|代办/.test(row.feeType)
}

export function isAgentFee(row: FeeSearchRow): boolean {
  return isInternalAgentFee(row) || isForeignAgentFee(row)
}

export type OfficialKind = 'new' | 'annual' | 'validation' | 'ids' | 'rce' | 'grant' | 'pctApply' | 'pctSearch' | 'pctExtra' | 'other'

function classifyOfficialText(text: string, mode: 'foreign' | 'pct'): OfficialKind | null {
  const clean = text.trim()
  if (!clean) return null
  if (mode === 'pct') {
    if (/检索费/.test(clean)) return 'pctSearch'
    if (/附加费|超页|超项|滞纳/.test(clean)) return 'pctExtra'
    if (/国际申请费|PCT.*申请费|新申请|申请费/i.test(clean)) return 'pctApply'
    return null
  }
  if (/IDS/i.test(clean)) return 'ids'
  if (/RCE/i.test(clean)) return 'rce'
  if (/年费|维持/.test(clean)) return 'annual'
  if (/授权|办登|登记|发证/.test(clean)) return 'grant'
  if (/新申请|申请费|filing/i.test(clean)) return 'new'
  if (/生效|进入.*国家|国家阶段|validation/i.test(clean)) return 'validation'
  return null
}

/** 优先按费用名称判定官费类别，未命中时再回退处理事项，避免处理事项抢占费用名称。 */
export function officialKind(row: FeeSearchRow, mode: 'foreign' | 'pct' = 'foreign'): OfficialKind {
  return classifyOfficialText(row.feeType, mode) ?? classifyOfficialText(row.ctrlProc, mode) ?? 'other'
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
  ctrlProc: string
  finishDate: string
  currency: string
  official: FeeSearchRow[]
  /** 外所代理费（涉外模板）或全部代理费（PCT 模板）。 */
  agent: FeeSearchRow[]
  /** 内所代理费（feeClass = 'A'），避免在涉外模板里错按外币汇率折算。 */
  internalAgent: FeeSearchRow[]
}

/** 按「案件 + 处理事项 + 币种」归并：官费和外所代理费落在同一个事项块里；内所代理费单列。 */
export function groupFeeEvents(rows: FeeSearchRow[]): EventGroup[] {
  const groups = new Map<string, EventGroup>()
  for (const row of rows) {
    const currency = normalizeCurrency(row.currency)
    const key = `${row.caseVolume}\u0001${row.ctrlProc}\u0001${currency}`
    let group = groups.get(key)
    if (!group) {
      group = {
        caseVolume: row.caseVolume, customerVolume: row.caseVolumeCustomer, caseName: row.caseName,
        applicant: row.applicant, appNo: row.appNo, appDate: row.appDate, applyType: row.applyType,
        ctrlProc: row.ctrlProc, finishDate: row.finishDate, currency, official: [], agent: [], internalAgent: []
      }
      groups.set(key, group)
    }
    if (!group.finishDate && row.finishDate) group.finishDate = row.finishDate
    if (!group.applicant && row.applicant) group.applicant = row.applicant
    if (isInternalAgentFee(row)) group.internalAgent.push(row)
    else if (isForeignAgentFee(row)) group.agent.push(row)
    else group.official.push(row)
  }
  return [...groups.values()]
}

/** 同一案件的多个事项合成一行（PCT 请款表一案一行：官费 + 我方代理费）。 */
export function groupFeeCases(rows: FeeSearchRow[]): Array<EventGroup & { rows: FeeSearchRow[] }> {
  const groups = new Map<string, EventGroup & { rows: FeeSearchRow[] }>()
  for (const row of rows) {
    const currency = normalizeCurrency(row.currency)
    let group = groups.get(row.caseVolume)
    if (!group) {
      group = {
        caseVolume: row.caseVolume, customerVolume: row.caseVolumeCustomer, caseName: row.caseName,
        applicant: row.applicant, appNo: row.appNo, appDate: row.appDate, applyType: row.applyType,
        ctrlProc: row.ctrlProc, finishDate: row.finishDate, currency, official: [], agent: [], internalAgent: [], rows: []
      }
      groups.set(row.caseVolume, group)
    }
    group.rows.push(row)
    if (isAgentFee(row)) group.agent.push(row)
    else group.official.push(row)
  }
  return [...groups.values()]
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
  return uniqueText(rows.map(row => normalizeCurrency(row.currency))).filter(code => rateOf(code, rates) === null)
}
