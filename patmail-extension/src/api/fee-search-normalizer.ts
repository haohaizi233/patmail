import type { ApiResult } from './types'
import { apiError } from './types'
import type { FeeSearchQuery } from './fee-search-params'
import type { FeeSearchRow, FeeSearchResult, FeeSearchAmountSummary } from './fee-search-types'
import { isRecord } from './response-guards'

function cleanString(val: unknown): string {
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  return ''
}

function parseNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '').trim()
    const num = Number(cleaned)
    if (cleaned && Number.isFinite(num)) return num
  }
  return fallback
}

export function normalizeFeeSearch(raw: unknown, query: FeeSearchQuery): ApiResult<FeeSearchResult> {
  if (!isRecord(raw)) {
    return apiError('HTTP_ERROR', 'EASY 返回了未知格式的数据。')
  }

  const clientInfo = isRecord(raw.ClientInfo) ? raw.ClientInfo : null
  if (clientInfo && clientInfo.Status === false) {
    if (clientInfo.IsLogin === false) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    return apiError('HTTP_ERROR', cleanString(clientInfo.Message) || '系统繁忙，请求失败，请稍后重试！')
  }

  let rawRows: unknown = Object.hasOwn(raw, 'rows') ? raw.rows : raw.TableRows
  if (typeof rawRows === 'string') {
    try { rawRows = JSON.parse(rawRows) } catch { return apiError('INVALID_RESPONSE', '费用明细格式无效。') }
  }
  const total = parseNumber(raw.total ?? raw.TableRowsCount, NaN)
  if (rawRows === null && total === 0) rawRows = []
  const expected = Math.max(0, Math.min(query.pageSize, total - (query.pageIndex - 1) * query.pageSize))
  if (!Array.isArray(rawRows) || !Number.isSafeInteger(total) || total < 0 || rawRows.length !== expected) {
    return apiError('INVALID_RESPONSE', '费用查询返回的页数或行数不完整，请重新查询。')
  }

  let pageAgentFee = 0
  let pageOfficialFee = 0
  let pageThirdPartyFee = 0

  const rows: FeeSearchRow[] = []
  const feeIds = new Set<string>()
  for (const [index, item] of rawRows.entries()) {
    const record = isRecord(item) ? item : {}
    const feeClass = cleanString(record.fee_class).toUpperCase()
    const amount = parseNumber(record.amount, NaN)
    const feeId = cleanString(record.fee_id) || cleanString(record.objid)
    const currency = cleanString(record.currency_id) || cleanString(record.currency_type)
    if (!feeId || feeIds.has(feeId) || !currency || !Number.isFinite(amount)) {
      return apiError('INVALID_RESPONSE', `第 ${query.pageIndex} 页第 ${index + 1} 条费用的编号、币别或金额无效。`)
    }
    feeIds.add(feeId)

    if (feeClass === 'A') {
      pageAgentFee += amount
    } else if (feeClass === 'O') {
      pageOfficialFee += amount
    } else if (feeClass === 'T') {
      pageThirdPartyFee += amount
    }

    rows.push({
      feeId,
      caseId: cleanString(record.case_id),
      procId: cleanString(record.proc_id),
      sn: parseNumber(record.sn, index + 1 + ((query.pageIndex || 1) - 1) * (query.pageSize || 100)),
      caseVolume: cleanString(record.case_volume),
      caseVolumeCustomer: cleanString(record.case_volume_customer),
      caseStatus: cleanString(record.case_status),
      applyType: cleanString(record.apply_type),
      businessType: cleanString(record.business_type_name) || cleanString(record.business_type),
      noticeStatus: cleanString(record.notice_status),
      requestStatus: cleanString(record.request_status),
      receiveStatus: cleanString(record.receive_status),
      payStatus: cleanString(record.pay_status),
      amount,
      currency,
      rate: parseNumber(record.rate, 1),
      targetAmount: parseNumber(record.target_amount ?? record.amount_currency, amount),
      targetCurrency: cleanString(record.target_currency_id) || currency,
      reviewStage: cleanString(record.review_stage),
      feeType: cleanString(record.fee_name) || cleanString(record.fee_type),
      appNo: cleanString(record.app_no),
      appDate: cleanString(record.app_date),
      requestNo: cleanString(record.request_no),
      paymentNo: cleanString(record.payment_no),
      ctrlProc: cleanString(record.ctrl_proc),
      feeClassName: cleanString(record.fee_class_name),
      feeClass,
      createTime: cleanString(record.create_time),
      payDueDate: cleanString(record.pay_due_date),
      caseName: cleanString(record.case_name),
      customerName: cleanString(record.customer_name),
      applicant: cleanString(record.applicants) || cleanString(record.applicant),
      recieveAmount: cleanString(record.recieve_amount),
      billNo: cleanString(record.bill_no),
      invoiceNo: cleanString(record.invoice_no),
      requestDate: cleanString(record.request_date),
      payDate: cleanString(record.pay_date),
      receiveDueDate: cleanString(record.receive_due_date),
      receiveDate: cleanString(record.receive_date),
      finishDate: cleanString(record.finish_date),
      feeCustomer: cleanString(record.fee_customer),
      flowUser: cleanString(record.flow_user),
      raw: record
    })
  }

  const summary: FeeSearchAmountSummary = {
    pageAgentFee,
    pageOfficialFee,
    pageThirdPartyFee
  }

  return {
    ok: true,
    data: {
      total,
      rows,
      summary
    }
  }
}
