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
    if (Number.isFinite(num)) return num
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

  const rawRows = Array.isArray(raw.TableRows) ? raw.TableRows : []
  const countStr = cleanString(raw.TableRowsCount)
  const total = countStr ? parseNumber(countStr, rawRows.length) : rawRows.length

  let pageAgentFee = 0
  let pageOfficialFee = 0
  let pageThirdPartyFee = 0

  const rows: FeeSearchRow[] = rawRows.map((item, index) => {
    const record = isRecord(item) ? item : {}
    const feeClass = cleanString(record.fee_class).toUpperCase()
    const amount = parseNumber(record.amount, 0)

    if (feeClass === 'A') {
      pageAgentFee += amount
    } else if (feeClass === 'O') {
      pageOfficialFee += amount
    } else if (feeClass === 'T') {
      pageThirdPartyFee += amount
    }

    return {
      feeId: cleanString(record.fee_id) || cleanString(record.objid),
      caseId: cleanString(record.case_id),
      procId: cleanString(record.proc_id),
      sn: parseNumber(record.sn, index + 1 + ((query.pageIndex || 1) - 1) * (query.pageSize || 10)),
      caseVolume: cleanString(record.case_volume),
      caseVolumeCustomer: cleanString(record.case_volume_customer),
      caseStatus: cleanString(record.case_status),
      applyType: cleanString(record.apply_type),
      businessType: cleanString(record.business_type),
      noticeStatus: cleanString(record.notice_status),
      requestStatus: cleanString(record.request_status),
      receiveStatus: cleanString(record.receive_status),
      payStatus: cleanString(record.pay_status),
      amount,
      currency: cleanString(record.currency_id) || 'CNY',
      rate: parseNumber(record.rate, 1),
      targetAmount: parseNumber(record.target_amount, amount),
      targetCurrency: cleanString(record.target_currency_id) || cleanString(record.currency_id) || 'CNY',
      reviewStage: cleanString(record.review_stage),
      feeType: cleanString(record.fee_type),
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
    }
  })

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
