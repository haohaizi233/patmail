import { buildIcSearchParams, icCasesFromBody, type IcCaseHit } from './ic-search'
import { isRecord } from './response-guards'
import type { EasyTransport } from './transport'
import { apiError, type ApiResult } from './types'
import { readLastStatus, versionAgrees } from '../workflow/contracts'
import { pickFeeReduceReviewer } from '../workflow/fee-reduce-input'
import type {
  FeeReduceCheckpoint,
  FeeReduceCaseInspectItem,
  FeeReduceInspectResult,
  FeeReduceReviewerOption,
  FeeReduceReviewersResult,
  FeeReduceSubmitRequest,
  FeeReduceSubmitResult
} from './fee-reduce-types'

const FEE_REDUCE_PROC_NAME = '请求费用减缓'
const FEE_REDUCE_FILE_CODE = '100008'
const FEE_REDUCE_TYPE_NAME = '费用减缴请求'
const DEFAULT_LEVEL_ONE_ID = 'B3E65076-97D7-4423-A6BF-EA8B54AC4174'
const DEFAULT_LEVEL_TWO_ID = '98C0C9E2-FB7D-445D-BCA2-72191F9A035B'
const ZERO_GUID = '00000000-0000-0000-0000-000000000000'
const IC_BATCH_SIZE = 8
const DEFAULT_INSPECT_CONCURRENCY = 6
const CONVERT_POLL_INTERVAL_MS = 2000
const CONVERT_POLL_TIMEOUT_MS = 60_000

export interface FeeReduceClientOptions {
  pollIntervalMs?: number
  pollTimeoutMs?: number
  sleep?: (ms: number) => Promise<void>
}

function volumeKey(value: string): string {
  return value.replace(/\s/g, '').toUpperCase()
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function clientInfo(data: unknown): { result: boolean; status: boolean; message: string } {
  if (!isRecord(data) || !isRecord(data.ClientInfo)) {
    return { result: false, status: false, message: '' }
  }
  const ci = data.ClientInfo
  return {
    result: ci.Result === true,
    status: ci.Status === true,
    message: str(ci.Message)
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  const limit = Math.max(1, Math.min(concurrency, items.length))
  let nextIndex = 0
  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const idx = nextIndex
      nextIndex += 1
      await worker(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: limit }, () => runWorker()))
}

export class FeeReduceClient {
  private readonly pollIntervalMs: number
  private readonly pollTimeoutMs: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(
    private readonly transport: EasyTransport,
    options: FeeReduceClientOptions = {}
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? CONVERT_POLL_INTERVAL_MS
    this.pollTimeoutMs = options.pollTimeoutMs ?? CONVERT_POLL_TIMEOUT_MS
    this.sleep = options.sleep ?? defaultSleep
  }

  async inspectCases(
    caseVolumes: string[],
    concurrency = DEFAULT_INSPECT_CONCURRENCY
  ): Promise<ApiResult<FeeReduceInspectResult>> {
    const cleaned = caseVolumes.map(v => v.trim()).filter(Boolean)
    if (!cleaned.length) {
      return apiError('INVALID_QUERY', '请至少输入一个我方文号。')
    }

    const queryable = cleaned.filter(v => v.length <= 80)
    const batches: string[][] = []
    for (let i = 0; i < queryable.length; i += IC_BATCH_SIZE) {
      batches.push(queryable.slice(i, i + IC_BATCH_SIZE))
    }

    const hitMap = new Map<string, IcCaseHit & { caseName: string; appNo: string }>()
    let fatalError: ApiResult<never> | null = null

    await runConcurrent(batches, concurrency, async batch => {
      if (fatalError) return
      const params = buildIcSearchParams(batch.join(';'), Date.now, 'case_volume')
      if (!params.ok) {
        fatalError = params
        return
      }
      const res = await this.transport.post('icSearch', params.data)
      if (!res.ok) {
        fatalError = res
        return
      }
      const hits = icCasesFromBody(res.data)
      const rows = isRecord(res.data) && Array.isArray(res.data.TableRows) ? res.data.TableRows : []
      for (const hit of hits) {
        const raw = rows.find(
          r => isRecord(r) && str(r.case_id).toLowerCase() === hit.caseId.toLowerCase()
        ) as Record<string, unknown> | undefined
        hitMap.set(volumeKey(hit.caseVolume), {
          ...hit,
          caseName: raw ? str(raw.case_name) : '',
          appNo: raw ? str(raw.app_no) : ''
        })
      }
    })

    if (fatalError) return fatalError

    const items: FeeReduceCaseInspectItem[] = new Array(cleaned.length)
    let sessionError: ApiResult<never> | null = null

    await runConcurrent(cleaned, concurrency, async (volume, idx) => {
      if (sessionError) return
      if (volume.length > 80) {
        items[idx] = {
          caseVolume: volume,
          caseId: '',
          caseName: '',
          appNo: '',
          procId: '',
          procName: '',
          procStatus: '',
          state: 'error',
          reason: '我方文号长度超过 80 字符，无法检索。'
        }
        return
      }
      const hit = hitMap.get(volumeKey(volume))
      if (!hit) {
        items[idx] = {
          caseVolume: volume,
          caseId: '',
          caseName: '',
          appNo: '',
          procId: '',
          procName: '',
          procStatus: '',
          state: 'not_found',
          reason: '案件查询未找到该我方文号。'
        }
        return
      }

      const procListRes = await this.readCaseProcesses(hit.caseId)
      if (!procListRes.ok) {
        if (procListRes.error.code === 'SESSION_EXPIRED') {
          sessionError = procListRes
          return
        }
        items[idx] = {
          caseVolume: hit.caseVolume,
          caseId: hit.caseId,
          caseName: hit.caseName,
          appNo: hit.appNo,
          procId: '',
          procName: '',
          procStatus: '',
          state: 'error',
          reason: procListRes.error.message || '读取案件处理事项失败。'
        }
        return
      }

      const feeReduceRows = procListRes.data.filter(row => str(row.ctrl_proc) === FEE_REDUCE_PROC_NAME)
      const matched =
        feeReduceRows.find(row => str(row.proc_status) === '撰写中') ??
        feeReduceRows[feeReduceRows.length - 1]

      if (!matched) {
        items[idx] = {
          caseVolume: hit.caseVolume,
          caseId: hit.caseId,
          caseName: hit.caseName,
          appNo: hit.appNo,
          procId: '',
          procName: '',
          procStatus: '',
          state: 'missing_proc',
          reason: `案件中未找到「${FEE_REDUCE_PROC_NAME}」处理事项。`
        }
        return
      }

      const procId = str(matched.proc_id)
      const procStatus = str(matched.proc_status)

      if (procStatus === '递交中' || procStatus === '完成') {
        items[idx] = {
          caseVolume: hit.caseVolume,
          caseId: hit.caseId,
          caseName: hit.caseName,
          appNo: hit.appNo,
          procId,
          procName: FEE_REDUCE_PROC_NAME,
          procStatus,
          state: 'completed',
          reason: `处理状态为「${procStatus}」，已完成。`
        }
      } else if (procStatus === '撰写中') {
        items[idx] = {
          caseVolume: hit.caseVolume,
          caseId: hit.caseId,
          caseName: hit.caseName,
          appNo: hit.appNo,
          procId,
          procName: FEE_REDUCE_PROC_NAME,
          procStatus,
          state: 'ready',
          reason: '处理状态为「撰写中」，可递交。'
        }
      } else {
        items[idx] = {
          caseVolume: hit.caseVolume,
          caseId: hit.caseId,
          caseName: hit.caseName,
          appNo: hit.appNo,
          procId,
          procName: FEE_REDUCE_PROC_NAME,
          procStatus,
          state: 'other_status',
          reason: procStatus ? `当前状态为「${procStatus}」，不在自动递交范围。` : '处理状态为空，无法判断。'
        }
      }
    })

    if (sessionError) return sessionError
    return { ok: true, data: { items } }
  }

  async readReviewers(): Promise<ApiResult<FeeReduceReviewersResult>> {
    const flowCtx = await this.loadProceContext('')
    if (!flowCtx.ok) return flowCtx
    return {
      ok: true,
      data: {
        reviewers: flowCtx.data.candidates,
        nodeName: flowCtx.data.proceNodeName,
        message: flowCtx.data.candidates.length
          ? `已读取「${flowCtx.data.proceNodeName}」候选人（${flowCtx.data.candidates.length} 位）。`
          : '未读到流程人员初核候选人。'
      }
    }
  }

  async submitFeeReduce(request: FeeReduceSubmitRequest, checkpoint?: FeeReduceCheckpoint): Promise<ApiResult<FeeReduceSubmitResult>> {
    const warnings: string[] = []

    const checkCtrlRes = await this.transport.post(
      'checkCtrlProc',
      new URLSearchParams([
        ['Call', 'CheckCtrlProc'],
        ['proc_id', request.procId],
        ['log_pagename', 'CaseManage.aspx']
      ])
    )
    if (!checkCtrlRes.ok) return checkCtrlRes
    const ctrlInfo = clientInfo(checkCtrlRes.data)
    if (!ctrlInfo.result) {
      return this.recheckFilingRejection(request, ctrlInfo.message || 'CheckCtrlProc 校验未通过，无法发起递交。')
    }

    let filingId = str(request.resumeFilingId)
    if (!filingId) {
      const verificateRes = await this.transport.post('verificateFiling', new URLSearchParams([
        ['Call', 'VerificateFiling'],
        ['case_id', request.caseId],
        ['proc_id', request.procId],
        ['log_pagename', 'CaseManage.aspx']
      ]))
      if (!verificateRes.ok) return verificateRes
      const verificateInfo = clientInfo(verificateRes.data)
      if (!verificateInfo.result) {
        return this.recheckFilingRejection(request, verificateInfo.message || 'VerificateFiling 校验未通过，无法发起递交。')
      }
    } else {
      const last = await this.readLastFilingStatus(filingId)
      if (!last.ok) return last
      if (last.data.present) return apiError('BUSINESS_ERROR', '该递交单已有流程记录，请在 EASY 核对后再处理。')
    }

    const { levelOne, levelTwo } = await this.resolveFeeReduceTypeIds()
    if (!filingId) {
      await checkpoint?.('creating')
      const insertRes = await this.transport.post(
        'insertNewFiling',
        new URLSearchParams([
          ['Call', 'InsertNewFiling'],
          ['case_id', request.caseId],
          ['proc_id', request.procId],
          ['filing_type', 'E'],
          ['filing_new', '1'],
          ['levelOne', levelOne],
          ['levelTwo', levelTwo],
          ['levelThree', ''],
          ['log_pagename', 'Filing.aspx']
        ])
      )
      if (!insertRes.ok) return insertRes
      const insertInfo = clientInfo(insertRes.data)
      filingId = isRecord(insertRes.data) ? str(insertRes.data.id) : ''
      if (!insertInfo.result || !filingId) {
        return apiError('BUSINESS_ERROR', insertInfo.message || '创建递交单（InsertNewFiling）失败。')
      }
    }
    await checkpoint?.('draft', filingId)

    const saveCpcRes = await this.transport.post(
      'saveCpcType',
      new URLSearchParams([
        ['Call', 'SaveCPCType'],
        ['levelOneCode', levelOne],
        ['levelTwoCode', levelTwo],
        ['levelThreeCode', ''],
        ['filing_id', filingId],
        ['log_pagename', 'Filing.aspx']
      ])
    )
    if (!saveCpcRes.ok) return saveCpcRes
    const saveCpcInfo = clientInfo(saveCpcRes.data)
    if (!saveCpcInfo.result) {
      return apiError('BUSINESS_ERROR', saveCpcInfo.message || '保存 CPC 业务类型失败。')
    }

    await checkpoint?.('draft', filingId)
    const saveTypeRes = await this.transport.post(
      'saveFilingType',
      new URLSearchParams([
        ['Call', 'SaveFilingType'],
        ['filing_id', filingId],
        ['file_desc_code', FEE_REDUCE_FILE_CODE],
        ['number', ''],
        ['type', FEE_REDUCE_TYPE_NAME],
        ['log_pagename', 'Filing.aspx']
      ])
    )
    if (!saveTypeRes.ok) return saveTypeRes
    const saveTypeInfo = clientInfo(saveTypeRes.data)
    if (!saveTypeInfo.result) {
      return apiError('BUSINESS_ERROR', saveTypeInfo.message || '保存递交文件类型失败。')
    }

    await checkpoint?.('draft', filingId)
    const saveFeeReduceRes = await this.transport.post(
      'saveFeeReduceRspInfo',
      new URLSearchParams([
        ['oa_name', str(request.oaName)],
        ['Call', 'SaveFeeReduceRspInfo'],
        ['filing_id', filingId],
        ['log_pagename', 'Filing.aspx']
      ])
    )
    if (!saveFeeReduceRes.ok) return saveFeeReduceRes
    const saveFeeReduceInfo = clientInfo(saveFeeReduceRes.data)
    if (!saveFeeReduceInfo.result) {
      return apiError('BUSINESS_ERROR', saveFeeReduceInfo.message || '保存费用减缴请求信息失败。')
    }

    for (const op of ['checkFilingResult', 'checkSplitPdf', 'checkFirstInventor'] as const) {
      const checkRes = await this.transport.post(
        op,
        new URLSearchParams([
          ['Call', op === 'checkFilingResult' ? 'CheckResult' : op === 'checkSplitPdf' ? 'CheckSplitPDF' : 'CheckFirstInventor'],
          ['filing_id', filingId],
          ['log_pagename', 'Filing.aspx']
        ])
      )
      if (checkRes.ok) {
        const msg = clientInfo(checkRes.data).message
        if (msg) warnings.push(msg)
      }
    }

    await checkpoint?.('draft', filingId)
    const convertRes = await this.transport.post(
      'convertSubmit',
      new URLSearchParams([
        ['Call', 'ConvertSubmit'],
        ['filing_id', filingId],
        ['flow_code', 'FIRST'],
        ['convert_format', 'XML'],
        ['adv_option_json', ''],
        ['log_pagename', 'Filing.aspx']
      ])
    )
    if (!convertRes.ok) return convertRes
    const convertInfo = clientInfo(convertRes.data)
    if (!convertInfo.result) {
      return apiError('BUSINESS_ERROR', convertInfo.message || '触发 XML 转档（ConvertSubmit）失败。')
    }

    const convertedOk = await this.pollConvertStatus(filingId)
    if (!convertedOk.ok) return convertedOk

    const filesRes = await this.transport.post(
      'getConvertedFile',
      new URLSearchParams([
        ['Call', 'GetConvertedFile'],
        ['filing_id', filingId],
        ['pageSize', '10'],
        ['pageIndex', '1'],
        ['log_pagename', 'Filing.aspx']
      ])
    )
    const convertedFiles: string[] = []
    if (filesRes.ok && isRecord(filesRes.data) && Array.isArray(filesRes.data.TableRows)) {
      for (const row of filesRes.data.TableRows) {
        if (isRecord(row)) {
          const name = str(row.file_desc) || str(row.file_name)
          if (name) convertedFiles.push(name)
        }
      }
    }

    const flowCtx = await this.loadProceContext(filingId)
    if (!flowCtx.ok) return flowCtx

    const picked = pickFeeReduceReviewer(
      flowCtx.data.candidates,
      request.reviewerStrategy ?? 'first',
      request.defaultReviewerId,
      request.overrideReviewerId
    )
    if (!picked) {
      return apiError('BUSINESS_ERROR', request.overrideReviewerId || request.reviewerStrategy === 'specific'
        ? '指定初核人不在当前递交单的候选列表中，请重新选择。'
        : '未找到可用的「流程人员初核」审核人。')
    }

    const urgencyRes = await this.transport.post(
      'getUrgencyList',
      new URLSearchParams([
        ['Call', 'GetUrgencyList'],
        ['log_pagename', 'IhgFlow.aspx']
      ])
    )
    if (!urgencyRes.ok) return urgencyRes
    const urgencyList = isRecord(urgencyRes.data) && Array.isArray(urgencyRes.data.UrgencyList)
      ? urgencyRes.data.UrgencyList.filter(isRecord) : []
    const urgencyId = str(urgencyList.find(item => str(item.urgency_code) === 'CM')?.urgency_id)
    if (!urgencyId) return apiError('INVALID_RESPONSE', '未读到 EASY 的一般紧急度，已停止提交。')

    const last = await this.readLastFilingStatus(filingId)
    if (!last.ok) return last
    const { curStatus, curNodeCode, versionToken } = flowCtx.data
    if (!/^-?\d+$/.test(curStatus) || (curStatus !== '-1' && curNodeCode !== 'FIRST') ||
        versionAgrees(Number(curStatus), versionToken, last.data.present, last.data.token) !== 'match') {
      return apiError('BUSINESS_ERROR', '无法确认递交单仍处于可提交的初始流程状态，请在 EASY 核对。')
    }

    const nextUserName = picked.count === null ? picked.name : `${picked.name}(${picked.count})`
    const submitParams = new URLSearchParams([
      ['handler', 'FilingAction.ashx'],
      ['Call', 'FilingSubmit'],
      ['f_audit_type_id', 'submit'],
      ['f_next_user_id', picked.userId],
      ['f_next_user_name', nextUserName],
      ['f_remark', str(request.remark) || '同意'],
      ['f_ep_proc', ''],
      ['f_obj_id', filingId],
      ['f_cur_status', flowCtx.data.curStatus || '-1'],
      ['f_status', '1000'],
      ['f_allow_edit', '1'],
      ['f_flow_id', flowCtx.data.flowId],
      ['f_flow_type', 'EF'],
      ['f_flow_sub_type', 'OA'],
      ['f_cur_node_id', flowCtx.data.firstNodeId],
      ['f_cur_node_code', 'FIRST'],
      ['f_next_node_id', flowCtx.data.proceNodeId],
      ['f_next_node_code', 'PROCE'],
      ['f_list_id', flowCtx.data.proceListId],
      ['f_cur_node', flowCtx.data.firstNodeName || '启动流程'],
      ['pic_user', ''],
      ['int_due_date', ''],
      ['cus_due_date', ''],
      ['leg_due_date', ''],
      ['f_score', ''],
      ['f_is_parallel', '0'],
      ['f_urgency_id', urgencyId],
      ['finishdate', 'false'],
      ['f_cur_proc_status_fd', ''],
      ['f_cur_remark_fd', ''],
      ['f_cur_proc_note_fd', ''],
      ['log_pagename', 'IhgFlow.aspx']
    ])

    await checkpoint?.('submitting', filingId)
    const submitRes = await this.transport.post('filingSubmit', submitParams)
    if (!submitRes.ok) return submitRes
    const submitInfo = clientInfo(submitRes.data)
    if (!submitInfo.result) {
      return apiError('BUSINESS_ERROR', submitInfo.message || '递交提交（FilingSubmit）失败。')
    }

    return {
      ok: true,
      data: {
        caseVolume: request.caseVolume,
        caseId: request.caseId,
        procId: request.procId,
        filingId,
        reviewerId: picked.userId,
        reviewerName: nextUserName,
        convertedFiles,
        warnings,
        message: `已提交至「${flowCtx.data.proceNodeName || '流程人员初核'}」（${nextUserName}）。`
      }
    }
  }

  private async readCaseProcesses(caseId: string): Promise<ApiResult<Record<string, unknown>[]>> {
    const result = await this.transport.post('getProcList', new URLSearchParams([
      ['Call', 'GetProcList'],
      ['case_id', caseId],
      ['pageSize', '50'],
      ['pageIndex', '1'],
      ['_PK', 'proc_id'],
      ['log_pagename', 'CaseManage.aspx']
    ]))
    if (!result.ok) return result
    return { ok: true, data: isRecord(result.data) && Array.isArray(result.data.TableRows)
      ? result.data.TableRows.filter(isRecord) : [] }
  }

  private async recheckFilingRejection(request: FeeReduceSubmitRequest, message: string): Promise<ApiResult<FeeReduceSubmitResult>> {
    if (!/处理事项\s*已(?:经)?完成/.test(message)) return apiError('BUSINESS_ERROR', message)
    const processes = await this.readCaseProcesses(request.caseId)
    if (!processes.ok) return apiError(processes.error.code, `${message}。回查失败：${processes.error.message}`)
    const process = processes.data.find(row => str(row.proc_id).toLowerCase() === request.procId.toLowerCase() &&
      str(row.ctrl_proc) === FEE_REDUCE_PROC_NAME)
    const procStatus = str(process?.proc_status)
    if (procStatus !== '完成' && procStatus !== '递交中') {
      return apiError('BUSINESS_ERROR', `${message}。回查未能确认该处理事项已完成或递交中，请到 EASY 核对。`)
    }
    return { ok: true, data: {
      outcome: 'already_completed', caseVolume: request.caseVolume, caseId: request.caseId, procId: request.procId,
      procStatus, message: `已回查原站，处理事项为「${procStatus}」，已跳过递交。`
    } }
  }

  private async readLastFilingStatus(filingId: string): Promise<ApiResult<{ present: boolean; token: string | null }>> {
    const result = await this.transport.post('getFlowLastStatus', new URLSearchParams([
      ['Call', 'GetFlowLastStatus'],
      ['obj_id', filingId],
      ['flow_type', 'EF'],
      ['log_pagename', 'IhgFlow.aspx']
    ]))
    if (!result.ok) return result
    const data = result.data
    if (!isRecord(data) || !('last_status' in data) || !isRecord(data.ClientInfo)) {
      return apiError('FLOW_STATUS_UNVERIFIED', 'EASY 未确认递交单的最后流程状态。')
    }
    const client = data.ClientInfo
    if (client.IsLogin === false) return apiError('SESSION_EXPIRED', '核对递交流程时 EASY 登录已失效。')
    // EASY answers Result=false for a draft with no history. A successful empty lookup has this exact envelope.
    const noHistory = client.IsLogin === true && client.Status === true && data.last_status === null &&
      (client.Message == null || (typeof client.Message === 'string' && client.Message.trim() === ''))
    if (client.Status === false || (client.Result === false && !noHistory)) {
      return apiError('FLOW_STATUS_UNVERIFIED', 'EASY 未确认递交单的最后流程状态。')
    }
    const last = readLastStatus(data)
    return last.ok ? { ok: true, data: last } : apiError('FLOW_STATUS_UNVERIFIED', last.message)
  }

  private async resolveFeeReduceTypeIds(): Promise<{ levelOne: string; levelTwo: string }> {
    const res = await this.transport.post(
      'getCpcBusinessType',
      new URLSearchParams([
        ['Call', 'GetCPCBusineeType'],
        ['log_pagename', 'Filing.aspx']
      ])
    )
    if (!res.ok || !isRecord(res.data) || !Array.isArray(res.data.cpcBusinessType)) {
      return { levelOne: DEFAULT_LEVEL_ONE_ID, levelTwo: DEFAULT_LEVEL_TWO_ID }
    }
    const items = res.data.cpcBusinessType.filter(isRecord)
    const l1 = items.find(item => str(item.name) === '手续办理' || str(item.code) === '5')
    const l2 = items.find(item => str(item.code) === FEE_REDUCE_FILE_CODE || str(item.name) === FEE_REDUCE_TYPE_NAME)
    return {
      levelOne: str(l1?.id) || DEFAULT_LEVEL_ONE_ID,
      levelTwo: str(l2?.id) || DEFAULT_LEVEL_TWO_ID
    }
  }

  private async pollConvertStatus(filingId: string): Promise<ApiResult<true>> {
    const deadline = Date.now() + this.pollTimeoutMs
    while (true) {
      const statusRes = await this.transport.post(
        'getConvertStatus',
        new URLSearchParams([
          ['Call', 'GetConvertStatus'],
          ['filing_id', filingId],
          ['log_pagename', 'Filing.aspx']
        ])
      )
      if (!statusRes.ok) return statusRes
      const rows =
        isRecord(statusRes.data) && Array.isArray(statusRes.data.TableRows)
          ? statusRes.data.TableRows
          : []
      const row = isRecord(rows[0]) ? rows[0] : null
      if (row) {
        const errCode = str(row.err_code)
        const convertStatus = str(row.convert_status)
        const formStatus = str(row.form_status)
        if (errCode) {
          return apiError('BUSINESS_ERROR', `转档失败（${errCode}）：${str(row.convert_result) || '请检查转档文件。'}`)
        }
        if (convertStatus === '1000' && formStatus === '1000') {
          return { ok: true, data: true }
        }
      }
      if (Date.now() >= deadline) {
        return apiError('REQUEST_TIMEOUT', 'XML 转档超时，请稍后重试。')
      }
      await this.sleep(this.pollIntervalMs)
    }
  }

  private async loadProceContext(objId: string): Promise<
    ApiResult<{
      flowId: string
      curStatus: string
      curNodeCode: string
      versionToken: string | null
      firstNodeId: string
      firstNodeName: string
      proceNodeId: string
      proceNodeName: string
      proceListId: string
      candidates: FeeReduceReviewerOption[]
    }>
  > {
    const queryFlowAndNodes = async (targetObjId: string) => {
      const infoRes = await this.transport.post(
        'getFlowInfo',
        new URLSearchParams([
          ['Call', 'GetFlowInfo'],
          ['obj_id', targetObjId],
          ['flow_type', 'EF'],
          ['flow_sub_type', 'OA'],
          ['log_pagename', 'Filing.aspx']
        ])
      )
      if (!infoRes.ok) return { ok: false as const, error: infoRes }
      const flowResult = isRecord(infoRes.data) && isRecord(infoRes.data.Result) ? infoRes.data.Result : null
      if (!flowResult || !str(flowResult.flow_id)) {
        return { ok: false as const, error: apiError('BUSINESS_ERROR', '未获取到递交流程配置（GetFlowInfo）。') }
      }
      const flowSubmitParams = new URLSearchParams()
      for (const [k, v] of Object.entries(flowResult)) {
        flowSubmitParams.set(k, v == null ? '' : String(v))
      }
      flowSubmitParams.set('Call', 'GetFlowSubmit')
      flowSubmitParams.set('log_pagename', 'IhgFlow.aspx')
      const submitNodesRes = await this.transport.post('getFlowSubmit', flowSubmitParams)
      if (!submitNodesRes.ok) return { ok: false as const, error: submitNodesRes }
      const nodes =
        isRecord(submitNodesRes.data) && Array.isArray(submitNodesRes.data.Result)
          ? submitNodesRes.data.Result.filter(isRecord)
          : []
      const firstNode = nodes.find(n => str(n.node_code) === 'FIRST') ?? nodes[0]
      const proceNode = nodes.find(
        n => str(n.node_code) === 'PROCE' || str(n.node_name_zh_cn) === '流程人员初核'
      )
      return { ok: true as const, flowResult, firstNode, proceNode }
    }

    let resolved = await queryFlowAndNodes(objId || ZERO_GUID)
    if (!resolved.ok && !objId) {
      return resolved.error
    }

    if ((!resolved.ok || !resolved.proceNode) && !objId) {
      const efList = await this.transport.post(
        'processEF',
        new URLSearchParams([
          ['Call', 'GetProcessByTypeEF'],
          ['pageIndex', '1'],
          ['pageSize', '5'],
          ['log_pagename', 'Default.aspx']
        ])
      )
      if (efList.ok && isRecord(efList.data) && Array.isArray(efList.data.TableRows)) {
        const firstRow = efList.data.TableRows.find(isRecord)
        const sampleId = firstRow ? str(firstRow.filing_id) || str(firstRow.obj_id) : ''
        if (sampleId) {
          resolved = await queryFlowAndNodes(sampleId)
        }
      }
    }

    if (!resolved.ok) return resolved.error
    const { flowResult, firstNode, proceNode } = resolved

    if (!firstNode || !proceNode) {
      return apiError('BUSINESS_ERROR', '递交流程中未找到「流程人员初核」节点。')
    }

    const proceNodeId = str(proceNode.node_id)
    const userIds = str(proceNode.user_list_id).split(';').map(s => s.trim()).filter(Boolean)
    const userNames = str(proceNode.user_list_name).split(';').map(s => s.trim())
    const countMap = new Map<string, number>()

    if (proceNodeId && userIds.length) {
      const countRes = await this.transport.post(
        'getPicProcessCount',
        new URLSearchParams([
          ['Call', 'GetPicProcessCount'],
          ['cur_node_id', proceNodeId],
          ['cur_user_id', userIds.join(';')],
          ['flow_type', 'EF'],
          ['flow_sub_type', 'OA'],
          ['log_pagename', 'IhgFlow.aspx']
        ])
      )
      if (countRes.ok && isRecord(countRes.data) && Array.isArray(countRes.data.Result)) {
        for (const item of countRes.data.Result) {
          if (isRecord(item) && str(item.user_id)) {
            const c = typeof item.count === 'number' ? item.count : Number(item.count)
            if (Number.isFinite(c)) countMap.set(str(item.user_id).toLowerCase(), c)
          }
        }
      }
    }

    const candidates: FeeReduceReviewerOption[] = userIds.map((id, idx) => ({
      userId: id,
      name: userNames[idx] || id,
      count: countMap.get(id.toLowerCase()) ?? null
    }))

    return {
      ok: true,
      data: {
        flowId: str(flowResult.flow_id),
        curStatus: str(flowResult.status),
        curNodeCode: str(flowResult.cur_node_code || flowResult.node_code),
        versionToken: str(flowResult.update_time_ss) || null,
        firstNodeId: str(firstNode.node_id),
        firstNodeName: str(firstNode.node_name_zh_cn) || '启动流程',
        proceNodeId,
        proceNodeName: str(proceNode.node_name_zh_cn) || '流程人员初核',
        proceListId: str(proceNode.list_id),
        candidates
      }
    }
  }
}
