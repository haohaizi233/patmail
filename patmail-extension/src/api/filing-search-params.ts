import { CURRENT_ENVIRONMENT } from './config'
import { apiError, type ApiResult } from './types'

/**
 * 递交管理列表 `FilingAction.ashx Call=GetFinished` 的请求封装。
 * 来源：`183.36.43.66.har`（第三段）里 `Forms/NewFiling/Filing.aspx`、`Forms/Filing/Finished.aspx` 的 6 次 GetFinished。
 * 条件不在表单里平铺，全部塞进 `Element`：每个条件一个标签，先写 `&lt;标签&gt;值&lt;/标签&gt;`，再交表单编码。
 * 空条件也要交空标签。少交标签会不会「系统繁忙」没有对照，按原站的 43 个标签全交。
 */

/** Element 的 43 个标签，按抓包顺序。`*_text`、`*txtSearch` 是树形框的显示文本，不是查询参数。 */
export const FILING_ELEMENT_NODES = [
  'case_volume', 'ctrl_proc', 'ctrl_proc_text', 'ctrl_proc_idtxtSearch',
  'customer_volume', 'customer', 'customer_code', 'flow_direction', 'case_name', 'case_type',
  'audit_user_id', 'audit_user_id_text', 'audituseridtxtSearch',
  'create_time_start', 'create_time_end',
  'create_user_id', 'create_user_id_text', 'create_usertxtSearch',
  'create_date_start', 'create_date_end',
  'activity', 'activity_treetxtSearch',
  'finish_date_start', 'finish_date_end',
  'contract_no', 'business_coop', 'is_paper_notice', 'agent_name', 'applicant', 'app_no',
  'apply_type', 'apply_type_text', 'apply_type_treetxtSearch',
  'app_date_start', 'app_date_end',
  'history', 'sales_user_id', 'sales_user_id_text', 'sales_user_treetxtSearch',
  'branch_dept', 'branch_dept_text', 'history_remark', 'audit_type'
] as const

export type FilingElementNode = (typeof FILING_ELEMENT_NODES)[number]

/** 主条件字段。可以填进表单的只有这些。原站的递交列表没有查询模板，插件这页也不做模板保存。 */
export const FILING_INPUT_FIELDS = [
  'case_volume', 'ctrl_proc', 'customer_volume', 'customer', 'customer_code', 'flow_direction',
  'case_name', 'case_type', 'audit_user_id', 'create_time_start', 'create_time_end',
  'create_user_id', 'create_date_start', 'create_date_end', 'activity',
  'finish_date_start', 'finish_date_end', 'contract_no', 'business_coop', 'is_paper_notice',
  'agent_name', 'applicant', 'app_no', 'apply_type', 'app_date_start', 'app_date_end',
  'history', 'sales_user_id', 'branch_dept', 'history_remark', 'audit_type'
] as const

export type FilingInputField = (typeof FILING_INPUT_FIELDS)[number]

/** 主字段到显示文本标签。原站用这些标签把树形框、下拉框的中文名绑回去。 */
export const FILING_DISPLAY_NODES: Record<string, string[]> = {
  ctrl_proc: ['ctrl_proc_text', 'ctrl_proc_idtxtSearch'],
  audit_user_id: ['audit_user_id_text', 'audituseridtxtSearch'],
  create_user_id: ['create_user_id_text', 'create_usertxtSearch'],
  activity: ['activity_treetxtSearch'],
  apply_type: ['apply_type_text', 'apply_type_treetxtSearch'],
  sales_user_id: ['sales_user_id_text', 'sales_user_treetxtSearch'],
  branch_dept: ['branch_dept_text']
}

export const FILING_SEARCH_COLSEL =
  ';undefined;case_volume;case_name;customer_name;customer_code;apply_type;ctrl_proc;int_due_date;filing_date;case_type;branch_dept;create_user;create_time;flow_status;'

/** 日期条件。原站 WdatePicker 提交 `yyyy-MM-dd`，多一位少一位都查不出来，这里只认这个格式。 */
export const FILING_DATE_FIELDS = new Set<string>([
  'create_time_start', 'create_time_end', 'create_date_start', 'create_date_end',
  'finish_date_start', 'finish_date_end', 'app_date_start', 'app_date_end'
])

const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/

export function isFilingDateText(value: string): boolean {
  if (!DATE_TEXT.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

export interface FilingSearchQuery {
  /** 主条件。键只收 FILING_INPUT_FIELDS，值统一按字符串收。 */
  fields?: Record<string, string>
  /** 树形框、下拉框的显示文本。写回 Element 的 `_text`、`txtSearch` 标签。 */
  displayValues?: Record<string, string>
  pageIndex: number
  pageSize: number
}

const FILING_LOCKED = new Set<string>(['Call', 'Element', 'colsel', '_t', 'log_pagename'])
const UNSAFE = new Set<string>(['__proto__', 'prototype', 'constructor'])

export function isFilingSearchInputField(name: string): boolean {
  return !UNSAFE.has(name) && (FILING_INPUT_FIELDS as readonly string[]).includes(name) && !FILING_LOCKED.has(name)
}

/** 单个条件值的长度上限。比文件查询宽，因为客户名、文号都可能很长。 */
export function filingSearchValueLimit(name: string): number {
  return name === 'history_remark' ? 4000 : 500
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function pushNode(parts: string[], name: string, value: string): void {
  parts.push(`&lt;${name}&gt;${escapeXml(value.trim())}&lt;/${name}&gt;`)
}

/**
 * 组 Element。标签名和值都先 HTML 转义，再由 URLSearchParams 编码，
 * 线上表现就是 `%26lt%3Bcase_volume%26gt%3B`，和原站一致。
 * 43 个标签全部写出，空条件写空标签。
 */
export function buildFilingSearchElement(
  fields: Record<string, string>,
  displayValues: Record<string, string> = {}
): string {
  const values = new Map<string, string>()
  for (const [key, value] of Object.entries(fields)) {
    if (UNSAFE.has(key) || typeof value !== 'string') continue
    values.set(key, value)
  }
  const displays = new Map<string, string>()
  for (const [key, value] of Object.entries(displayValues)) {
    if (UNSAFE.has(key) || typeof value !== 'string') continue
    displays.set(key, value)
  }
  const parts: string[] = []
  const used = new Set<string>()
  for (const node of FILING_ELEMENT_NODES) {
    if (used.has(node)) continue
    used.add(node)
    const owner = Object.entries(FILING_DISPLAY_NODES).find(([, nodes]) => nodes.includes(node))?.[0]
    if (owner) {
      pushNode(parts, node, displays.get(owner) ?? '')
      continue
    }
    pushNode(parts, node, values.get(node) ?? '')
  }
  return parts.join('')
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function guidList(value: string): boolean {
  const parts = value.split(',').map(item => item.trim()).filter(Boolean)
  return parts.length > 0 && parts.every(item => GUID.test(item))
}

/** 处理事项在页面上是多选。真正查询时一次只带一个，因为一行最多命中其中一项。 */
export function splitFilingCtrlProcIds(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(item => GUID.test(item))
}

export function buildFilingSearchParams(
  query: FilingSearchQuery,
  now: () => number = Date.now
): ApiResult<URLSearchParams> {
  if (!Number.isSafeInteger(query.pageIndex) || query.pageIndex < 1 ||
      !Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100) {
    return apiError('INVALID_QUERY', '页码或每页数量无效。')
  }
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(query.fields ?? {})) {
    if (!isFilingSearchInputField(key) || typeof value !== 'string') {
      return apiError('INVALID_QUERY', '递交条件里有不能提交的项目。')
    }
    const text = value.trim()
    if (text.length > filingSearchValueLimit(key)) return apiError('INVALID_QUERY', '条件太长，没有查询。')
    if (FILING_DATE_FIELDS.has(key) && text && !isFilingDateText(text)) {
      return apiError('INVALID_QUERY', '日期要写成 yyyy-MM-dd，和原站 WdatePicker 提交的一致。')
    }
    fields[key] = text
  }
  const displayValues: Record<string, string> = {}
  for (const [key, value] of Object.entries(query.displayValues ?? {})) {
    if (!isFilingSearchInputField(key) || typeof value !== 'string') {
      return apiError('INVALID_QUERY', '递交条件的显示文本里有不能提交的项目。')
    }
    displayValues[key] = value.trim()
  }
  if (fields.ctrl_proc && !guidList(fields.ctrl_proc)) {
    return apiError('INVALID_QUERY', '处理事项必须使用内部 ID。')
  }
  if (fields.activity && !guidList(fields.activity)) {
    return apiError('INVALID_QUERY', '当前流程阶段必须使用内部 ID。')
  }
  if (fields.apply_type && !guidList(fields.apply_type)) {
    return apiError('INVALID_QUERY', '申请类型必须使用内部 ID。')
  }
  if (fields.history && !GUID.test(fields.history)) {
    return apiError('INVALID_QUERY', '历史审核记录必须使用流程节点 ID。')
  }
  if (fields.branch_dept && !guidList(fields.branch_dept)) {
    return apiError('INVALID_QUERY', '案件所属分部必须使用内部 ID。')
  }
  const params = new URLSearchParams()
  params.append('pageIndex', String(query.pageIndex))
  params.append('pageSize', String(query.pageSize))
  params.append('Call', 'GetFinished')
  params.append('Element', buildFilingSearchElement({
    ...fields,
    case_type: fields.case_type || CURRENT_ENVIRONMENT.caseTypeId
  }, displayValues))
  params.append('colsel', FILING_SEARCH_COLSEL)
  params.append('_t', String(now()))
  params.append('log_pagename', 'Finished.aspx')
  return { ok: true, data: params }
}
