import { sanitizeFeeFieldValue } from './fee-form'
import { isRecord } from './response-guards'

export interface FeeSearchQuery {
  pageIndex: number
  pageSize: number
  includeTranslationWordCounts?: boolean
  // Quick fields
  case_volume?: string
  is_fuzzy_query_case_volume?: boolean
  is_accurate_query_sort?: boolean
  app_no?: string
  is_fuzzy_query_app_no?: boolean
  is_point_app_no?: boolean
  pct_app_no?: string
  is_fuzzy_query_pct_app_no?: boolean

  // Row 1
  case_type?: string
  Case_direction?: string
  case_status?: string
  country?: string

  // Row 2
  customer_id?: string
  applicant_id?: string
  first_applicant?: boolean
  branch_dept_id?: string

  // Row 3
  fee_class?: string
  fee_type?: string
  request_no?: string
  pay_type?: string

  // Row 4
  notice_status?: string
  request_status?: string
  receive_status?: string
  pay_status?: string
  pay_status_is_agent_fee?: boolean

  // Row 5
  receive_due_date_from?: string
  receive_due_date_to?: string
  receive_due_date_isnull?: boolean
  receivepayor?: boolean

  receive_date_from?: string
  receive_date_to?: string
  receive_date_isnull?: boolean

  pay_date_from?: string
  pay_date_to?: string
  pay_date_isnull?: boolean
  pay_date_is_agent_fee?: boolean

  // Row 6
  create_date_from?: string
  create_date_to?: string
  create_date_isnull?: boolean

  app_date_from?: string
  app_date_to?: string
  app_date_isnull?: boolean

  createtime_from?: string
  createtime_to?: string
  createtime_isnull?: boolean

  invoice_time_from?: string
  invoice_time_to?: string
  invoice_time_isnull?: boolean

  pay_due_date_from?: string
  pay_due_date_to?: string
  pay_due_date_isnull?: boolean
  pay_due_date_is_agent_fee?: boolean

  // Row 7
  ctrl_proc?: string
  proc_pic_id?: string

  finish_date_from?: string
  finish_date_to?: string
  finish_date_isnull?: boolean

  // Advanced fields
  app_date_month?: string
  issue_no?: string
  is_fuzzy_query_issue_no?: boolean
  case_volume_customer?: string
  business_type?: string
  is_close?: string
  is_ahead_pub?: string
  sale_id?: string
  sale_dept_id?: string
  charge_date_from?: string
  charge_date_to?: string
  charge_date_isnull?: boolean
  charge_dept_id?: string
  flow_user?: string
  case_name?: string
  sale_help_id?: string
  hearing_the_case?: string
  apply_type?: string
  case_agency_precorditem?: string
  case_agency?: string
  is_vip?: string
  generation_status?: string
  contract_code?: string
  product_name?: string
  authorize_date_from?: string
  authorize_date_to?: string
  authorize_date_isnull?: boolean
  sourcetype?: string
  introducer?: string
  inside_introducer?: string
  asst_office_case_no?: string
  apply_tags?: string
  technical_field?: string
  filing_date_start?: string
  filing_date_end?: string
  applicant_name?: string
  inventor_name?: string
  pic_id?: string
  pic_dept?: string
  accurate_customer?: string
  case_pic_id?: string
  customer_status?: string
  nickname?: string
  customer_no?: string
  customer_code?: string
  customer_sale_id?: string
  ruleOutcustomer_id?: string
  contact?: string
  contact_type?: string
  proc_create_time_from?: string
  proc_create_time_to?: string
  proc_create_time_isnull?: boolean
  proc_pic_dept_id?: string
  doc_date_from?: string
  doc_date_to?: string
  doc_date_isnull?: boolean
  legal_due_date_from?: string
  legal_due_date_to?: string
  int_doc_date_from?: string
  int_doc_date_to?: string
  cus_due_date_from?: string
  cus_due_date_to?: string
  review_stage?: string
  proc_remark?: string
  check_time_from?: string
  check_time_to?: string
  check_time_isnull?: boolean
  receive_date_update_user?: string
  receive_date_update_time_from?: string
  receive_date_update_time_to?: string
  receive_date_update_time_isnull?: boolean
  office_no?: string
  office_no_is_agent_fee?: boolean
  request_date_from?: string
  request_date_to?: string
  request_date_isnull?: boolean
  receive_account_id?: string
  business_coop?: string
  cancellation_date_from?: string
  cancellation_date_to?: string
  exists_invoice_no?: string
  receiptno?: string
  out_bill_no?: string
  out_bill_date_from?: string
  out_bill_date_to?: string
  out_bill_date_isnull?: boolean
  zt_receipt_bill_date_from?: string
  zt_receipt_bill_date_to?: string
  zt_receipt_bill_date_isnull?: boolean
  zt_payment_delivery_date_from?: string
  zt_payment_delivery_date_to?: string
  zt_payment_delivery_date_isnull?: boolean
  bill_out_finish_date_start?: string
  bill_out_finish_date_end?: string
  amount?: string
  bill_no?: string
  fee_create_user_id?: string
  currency_id?: string
  fee_remark?: string
  status?: string
  no_request_reason?: string
  total_price?: string
  commission_user?: string
  is_advance_payment?: string
  fee_customer?: string
  request_creator?: string
  column_1?: string
  column_2?: string
  column_3?: string
  column_4?: string
  column_5?: string
  internal_number?: string
  order_by?: string

  fields?: Record<string, string>
}

export const FEE_SEARCH_DEFAULT_COLUMNS = [
  'sn',
  'case_volume',
  'case_volume_customer',
  'case_status',
  'apply_type',
  'business_type',
  'notice_status',
  'request_status',
  'receive_status',
  'pay_status',
  'amount',
  'currency_id',
  'rate',
  'target_amount',
  'target_currency_id',
  'review_stage',
  'fee_type',
  'app_no',
  'app_date',
  'request_no',
  'payment_no',
  'ctrl_proc',
  'fee_class_name',
  'create_time',
  'pay_due_date',
  'case_name',
  'customer_name',
  'applicants',
  'recieve_amount',
  'bill_no',
  'invoice_no',
  'request_date',
  'pay_date',
  'receive_due_date',
  'receive_date',
  'finish_date',
  'fee_customer',
  'flow_user'
]

export function buildFeeColsel(columns: string[] = FEE_SEARCH_DEFAULT_COLUMNS): string {
  return ';' + columns.join(';') + ';'
}

const FEE_SEARCH_LOCKED_KEYS = new Set([
  'Call', 'pageIndex', 'pageSize', 'colsel', 'log_pagename', '_t'
])

/** 原站 FeeSearch.js 每次查询都会显式提交的 10 个布尔开关（未勾选为 "false"）。 */
export const FEE_BOOLEAN_FALSE_DEFAULT_KEYS = new Set<string>([
  'is_fuzzy_query_case_volume',
  'is_accurate_query_sort',
  'is_fuzzy_query_app_no',
  'is_point_app_no',
  'is_fuzzy_query_pct_app_no',
  'is_fuzzy_query_issue_no',
  'pay_due_date_is_agent_fee',
  'pay_status_is_agent_fee',
  'pay_date_is_agent_fee',
  'office_no_is_agent_fee'
])

/** 原站 FeeSearch.aspx 表单提交的标准空值字段清单（未填写时提交空字符串，与原站请求保持同构）。 */
export const FEE_SEARCH_EMPTY_DEFAULT_FIELDS = [
  'case_volume', 'app_no', 'pct_app_no',
  'case_type', 'Case_direction', 'case_status', 'country',
  'customer_id', 'applicant_id', 'branch_dept_id',
  'fee_class', 'fee_type', 'request_no', 'pay_type',
  'notice_status', 'request_status', 'receive_status', 'pay_status',
  'receive_due_date_from', 'receive_due_date_to', 'receive_due_date_isnull', 'receivepayor',
  'receive_date_from', 'receive_date_to', 'receive_date_isnull',
  'pay_date_from', 'pay_date_to', 'pay_date_isnull',
  'create_date_from', 'create_date_to', 'create_date_isnull',
  'app_date_from', 'app_date_to', 'app_date_isnull',
  'createtime_from', 'createtime_to', 'createtime_isnull',
  'invoice_time_from', 'invoice_time_to', 'invoice_time_isnull',
  'pay_due_date_from', 'pay_due_date_to', 'pay_due_date_isnull',
  'ctrl_proc', 'proc_pic_id',
  'finish_date_from', 'finish_date_to', 'finish_date_isnull',
  'issue_no', 'case_volume_customer', 'business_type', 'is_close', 'is_ahead_pub',
  'sale_id', 'sale_dept_id',
  'charge_date_from', 'charge_date_to', 'charge_date_isnull', 'charge_dept_id',
  'flow_user', 'case_name', 'sale_help_id', 'hearing_the_case', 'apply_type',
  'case_agency_precorditem', 'case_agency',
  'contract_code', 'product_name',
  'authorize_date_from', 'authorize_date_to', 'authorize_date_isnull',
  'sourcetype', 'introducer', 'inside_introducer', 'asst_office_case_no',
  'apply_tags', 'technical_field', 'filing_date_start', 'filing_date_end',
  'applicant_name', 'inventor_name', 'pic_id', 'pic_dept',
  'accurate_customer', 'customer_status', 'nickname', 'customer_code',
  'customer_sale_id', 'ruleOutcustomer_id', 'contact', 'contact_type',
  'proc_create_time_from', 'proc_create_time_to', 'proc_create_time_isnull', 'proc_pic_dept_id',
  'doc_date_from', 'doc_date_to', 'doc_date_isnull',
  'legal_due_date_from', 'legal_due_date_to',
  'int_doc_date_from', 'int_doc_date_to',
  'cus_due_date_from', 'cus_due_date_to',
  'review_stage', 'proc_remark',
  'check_time_from', 'check_time_to', 'check_time_isnull',
  'receive_date_update_user',
  'receive_date_update_time_from', 'receive_date_update_time_to', 'receive_date_update_time_isnull',
  'office_no',
  'request_date_from', 'request_date_to', 'request_date_isnull',
  'receive_account_id', 'business_coop',
  'cancellation_date_from', 'cancellation_date_to',
  'exists_invoice_no', 'receiptno', 'out_bill_no',
  'out_bill_date_from', 'out_bill_date_to', 'out_bill_date_isnull',
  'zt_receipt_bill_date_from', 'zt_receipt_bill_date_to', 'zt_receipt_bill_date_isnull',
  'zt_payment_delivery_date_from', 'zt_payment_delivery_date_to', 'zt_payment_delivery_date_isnull',
  'bill_out_finish_date_start', 'bill_out_finish_date_end',
  'amount', 'bill_no', 'fee_create_user_id', 'currency_id', 'fee_remark',
  'status', 'total_price', 'commission_user', 'fee_customer',
  'column_1', 'column_2', 'column_3', 'column_4', 'column_5',
  'internal_number', 'fee_page_type'
] as const

function isTruthyFlag(value: string): boolean {
  const lower = value.trim().toLowerCase()
  return lower === 'true' || lower === 'on' || lower === '1'
}

function applyFeeParamValue(params: URLSearchParams, key: string, value: unknown): void {
  if (FEE_SEARCH_LOCKED_KEYS.has(key) || value === undefined || value === null) return
  if (typeof value === 'boolean') {
    if (key.endsWith('_isnull') || key === 'receivepayor') {
      params.set(key, value ? 'on' : '')
    } else if (key === 'first_applicant') {
      params.set(key, value ? '1' : '0')
    } else {
      params.set(key, value ? 'true' : 'false')
    }
    return
  }
  if (typeof value !== 'string') return

  if (key.endsWith('_isnull') || key === 'receivepayor') {
    params.set(key, isTruthyFlag(value) ? 'on' : '')
    return
  }
  if (key === 'first_applicant') {
    params.set(key, isTruthyFlag(value) ? '1' : '0')
    return
  }
  if (FEE_BOOLEAN_FALSE_DEFAULT_KEYS.has(key)) {
    params.set(key, isTruthyFlag(value) ? 'true' : 'false')
    return
  }

  const cleaned = sanitizeFeeFieldValue(key, value)
  if (!cleaned) {
    if (params.has(key)) params.set(key, '')
    return
  }
  const normalized = key === 'applicant_id' ? cleaned.replace(/,/g, ';') : cleaned
  params.set(key, normalized)
}

export function buildFeeSearchParams(
  query: FeeSearchQuery,
  columns?: string[],
  now: () => number = Date.now
): { ok: true; data: URLSearchParams } {
  const params = new URLSearchParams()
  params.set('Call', 'FeeSearch')
  params.set('pageIndex', String(query.pageIndex || 1))
  params.set('pageSize', String(query.pageSize || 10))
  params.set('colsel', buildFeeColsel(columns))

  for (const field of FEE_SEARCH_EMPTY_DEFAULT_FIELDS) {
    params.set(field, '')
  }
  for (const flag of FEE_BOOLEAN_FALSE_DEFAULT_KEYS) {
    params.set(flag, 'false')
  }
  params.set('first_applicant', '0')

  // Apply fields bag first (lower precedence than explicit top-level query keys)
  for (const [key, value] of Object.entries(query.fields ?? {})) {
    applyFeeParamValue(params, key, value)
  }

  for (const [key, value] of Object.entries(query)) {
    if (key === 'pageIndex' || key === 'pageSize' || key === 'fields') continue
    applyFeeParamValue(params, key, value)
  }

  params.set('_t', String(now()))
  params.set('log_pagename', 'FeeSearch.aspx')

  return { ok: true, data: params }
}

export function buildFeeSearchAmountParams(
  query: FeeSearchQuery,
  now: () => number = Date.now
): { ok: true; data: URLSearchParams } {
  const result = buildFeeSearchParams(query, undefined, now)
  result.data.set('Call', 'FeeSearchTotalAmount')
  return result
}

export function isFeeSearchQuery(value: unknown): value is FeeSearchQuery {
  if (!isRecord(value)) return false
  return typeof value.pageIndex === 'number' && typeof value.pageSize === 'number'
}
