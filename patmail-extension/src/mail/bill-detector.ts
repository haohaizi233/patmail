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
  reason?: string
}

/**
 * 解析文件名是否符合账单命名规则：
 * 标准四段式：【账单号】+【我方案号】+【事项】+【账单日期】
 * 变异容错：
 * 1. 兼容日期后带有版本/修饰符（如 `（更新）`、`(更新)`、`(1)`、`(2)`、`_v2` 等）
 * 2. 兼容日期间隔符（如 `2026-11-10`、`2026.11.10` 或 `20261110`）
 * 3. 兼容不间断空格（\u00A0）等特殊空白符
 * 4. 兼容案号前置变体（若缺少账单号，但事项中明确包含“账单”或“退款/Credit Memo”且带日期，亦予识别；通知书等其他文件坚决排除）
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

  const dateStr = `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}`
  const beforeDate = baseName.slice(0, baseName.length - dateMatch[0].length).trim()

  // 3. 定位我方案号
  let caseNo = ''
  let caseIndex = -1
  let caseLength = 0

  const hint = (caseVolumeHint || '').replace(/[\u00A0\u3000]/g, ' ').trim()
  if (hint) {
    // 兼容我方案号末尾可能带有连接符或空白的情况，如 PA2631884CN-US-
    const cleanHint = hint.replace(/[-_\s]+$/, '')
    const idx = beforeDate.indexOf(cleanHint)
    if (idx !== -1) {
      caseNo = cleanHint
      caseIndex = idx
      caseLength = cleanHint.length
      // 兼容文件名在我方案号后带有尾随连接符（如 PA2631884CN-US- ）
      if (beforeDate[caseIndex + caseLength] === '-') {
        caseLength++
      }
    }
  }

  // 若无传入的 caseVolumeHint 或未在文件名中匹配到，尝试使用通用专利案号正则提取（如 PA...）
  if (caseIndex === -1) {
    const genericMatch = beforeDate.match(/(?:[A-Z]{2,}\d+[\w-]*)/)
    if (genericMatch && genericMatch.index !== undefined) {
      caseNo = genericMatch[0]
      caseIndex = genericMatch.index
      caseLength = caseNo.length
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
      ext
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
      ext
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
