import type { PatentFile } from '../api/file-search-types'
import type { SelectedPatentFile } from './types'

export interface BillRecognitionResult {
  isBill: boolean
  billNo?: string
  caseNo?: string
  matter?: string
  date?: string
  versionSuffix?: string
  ext?: string
  confidence?: 'high' | 'medium' | 'low'
  recognitionRule?: string
  reason?: string
}

/** 校验公历年月日有效性（包括大小月与平闰年 2 月） */
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1970 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return false
  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const maxDays = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= maxDays[month - 1]
}

/** 已知的账单/发票前缀（避免在无案号提示时被通用正则误判为案号） */
const BILL_PREFIX_PATTERN = /^(?:INVSG|INV|BILL|CREDIT|MEMO|RECEIPT|PAY|FEE)\w*$/i

/**
 * 转义用于正则匹配的特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 解析文件名是否符合账单命名规则：
 * 标准四段式：【账单号】+【我方案号】+【事项】+【账单日期】
 * 变异容错：
 * 1. 兼容日期后带有版本/修饰符（如 `（更新）`、`(更新)`、`(1)`、`(2)`、`_v2` 等）
 * 2. 兼容日期间隔符（如 `2026-11-10`、`2026.11.10` 或 `20261110`）
 * 3. 严格验证日历日期有效性（排除 20260231 等非法日期）
 * 4. 兼容不间断空格（\u00A0）等特殊空白符
 * 5. 优先级候选定位我方案号（提示 > PA标准案号 > 保守通用案号，彻底解决 INVSG... 等前缀账单号误判为案号）
 * 6. 兼容案号前置变体（若缺少账单号，但事项中明确包含“账单”或“退款/Credit Memo”且带日期，亦予识别；通知书等其他文件坚决排除）
 *
 * @param fileName 文件名（含扩展名）
 * @param caseVolumeHint 可选的我方案号提示（例如行中的 caseVolume）
 */
export function parseBillFileName(fileName: string, caseVolumeHint?: string): BillRecognitionResult {
  const rawTrimmed = (fileName || '').replace(/[\u00A0\u3000]/g, ' ').trim()
  const dotIndex = rawTrimmed.lastIndexOf('.')
  if (dotIndex <= 0) {
    return { isBill: false, reason: '缺少文件扩展名' }
  }

  const ext = rawTrimmed.slice(dotIndex + 1).toLowerCase()
  let baseName = rawTrimmed.slice(0, dotIndex).trim()

  // 1. 识别并提取可选的末尾版本修饰符（如 （更新）、(更新)、(1)、(2)、_v2、- 副本 等）
  let versionSuffix = ''
  const versionMatch = baseName.match(/[\s_-]*(?:[(（][^()（）]+[)）]|[-_](?:v\d+|副本|更新|改))$/i)
  if (versionMatch) {
    versionSuffix = versionMatch[0].trim()
    baseName = baseName.slice(0, baseName.length - versionMatch[0].length).trim()
  }

  // 2. 检查结尾是否为日期（支持 8 位纯数字 YYYYMMDD，或 YYYY-MM-DD / YYYY.MM.DD）
  const dateMatch = baseName.match(/[\s_-]?((?:19|20)\d{2})[-.]?(0[1-9]|1[0-2])[-.]?(0[1-9]|[12]\d|3[01])$/)
  if (!dateMatch) {
    return { isBill: false, reason: '文件名末尾未找到合法的账单日期' }
  }

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  if (!isValidCalendarDate(year, month, day)) {
    return { isBill: false, reason: `日历日期无效（${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}）` }
  }

  const dateStr = `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}`
  const beforeDate = baseName.slice(0, baseName.length - dateMatch[0].length).trim()

  // 3. 定位我方案号（按优先级提取）
  let caseNo = ''
  let caseIndex = -1
  let caseLength = 0
  let confidence: 'high' | 'medium' | 'low' = 'low'
  let recognitionRule = ''

  // 优先级 1：明确且有效的 caseVolumeHint
  const rawHint = (caseVolumeHint || '').replace(/[\u00A0\u3000]/g, ' ').trim()
  const cleanHint = rawHint.replace(/[-_\s]+$/, '')
  // 必须满足基本案号长度要求（至少 4 字符），避免像 "25"、"CN" 等极短片段在其他编号或文字中造成局部误切
  if (cleanHint && cleanHint.length >= 4) {
    // 严格按 token 边界或分隔符匹配
    const hintRegex = new RegExp(`(?:^|[\\s_-])(${escapeRegex(cleanHint)})(-?)(?=[\\s_\\u4e00-\\u9fa5]|$)`, 'i')
    const match = beforeDate.match(hintRegex)
    if (match && match.index !== undefined) {
      // match[0] 可能包含前导分隔符
      const offset = match[0].indexOf(match[1])
      caseIndex = match.index + offset
      caseNo = match[1]
      caseLength = match[1].length + (match[2] ? match[2].length : 0)
      confidence = 'high'
      recognitionRule = 'case_volume_hint'
    }
  }

  // 优先级 2：符合专利业务命名规则的标准 PA 案号模式（如 PA2511528CN-ID）
  if (caseIndex === -1) {
    // PA 开头，接 4 位以上数字，后续接字母、数字、连接符等后缀
    const paRegex = /(?:^|[\s_-])(PA\d{4,}[\w-]*)/i
    const paMatch = beforeDate.match(paRegex)
    if (paMatch && paMatch.index !== undefined) {
      const offset = paMatch[0].indexOf(paMatch[1])
      caseIndex = paMatch.index + offset
      caseNo = paMatch[1]
      caseLength = caseNo.length
      // 兼容文件名在我方案号后带有尾随连接符（如 PA2631884CN-US- ）
      if (beforeDate[caseIndex + caseLength] === '-') {
        caseLength++
      }
      confidence = 'high'
      recognitionRule = 'pa_standard_pattern'
    }
  }

  // 优先级 3：保守兼容其他案号格式（排除已知的账单号/发票前缀如 INVSG、BILL 等）
  if (caseIndex === -1) {
    const genericRegex = /(?:^|[\s_-])([A-Z]{2,}\d+[\w-]*)/g
    let m: RegExpExecArray | null
    while ((m = genericRegex.exec(beforeDate)) !== null) {
      const candidate = m[1]
      // 排除已知账单前缀
      if (BILL_PREFIX_PATTERN.test(candidate)) continue
      const offset = m[0].indexOf(candidate)
      caseIndex = m.index + offset
      caseNo = candidate
      caseLength = candidate.length
      if (beforeDate[caseIndex + caseLength] === '-') {
        caseLength++
      }
      confidence = 'medium'
      recognitionRule = 'generic_pattern'
      break
    }
  }

  if (caseIndex === -1) {
    return { isBill: false, reason: '未找到我方案号' }
  }

  // 4. 提取账单号（我方案号前面部分）与事项（我方案号与日期之间部分）
  const billNoPart = beforeDate.slice(0, caseIndex).trim()
  const matterPart = beforeDate.slice(caseIndex + caseLength).trim()

  if (!matterPart) {
    return { isBill: false, reason: '我方案号与日期之间缺少业务事项' }
  }

  // 5. 账单合法性判定：
  // 标准四段式：案号前面有明确账单号
  if (billNoPart) {
    return {
      isBill: true,
      billNo: billNoPart,
      caseNo,
      matter: matterPart,
      date: dateStr,
      versionSuffix,
      ext,
      confidence,
      recognitionRule
    }
  }

  // 变异情况：案号开头（前面没有账单号）
  // 必须满足事项中明确包含“账单”或“退款/Credit Memo”关键词，避免误把“通知书”等非账单当成账单
  if (/(?:账单|退款|Credit\s*Memo)/i.test(matterPart)) {
    return {
      isBill: true,
      billNo: '',
      caseNo,
      matter: matterPart,
      date: dateStr,
      versionSuffix,
      ext,
      confidence,
      recognitionRule: `${recognitionRule}+keyword_matter`
    }
  }

  return { isBill: false, reason: '我方案号前缺少账单号且事项中未标注为账单' }
}

/**
 * 判断一个专利文件记录是否为账单文件
 */
export function isBillPatentFile(file: PatentFile | SelectedPatentFile): boolean {
  if (!file) return false
  const fileName = 'fileName' in file ? file.fileName : ''
  const caseVolume = 'caseVolume' in file ? file.caseVolume : undefined
  return parseBillFileName(fileName, caseVolume).isBill
}
