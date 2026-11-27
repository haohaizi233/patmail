import { readXlsxRows } from '../customer/xlsx-table'
import type { CustomerMode } from '../settings/customer-mode'

export interface ReplayCheckRecord {
  system: CustomerMode
  accountLabel: string
  noticeName: string
  fawenxlh: string
  postDate: string
  applyNo: string
  caseName: string
  account: string
  importStatus: string
}

export interface MergedReplayCheckRecord {
  key: string
  systems: CustomerMode[]
  accountLabels: string[]
  noticeName: string
  fawenxlh: string
  postDate: string
  applyNo: string
  caseName: string
  account: string
  importStatus: string
}

export function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const binary = atob(clean)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return buffer
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseHtmlTableRows(text: string): string[][] {
  const rows: string[][] = []
  for (const rowMatch of text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = []
    for (const cellMatch of rowMatch[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)) {
      cells.push(decodeHtmlEntities(cellMatch[1]))
    }
    if (cells.some(Boolean)) rows.push(cells)
  }
  return rows
}

function parseSpreadsheetMlRows(text: string): string[][] {
  const rows: string[][] = []
  for (const rowMatch of text.matchAll(/<Row\b[^>]*>([\s\S]*?)<\/Row>/gi)) {
    const cells: string[] = []
    for (const cellMatch of rowMatch[1].matchAll(/<Cell\b([^>]*)>([\s\S]*?)<\/Cell>/gi)) {
      const attrs = cellMatch[1]
      const body = cellMatch[2]
      const indexAttr = attrs.match(/ss:Index="(\d+)"/i)?.[1]
      if (indexAttr) {
        const targetIndex = Math.max(0, Number(indexAttr) - 1)
        while (cells.length < targetIndex) cells.push('')
      }
      const dataMatch = body.match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i)?.[1] ?? ''
      cells.push(decodeHtmlEntities(dataMatch))
    }
    if (cells.some(Boolean)) rows.push(cells)
  }
  return rows
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

/** 解析原站导出的 Excel 清单（支持 .xlsx、ASP.NET HTML 表格 .xls 与 SpreadsheetML XML .xls）。 */
export async function parseNoticeExportTable(buffer: ArrayBuffer, mimeType = ''): Promise<string[][]> {
  const bytes = new Uint8Array(buffer)
  if (bytes.length === 0) return []
  if (looksLikeZip(bytes) || /openxmlformats-officedocument\.spreadsheetml/i.test(mimeType)) {
    return readXlsxRows(buffer)
  }
  const text = new TextDecoder('utf-8').decode(bytes)
  if (/<tr\b/i.test(text) && /<t[hd]\b/i.test(text)) {
    return parseHtmlTableRows(text)
  }
  if (/<Workbook\b/i.test(text) && /<Row\b/i.test(text)) {
    return parseSpreadsheetMlRows(text)
  }
  throw new Error('暂不支持的 Excel 导出格式，无法解析核对清单。')
}

export function isReplayRowUnimported(statusText: string): boolean {
  const val = statusText.trim().toLowerCase()
  if (!val) return true
  if (val === '已导入' || val === '是' || val === '1' || val === 'true' || val === 'finish' || val === 'success') {
    return false
  }
  if (val.includes('已导入')) return false
  return val.includes('未导入') || val === '否' || val === '0' || val === 'false' || val === '未处理'
}

function findHeaderIndex(headers: readonly string[], candidates: readonly string[]): number {
  const normalized = headers.map(h => h.replace(/\s+/g, '').toLowerCase())
  for (const cand of candidates) {
    const idx = normalized.indexOf(cand.replace(/\s+/g, '').toLowerCase())
    if (idx >= 0) return idx
  }
  for (const cand of candidates) {
    const lower = cand.replace(/\s+/g, '').toLowerCase()
    const idx = normalized.findIndex(h => h.includes(lower))
    if (idx >= 0) return idx
  }
  return -1
}

/** 从解析后的二维表中提取「未导入」行。 */
export function extractUnimportedReplayRecords(
  grid: readonly string[][],
  meta: { system: CustomerMode; accountLabel: string }
): ReplayCheckRecord[] {
  if (grid.length < 2) return []
  const headers = grid[0]
  const noticeIdx = findHeaderIndex(headers, ['来文名称', '通知书名称', 'tongzhismc'])
  const xlhIdx = findHeaderIndex(headers, ['发文序列号', '发文序号', 'fawenxlh'])
  const dateIdx = findHeaderIndex(headers, ['官方发文日', '电子发文日', '发文日期', 'dianzifwrq'])
  const appNoIdx = findHeaderIndex(headers, ['申请号', 'cnApplicationnumber'])
  const caseNameIdx = findHeaderIndex(headers, ['发明创造名称', '案件名称', 'famingczmc'])
  const accountIdx = findHeaderIndex(headers, ['账户', '收文账号', '账号', 'account'])
  const statusIdx = findHeaderIndex(headers, ['是否导入系统', '导入状态', '状态', 'status'])

  const records: ReplayCheckRecord[] = []
  for (let i = 1; i < grid.length; i += 1) {
    const row = grid[i]
    if (!row || !row.some(cell => cell.trim())) continue
    const importStatus = statusIdx >= 0 ? (row[statusIdx] ?? '').trim() : ''
    if (statusIdx >= 0 && !isReplayRowUnimported(importStatus)) continue
    records.push({
      system: meta.system,
      accountLabel: meta.accountLabel,
      noticeName: noticeIdx >= 0 ? (row[noticeIdx] ?? '').trim() : '',
      fawenxlh: xlhIdx >= 0 ? (row[xlhIdx] ?? '').trim() : '',
      postDate: dateIdx >= 0 ? (row[dateIdx] ?? '').trim() : '',
      applyNo: appNoIdx >= 0 ? (row[appNoIdx] ?? '').trim() : '',
      caseName: caseNameIdx >= 0 ? (row[caseNameIdx] ?? '').trim() : '',
      account: accountIdx >= 0 ? (row[accountIdx] ?? '').trim() : meta.accountLabel,
      importStatus: importStatus || '未导入'
    })
  }
  return records
}

function recordUnionKey(record: ReplayCheckRecord): string {
  const xlh = record.fawenxlh.trim()
  if (xlh) return `xlh:${xlh}`
  return `fallback:${record.applyNo.trim()}|${record.noticeName.trim()}|${record.postDate.trim()}`
}

/** 对大小客户系统筛选出的未导入清单取并集并去重。 */
export function mergeUnimportedUnion(records: readonly ReplayCheckRecord[]): MergedReplayCheckRecord[] {
  const map = new Map<string, MergedReplayCheckRecord>()
  for (const item of records) {
    const key = recordUnionKey(item)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        key,
        systems: [item.system],
        accountLabels: item.accountLabel ? [item.accountLabel] : [],
        noticeName: item.noticeName,
        fawenxlh: item.fawenxlh,
        postDate: item.postDate,
        applyNo: item.applyNo,
        caseName: item.caseName,
        account: item.account,
        importStatus: item.importStatus
      })
      continue
    }
    if (!existing.systems.includes(item.system)) existing.systems.push(item.system)
    if (item.accountLabel && !existing.accountLabels.includes(item.accountLabel)) {
      existing.accountLabels.push(item.accountLabel)
    }
    if (!existing.noticeName && item.noticeName) existing.noticeName = item.noticeName
    if (!existing.fawenxlh && item.fawenxlh) existing.fawenxlh = item.fawenxlh
    if (!existing.postDate && item.postDate) existing.postDate = item.postDate
    if (!existing.applyNo && item.applyNo) existing.applyNo = item.applyNo
    if (!existing.caseName && item.caseName) existing.caseName = item.caseName
    if (!existing.account && item.account) existing.account = item.account
  }
  return [...map.values()]
}

export function formatSystemSetLabel(systems: readonly CustomerMode[]): string {
  const labels: string[] = []
  if (systems.includes('large')) labels.push('大客户')
  if (systems.includes('sme')) labels.push('中小客户')
  return labels.join('、')
}

export function buildUnimportedUnionSheet(rows: readonly MergedReplayCheckRecord[]): string[][] {
  const header = ['来源系统', '收文账号', '来文名称', '发文序列号', '官方发文日', '申请号', '发明创造名称', '是否导入系统']
  const body = rows.map(row => [
    formatSystemSetLabel(row.systems),
    row.account || row.accountLabels.join('、'),
    row.noticeName,
    row.fawenxlh,
    row.postDate,
    row.applyNo,
    row.caseName,
    row.importStatus
  ])
  return [header, ...body]
}
