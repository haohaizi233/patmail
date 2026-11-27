import type { FeeReduceReviewerOption, FeeReduceReviewerStrategy } from '../api/fee-reduce-types'

const OFFICE_VOLUME_HEADER = /我方文号|^case[_\s-]*volume$/i
const VOLUME_HEADER = /^(?:案号|文号)$/

/**
 * 解析粘贴的我方文号文本（支持换行、中英文分号、中英文逗号、空白分隔），
 * 按大小写不敏感去重并保留首次出现的原始写法。
 */
export function parseCaseVolumeText(text: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of text.split(/[\r\n;；,，\s]+/)) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const key = trimmed.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

export interface SheetVolumeExtraction {
  headers: string[]
  detectedColumn: number
  volumes: string[]
}

/**
 * 从已读取的表格二维行提取我方文号。
 * 自动识别包含「我方文号」「文号」「案号」「case_volume」的表头列，也可通过 columnIndex 显式指定。
 */
export function extractCaseVolumesFromSheet(
  rows: string[][],
  columnIndex?: number
): SheetVolumeExtraction {
  if (!rows.length) {
    return { headers: [], detectedColumn: 0, volumes: [] }
  }

  const firstRow = rows[0] ?? []
  const officeColumn = firstRow.findIndex(cell => OFFICE_VOLUME_HEADER.test((cell ?? '').trim()))
  const genericColumn = firstRow.findIndex(cell => VOLUME_HEADER.test((cell ?? '').trim()))
  const headerColumn = officeColumn >= 0 ? officeColumn : genericColumn
  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), firstRow.length)
  const headers = Array.from({ length: maxCols }, (_, idx) => {
    const cell = headerColumn >= 0 ? (firstRow[idx] ?? '').trim() : ''
    return cell || `第 ${idx + 1} 列`
  })

  let detectedColumn = 0
  if (typeof columnIndex === 'number' && Number.isInteger(columnIndex) && columnIndex >= 0 && columnIndex < maxCols) {
    detectedColumn = columnIndex
  } else {
    detectedColumn = headerColumn >= 0 ? headerColumn : 0
  }

  const dataRows = headerColumn >= 0 ? rows.slice(1) : rows

  const seen = new Set<string>()
  const volumes: string[] = []
  for (const row of dataRows) {
    const raw = (row[detectedColumn] ?? '').trim()
    if (!raw) continue
    const key = raw.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    volumes.push(raw)
  }

  return { headers, detectedColumn, volumes }
}

/**
 * 按优先级选择「流程人员初核」审核人：
 * 1. 单行显式指定的 overrideReviewerId；
 * 2. 策略为 specific 时使用 defaultReviewerId；
 * 3. 策略为 least_busy 时取当前待办件数最少的候选人；
 * 4. 默认取第一位候选人。
 */
export function pickFeeReduceReviewer(
  candidates: FeeReduceReviewerOption[],
  strategy: FeeReduceReviewerStrategy,
  defaultReviewerId?: string,
  overrideReviewerId?: string
): FeeReduceReviewerOption | null {
  if (!candidates.length) return null
  if (overrideReviewerId) {
    return candidates.find(item => item.userId.toLowerCase() === overrideReviewerId.toLowerCase()) ?? null
  }
  if (strategy === 'specific') {
    return candidates.find(item => defaultReviewerId && item.userId.toLowerCase() === defaultReviewerId.toLowerCase()) ?? null
  }
  if (strategy === 'least_busy') {
    const sorted = [...candidates].sort((a, b) => {
      const ca = a.count ?? Number.MAX_SAFE_INTEGER
      const cb = b.count ?? Number.MAX_SAFE_INTEGER
      return ca - cb
    })
    return sorted[0] ?? candidates[0]
  }
  return candidates[0]
}
