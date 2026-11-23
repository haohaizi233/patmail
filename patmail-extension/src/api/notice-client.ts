import { buildNoticeExportPayload, buildNoticeSearchPayload } from './notice-params'
import {
  isCpcAuthRequired,
  isSessionExpiredPayload,
  normalizeNoticeInitData,
  normalizeNoticeSearchResponse,
  normalizeUploadProcessDetailList,
  normalizeUploadProcessList
} from './notice-normalizer'
import { isRecord, readClientInfo } from './response-guards'
import type { EasyOperation, EasyTransport } from './transport'
import type {
  NoticeActionRequest,
  NoticeActionResult,
  NoticeExcelUploadRequest,
  NoticeExcelUploadResult,
  NoticeExportRequest,
  NoticeInitData,
  NoticeSearchRequest,
  NoticeSearchResult
} from './notice-types'
import { apiError, type ApiResult } from './types'
import { newUuid } from '../utils/uuid'

export interface NoticeClientDeps {
  transport: EasyTransport
  confirmAccountRead(): Promise<boolean>
  expireSession(): void
  isWriteOpen(): boolean
  sleep?: (ms: number) => Promise<void>
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const binary = atob(clean)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export class NoticeClient {
  private readonly sleepFn: (ms: number) => Promise<void>

  constructor(private readonly deps: NoticeClientDeps) {
    this.sleepFn = deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  }

  private async ensureSession(): Promise<boolean> {
    return this.deps.confirmAccountRead()
  }

  private checkWritePermission(): ApiResult<never> | null {
    if (!this.deps.isWriteOpen()) {
      return apiError('BUSINESS_ERROR', '写开关已关闭，无法执行变更原站数据的操作，请先在「系统设置」开启写开关。')
    }
    return null
  }

  private extractClientMessage(raw: unknown, fallbackOk: string, fallbackFail: string): {
    expired: boolean
    cpcLogin: boolean
    ok: boolean
    message: string
  } {
    if (!isRecord(raw)) {
      return { expired: false, cpcLogin: false, ok: false, message: '原站返回格式无效。' }
    }
    if (isSessionExpiredPayload(raw)) {
      this.deps.expireSession()
      return { expired: true, cpcLogin: false, ok: false, message: 'EASY 登录状态已失效，请在原网站重新登录。' }
    }
    if (isCpcAuthRequired(raw)) {
      return {
        expired: false,
        cpcLogin: true,
        ok: false,
        message: 'CPC 账号登录已过期（401），请先前往 EASY 原站「来文管理」完成扫码登录。'
      }
    }
    const info = isRecord(raw.ClientInfo) ? raw.ClientInfo : null
    if (!info) {
      return { expired: false, cpcLogin: false, ok: true, message: fallbackOk }
    }
    const parsed = readClientInfo(info)
    if (!parsed.ok) {
      return { expired: false, cpcLogin: false, ok: true, message: fallbackOk }
    }
    const msg = str(parsed.data.Message)
    if (parsed.data.Result === false) {
      return { expired: false, cpcLogin: false, ok: false, message: msg || fallbackFail }
    }
    return { expired: false, cpcLogin: false, ok: true, message: msg || fallbackOk }
  }

  async loadNoticeInit(): Promise<ApiResult<NoticeInitData>> {
    if (!(await this.ensureSession())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const warnings: string[] = []
    const fetchPart = async (label: string, op: EasyOperation, fields: Record<string, string>): Promise<unknown> => {
      try {
        const res = await this.deps.transport.post(op, new URLSearchParams(fields))
        if (!res.ok) {
          if (res.error.code === 'SESSION_EXPIRED') this.deps.expireSession()
          warnings.push(`${label}读取失败：${res.error.message}`)
          return null
        }
        return res.data
      } catch {
        warnings.push(`${label}读取异常`)
        return null
      }
    }

    // 避免 ASP.NET Session 锁队头阻塞：同源单页状态下同一 Handler 不并发多请求，并剥离慢计数由 refreshCounts 异步拉取。
    const baseInfoChain = (async () => {
      const branchesData = await fetchPart('所属分部', 'deptBranch', { Call: 'GetDeptBranch', log_pagename: 'NoticeInfo.aspx' })
      const noticeGfConfig = await fetchPart('国防官文配置', 'noticePublishConfig', {
        Call: 'GetPublishConfig',
        type: 'NoticeGF',
        key: 'NoticeGF',
        log_pagename: 'NoticeInfo.aspx'
      })
      const closeCaseConfig = await fetchPart('结案编辑配置', 'noticePublishConfig', {
        Call: 'GetPublishConfig',
        type: 'CaseButton',
        key: 'Close_this_case',
        log_pagename: 'NoticeInfo.aspx'
      })
      const closeCaseImportConfig = await fetchPart('结案来文配置', 'noticePublishConfig', {
        Call: 'GetPublishConfig',
        type: 'CaseButton',
        key: 'Close_case_import_notice',
        log_pagename: 'NoticeInfo.aspx'
      })
      const sgReduceConfig = await fetchPart('费减异常配置', 'noticePublishConfig', {
        Call: 'GetPublishConfig',
        type: 'SGReduce',
        key: 'is_fee_reduce',
        log_pagename: 'NoticeInfo.aspx'
      })
      return { branchesData, noticeGfConfig, closeCaseConfig, closeCaseImportConfig, sgReduceConfig }
    })()

    const [applyTypes, applyTags, baseInfoParts, countries, cpcAccounts] = await Promise.all([
      fetchPart('申请类型', 'noticeApplyType', { Call: 'GetApplyType', log_pagename: 'NoticeInfo.aspx' }),
      fetchPart('专利标签', 'applyTags', { Call: 'GetApplyTags', log_pagename: 'NoticeInfo.aspx' }),
      baseInfoChain,
      fetchPart('客户国家', 'noticeCountry', { Call: 'LoadCountry', log_pagename: 'NoticeInfo.aspx' }),
      fetchPart('CPC账号', 'noticeCpcAccount', { Call: 'GetCpcNoticeAccount' })
    ])

    const [agencies, fileTypes, cpcTzsDate] = await Promise.all([
      fetchPart('代理机构', 'noticeAgency', { Call: 'GetAgency', log_pagename: 'NoticeInfo.aspx' }),
      fetchPart('来文类型', 'fileTypeTree', {
        Call: 'LoadFileTypeByCaseType',
        official: '1',
        case_type: '31D1A147-2931-43B5-94AE-B72B1525BA8A',
        file_type: '',
        log_pagename: 'NoticeInfo.aspx'
      }),
      fetchPart('默认发文日', 'noticeCpcTzsDate', { Call: 'GetCPCTzsDate' })
    ])

    const [directions, users] = await Promise.all([
      fetchPart('案件流向', 'noticeDirectionType', {
        Call: 'GetDirectionType',
        log_pagename: 'NoticeInfo.aspx'
      }),
      fetchPart('人员字典', 'treeUser', {
        Call: 'GetTreeUser',
        log_pagename: 'NoticeInfo.aspx'
      })
    ])

    return {
      ok: true,
      data: normalizeNoticeInitData({
        applyTypes,
        agencies,
        directions,
        applyTags,
        branches: baseInfoParts.branchesData,
        countries,
        fileTypes,
        users,
        cpcAccounts,
        cpcTzsDate,
        noticeGfConfig: baseInfoParts.noticeGfConfig,
        closeCaseConfig: baseInfoParts.closeCaseConfig,
        closeCaseImportConfig: baseInfoParts.closeCaseImportConfig,
        sgReduceConfig: baseInfoParts.sgReduceConfig,
        warnings
      })
    }
  }

  async searchNotices(request: NoticeSearchRequest, timeoutMs?: number, signal?: AbortSignal): Promise<ApiResult<NoticeSearchResult>> {
    if (!(await this.ensureSession())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const { operation, params } = buildNoticeSearchPayload(request)
    const response = await this.deps.transport.post(operation, params, signal, timeoutMs ?? request.timeoutMs)
    if (!response.ok) {
      if (response.error.code === 'SESSION_EXPIRED') this.deps.expireSession()
      return response
    }
    const normalized = normalizeNoticeSearchResponse(
      request.tab,
      response.data,
      request.query.pageIndex,
      request.query.pageSize
    )
    if (!normalized.ok && normalized.error.code === 'SESSION_EXPIRED') {
      this.deps.expireSession()
    }
    return normalized
  }

  private async fetchCounts(): Promise<{ handCount?: number; nolaiutoCount?: number }> {
    const counts: { handCount?: number; nolaiutoCount?: number } = {}
    // 先查轻量的无需导入计数，再查可能耗时二十余秒的异常来文计数，避免互相抢占同 Handler Session 锁。
    const noRes = await this.deps.transport.post(
      'noticeNolaiutoCount',
      new URLSearchParams({ Call: 'GetNolaiutoCount', log_pagename: 'NoticeInfo.aspx' })
    )
    if (noRes.ok && isRecord(noRes.data)) {
      const raw = noRes.data.count
      if (typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw.trim()))) {
        counts.nolaiutoCount = Number(raw)
      }
    }
    const handRes = await this.deps.transport.post(
      'noticeHandList',
      new URLSearchParams({ Call: 'GetHandNoticeList', is_check: '1', log_pagename: 'NoticeInfo.aspx' })
    )
    if (handRes.ok && isRecord(handRes.data)) {
      const raw = handRes.data.TableRowsCount
      if (typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw.trim()))) {
        counts.handCount = Number(raw)
      }
    }
    return counts
  }

  private async ensureCpcLoginReady(accountId: string, accountLabel?: string): Promise<NoticeActionResult | null> {
    const label = (accountLabel ?? '').trim()
    const id = accountId.trim()
    const hasBranch = label.includes('_')
    if (hasBranch && id) {
      const res = await this.deps.transport.post('noticeCheckUserStatus', new URLSearchParams({ Call: 'CheckUserStatus', id }))
      if (!res.ok) {
        return { ok: false, message: res.error.message }
      }
      const checked = this.extractClientMessage(res.data, 'CPC 登录态有效。', 'CPC 登录校验失败。')
      if (checked.cpcLogin) {
        return { ok: false, needCpcLogin: true, loginAccountId: id, message: checked.message }
      }
      if (!checked.ok) {
        return { ok: false, message: checked.message }
      }
      return null
    }
    if (!id || hasBranch) {
      const res = await this.deps.transport.post('noticeCpcTzsUser', new URLSearchParams({ Call: 'GetCpcTzsUser' }))
      if (res.ok && isRecord(res.data) && Array.isArray(res.data.TableRows)) {
        for (const row of res.data.TableRows) {
          if (!isRecord(row)) continue
          const userName = str(row.user_name)
          const outTime = Number(row.out_time ?? 0)
          const rowId = str(row.id)
          if (userName.includes('_') && outTime > 1 && (!id || id === rowId)) {
            return {
              ok: false,
              needCpcLogin: true,
              loginAccountId: rowId || id,
              message: `分支机构 CPC 账号「${userName}」扫码登录已过期，请先前往 EASY 原站「来文管理」完成扫码登录后再操作。`
            }
          }
        }
      }
    }
    return null
  }

  private async pollStatus(
    operation: EasyOperation,
    call: string,
    busyMessage: string,
    doneMessage: string,
    maxPolls = 20,
    intervalMs = 2000
  ): Promise<NoticeActionResult> {
    for (let i = 0; i < maxPolls; i += 1) {
      await this.sleepFn(intervalMs)
      const res = await this.deps.transport.post(operation, new URLSearchParams({ Call: call }))
      if (!res.ok) {
        return { ok: false, message: `轮询状态失败：${res.error.message}` }
      }
      if (!isRecord(res.data) || !isRecord(res.data.ClientInfo)) {
        return { ok: true, message: doneMessage }
      }
      const info = res.data.ClientInfo
      if (info.IsLogin === false) {
        this.deps.expireSession()
        return { ok: false, message: 'EASY 登录状态已失效，请在原网站重新登录。' }
      }
      const resultFlag = info.Result === true
      const msg = str(info.Message)
      if (resultFlag) {
        return { ok: true, message: msg || doneMessage }
      }
      if (msg && msg !== busyMessage && !/请稍等|处理中|下载中|解析中/.test(msg)) {
        return { ok: false, message: msg }
      }
    }
    return {
      ok: true,
      message: `${doneMessage}（原站仍在后台继续处理，请稍后点「查询」刷新最新状态）`
    }
  }

  async executeNoticeAction(request: NoticeActionRequest): Promise<ApiResult<NoticeActionResult>> {
    if (!(await this.ensureSession())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }

    if (request.action === 'refreshCounts') {
      const counts = await this.fetchCounts()
      return { ok: true, data: { ok: true, message: '计数已刷新。', counts } }
    }

    if (request.action === 'getCpcTzsUser') {
      const res = await this.deps.transport.post('noticeCpcTzsUser', new URLSearchParams({ Call: 'GetCpcTzsUser' }))
      if (!res.ok) return res
      const rows = isRecord(res.data) && Array.isArray(res.data.TableRows) ? res.data.TableRows.filter(isRecord) : []
      return { ok: true, data: { ok: true, message: `已读取 ${rows.length} 条 CPC 账号状态。`, statusRows: rows } }
    }

    if (request.action === 'checkCpcUserStatus') {
      const res = await this.deps.transport.post(
        'noticeCheckUserStatus',
        new URLSearchParams({ Call: 'CheckUserStatus', id: request.accountId })
      )
      if (!res.ok) return res
      const checked = this.extractClientMessage(res.data, 'CPC 账号登录有效。', '需要登录 CPC 账号。')
      return {
        ok: true,
        data: {
          ok: checked.ok,
          needCpcLogin: checked.cpcLogin,
          loginAccountId: request.accountId,
          message: checked.message
        }
      }
    }

    if (request.action === 'getNoticeDetail') {
      const res = await this.deps.transport.post(
        'noticeDetail',
        new URLSearchParams({
          Call: 'GetNoticeDetail',
          oa_id: request.oaId,
          ctrl_proc_id: request.ctrlProcId ?? '',
          log_pagename: 'NoticeInfo.aspx'
        })
      )
      if (!res.ok) return res
      const body = isRecord(res.data) ? res.data : {}
      if (isSessionExpiredPayload(body)) {
        this.deps.expireSession()
        return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请在原网站重新登录。')
      }
      const detail = isRecord(body.NoticeInfo) ? body.NoticeInfo : {}
      const rowsOf = (payload: unknown): Record<string, unknown>[] =>
        isRecord(payload) && Array.isArray(payload.TableRows) ? payload.TableRows.filter(isRecord) : []

      const feeRes = await this.deps.transport.post(
        'noticeDetailFee',
        new URLSearchParams({ Call: 'GetNoticefee', oa_id: request.oaId, log_pagename: 'Notice.aspx' })
      )
      const heboRes = await this.deps.transport.post(
        'noticeDetailHebo',
        new URLSearchParams({ Call: 'GetNoticehebo', oa_id: request.oaId, log_pagename: 'Notice.aspx' })
      )
      const duibiRes = await this.deps.transport.post(
        'noticeDetailDuibi',
        new URLSearchParams({ Call: 'GetNoticeduibi', oa_id: request.oaId, log_pagename: 'Notice.aspx' })
      )

      return {
        ok: true,
        data: {
          ok: true,
          message: '已读取来文详情。',
          detail,
          detailFees: feeRes.ok ? rowsOf(feeRes.data) : [],
          detailHebo: heboRes.ok ? rowsOf(heboRes.data) : [],
          detailDuibi: duibiRes.ok ? rowsOf(duibiRes.data) : []
        }
      }
    }

    if (request.action === 'searchNoticeCases') {
      const key = request.keyword.trim()
      if (!key) return { ok: true, data: { ok: true, message: '请输入我方文号关键词。', caseOptions: [] } }
      const res = await this.deps.transport.post(
        'noticeSearchCase',
        new URLSearchParams({ Call: 'LoadSearchCase', Key: key, log_pagename: 'Notice.aspx' })
      )
      if (!res.ok) return res
      const body = isRecord(res.data) ? res.data : {}
      if (isSessionExpiredPayload(body)) {
        this.deps.expireSession()
        return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请在原网站重新登录。')
      }
      const caseOptions = Array.isArray(body.CaseList)
        ? body.CaseList.filter(isRecord)
            .map(row => ({ value: str(row.id), label: str(row.name) }))
            .filter(item => item.value && item.label)
        : []
      return { ok: true, data: { ok: true, message: `找到 ${caseOptions.length} 条匹配案件。`, caseOptions } }
    }

    if (request.action === 'getCaseMeta') {
      const caseId = request.caseId.trim()
      if (!caseId) return { ok: true, data: { ok: true, message: '缺少案件 ID。', chargeDept: '', caseTypeId: '' } }
      const deptRes = await this.deps.transport.post(
        'noticeCaseChargeDept',
        new URLSearchParams({ Call: 'GetCasechargedept', case_id: caseId, log_pagename: 'Notice.aspx' })
      )
      const typeRes = await this.deps.transport.post(
        'noticeCaseType',
        new URLSearchParams({ Call: 'GetNoticeCaseType', case_id: caseId, log_pagename: 'Notice.aspx' })
      )
      const chargeDept =
        deptRes.ok && isRecord(deptRes.data) && isRecord(deptRes.data.DeptInfo)
          ? str(deptRes.data.DeptInfo.dept_name)
          : ''
      const caseTypeId =
        typeRes.ok && isRecord(typeRes.data) && isRecord(typeRes.data.CaseTypeInfo)
          ? str(typeRes.data.CaseTypeInfo.case_type_id)
          : ''
      return { ok: true, data: { ok: true, message: '已同步案件部门与类型。', chargeDept, caseTypeId } }
    }

    if (request.action === 'getAppNoFiles') {
      const appNo = request.appNo.trim()
      if (!appNo) return apiError('INVALID_QUERY', '当前记录缺少申请号。')
      const res = await this.deps.transport.post(
        'noticeAppNoFiles',
        new URLSearchParams({ Call: 'GetFileListByAppNo', appNo, log_pagename: 'NoHandFileList.aspx' })
      )
      if (!res.ok) return res
      const body = isRecord(res.data) ? res.data : {}
      if (isSessionExpiredPayload(body)) {
        this.deps.expireSession()
        return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请在原网站重新登录。')
      }
      const caseFiles = Array.isArray(body.TableRows) ? body.TableRows.filter(isRecord) : []
      return { ok: true, data: { ok: true, message: `已读取 ${caseFiles.length} 条案件官文记录。`, caseFiles } }
    }

    if (request.action === 'importCheck') {
      const oaIds = request.oaIds.map(s => s.trim()).filter(Boolean).join(';')
      if (!oaIds) return apiError('INVALID_QUERY', '请先勾选要检查导入的来文。')
      const res = await this.deps.transport.post(
        'noticeCheckImport',
        new URLSearchParams({ Call: 'CheckImportNotice', oa_ids: oaIds, log_pagename: 'NoticeInfo.aspx' })
      )
      if (!res.ok) return res
      const body = isRecord(res.data) ? res.data : {}
      if (isSessionExpiredPayload(body)) {
        this.deps.expireSession()
        return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请在原网站重新登录。')
      }
      const warnings: string[] = []
      if (Array.isArray(body.CheckNotice)) {
        for (const item of body.CheckNotice) {
          if (!isRecord(item)) continue
          warnings.push(`请确认 ${str(item.NeiBuBH)} 是否下发多次「${str(item.file_desc_zh_cn)}」通知书。`)
        }
      }
      if (Array.isArray(body.SGReduce)) {
        for (const item of body.SGReduce) {
          if (!isRecord(item)) continue
          warnings.push(`我方文号为 ${str(item.case_volume)} 的案件费减情况异常，导入通知书将自动更新费减信息。`)
        }
      }
      return {
        ok: true,
        data: {
          ok: true,
          message: warnings.length ? '存在需要注意的重复通知书或费减提示，请确认后导入。' : '导入前检查通过。',
          checkWarnings: warnings
        }
      }
    }

    if (request.action === 'getUploadProcessList') {
      const res = await this.deps.transport.post(
        'noticeUploadProcess',
        new URLSearchParams({
          Call: 'GetUploadProcessList',
          pageIndex: String(request.pageIndex ?? 1),
          pageSize: String(request.pageSize ?? 10),
          log_pagename: 'UploadProcess.aspx'
        })
      )
      if (!res.ok) return res
      const body = isRecord(res.data) ? res.data : {}
      if (isSessionExpiredPayload(body)) {
        this.deps.expireSession()
        return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请在原网站重新登录。')
      }
      const uploadProcessRows = normalizeUploadProcessList(res.data)
      const rawTotal = body.TableRowsCount
      const uploadProcessTotal =
        typeof rawTotal === 'number' && Number.isFinite(rawTotal)
          ? rawTotal
          : typeof rawTotal === 'string' && /^\d+$/.test(rawTotal.trim())
            ? Number(rawTotal.trim())
            : uploadProcessRows.length
      return {
        ok: true,
        data: {
          ok: true,
          message: `已获取 ${uploadProcessRows.length} 条上传进度记录。`,
          uploadProcessRows,
          uploadProcessTotal
        }
      }
    }

    if (request.action === 'getUploadProcessDetailList') {
      const recordId = request.recordId.trim()
      if (!recordId) return apiError('INVALID_QUERY', '缺少上传批次 recordId。')
      const res = await this.deps.transport.post(
        'noticeUploadProcessDetail',
        new URLSearchParams({
          Call: 'GetUploadProcessDetailList',
          record_id: recordId,
          status: request.status ?? '-1',
          pageIndex: String(request.pageIndex ?? 1),
          pageSize: String(request.pageSize ?? 10),
          log_pagename: 'UploadProcessDetail.aspx'
        })
      )
      if (!res.ok) return res
      const body = isRecord(res.data) ? res.data : {}
      if (isSessionExpiredPayload(body)) {
        this.deps.expireSession()
        return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请在原网站重新登录。')
      }
      const { rows, total } = normalizeUploadProcessDetailList(res.data)
      return {
        ok: true,
        data: {
          ok: true,
          message: `已获取 ${rows.length} 条上传进度明细。`,
          uploadProcessDetailRows: rows,
          uploadProcessDetailTotal: total
        }
      }
    }

    if (request.action === 'openEasyNoticeTab') {
      return { ok: true, data: { ok: false, message: '请在浏览器扩展内容脚本环境打开原站来文管理页签。' } }
    }

    // 以下均为写操作，统一受写开关门禁保护
    const blocked = this.checkWritePermission()
    if (blocked) return blocked

    const joinIds = (ids: string[]) => ids.map(s => s.trim()).filter(Boolean).join(';')

    switch (request.action) {
      case 'importNotice': {
        const oaIds = joinIds(request.oaIds)
        if (!oaIds) return apiError('INVALID_QUERY', '请先勾选要导入的来文。')
        const res = await this.deps.transport.post(
          'noticeImport',
          new URLSearchParams({
            Call: 'ImportNotice',
            mail_sales: request.mailSales ?? 'N',
            oa_ids: oaIds,
            checkname: String(Boolean(request.checkName)),
            log_pagename: 'NoticeInfo.aspx'
          })
        )
        if (!res.ok) return res
        const msgInfo = this.extractClientMessage(res.data, '导入系统完成。', '导入系统失败。')
        const body = isRecord(res.data) ? res.data : {}
        const isErrorFee = Boolean(body.ISErrorFee)
        const failedReason = /失败原因|更新失败/.test(msgInfo.message)
        return {
          ok: true,
          data: {
            ok: msgInfo.ok && !failedReason,
            message: msgInfo.message,
            isErrorFee
          }
        }
      }
      case 'importCloseCase': {
        const ids = joinIds(request.oaIds)
        if (!ids) return apiError('INVALID_QUERY', '请先勾选结案案件来文。')
        const res = await this.deps.transport.post(
          'noticeImportCloseCase',
          new URLSearchParams({ Call: 'ImportCloseCase', ids, log_pagename: 'NoticeInfo.aspx' })
        )
        if (!res.ok) return res
        const msgInfo = this.extractClientMessage(res.data, '结案案件来文导入完成。', '结案案件导入失败。')
        return { ok: true, data: { ok: msgInfo.ok, message: msgInfo.message } }
      }
      case 'recoveryProcessStatus': {
        const oaIds = joinIds(request.oaIds)
        if (!oaIds) return apiError('INVALID_QUERY', '请先勾选要恢复未处理的来文。')
        const res = await this.deps.transport.post(
          'noticeRecoveryProcess',
          new URLSearchParams({ Call: 'RecoveryProcessstatus', oa_ids: oaIds, log_pagename: 'NoticeInfo.aspx' })
        )
        if (!res.ok) return res
        const msgInfo = this.extractClientMessage(res.data, '已恢复为未处理状态。', '恢复未处理失败。')
        const counts = await this.fetchCounts()
        return { ok: true, data: { ok: msgInfo.ok, message: msgInfo.message, counts } }
      }
      case 'reMatchNotice': {
        const oaIds = joinIds(request.oaIds)
        if (!oaIds) return apiError('INVALID_QUERY', '请先勾选要重新匹配的来文。')
        const res = await this.deps.transport.post(
          'noticeReMatch',
          new URLSearchParams({ Call: 'ReMatchNotice', oa_ids: oaIds, log_pagename: 'NoticeInfo.aspx' })
        )
        if (!res.ok) return res
        const msgInfo = this.extractClientMessage(res.data, '重新匹配完成。', '重新匹配失败。')
        return { ok: true, data: { ok: msgInfo.ok, message: msgInfo.message } }
      }
      case 'updateProcessStatus': {
        const oaIds = joinIds(request.oaIds)
        if (!oaIds) return apiError('INVALID_QUERY', '请先勾选要更新状态的来文。')
        const res = await this.deps.transport.post(
          'noticeUpdateProcess',
          new URLSearchParams({ Call: 'UpdateProcessstatus', oa_ids: oaIds, log_pagename: 'NoticeInfo.aspx' })
        )
        if (!res.ok) return res
        const msgInfo = this.extractClientMessage(res.data, '状态已更新为已完成。', '更新状态失败。')
        const counts = await this.fetchCounts()
        return { ok: true, data: { ok: msgInfo.ok, message: msgInfo.message, counts } }
      }
      case 'changeNolaiuto': {
        const oaIds = joinIds(request.oaIds)
        if (!oaIds) return apiError('INVALID_QUERY', '请先勾选要修改的数据。')
        const res = await this.deps.transport.post(
          'noticeChangeNolaiuto',
          new URLSearchParams({ Call: 'ChangeNolaiuto', oa_ids: oaIds, value: request.value, log_pagename: 'NoticeInfo.aspx' })
        )
        if (!res.ok) return res
        const okLabel = request.value === '1' ? '已添加到无需导入来文。' : '已恢复到导入来文。'
        const msgInfo = this.extractClientMessage(res.data, okLabel, '操作失败。')
        const counts = await this.fetchCounts()
        return { ok: true, data: { ok: msgInfo.ok, message: msgInfo.message, counts } }
      }
      case 'updateCaseName': {
        const oaIds = joinIds(request.oaIds)
        if (!oaIds) return apiError('INVALID_QUERY', '请先勾选要更新案件名称的来文。')
        const res = await this.deps.transport.post(
          'noticeUpdateCaseName',
          new URLSearchParams({ Call: 'UpdateCaseName', oa_ids: oaIds, log_pagename: 'NoticeInfo.aspx' })
        )
        if (!res.ok) return res
        const msgInfo = this.extractClientMessage(res.data, '批量更新案件名称完成。', '更新案件名称失败。')
        return { ok: true, data: { ok: msgInfo.ok, message: msgInfo.message } }
      }
      case 'recoveryStatusAnalyse': {
        const oaIds = joinIds(request.oaIds)
        if (!oaIds) return apiError('INVALID_QUERY', '请先勾选要恢复并重新分析的来文。')
        const res = await this.deps.transport.post(
          'noticeRecoveryStatusAnalyse',
          new URLSearchParams({ Call: 'RecoveryStatusAnalyse', oa_ids: oaIds, log_pagename: 'NoticeInfo.aspx' })
        )
        if (!res.ok) return res
        const msgInfo = this.extractClientMessage(res.data, '已恢复未处理并返还递交助手重新分析。', '恢复并重新分析失败。')
        const counts = await this.fetchCounts()
        return { ok: true, data: { ok: msgInfo.ok, message: msgInfo.message, counts } }
      }
      case 'mailCustomer': {
        const oaIds = joinIds(request.oaIds)
        if (!oaIds) return apiError('INVALID_QUERY', '请先勾选要发文给客户的来文。')
        const res = await this.deps.transport.post(
          'mailCustomer',
          new URLSearchParams({ Call: 'MailCustomer', oa_ids: oaIds, mailstyle: request.mailStyle, log_pagename: 'NoticeMail.aspx' })
        )
        if (!res.ok) return res
        const msgInfo = this.extractClientMessage(res.data, '发文草稿已建立，可在 EASY 发文草稿或 PatMail 发文模块查看。', '创建发文草稿失败。')
        return { ok: true, data: { ok: msgInfo.ok, message: msgInfo.message } }
      }
      case 'saveNoticeDetail': {
        if (!request.caseId.trim()) return apiError('INVALID_QUERY', '我方文号/案件编号不能为空。')
        const res = await this.deps.transport.post(
          'noticeSaveDetail',
          new URLSearchParams({
            Call: 'SaveNoticeDetail',
            oa_id: request.oaId,
            import_id: request.importId,
            oa_date: request.oaDate,
            oa_name: request.oaTypeId,
            case_id: request.caseId,
            issue_no: request.issueNo ?? '',
            issue_date: request.issueDate ?? '',
            certificate_no: request.certificateNo ?? '',
            log_pagename: 'NoticeInfo.aspx'
          })
        )
        if (!res.ok) return res
        const msgInfo = this.extractClientMessage(res.data, '来文详情保存成功。', '保存来文详情失败。')
        return { ok: true, data: { ok: msgInfo.ok, message: msgInfo.message } }
      }
      case 'updateHandExcel': {
        const docNos = joinIds(request.docNos)
        if (!docNos) return apiError('INVALID_QUERY', '请先勾选要更新状态的清单记录。')
        const res = await this.deps.transport.post(
          'noticeUpdateHandExcel',
          new URLSearchParams({ Call: 'UpdateHandExcel', doc_nos: docNos, log_pagename: 'NoticeInfo.aspx' })
        )
        if (!res.ok) return res
        const msgInfo = this.extractClientMessage(res.data, '清单处理状态已更新。', '更新清单处理状态失败。')
        return { ok: true, data: { ok: msgInfo.ok, message: msgInfo.message } }
      }
      case 'deleteDownloadOa': {
        const fids = joinIds(request.fids)
        if (!fids) return apiError('INVALID_QUERY', '请先勾选要删除的通知书文件。')
        const res = await this.deps.transport.post(
          'noticeDeleteOaByFids',
          new URLSearchParams({ Call: 'DeleteOaInfoByFids', fids })
        )
        if (!res.ok) return res
        const msgInfo = this.extractClientMessage(res.data, '删除完成，如需重新下载可前往「来文二次下载」。', '删除失败。')
        return { ok: true, data: { ok: msgInfo.ok, message: msgInfo.message } }
      }
      case 'fetchTzsList': {
        const loginBlock = await this.ensureCpcLoginReady(request.account, request.accountLabel)
        if (loginBlock) return { ok: true, data: loginBlock }
        const res = await this.deps.transport.post(
          'noticeGetTzsList',
          new URLSearchParams({
            Call: 'GetTzsList',
            account: request.account.trim(),
            casename: (request.casename ?? '').trim(),
            appno: (request.appno ?? '').trim(),
            startTime: (request.startTime ?? '').trim(),
            endTime: (request.endTime ?? '').trim(),
            status: request.status ?? ''
          })
        )
        if (!res.ok) return res
        const started = this.extractClientMessage(res.data, '已触发获取官文列表。', '获取官文列表失败。')
        if (!started.ok) return { ok: true, data: { ok: false, needCpcLogin: started.cpcLogin, message: started.message } }
        const polled = await this.pollStatus('noticeGetTzsListStatus', 'GetTzsListStatus', '通知书下载中,请稍等!', '通知书列表下载完成。')
        return { ok: true, data: polled }
      }
      case 'downloadTzsList': {
        const loginBlock = await this.ensureCpcLoginReady(request.account, request.accountLabel)
        if (loginBlock) return { ok: true, data: loginBlock }
        const p = new URLSearchParams({
          Call: 'ProcessTzsList',
          account: request.account.trim(),
          startTime: (request.startTime ?? '').trim(),
          endTime: (request.endTime ?? '').trim()
        })
        if (request.fids?.length) {
          p.set('fids', joinIds(request.fids))
          p.set('xlh', joinIds(request.xlh ?? []))
        } else {
          p.set('casename', (request.casename ?? '').trim())
          p.set('appno', (request.appno ?? '').trim())
          p.set('status', request.status ?? '')
        }
        const res = await this.deps.transport.post('noticeProcessTzsList', p)
        if (!res.ok) return res
        const started = this.extractClientMessage(res.data, '已开始解析通知书。', '触发解析下载失败。')
        if (!started.ok) return { ok: true, data: { ok: false, needCpcLogin: started.cpcLogin, message: started.message } }
        const polled = await this.pollStatus('noticeProcessTzsListStatus', 'ProcessTzsListStatus', '通知书处理中,请稍等!', '通知书分析下载完成。', 25, 2500)
        if (request.isReplay && request.fids?.length) {
          const replayStatus = await this.deps.transport.post(
            'noticeReplayTzsStatus',
            new URLSearchParams({ Call: 'GetReaplyTzsStatus', fids: joinIds(request.fids) })
          )
          if (replayStatus.ok && isRecord(replayStatus.data) && Array.isArray(replayStatus.data.rows)) {
            polled.statusRows = replayStatus.data.rows.filter(isRecord)
          }
        }
        return { ok: true, data: polled }
      }
      case 'fetchCertList': {
        const loginBlock = await this.ensureCpcLoginReady(request.account, request.accountLabel)
        if (loginBlock) return { ok: true, data: loginBlock }
        const res = await this.deps.transport.post(
          'noticeGetCpcCertList',
          new URLSearchParams({
            Call: 'GetCpcCertList',
            account: request.account.trim(),
            casename: (request.casename ?? '').trim(),
            appno: (request.appno ?? '').trim(),
            startTime: (request.startTime ?? '').trim(),
            endTime: (request.endTime ?? '').trim(),
            status: request.status ?? '',
            xlh: (request.xlh ?? '').trim()
          })
        )
        if (!res.ok) return res
        const started = this.extractClientMessage(res.data, '已触发获取证书列表。', '获取证书列表失败。')
        if (!started.ok) return { ok: true, data: { ok: false, needCpcLogin: started.cpcLogin, message: started.message } }
        const polled = await this.pollStatus('noticeGetCertListStatus', 'GetCertListStatus', '专利证书列表获取中,请稍等!', '专利证书列表获取完成。')
        return { ok: true, data: polled }
      }
      case 'downloadCertList': {
        const loginBlock = await this.ensureCpcLoginReady(request.account, request.accountLabel)
        if (loginBlock) return { ok: true, data: loginBlock }
        const p = new URLSearchParams({
          Call: 'DownloadAndAnalyseCert',
          account: request.account.trim()
        })
        if (request.fids?.length) {
          p.set('fids', joinIds(request.fids))
          p.set('xlh', joinIds(request.xlh ?? []))
        }
        const res = await this.deps.transport.post('noticeDownloadAnalyseCert', p)
        if (!res.ok) return res
        const started = this.extractClientMessage(res.data, '开始下载解析专利电子证书。', '下载解析专利电子证书失败。')
        if (!started.ok) return { ok: true, data: { ok: false, needCpcLogin: started.cpcLogin, message: started.message } }
        const polled = await this.pollStatus('noticeGetAnalyseCertStatus', 'GetAnalyseCertStatus', '专利证书解析中,请稍等!', '专利电子证书分析完成。', 25, 2500)
        return { ok: true, data: polled }
      }
      case 'uploadCpcZip': {
        const files = request.files?.length
          ? request.files
          : [{ fileName: request.fileName, mimeType: request.mimeType, base64: request.base64 }]
        const validFiles = files.filter(f => f.fileName.trim() && f.base64)
        if (!validFiles.length) return apiError('INVALID_QUERY', '请先选择要上传的压缩包文件。')
        const guid = newUuid()
        for (const item of validFiles) {
          const bytes = base64ToUint8Array(item.base64)
          const blob = new Blob([bytes], { type: item.mimeType || 'application/zip' })
          const form = new FormData()
          form.append('name', item.fileName)
          form.append('file', blob, item.fileName)
          const chunkRes = await this.deps.transport.postMultipart('noticeUploadCpcChunk', form, { GUID: guid })
          if (!chunkRes.ok) return chunkRes
        }
        const op: EasyOperation = request.kind === 'gf' ? 'noticeUploadCpcNewGf' : 'noticeUploadCpcNew'
        const call = request.kind === 'gf' ? 'UploadCPCFileNewGF' : 'UploadCPCFileNew'
        const finishRes = await this.deps.transport.post(op, new URLSearchParams({ Call: call, GUID: guid }))
        if (!finishRes.ok) return finishRes
        const body = isRecord(finishRes.data) ? finishRes.data : {}
        const msgInfo = this.extractClientMessage(
          finishRes.data,
          `已上传 ${validFiles.length} 个官文压缩包并提交解析，可在「查看上传进度」跟踪结果。`,
          '官文压缩包解析触发失败。'
        )
        const uploadTips = str(body.Tips)
        const uploadedOaIds = str(body.oa_ids)
        return {
          ok: true,
          data: {
            ok: msgInfo.ok,
            message: msgInfo.message,
            ...(uploadTips ? { uploadTips } : {}),
            ...(uploadedOaIds ? { uploadedOaIds } : {})
          }
        }
      }
    }
  }

  async exportNoticeExcel(request: NoticeExportRequest): Promise<
    ApiResult<{ async: boolean; downloadUrl?: string; fileGuid?: string; fileSize?: number | null; message: string }>
  > {
    if (!(await this.ensureSession())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    if ((request.tab === 'cert' || request.tab === 'replay') && request.accountLabel?.includes('_')) {
      const loginBlock = await this.ensureCpcLoginReady(request.query.account, request.accountLabel)
      if (loginBlock) {
        return apiError('BUSINESS_ERROR', loginBlock.message)
      }
    }
    const { operation, params } = buildNoticeExportPayload(request)
    const response = await this.deps.transport.post(operation, params, undefined, request.timeoutMs)
    if (!response.ok) {
      if (response.error.code === 'SESSION_EXPIRED') this.deps.expireSession()
      return response
    }
    const body = isRecord(response.data) ? response.data : {}
    if (isSessionExpiredPayload(body)) {
      this.deps.expireSession()
      return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请在原网站重新登录。')
    }
    if (isCpcAuthRequired(body)) {
      return apiError('BUSINESS_ERROR', 'CPC 账号登录已过期（401），请先前往 EASY 原站「来文管理」完成扫码登录。')
    }
    const info = isRecord(body.ClientInfo) ? body.ClientInfo : null
    if (info && info.Result === false) {
      return apiError('BUSINESS_ERROR', str(info.Message) || '原站导出失败。')
    }
    if (info && info.Asyn === true) {
      return {
        ok: true,
        data: {
          async: true,
          message: '数据量较大，原站已转为后台异步生成，请前往 EASY「下载清单」页面下载。'
        }
      }
    }
    const fileGuid = str(body.file_guid)
    const rawSize =
      typeof body.file_size === 'number'
        ? body.file_size
        : typeof body.file_size === 'string' && /^\d+$/.test(body.file_size.trim())
          ? Number(body.file_size.trim())
          : null
    const downloadUrl = fileGuid ? this.deps.transport.fileDownloadUrl(fileGuid, rawSize) : null
    if (!downloadUrl) {
      return apiError('BUSINESS_ERROR', str(info?.Message) || '原站未返回有效的导出文件地址（可能当前条件下无可导出数据）。')
    }
    return {
      ok: true,
      data: {
        async: false,
        downloadUrl,
        fileGuid,
        fileSize: rawSize,
        message: '原站 Excel 清单已生成，正在通过浏览器下载。'
      }
    }
  }

  async uploadNoticeExcel(request: NoticeExcelUploadRequest): Promise<ApiResult<NoticeExcelUploadResult>> {
    if (!(await this.ensureSession())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const blocked = this.checkWritePermission()
    if (blocked) return blocked
    const fileName = request.fileName.trim()
    if (!fileName || !request.base64) {
      return apiError('INVALID_QUERY', '请先选择要上传的电子申请清单 Excel 文件。')
    }
    const bytes = base64ToUint8Array(request.base64)
    const blob = new Blob([bytes], {
      type: request.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const form = new FormData()
    form.append('file_excel', blob, fileName)

    const response = await this.deps.transport.postMultipart('noticeUploadExcel', form)
    if (!response.ok) {
      if (response.error.code === 'SESSION_EXPIRED') this.deps.expireSession()
      return response
    }
    const msgInfo = this.extractClientMessage(response.data, '清单上传成功，已刷新清单对比数据。', '清单导入失败，请检查文件格式后重试。')
    return { ok: true, data: { ok: msgInfo.ok, message: msgInfo.message } }
  }
}
