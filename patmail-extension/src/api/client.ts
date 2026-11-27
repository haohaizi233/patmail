import { HagueReadError } from '../hague/read-error'
import { hagueNetworkPool } from '../hague/concurrency'
import { loadHagueCase } from '../hague/easy'
import { documentedCallAllowed, documentedParams, summarizeEasyPayload } from './documented-call'
import { DownloadTokens } from './download-tokens'
import { DownloadNameRequests } from './download-name-requests'
import { isLiveWriteCall } from '../automation/live-readonly-policy'
import { extractReadonlyEvidence, readonlyContract } from '../automation/readonly-contracts'
import { CURRENT_ENVIRONMENT, PCL_ORIGIN, trustedOrigin } from './config'
import { CASE_CONTACT_CUSTOMER_NAME } from '../customer/skills'
import { isWriteSwitchOpen } from '../settings/write-switch'
import { DictionaryService } from './dictionaries'
import type { DictionaryLoadRequest, DictionarySnapshot } from './dictionaries'
import { buildGetSearchFilesFromFields, buildGetSearchFilesParams, type FileSearchQuery } from './file-search-params'
import { buildLimitMonitorParams, type LimitMonitorQuery } from './limit-monitor-params'
import { buildFilingSearchParams, type FilingSearchQuery } from './filing-search-params'
import { normalizeFilingSearch } from './filing-search-normalizer'
import type { FilingSearchResult } from './filing-search-types'
import { buildFeeSearchParams, buildFeeSearchAmountParams, type FeeSearchQuery } from './fee-search-params'
import { isTranslationFee, translationWordCount } from '../billing/fee-model'
import {
  buildExportColumnsXml,
  buildTemplateElementXml,
  type FeeExportConfigRequest,
  type FeeExportConfigResponse,
  type FeeExportRequest,
  type FeeExportTemplate,
  type FeeExportTemplateColumn
} from './fee-export'
import { NoticeClient } from './notice-client'
import { FeeReduceClient } from './fee-reduce-client'
import type {
  FeeReduceInspectResult,
  FeeReduceReviewersResult,
  FeeReduceSubmitRequest,
  FeeReduceSubmitResult
} from './fee-reduce-types'
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
import type { NoticeTaskStatusEvent } from '../shared/notice-status'
import { normalizeFeeSearch } from './fee-search-normalizer'
import type { FeeApplicantItem, FeeCustomerItem, FeeInitData, FeeOptionItem, FeeSearchResult, FeeTypeItem } from './fee-search-types'
import { buildPatentSearchParams, type PatentSearchQuery } from './patent-search-params'
import { normalizePatentBasicDicts, normalizePatentSearch } from './patent-search-normalizer'
import { PATENT_CASE_TYPE_ID } from './patent-form'
import type { PatentInitData, PatentSearchResult } from './patent-search-types'
import type { TreeOption } from '../query/option-tree'
import { filingFlowHistoryParams, readFilingFlowHistory, readUserInfo, userInfoParams, type FilingFlowRow, type FilingUser } from './filing-export'
import { buildMailProcessParams, buildProcessListParams, filingNeedsCpcFlag, normalizeMailProcess, normalizeProcessList, processFormPath, type ProcessKind, type ProcessListQuery, type ProcessListResult, type ProcessOpenTarget } from './mail-process'
import { isRecord } from './response-guards'
import { fileTempDeleteParams, fileTempSaveParams, readFileTempNameList, type FileTempNameInput, type FileTempNameList } from './file-temp-name'
import { normalizeLimitMonitor } from './limit-monitor-normalizer'
import type { LimitMonitorResult } from './limit-monitor-types'
import { HistoryQueryService } from './query-history'
import type { HistoryQueryDetail, HistoryQueryOption, HistorySurface } from './query-history'
import type { FileSearchResult } from './file-search-types'
import { normalizeFileSearch } from './file-search-normalizer'
import { SessionService, type SessionStatus, type SessionSummary } from './session'
import { productionGate, type MailWriteGate } from '../mail/easy/gate'
import { MailExecutionRuntime, type SelectionClaim } from '../mail/easy/runtime'
import { ExecutionStore, type ExecutionArea } from '../mail/easy/store'
import type { MailExecutionView } from '../mail/easy/types'
import type { MailDraftPreview } from '../mail/types'
import { productionWorkflowGate } from '../workflow/gate'
import { WorkflowReadService } from '../workflow/read-service'
import type { AccountReviewerList } from '../workflow/contracts'
import { WorkflowRuntime } from '../workflow/runtime'
import { WorkflowStore } from '../workflow/store'
import type { WorkflowView } from '../workflow/types'
import type { PlanInput } from '../workflow/planner'
import { loadCaseDemandText, type CaseDemandAsset } from '../mail/easy/case-demand'
import { loadPctSendGate, type IcFlowAsk, type IcFlowHit, type PctSendGate } from '../customer/pct-flow-status'
import { loadCaseFields } from '../customer/case-arbitration'
import { lookupIcFlow } from '../customer/ic-flow-lookup'
import { loadCaseRecord } from '../customer/case-record'
import { loadCustomerDemands, loadCustomerDirectory, type CustomerDemandAsset, type CustomerDirectoryAsset } from '../customer/customer-page'
import { listParams, readMailInfo } from '../mail/easy/contracts'
import { loadMailContactText, type MailContactAsset } from '../mail/easy/mail-contacts'
import { isQueryGuid } from '../query/query-validator'
import { EasyMailReadService } from '../mail/easy/read-service'
import type { ExistingMailDiagnostic } from '../shared/message'
import { submitFileManageBatch, type FileManageSubmitItem, type FileManageSubmitResult } from '../customer/file-manage-submit'
import { resolveDownloadFileNames, stripApplicationNoDot, type FileDownloadSelection } from '../mail/download-name'
import { buildDownloadParams, downloadArchiveName, readDownloadHandle, DOWNLOAD_MAX_ITEMS, type DownloadFileItem, type DownloadedArchive } from './file-download'
import type { FileDownloadProgress } from '../shared/download-progress'
import { streamDownloadFiles } from './stream-download'
import { submitLimitMailBatch, type LimitMailSubmitItem, type LimitMailSubmitResult } from '../customer/limit-mail-submit'
import { loadCaseContacts } from '../case-contact/load'
import type { CaseContactExport } from '../case-contact/query'
import { EasyTransport, type EasyOperation, type TransportOptions } from './transport'
import { apiError, type ApiResult } from './types'

function readNewCpcFlag(data: unknown): boolean | null {
  if (!isRecord(data) || !Array.isArray(data.IsNewCPC) || !isRecord(data.IsNewCPC[0])) return null
  const flag = data.IsNewCPC[0].filing_new
  if (flag === true || flag === 1 || flag === '1') return true
  if (flag === false || flag === 0 || flag === '0') return false
  return null
}

function processOperation(kind: ProcessKind): EasyOperation {
  if (kind === 'AP') return 'processAP'
  if (kind === 'EF') return 'processEF'
  return 'mailProcess'
}

export interface RuntimeOptions extends TransportOptions {
  mailStore?: ExecutionStore
  mailGate?: MailWriteGate
}

function chromeExecutionArea(): ExecutionArea | null {
  const area = globalThis.chrome?.storage?.local
  if (!area) return null
  return {
    get: key => area.get<Record<string, unknown>>(key),
    set: items => area.set(items)
  }
}

const ACCEPTANCE_ROUTE: Record<string, EasyOperation> = {
  GetUserModel: 'session',
  GetSearchFiles: 'fileSearch',
  IPGetBasicData: 'basicData',
  GetFlowdirection: 'flowDirection',
  LoadFileTypeByCaseType: 'fileTypeTree',
  LoadMailType: 'mailType',
  GetMailInfo: 'getMailInfo',
  GetMailFile: 'getMailFile',
  GetMailCase: 'getMailCase',
  GetMailRule: 'getMailRule',
  GetCustomerContact: 'getCustomerContact',
  GetSignature: 'getSignature',
  GetFlowInfo: 'getFlowInfo',
  GetFlowHistory: 'getFlowHistory',
  GetUrgencyList: 'getUrgencyList',
  GetFlowSubmit: 'getFlowSubmit',
  GetFlowLastStatus: 'getFlowLastStatus'
}

function refusedWorkflow(message: string): WorkflowView {
  return {
    record: {
      executionId: '', mailId: '', flowType: '', flowId: '', currentNodeId: '', nextNodeId: '', reviewerId: '',
      status: 'BLOCKED', versionToken: '', submittedAt: '', lastVerifiedAt: '', lastError: message,
      requestSent: false, userId: '', origin: ''
    },
    snapshot: null, plan: null, blockers: [message]
  }
}

function refusedMailView(preview: MailDraftPreview, message: string, executionId = ''): MailExecutionView {
  return {
    record: {
      executionId, userId: '', origin: '', customerProfileId: preview.customerProfileId, fileIds: [...preview.fileIds],
      mailTypeId: preview.mailTypeId, ruleRevision: 0, fingerprint: preview.fingerprint, state: 'FAILED',
      mailId: '', stage: 'FAILED', lastError: message, requestSent: false, diffDigest: '', updatedAt: new Date().toISOString()
    },
    diffs: [], linkedFileIds: [], blockers: [message]
  }
}

export class EasyRuntime {
  private readonly downloadTokens = new DownloadTokens(() => 'naming')
  private readonly downloadNameRequests = new DownloadNameRequests()
  private readonly postDownloadName: EasyTransport['post'] = async (...args) => this.downloadNameRequests.post(args[1], args[2], async params => {
    const signal = args[2] ?? new AbortController().signal
    const release = await this.downloadTokens.acquire('naming', signal)
    try { return await this.transport.post('getFileName', params, args[2], args[3], args[4]) } finally { release() }
  })
  private readonly transport: EasyTransport
  private readonly session: SessionService
  private sessionController: AbortController | null = null
  private searchController: AbortController | null = null
  private searchSequence = 0
  private limitController: AbortController | null = null
  private limitSequence = 0
  private filingController: AbortController | null = null
  private filingSequence = 0
  private feeController: AbortController | null = null
  private feeSequence = 0
  private patentController: AbortController | null = null
  private patentSequence = 0
  private activeSearch: { signature: string; promise: Promise<ApiResult<FileSearchResult>> } | null = null
  private readonly history: HistoryQueryService
  private readonly dictionaries: DictionaryService
  private historyUserKey = ''
  private listColsel: string | null = null
  private readonly mail: MailExecutionRuntime
  private readonly workflow: WorkflowRuntime
  private readonly notice: NoticeClient
  private readonly feeReduce: FeeReduceClient

  constructor(private readonly pageOrigin: string, options: RuntimeOptions = {}) {
    this.transport = new EasyTransport(pageOrigin, options)
    this.session = new SessionService(this.transport)
    this.history = new HistoryQueryService(this.transport)
    this.dictionaries = new DictionaryService(this.transport)
    this.notice = new NoticeClient({
      transport: this.transport,
      confirmAccountRead: () => this.confirmAccountRead(),
      expireSession: () => this.session.expire(),
      isWriteOpen: () => isWriteSwitchOpen()
    })
    this.feeReduce = new FeeReduceClient(this.transport)
    this.mail = new MailExecutionRuntime(
      this.transport,
      options.mailStore ?? new ExecutionStore(chromeExecutionArea()),
      options.mailGate ?? productionGate,
      pageOrigin
    )
    this.workflow = new WorkflowRuntime(
      this.transport,
      new WorkflowStore(chromeExecutionArea()),
      productionWorkflowGate,
      pageOrigin,
      (userId, mailId) => this.mail.hasVerifiedMail(userId, mailId)
    )
  }

  get sessionStatus(): SessionStatus { return this.session.status }

  private activeSession: Promise<ApiResult<SessionSummary>> | null = null

  async checkSession(): Promise<ApiResult<SessionSummary>> {
    if (this.activeSession) return this.activeSession
    const controller = new AbortController()
    this.sessionController = controller
    const run = (async () => {
      const result = await this.session.check(controller.signal)
      if (result.ok && result.data.status !== 'authenticated') {
        this.cancelFileSearch()
        this.cancelLimitMonitor()
        this.cancelFeeSearch()
      }
      if (!result.ok && result.error.code === 'SESSION_EXPIRED') {
        this.cancelFileSearch()
        this.cancelLimitMonitor()
        this.cancelFeeSearch()
      }
      const nextKey = result.ok && result.data.status === 'authenticated' ? result.data.userId ?? '' : ''
      if (nextKey !== this.historyUserKey) {
        this.downloadNameRequests.clear()
        this.history.invalidate()
        this.dictionaries.invalidate(this.historyUserKey)
        this.dictionaries.invalidate(nextKey)
        this.listColsel = null
      }
      this.historyUserKey = nextKey
      return result
    })()
    this.activeSession = run
    try {
      return await run
    } finally {
      if (this.activeSession === run) this.activeSession = null
      if (this.sessionController === controller) this.sessionController = null
    }
  }

  /** 进入页面时顺手确认会话。已经登录则直接过；检测被取消时再试一次。 */
  private async confirmAccountRead(): Promise<boolean> {
    if (this.session.isAuthenticated()) return true
    const result = await this.checkSession()
    if (result.ok && result.data.status === 'authenticated') return true
    if (!result.ok && result.error.code === 'REQUEST_ABORTED') {
      const retry = await this.checkSession()
      return retry.ok && retry.data.status === 'authenticated'
    }
    // 检测超时或网络抖动但上次还登录着：按登录继续，业务请求真掉登录会自己报 SESSION_EXPIRED。
    return this.session.isAuthenticated()
  }

  cancelSessionCheck(): void {
    this.sessionController?.abort()
    this.sessionController = null
    this.activeSession = null
  }

  /**
   * 手工查询走「新查询取消旧查询」的槽；全选所有页这类批量拉页传 batch，
   * 不占这个槽：批页之间、批页和手查之间互不取消（否则并发翻页会互相 abort 掉）。
   */
  searchFiles(query: FileSearchQuery, timeoutMs?: number, batch = false): Promise<ApiResult<FileSearchResult>> {
    if (this.session.status !== 'authenticated') {
      return Promise.resolve(apiError(
        this.session.status === 'expired' || this.session.status === 'unauthenticated' ? 'SESSION_EXPIRED' : 'AUTH_UNKNOWN',
        '请先在 EASY 原网站登录并检测登录状态。'
      ))
    }
    const signature = JSON.stringify(query.resolvedFields ? [
      'resolved',
      Object.keys(query.resolvedFields).sort().map(key => [key, query.resolvedFields?.[key] ?? '']),
      query.pageIndex, query.pageSize, query.includeApplicationType === true
    ] : [
      query.caseVolume?.trim() ?? '', query.applicationNo?.trim() ?? '',
      query.customerName?.trim() ?? '', query.fileName?.trim() ?? '',
      query.fileDescriptionId?.trim() ?? '', query.pageIndex, query.pageSize, query.includeApplicationType === true
    ])
    if (this.activeSearch?.signature === signature) return this.activeSearch.promise
    const environment = this.listColsel ? { ...CURRENT_ENVIRONMENT, colsel: this.listColsel } : CURRENT_ENVIRONMENT
    const params = query.resolvedFields
      ? buildGetSearchFilesFromFields(query.resolvedFields, query, environment)
      : buildGetSearchFilesParams(query, environment)
    if (!params.ok) return Promise.resolve(params)
    const controller = new AbortController()
    let requestNumber = 0
    if (!batch) {
      this.downloadNameRequests.clear()
      this.cancelFileSearch()
      this.searchController = controller
      requestNumber = ++this.searchSequence
    }
    const promise = (async (): Promise<ApiResult<FileSearchResult>> => {
      const response = await this.transport.post('fileSearch', params.data, controller.signal, timeoutMs)
      if (!batch && requestNumber !== this.searchSequence) return apiError('REQUEST_ABORTED', '旧查询已取消。')
      const result = response.ok ? normalizeFileSearch(response.data, query) : response
      if (!result.ok && result.error.code === 'SESSION_EXPIRED') {
        this.session.expire()
        this.cancelFileSearch()
      }
      return result
    })()
    if (!batch) {
      this.activeSearch = { signature, promise }
      void promise.then(() => {
        if (this.activeSearch?.promise === promise) {
          this.activeSearch = null
          this.searchController = null
        }
      })
    }
    return promise
  }

  async loadDictionary(request: DictionaryLoadRequest, signal?: AbortSignal): Promise<ApiResult<DictionarySnapshot>> {
    if (!(await this.confirmAccountRead())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const caseTypeId = request.kind === 'fileType' || request.kind === 'picker' ? request.caseTypeId ?? '' : ''
    const picker = request.kind === 'picker' ? { country: request.country ?? '', procType: request.procType ?? '' } : {}
    return this.dictionaries.load(request.kind, this.historyUserKey, request.force, caseTypeId, signal, picker).then(result => {
      if (request.kind === 'listColumn' && result.ok && result.data.kind === 'listColumn' && result.data.colsel) {
        this.listColsel = result.data.colsel
      }
      return result
    })
  }

  async listHistoryQueries(force = false, signal?: AbortSignal, surface: HistorySurface = 'file'): Promise<ApiResult<HistoryQueryOption[]>> {
    await this.confirmAccountRead()
    return this.history.list(this.historyUserKey, surface, force, signal)
  }

  async getHistoryQuery(queryId: string, signal?: AbortSignal, surface: HistorySurface = 'file'): Promise<ApiResult<HistoryQueryDetail>> {
    await this.confirmAccountRead()
    return this.history.detail(this.historyUserKey, surface, queryId, signal)
  }

  async saveHistoryQuery(title: string, queryId: string, queryXml: string, signal?: AbortSignal, surface: HistorySurface = 'file'): Promise<ApiResult<{ saved: true }>> {
    if (!isWriteSwitchOpen()) return apiError('BUSINESS_ERROR', '写开关已关闭。')
    await this.confirmAccountRead()
    return this.history.save(this.historyUserKey, surface, { title, queryId, queryXml }, signal)
  }

  async deleteHistoryQuery(queryId: string, signal?: AbortSignal, surface: HistorySurface = 'file'): Promise<ApiResult<{ deleted: true }>> {
    if (!isWriteSwitchOpen()) return apiError('BUSINESS_ERROR', '写开关已关闭。')
    await this.confirmAccountRead()
    return this.history.delete(this.historyUserKey, surface, queryId, signal)
  }

  /** 保存下载文件名模板。响应带写完之后的整个 TempNameList，用来换掉下拉字典。 */
  async saveFileTempName(input: FileTempNameInput, signal?: AbortSignal): Promise<ApiResult<FileTempNameList>> {
    if (!isWriteSwitchOpen()) return apiError('BUSINESS_ERROR', '写开关已关闭。')
    await this.confirmAccountRead()
    const params = fileTempSaveParams(input)
    if (!params.ok) return params
    return this.writeFileTempName('fileTempSave', params.data, signal)
  }

  async deleteFileTempName(tempId: string, signal?: AbortSignal): Promise<ApiResult<FileTempNameList>> {
    if (!isWriteSwitchOpen()) return apiError('BUSINESS_ERROR', '写开关已关闭。')
    await this.confirmAccountRead()
    const params = fileTempDeleteParams(tempId)
    if (!params.ok) return params
    return this.writeFileTempName('fileTempDelete', params.data, signal)
  }

  /** 写完作废下拉字典缓存，之后再读 GetFileTempNameList 不会回放旧模板。 */
  private async writeFileTempName(operation: 'fileTempSave' | 'fileTempDelete', params: URLSearchParams, signal?: AbortSignal): Promise<ApiResult<FileTempNameList>> {
    const response = await this.transport.post(operation, params, signal)
    if (!response.ok) {
      if (response.error.code === 'SESSION_EXPIRED') this.session.expire()
      return response
    }
    const list = readFileTempNameList(response.data)
    if (!list.ok) {
      if (list.error.code === 'SESSION_EXPIRED') this.session.expire()
      return list
    }
    this.dictionaries.invalidate(this.historyUserKey)
    return list
  }

  private async mailUser(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
    const session = await this.checkSession()
    if (!session.ok || session.data.status !== 'authenticated' || !session.data.userId) {
      return { ok: false, message: '请先在 EASY 原网站登录并检测登录状态。' }
    }
    return { ok: true, userId: session.data.userId }
  }

  findMailExecution(fingerprint: string): Promise<MailExecutionView | null> {
    return this.mailUser().then(user => user.ok ? this.mail.find(user.userId, fingerprint) : null)
  }

  createEasyMail(preview: MailDraftPreview, claim: SelectionClaim): Promise<MailExecutionView> {
    return this.mailUser().then(user => user.ok
      ? this.mail.create(user.userId, preview, claim)
      : refusedMailView(preview, user.message))
  }

  saveEasyMail(executionId: string, preview: MailDraftPreview, claim: SelectionClaim, acknowledgedDigest: string): Promise<MailExecutionView> {
    return this.mailUser().then(user => user.ok
      ? this.mail.save(user.userId, executionId, preview, claim, acknowledgedDigest)
      : refusedMailView(preview, user.message, executionId))
  }

  inspectEasyMail(executionId: string): Promise<MailExecutionView | null> {
    return this.mailUser().then(user => user.ok ? this.mail.inspect(user.userId, executionId) : null)
  }

  readWorkflow(mailId: string, flowType: string): Promise<WorkflowView> {
    return this.mailUser().then(user => user.ok ? this.workflow.read(user.userId, mailId, flowType) : refusedWorkflow(user.message))
  }

  refreshWorkflow(executionId: string): Promise<WorkflowView> {
    return this.mailUser().then(user => user.ok ? this.workflow.refresh(user.userId, executionId) : refusedWorkflow(user.message))
  }

  previewWorkflow(executionId: string, input: Omit<PlanInput, 'currentUserId' | 'pageFields'>): Promise<WorkflowView> {
    return this.mailUser().then(user => user.ok
      ? this.workflow.preview(user.userId, executionId, { ...input, currentUserId: user.userId, pageFields: null })
      : refusedWorkflow(user.message))
  }

  restoreWorkflow(mailId: string): Promise<WorkflowView | null> {
    return this.mailUser().then(user => user.ok ? this.workflow.restore(user.userId, mailId) : null)
  }

  /** 用当前登录会话调用一个不会改数据的接口。 */
  async callDocumented(handler: string, call: string, fields: Record<string, string>): Promise<string> {
    const allowed = documentedCallAllowed(handler, call)
    if (!allowed.ok) return allowed.reason
    const response = await this.transport.postDocumented(handler, documentedParams(call, fields))
    if (!response.ok) return response.error.message
    return summarizeEasyPayload(response.data)
  }

  /** 只读验收探测。写接口不在表内，不会发请求。 */
  async probeReadonly(call: string, context: { caseTypeId?: string; mailId?: string; flowType?: string } = {}): Promise<{ httpStatus: number; sessionOk: boolean; fields: Record<string, string>; shape: string }> {
    if (isLiveWriteCall(call)) return { httpStatus: 0, sessionOk: true, fields: {}, shape: 'write-blocked' }
    const operation = ACCEPTANCE_ROUTE[call]
    const decision = readonlyContract(call, context)
    if (!operation || decision.state !== 'ready') return { httpStatus: 0, sessionOk: true, fields: {}, shape: decision.state === 'pending' ? 'CONTRACT_PENDING' : 'blocked' }
    const response = await this.transport.post(operation, decision.params)
    if (!response.ok) {
      return {
        httpStatus: response.error.status ?? (response.error.code === 'SESSION_EXPIRED' ? 401 : 0),
        sessionOk: response.error.code !== 'SESSION_EXPIRED',
        fields: {},
        shape: response.error.code
      }
    }
    const data = response.data
    const fields = extractReadonlyEvidence(call, data)
    const shape = data && typeof data === 'object' ? `object(${Object.keys(data).sort().join(',')})` : typeof data
    return { httpStatus: 200, sessionOk: fields.clientLogin !== 'false' && fields.loginPage !== 'true', fields, shape }
  }

  /** 只读核验一封已有邮件。不保存、不提交。 */
  diagnoseExistingMail(mailId: string, flowType: string): Promise<ExistingMailDiagnostic> {
    return this.mailUser().then(async user => {
      if (!user.ok) {
        return { mailId, fileIds: [], fileNames: [], writesAttempted: false, blockers: [user.message], workflow: refusedWorkflow(user.message) }
      }
      const mail = await new EasyMailReadService(this.transport).load(mailId)
      const workflow = await this.workflow.diagnose(user.userId, mailId, flowType)
      return {
        mailId,
        fileIds: mail.ok ? mail.snapshot.files.map(file => file.fileId) : [],
        fileNames: mail.ok ? mail.snapshot.files.map(file => file.fileName) : [],
        writesAttempted: false,
        blockers: [mail.ok ? '' : mail.message, ...workflow.blockers].filter(Boolean),
        workflow
      }
    })
  }

  /** 只读确认递交走新 CPC 还是旧页面，然后给出首页页签地址。不提交、不创建。 */
  resolveProcessForm(target: ProcessOpenTarget): Promise<ApiResult<string>> {
    return (async (): Promise<ApiResult<string>> => {
      let isNewCpc: boolean | null = null
      if (target.kind === 'EF' && filingNeedsCpcFlag(target.filingType)) {
        if (!(await this.confirmAccountRead())) {
          return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
        }
        const params = new URLSearchParams()
        params.set('Call', 'GetIsNewCPC')
        params.set('filing_id', target.id)
        params.set('log_pagename', 'ProcessNew.aspx')
        const response = await this.transport.post('getIsNewCpc', params)
        if (!response.ok) {
          if (response.error.code === 'SESSION_EXPIRED') this.session.expire()
          return response
        }
        const flag = readNewCpcFlag(response.data)
        if (flag === null) return apiError('INVALID_RESPONSE', '没有读到递交页面版本，不能打开。')
        isNewCpc = flag
      }
      const path = processFormPath(target, isNewCpc)
      if (!path) return apiError('INVALID_QUERY', '这条记录对不上原站的打开页面。')
      return { ok: true, data: path }
    })()
  }

  listMailProcesses(query: ProcessListQuery): Promise<ApiResult<ProcessListResult>> {
    return (async (): Promise<ApiResult<ProcessListResult>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const params = buildProcessListParams(query)
      if (!params.ok) return params
      const response = await this.transport.post(processOperation(query.kind), params.data)
      if (!response.ok && response.error.code === 'SESSION_EXPIRED') this.session.expire()
      return response.ok ? normalizeProcessList(response.data, query) : response
    })()
  }

  /** 发文页要求表原文。只认案件编号，不解释这些句子。 */
  readCaseDemands(caseId: string, signal?: AbortSignal): Promise<ApiResult<CaseDemandAsset>> {
    return (async (): Promise<ApiResult<CaseDemandAsset>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const result = await loadCaseDemandText(caseId, (params, next) => this.transport.post('caseDemand', params, next), signal)
      if (!result.ok && result.error.code === 'SESSION_EXPIRED') this.session.expire()
      return result
    })()
  }

  /** 按我方文号读仲裁用的固定栏。不解释该选谁，也不创建发文。 */
  private readonly hagueReads = new Map<string, Set<AbortController>>()
  private readonly cancelledHagueBatches = new Map<string, number>()
  cancelHagueRead(batchId: string): void {
    this.cancelledHagueBatches.set(batchId, Date.now())
    for (const [id, time] of this.cancelledHagueBatches) if (Date.now() - time > 600_000) this.cancelledHagueBatches.delete(id)
    for (const controller of this.hagueReads.get(batchId) ?? []) controller.abort()
  }
  async readHagueCase(caseVolume: string, batchId = 'legacy'): Promise<string> {
    const controller = new AbortController()
    if (this.cancelledHagueBatches.has(batchId)) throw new HagueReadError('已停止')
    const reads = this.hagueReads.get(batchId) ?? new Set<AbortController>()
    reads.add(controller); this.hagueReads.set(batchId, reads)
    try {
      if (!(await this.confirmAccountRead())) throw new HagueReadError('请先在 EASY 原网站登录并检测登录状态。')
      if (controller.signal.aborted) throw new HagueReadError('已停止')
      return await loadHagueCase(caseVolume, (operation, params) => this.transport.post(operation, params, controller.signal, undefined, undefined, hagueNetworkPool))
    } finally {
      controller.abort(); reads.delete(controller)
      if (!reads.size) this.hagueReads.delete(batchId)
    }
  }

  readCaseFields(caseVolume: string): Promise<string> {
    return (async (): Promise<string> => {
      if (!(await this.confirmAccountRead())) return '请先在 EASY 原网站登录并检测登录状态。'
      return loadCaseFields(caseVolume, (operation, params) => this.transport.post(operation, params))
    })()
  }

  /** 案件查询按我方文号找案子，再读这条处理事项的发文流程。期限监控里结束的事项也能对上。 */
  lookupIcFlow(rows: IcFlowAsk[]): Promise<ApiResult<{ items: IcFlowHit[] }>> {
    return (async (): Promise<ApiResult<{ items: IcFlowHit[] }>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const result = await lookupIcFlow(
        rows,
        (operation, params) => this.transport.post(operation, params),
        caseId => loadCaseRecord(caseId, (operation, params) => this.transport.post(operation, params))
      )
      if (!result.ok && result.error.code === 'SESSION_EXPIRED') this.session.expire()
      return result
    })()
  }

  /** 案件页流程图。用来看这一件处理事项的发文是待审核还是已经结束。 */
  readCaseBusFlow(caseId: string, procId: string, signal?: AbortSignal, requireProc = false): Promise<ApiResult<{ gate: PctSendGate }>> {
    return (async (): Promise<ApiResult<{ gate: PctSendGate }>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const result = await loadPctSendGate(caseId, procId, (params, next) => this.transport.post('caseBusFlow', params, next), signal, requireProc)
      if (!result.ok && result.error.code === 'SESSION_EXPIRED') this.session.expire()
      return result
    })()
  }

  /** 客户资料页要求表。只认客户编号，不打开邮件页，也不改要求。 */
  readCustomerDemands(customerId: string, signal?: AbortSignal): Promise<ApiResult<CustomerDemandAsset>> {
    return this.readCustomerPage(customerId, (params, next) => this.transport.post('customerPageDemand', params, next), loadCustomerDemands, signal)
  }

  /** 客户资料页联系人。用来把表格称呼对上邮箱，不读取电话和地址。 */
  readCustomerDirectory(customerId: string, signal?: AbortSignal): Promise<ApiResult<CustomerDirectoryAsset>> {
    return this.readCustomerPage(customerId, (params, next) => this.transport.post('customerPageContact', params, next), loadCustomerDirectory, signal)
  }

  private readCustomerPage<T>(
    customerId: string,
    post: (params: URLSearchParams, signal?: AbortSignal) => Promise<ApiResult<unknown>>,
    load: (customerId: string, post: (params: URLSearchParams, signal?: AbortSignal) => Promise<ApiResult<unknown>>, signal?: AbortSignal) => Promise<ApiResult<T>>,
    signal?: AbortSignal
  ): Promise<ApiResult<T>> {
    return (async (): Promise<ApiResult<T>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const result = await load(customerId, post, signal)
      if (!result.ok && result.error.code === 'SESSION_EXPIRED') this.session.expire()
      return result
    })()
  }

  /** 当前发文上已经填好的地址，以及这封信里的文号。 */
  readMailAddresses(mailId: string): Promise<ApiResult<{ to: string; cc: string; customerId: string; caseVolumes: string[] }>> {
    return (async (): Promise<ApiResult<{ to: string; cc: string; customerId: string; caseVolumes: string[] }>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      if (!isQueryGuid(mailId)) return apiError('INVALID_QUERY', '发文编号无效。')
      const params = new URLSearchParams()
      params.set('Call', 'GetMailInfo')
      params.set('mail_id', mailId)
      params.set('log_pagename', 'mail.aspx')
      const response = await this.transport.post('getMailInfo', params)
      if (!response.ok) {
        if (response.error.code === 'SESSION_EXPIRED') this.session.expire()
        return response
      }
      const row = readMailInfo(response.data, mailId)
      if (!row.ok) return apiError('INVALID_RESPONSE', row.message)
      const to = addressField(row.row, 'mail_to')
      const cc = addressField(row.row, 'mail_cc')
      if (to === null || cc === null) return apiError('INVALID_RESPONSE', '发文上的收件人或抄送这次没有读到。')
      const cases = await this.transport.post('getMailCase', listParams('GetMailCase', mailId, 1))
      if (!cases.ok) {
        if (cases.error.code === 'SESSION_EXPIRED') this.session.expire()
        return cases
      }
      const caseVolumes = volumesOnMail(cases.data)
      if (!caseVolumes) return apiError('INVALID_RESPONSE', '这封发文上的文号没有读全。')
      const customer = addressField(row.row, 'customer_id')
      return { ok: true, data: { to, cc, customerId: customer && isQueryGuid(customer) ? customer : '', caseVolumes } }
    })()
  }

  /** 发文页右侧联系人。最近联系人不需要发文编号，其余分组需要。 */
  readMailContacts(mailId: string, customerId: string, signal?: AbortSignal): Promise<ApiResult<MailContactAsset>> {
    return (async (): Promise<ApiResult<MailContactAsset>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const result = await loadMailContactText({ mailId, customerId }, (operation, params, next) => this.transport.post(operation, params, next), signal)
      if (!result.ok && result.error.code === 'SESSION_EXPIRED') this.session.expire()
      return result
    })()
  }

  /** 审核人来自当前账号一封进行中发文的 GetFlowInfo + GetFlowSubmit。 */
  listFlowReviewers(): Promise<ApiResult<AccountReviewerList>> {
    return (async (): Promise<ApiResult<AccountReviewerList>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const query = { searchKey: '', pageIndex: 1, pageSize: 5 }
      const params = buildMailProcessParams(query)
      if (!params.ok) return params
      const listed = await this.transport.post('mailProcess', params.data)
      if (!listed.ok) {
        if (listed.error.code === 'SESSION_EXPIRED') this.session.expire()
        return listed
      }
      const processes = normalizeMailProcess(listed.data, query)
      if (!processes.ok) return processes
      const mail = processes.data.items.find(item => item.mailId)
      if (!mail) return { ok: true, data: { reviewers: [], message: '当前账号没有进行中的发文，读不到审核人。' } }
      const reader = new WorkflowReadService(this.transport)
      const info = await reader.reloadInfo(mail.mailId, 'CO')
      if (!info.ok) return apiError('BUSINESS_ERROR', info.message)
      const nodes = await reader.nodes(info.info)
      if (nodes.nodes.length === 0) return apiError('BUSINESS_ERROR', nodes.message || '没有读到下一节点。')
      const reviewers: AccountReviewerList['reviewers'] = []
      const seen = new Set<string>()
      for (const node of nodes.nodes) {
        if (node.nodeCode === 'END') continue
        for (const reviewer of node.reviewers) {
          const key = reviewer.id.toLowerCase()
          if (!reviewer.name.trim() || seen.has(key)) continue
          seen.add(key)
          reviewers.push({ id: reviewer.id, name: reviewer.name })
        }
      }
      return {
        ok: true,
        data: {
          reviewers,
          message: reviewers.length ? '' : '下一节点没有带姓名的审核人。'
        }
      }
    })()
  }

  exportCaseContacts(volumes: string[]): Promise<ApiResult<CaseContactExport>> {
    return (async (): Promise<ApiResult<CaseContactExport>> => {
      if (trustedOrigin(this.pageOrigin) !== PCL_ORIGIN) {
        return apiError('INVALID_ORIGIN', `案件联系人只能在${CASE_CONTACT_CUSTOMER_NAME}的 EASY 上读取。`)
      }
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const session = await this.checkSession()
      if (!session.ok || session.data.status !== 'authenticated' || !session.data.userId) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const result = await loadCaseContacts(this.transport, session.data.userId, volumes)
      if (!result.ok && result.error.code === 'SESSION_EXPIRED') {
        const again = await this.checkSession()
        if (again.ok && again.data.status === 'authenticated') {
          return apiError('BUSINESS_ERROR', `当前账号已登录。案件查询没有被原网站接受，请刷新${CASE_CONTACT_CUSTOMER_NAME}页面后再试一次。`)
        }
        this.session.expire()
      }
      return result
    })()
  }

  searchLimitMonitor(query: LimitMonitorQuery, timeoutMs?: number): Promise<ApiResult<LimitMonitorResult>> {
    this.cancelLimitMonitor()
    const controller = new AbortController()
    this.limitController = controller
    const requestNumber = ++this.limitSequence
    return (async (): Promise<ApiResult<LimitMonitorResult>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const params = buildLimitMonitorParams(query)
      if (!params.ok) return params
      const response = await this.transport.post('limitMonitor', params.data, controller.signal, timeoutMs)
      if (requestNumber !== this.limitSequence) return apiError('REQUEST_ABORTED', '旧查询已取消。')
      const result = response.ok ? normalizeLimitMonitor(response.data, query) : response
      if (!result.ok && result.error.code === 'SESSION_EXPIRED') {
        this.session.expire()
        this.cancelLimitMonitor()
      }
      return result
    })()
  }

  submitLimitMails(userId: string, items: LimitMailSubmitItem[]): Promise<{ stopped: boolean; results: LimitMailSubmitResult[] }> {
    return submitLimitMailBatch(this.transport, userId, items)
  }

  submitFileManageMails(items: FileManageSubmitItem[]): Promise<{ stopped: boolean; results: FileManageSubmitResult[] }> {
    return submitFileManageBatch(this.transport, items)
  }

  /** 用文件查询里选中的下载名称生成发文文件名。不下载文件。 */
  resolveDownloadNames(fileIds: string[], selection: FileDownloadSelection): Promise<ApiResult<string[]>> {
    return (async (): Promise<ApiResult<string[]>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const controller = new AbortController()
      const transport = { post: async (...args: Parameters<EasyTransport['post']>) => {
        if (args[0] === 'getFileName') return this.postDownloadName(...args)
        const release = await this.downloadTokens.acquire('naming', args[2] ?? controller.signal)
        try { return await this.transport.post(...args) } finally { release() }
      } } as EasyTransport
      const result = await resolveDownloadFileNames(transport, fileIds, selection)
      if (!result.ok && result.error.code === 'SESSION_EXPIRED') this.session.expire()
      return result
    })()
  }

  /**
   * 下载文件：按下载名称生成文件名，再交给原站 DownLoad 打包、按 file_guid 把压缩包取回来。
   * stripAppNoDot 打开时申请号校验点去掉（202610026334.9 → 2026100263349），关掉就原样下载。
   * 不选下载名称就用查询结果里的原名。
   */
  downloadFiles(items: DownloadFileItem[], selection: FileDownloadSelection | null, stripAppNoDot: boolean, onProgress?: (progress: FileDownloadProgress) => void): Promise<ApiResult<DownloadedArchive>> {
    return (async (): Promise<ApiResult<DownloadedArchive>> => {
      if (!items.length || items.length > DOWNLOAD_MAX_ITEMS) {
        return apiError('INVALID_QUERY', `一次只能下载 1 到 ${DOWNLOAD_MAX_ITEMS} 个文件。`)
      }
      if (items.some(item => !isQueryGuid(item.fileId) || !item.fileNo.trim() || !item.fileName.trim())) {
        return apiError('INVALID_QUERY', '文件编号或原名不能用来下载。')
      }
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const named = selection
        ? await resolveDownloadFileNames(this.transport, items.map(item => item.fileId), selection, {
          onProgress: (done, total) => onProgress?.({ phase: 'naming', done, total })
        })
        : { ok: true as const, data: items.map(item => item.fileName.trim()) }
      if (!named.ok) {
        if (named.error.code === 'SESSION_EXPIRED') this.session.expire()
        return named
      }
      const names = stripAppNoDot ? named.data.map(stripApplicationNoDot) : named.data
      const params = buildDownloadParams(items.map(item => item.fileNo.trim()), names)
      if (!params) return apiError('INVALID_QUERY', '下载名称参数无效，没有下载。')
      onProgress?.({ phase: 'packing', done: 0, total: 1 })
      const packingStarted = Date.now()
      let receivedBytes = 0
      const reportPacking = () => onProgress?.({ phase: 'packing', done: 0, total: 1, elapsedMs: Date.now() - packingStarted, receivedBytes })
      const pulse = onProgress ? setInterval(reportPacking, 15_000) : undefined
      const prepared = await this.transport.post('fileDownload', params, undefined, undefined, received => {
        receivedBytes = received
        reportPacking()
      }).finally(() => clearInterval(pulse))
      if (!prepared.ok) {
        if (prepared.error.code === 'SESSION_EXPIRED') this.session.expire()
        return prepared
      }
      const handle = readDownloadHandle(prepared.data)
      if (!handle.ok) {
        if (handle.error.code === 'SESSION_EXPIRED') this.session.expire()
        return handle
      }
      const archive = this.transport.fileDownloadUrl(handle.data.fileGuid, handle.data.fileSize)
      if (!archive) return apiError('INVALID_QUERY', '下载文件编号无效，没有下载。')
      return {
        ok: true,
        data: {
          downloadUrl: archive,
          fileName: downloadArchiveName(),
          fileCount: items.length,
          notice: handle.data.notice
        }
      }
    })()
  }

  async streamFiles(items: DownloadFileItem[], selection: FileDownloadSelection | null, stripAppNoDot: boolean,
    sink: WritableStream<Uint8Array>, signal: AbortSignal, onProgress?: (progress: FileDownloadProgress) => void,
    recovery?: { cache?: import('./stream-cache').DownloadCache; zipCreatedAt?: string; deduplicate?: boolean; resolvedNames?: Record<string, string>; caseScopes?: Record<string, string> }): Promise<void> {
    if (!items.length || items.length > DOWNLOAD_MAX_ITEMS || items.some(item => !isQueryGuid(item.fileId) || !item.fileNo.trim() || !item.fileName.trim())) throw new Error('下载文件参数无效。')
    if (!(await this.confirmAccountRead())) throw new Error('请先确认EASY当前登录状态。')
    await streamDownloadFiles(this.transport, items, selection, stripAppNoDot, { sink, signal, onProgress, ...recovery, tokens: this.downloadTokens, namePost: this.postDownloadName })
  }

  cancelLimitMonitor(): void {
    this.limitSequence++
    this.limitController?.abort()
    this.limitController = null
  }

  /**
   * 手工查询走「新查询取消旧查询」的槽；全选所有页这类批量拉页传 batch，
   * 不占这个槽：批页之间、批页和手查之间互不取消（否则 4 页并行会互相 abort 掉）。
   */
  searchFiling(query: FilingSearchQuery, timeoutMs?: number, batch = false): Promise<ApiResult<FilingSearchResult>> {
    const controller = new AbortController()
    if (!batch) {
      this.cancelFiling()
      this.filingController = controller
    }
    const requestNumber = batch ? 0 : ++this.filingSequence
    return (async (): Promise<ApiResult<FilingSearchResult>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const params = buildFilingSearchParams(query)
      if (!params.ok) return params
      const response = await this.transport.post('filingSearch', params.data, controller.signal, timeoutMs)
      if (!batch && requestNumber !== this.filingSequence) return apiError('REQUEST_ABORTED', '旧查询已取消。')
      const result = response.ok ? normalizeFilingSearch(response.data, query) : response
      if (!result.ok && result.error.code === 'SESSION_EXPIRED') {
        this.session.expire()
        this.cancelFiling()
      }
      return result
    })()
  }

  cancelFiling(): void {
    this.filingSequence++
    this.filingController?.abort()
    this.filingController = null
  }

  searchFees(query: FeeSearchQuery, timeoutMs?: number, batch = false): Promise<ApiResult<FeeSearchResult>> {
    const controller = new AbortController()
    if (!batch) {
      this.cancelFeeSearch()
      this.feeController = controller
    }
    const requestNumber = batch ? 0 : ++this.feeSequence
    return (async (): Promise<ApiResult<FeeSearchResult>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const params = buildFeeSearchParams(query)
      const response = await this.transport.post('feeSearch', params.data, controller.signal, timeoutMs)
      if (!batch && requestNumber !== this.feeSequence) return apiError('REQUEST_ABORTED', '旧查询已取消。')
      const result = response.ok ? normalizeFeeSearch(response.data, query) : response
      if (result.ok && query.includeTranslationWordCounts === true) {
        await this.loadTranslationWordCounts(result.data, controller.signal)
        if (controller.signal.aborted || (!batch && requestNumber !== this.feeSequence)) {
          return apiError('REQUEST_ABORTED', '旧查询已取消。')
        }
      }
      if (!result.ok && result.error.code === 'SESSION_EXPIRED') {
        this.session.expire()
        this.cancelFeeSearch()
      }
      return result
    })()
  }

  private async loadTranslationWordCounts(result: FeeSearchResult, signal: AbortSignal): Promise<void> {
    const byCaseClass = new Map<string, typeof result.rows>()
    for (const row of result.rows) {
      if (!isTranslationFee(row) || translationWordCount(row) !== null ||
          !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.caseId) || !/^[OAT]$/.test(row.feeClass)) continue
      const key = `${row.caseId}:${row.feeClass}`
      const same = byCaseClass.get(key) ?? []
      same.push(row)
      byCaseClass.set(key, same)
    }
    for (const candidates of byCaseClass.values()) {
      if (signal.aborted) return
      const first = candidates[0]
      const response = await this.transport.post('caseFeeList', new URLSearchParams({
        Call: 'GetFeeListByCase', case_id: first.caseId, fee_class: first.feeClass,
        pageIndex: '1', pageSize: '100', _PK: 'fee_id', colsel: '', searchKey: '', log_pagename: 'CaseManage.aspx'
      }), signal, 8_000)
      if (!response.ok || !isRecord(response.data)) continue
      let details: unknown = response.data.TableRows
      if (typeof details === 'string') {
        try { details = JSON.parse(details) } catch { continue }
      }
      if (!Array.isArray(details)) continue
      const byId = new Map<string, unknown>()
      for (const detail of details) {
        if (!isRecord(detail) || typeof detail.fee_id !== 'string') continue
        byId.set(detail.fee_id.toUpperCase(), detail.word_count)
      }
      for (const row of candidates) {
        const count = byId.get(row.feeId.toUpperCase())
        if (typeof count === 'string' || typeof count === 'number') row.raw.word_count = count
      }
    }
  }

  searchFeesAmount(query: FeeSearchQuery, timeoutMs?: number): Promise<ApiResult<Record<string, unknown>>> {
    const controller = new AbortController()
    return (async (): Promise<ApiResult<Record<string, unknown>>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const params = buildFeeSearchAmountParams(query)
      const response = await this.transport.post('feeSearchAmount', params.data, controller.signal, timeoutMs)
      if (!response.ok) return response
      return { ok: true, data: isRecord(response.data) ? response.data : {} }
    })()
  }

  cancelFeeSearch(): void {
    this.feeSequence++
    this.feeController?.abort()
    this.feeController = null
  }

  searchPatents(query: PatentSearchQuery, timeoutMs?: number, batch = false): Promise<ApiResult<PatentSearchResult>> {
    const controller = new AbortController()
    if (!batch) {
      this.cancelPatentSearch()
      this.patentController = controller
    }
    const requestNumber = batch ? 0 : ++this.patentSequence
    return (async (): Promise<ApiResult<PatentSearchResult>> => {
      if (!(await this.confirmAccountRead())) {
        return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
      }
      const params = buildPatentSearchParams(query)
      if (!params.ok) return params
      const response = await this.transport.post('icSearch', params.data, controller.signal, timeoutMs)
      if (!batch && requestNumber !== this.patentSequence) return apiError('REQUEST_ABORTED', '旧查询已取消。')
      return response.ok ? normalizePatentSearch(response.data, query) : response
    })()
  }

  cancelPatentSearch(): void {
    this.patentSequence++
    this.patentController?.abort()
    this.patentController = null
  }

  /** 专利查询页初始化字典（对齐 MyICSearchList.js 的 IPGetBasicData + GetDeptBranch + LoadDeptTree + GetTreeUser + GetTreeAgent + GetFieldColumn）。 */
  async loadPatentInit(): Promise<ApiResult<PatentInitData>> {
    if (!(await this.confirmAccountRead())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const post = (op: Parameters<EasyTransport['post']>[0], extra: Record<string, string>) => {
      const p = new URLSearchParams(extra)
      p.set('log_pagename', 'ICSearch.aspx')
      return this.transport.post(op, p)
    }
    const [basicRes, branchRes, deptRes, userRes, agentRes, colRes, listColRes, contractRes, customFieldRes] = await Promise.all([
      post('basicData', { Call: 'IPGetBasicData' }),
      post('deptBranch', { Call: 'GetDeptBranch' }),
      post('deptTree', { Call: 'LoadDeptTree' }),
      post('treeUser', { Call: 'GetTreeUser' }),
      post('treeAgent', { Call: 'GetTreeAgent' }),
      post('fieldColumn', { Call: 'GetFieldColumn' }),
      post('listColumn', { Call: 'LoadListColumn', belong_key: 'CaseInfo.ashx_CaseList' }),
      post('contractInit', { Call: 'InitContractStatus' }),
      post('caseCustomField', { Call: 'GetCustomField', table_name: 'p_case_info' })
    ])
    if (!basicRes.ok) return basicRes

    const warnings: string[] = []
    if (!branchRes.ok) warnings.push(`分部读取失败：${branchRes.error.message}`)
    if (!deptRes.ok) warnings.push(`部门读取失败：${deptRes.error.message}`)
    if (!userRes.ok) warnings.push(`人员读取失败：${userRes.error.message}`)
    if (!agentRes.ok) warnings.push(`代理机构读取失败：${agentRes.error.message}`)

    const basicDicts = normalizePatentBasicDicts(basicRes.data, PATENT_CASE_TYPE_ID)

    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
    const arr = (obj: unknown, key: string): Record<string, unknown>[] => {
      if (!isRecord(obj)) return []
      const raw = obj[key]
      return Array.isArray(raw) ? raw.filter(isRecord) : []
    }
    const toTree = (rows: Record<string, unknown>[], valueKey: string, labelKey: string, parentKey = 'parent_id'): TreeOption[] =>
      rows
        .map(row => {
          const value = str(row[valueKey] ?? row.id ?? row.value)
          const label = str(row[labelKey] ?? row.text_zh_cn ?? row.name ?? row.label)
          if (!value || !label) return null
          const parent = str(row[parentKey] ?? row.pid ?? row.pId)
          const selectable = str(row.TreeType).toLowerCase() !== 'dept' || valueKey !== 'id'
          return {
            value,
            label,
            ...(parent && parent !== '0' && parent !== '-1' ? { parent } : {}),
            ...(selectable ? {} : { selectable: false })
          }
        })
        .filter((x): x is TreeOption => x !== null)

    const fieldColumns: Record<string, string> = {}
    if (colRes.ok && isRecord(colRes.data)) {
      for (const row of arr(colRes.data, 'fieldColumn')) {
        const key = str(row.field_name ?? row.column_name)
        const title = str(row.field_title ?? row.show_name ?? row.title)
        if (key && title) fieldColumns[key] = title
      }
    }
    if (customFieldRes.ok && isRecord(customFieldRes.data)) {
      for (const row of arr(customFieldRes.data, 'column_field_list')) {
        const key = str(row.column_id)
        const title = str(row.column_name)
        if (key && title) fieldColumns[key] = title
      }
    }

    const businessCoops = contractRes.ok && isRecord(contractRes.data)
      ? arr(contractRes.data, 'table5')
          .map(row => {
            const value = str(row.value)
            const label = str(row.text_zh_cn)
            return value && label ? { value, label } : null
          })
          .filter((x): x is { value: string; label: string } => x !== null)
      : []

    const savedColumns: string[] = []
    if (listColRes.ok && isRecord(listColRes.data)) {
      for (const row of arr(listColRes.data, 'show_column')) {
        const col = str(row.item_value)
        if (col) savedColumns.push(col)
      }
    }

    return {
      ok: true,
      data: {
        ...basicDicts,
        businessCoops,
        branchDepts: branchRes.ok ? toTree(arr(branchRes.data, 'BranchList'), 'dept_id', 'dept_name') : [],
        depts: deptRes.ok ? toTree(arr(deptRes.data, 'DeptTree'), 'id', 'name') : [],
        users: userRes.ok ? toTree(arr(userRes.data, 'TreeUser'), 'id', 'name') : [],
        agencies: agentRes.ok ? toTree(arr(agentRes.data, 'TreeUser'), 'id', 'name') : [],
        savedColumns,
        fieldColumns,
        warnings
      }
    }
  }

  async loadPatentCtrlProc(countryIds: string, procType = ''): Promise<ApiResult<TreeOption[]>> {
    if (!(await this.confirmAccountRead())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const params = new URLSearchParams({
      Call: 'LimitMonitorGetCtrlproc',
      case_type: PATENT_CASE_TYPE_ID,
      country: countryIds,
      proc_type: procType,
      log_pagename: 'ICSearch.aspx'
    })
    const res = await this.transport.post('limitCtrlProc', params)
    if (!res.ok) return res
    const body = isRecord(res.data) ? res.data : {}
    const rows = Array.isArray(body.CtrlProc) ? body.CtrlProc.filter(isRecord) : []
    const options: TreeOption[] = rows
      .map(row => {
        const value = typeof row.id === 'string' ? row.id.trim() : typeof row.ctrl_proc_id === 'string' ? row.ctrl_proc_id.trim() : ''
        const label = typeof row.name === 'string' ? row.name.trim() : typeof row.ctrl_proc === 'string' ? row.ctrl_proc.trim() : ''
        if (!value || !label) return null
        const parent = typeof row.pid === 'string' ? row.pid.trim() : typeof row.parent_id === 'string' ? row.parent_id.trim() : ''
        return { value, label, ...(parent && parent !== '0' ? { parent } : {}) }
      })
      .filter((x): x is TreeOption => x !== null)
    return { ok: true, data: options }
  }

  /** 费用查询页完整初始化字典（对齐 FeeSearch.js 的 FeeSearchInit + GetAencyList + ContactInit + GetProducts + LoadTechnical + GetFieldColumn）。 */
  async loadFeeInit(): Promise<ApiResult<FeeInitData>> {
    if (!(await this.confirmAccountRead())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const post = (op: Parameters<EasyTransport['post']>[0], extra: Record<string, string>) => {
      const p = new URLSearchParams(extra)
      p.set('log_pagename', 'FeeSearch.aspx')
      return this.transport.post(op, p)
    }
    const [initRes, agencyRes, contactRes, prodRes, techRes, colRes] = await Promise.all([
      post('feeSearchInit', { Call: 'FeeSearchInit' }),
      post('feeAgencyList', { Call: 'GetAencyList' }),
      post('feeContactInit', { Call: 'ContactInit' }),
      post('feeProducts', { Call: 'GetProducts' }),
      post('feeTechnical', { Call: 'LoadTechnical', Key: '' }),
      post('fieldColumn', { Call: 'GetFieldColumn' })
    ])
    if (!initRes.ok) return initRes

    const body = isRecord(initRes.data) ? initRes.data : {}
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
    const arr = (obj: unknown, key: string): Record<string, unknown>[] => {
      if (!isRecord(obj)) return []
      const raw = obj[key]
      return Array.isArray(raw) ? raw.filter(isRecord) : []
    }
    const dictItems = (rows: Record<string, unknown>[], valueKey = 'value', labelKey = 'text_zh_cn'): FeeOptionItem[] =>
      rows
        .map(row => {
          const value = str(row[valueKey] ?? row.id)
          const label = str(row[labelKey] ?? row.text ?? row.name)
          const caseTypeId = str(row.case_type_id ?? row.case_type)
          const countryId = str(row.country_id)
          if (!value || !label) return null
          return {
            value,
            label,
            ...(caseTypeId ? { caseTypeId } : {}),
            ...(countryId ? { countryId } : {})
          }
        })
        .filter((x): x is FeeOptionItem => x !== null)

    const treeItems = (rows: Record<string, unknown>[]): FeeOptionItem[] =>
      rows
        .map(row => {
          const value = str(row.id ?? row.value)
          const label = str(row.name ?? row.text_zh_cn ?? row.text ?? row.value)
          const rawParent = str(row.pid ?? row.pId ?? row.parent_id)
          const parent = rawParent && rawParent !== '0' && rawParent !== 'root' ? rawParent : ''
          if (!value || !label) return null
          return { value, label, ...(parent ? { parent } : {}) }
        })
        .filter((x): x is FeeOptionItem => x !== null)

    // FeeSearch.js L542: 排除科技服务 (882D9F78-7656-468E-BE98-68FE5E334A9B)
    const caseTypes = dictItems(arr(body, 'CaseType')).filter(
      item => item.value.toUpperCase() !== '882D9F78-7656-468E-BE98-68FE5E334A9B'
    )
    const directions = dictItems(arr(body, 'Case_direction'))
    const receiveStatuses = dictItems(arr(body, 'receive_status'))
    const payTypes = dictItems(arr(body, 'PayType'))
    const applyTypes = dictItems(arr(body, 'ApplyType'))
    const bussTypes = dictItems(arr(body, 'BussType'))
    const caseStatuses = dictItems(
      arr(body, 'case_status').filter(r => {
        const sc = str(r.status_class)
        return sc === '' || sc === 'ALL' || sc === 'CASE'
      })
    )
    const customerStatuses = dictItems(arr(body, 'customerStatus'))
    const reviewStages = dictItems(arr(body, 'review_stage'))
    const currencies = dictItems(arr(body, 'FeeCurrency'), 'currency_id', 'currency_name_zh_cn')
    const sourceTypes = dictItems(arr(body, 'sourcetype'))
    const bankList = dictItems(arr(body, 'bank_list'), 'bank_id', 'account_name')

    const feeTypes: FeeTypeItem[] = arr(body, 'FeeType')
      .map(row => ({
        id: str(row.fee_type_id),
        name: str(row.fee_type_zh_cn ?? row.fee_type_en_us),
        caseTypeId: str(row.case_type_id),
        countryId: str(row.country_id),
        applyTypeId: str(row.apply_type_id),
        feeClass: str(row.fee_class),
        caseTypeName: str(row.case_type_zh_cn),
        applyTypeName: str(row.apply_type_zh_ch),
        countryName: str(row.country_zh_cn),
        currencyName: str(row.currency_name_zh_cn)
      }))
      .filter(item => Boolean(item.id && item.name))

    const agencies = agencyRes.ok ? dictItems(arr(agencyRes.data, 'AgencyList'), 'agency_id', 'agency_name_cn') : []
    const contactTypes = contactRes.ok ? dictItems(arr(contactRes.data, 'contacttype')) : []
    const products = prodRes.ok ? treeItems(arr(prodRes.data, 'Products')) : []
    const technicals = techRes.ok ? treeItems(arr(techRes.data, 'Technical')) : []

    const fieldColumns: Record<string, string> = {}
    if (colRes.ok) {
      for (const row of arr(colRes.data, 'fieldColumn')) {
        const colId = str(row.column_id)
        const colName = str(row.column_name)
        if (colId && colName) fieldColumns[colId] = colName
      }
    }

    return {
      ok: true,
      data: {
        caseTypes,
        directions,
        receiveStatuses,
        payTypes,
        feeTypes,
        applyTypes,
        bussTypes,
        caseStatuses,
        customerStatuses,
        reviewStages,
        currencies,
        sourceTypes,
        bankList,
        agencies,
        contactTypes,
        products,
        technicals,
        fieldColumns
      }
    }
  }

  /** 费用查询二级客户选择弹窗搜索（对齐 ShowIhgSelect -> Report.ashx?Call=GetCustomerTreeData）。 */
  async searchFeeCustomers(searchKey: string): Promise<ApiResult<FeeCustomerItem[]>> {
    if (!(await this.confirmAccountRead())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const p = new URLSearchParams()
    p.set('Call', 'GetCustomerTreeData')
    p.set('searchKey', searchKey.trim().replace(/'/g, "''"))
    p.set('log_pagename', 'FeeSearch.aspx')
    const response = await this.transport.post('feeCustomerTree', p)
    if (!response.ok) return response
    const rawList = isRecord(response.data) && Array.isArray(response.data.CustList) ? response.data.CustList : []
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
    const items: FeeCustomerItem[] = rawList
      .filter(isRecord)
      .map(row => ({
        id: str(row.id),
        name: str(row.name),
        tel: str(row.tel),
        email: str(row.email)
      }))
      .filter(item => Boolean(item.id && item.name))
    return { ok: true, data: items }
  }

  /** 费用查询申请人树联动（对齐 FeeSearch.LoadTreeApplicant -> Report.ashx?Call=GetTreeApplicant）。 */
  async loadFeeApplicants(customerIds: string): Promise<ApiResult<FeeApplicantItem[]>> {
    if (!(await this.confirmAccountRead())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    if (!customerIds.trim()) return { ok: true, data: [] }
    const p = new URLSearchParams()
    p.set('Call', 'GetTreeApplicant')
    p.set('customer_ids', customerIds.trim())
    p.set('log_pagename', 'FeeSearch.aspx')
    const response = await this.transport.post('feeApplicantTree', p)
    if (!response.ok) return response
    const rawList = isRecord(response.data) && Array.isArray(response.data.TreeApplicant) ? response.data.TreeApplicant : []
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
    const items: FeeApplicantItem[] = rawList
      .filter(isRecord)
      .map(row => {
        const value = str(row.id)
        const label = str(row.name)
        const rawPid = str(row.pid ?? row.pId)
        const parent = rawPid && rawPid !== 'root' && rawPid !== '0' ? rawPid : undefined
        const isGroup = str(row.TreeType) === 'Dept' || row.is_branch === 1 || row.is_branch === true
        if (!value || !label) return null
        return {
          value,
          label,
          ...(parent ? { parent } : {}),
          ...(isGroup ? { selectable: false } : {})
        }
      })
      .filter((x): x is FeeApplicantItem => x !== null)
    return { ok: true, data: items }
  }

  /** 费用导出模板管理（对齐 IhgAdvExport.js：Common.ashx GetQueryOutConfig / UpdateQueryOutConfig / UpdateQueryOutConfigNew）。 */
  async manageFeeExportConfig(request: FeeExportConfigRequest): Promise<ApiResult<FeeExportConfigResponse>> {
    if (!(await this.confirmAccountRead())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
    const readTemplates = (body: Record<string, unknown>): FeeExportTemplate[] => {
      const list = Array.isArray(body.out_model) ? body.out_model : []
      return list
        .filter(isRecord)
        .map(row => ({ typeId: str(row.type_id), typeText: str(row.type_text) }))
        .filter(item => Boolean(item.typeId && item.typeText))
    }

    if (request.action === 'list') {
      const p = new URLSearchParams({ Call: 'GetQueryOutConfig', belong_key: request.belongKey, log_pagename: 'IhgAdvExport.aspx' })
      const response = await this.transport.post('feeExportConfig', p)
      if (!response.ok) return response
      const body = isRecord(response.data) ? response.data : {}
      return { ok: true, data: { templates: readTemplates(body) } }
    }

    if (request.action === 'detail') {
      const typeId = (request.typeId ?? '').trim()
      if (!typeId) return apiError('INVALID_QUERY', '请选择导出模板。')
      const p = new URLSearchParams({ Call: 'GetQueryOutConfig', type_id: typeId, log_pagename: 'IhgAdvExport.aspx' })
      const response = await this.transport.post('feeExportConfig', p)
      if (!response.ok) return response
      const body = isRecord(response.data) ? response.data : {}
      const info = isRecord(body.ClientInfo) ? body.ClientInfo : null
      if (info && info.IsLogin === false) {
        this.session.expire()
        return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请重新登录。')
      }
      if (!Array.isArray(body.out_columns)) {
        return apiError('BUSINESS_ERROR', str(info?.Message) || '未能读取模板栏位配置。')
      }
      const columns: FeeExportTemplateColumn[] = body.out_columns
        .filter(isRecord)
        .map((row, idx) => ({
          seq: Number(row.seq) || idx + 1,
          value: str(row.item_value),
          text: str(row.item_text)
        }))
        .filter(item => Boolean(item.value && item.text))
        .sort((a, b) => a.seq - b.seq)
      return { ok: true, data: { columns } }
    }

    if (!isWriteSwitchOpen()) {
      return apiError('BUSINESS_ERROR', '写开关已关闭，无法保存、更新或删除原站导出模板。')
    }

    if (request.action === 'del') {
      const typeId = (request.typeId ?? '').trim()
      if (!typeId) return apiError('INVALID_QUERY', '请选择要删除的模板。')
      const p = new URLSearchParams({
        Call: 'UpdateQueryOutConfig',
        ud_type: 'del',
        belong_key: request.belongKey,
        out_type_id: typeId,
        log_pagename: 'IhgAdvExport.aspx'
      })
      const response = await this.transport.post('feeExportConfigSave', p)
      if (!response.ok) return response
      const body = isRecord(response.data) ? response.data : {}
      const info = isRecord(body.ClientInfo) ? body.ClientInfo : null
      if (info && info.IsLogin === false) {
        this.session.expire()
        return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请重新登录。')
      }
      if (info && info.Result === false) {
        return apiError('BUSINESS_ERROR', str(info.Message) || '删除模板失败。')
      }
      let templates = readTemplates(body)
      if (templates.some(t => t.typeId === typeId)) {
        return apiError('BUSINESS_ERROR', '原站删除模板未能生效，该模板仍然存在。')
      }
      if (!templates.length) {
        // 若响应未内联最新列表，发起只读回查核实状态
        const verifyResp = await this.manageFeeExportConfig({ action: 'list', belongKey: request.belongKey })
        if (verifyResp.ok && verifyResp.data.templates) {
          templates = verifyResp.data.templates
          if (templates.some(t => t.typeId === typeId)) {
            return apiError('BUSINESS_ERROR', '原站回查显示该模板未被成功删除。')
          }
        }
      }
      return { ok: true, data: { templates, message: '模板已删除。' } }
    }

    const modelName = (request.modelName ?? '').trim()
    const cols = request.columns ?? []
    if (!cols.length) return apiError('INVALID_QUERY', '请至少选择一个导出栏位。')
    if (!modelName) return apiError('INVALID_QUERY', '请输入模板名称。')
    const element = buildTemplateElementXml(cols)

    if (request.action === 'add') {
      const p = new URLSearchParams({
        Call: 'UpdateQueryOutConfig',
        ud_type: 'add',
        belong_key: request.belongKey,
        model_name: modelName,
        element,
        log_pagename: 'IhgAdvExport.aspx'
      })
      const response = await this.transport.post('feeExportConfigSave', p)
      if (!response.ok) return response
      const body = isRecord(response.data) ? response.data : {}
      const info = isRecord(body.ClientInfo) ? body.ClientInfo : null
      if (info && info.IsLogin === false) {
        this.session.expire()
        return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请重新登录。')
      }
      if (info && info.Result === false) {
        return apiError('BUSINESS_ERROR', str(info.Message) || '保存模板失败。')
      }
      let templates = readTemplates(body)
      // 若原站未直接回传最新 out_model 或未能匹配，发起只读回查验证目标模板是否存在
      const foundInBody = templates.some(t => t.typeText === modelName)
      if (!foundInBody) {
        const verifyResp = await this.manageFeeExportConfig({ action: 'list', belongKey: request.belongKey })
        if (verifyResp.ok && verifyResp.data.templates) {
          templates = verifyResp.data.templates
        }
      }
      const verified = templates.find(t => t.typeText === modelName)
      if (!verified && info?.Result !== true) {
        return apiError('BUSINESS_ERROR', '原站未确认模板已保存，回查未能找到新模板。')
      }
      return { ok: true, data: { templates, message: '模板保存成功。' } }
    }

    // action === 'up'
    const typeId = (request.typeId ?? '').trim()
    if (!typeId) return apiError('INVALID_QUERY', '请先选择要更新的模板。')
    const p = new URLSearchParams({
      Call: 'UpdateQueryOutConfigNew',
      ud_type: 'up',
      belong_key: request.belongKey,
      out_type_id: typeId,
      model_name: modelName,
      element,
      log_pagename: 'IhgAdvExport.aspx'
    })
    const response = await this.transport.post('feeExportConfigUpdate', p)
    if (!response.ok) return response
    const body = isRecord(response.data) ? response.data : {}
    const info = isRecord(body.ClientInfo) ? body.ClientInfo : null
    if (info && info.IsLogin === false) {
      this.session.expire()
      return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请重新登录。')
    }
    if (info && info.Result === false) {
      return apiError('BUSINESS_ERROR', str(info.Message) || '更新模板失败。')
    }
    let templates = readTemplates(body)
    if (!templates.length) {
      const verifyResp = await this.manageFeeExportConfig({ action: 'list', belongKey: request.belongKey })
      if (verifyResp.ok && verifyResp.data.templates) {
        templates = verifyResp.data.templates
      }
    }
    return { ok: true, data: { templates, message: '模板更新成功。' } }
  }

  /** 执行原站费用 Excel 导出（对齐 Report.ashx ExcelFeeListByCond / ExcelFeeListByChecked / ExcelFeeListCountByCond）。 */
  async exportFees(request: FeeExportRequest): Promise<ApiResult<{ async: boolean; downloadUrl?: string; fileGuid?: string; fileSize?: number | null; message: string }>> {
    if (!(await this.confirmAccountRead())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const xml = buildExportColumnsXml(request.columns)
    if (!xml) {
      return apiError('INVALID_QUERY', '请至少选择一个导出栏位。')
    }

    let op: 'feeExportByCond' | 'feeExportByChecked' | 'feeExportCountByCond'
    let callName: string
    let p: URLSearchParams

    if (request.mode === 'checked') {
      const feeIds = (request.feeIds ?? []).map(id => id.trim()).filter(Boolean)
      if (!feeIds.length) {
        return apiError('INVALID_QUERY', '请先勾选要导出的费用记录。')
      }
      op = 'feeExportByChecked'
      callName = 'ExcelFeeListByChecked'
      p = new URLSearchParams()
      p.set('Call', callName)
      p.set('fee_ids', feeIds.join(';'))
    } else {
      op = request.mode === 'count' ? 'feeExportCountByCond' : 'feeExportByCond'
      callName = request.mode === 'count' ? 'ExcelFeeListCountByCond' : 'ExcelFeeListByCond'
      const built = buildFeeSearchParams(request.query ?? { pageIndex: 1, pageSize: 10 })
      p = built.data
      p.delete('colsel')
      p.set('Call', callName)
      p.set('fee_page_type', '')
      p.set('PageIndex', String(request.query?.pageIndex ?? 1))
      p.set('PageSize', String(request.query?.pageSize ?? 10))
    }

    p.set('e_coulums', xml)
    p.set('log_pagename', 'IhgAdvExport.aspx')

    const response = await this.transport.post(op, p, undefined, request.timeoutMs)
    if (!response.ok) {
      if (response.error.code === 'SESSION_EXPIRED') this.session.expire()
      return response
    }
    const body = isRecord(response.data) ? response.data : {}
    const info = isRecord(body.ClientInfo) ? body.ClientInfo : null
    if (info && info.IsLogin === false) {
      this.session.expire()
      return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请重新登录。')
    }
    if (info && info.Result === false) {
      const msg = typeof info.Message === 'string' && info.Message.trim() ? info.Message.trim() : '原站导出失败。'
      return apiError('BUSINESS_ERROR', msg)
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
    const fileGuid = typeof body.file_guid === 'string' ? body.file_guid.trim() : ''
    const rawSize = typeof body.file_size === 'number' ? body.file_size : typeof body.file_size === 'string' && /^\d+$/.test(body.file_size.trim()) ? Number(body.file_size.trim()) : null
    const downloadUrl = fileGuid ? this.transport.fileDownloadUrl(fileGuid, rawSize) : null
    if (!downloadUrl) {
      const msg = typeof info?.Message === 'string' && info.Message.trim() ? info.Message.trim() : '原站未返回有效的导出文件地址（可能当前条件下无可导出数据）。'
      return apiError('BUSINESS_ERROR', msg)
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

  private readonly userInfoCache = new Map<string, FilingUser>()

  /** 递交导出用：一件递交的流程历史。Common.ashx GetFlowHistory，obj_id 传 filing_id。 */
  async filingFlowHistory(filingId: string): Promise<ApiResult<FilingFlowRow[]>> {
    if (!(await this.confirmAccountRead())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const params = filingFlowHistoryParams(filingId)
    if (!params) return apiError('INVALID_QUERY', '递交编号无效。')
    const response = await this.transport.post('getFlowHistory', params)
    if (!response.ok) {
      if (response.error.code === 'SESSION_EXPIRED') this.session.expire()
      return response
    }
    return readFilingFlowHistory(response.data)
  }

  /** 递交导出用：办理人浮窗里的部门。同一个人只查一次。 */
  async filingUserInfo(userId: string): Promise<ApiResult<FilingUser>> {
    const cached = this.userInfoCache.get(userId)
    if (cached) return { ok: true, data: cached }
    if (!(await this.confirmAccountRead())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const params = userInfoParams(userId)
    if (!params) return apiError('INVALID_QUERY', '人员编号无效。')
    const response = await this.transport.post('showUserInfo', params)
    if (!response.ok) {
      if (response.error.code === 'SESSION_EXPIRED') this.session.expire()
      return response
    }
    const result = readUserInfo(response.data, userId)
    if (result.ok) this.userInfoCache.set(userId, result.data)
    return result
  }

  async loadNoticeInit(): Promise<ApiResult<NoticeInitData>> {
    return this.notice.loadNoticeInit()
  }

  async searchNotices(request: NoticeSearchRequest, timeoutMs?: number, signal?: AbortSignal): Promise<ApiResult<NoticeSearchResult>> {
    return this.notice.searchNotices(request, timeoutMs, signal)
  }

  async executeNoticeAction(
    request: NoticeActionRequest,
    onStatus?: (event: NoticeTaskStatusEvent) => void
  ): Promise<ApiResult<NoticeActionResult>> {
    return this.notice.executeNoticeAction(request, onStatus)
  }

  async exportNoticeExcel(request: NoticeExportRequest): Promise<
    ApiResult<{ async: boolean; downloadUrl?: string; fileGuid?: string; fileSize?: number | null; message: string }>
  > {
    return this.notice.exportNoticeExcel(request)
  }

  async uploadNoticeExcel(request: NoticeExcelUploadRequest): Promise<ApiResult<NoticeExcelUploadResult>> {
    return this.notice.uploadNoticeExcel(request)
  }

  async inspectFeeReduceCases(caseVolumes: string[]): Promise<ApiResult<FeeReduceInspectResult>> {
    if (!(await this.confirmAccountRead())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const result = await this.feeReduce.inspectCases(caseVolumes)
    if (!result.ok && result.error.code === 'SESSION_EXPIRED') this.session.expire()
    return result
  }

  async readFeeReduceReviewers(): Promise<ApiResult<FeeReduceReviewersResult>> {
    if (!(await this.confirmAccountRead())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const result = await this.feeReduce.readReviewers()
    if (!result.ok && result.error.code === 'SESSION_EXPIRED') this.session.expire()
    return result
  }

  async submitFeeReduceFiling(request: FeeReduceSubmitRequest): Promise<ApiResult<FeeReduceSubmitResult>> {
    if (!isWriteSwitchOpen()) {
      return apiError('BUSINESS_ERROR', '写开关已关闭，不能提交费用减缓递交。')
    }
    if (!(await this.confirmAccountRead())) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    const result = await this.feeReduce.submitFeeReduce(request)
    if (!result.ok && result.error.code === 'SESSION_EXPIRED') this.session.expire()
    return result
  }

  cancelFileSearch(): void {
    this.searchSequence++
    this.searchController?.abort()
    this.searchController = null
    this.activeSearch = null
  }

  dispose(): void {
    this.cancelSessionCheck()
    this.cancelFileSearch()
    this.cancelLimitMonitor()
    this.cancelFiling()
    this.cancelFeeSearch()
    this.cancelPatentSearch()
    this.history.invalidate()
    this.dictionaries.invalidate(this.historyUserKey)
    this.historyUserKey = ''
    this.listColsel = null
    this.session.clear()
  }
}

function addressField(row: Record<string, unknown>, key: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return null
  const value = row[key]
  if (value === null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function volumesOnMail(data: unknown): string[] | null {
  if (!isRecord(data) || data.TableRows === null || !Array.isArray(data.TableRows)) return null
  const volumes: string[] = []
  for (const row of data.TableRows) {
    if (!isRecord(row)) return null
    const ours = typeof row.case_volume === 'string' ? row.case_volume.trim() : ''
    const theirs = typeof row.case_volume_customer === 'string' ? row.case_volume_customer.trim() : ''
    if (ours) volumes.push(ours)
    if (theirs) volumes.push(theirs)
  }
  const raw = data.TableRowsCount
  const total = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : data.TableRows.length
  if (total > data.TableRows.length) return null
  return volumes
}
