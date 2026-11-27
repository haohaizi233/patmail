import { isRecord } from './response-guards'
import { apiError, type ApiResult } from './types'
import type { PatentSearchQuery } from './patent-search-types'
import {
  PATENT_CASE_TYPE_ID,
  PATENT_CHECK_FIELDS,
  PATENT_NULL_SELECT_FIELDS,
  PATENT_OBJECT_FIELDS,
  PATENT_TEXT_FIELDS,
  PATENT_TRUE_CHECK_FIELDS,
  buildColselString,
  defaultPatentVisibleColumns,
  isPatentFieldKey,
  sanitizePatentFieldValue
} from './patent-form'

export type { PatentSearchQuery } from './patent-search-types'

function xmlTag(name: string, value: string): string {
  return `&lt;${name}&gt;${sanitizePatentFieldValue(value)}&lt;/${name}&gt;`
}

/** 按 MyICSearchList.js SearchClick 规则构造 IPCaseSearch 的 Element XML 字符串。 */
export function buildPatentSearchElement(query: PatentSearchQuery): string {
  const fields = query.fields ?? {}
  const displayValues = query.displayValues ?? {}
  const checks = query.checks ?? {}
  const parts: string[] = []

  for (const key of PATENT_TEXT_FIELDS) {
    if (PATENT_OBJECT_FIELDS.has(key)) {
      const objId = fields[key] ?? ''
      const text = displayValues[key] ?? ''
      parts.push(xmlTag(key, objId))
      parts.push(xmlTag(`${key}_text`, text))
    } else if (key === 'case_type') {
      const val = fields[key]?.trim() || PATENT_CASE_TYPE_ID
      parts.push(xmlTag(key, val))
    } else if (PATENT_NULL_SELECT_FIELDS.has(key)) {
      const val = fields[key]?.trim() || 'null'
      parts.push(xmlTag(key, val))
    } else {
      parts.push(xmlTag(key, fields[key] ?? ''))
    }
  }

  for (const checkKey of PATENT_CHECK_FIELDS) {
    const checked = checkKey === 'is_proc'
      ? Boolean(query.is_proc || checks[checkKey])
      : checkKey === 'is_fuzzy_query_case_volume'
        ? Boolean(query.is_fuzzy_query_case_volume || checks[checkKey])
        : checkKey === 'is_fuzzy_query_app_no'
          ? Boolean(query.is_fuzzy_query_app_no || checks[checkKey])
          : checkKey === 'is_fuzzy_query_pct_app_no'
            ? Boolean(query.is_fuzzy_query_pct_app_no || checks[checkKey])
            : checkKey === 'is_point_app_no'
              ? Boolean(query.is_point_app_no || checks[checkKey])
              : checkKey === 'is_remove_symbol'
                ? Boolean(query.is_remove_symbol || checks[checkKey])
                : Boolean(checks[checkKey])
    if (checked) {
      const defaultVal = checkKey === 'pic_no_user'
        ? '1'
        : PATENT_TRUE_CHECK_FIELDS.has(checkKey)
          ? 'true'
          : 'on'
      parts.push(xmlTag(checkKey, fields[checkKey] || defaultVal))
    }
  }

  return parts.join('')
}

export function buildPatentSearchParams(
  query: PatentSearchQuery,
  now: () => number = Date.now
): ApiResult<URLSearchParams> {
  if (!Number.isSafeInteger(query.pageIndex) || query.pageIndex < 1 || query.pageIndex > 1_000_000) {
    return apiError('INVALID_QUERY', '页码必须是大于 0 的整数。')
  }
  if (!Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100) {
    return apiError('INVALID_QUERY', '每页条数必须在 1 到 100 之间。')
  }

  const isProc = Boolean(query.is_proc)
  const colsel = query.colsel?.trim()
    ? (query.colsel.startsWith(';') ? query.colsel : `;${query.colsel}`).replace(/([^;])$/, '$1;')
    : buildColselString(defaultPatentVisibleColumns(isProc))

  const params = new URLSearchParams()
  const pairs: Array<[string, string]> = [
    ['pageIndex', String(query.pageIndex)],
    ['pageSize', String(query.pageSize)],
    ['Call', 'ICSearchList'],
    ['Element', buildPatentSearchElement(query)],
    ['is_proc', isProc ? 'true' : 'false'],
    ['is_fuzzy_query_app_no', query.is_fuzzy_query_app_no ? 'true' : 'false'],
    ['is_remove_symbol', query.is_remove_symbol ? 'true' : 'false'],
    ['is_fuzzy_query_case_volume', query.is_fuzzy_query_case_volume ? 'true' : 'false'],
    ['is_point_app_no', query.is_point_app_no ? 'true' : 'false'],
    ['is_first', query.is_first === false ? 'false' : 'true'],
    ['is_fuzzy_query_pct_app_no', query.is_fuzzy_query_pct_app_no ? 'true' : 'false'],
    ['select_and', query.select_and ? 'true' : 'false'],
    ['is_top_volume_search', ''],
    ['colsel', colsel],
    ['_t', String(now())],
    ['log_pagename', 'ICSearch.aspx']
  ]
  for (const [key, value] of pairs) params.append(key, value)
  return { ok: true, data: params }
}

const QUERY_KEYS = new Set([
  'pageIndex',
  'pageSize',
  'is_proc',
  'is_fuzzy_query_case_volume',
  'is_fuzzy_query_app_no',
  'is_fuzzy_query_pct_app_no',
  'is_point_app_no',
  'is_remove_symbol',
  'select_and',
  'is_first',
  'colsel',
  'fields',
  'displayValues',
  'checks'
])

export function isPatentSearchQuery(value: unknown): value is PatentSearchQuery {
  if (!isRecord(value) || Object.keys(value).some(key => !QUERY_KEYS.has(key))) return false
  if (!Number.isSafeInteger(value.pageIndex) || Number(value.pageIndex) < 1) return false
  if (!Number.isSafeInteger(value.pageSize) || Number(value.pageSize) < 1 || Number(value.pageSize) > 100) return false
  for (const boolKey of ['is_proc', 'is_fuzzy_query_case_volume', 'is_fuzzy_query_app_no', 'is_fuzzy_query_pct_app_no', 'is_point_app_no', 'is_remove_symbol', 'select_and', 'is_first'] as const) {
    if (value[boolKey] !== undefined && typeof value[boolKey] !== 'boolean') return false
  }
  if (value.colsel !== undefined && (typeof value.colsel !== 'string' || value.colsel.length > 4000)) return false
  if (!isRecord(value.fields) || Object.keys(value.fields).length > 250) return false
  for (const [k, v] of Object.entries(value.fields)) {
    if (!isPatentFieldKey(k) || typeof v !== 'string' || v.length > 20_000) return false
  }
  if (value.displayValues !== undefined) {
    if (!isRecord(value.displayValues) || Object.keys(value.displayValues).length > 100) return false
    for (const [k, v] of Object.entries(value.displayValues)) {
      if (!isPatentFieldKey(k) || typeof v !== 'string' || v.length > 4000) return false
    }
  }
  if (value.checks !== undefined) {
    if (!isRecord(value.checks) || Object.keys(value.checks).length > 100) return false
    for (const [k, v] of Object.entries(value.checks)) {
      if (!isPatentFieldKey(k) || typeof v !== 'boolean') return false
    }
  }
  return true
}
