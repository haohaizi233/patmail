import { buildFileTypeTree } from '../schema/file-type-tree'
import { isRecord, readClientInfo } from './response-guards'
import { PATENT_CASE_TYPE_ID } from './notice-params'
import type {
  NoticeFileTypeNode,
  NoticeInitData,
  NoticeOptionItem,
  NoticeSearchResult,
  NoticeTabId,
  NoticeUploadProcessRow
} from './notice-types'
import { apiError, type ApiResult } from './types'

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function intCount(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) return Number(trimmed)
  }
  return fallback
}

function arrayOf(body: unknown, key: string): Record<string, unknown>[] {
  if (!isRecord(body)) return []
  const raw = body[key]
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(isRecord) : []
    } catch {
      return []
    }
  }
  return Array.isArray(raw) ? raw.filter(isRecord) : []
}

function dedupeOptions(options: NoticeOptionItem[]): NoticeOptionItem[] {
  const seen = new Set<string>()
  const out: NoticeOptionItem[] = []
  for (const item of options) {
    if (!item.value || !item.label || seen.has(item.value)) continue
    seen.add(item.value)
    out.push(item)
  }
  return out
}

export function isSessionExpiredPayload(body: unknown): boolean {
  if (!isRecord(body) || body.ClientInfo === undefined) return false
  const info = readClientInfo(body.ClientInfo)
  return info.ok && info.data.IsLogin === false
}

export function isCpcAuthRequired(body: unknown): boolean {
  if (!isRecord(body) || !isRecord(body.ClientInfo)) return false
  const info = body.ClientInfo
  return info.Result === false && str(info.Message) === '401'
}

export interface NoticeInitRawParts {
  applyTypes?: unknown
  agencies?: unknown
  directions?: unknown
  applyTags?: unknown
  branches?: unknown
  countries?: unknown
  fileTypes?: unknown
  cpcAccounts?: unknown
  cpcTzsDate?: unknown
  handCheck?: unknown
  nolaiutoCount?: unknown
  warnings?: string[]
}

export function normalizeNoticeInitData(parts: NoticeInitRawParts): NoticeInitData {
  const warnings = [...(parts.warnings ?? [])]

  const applyTypes = dedupeOptions(
    arrayOf(parts.applyTypes, 'ApplyType')
      .filter(row => {
        const ct = str(row.case_type_id)
        return !ct || ct.toUpperCase() === PATENT_CASE_TYPE_ID
      })
      .map(row => ({
        value: str(row.value),
        label: str(row.text_zh_cn || row.text || row.apply_type_code),
        extra: { code: str(row.apply_type_code) }
      }))
  )

  const agencies = dedupeOptions(
    arrayOf(parts.agencies, 'Agency').map(row => {
      const code = str(row.agency_code)
      const name = str(row.agency_name_cn || row.agency_name_en)
      return {
        value: str(row.agency_id),
        label: code ? `${name} (${code})` : name,
        extra: { name, code }
      }
    })
  )

  const directions = dedupeOptions(
    arrayOf(parts.directions, 'DirectionType').map(row => ({
      value: str(row.value),
      label: str(row.text_zh_cn || row.text)
    }))
  )

  const applyTags = dedupeOptions(
    arrayOf(parts.applyTags, 'ApplyTags').map(row => ({
      value: str(row.id),
      label: str(row.name)
    }))
  )

  const branches = dedupeOptions(
    arrayOf(parts.branches, 'BranchList').map(row => ({
      value: str(row.dept_id),
      label: str(row.dept_name || row.dept_full_name)
    }))
  )

  const countries = dedupeOptions(
    arrayOf(parts.countries, 'country').map(row => ({
      value: str(row.id || row.value),
      label: str(row.name || row.text_zh_cn)
    }))
  )

  const rawFileTypeRows = arrayOf(parts.fileTypes, 'FileType')
  const builtTree = buildFileTypeTree(rawFileTypeRows)
  const fileTypes: NoticeFileTypeNode[] = builtTree.nodes.map(node => ({
    id: node.id,
    name: node.name,
    parentId: node.parentId,
    ...(node.selectable === false ? { selectable: false } : {}),
    ...(node.treeType ? { treeType: node.treeType } : {})
  }))

  const cpcAccounts = dedupeOptions(
    arrayOf(parts.cpcAccounts, 'accounts').map(row => ({
      value: str(row.id),
      label: str(row.name)
    }))
  )

  let defaultTzsStartDate = '2023-01-01'
  if (isRecord(parts.cpcTzsDate)) {
    const rawTime = str(parts.cpcTzsDate.time)
    if (rawTime) {
      defaultTzsStartDate = rawTime.split('&')[0].trim() || '2023-01-01'
    }
  }

  let handCount = 0
  if (isRecord(parts.handCheck)) {
    const firstRow = arrayOf(parts.handCheck, 'TableRows')[0]
    handCount = intCount(parts.handCheck.TableRowsCount ?? firstRow?.TableRowsCount ?? parts.handCheck.Count, 0)
  }

  let nolaiutoCount = 0
  if (isRecord(parts.nolaiutoCount)) {
    nolaiutoCount = intCount(parts.nolaiutoCount.count ?? parts.nolaiutoCount.TableRowsCount, 0)
  }

  return {
    applyTypes,
    agencies,
    directions,
    applyTags,
    branches,
    countries,
    fileTypes,
    cpcAccounts,
    defaultTzsStartDate,
    handCount,
    nolaiutoCount,
    warnings
  }
}

export function normalizeNoticeSearchResponse(
  tab: NoticeTabId,
  raw: unknown,
  pageIndex: number,
  pageSize: number
): ApiResult<NoticeSearchResult> {
  if (!isRecord(raw)) {
    return apiError('INVALID_RESPONSE', '来文列表响应格式无效。')
  }
  if (isSessionExpiredPayload(raw)) {
    return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请在原网站重新登录。')
  }
  if (isCpcAuthRequired(raw)) {
    return {
      ok: true,
      data: {
        tab,
        rows: [],
        total: 0,
        pageIndex,
        pageSize,
        needCpcLogin: true,
        loginMessage: 'CPC 账号登录已过期（401），请先前往 EASY 原站「来文管理」完成扫码登录。'
      }
    }
  }

  const info = isRecord(raw.ClientInfo) ? raw.ClientInfo : null
  if (info && info.Status === false && info.Message) {
    return apiError('BUSINESS_ERROR', str(info.Message))
  }

  const rows = Array.isArray(raw.TableRows)
    ? raw.TableRows.filter(isRecord)
    : Array.isArray(raw.rows)
      ? raw.rows.filter(isRecord)
      : []

  const firstTotal = rows[0]?.TableRowsCount
  const total = intCount(raw.TableRowsCount ?? raw.total ?? firstTotal, rows.length)

  return {
    ok: true,
    data: {
      tab,
      rows,
      total,
      pageIndex,
      pageSize
    }
  }
}

export function normalizeUploadProcessList(raw: unknown): NoticeUploadProcessRow[] {
  const rows = arrayOf(raw, 'TableRows')
  return rows.map((row, idx) => ({
    id: str(row.id) || String(idx + 1),
    sn: intCount(row.sn, idx + 1),
    zipFileName: str(row.zip_file_name || row.file_name),
    status: str(row.status),
    process: str(row.process),
    successNum: str(row.success_num),
    failNum: str(row.fail_num),
    createTime: str(row.create_time || row.update_time),
    remark: str(row.remark)
  }))
}
