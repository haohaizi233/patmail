import { isRecord, readClientInfo } from './response-guards'
import { apiError, type ApiResult } from './types'
import { FILING_SELECTS } from './filing-form'

/**
 * 「递交管理-已完成导出」的数据口径。整条工作流只有两个主接口：
 * `Common.ashx Call=GetFlowHistory`（obj_id 传 filing_id）读流程历史，
 * `Common.ashx Call=ShowUserInfo` 读办理人浮窗里的部门（页面上悬停姓名弹的那个）。
 * 我方文号、申请日、案件状态都在 GetFinished 的列表行里，不再单独查案件详情。
 */

/** 流程历史一行。字段对齐 GetFlowHistory 的 Result：阶段、办理人、结果、意见。 */
export interface FilingFlowRow {
  /** 流程阶段 node_name_zh_cn，如「启动流程」「同案人意见审核」。 */
  nodeName: string
  auditUserId: string
  /** 办理人员 audit_cn_name。 */
  auditUserName: string
  /** 办理结果 audit_type_zh_cn，原样取「提交」「退回」这类文字，不映射。 */
  auditType: string
  auditTime: string
  /** 办理意见 remark。退回原因就是退回这一行的办理意见。 */
  remark: string
}

/** 人员浮窗的四个字段：姓名、部门、邮箱、电话。 */
export interface FilingUser {
  userId: string
  cnName: string
  deptFullName: string
  email: string
  tel: string
}

const ID_TEXT = /^[0-9A-Za-z-]{1,100}$/

export function filingFlowHistoryParams(filingId: string): URLSearchParams | null {
  const id = filingId.trim()
  if (!ID_TEXT.test(id)) return null
  const params = new URLSearchParams()
  params.set('Call', 'GetFlowHistory')
  params.set('obj_id', id)
  params.set('log_pagename', 'Finished.aspx')
  return params
}

export function userInfoParams(userId: string): URLSearchParams | null {
  const id = userId.trim()
  if (!ID_TEXT.test(id)) return null
  const params = new URLSearchParams()
  params.set('Call', 'ShowUserInfo')
  params.set('user_id', id)
  return params
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 递交流程历史。Result 是历史行数组，顺序即页面上的顺序，最后一行常是「办理中」。 */
export function readFilingFlowHistory(data: unknown): ApiResult<FilingFlowRow[]> {
  if (!isRecord(data)) return apiError('INVALID_RESPONSE', '流程历史响应不是对象。')
  const client = readClientInfo(data.ClientInfo)
  if (!client.ok) return client
  if (client.data.IsLogin === false) return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效。')
  if (client.data.Status === false) return apiError('BUSINESS_ERROR', 'EASY 拒绝了流程历史查询。')
  if (!Array.isArray(data.Result)) return apiError('INVALID_RESPONSE', '流程历史 Result 不是数组。')
  const rows: FilingFlowRow[] = []
  for (const item of data.Result) {
    if (!isRecord(item)) return apiError('INVALID_RESPONSE', '流程历史的行不是对象。')
    rows.push({
      nodeName: text(item.node_name_zh_cn).trim(),
      auditUserId: text(item.audit_user_id).trim(),
      auditUserName: text(item.audit_cn_name).trim(),
      auditType: text(item.audit_type_zh_cn).trim(),
      auditTime: text(item.audit_time).trim(),
      remark: text(item.remark).trim()
    })
  }
  return { ok: true, data: rows }
}

/**
 * 人员浮窗。原站 `ShowUserInfo` 的响应外壳是 `User` 对象；抓包没收录过，
 * 这里也认直接摊在顶层的形状，读不到部门就留空，不让整条导出停住。
 */
export function readUserInfo(data: unknown, userId: string): ApiResult<FilingUser> {
  const empty: FilingUser = { userId, cnName: '', deptFullName: '', email: '', tel: '' }
  if (!isRecord(data)) return apiError('INVALID_RESPONSE', '人员信息响应不是对象。')
  // 浮窗接口的响应外壳没抓过包：有 ClientInfo 就照常校验登录，没有就直接读 User。
  if (data.ClientInfo !== undefined) {
    const client = readClientInfo(data.ClientInfo)
    if (!client.ok) return client
    if (client.data.IsLogin === false) return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效。')
  }
  const source = isRecord(data.User) ? data.User : data
  return {
    ok: true,
    data: {
      ...empty,
      cnName: text(source.cn_name).trim(),
      deptFullName: text(source.dept_full_name).trim(),
      email: text(source.email).trim(),
      tel: text(source.tel).trim()
    }
  }
}

/** 递交取数的统一并发数：翻页拉行、导出取流程历史都按这个数打满。 */
export const FILING_FETCH_CONCURRENCY = 6

/** 导出表的九列，顺序固定，第一行冻结。 */
export const FILING_EXPORT_HEADERS = ['我方文号', '申请日', '案件流向', '处理事项', '流程专员（退回者）', '代理师（接受者）', '代理师所属部门', '退回的原因', '案件状态'] as const

/** 办理结果里算「退回」的文字。 */
export const FILING_RETURN_AUDIT = '退回'
/** 退回后重新走流程的阶段名。 */
export const FILING_START_STAGE = '启动流程'

export interface FilingExportRow {
  caseVolume: string
  applyDate: string
  flowDirection: string
  ctrlProc: string
  returnedBy: string
  acceptedBy: string
  acceptedDept: string
  returnReason: string
  caseStatus: string
}

export function filingExportCells(row: FilingExportRow): string[] {
  return [row.caseVolume, row.applyDate, row.flowDirection, row.ctrlProc, row.returnedBy, row.acceptedBy, row.acceptedDept, row.returnReason, row.caseStatus]
}

/** 案件流向在列表行里是 II/IO/OI/OO 这类代码，导出写案件页上的中文名（内-外这类）。对不上就原样写。 */
export function filingFlowDirectionText(code: string): string {
  const value = code.trim()
  return FILING_SELECTS.flow_direction.find(item => item.value === value)?.label || value
}

/** 退回后接手的人：先找下面第一个「启动流程」行，没有就取再下面第一行的办理人。 */
export function acceptorAfter(flow: readonly FilingFlowRow[], index: number): FilingFlowRow | null {
  const below = flow.slice(index + 1)
  return below.find(item => item.nodeName.trim() === FILING_START_STAGE) ?? below[0] ?? null
}

/** 每个退回对应的接手人 ID。读部门前先按人去重。 */
export function acceptorUserIds(flow: readonly FilingFlowRow[]): string[] {
  const ids = new Set<string>()
  flow.forEach((row, index) => {
    if (row.auditType.trim() !== FILING_RETURN_AUDIT) return
    const accepted = acceptorAfter(flow, index)
    const id = accepted?.auditUserId.trim() ?? ''
    if (id) ids.add(id)
  })
  return [...ids]
}

export function filingExportSourceOf(filing: {
  caseVolume: string
  appDate: string
  filingDate: string
  caseStatus: string
  flowDirection: string
  ctrlProc: string
}): { caseVolume: string; applyDate: string; flowDirection: string; ctrlProc: string; caseStatus: string } {
  return {
    caseVolume: filing.caseVolume.trim(),
    // 申请日没有时用申请事项的完成日，也就是这次递交的完成时间。
    applyDate: filing.appDate.trim() || filing.filingDate.trim(),
    flowDirection: filingFlowDirectionText(filing.flowDirection),
    // 列表行里的处理事项就是中文名（新申请这类），原样写。
    ctrlProc: filing.ctrlProc.trim(),
    caseStatus: filing.caseStatus.trim()
  }
}

/**
 * 一件递交导出成 1 到 N 行：一次退回一行，我方文号只写在第一行，其余列每行照写。
 * 一件都没有退回的也出一行，免得导出里悄悄少件。
 */
export function filingExportRows(
  filing: { caseVolume: string; appDate: string; filingDate: string; caseStatus: string; flowDirection: string; ctrlProc: string },
  flow: readonly FilingFlowRow[],
  deptOf: (userId: string) => string = () => ''
): FilingExportRow[] {
  const source = filingExportSourceOf(filing)
  const returned = flow.flatMap((row, index) => (row.auditType.trim() === FILING_RETURN_AUDIT ? [{ row, index }] : []))
  const picks = returned.length ? returned : [{ row: null as FilingFlowRow | null, index: -1 }]
  return picks.map(({ row, index }, order) => {
    const accepted = row ? acceptorAfter(flow, index) : null
    return {
      caseVolume: order === 0 ? source.caseVolume : '',
      applyDate: source.applyDate,
      flowDirection: source.flowDirection,
      ctrlProc: source.ctrlProc,
      returnedBy: row?.auditUserName ?? '',
      acceptedBy: accepted?.auditUserName ?? '',
      acceptedDept: accepted?.auditUserId ? deptOf(accepted.auditUserId) : '',
      returnReason: row?.remark ?? '',
      caseStatus: source.caseStatus
    }
  })
}
