import type { PatentFile } from '../api/file-search-types'
import type { SelectedPatentFile } from './types'

export interface BillRecognitionResult {
  isBill: boolean
  billNo?: string
  caseNo?: string
  matter?: string
  date?: string
  ext?: string
  reason?: string
}

/**
 * 解析文件名是否符合账单四段式命名规则：
 * 【账单号】+【我方案号】+【事项】+【账单日期】
 *
 * @param fileName 文件名（含扩展名）
 * @param caseVolumeHint 可选的我方案号提示（例如行中的 caseVolume）
 */
export function parseBillFileName(fileName: string, caseVolumeHint?: string): BillRecognitionResult {
  const trimmed = (fileName || '').trim()
  const dotIndex = trimmed.lastIndexOf('.')
  if (dotIndex <= 0) {
    return { isBill: false, reason: '缺少文件扩展名' }
  }

  const ext = trimmed.slice(dotIndex + 1).toLowerCase()
  const baseName = trimmed.slice(0, dotIndex).trim()

  // 1. 检查结尾是否为日期（8位数字 YYYYMMDD，如 20261110，兼容前缀空格、下划线或连字符）
  const dateMatch = baseName.match(/[\s_-]?(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/)
  if (!dateMatch) {
    return { isBill: false, reason: '文件名末尾未找到合法的8位账单日期' }
  }

  const dateStr = dateMatch[0].trim().replace(/^[\s_-]/, '')
  const beforeDate = baseName.slice(0, baseName.length - dateMatch[0].length).trim()

  // 2. 定位我方案号
  let caseNo = ''
  let caseIndex = -1
  let caseLength = 0

  const hint = (caseVolumeHint || '').trim()
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

  // 3. 检查账单号（我方案号前面必须有非空的账单号）
  const billNoPart = beforeDate.slice(0, caseIndex).trim()
  if (!billNoPart) {
    return { isBill: false, reason: '我方案号前缺少账单号' }
  }

  // 4. 检查事项（我方案号与日期之间必须有非空业务事项）
  const matterPart = beforeDate.slice(caseIndex + caseLength).trim()
  if (!matterPart) {
    return { isBill: false, reason: '我方案号与日期之间缺少业务事项' }
  }

  return {
    isBill: true,
    billNo: billNoPart,
    caseNo,
    matter: matterPart,
    date: dateStr,
    ext
  }
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
