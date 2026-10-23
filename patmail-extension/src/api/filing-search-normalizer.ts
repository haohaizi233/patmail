import type { FilingSearchQuery } from './filing-search-params'
import type { FilingSearchResult, FilingSearchRow } from './filing-search-types'
import { businessMessage, isRecord, readClientInfo } from './response-guards'
import { apiError, type ApiResult } from './types'

const TEXT_FIELDS = {
  filing_id: 'filingId',
  case_id: 'caseId',
  proc_id: 'procId',
  case_volume: 'caseVolume',
  case_name: 'caseName',
  customer_name: 'customerName',
  customer_code: 'customerCode',
  apply_type: 'applyType',
  ctrl_proc: 'ctrlProc',
  int_due_date: 'intDueDate',
  filing_date: 'filingDate',
  case_type: 'caseType',
  branch_dept: 'branchDept',
  create_user: 'createUser',
  create_time: 'createTime',
  flow_status: 'flowStatus',
  flow_direction: 'flowDirection',
  app_no: 'appNo',
  customer_volume: 'customerVolume',
  app_date: 'appDate',
  case_status: 'caseStatus'
} as const

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function totalOf(response: Record<string, unknown>, itemCount: number): number | null {
  const raw = response.TableRowsCount
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw)
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) return raw
  if (raw === undefined || raw === null || raw === '') return itemCount
  return null
}

/** 已登录且 Status 为真时，Result=false 不能单独当成失败。`TableRows` 为 null 是这页没有记录。 */
export function normalizeFilingSearch(response: unknown, query: FilingSearchQuery): ApiResult<FilingSearchResult> {
  if (!isRecord(response)) return apiError('INVALID_RESPONSE', '递交列表响应不是对象。')
  const client = readClientInfo(response.ClientInfo)
  if (!client.ok) return client
  if (client.data.IsLogin === false) return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效。')
  if (client.data.Status === false) return apiError('BUSINESS_ERROR', businessMessage(client.data))
  if (client.data.Status !== true || client.data.IsLogin !== true) {
    return apiError('INVALID_RESPONSE', '递交列表缺少明确的登录状态。')
  }
  if (response.TableRows === undefined) {
    return apiError('INVALID_RESPONSE', '递交列表没有返回 TableRows。')
  }
  if (response.TableRows !== null && !Array.isArray(response.TableRows)) {
    return apiError('INVALID_RESPONSE', 'TableRows 类型无效。')
  }
  const items: FilingSearchRow[] = []
  for (const row of response.TableRows ?? []) {
    if (!isRecord(row)) return apiError('INVALID_RESPONSE', '递交记录不是对象。')
    const item: FilingSearchRow = {
      filingId: '', caseId: '', procId: '', caseVolume: '', caseName: '', customerName: '',
      customerCode: '', applyType: '', ctrlProc: '', intDueDate: '', filingDate: '', caseType: '',
      branchDept: '', createUser: '', createTime: '', flowStatus: '', flowDirection: '', appNo: '', customerVolume: '',
      appDate: '', caseStatus: ''
    }
    for (const source of Object.keys(TEXT_FIELDS) as Array<keyof typeof TEXT_FIELDS>) {
      const value = text(row[source])
      if (value) item[TEXT_FIELDS[source]] = value
    }
    if (!item.filingId && !item.caseVolume) return apiError('INVALID_RESPONSE', '递交记录缺少标识。')
    items.push(item)
  }
  const total = totalOf(response, items.length)
  if (total === null || !Number.isSafeInteger(total)) return apiError('INVALID_RESPONSE', 'TableRowsCount 不是有效非负整数。')
  return { ok: true, data: {
    items,
    total,
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize)
  } }
}
