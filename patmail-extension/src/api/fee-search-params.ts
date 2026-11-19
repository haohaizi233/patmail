import { isRecord } from './response-guards'

export interface FeeSearchQuery {
  pageIndex: number
  pageSize: number
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

export function buildFeeSearchParams(query: FeeSearchQuery, columns?: string[]): { ok: true; data: URLSearchParams } {
  const params = new URLSearchParams()
  params.set('Call', 'FeeSearch')
  params.set('pageIndex', String(query.pageIndex || 1))
  params.set('pageSize', String(query.pageSize || 10))
  params.set('colsel', buildFeeColsel(columns))
  params.set('log_pagename', 'FeeSearch.aspx')

  // Populate from query fields or fields bag
  const bag = { ...(query.fields ?? {}) }

  for (const [key, value] of Object.entries(query)) {
    if (key === 'pageIndex' || key === 'pageSize' || key === 'fields' || value === undefined || value === null) continue
    if (typeof value === 'boolean') {
      if (key.endsWith('_isnull') || key === 'receivepayor') {
        if (value) params.set(key, 'on')
      } else if (key === 'first_applicant') {
        params.set(key, value ? '1' : '0')
      } else {
        params.set(key, String(value))
      }
    } else if (typeof value === 'string' && value.trim()) {
      const normalized = key === 'applicant_id' ? value.trim().replace(/,/g, ';') : value.trim()
      params.set(key, normalized)
    }
  }

  for (const [key, value] of Object.entries(bag)) {
    if (value && typeof value === 'string' && !params.has(key)) {
      const normalized = key === 'applicant_id' ? value.trim().replace(/,/g, ';') : value.trim()
      params.set(key, normalized)
    }
  }

  if (!params.has('first_applicant')) {
    params.set('first_applicant', '0')
  }

  return { ok: true, data: params }
}

export function buildFeeSearchAmountParams(query: FeeSearchQuery): { ok: true; data: URLSearchParams } {
  const result = buildFeeSearchParams(query)
  result.data.set('Call', 'FeeSearchTotalAmount')
  return result
}

export function isFeeSearchQuery(value: unknown): value is FeeSearchQuery {
  if (!isRecord(value)) return false
  return typeof value.pageIndex === 'number' && typeof value.pageSize === 'number'
}
