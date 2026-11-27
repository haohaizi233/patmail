import { isFileMailConfig, type FileMailConfig } from '../customer/file-mail-config'
import type { PageInfo, PageSnapshot } from './types'
import { isPageInfo, isPageSnapshot, isRecord } from './guards'
import { isEasyOrigin } from '../api/config'
import { isCustomerMode, type CustomerMode } from '../settings/customer-mode'
import { isCustomerProfile } from '../customer/guards'
import { isFileDownloadSelection, type FileDownloadSelection } from '../mail/download-name'
import { DOWNLOAD_MAX_ITEMS } from '../api/file-download'
import type { CustomerQueryProfile } from '../customer/types'
import type { MailRuleBundle } from '../mail/types'
import { isQueryGuid, isQueryTemplate } from '../query/query-validator'
import type { QueryTemplate } from '../query/query-types'
import { isEasyConnection, type EasyConnectionContext, type EasyTabCandidate, type ExpectedAccountScope } from './connection'
import { isCaseContactResult, isDictionaryResult, isFeeReduceInspectApiResult, isFeeReduceInspectPayload, isFeeReduceReviewersApiResult, isFeeReduceSubmitApiResult, isFeeReduceSubmitPayload, isFeeSearchApiResult, isFeeSearchQuery, isFileSearchApiResult, isFileSearchQuery, isFilingFlowApiResult, isFilingSearchApiResult, isFilingSearchQuery, isFilingUserApiResult, isFileTempNamesResult, isHistoryDeleteResult, isHistoryDetailResult, isHistoryListResult, isHistorySaveResult, isLimitMonitorApiResult, isLimitMonitorQuery, isMailProcessApiResult, isMailProcessQuery, isNoticeActionRequest, isNoticeExcelUploadRequest, isNoticeExportRequest, isNoticeSearchApiResult, isNoticeSearchRequest, isPatentSearchApiResult, isPatentSearchQuery, isSessionResult, isVolumeList, isWriteNoticeAction } from '../api/message-guards'
import type {
  FeeReduceInspectResult,
  FeeReduceReviewersResult,
  FeeReduceSubmitRequest,
  FeeReduceSubmitResult
} from '../api/fee-reduce-types'
import type { FileTempNameList } from '../api/file-temp-name'
import type { LimitMonitorQuery } from '../api/limit-monitor-params'
import type { FilingSearchQuery } from '../api/filing-search-params'
import type { FeeSearchQuery } from '../api/fee-search-params'
import type { PatentSearchQuery } from '../api/patent-search-params'
import type { PatentInitData, PatentSearchResult } from '../api/patent-search-types'
import type { TreeOption } from '../query/option-tree'
import { isProcessOpenTarget, type ProcessListQuery, type ProcessListResult, type ProcessOpenTarget } from '../api/mail-process'
import type { CaseContactExport } from '../case-contact/query'
import type { CaseDemandAsset } from '../mail/easy/case-demand'
import type { CustomerDemandAsset, CustomerDirectoryAsset } from '../customer/customer-page'
import type { MailContactAsset } from '../mail/easy/mail-contacts'
import type { AccountReviewerList } from '../workflow/contracts'
import type { LimitMonitorResult } from '../api/limit-monitor-types'
import type { FilingSearchResult } from '../api/filing-search-types'
import type { FeeApplicantItem, FeeCustomerItem, FeeInitData, FeeSearchResult } from '../api/fee-search-types'
import type { FeeExportConfigRequest, FeeExportConfigResponse, FeeExportRequest, FeeExportResponse } from '../api/fee-export'
import type {
  NoticeActionRequest,
  NoticeActionResult,
  NoticeExcelUploadRequest,
  NoticeExcelUploadResult,
  NoticeExportRequest,
  NoticeExportResult,
  NoticeInitData,
  NoticeSearchRequest,
  NoticeSearchResult
} from '../api/notice-types'
import type { FilingFlowRow, FilingUser } from '../api/filing-export'
import type { DictionaryLoadRequest, DictionarySnapshot } from '../api/dictionaries'
import type { FileSearchQuery } from '../api/file-search-params'
import { fileSearchTimeoutMs } from '../api/file-search-params'
import type { FileSearchResult } from '../api/file-search-types'
import type { HistoryQueryDetail, HistoryQueryOption } from '../api/query-history'
import type { SessionSummary } from '../api/session'
import type { ApiResult } from '../api/types'
import { AGENT_HISTORY_LIMIT, AGENT_TURN_CHARS } from '../agent/memory'
import type { IcFlowAsk, IcFlowHit } from '../customer/pct-flow-status'
import { isMailDraftPreview, isMailExecutionView, isSelectionClaim } from '../mail/easy/guards'
import type { SelectionClaim } from '../mail/easy/runtime'
import type { MailDraftPreview, SelectedPatentFile } from '../mail/types'
import type { MailExecutionView } from '../mail/easy/types'
import { isWorkflowView } from '../workflow/guards'
import type { WorkflowView } from '../workflow/types'
import { isWriteSwitchOpen } from '../settings/write-switch'

/** 所有通道共享的 JSON 消息信封；具体消息使用下方的可辨识联合类型。 */
export interface Message<TPayload = unknown> {
  type: string
  payload?: TPayload
}

export const MessageType = {
  ScanPage: 'SCAN_PAGE',
  ScanResult: 'SCAN_RESULT',
  GetPageInfo: 'GET_PAGE_INFO',
  PageInfo: 'PAGE_INFO',
  ShowPanel: 'SHOW_PANEL',
  PanelShown: 'PANEL_SHOWN',
  Ping: 'PING',
  Pong: 'PONG',
  CheckSession: 'CHECK_SESSION',
  SessionResult: 'SESSION_RESULT',
  CancelSessionCheck: 'CANCEL_SESSION_CHECK',
  SessionCheckCancelled: 'SESSION_CHECK_CANCELLED',
  SearchFiles: 'SEARCH_FILES',
  SearchFilesResult: 'SEARCH_FILES_RESULT',
  SearchLimitMonitor: 'SEARCH_LIMIT_MONITOR',
  SearchLimitMonitorResult: 'SEARCH_LIMIT_MONITOR_RESULT',
  SearchFiling: 'SEARCH_FILING',
  SearchFilingResult: 'SEARCH_FILING_RESULT',
  SearchFee: 'SEARCH_FEE',
  SearchFeeResult: 'SEARCH_FEE_RESULT',
  SearchFeeAmount: 'SEARCH_FEE_AMOUNT',
  SearchFeeAmountResult: 'SEARCH_FEE_AMOUNT_RESULT',
  LoadFeeInit: 'LOAD_FEE_INIT',
  LoadFeeInitResult: 'LOAD_FEE_INIT_RESULT',
  SearchFeeCustomers: 'SEARCH_FEE_CUSTOMERS',
  SearchFeeCustomersResult: 'SEARCH_FEE_CUSTOMERS_RESULT',
  LoadFeeApplicants: 'LOAD_FEE_APPLICANTS',
  LoadFeeApplicantsResult: 'LOAD_FEE_APPLICANTS_RESULT',
  FeeExportConfig: 'FEE_EXPORT_CONFIG',
  FeeExportConfigResult: 'FEE_EXPORT_CONFIG_RESULT',
  ExportFee: 'EXPORT_FEE',
  ExportFeeResult: 'EXPORT_FEE_RESULT',
  SearchPatent: 'SEARCH_PATENT',
  SearchPatentResult: 'SEARCH_PATENT_RESULT',
  LoadPatentInit: 'LOAD_PATENT_INIT',
  LoadPatentInitResult: 'LOAD_PATENT_INIT_RESULT',
  LoadPatentCtrlProc: 'LOAD_PATENT_CTRL_PROC',
  LoadPatentCtrlProcResult: 'LOAD_PATENT_CTRL_PROC_RESULT',
  LoadNoticeInit: 'LOAD_NOTICE_INIT',
  LoadNoticeInitResult: 'LOAD_NOTICE_INIT_RESULT',
  SearchNotice: 'SEARCH_NOTICE',
  SearchNoticeResult: 'SEARCH_NOTICE_RESULT',
  NoticeAction: 'NOTICE_ACTION',
  NoticeActionResult: 'NOTICE_ACTION_RESULT',
  ExportNotice: 'EXPORT_NOTICE',
  ExportNoticeResult: 'EXPORT_NOTICE_RESULT',
  UploadNoticeExcel: 'UPLOAD_NOTICE_EXCEL',
  UploadNoticeExcelResult: 'UPLOAD_NOTICE_EXCEL_RESULT',
  InspectFeeReduceCases: 'INSPECT_FEE_REDUCE_CASES',
  InspectFeeReduceCasesResult: 'INSPECT_FEE_REDUCE_CASES_RESULT',
  ReadFeeReduceReviewers: 'READ_FEE_REDUCE_REVIEWERS',
  ReadFeeReduceReviewersResult: 'READ_FEE_REDUCE_REVIEWERS_RESULT',
  SubmitFeeReduceFiling: 'SUBMIT_FEE_REDUCE_FILING',
  SubmitFeeReduceFilingResult: 'SUBMIT_FEE_REDUCE_FILING_RESULT',
  SubmitLimitMail: 'SUBMIT_LIMIT_MAIL',
  SubmitLimitMailResult: 'SUBMIT_LIMIT_MAIL_RESULT',
  SubmitFileManage: 'SUBMIT_FILE_MANAGE',
  SubmitFileManageResult: 'SUBMIT_FILE_MANAGE_RESULT',
  ResolveDownloadNames: 'RESOLVE_DOWNLOAD_NAMES',
  ResolveDownloadNamesResult: 'RESOLVE_DOWNLOAD_NAMES_RESULT',
  DownloadFiles: 'DOWNLOAD_FILES',
  DownloadFilesResult: 'DOWNLOAD_FILES_RESULT',
  DownloadFilesAccepted: 'DOWNLOAD_FILES_ACCEPTED',
  SaveDownload: 'SAVE_DOWNLOAD',
  SaveDownloadResult: 'SAVE_DOWNLOAD_RESULT',
  DownloadState: 'DOWNLOAD_STATE',
  DownloadStateResult: 'DOWNLOAD_STATE_RESULT',
  StreamDownload: 'STREAM_DOWNLOAD',
  BrowserStreamDownload: 'BROWSER_STREAM_DOWNLOAD',
  StreamDownloadResult: 'STREAM_DOWNLOAD_RESULT',
  DiscardDownload: 'DISCARD_DOWNLOAD',
  DiscardDownloadResult: 'DISCARD_DOWNLOAD_RESULT',
  PauseDownload: 'PAUSE_DOWNLOAD',
  PauseDownloadResult: 'PAUSE_DOWNLOAD_RESULT',
  ExportCaseContacts: 'EXPORT_CASE_CONTACTS',
  ExportCaseContactsResult: 'EXPORT_CASE_CONTACTS_RESULT',
  ListMailProcesses: 'LIST_MAIL_PROCESSES',
  ListMailProcessesResult: 'LIST_MAIL_PROCESSES_RESULT',
  OpenEasyForm: 'OPEN_EASY_FORM',
  OpenEasyFormResult: 'OPEN_EASY_FORM_RESULT',
  ListFlowReviewers: 'LIST_FLOW_REVIEWERS',
  ListFlowReviewersResult: 'LIST_FLOW_REVIEWERS_RESULT',
  ReadCaseDemands: 'READ_CASE_DEMANDS',
  CaseDemandResult: 'CASE_DEMAND_RESULT',
  ReadCaseBusFlow: 'READ_CASE_BUS_FLOW',
  CaseBusFlowResult: 'CASE_BUS_FLOW_RESULT',
  LookupIcFlow: 'LOOKUP_IC_FLOW',
  LookupIcFlowResult: 'LOOKUP_IC_FLOW_RESULT',
  CancelHagueRead: 'CANCEL_HAGUE_READ',
  CancelHagueReadResult: 'CANCEL_HAGUE_READ_RESULT',
  ReadHagueCase: 'READ_HAGUE_CASE',
  ReadHagueCaseResult: 'READ_HAGUE_CASE_RESULT',
  ReadCaseFields: 'READ_CASE_FIELDS',
  ReadCaseFieldsResult: 'READ_CASE_FIELDS_RESULT',
  ReadFilingFlow: 'READ_FILING_FLOW',
  ReadFilingFlowResult: 'READ_FILING_FLOW_RESULT',
  ReadUserInfo: 'READ_USER_INFO',
  ReadUserInfoResult: 'READ_USER_INFO_RESULT',
  ReadCustomerDemands: 'READ_CUSTOMER_DEMANDS',
  CustomerDemandResult: 'CUSTOMER_DEMAND_RESULT',
  ReadCustomerDirectory: 'READ_CUSTOMER_DIRECTORY',
  CustomerDirectoryResult: 'CUSTOMER_DIRECTORY_RESULT',
  ReadMailContacts: 'READ_MAIL_CONTACTS',
  MailContactResult: 'MAIL_CONTACT_RESULT',
  ReadMailAddresses: 'READ_MAIL_ADDRESSES',
  MailAddressResult: 'MAIL_ADDRESS_RESULT',
  CancelFileSearch: 'CANCEL_FILE_SEARCH',
  CancelLimitMonitor: 'CANCEL_LIMIT_MONITOR',
  FileSearchCancelled: 'FILE_SEARCH_CANCELLED',
  ListHistoryQueries: 'LIST_HISTORY_QUERIES',
  HistoryQueriesResult: 'HISTORY_QUERIES_RESULT',
  GetHistoryQuery: 'GET_HISTORY_QUERY',
  HistoryQueryResult: 'HISTORY_QUERY_RESULT',
  SaveHistoryQuery: 'SAVE_HISTORY_QUERY',
  HistoryQuerySaved: 'HISTORY_QUERY_SAVED',
  DeleteHistoryQuery: 'DELETE_HISTORY_QUERY',
  HistoryQueryDeleted: 'HISTORY_QUERY_DELETED',
  SaveFileTempName: 'SAVE_FILE_TEMP_NAME',
  DeleteFileTempName: 'DELETE_FILE_TEMP_NAME',
  FileTempNamesResult: 'FILE_TEMP_NAMES_RESULT',
  LoadDictionary: 'LOAD_DICTIONARY',
  ScanFileSearchForm: 'SCAN_FILE_SEARCH_FORM',
  FileSearchFormResult: 'FILE_SEARCH_FORM_RESULT',
  ScanFilingForm: 'SCAN_FILING_FORM',
  FilingFormResult: 'FILING_FORM_RESULT',
  ReadQuerySurfaces: 'READ_QUERY_SURFACES',
  QuerySurfacesResult: 'QUERY_SURFACES_RESULT',
  DictionaryResult: 'DICTIONARY_RESULT',
  CreateEasyMail: 'CREATE_EASY_MAIL',
  SaveEasyMail: 'SAVE_EASY_MAIL',
  FindMailExecution: 'FIND_MAIL_EXECUTION',
  InspectEasyMail: 'INSPECT_EASY_MAIL',
  MailExecutionResult: 'MAIL_EXECUTION_RESULT',
  ReadWorkflow: 'READ_WORKFLOW',
  RefreshWorkflow: 'REFRESH_WORKFLOW',
  PreviewWorkflow: 'PREVIEW_WORKFLOW',
  RestoreWorkflow: 'RESTORE_WORKFLOW',
  DiagnoseExistingMail: 'DIAGNOSE_EXISTING_MAIL',
  ExistingMailDiagnostic: 'EXISTING_MAIL_DIAGNOSTIC',
  ClaimExecution: 'CLAIM_EXECUTION',
  MarkExecutionPrepared: 'MARK_EXECUTION_PREPARED',
  MarkExecutionSent: 'MARK_EXECUTION_SENT',
  MarkExecutionResponse: 'MARK_EXECUTION_RESPONSE',
  MarkExecutionVerified: 'MARK_EXECUTION_VERIFIED',
  CompleteExecution: 'COMPLETE_EXECUTION',
  ReleaseExecution: 'RELEASE_EXECUTION',
  MarkExecutionUnknown: 'MARK_EXECUTION_UNKNOWN',
  ExecutionLease: 'EXECUTION_LEASE',
  RecoverExecution: 'RECOVER_EXECUTION',
  ExecutionRecovered: 'EXECUTION_RECOVERED',
  ListTasks: 'LIST_TASKS',
  GetTask: 'GET_TASK',
  SaveTask: 'SAVE_TASK',
  ArchiveTask: 'ARCHIVE_TASK',
  ValidateTaskMetadata: 'VALIDATE_TASK_METADATA',
  TaskResult: 'TASK_RESULT',
  SaveAcceptance: 'SAVE_ACCEPTANCE',
  ListAcceptance: 'LIST_ACCEPTANCE',
  AcceptanceResult: 'ACCEPTANCE_RESULT',
  SaveEvidence: 'SAVE_EVIDENCE',
  ListEvidence: 'LIST_EVIDENCE',
  EvidenceResult: 'EVIDENCE_RESULT',
  RunReadonlyAcceptance: 'RUN_READONLY_ACCEPTANCE',
  CallEasy: 'CALL_EASY',
  CallEasyResult: 'CALL_EASY_RESULT',
  Workspace: 'WORKSPACE',
  WorkspaceResult: 'WORKSPACE_RESULT',
  WorkflowResult: 'WORKFLOW_RESULT',
  AgentChat: 'AGENT_CHAT',
  AgentChatResult: 'AGENT_CHAT_RESULT',
  Error: 'ERROR'
} as const

type Request<T extends string> = Message<undefined> & { type: T }
type Response<T extends string, P> = Message<P> & { type: T; payload: P }

export type ContentRequest =
  | Response<'PAUSE_DOWNLOAD', { taskId: string; backend?: 'browser' }>
  | Response<'DISCARD_DOWNLOAD', { taskId: string; backend?: 'browser' }>
  | Request<'SCAN_PAGE'> | Request<'GET_PAGE_INFO'> | Request<'SHOW_PANEL'> | Request<'PING'>
  | Request<'CHECK_SESSION'> | Request<'CANCEL_SESSION_CHECK'>
  | Request<'CANCEL_FILE_SEARCH'> | Request<'CANCEL_LIMIT_MONITOR'> | Response<'SEARCH_FILES', { query: FileSearchQuery; continuation?: { querySessionId: string }; timeoutMs?: number; batch?: true }>
  | Response<'SEARCH_LIMIT_MONITOR', { query: LimitMonitorQuery; timeoutMs?: number }>
  | Response<'SEARCH_FILING', { query: FilingSearchQuery; timeoutMs?: number; batch?: true }>
  | Response<'SEARCH_FEE', { query: FeeSearchQuery; timeoutMs?: number; batch?: true }>
  | Response<'SEARCH_FEE_AMOUNT', { query: FeeSearchQuery; timeoutMs?: number }>
  | Request<'LOAD_FEE_INIT'>
  | Response<'SEARCH_FEE_CUSTOMERS', { searchKey: string }>
  | Response<'LOAD_FEE_APPLICANTS', { customerIds: string }>
  | Response<'FEE_EXPORT_CONFIG', FeeExportConfigRequest>
  | Response<'EXPORT_FEE', FeeExportRequest>
  | Response<'SEARCH_PATENT', { query: PatentSearchQuery; timeoutMs?: number; batch?: true }>
  | Request<'LOAD_PATENT_INIT'>
  | Response<'LOAD_PATENT_CTRL_PROC', { countryIds: string; procType?: string }>
  | Request<'LOAD_NOTICE_INIT'>
  | Response<'SEARCH_NOTICE', NoticeSearchRequest>
  | Response<'NOTICE_ACTION', NoticeActionRequest>
  | Response<'EXPORT_NOTICE', NoticeExportRequest>
  | Response<'UPLOAD_NOTICE_EXCEL', NoticeExcelUploadRequest>
  | Response<'INSPECT_FEE_REDUCE_CASES', { caseVolumes: string[] }>
  | Request<'READ_FEE_REDUCE_REVIEWERS'>
  | Response<'SUBMIT_FEE_REDUCE_FILING', FeeReduceSubmitRequest>
  | Response<'SUBMIT_LIMIT_MAIL', { userId: string; items: Array<{ procId: string; procIds?: string[]; mailTypeId: string; mailStyle: '1' | '2'; mailId?: string; mode: 'ipr' | 'lead'; inventor?: boolean; customerName: string; contactName: string; iprName: string; leadName: string; contacts?: 'all'; ccName?: string; arbitrated?: true; namedBusiness?: true; hold?: 'skip'; senderId?: string; reviewerId?: string }> }>
  | Response<'SUBMIT_FILE_MANAGE', { userId: string; items: Array<{ fileId: string; fileIds: string[]; fileNames: string[]; mailTypeId: string; mailStyle: '1' | '2'; mailId?: string; recall?: boolean; subject: string; senderId: string; senderName: string; senderEmail: string; reviewerId: string; reviewerName: string; signature: string; addresses?: Pick<FileMailConfig, 'to' | 'cc'> }> }>
  | Response<'RESOLVE_DOWNLOAD_NAMES', { fileIds: string[]; selection: FileDownloadSelection }>
  | Response<'DOWNLOAD_FILES', { items: Array<{ fileId: string; fileNo: string; fileName: string }>; selection: FileDownloadSelection | null; stripAppNoDot: boolean; progressId?: string; detached?: true; archiveName?: string; stream?: true; taskId?: string; saveAsNew?: true; browserTarget?: string; deduplicate?: true; resolvedNames?: Record<string, string>; caseScopes?: Record<string, string> }>
  | Response<'EXPORT_CASE_CONTACTS', { volumes: string[] }>
  | Response<'LIST_MAIL_PROCESSES', { query: ProcessListQuery }>
  | Response<'OPEN_EASY_FORM', { target: ProcessOpenTarget }>
  | Request<'LIST_FLOW_REVIEWERS'>
  | Response<'READ_CASE_DEMANDS', { caseId: string }>
  | Response<'READ_CASE_BUS_FLOW', { caseId: string; procId: string; requireProc?: true }>
  | Response<'LOOKUP_IC_FLOW', { rows: IcFlowAsk[] }>
  | Response<'READ_HAGUE_CASE', { caseVolume: string; batchId?: string }>
  | Response<'CANCEL_HAGUE_READ', { batchId: string }>
  | Response<'READ_CASE_FIELDS', { caseVolume: string }>
  | Response<'READ_FILING_FLOW', { filingId: string }>
  | Response<'READ_USER_INFO', { userId: string }>
  | Response<'READ_CUSTOMER_DEMANDS', { customerId: string }>
  | Response<'READ_CUSTOMER_DIRECTORY', { customerId: string }>
  | Response<'READ_MAIL_CONTACTS', { mailId: string; customerId: string }>
  | Response<'READ_MAIL_ADDRESSES', { mailId: string }>
  | Response<'LIST_HISTORY_QUERIES', { force: boolean; surface?: 'file' | 'limit' | 'fee' | 'patent' }>
  | Response<'GET_HISTORY_QUERY', { queryId: string; surface?: 'file' | 'limit' | 'fee' | 'patent' }>
  | Response<'SAVE_HISTORY_QUERY', { title: string; queryId: string; queryXml: string; surface?: 'file' | 'limit' | 'fee' | 'patent' }>
  | Response<'DELETE_HISTORY_QUERY', { queryId: string; surface?: 'file' | 'limit' | 'fee' | 'patent' }>
  | Response<'SAVE_FILE_TEMP_NAME', { tempName: string; newFilename: string; fileNameType: string }>
  | Response<'DELETE_FILE_TEMP_NAME', { tempId: string }>
  | Response<'LOAD_DICTIONARY', DictionaryLoadRequest>
  | Request<'SCAN_FILE_SEARCH_FORM'>
  | Request<'SCAN_FILING_FORM'>
  | Request<'READ_QUERY_SURFACES'>
  | Response<'CREATE_EASY_MAIL', { preview: MailDraftPreview; selection: SelectionClaim; confirmed: true }>
  | Response<'SAVE_EASY_MAIL', { executionId: string; preview: MailDraftPreview; selection: SelectionClaim; acknowledgedDigest: string; confirmed: true }>
  | Response<'FIND_MAIL_EXECUTION', { fingerprint: string }>
  | Response<'INSPECT_EASY_MAIL', { executionId: string }>
  | Response<'READ_WORKFLOW', { mailId: string; flowType: string }>
  | Response<'REFRESH_WORKFLOW', { executionId: string }>
  | Response<'PREVIEW_WORKFLOW', { executionId: string; nodeId: string; reviewerId: string; auditType: 'submit' | 'handover'; remark: string; urgencyId: string }>
  | Response<'RESTORE_WORKFLOW', { mailId: string }>
  | Response<'DIAGNOSE_EXISTING_MAIL', { mailId: string; flowType: string }>
  | Response<'RUN_READONLY_ACCEPTANCE', { call: string; expected: Record<string, string>; caseTypeId?: string; mailId?: string; flowType?: string }>
  | Response<'CALL_EASY', { handler: string; call: string; fields?: Record<string, string> }>
export type ErrorMessage = Response<'ERROR', { message: string }>
export interface ExistingMailDiagnostic {
  mailId: string
  fileIds: string[]
  fileNames: string[]
  writesAttempted: false
  blockers: string[]
  workflow: WorkflowView
}
export interface ExecutionLeasePayload {
  ok: boolean
  reason: string
  lease: { executionId: string; taskFingerprint: string; owner: string; status: string; requestSent: boolean; easyMailId: string } | null
}
export type StreamDownloadCommand =
  | { action: 'start'; fileName: string; taskId?: string; manifest?: Record<string, unknown>; newCopy?: true; targetId?: string; expiresAt?: number }
  | { action: 'write'; token: string; sequence: number; offset?: number; data: string }
  | { action: 'finish' | 'abort' | 'pause' | 'status' | 'complete' | 'resume'; token: string }
  | { action: 'checkpoint'; token: string; offset: number; names: string[] }
  | { action: 'cache'; token: string; index: number; command: 'info' | 'read' | 'write' | 'reset' | 'complete'; offset?: number; data?: string; metadata?: Record<string, unknown> }

function isArchiveName(value: unknown): value is string {
  // eslint-disable-next-line no-control-regex -- 存量豁免：有意匹配控制字符（文件名与输入清洗）
  return typeof value === 'string' && value.length <= 120 && value.length > 4 && value.endsWith('.zip') && !/[\\/<>:"|?*\x00-\x1f]/.test(value)
}

export type BackgroundRequest =
  | Response<'PAUSE_DOWNLOAD', { taskId: string; backend?: 'browser' }>
  | Response<'DISCARD_DOWNLOAD', { taskId: string; backend?: 'browser' }>
  | Request<'PING'>
  | Response<'CLAIM_EXECUTION', { origin: string; operatorId: string; taskFingerprint: string }>
  | Response<'MARK_EXECUTION_PREPARED', LeaseCommand>
  | Response<'MARK_EXECUTION_SENT', LeaseCommand>
  | Response<'MARK_EXECUTION_RESPONSE', LeaseCommand>
  | Response<'MARK_EXECUTION_VERIFIED', LeaseCommand>
  | Response<'COMPLETE_EXECUTION', LeaseCommand>
  | Response<'RELEASE_EXECUTION', LeaseCommand>
  | Response<'MARK_EXECUTION_UNKNOWN', LeaseCommand>
  | Response<'RECOVER_EXECUTION', { origin: string; operatorId: string }>
  | Response<'LIST_TASKS', { origin: string; operatorId: string }>
  | Response<'GET_TASK', { origin: string; operatorId: string; taskId: string }>
  | Response<'SAVE_TASK', { task: Record<string, unknown> }>
  | Response<'ARCHIVE_TASK', { origin: string; operatorId: string; taskId: string }>
  | Response<'VALIDATE_TASK_METADATA', { origin: string; operatorId: string; taskId: string }>
  | Response<'SAVE_ACCEPTANCE', { record: Record<string, unknown> }>
  | Response<'LIST_ACCEPTANCE', { origin: string; operatorId: string }>
  | Response<'SAVE_EVIDENCE', { record: Record<string, unknown> }>
  | Response<'LIST_EVIDENCE', { origin: string; call: string }>
  | Response<'WORKSPACE', WorkspaceAction>
  | Response<'SAVE_DOWNLOAD', { url: string; fileName: string; progressId?: string }>
  | Response<'DOWNLOAD_STATE', { downloadId: number }>
  | Response<'STREAM_DOWNLOAD', StreamDownloadCommand>
  | Response<'BROWSER_STREAM_DOWNLOAD', StreamDownloadCommand>
  | Response<'AGENT_CHAT', { action: 'probe' | 'turn'; message: string } | { action: 'turn'; message: string; plain: true } | { action: 'turn'; message: string; skill: 'hague-filing-arbitration' } | { action: 'answer'; message: string } | { action: 'history' | 'reset' | 'facts' | 'compact' | 'stop' | 'create' } | { action: 'create'; title: string } | { action: 'open' | 'remove'; id: string } | { action: 'rename'; id: string; title: string }>
export type BackgroundResponse =
  | Response<'PAUSE_DOWNLOAD_RESULT', { ok: true }>
  | Response<'DISCARD_DOWNLOAD_RESULT', { ok: true }>
  | Response<'PONG', { ok: true }>
  | Response<'EXECUTION_LEASE', ExecutionLeasePayload>
  | Response<'EXECUTION_RECOVERED', { leases: ExecutionLeasePayload['lease'][] }>
  | Response<'TASK_RESULT', { ok: boolean; message: string; tasks: TaskSummary[]; task: Record<string, unknown> | null; currentEvidence?: Record<string, unknown> | null; stagePlans?: Record<string, unknown>[] }>
  | Response<'ACCEPTANCE_RESULT', { records: Record<string, unknown>[]; probe?: { httpStatus: number; sessionOk: boolean; fields: Record<string, string>; shape: string } }>
  | Response<'EVIDENCE_RESULT', { records: Record<string, unknown>[] }>
  | Response<'WORKSPACE_RESULT', WorkspaceResultPayload>
  | Response<'SAVE_DOWNLOAD_RESULT', { ok: true; fileName: string; downloadId?: number }>
  | Response<'DOWNLOAD_STATE_RESULT', { ok: true; state: 'inProgress' | 'complete' | 'interrupted'; receivedBytes: number; totalBytes: number | null; error?: string; fileName?: string }>
  | Response<'STREAM_DOWNLOAD_RESULT', { ok: true; token?: string; downloadId?: number; taskId?: string; info?: Record<string, unknown>; data?: string }>
  | Response<'AGENT_CHAT_RESULT', ApiResult<{ reply: string; model: string; steps: number; history: Array<{ role: 'user' | 'assistant'; content: string }>; sessions: Array<{ id: string; title: string; updatedAt: string; active: boolean }>; activeId: string }>>
  | ErrorMessage

export interface LeaseCommand {
  origin: string
  operatorId: string
  taskFingerprint: string
  executionId: string
  leaseVersion: number
}

export type DualSystemNodeReason =
  | 'ready'
  | 'no_tab'
  | 'not_logged_in'
  | 'session_expired'
  | 'multiple_accounts'
  | 'unreachable'

export interface DualSystemNodeStatus {
  mode: CustomerMode
  label: string
  ready: boolean
  tabId: number | null
  origin: string
  loginUrl: string
  operatorId: string
  displayName: string
  reason: DualSystemNodeReason
  message: string
}

export interface DualSystemStatusSnapshot {
  checkedAt: string
  large: DualSystemNodeStatus
  sme: DualSystemNodeStatus
  writeSwitchOpen: boolean
  allReady: boolean
}

export type WorkspaceAction =
  | { action: 'focus' } | { action: 'listTabs' } | { action: 'refreshSession' } | { action: 'openLogin' } | { action: 'load' } | { action: 'declineAccountSwitch' }
  | { action: 'checkDualSystems' }
  | { action: 'openDualLogin'; mode: CustomerMode }
  | { action: 'setCustomerMode'; mode: CustomerMode }
  | { action: 'bind'; tabId: number }
  | { action: 'saveCustomer'; profile: CustomerQueryProfile; expectedScope: ExpectedAccountScope; expectedRevision?: number }
  | { action: 'deleteCustomer'; id: string; expectedScope: ExpectedAccountScope; expectedRevision: number }
  | { action: 'saveQueryTemplate'; template: QueryTemplate; expectedScope: ExpectedAccountScope; expectedVersion: number | null }
  | { action: 'deleteQueryTemplate'; id: string; expectedScope: ExpectedAccountScope }
  | { action: 'saveRules'; bundle: MailRuleBundle; expectedScope: ExpectedAccountScope }
  | { action: 'createTaskPlan'; files: SelectedPatentFile[]; queryTemplateVersion: number; expectedScope: ExpectedAccountScope }
  | { action: 'recordFileManageRun'; expectedScope: ExpectedAccountScope; run: FileManageRunInput }
  | { action: 'forward'; message: ContentRequest; targetMode?: CustomerMode }
  | { action: 'runAcceptance'; call: string; caseTypeId?: string; mailId?: string; flowType?: string; expectedFields?: Record<string, string> }

export interface CreatedTaskResult {
  taskId: string
  taskFingerprint: string
  status: string
  createdAt: string
  itemCount: number
  persisted: true
  fileSource: 'FILE_SOURCE_UNVERIFIED' | 'SEARCH_RESPONSE_OBSERVED'
}

export interface WorkspaceResultPayload {
  ok: boolean
  message: string
  connection: EasyConnectionContext
  tabs: EasyTabCandidate[]
  customers: CustomerQueryProfile[]
  templates: QueryTemplate[]
  rules: MailRuleBundle | null
  tasks: TaskSummary[]
  fileManageRuns: FileManageRun[]
  forwarded: AppMessage | null
  appTab: { tabId: number; created: boolean } | null
  createdTask: CreatedTaskResult | null
  dualSystems?: DualSystemStatusSnapshot
  contextError?: 'STALE_CONTEXT'
  rulesSaved?: boolean
  tasksRevalidated?: boolean
  pendingRevalidation?: boolean
}

export interface FileManageRunInput {
  customerName: string
  subject: string
  fileCount: number
  status: 'submitted' | 'held' | 'skipped' | 'failed'
  note: string
}

export interface FileManageRun extends FileManageRunInput {
  id: string
  at: string
}

export interface TaskSummary {
  taskId: string
  createdAt: string
  customerName: string
  fileCount: number
  mailCount: number
  status: string
  verifiedAt: string
  updatedAt: string
}
export interface FileSearchFormField {
  id: string
  label: string
  section: 'case' | 'file'
  advanced: boolean
  control: 'text' | 'select' | 'check' | 'picker'
  visible: boolean
  hiddenBy: string[]
  options: { value: string; label: string; parent?: string }[]
}

/** 原网站用户菜单里认出来的查询入口。名称按菜单上的说法，不做本地化。 */
export interface QuerySurfaceEntry {
  id: string
  label: string
  url: string
}

export interface QuerySurfaceMenu {
  surfaces: QuerySurfaceEntry[]
}

export type ContentResponse =
  | Response<'PAUSE_DOWNLOAD_RESULT', { ok: true }>
  | Response<'DISCARD_DOWNLOAD_RESULT', { ok: true }>
  | Response<'SCAN_RESULT', PageSnapshot>
  | Response<'PAGE_INFO', PageInfo>
  | Response<'PANEL_SHOWN', { ok: true }>
  | Response<'SESSION_RESULT', ApiResult<SessionSummary>>
  | Response<'SESSION_CHECK_CANCELLED', { ok: true }>
  | Response<'SEARCH_FILES_RESULT', ApiResult<FileSearchResult>>
  | Response<'SEARCH_LIMIT_MONITOR_RESULT', ApiResult<LimitMonitorResult>>
  | Response<'SEARCH_FILING_RESULT', ApiResult<FilingSearchResult>>
  | Response<'SEARCH_FEE_RESULT', ApiResult<FeeSearchResult>>
  | Response<'SEARCH_FEE_AMOUNT_RESULT', ApiResult<Record<string, unknown>>>
  | Response<'LOAD_FEE_INIT_RESULT', ApiResult<FeeInitData>>
  | Response<'SEARCH_FEE_CUSTOMERS_RESULT', ApiResult<FeeCustomerItem[]>>
  | Response<'LOAD_FEE_APPLICANTS_RESULT', ApiResult<FeeApplicantItem[]>>
  | Response<'FEE_EXPORT_CONFIG_RESULT', ApiResult<FeeExportConfigResponse>>
  | Response<'EXPORT_FEE_RESULT', ApiResult<FeeExportResponse>>
  | Response<'SEARCH_PATENT_RESULT', ApiResult<PatentSearchResult>>
  | Response<'LOAD_PATENT_INIT_RESULT', ApiResult<PatentInitData>>
  | Response<'LOAD_PATENT_CTRL_PROC_RESULT', ApiResult<TreeOption[]>>
  | Response<'LOAD_NOTICE_INIT_RESULT', ApiResult<NoticeInitData>>
  | Response<'SEARCH_NOTICE_RESULT', ApiResult<NoticeSearchResult>>
  | Response<'NOTICE_ACTION_RESULT', ApiResult<NoticeActionResult>>
  | Response<'EXPORT_NOTICE_RESULT', ApiResult<NoticeExportResult>>
  | Response<'UPLOAD_NOTICE_EXCEL_RESULT', ApiResult<NoticeExcelUploadResult>>
  | Response<'INSPECT_FEE_REDUCE_CASES_RESULT', ApiResult<FeeReduceInspectResult>>
  | Response<'READ_FEE_REDUCE_REVIEWERS_RESULT', ApiResult<FeeReduceReviewersResult>>
  | Response<'SUBMIT_FEE_REDUCE_FILING_RESULT', ApiResult<FeeReduceSubmitResult>>
  | Response<'SUBMIT_LIMIT_MAIL_RESULT', { stopped: boolean; results: Array<{ procId: string; mailId: string; state: 'submitted' | 'created' | 'unknown' | 'failed'; message: string; to?: string; cc?: string }> }>
  | Response<'SUBMIT_FILE_MANAGE_RESULT', { stopped: boolean; results: Array<{ fileId: string; mailId: string; state: 'submitted' | 'created' | 'unknown' | 'failed'; message: string }> }>
  | Response<'RESOLVE_DOWNLOAD_NAMES_RESULT', ApiResult<{ names: string[] }>>
  | Response<'DOWNLOAD_FILES_RESULT', ApiResult<{ fileName: string; fileCount: number; notice: string }>>
  | Response<'DOWNLOAD_FILES_ACCEPTED', { progressId: string }>
  | Response<'EXPORT_CASE_CONTACTS_RESULT', ApiResult<CaseContactExport>>
  | Response<'LIST_MAIL_PROCESSES_RESULT', ApiResult<ProcessListResult>>
  | Response<'OPEN_EASY_FORM_RESULT', { ok: boolean; message: string }>
  | Response<'LIST_FLOW_REVIEWERS_RESULT', ApiResult<AccountReviewerList>>
  | Response<'CASE_DEMAND_RESULT', ApiResult<CaseDemandAsset>>
  | Response<'CASE_BUS_FLOW_RESULT', ApiResult<{ gate: 'open' | 'pending' | 'done' }>>
  | Response<'LOOKUP_IC_FLOW_RESULT', ApiResult<{ items: IcFlowHit[] }>>
  | Response<'CANCEL_HAGUE_READ_RESULT', { cancelled: boolean }>
  | Response<'READ_HAGUE_CASE_RESULT', { text: string }>
  | Response<'READ_CASE_FIELDS_RESULT', { text: string }>
  | Response<'READ_FILING_FLOW_RESULT', ApiResult<FilingFlowRow[]>>
  | Response<'READ_USER_INFO_RESULT', ApiResult<FilingUser>>
  | Response<'CUSTOMER_DEMAND_RESULT', ApiResult<CustomerDemandAsset>>
  | Response<'CUSTOMER_DIRECTORY_RESULT', ApiResult<CustomerDirectoryAsset>>
  | Response<'MAIL_CONTACT_RESULT', ApiResult<MailContactAsset>>
  | Response<'MAIL_ADDRESS_RESULT', ApiResult<{ to: string; cc: string; customerId: string; caseVolumes: string[] }>>
  | Response<'FILE_SEARCH_CANCELLED', { ok: true }>
  | Response<'HISTORY_QUERIES_RESULT', ApiResult<HistoryQueryOption[]>>
  | Response<'HISTORY_QUERY_RESULT', ApiResult<HistoryQueryDetail>>
  | Response<'HISTORY_QUERY_SAVED', ApiResult<{ saved: true }>>
  | Response<'HISTORY_QUERY_DELETED', ApiResult<{ deleted: true }>>
  | Response<'FILE_TEMP_NAMES_RESULT', ApiResult<FileTempNameList>>
  | Response<'DICTIONARY_RESULT', ApiResult<DictionarySnapshot>>
  | Response<'FILE_SEARCH_FORM_RESULT', { fields: FileSearchFormField[] }>
  | Response<'FILING_FORM_RESULT', { fields: FileSearchFormField[] }>
  | Response<'QUERY_SURFACES_RESULT', QuerySurfaceMenu>
  | Response<'MAIL_EXECUTION_RESULT', { view: MailExecutionView | null }>
  | Response<'WORKFLOW_RESULT', { view: WorkflowView | null }>
  | Response<'EXISTING_MAIL_DIAGNOSTIC', ExistingMailDiagnostic>
  | Response<'CALL_EASY_RESULT', { text: string }>
  | BackgroundResponse
export type AppMessage = ContentRequest | ContentResponse | BackgroundRequest

/** 先校验未知值，再缩窄类型，避免把畸形负载当成合法扫描结果。 */
function isFileSearchFormField(value: unknown): value is FileSearchFormField {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' && value.id.length <= 80 &&
    typeof value.label === 'string' && value.label.length <= 80 &&
    (value.section === 'case' || value.section === 'file') &&
    typeof value.advanced === 'boolean' &&
    (value.control === 'text' || value.control === 'select' || value.control === 'check' || value.control === 'picker') &&
    typeof value.visible === 'boolean' &&
    Array.isArray(value.hiddenBy) && value.hiddenBy.length <= 8 && value.hiddenBy.every(item => typeof item === 'string' && item.length <= 160) &&
    Array.isArray(value.options) && value.options.length <= 800 && value.options.every(option => isRecord(option) &&
      typeof option.value === 'string' && option.value.length <= 80 && typeof option.label === 'string' && option.label.length <= 160 &&
      (option.parent === undefined || (typeof option.parent === 'string' && option.parent.length <= 80)))
}

function isCaseDemandAsset(value: unknown): value is CaseDemandAsset {
  if (!isRecord(value) || !isQueryGuid(String(value.caseId)) || typeof value.text !== 'string' || value.text.length > 400_000) return false
  if (typeof value.complete !== 'boolean' || typeof value.message !== 'string' || value.message.length > 400) return false
  if (!Array.isArray(value.rows) || value.rows.length > 500) return false
  return value.rows.every(row => isRecord(row) &&
    typeof row.demandId === 'string' && row.demandId.length <= 80 &&
    typeof row.demandType === 'string' && row.demandType.length <= 20_000 &&
    typeof row.title === 'string' && row.title.length <= 20_000 &&
    typeof row.description === 'string' && row.description.length <= 20_000)
}

function isDownloadNameRequest(value: unknown): value is { fileIds: string[]; selection: FileDownloadSelection } {
  if (!isRecord(value) || Object.keys(value).length !== 2) return false
  const ids = value.fileIds
  return Array.isArray(ids) && ids.length > 0 && ids.length <= DOWNLOAD_MAX_ITEMS && ids.every(id => typeof id === 'string' && isQueryGuid(id)) &&
    isFileDownloadSelection(value.selection)
}

function isDownloadNameResult(value: unknown): value is ApiResult<{ names: string[] }> {
  if (!isRecord(value)) return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
  if (value.ok !== true || !isRecord(value.data) || Object.keys(value.data).length !== 1 || !Array.isArray(value.data.names)) return false
  const names = value.data.names
  return names.length <= DOWNLOAD_MAX_ITEMS && names.every(name => typeof name === 'string' && name.trim().length > 0 && name.length <= 180 && !name.includes(';'))
}

/** 原名是类型识别元数据；有命名配方时，真正提交的名称另由生成名称护栏校验。 */
export function downloadFilesRequestIssue(value: unknown): string {
  if (!isRecord(value)) return '下载参数不是有效对象。'
  if (Object.keys(value).some(key => !['items', 'selection', 'stripAppNoDot', 'progressId', 'detached', 'archiveName', 'stream', 'taskId', 'saveAsNew', 'browserTarget', 'deduplicate', 'resolvedNames', 'caseScopes'].includes(key))) return '下载参数包含不支持的字段。'
  if (value.deduplicate !== undefined && value.deduplicate !== true) return '去重设置无效。'
  if (typeof value.stripAppNoDot !== 'boolean') return '下载名称中的申请号小数点设置无效。'
  if (value.taskId !== undefined && (typeof value.taskId !== 'string' || !isQueryGuid(value.taskId))) return '下载任务编号无效。'
  if (value.browserTarget !== undefined && (typeof value.browserTarget !== 'string' || !isQueryGuid(value.browserTarget) || !value.taskId || value.stream !== true)) return '浏览器下载目标无效或缺少流式任务编号。'
  if (value.saveAsNew !== undefined && (value.saveAsNew !== true || !value.taskId)) return '另存下载缺少有效任务编号。'
  if (value.archiveName !== undefined && !isArchiveName(value.archiveName)) return '压缩包名称无效，请使用不含路径且不超过120字的ZIP名称。'
  if (value.stream !== undefined && value.stream !== true) return '流式下载设置无效。'
  if (value.detached !== undefined && (value.detached !== true || !value.progressId)) return '后台下载缺少有效进度编号。'
  if (value.progressId !== undefined && (typeof value.progressId !== 'string' || !isQueryGuid(value.progressId))) return '下载进度编号无效。'
  if (value.selection !== null && !isFileDownloadSelection(value.selection)) return '下载名称配方无效，请重新设置下载名称。'
  const items = value.items
  if (!Array.isArray(items) || !items.length || items.length > DOWNLOAD_MAX_ITEMS) return `请选择1至${DOWNLOAD_MAX_ITEMS}个附件下载。`
  for (const [index, item] of items.entries()) {
    const prefix = `第${index + 1}个附件`
    if (!isRecord(item) || Object.keys(item).length !== 3) return `${prefix}的下载数据不完整。`
    if (typeof item.fileId !== 'string' || !isQueryGuid(item.fileId)) return `${prefix}的文件标识无效，请重新查询文件。`
    if (typeof item.fileNo !== 'string' || !item.fileNo.trim() || item.fileNo.length > 40 || item.fileNo.includes(';')) return `${prefix}的文件编号无效，请重新查询文件。`
    if (typeof item.fileName !== 'string' || !item.fileName.trim() || item.fileName.length > 4096) return `${prefix}的原文件名为空或超过4096字。`
    if (value.selection === null && (item.fileName.length > 180 || item.fileName.includes(';'))) return `${prefix}的原文件名超过180字或包含分号，请设置下载名称后再下载。`
  }
  const files = items as Array<Record<string, unknown>>
  const ids = new Set(files.map(item => String(item.fileId)))
  for (const field of ['resolvedNames', 'caseScopes'] as const) {
    const map = value[field]
    if (map !== undefined && (!isRecord(map) || Object.keys(map).length > items.length || Object.entries(map).some(([id, name]) => !ids.has(id) || typeof name !== 'string' || !name.trim() || name.length > (field === 'resolvedNames' ? 180 : 1024) || (field === 'resolvedNames' && name.includes(';'))))) return field === 'resolvedNames' ? '已生成的下载名称无效。' : '案件分组信息无效。'
  }
  if (value.deduplicate && (!isRecord(value.caseScopes) || files.some(item => !Object.hasOwn(value.caseScopes as object, String(item.fileId))))) return '去重缺少案件分组信息。'
  return ''
}

function isDownloadFilesRequest(value: unknown): value is Extract<ContentRequest, { type: 'DOWNLOAD_FILES' }>['payload'] {
  return downloadFilesRequestIssue(value) === ''
}

function isDownloadFilesResult(value: unknown): value is ApiResult<{ fileName: string; fileCount: number; notice: string }> {
  if (!isRecord(value)) return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
  return value.ok === true && isRecord(value.data) && Object.keys(value.data).length === 3 &&
    typeof value.data.fileName === 'string' && value.data.fileName.endsWith('.zip') && value.data.fileName.length <= 120 &&
    typeof value.data.fileCount === 'number' && Number.isInteger(value.data.fileCount) && value.data.fileCount > 0 && value.data.fileCount <= DOWNLOAD_MAX_ITEMS &&
    typeof value.data.notice === 'string' && value.data.notice.length <= 200
}

function isCaseBusFlowResult(value: unknown): value is ApiResult<{ gate: 'open' | 'pending' | 'done' }> {
  if (!isRecord(value)) return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
  return value.ok === true && isRecord(value.data) && (value.data.gate === 'open' || value.data.gate === 'pending' || value.data.gate === 'done') && Object.keys(value.data).length === 1
}

function isIcFlowAsk(value: unknown): value is IcFlowAsk {
  if (!isRecord(value)) return false
  if (!isShortText(value.caseVolume, 80) || !value.caseVolume.trim()) return false
  if (!isShortText(value.procLabel, 80) || !value.procLabel.trim()) return false
  if (value.customerVolume !== undefined && (!isShortText(value.customerVolume, 80) || !value.customerVolume.trim())) return false
  if (value.withRecord !== undefined && value.withRecord !== true) return false
  return Object.keys(value).every(key => key === 'caseVolume' || key === 'procLabel' || key === 'customerVolume' || key === 'withRecord')
}

function isLibraryVolume(value: unknown): value is string {
  return isShortText(value, 80) && value.trim().length > 0
}

function isIcFlowResult(value: unknown): value is ApiResult<{ items: IcFlowHit[] }> {
  if (!isRecord(value)) return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
  if (value.ok !== true || !isRecord(value.data) || !Array.isArray(value.data.items) || value.data.items.length > DOWNLOAD_MAX_ITEMS || Object.keys(value.data).length !== 1) return false
  return value.data.items.every(item => {
    if (!isRecord(item) || !isShortText(item.caseVolume, 80) || !isShortText(item.procLabel, 80) || typeof item.found !== 'boolean') return false
    if (item.gate !== '' && item.gate !== 'open' && item.gate !== 'pending' && item.gate !== 'done') return false
    if (item.uncontrolled !== undefined && item.uncontrolled !== true) return false
    if (item.unread !== undefined && item.unread !== true) return false
    if (item.statusUnread !== undefined && item.statusUnread !== true) return false
    if (item.skipSend !== undefined && item.skipSend !== true) return false
    if (item.correctedOur !== undefined && !isLibraryVolume(item.correctedOur)) return false
    if (item.correctedCustomer !== undefined && !isLibraryVolume(item.correctedCustomer)) return false
    if (item.customerInfo !== undefined && (!isShortText(item.customerInfo, 4000) || !item.customerInfo.trim())) return false
    if (item.recordInfo !== undefined && (!isShortText(item.recordInfo, 4000) || !item.recordInfo.trim())) return false
    const allowed = ['caseVolume', 'procLabel', 'found', 'gate', 'uncontrolled', 'unread', 'statusUnread', 'skipSend', 'correctedOur', 'correctedCustomer', 'customerInfo', 'recordInfo']
    if (!Object.keys(item).every(key => allowed.includes(key))) return false
    if (item.unread === true) {
      return item.found === false && item.gate === '' && item.statusUnread === undefined && item.uncontrolled === undefined && item.skipSend === undefined && item.correctedOur === undefined && item.correctedCustomer === undefined && item.customerInfo === undefined && item.recordInfo === undefined
    }
    if (item.statusUnread === true) return item.found === true && item.unread === undefined && item.uncontrolled === undefined && item.skipSend === undefined && item.gate === ''
    if (item.uncontrolled === true) return item.found === true && item.gate === 'done' && item.unread === undefined && item.statusUnread === undefined && item.skipSend === undefined
    if (item.skipSend === true) return item.found === true && item.gate === 'open' && item.unread === undefined && item.statusUnread === undefined && item.uncontrolled === undefined
    return item.unread === undefined && item.statusUnread === undefined && item.uncontrolled === undefined && item.skipSend === undefined
  })
}

function isCaseDemandResult(value: unknown): value is ApiResult<CaseDemandAsset> {
  if (!isRecord(value)) return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
  return value.ok === true && isCaseDemandAsset(value.data)
}

function isCustomerDemandAsset(value: unknown): value is CustomerDemandAsset {
  if (!isRecord(value) || !isQueryGuid(String(value.customerId)) || typeof value.text !== 'string' || value.text.length > 400_000) return false
  if (typeof value.complete !== 'boolean' || typeof value.message !== 'string' || value.message.length > 400) return false
  if (!Array.isArray(value.rows) || value.rows.length > 500) return false
  return value.rows.every(row => isRecord(row) &&
    typeof row.demandId === 'string' && row.demandId.length <= 80 &&
    typeof row.caseType === 'string' && row.caseType.length <= 20_000 &&
    typeof row.demandType === 'string' && row.demandType.length <= 20_000 &&
    typeof row.title === 'string' && row.title.length <= 20_000 &&
    typeof row.description === 'string' && row.description.length <= 20_000 &&
    typeof row.fileName === 'string' && row.fileName.length <= 20_000 &&
    typeof row.disabled === 'boolean')
}

function isCustomerDirectoryAsset(value: unknown): value is CustomerDirectoryAsset {
  if (!isRecord(value) || !isQueryGuid(String(value.customerId))) return false
  if (typeof value.complete !== 'boolean' || typeof value.message !== 'string' || value.message.length > 400) return false
  if (!Array.isArray(value.rows) || value.rows.length > 500) return false
  return value.rows.every(row => isRecord(row) &&
    typeof row.contactId === 'string' && row.contactId.length <= 80 &&
    typeof row.name === 'string' && row.name.length <= 2_000 &&
    typeof row.email === 'string' && row.email.length <= 2_000 &&
    typeof row.contactType === 'string' && row.contactType.length <= 2_000)
}

function isCustomerPageResult<T>(value: unknown, asset: (data: unknown) => data is T): value is ApiResult<T> {
  if (!isRecord(value)) return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
  return value.ok === true && asset(value.data)
}

function isOptionalGuid(value: unknown): boolean {
  return typeof value === 'string' && (value === '' || isQueryGuid(value))
}

function isMailContactAsset(value: unknown): value is MailContactAsset {
  if (!isRecord(value) || !isOptionalGuid(value.mailId) || !isOptionalGuid(value.customerId)) return false
  if (typeof value.text !== 'string' || value.text.length > 400_000 || typeof value.complete !== 'boolean') return false
  if (typeof value.message !== 'string' || value.message.length > 400) return false
  if (!Array.isArray(value.rows) || value.rows.length > 500) return false
  const groups = ['recent', 'customer', 'case', 'sales', 'pics', 'agent']
  const rowOk = value.rows.every(row => isRecord(row) && groups.includes(String(row.group)) &&
    typeof row.name === 'string' && row.name.length <= 2_000 &&
    typeof row.email === 'string' && row.email.length <= 2_000 &&
    typeof row.role === 'string' && row.role.length <= 2_000)
  if (!rowOk) return false
  const introducer = value.introducer
  if (introducer === null) return true
  if (!isRecord(introducer)) return false
  return ['name', 'email', 'insideName', 'insideEmail'].every(key => typeof introducer[key] === 'string' && String(introducer[key]).length <= 2_000)
}

function isMailContactResult(value: unknown): value is ApiResult<MailContactAsset> {
  if (!isRecord(value)) return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
  return value.ok === true && isMailContactAsset(value.data)
}

function isMailAddressResult(value: unknown): value is ApiResult<{ to: string; cc: string; customerId: string; caseVolumes: string[] }> {
  if (!isRecord(value)) return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
  if (value.ok !== true || !isRecord(value.data)) return false
  const volumes = value.data.caseVolumes
  return typeof value.data.to === 'string' && value.data.to.length <= 20_000 &&
    typeof value.data.cc === 'string' && value.data.cc.length <= 20_000 &&
    isOptionalGuid(value.data.customerId) &&
    Array.isArray(volumes) && volumes.length <= 100 && volumes.every(item => typeof item === 'string' && item.length <= 80)
}

function isAccountReviewerResult(value: unknown): value is ApiResult<AccountReviewerList> {
  if (!isRecord(value)) return false
  if (value.ok === false) {
    return isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
  }
  if (value.ok !== true || !isRecord(value.data) || typeof value.data.message !== 'string' || !Array.isArray(value.data.reviewers)) return false
  return value.data.reviewers.every(item => isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string')
}

function isLimitMailSubmitItem(value: unknown): boolean {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  const allowed = ['procId', 'procIds', 'caseIdsByProc', 'mailTypeId', 'mailStyle', 'mailId', 'mode', 'inventor', 'customerName', 'contactName', 'iprName', 'leadName', 'contacts', 'ccName', 'arbitrated', 'namedBusiness', 'hold', 'senderId', 'reviewerId']
  if (!keys.every(key => allowed.includes(key))) return false
  if (!keys.includes('mode') || !keys.includes('customerName') || !keys.includes('contactName') || !keys.includes('iprName') || !keys.includes('leadName')) return false
  if (value.mode !== 'ipr' && value.mode !== 'lead') return false
  if (value.inventor !== undefined && value.inventor !== true && value.inventor !== false) return false
  if (value.contacts !== undefined && value.contacts !== 'all') return false
  if (value.namedBusiness !== undefined && (value.namedBusiness !== true || value.arbitrated !== true || value.contacts === 'all')) return false
  if (value.arbitrated !== undefined && value.arbitrated !== true) return false
  if (value.hold !== undefined && value.hold !== 'skip') return false
  if (!isShortText(value.customerName, 120) || !isShortText(value.contactName, 80) || !isShortText(value.iprName, 200) || !isShortText(value.leadName, 80)) return false
  if (value.ccName !== undefined && !isShortText(value.ccName, 200)) return false
  if (value.contacts !== 'all' && !value.iprName.trim()) return false
  if (value.contacts !== 'all' && !value.namedBusiness && value.mode === 'lead' && !value.leadName.trim()) return false
  if (!isQueryGuid(String(value.procId)) || !isQueryGuid(String(value.mailTypeId)) || (value.mailStyle !== '1' && value.mailStyle !== '2')) return false
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 存量豁免：外部数据宽松 String() 兜底，保留既有校验行为
  if (value.mailId !== undefined && !isQueryGuid(String(value.mailId))) return false
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 存量豁免：外部数据宽松 String() 兜底，保留既有校验行为
  if (value.senderId !== undefined && !isQueryGuid(String(value.senderId))) return false
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 存量豁免：外部数据宽松 String() 兜底，保留既有校验行为
  if (value.reviewerId !== undefined && !isQueryGuid(String(value.reviewerId))) return false
  if (value.caseIdsByProc !== undefined) {
    if (!isRecord(value.caseIdsByProc)) return false
    const procedures = Array.isArray(value.procIds) ? value.procIds : [value.procId]
    const entries = Object.entries(value.caseIdsByProc)
    if (entries.length > 500 || !entries.every(([procId, caseId]) => isQueryGuid(procId) &&
      typeof caseId === 'string' && isQueryGuid(caseId) &&
      procedures.some(id => typeof id === 'string' && id.toLowerCase() === procId))) return false
  }
  if (value.procIds === undefined) return true
  return Array.isArray(value.procIds) && value.procIds.length > 0 && value.procIds.length <= 500 &&
    value.procIds.every(id => isQueryGuid(String(id))) &&
    value.procIds.some(id => String(id).toLowerCase() === String(value.procId).toLowerCase())
}

function isFileManageSubmitItem(value: unknown): boolean {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  const allowed = ['fileId', 'fileIds', 'fileNames', 'mailTypeId', 'mailStyle', 'mailId', 'recall', 'subject', 'senderId', 'senderName', 'senderEmail', 'reviewerId', 'reviewerName', 'signature', 'addresses']
  if (!keys.every(key => allowed.includes(key))) return false
  if (!isQueryGuid(String(value.fileId)) || !isQueryGuid(String(value.mailTypeId)) || !isQueryGuid(String(value.senderId)) || !isQueryGuid(String(value.reviewerId))) return false
  if (value.mailStyle !== '1' && value.mailStyle !== '2') return false
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 存量豁免：外部数据宽松 String() 兜底，保留既有校验行为
  if (value.mailId !== undefined && !isQueryGuid(String(value.mailId))) return false
  if (value.recall !== undefined && value.recall !== true) return false
  if (value.recall === true && !isQueryGuid(String(value.mailId))) return false
  if (!isShortText(value.subject, 500) || !value.subject.trim()) return false
  if (!isShortText(value.senderName, 80) || !value.senderName.trim()) return false
  if (!isShortText(value.senderEmail, 120) || !value.senderEmail.includes('@') || /[();；]/.test(value.senderEmail)) return false
  if (!isShortText(value.reviewerName, 80) || !value.reviewerName.trim()) return false
  if (value.addresses !== undefined && (!isRecord(value.addresses) || !Object.keys(value.addresses).every(k => k === 'to' || k === 'cc') || !isFileMailConfig(value.addresses))) return false
  if (!isShortText(value.signature, 4000) || !value.signature.trim()) return false
  if (!Array.isArray(value.fileIds) || !Array.isArray(value.fileNames)) return false
  if (value.fileIds.length === 0 || value.fileIds.length > 100 || value.fileIds.length !== value.fileNames.length) return false
  if (!value.fileIds.every(id => isQueryGuid(String(id)))) return false
  if (!value.fileIds.some(id => String(id).toLowerCase() === String(value.fileId).toLowerCase())) return false
  return value.fileNames.every(name => isShortText(name, 180) && name.trim() && !name.includes(';'))
}

function isFileManageSubmitRequest(value: unknown): boolean {
  if (!isRecord(value) || !isQueryGuid(String(value.userId)) || !Array.isArray(value.items)) return false
  return value.items.length > 0 && value.items.length <= 20 && value.items.every(isFileManageSubmitItem) && Object.keys(value).length === 2
}

function isFileManageSubmitResponse(value: unknown): boolean {
  if (!isRecord(value) || typeof value.stopped !== 'boolean' || !Array.isArray(value.results) || Object.keys(value).length !== 2) return false
  return value.results.every(item => isRecord(item) &&
    typeof item.fileId === 'string' && typeof item.mailId === 'string' && typeof item.message === 'string' && item.message.length <= 8000 &&
    (item.state === 'submitted' || item.state === 'created' || item.state === 'unknown' || item.state === 'failed') &&
    Object.keys(item).length === 4)
}

function isLimitMailSubmitRequest(value: unknown): boolean {
  if (!isRecord(value) || !isQueryGuid(String(value.userId)) || !Array.isArray(value.items)) return false
  return value.items.length > 0 && value.items.every(isLimitMailSubmitItem) && Object.keys(value).length === 2
}

function isLimitMailSubmitResponse(value: unknown): boolean {
  if (!isRecord(value) || typeof value.stopped !== 'boolean' || !Array.isArray(value.results) || Object.keys(value).length !== 2) return false
  return value.results.every(item => isRecord(item) &&
    typeof item.procId === 'string' && typeof item.mailId === 'string' && typeof item.message === 'string' && item.message.length <= 8000 &&
    (item.state === 'submitted' || item.state === 'created' || item.state === 'unknown' || item.state === 'failed') &&
    // to/cc 是实际写进 EASY 的地址载荷，成对出现，提交总结弹窗要展示。
    (!('to' in item) || (typeof item.to === 'string' && item.to.length <= 4000)) &&
    (!('cc' in item) || (typeof item.cc === 'string' && item.cc.length <= 4000)) &&
    ('to' in item) === ('cc' in item))
}

function isQuerySurfaceEntry(value: unknown): value is QuerySurfaceEntry {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 20 &&
    typeof value.label === 'string' && value.label.length <= 40 &&
    typeof value.url === 'string' && value.url.length > 0 && value.url.length <= 200
}

export function isMessage(value: unknown): value is AppMessage {
  if (!isRecord(value)) return false
  switch (value.type) {
    case MessageType.ScanPage:
    case MessageType.GetPageInfo:
    case MessageType.ShowPanel:
    case MessageType.Ping:
    case MessageType.CheckSession:
    case MessageType.CancelSessionCheck:
    case MessageType.CancelFileSearch:
    case MessageType.CancelLimitMonitor:
    case MessageType.ReadQuerySurfaces:
      return value.payload === undefined
    case MessageType.ListHistoryQueries:
      return isRecord(value.payload) && (value.payload.force === true || value.payload.force === false) &&
        (value.payload.surface === undefined || value.payload.surface === 'file' || value.payload.surface === 'limit' || value.payload.surface === 'fee' || value.payload.surface === 'patent') &&
        Object.keys(value.payload).every(key => key === 'force' || key === 'surface')
    case MessageType.GetHistoryQuery:
      return isRecord(value.payload) && typeof value.payload.queryId === 'string' &&
        (value.payload.surface === undefined || value.payload.surface === 'file' || value.payload.surface === 'limit' || value.payload.surface === 'fee' || value.payload.surface === 'patent') &&
        Object.keys(value.payload).every(key => key === 'queryId' || key === 'surface')
    case MessageType.SaveHistoryQuery:
      return isRecord(value.payload) && typeof value.payload.title === 'string' && value.payload.title.trim().length > 0 &&
        value.payload.title.length <= 80 && typeof value.payload.queryId === 'string' &&
        (value.payload.queryId === '' || isQueryGuid(value.payload.queryId)) &&
        typeof value.payload.queryXml === 'string' && value.payload.queryXml.length <= 200_000 &&
        value.payload.queryXml.startsWith('<xmlRoot>') && value.payload.queryXml.endsWith('</xmlRoot>') &&
        !/<!DOCTYPE|<!ENTITY/i.test(value.payload.queryXml) &&
        (value.payload.surface === undefined || value.payload.surface === 'file' || value.payload.surface === 'limit' || value.payload.surface === 'fee' || value.payload.surface === 'patent') &&
        Object.keys(value.payload).every(key => key === 'title' || key === 'queryId' || key === 'queryXml' || key === 'surface')
    case MessageType.DeleteHistoryQuery:
      return isRecord(value.payload) && typeof value.payload.queryId === 'string' && isQueryGuid(value.payload.queryId) &&
        (value.payload.surface === undefined || value.payload.surface === 'file' || value.payload.surface === 'limit' || value.payload.surface === 'fee' || value.payload.surface === 'patent') &&
        Object.keys(value.payload).every(key => key === 'queryId' || key === 'surface')
    case MessageType.SaveFileTempName: {
      if (!isRecord(value.payload) || Object.keys(value.payload).length !== 3) return false
      const names = typeof value.payload.newFilename === 'string' ? value.payload.newFilename.split(';') : []
      const types = typeof value.payload.fileNameType === 'string' ? value.payload.fileNameType.split(';') : []
      return typeof value.payload.tempName === 'string' && value.payload.tempName.trim().length > 0 && value.payload.tempName.length <= 80 &&
        typeof value.payload.newFilename === 'string' && value.payload.newFilename.length <= 2000 &&
        typeof value.payload.fileNameType === 'string' && value.payload.fileNameType.length <= 500 &&
        names.length > 0 && names.length <= 31 && names.length === types.length &&
        names.every(name => name.length > 0 && name.length <= 80) &&
        types.every(kind => kind === 'colname' || kind === 'txt')
    }
    case MessageType.DeleteFileTempName:
      return isRecord(value.payload) && typeof value.payload.tempId === 'string' && isQueryGuid(value.payload.tempId) &&
        Object.keys(value.payload).length === 1
    case MessageType.LoadDictionary:
      return isDictionaryRequest(value.payload)
    case MessageType.ScanFileSearchForm:
    case MessageType.ScanFilingForm:
    case MessageType.ListFlowReviewers:
      return value.payload === undefined
    case MessageType.ReadCaseDemands:
      return isRecord(value.payload) && isQueryGuid(String(value.payload.caseId)) && Object.keys(value.payload).length === 1
    case MessageType.ReadCaseBusFlow:
      return isRecord(value.payload) && isQueryGuid(String(value.payload.caseId)) && isQueryGuid(String(value.payload.procId)) &&
        (value.payload.requireProc === undefined || value.payload.requireProc === true) &&
        Object.keys(value.payload).every(key => ['caseId', 'procId', 'requireProc'].includes(key))
    case MessageType.LookupIcFlow:
      return isRecord(value.payload) && Array.isArray(value.payload.rows) && value.payload.rows.length > 0 && value.payload.rows.length <= 100 &&
        value.payload.rows.every(isIcFlowAsk) && Object.keys(value.payload).length === 1
    case MessageType.CancelHagueRead:
      return isRecord(value.payload) && typeof value.payload.batchId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value.payload.batchId) && Object.keys(value.payload).length === 1
    case MessageType.ReadHagueCase:
      return isRecord(value.payload) && typeof value.payload.caseVolume === 'string' && value.payload.caseVolume.trim().length > 0 && value.payload.caseVolume.length <= 80 && (value.payload.batchId === undefined || (typeof value.payload.batchId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value.payload.batchId))) && Object.keys(value.payload).every(k => k === 'caseVolume' || k === 'batchId')
    case MessageType.ReadCaseFields:
      return isRecord(value.payload) && typeof value.payload.caseVolume === 'string' && value.payload.caseVolume.trim().length > 0 &&
        value.payload.caseVolume.length <= 80 && Object.keys(value.payload).length === 1
    case MessageType.ReadFilingFlow:
      return isRecord(value.payload) && typeof value.payload.filingId === 'string' && /^[0-9A-Za-z-]{1,100}$/.test(value.payload.filingId) &&
        Object.keys(value.payload).length === 1
    case MessageType.ReadUserInfo:
      return isRecord(value.payload) && isQueryGuid(String(value.payload.userId)) && Object.keys(value.payload).length === 1
    case MessageType.ReadCustomerDemands:
    case MessageType.ReadCustomerDirectory:
      return isRecord(value.payload) && isQueryGuid(String(value.payload.customerId)) && Object.keys(value.payload).length === 1
    case MessageType.ReadMailContacts:
      return isRecord(value.payload) && isOptionalGuid(value.payload.mailId) && isOptionalGuid(value.payload.customerId) && Object.keys(value.payload).length === 2
    case MessageType.ReadMailAddresses:
      return isRecord(value.payload) && isQueryGuid(String(value.payload.mailId)) && Object.keys(value.payload).length === 1
    case MessageType.CreateEasyMail:
      return isConfirmedPreview(value.payload) && Object.keys(value.payload).length === 3
    case MessageType.SaveEasyMail:
      return isRecord(value.payload) && value.payload.confirmed === true && typeof value.payload.executionId === 'string' &&
        isSelectionClaim(value.payload.selection) && typeof value.payload.acknowledgedDigest === 'string' &&
        value.payload.acknowledgedDigest.length <= 20000 && isMailDraftPreview(value.payload.preview) &&
        Object.keys(value.payload).length === 5
    case MessageType.ReadWorkflow:
      return isRecord(value.payload) && isFlowId(value.payload.mailId) && isFlowType(value.payload.flowType) &&
        Object.keys(value.payload).length === 2
    case MessageType.RefreshWorkflow:
      return isRecord(value.payload) && typeof value.payload.executionId === 'string' && value.payload.executionId.length <= 80 &&
        Object.keys(value.payload).length === 1
    case MessageType.RestoreWorkflow:
      return isRecord(value.payload) && isFlowId(value.payload.mailId) && Object.keys(value.payload).length === 1
    case MessageType.DiagnoseExistingMail:
      return isRecord(value.payload) && isFlowId(value.payload.mailId) && isFlowType(value.payload.flowType) &&
        Object.keys(value.payload).length === 2
    case MessageType.RunReadonlyAcceptance:
      return isReadonlyProbe(value.payload)
    case MessageType.CallEasy:
      return isCallEasy(value.payload)
    case MessageType.CallEasyResult:
      return isRecord(value.payload) && typeof value.payload.text === 'string' && value.payload.text.length <= 8_000 && Object.keys(value.payload).length === 1
    case MessageType.ClaimExecution:
      return isClaim(value.payload)
    case MessageType.MarkExecutionPrepared:
    case MessageType.MarkExecutionSent:
    case MessageType.MarkExecutionResponse:
    case MessageType.MarkExecutionVerified:
    case MessageType.CompleteExecution:
    case MessageType.ReleaseExecution:
    case MessageType.MarkExecutionUnknown:
      return isLeaseCommand(value.payload)
    case MessageType.RecoverExecution:
    case MessageType.ListTasks:
    case MessageType.ListAcceptance:
      return isOperatorScope(value.payload)
    case MessageType.GetTask:
    case MessageType.ArchiveTask:
    case MessageType.ValidateTaskMetadata:
      return isTaskAddress(value.payload)
    case MessageType.SaveTask:
      return isRecord(value.payload) && isStoredTask(value.payload.task) && Object.keys(value.payload).length === 1
    case MessageType.SaveAcceptance:
    case MessageType.SaveEvidence:
      return isRecord(value.payload) && isPlainRecord(value.payload.record) && Object.keys(value.payload).length === 1
    case MessageType.ListEvidence:
      return isRecord(value.payload) && typeof value.payload.origin === 'string' && typeof value.payload.call === 'string' &&
        value.payload.origin.length <= 200 && value.payload.call.length <= 80 && Object.keys(value.payload).length === 2
    case MessageType.Workspace:
      return isWorkspaceAction(value.payload)
    case MessageType.WorkspaceResult:
      return isWorkspaceResult(value.payload)
    case MessageType.PreviewWorkflow:
      return isWorkflowPreview(value.payload)
    case MessageType.FindMailExecution:
      return isRecord(value.payload) && typeof value.payload.fingerprint === 'string' && value.payload.fingerprint.length <= 20000 &&
        Object.keys(value.payload).length === 1
    case MessageType.InspectEasyMail:
      return isRecord(value.payload) && typeof value.payload.executionId === 'string' && Object.keys(value.payload).length === 1
    case MessageType.SearchFiles: {
      if (!isRecord(value.payload) || !isFileSearchQuery(value.payload.query) || !isSearchContinuation(value.payload.continuation)) return false
      const keys = Object.keys(value.payload)
      if (!keys.includes('query')) return false
      const extra = keys.filter(key => key !== 'query')
      return extra.every(key => key === 'continuation' || key === 'timeoutMs' || key === 'batch') &&
        (value.payload.timeoutMs === undefined || fileSearchTimeoutMs(value.payload.timeoutMs) === value.payload.timeoutMs) &&
        (value.payload.batch === undefined || value.payload.batch === true)
    }
    case MessageType.SearchLimitMonitor: {
      if (!isRecord(value.payload) || !isLimitMonitorQuery(value.payload.query)) return false
      const keys = Object.keys(value.payload)
      if (!keys.includes('query')) return false
      return keys.every(key => key === 'query' || key === 'timeoutMs') &&
        (value.payload.timeoutMs === undefined || fileSearchTimeoutMs(value.payload.timeoutMs) === value.payload.timeoutMs)
    }
    case MessageType.SearchFee: {
      if (!isRecord(value.payload) || !isFeeSearchQuery(value.payload.query)) return false
      const keys = Object.keys(value.payload)
      if (!keys.includes('query')) return false
      return keys.every(key => key === 'query' || key === 'timeoutMs' || key === 'batch') &&
        (value.payload.timeoutMs === undefined || fileSearchTimeoutMs(value.payload.timeoutMs) === value.payload.timeoutMs) &&
        (value.payload.batch === undefined || value.payload.batch === true)
    }
    case MessageType.SearchFeeAmount: {
      if (!isRecord(value.payload) || !isFeeSearchQuery(value.payload.query)) return false
      const keys = Object.keys(value.payload)
      if (!keys.includes('query')) return false
      return keys.every(key => key === 'query' || key === 'timeoutMs')
    }
    case MessageType.LoadFeeInit:
    case MessageType.LoadPatentInit:
    case MessageType.LoadNoticeInit:
    case MessageType.ReadFeeReduceReviewers:
      return value.payload === undefined
    case MessageType.SearchPatent: {
      if (!isRecord(value.payload) || !isPatentSearchQuery(value.payload.query)) return false
      const keys = Object.keys(value.payload)
      if (!keys.includes('query')) return false
      return keys.every(key => key === 'query' || key === 'timeoutMs' || key === 'batch') &&
        (value.payload.timeoutMs === undefined || fileSearchTimeoutMs(value.payload.timeoutMs) === value.payload.timeoutMs) &&
        (value.payload.batch === undefined || value.payload.batch === true)
    }
    case MessageType.LoadPatentCtrlProc:
      return isRecord(value.payload) && typeof value.payload.countryIds === 'string' && value.payload.countryIds.length <= 4000 &&
        (value.payload.procType === undefined || (typeof value.payload.procType === 'string' && value.payload.procType.length <= 100)) &&
        Object.keys(value.payload).every(key => key === 'countryIds' || key === 'procType')
    case MessageType.SearchNotice:
      return isNoticeSearchRequest(value.payload)
    case MessageType.NoticeAction:
      return isNoticeActionRequest(value.payload)
    case MessageType.ExportNotice:
      return isNoticeExportRequest(value.payload)
    case MessageType.UploadNoticeExcel:
      return isNoticeExcelUploadRequest(value.payload)
    case MessageType.InspectFeeReduceCases:
      return isFeeReduceInspectPayload(value.payload)
    case MessageType.SubmitFeeReduceFiling:
      return isFeeReduceSubmitPayload(value.payload)
    case MessageType.SearchFeeCustomers:
      return isRecord(value.payload) && typeof value.payload.searchKey === 'string' && Object.keys(value.payload).length === 1
    case MessageType.LoadFeeApplicants:
      return isRecord(value.payload) && typeof value.payload.customerIds === 'string' && Object.keys(value.payload).length === 1
    case MessageType.FeeExportConfig: {
      const p = value.payload
      if (!isRecord(p)) return false
      if (p.action !== 'list' && p.action !== 'detail' && p.action !== 'add' && p.action !== 'up' && p.action !== 'del') return false
      if (p.belongKey !== 'FeeSearch_ExportByCond' && p.belongKey !== 'FeeSearch_ExportCountByCond' && p.belongKey !== 'NoticeInfo') return false
      if (p.typeId !== undefined && typeof p.typeId !== 'string') return false
      if (p.modelName !== undefined && typeof p.modelName !== 'string') return false
      if (p.columns !== undefined && (!Array.isArray(p.columns) || p.columns.length > 300 || !p.columns.every(c => isRecord(c) && typeof c.value === 'string' && typeof c.text === 'string'))) return false
      return Object.keys(p).every(k => k === 'action' || k === 'belongKey' || k === 'typeId' || k === 'modelName' || k === 'columns')
    }
    case MessageType.ExportFee: {
      const p = value.payload
      if (!isRecord(p)) return false
      if (p.mode !== 'cond' && p.mode !== 'checked' && p.mode !== 'count') return false
      if (!Array.isArray(p.columns) || p.columns.length === 0 || p.columns.length > 300 || !p.columns.every(c => isRecord(c) && typeof c.value === 'string' && typeof c.text === 'string')) return false
      if (p.query !== undefined && !isFeeSearchQuery(p.query)) return false
      if (p.feeIds !== undefined && (!Array.isArray(p.feeIds) || p.feeIds.length > 5000 || !p.feeIds.every(id => typeof id === 'string'))) return false
      if (p.timeoutMs !== undefined && fileSearchTimeoutMs(p.timeoutMs) !== p.timeoutMs) return false
      return Object.keys(p).every(k => k === 'mode' || k === 'query' || k === 'feeIds' || k === 'columns' || k === 'timeoutMs')
    }
    case MessageType.SearchFiling: {
      if (!isRecord(value.payload) || !isFilingSearchQuery(value.payload.query)) return false
      const keys = Object.keys(value.payload)
      if (!keys.includes('query')) return false
      return keys.every(key => key === 'query' || key === 'timeoutMs' || key === 'batch') &&
        (value.payload.timeoutMs === undefined || fileSearchTimeoutMs(value.payload.timeoutMs) === value.payload.timeoutMs) &&
        (value.payload.batch === undefined || value.payload.batch === true)
    }
    case MessageType.SubmitLimitMail:
      return isLimitMailSubmitRequest(value.payload)
    case MessageType.SubmitLimitMailResult:
      return isLimitMailSubmitResponse(value.payload)
    case MessageType.SubmitFileManage:
      return isFileManageSubmitRequest(value.payload)
    case MessageType.SubmitFileManageResult:
      return isFileManageSubmitResponse(value.payload)
    case MessageType.ResolveDownloadNames:
      return isDownloadNameRequest(value.payload)
    case MessageType.ResolveDownloadNamesResult:
      return isDownloadNameResult(value.payload)
    case MessageType.DownloadFiles:
      return isDownloadFilesRequest(value.payload)
    case MessageType.BrowserStreamDownload:
    case MessageType.StreamDownload: {
      const p = value.payload
      if (!isRecord(p)) return false
      if (p.action === 'start') return Object.keys(p).every(key => ['action', 'fileName', 'taskId', 'manifest', 'newCopy', 'targetId', 'expiresAt'].includes(key)) && isArchiveName(p.fileName) &&
        (p.expiresAt === undefined || (Number.isSafeInteger(p.expiresAt) && Number(p.expiresAt) > 0)) &&
        (p.targetId === undefined || (typeof p.targetId === 'string' && isQueryGuid(p.targetId))) &&
        (p.newCopy === undefined || (p.newCopy === true && p.taskId !== undefined)) &&
        (p.taskId === undefined || (typeof p.taskId === 'string' && isQueryGuid(p.taskId))) &&
        (p.manifest === undefined || (isRecord(p.manifest) && JSON.stringify(p.manifest).length <= 4_000_000 &&
          isDownloadFilesRequest({ items: p.manifest.items, selection: p.manifest.selection, stripAppNoDot: p.manifest.stripAppNoDot, archiveName: p.fileName, deduplicate: p.manifest.deduplicate, resolvedNames: p.manifest.resolvedNames, caseScopes: p.manifest.caseScopes }) &&
          Object.keys(p.manifest).every(key => ['items', 'selection', 'stripAppNoDot', 'archiveName', 'deduplicate', 'resolvedNames', 'caseScopes'].includes(key))))
      if (typeof p.token !== 'string' || !/^[0-9a-f]{64}$/.test(p.token)) return false
      if (p.action === 'write') return Object.keys(p).every(key => ['action', 'token', 'sequence', 'offset', 'data'].includes(key)) && Number.isSafeInteger(p.sequence) && Number(p.sequence) >= 0 &&
        (p.offset === undefined || (Number.isSafeInteger(p.offset) && Number(p.offset) >= 0)) &&
        typeof p.data === 'string' && p.data.length <= 349528 && /^[A-Za-z0-9+/]*={0,2}$/.test(p.data)
      if (p.action === 'checkpoint') return Object.keys(p).every(key => ['action', 'token', 'offset', 'names'].includes(key)) &&
        Number.isSafeInteger(p.offset) && Number(p.offset) >= 0 && Array.isArray(p.names) && p.names.length <= 40 && p.names.length > 0 &&
        p.names.every(name => typeof name === 'string' && name.length > 0 && name.length <= 180 && !name.includes(';'))
      if (p.action === 'cache') {
        const metadata = p.metadata
        return Object.keys(p).every(key => ['action', 'token', 'index', 'command', 'offset', 'data', 'metadata'].includes(key)) &&
        Number.isSafeInteger(p.index) && Number(p.index) >= 0 && Number(p.index) < DOWNLOAD_MAX_ITEMS &&
        ['info', 'read', 'write', 'reset', 'complete'].includes(String(p.command)) &&
        (p.offset === undefined || (Number.isSafeInteger(p.offset) && Number(p.offset) >= 0)) &&
        (p.data === undefined || (typeof p.data === 'string' && p.data.length <= 349528 && /^[A-Za-z0-9+/]*={0,2}$/.test(p.data))) &&
        (p.command !== 'write' || (typeof p.data === 'string' && p.offset !== undefined)) &&
        (metadata === undefined || (isRecord(metadata) && Object.keys(metadata).every(key => ['totalBytes', 'etag', 'lastModified', 'skipReason', 'sourceNotice'].includes(key)) &&
          (metadata.sourceNotice === undefined || (typeof metadata.sourceNotice === 'string' && metadata.sourceNotice.length <= 1000)) &&
          (metadata.skipReason === undefined || (typeof metadata.skipReason === 'string' && metadata.skipReason.trim().length > 0 && metadata.skipReason.length <= 1000)) &&
          (metadata.totalBytes == null || (Number.isSafeInteger(metadata.totalBytes) && Number(metadata.totalBytes) >= 0)) &&
          ['etag', 'lastModified'].every(key => metadata[key] === undefined || (typeof metadata[key] === 'string' && String(metadata[key]).length <= 1024))))
      }
      return ['finish', 'abort', 'pause', 'status', 'resume', 'complete'].includes(String(p.action)) && Object.keys(p).length === 2
    }
    case MessageType.PauseDownload:
    case MessageType.DiscardDownload:
      return isRecord(value.payload) && Object.keys(value.payload).every(key => ['taskId', 'backend'].includes(key)) &&
        (value.payload.backend === undefined || value.payload.backend === 'browser') && typeof value.payload.taskId === 'string' && isQueryGuid(value.payload.taskId)
    case MessageType.PauseDownloadResult:
    case MessageType.DiscardDownloadResult:
      return isRecord(value.payload) && Object.keys(value.payload).length === 1 && value.payload.ok === true
    case MessageType.StreamDownloadResult:
      return isRecord(value.payload) && value.payload.ok === true && Object.keys(value.payload).every(key => ['ok', 'token', 'downloadId', 'taskId', 'info', 'data'].includes(key)) &&
        (value.payload.taskId === undefined || (typeof value.payload.taskId === 'string' && isQueryGuid(value.payload.taskId))) &&
        (value.payload.info === undefined || isRecord(value.payload.info)) &&
        (value.payload.data === undefined || (typeof value.payload.data === 'string' && value.payload.data.length <= 349528)) &&
        (value.payload.token === undefined || (typeof value.payload.token === 'string' && /^[0-9a-f]{64}$/.test(value.payload.token))) &&
        (value.payload.downloadId === undefined || (Number.isSafeInteger(value.payload.downloadId) && Number(value.payload.downloadId) >= 0))
    case MessageType.DownloadFilesResult:
      return isDownloadFilesResult(value.payload)
    case MessageType.DownloadFilesAccepted:
      return isRecord(value.payload) && Object.keys(value.payload).length === 1 && typeof value.payload.progressId === 'string' && isQueryGuid(value.payload.progressId)
    case MessageType.SaveDownload: {
      const payload = value.payload
      // 只放行原站 FileHandler.ashx 取件地址（ZIP 打包或 Excel 导出）：后台照着它发起浏览器下载。fileName 为空时沿用服务端 Content-Disposition 文件名。
      return isRecord(payload) && (Object.keys(payload).length === 2 || Object.keys(payload).length === 3) &&
        (payload.progressId === undefined || (typeof payload.progressId === 'string' && isQueryGuid(payload.progressId))) &&
        typeof payload.url === 'string' && payload.url.length <= 500 &&
        /^https?:\/\/[^/?#]+\/AjaxServers\/FileHandler\.ashx\?guid=[0-9a-f-]{36}(&file_size=\d+)?$/i.test(payload.url) &&
        typeof payload.fileName === 'string' && (payload.fileName === '' || /\.(zip|xlsx|xls)$/i.test(payload.fileName)) && payload.fileName.length <= 120 &&
        !payload.fileName.includes('/') && !payload.fileName.includes('\\')
    }
    case MessageType.SaveDownloadResult:
      return isRecord(value.payload) && (Object.keys(value.payload).length === 2 || Object.keys(value.payload).length === 3) &&
        value.payload.ok === true &&
        typeof value.payload.fileName === 'string' && value.payload.fileName.length <= 120 &&
        (value.payload.downloadId === undefined || (typeof value.payload.downloadId === 'number' && Number.isSafeInteger(value.payload.downloadId) && value.payload.downloadId >= 0))
    case MessageType.DownloadState:
      return isRecord(value.payload) && Object.keys(value.payload).length === 1 &&
        typeof value.payload.downloadId === 'number' && Number.isSafeInteger(value.payload.downloadId) && value.payload.downloadId >= 0
    case MessageType.DownloadStateResult: {
      const payload = value.payload
      if (!isRecord(payload) || payload.ok !== true) return false
      const keys = Object.keys(payload)
      if (!keys.every(key => ['ok', 'state', 'receivedBytes', 'totalBytes', 'error', 'fileName'].includes(key))) return false
      if (payload.state !== 'inProgress' && payload.state !== 'complete' && payload.state !== 'interrupted') return false
      if (typeof payload.receivedBytes !== 'number' || !Number.isSafeInteger(payload.receivedBytes) || payload.receivedBytes < 0) return false
      if (payload.totalBytes !== null && (typeof payload.totalBytes !== 'number' || !Number.isSafeInteger(payload.totalBytes) || payload.totalBytes < 0)) return false
      if (payload.fileName !== undefined && (typeof payload.fileName !== 'string' || !payload.fileName || /[\\/]/.test(payload.fileName))) return false
      return payload.error === undefined || (typeof payload.error === 'string' && payload.error.length <= 200)
    }
    case MessageType.ExportCaseContacts:
      return isRecord(value.payload) && isVolumeList(value.payload.volumes) && Object.keys(value.payload).length === 1
    case MessageType.ListMailProcesses:
      return isRecord(value.payload) && isMailProcessQuery(value.payload.query) && Object.keys(value.payload).length === 1
    case MessageType.OpenEasyForm:
      return isRecord(value.payload) && isProcessOpenTarget(value.payload.target) && Object.keys(value.payload).length === 1
    case MessageType.OpenEasyFormResult:
      return isRecord(value.payload) && typeof value.payload.ok === 'boolean' && typeof value.payload.message === 'string' &&
        value.payload.message.length <= 200 && Object.keys(value.payload).length === 2
    case MessageType.ScanResult:
      return isPageSnapshot(value.payload)
    case MessageType.PageInfo:
      return isPageInfo(value.payload)
    case MessageType.PanelShown:
    case MessageType.Pong:
    case MessageType.SessionCheckCancelled:
    case MessageType.FileSearchCancelled:
      return isRecord(value.payload) && value.payload.ok === true
    case MessageType.SessionResult:
      return isSessionResult(value.payload)
    case MessageType.SearchFilesResult:
      return isFileSearchApiResult(value.payload)
    case MessageType.SearchLimitMonitorResult:
      return isLimitMonitorApiResult(value.payload)
    case MessageType.SearchFilingResult:
      return isFilingSearchApiResult(value.payload)
    case MessageType.SearchFeeResult:
      return isFeeSearchApiResult(value.payload)
    case MessageType.SearchPatentResult:
      return isPatentSearchApiResult(value.payload)
    case MessageType.SearchFeeAmountResult:
    case MessageType.LoadFeeInitResult:
    case MessageType.LoadPatentInitResult:
    case MessageType.LoadPatentCtrlProcResult:
    case MessageType.SearchFeeCustomersResult:
    case MessageType.LoadFeeApplicantsResult:
    case MessageType.FeeExportConfigResult:
    case MessageType.ExportFeeResult:
    case MessageType.LoadNoticeInitResult:
    case MessageType.NoticeActionResult:
    case MessageType.ExportNoticeResult:
    case MessageType.UploadNoticeExcelResult:
      return isRecord(value.payload)
    case MessageType.InspectFeeReduceCasesResult:
      return isFeeReduceInspectApiResult(value.payload)
    case MessageType.ReadFeeReduceReviewersResult:
      return isFeeReduceReviewersApiResult(value.payload)
    case MessageType.SubmitFeeReduceFilingResult:
      return isFeeReduceSubmitApiResult(value.payload)
    case MessageType.SearchNoticeResult:
      return isNoticeSearchApiResult(value.payload)
    case MessageType.ExportCaseContactsResult:
      return isCaseContactResult(value.payload)
    case MessageType.ListMailProcessesResult:
      return isMailProcessApiResult(value.payload)
    case MessageType.ListFlowReviewersResult:
      return isAccountReviewerResult(value.payload)
    case MessageType.CaseDemandResult:
      return isCaseDemandResult(value.payload)
    case MessageType.CaseBusFlowResult:
      return isCaseBusFlowResult(value.payload)
    case MessageType.LookupIcFlowResult:
      return isIcFlowResult(value.payload)
    case MessageType.CancelHagueReadResult:
      return isRecord(value.payload) && typeof value.payload.cancelled === 'boolean' && Object.keys(value.payload).length === 1
    case MessageType.ReadHagueCaseResult:
      return isRecord(value.payload) && typeof value.payload.text === 'string' && value.payload.text.length <= 100000 && Object.keys(value.payload).length === 1
    case MessageType.ReadCaseFieldsResult:
      return isRecord(value.payload) && typeof value.payload.text === 'string' && value.payload.text.length <= 8000 && Object.keys(value.payload).length === 1
    case MessageType.ReadFilingFlowResult:
      return isFilingFlowApiResult(value.payload)
    case MessageType.ReadUserInfoResult:
      return isFilingUserApiResult(value.payload)
    case MessageType.CustomerDemandResult:
      return isCustomerPageResult(value.payload, isCustomerDemandAsset)
    case MessageType.CustomerDirectoryResult:
      return isCustomerPageResult(value.payload, isCustomerDirectoryAsset)
    case MessageType.MailContactResult:
      return isMailContactResult(value.payload)
    case MessageType.MailAddressResult:
      return isMailAddressResult(value.payload)
    case MessageType.HistoryQueriesResult:
      return isHistoryListResult(value.payload)
    case MessageType.HistoryQueryResult:
      return isHistoryDetailResult(value.payload)
    case MessageType.HistoryQuerySaved:
      return isHistorySaveResult(value.payload)
    case MessageType.HistoryQueryDeleted:
      return isHistoryDeleteResult(value.payload)
    case MessageType.FileTempNamesResult:
      return isFileTempNamesResult(value.payload)
    case MessageType.DictionaryResult:
      return isDictionaryResult(value.payload)
    case MessageType.FileSearchFormResult:
    case MessageType.FilingFormResult:
      return isRecord(value.payload) && Array.isArray(value.payload.fields) && value.payload.fields.length <= 200 &&
        value.payload.fields.every(isFileSearchFormField) && Object.keys(value.payload).length === 1
    case MessageType.QuerySurfacesResult:
      return isRecord(value.payload) && Array.isArray(value.payload.surfaces) && value.payload.surfaces.length <= 20 &&
        value.payload.surfaces.every(isQuerySurfaceEntry) && Object.keys(value.payload).length === 1
    case MessageType.MailExecutionResult:
      return isRecord(value.payload) && Object.keys(value.payload).length === 1 &&
        (value.payload.view === null || isMailExecutionView(value.payload.view))
    case MessageType.WorkflowResult:
      return isRecord(value.payload) && Object.keys(value.payload).length === 1 &&
        (value.payload.view === null || isWorkflowView(value.payload.view))
    case MessageType.ExistingMailDiagnostic:
      return isExistingMailDiagnostic(value.payload)
    case MessageType.ExecutionLease:
      return isRecord(value.payload) && typeof value.payload.ok === 'boolean' && typeof value.payload.reason === 'string' &&
        (value.payload.lease === null || isLeaseSummary(value.payload.lease))
    case MessageType.ExecutionRecovered:
      return isRecord(value.payload) && Array.isArray(value.payload.leases) && value.payload.leases.every(item => item === null || isLeaseSummary(item))
    case MessageType.TaskResult:
      return isRecord(value.payload) && typeof value.payload.ok === 'boolean' && typeof value.payload.message === 'string' &&
        Array.isArray(value.payload.tasks) && value.payload.tasks.every(isTaskSummary) &&
        (value.payload.task === null || isStoredTask(value.payload.task))
    case MessageType.AcceptanceResult:
    case MessageType.EvidenceResult:
      return isRecord(value.payload) && Array.isArray(value.payload.records) && value.payload.records.every(isPlainRecord)
    case MessageType.AgentChat:
      return isAgentChatRequest(value.payload)
    case MessageType.AgentChatResult:
      return isAgentChatResult(value.payload)
    case MessageType.Error:
      return isRecord(value.payload) && typeof value.payload.message === 'string'
    default:
      return false
  }
}

function isAgentSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9-]{8,40}$/.test(value)
}

function isSessionTitle(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 40
}

function isAgentChatRequest(value: unknown): boolean {
  if (!isRecord(value) || typeof value.action !== 'string') return false
  if (value.action === 'history' || value.action === 'reset' || value.action === 'facts' || value.action === 'compact' || value.action === 'stop') return Object.keys(value).length === 1
  if (value.action === 'create') {
    const keys = Object.keys(value)
    if (keys.length === 1) return true
    return keys.length === 2 && isSessionTitle(value.title)
  }
  if (value.action === 'rename') return isAgentSessionId(value.id) && isSessionTitle(value.title) && Object.keys(value).length === 3
  if (value.action === 'open' || value.action === 'remove') return isAgentSessionId(value.id) && Object.keys(value).length === 2
  if (value.action === 'answer') return typeof value.message === 'string' && value.message.trim().length > 0 && value.message.length <= 4_000 && Object.keys(value).length === 2
  if (value.action !== 'probe' && value.action !== 'turn') return false
  if (typeof value.message !== 'string' || value.message.trim().length === 0 || value.message.length > AGENT_TURN_CHARS) return false
  const keys = Object.keys(value)
  if (value.action === 'turn' && value.skill === 'hague-filing-arbitration') return keys.length === 3 && keys.includes('skill')
  if (value.action === 'turn' && value.plain === true) return keys.length === 3 && keys.includes('plain')
  return keys.length === 2
}

function isAgentSessionCard(value: unknown): boolean {
  return isRecord(value) && isAgentSessionId(value.id) &&
    typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 40 &&
    typeof value.updatedAt === 'string' && value.updatedAt.length <= 40 &&
    typeof value.active === 'boolean'
}

function isAgentChatResult(value: unknown): value is ApiResult<{ reply: string; model: string; steps: number; history: Array<{ role: 'user' | 'assistant'; content: string }>; sessions: Array<{ id: string; title: string; updatedAt: string; active: boolean }>; activeId: string }> {
  if (!isRecord(value)) return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
  if (value.ok !== true || !isRecord(value.data)) return false
  const history = value.data.history
  const sessions = value.data.sessions
  return typeof value.data.reply === 'string' && value.data.reply.length <= AGENT_TURN_CHARS &&
    typeof value.data.model === 'string' && value.data.model.length <= 200 &&
    typeof value.data.steps === 'number' && Number.isSafeInteger(value.data.steps) && value.data.steps >= 0 && value.data.steps <= 20 &&
    Array.isArray(history) && history.length <= AGENT_HISTORY_LIMIT && history.every(item => isRecord(item) &&
      (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string' && item.content.length <= AGENT_TURN_CHARS) &&
    isAgentSessionId(value.data.activeId) &&
    Array.isArray(sessions) && sessions.length > 0 && sessions.length <= 30 && sessions.every(isAgentSessionCard)
}

export function isContentRequest(value: unknown): value is ContentRequest {
  return isMessage(value) && (
    value.type === MessageType.ScanPage || value.type === MessageType.GetPageInfo ||
    value.type === MessageType.ShowPanel || value.type === MessageType.Ping ||
    value.type === MessageType.CheckSession || value.type === MessageType.CancelSessionCheck ||
    value.type === MessageType.SearchFiles || value.type === MessageType.CancelFileSearch ||
    value.type === MessageType.CancelLimitMonitor ||
    value.type === MessageType.SearchLimitMonitor || value.type === MessageType.SearchFiling || value.type === MessageType.SearchFee || value.type === MessageType.SearchFeeAmount || value.type === MessageType.LoadFeeInit || value.type === MessageType.SearchFeeCustomers || value.type === MessageType.LoadFeeApplicants || value.type === MessageType.FeeExportConfig || value.type === MessageType.ExportFee ||
    value.type === MessageType.SearchPatent || value.type === MessageType.LoadPatentInit || value.type === MessageType.LoadPatentCtrlProc ||
    value.type === MessageType.LoadNoticeInit || value.type === MessageType.SearchNotice || value.type === MessageType.NoticeAction || value.type === MessageType.ExportNotice || value.type === MessageType.UploadNoticeExcel || value.type === MessageType.InspectFeeReduceCases || value.type === MessageType.ReadFeeReduceReviewers || value.type === MessageType.SubmitFeeReduceFiling || value.type === MessageType.ListMailProcesses ||
    value.type === MessageType.SubmitLimitMail ||
    value.type === MessageType.SubmitFileManage ||
    value.type === MessageType.ResolveDownloadNames ||
    value.type === MessageType.DownloadFiles ||
    value.type === MessageType.ExportCaseContacts ||
    value.type === MessageType.OpenEasyForm ||
    value.type === MessageType.ListFlowReviewers ||
    value.type === MessageType.ReadCaseDemands ||
    value.type === MessageType.ReadCaseBusFlow ||
    value.type === MessageType.LookupIcFlow ||
    value.type === MessageType.ReadCustomerDemands ||
    value.type === MessageType.ReadCustomerDirectory ||
    value.type === MessageType.ReadMailContacts ||
    value.type === MessageType.ReadMailAddresses ||
    value.type === MessageType.ListHistoryQueries || value.type === MessageType.GetHistoryQuery ||
    value.type === MessageType.SaveHistoryQuery ||
    value.type === MessageType.DeleteHistoryQuery ||
    value.type === MessageType.SaveFileTempName ||
    value.type === MessageType.DeleteFileTempName ||
    value.type === MessageType.LoadDictionary || value.type === MessageType.ScanFileSearchForm || value.type === MessageType.ScanFilingForm || value.type === MessageType.CreateEasyMail ||
    value.type === MessageType.ReadQuerySurfaces ||
    value.type === MessageType.SaveEasyMail || value.type === MessageType.FindMailExecution ||
    value.type === MessageType.InspectEasyMail || value.type === MessageType.ReadWorkflow ||
    value.type === MessageType.RefreshWorkflow || value.type === MessageType.PreviewWorkflow ||
    value.type === MessageType.RestoreWorkflow || value.type === MessageType.DiagnoseExistingMail ||
    value.type === MessageType.RunReadonlyAcceptance ||
    value.type === MessageType.CallEasy ||
    value.type === MessageType.CancelHagueRead ||
    value.type === MessageType.ReadHagueCase ||
    value.type === MessageType.ReadCaseFields ||
    value.type === MessageType.ReadFilingFlow ||
    value.type === MessageType.ReadUserInfo
  )
}

const PAGE_FORWARD = new Set(['CHECK_SESSION', 'CANCEL_SESSION_CHECK', 'SEARCH_FILES', 'CANCEL_FILE_SEARCH', 'CANCEL_LIMIT_MONITOR', 'SEARCH_LIMIT_MONITOR', 'SEARCH_FILING', 'SEARCH_FEE', 'SEARCH_FEE_AMOUNT', 'LOAD_FEE_INIT', 'SEARCH_FEE_CUSTOMERS', 'LOAD_FEE_APPLICANTS', 'FEE_EXPORT_CONFIG', 'EXPORT_FEE', 'SEARCH_PATENT', 'LOAD_PATENT_INIT', 'LOAD_PATENT_CTRL_PROC', 'LOAD_NOTICE_INIT', 'SEARCH_NOTICE', 'EXPORT_NOTICE', 'LOOKUP_IC_FLOW', 'EXPORT_CASE_CONTACTS', 'LIST_MAIL_PROCESSES', 'OPEN_EASY_FORM', 'LIST_FLOW_REVIEWERS', 'READ_CASE_DEMANDS', 'READ_CASE_BUS_FLOW', 'READ_CUSTOMER_DEMANDS', 'READ_CUSTOMER_DIRECTORY', 'READ_MAIL_CONTACTS', 'READ_MAIL_ADDRESSES', 'GET_PAGE_INFO', 'LIST_HISTORY_QUERIES', 'GET_HISTORY_QUERY', 'LOAD_DICTIONARY', 'SCAN_FILE_SEARCH_FORM', 'SCAN_FILING_FORM', 'READ_QUERY_SURFACES', 'FIND_MAIL_EXECUTION', 'INSPECT_EASY_MAIL', 'READ_WORKFLOW', 'REFRESH_WORKFLOW', 'PREVIEW_WORKFLOW', 'DIAGNOSE_EXISTING_MAIL', 'RUN_READONLY_ACCEPTANCE', 'CALL_EASY', 'CANCEL_HAGUE_READ', 'READ_HAGUE_CASE', 'READ_CASE_FIELDS', 'READ_FILING_FLOW', 'READ_USER_INFO', 'RESOLVE_DOWNLOAD_NAMES', 'DOWNLOAD_FILES', 'INSPECT_FEE_REDUCE_CASES', 'READ_FEE_REDUCE_REVIEWERS'])
const WRITE_FORWARD = new Set(['CREATE_EASY_MAIL', 'SAVE_EASY_MAIL', 'SAVE_HISTORY_QUERY', 'DELETE_HISTORY_QUERY', 'SAVE_FILE_TEMP_NAME', 'DELETE_FILE_TEMP_NAME', 'SUBMIT_LIMIT_MAIL', 'SUBMIT_FILE_MANAGE', 'UPLOAD_NOTICE_EXCEL', 'SUBMIT_FEE_REDUCE_FILING'])

/** 不允许转发时给出原因。写开关关掉时，创建、保存和查询模板写回都停在这里。 */
export function workspaceForwardBlock(value: unknown): string {
  if (!isContentRequest(value)) return '完整页面不能转发这个请求。'
  if (PAGE_FORWARD.has(value.type)) return ''
  if (value.type === MessageType.NoticeAction) {
    return isWriteNoticeAction(value.payload) && !isWriteSwitchOpen() ? '写开关已关闭。' : ''
  }
  if (WRITE_FORWARD.has(value.type)) return isWriteSwitchOpen() ? '' : '写开关已关闭。'
  return '完整页面不能转发这个请求。'
}

/** 消息校验和后台派发共用同一份许可。创建、保存和查询模板写回还要看前端写开关。 */
export function isWorkspaceForwardRequest(value: unknown): value is ContentRequest {
  return workspaceForwardBlock(value) === ''
}

function isSearchContinuation(value: unknown): boolean {
  if (value === undefined) return true
  return isRecord(value) && Object.keys(value).length === 1 && typeof value.querySessionId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.querySessionId)
}

function isExpectedScope(value: unknown): value is ExpectedAccountScope {
  return isRecord(value) && typeof value.easyOrigin === 'string' && isEasyOrigin(value.easyOrigin) && typeof value.operatorId === 'string' && isQueryGuid(value.operatorId) &&
    typeof value.easyTabId === 'number' && Number.isInteger(value.easyTabId) &&
    typeof value.connectionVersion === 'number' && Number.isInteger(value.connectionVersion) && value.connectionVersion >= 0
}

function isPlanFiles(value: unknown): value is SelectedPatentFile[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return false
  return value.every(item => isRecord(item) && typeof item.fileId === 'string' && item.fileId.trim().length > 0 && item.fileId.length <= 200 &&
    typeof item.fileName === 'string' && item.fileName.length <= 300)
}

function isDualSystemNodeReason(value: unknown): value is DualSystemNodeReason {
  return (
    value === 'ready' ||
    value === 'no_tab' ||
    value === 'not_logged_in' ||
    value === 'session_expired' ||
    value === 'multiple_accounts' ||
    value === 'unreachable'
  )
}

function isDualSystemNodeStatus(value: unknown): value is DualSystemNodeStatus {
  return (
    isRecord(value) &&
    isCustomerMode(value.mode) &&
    typeof value.label === 'string' &&
    typeof value.ready === 'boolean' &&
    (value.tabId === null || (typeof value.tabId === 'number' && Number.isInteger(value.tabId))) &&
    typeof value.origin === 'string' &&
    typeof value.loginUrl === 'string' &&
    typeof value.operatorId === 'string' &&
    typeof value.displayName === 'string' &&
    isDualSystemNodeReason(value.reason) &&
    typeof value.message === 'string'
  )
}

function isDualSystemStatusSnapshot(value: unknown): value is DualSystemStatusSnapshot {
  return (
    isRecord(value) &&
    typeof value.checkedAt === 'string' &&
    isDualSystemNodeStatus(value.large) &&
    isDualSystemNodeStatus(value.sme) &&
    typeof value.writeSwitchOpen === 'boolean' &&
    typeof value.allReady === 'boolean'
  )
}

function isWorkspaceAction(value: unknown): value is WorkspaceAction {
  if (!isRecord(value) || typeof value.action !== 'string') return false
  if (value.action === 'focus' || value.action === 'listTabs' || value.action === 'refreshSession' || value.action === 'openLogin' || value.action === 'load' || value.action === 'declineAccountSwitch' || value.action === 'checkDualSystems') {
    return Object.keys(value).length === 1
  }
  if (value.action === 'openDualLogin') return isCustomerMode(value.mode) && Object.keys(value).length === 2
  if (value.action === 'setCustomerMode') return isCustomerMode(value.mode) && Object.keys(value).length === 2
  if (value.action === 'bind') return typeof value.tabId === 'number' && Number.isInteger(value.tabId) && Object.keys(value).length === 2
  if (value.action === 'saveCustomer') {
    const keys = Object.keys(value)
    const revisionOk = value.expectedRevision === undefined || (Number.isSafeInteger(value.expectedRevision) && Number(value.expectedRevision) >= 1)
    return isCustomerProfile(value.profile) && isExpectedScope(value.expectedScope) && revisionOk && (keys.length === 3 || keys.length === 4)
  }
  if (value.action === 'deleteCustomer') {
    return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 80 && isExpectedScope(value.expectedScope) &&
      Number.isSafeInteger(value.expectedRevision) && Number(value.expectedRevision) >= 1 && Object.keys(value).length === 4
  }
  if (value.action === 'saveQueryTemplate') {
    const versionOk = value.expectedVersion === null || (Number.isSafeInteger(value.expectedVersion) && Number(value.expectedVersion) >= 1)
    return isQueryTemplate(value.template) && isExpectedScope(value.expectedScope) && versionOk && Object.keys(value).length === 4
  }
  if (value.action === 'deleteQueryTemplate') {
    return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 80 && isExpectedScope(value.expectedScope) && Object.keys(value).length === 3
  }
  if (value.action === 'saveRules') return isRuleBundle(value.bundle) && isExpectedScope(value.expectedScope) && Object.keys(value).length === 3
  if (value.action === 'createTaskPlan') {
    return isPlanFiles(value.files) && Number.isSafeInteger(value.queryTemplateVersion) && Number(value.queryTemplateVersion) >= 0 &&
      isExpectedScope(value.expectedScope) && Object.keys(value).length === 4 && JSON.stringify(value).length <= 200_000
  }
  if (value.action === 'recordFileManageRun') {
    return isFileManageRunInput(value.run) && isExpectedScope(value.expectedScope) && Object.keys(value).length === 3
  }
  if (value.action === 'runAcceptance') return isAcceptanceAction(value)
  if (value.action === 'forward') {
    const keys = Object.keys(value)
    const modeOk = value.targetMode === undefined || isCustomerMode(value.targetMode)
    return (keys.length === 2 || (keys.length === 3 && 'targetMode' in value)) && modeOk && isWorkspaceForwardRequest(value.message)
  }
  return false
}

function isWorkspaceResult(value: unknown): value is WorkspaceResultPayload {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || typeof value.message !== 'string' || !isEasyConnection(value.connection)) return false
  if (!Array.isArray(value.tabs) || !value.tabs.every(isEasyTab)) return false
  if (!Array.isArray(value.customers) || !value.customers.every(isCustomerProfile)) return false
  if (!Array.isArray(value.templates) || !value.templates.every(isQueryTemplate)) return false
  if (value.rules !== null && !isRuleBundle(value.rules)) return false
  if (!Array.isArray(value.tasks) || !value.tasks.every(isTaskSummary)) return false
  if (value.fileManageRuns !== undefined && (!Array.isArray(value.fileManageRuns) || !value.fileManageRuns.every(isFileManageRun))) return false
  if (!isForwardedMessage(value.forwarded)) return false
  if (value.createdTask != null && !isCreatedTask(value.createdTask)) return false
  if (value.dualSystems !== undefined && !isDualSystemStatusSnapshot(value.dualSystems)) return false
  if (value.contextError !== undefined && value.contextError !== 'STALE_CONTEXT') return false
  if (value.rulesSaved !== undefined && typeof value.rulesSaved !== 'boolean') return false
  if (value.tasksRevalidated !== undefined && typeof value.tasksRevalidated !== 'boolean') return false
  if (value.pendingRevalidation !== undefined && typeof value.pendingRevalidation !== 'boolean') return false
  return value.appTab === null || (isRecord(value.appTab) && typeof value.appTab.tabId === 'number' && typeof value.appTab.created === 'boolean')
}

function isCreatedTask(value: unknown): boolean {
  return isRecord(value) && typeof value.taskId === 'string' && typeof value.taskFingerprint === 'string' &&
    typeof value.status === 'string' && typeof value.createdAt === 'string' &&
    typeof value.itemCount === 'number' && value.persisted === true &&
    (value.fileSource === 'FILE_SOURCE_UNVERIFIED' || value.fileSource === 'SEARCH_RESPONSE_OBSERVED')
}

function isEasyTab(value: unknown): value is EasyTabCandidate {
  return isRecord(value) && typeof value.id === 'number' && typeof value.title === 'string' && typeof value.url === 'string' && typeof value.origin === 'string' && isEasyOrigin(value.origin)
}

function isRuleBundle(value: unknown): value is MailRuleBundle {
  if (!isRecord(value) || value.version !== 1 || typeof value.revision !== 'number' || typeof value.ownerId !== 'string') return false
  if (!Array.isArray(value.policies) || !Array.isArray(value.mappings) || !Array.isArray(value.recipients) || !Array.isArray(value.signatures)) return false
  if (!isRecord(value.subject) || typeof value.subject.template !== 'string' || value.subject.template.length > 500) return false
  if (!isRecord(value.body) || typeof value.body.template !== 'string' || value.body.template.length > 4000) return false
  return JSON.stringify(value).length <= 200_000
}

function isForwardedMessage(value: unknown): value is AppMessage | null {
  if (value === null) return true
  if (!isRecord(value) || value.type === MessageType.Workspace || value.type === MessageType.WorkspaceResult) return false
  return isMessage(value)
}

function isOperatorScope(value: unknown): value is { origin: string; operatorId: string } {
  return isRecord(value) && typeof value.origin === 'string' && value.origin.length > 0 && value.origin.length <= 200 &&
    typeof value.operatorId === 'string' && value.operatorId.length <= 80 && Object.keys(value).length === 2
}

function isTaskAddress(value: unknown): boolean {
  if (!isRecord(value) || typeof value.taskId !== 'string' || value.taskId.length > 80 || Object.keys(value).length !== 3) return false
  return typeof value.origin === 'string' && typeof value.operatorId === 'string' && isOperatorScope({ origin: value.origin, operatorId: value.operatorId })
}

function isLeaseCommand(value: unknown): value is LeaseCommand {
  return isRecord(value) && typeof value.origin === 'string' && value.origin.length <= 200 &&
    typeof value.operatorId === 'string' && value.operatorId.length <= 80 &&
    typeof value.taskFingerprint === 'string' && value.taskFingerprint.length > 0 && value.taskFingerprint.length <= 128 &&
    typeof value.executionId === 'string' && value.executionId.length <= 80 &&
    typeof value.leaseVersion === 'number' && Number.isInteger(value.leaseVersion) &&
    Object.keys(value).length === 5
}

function isStoredTask(value: unknown): value is Record<string, unknown> {
  return isPlainRecord(value) && typeof value.taskId === 'string' && typeof value.operatorId === 'string' &&
    typeof value.origin === 'string' && typeof value.taskFingerprint === 'string' && Array.isArray(value.items)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const keys = Object.keys(value).join(',')
  return !/cookie|authorization|password|token/i.test(keys)
}

function isFileManageRunInput(value: unknown): value is FileManageRunInput {
  if (!isRecord(value) || Object.keys(value).length !== 5) return false
  return typeof value.customerName === 'string' && value.customerName.trim().length > 0 && value.customerName.length <= 120 &&
    typeof value.subject === 'string' && value.subject.length <= 500 &&
    typeof value.note === 'string' && value.note.length <= 200 &&
    Number.isInteger(value.fileCount) && Number(value.fileCount) >= 1 && Number(value.fileCount) <= 100 &&
    (value.status === 'submitted' || value.status === 'held' || value.status === 'skipped' || value.status === 'failed')
}

function isFileManageRun(value: unknown): value is FileManageRun {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 80 &&
    typeof value.at === 'string' && value.at.length > 0 && value.at.length <= 40 &&
    isFileManageRunInput({
      customerName: value.customerName,
      subject: value.subject,
      fileCount: value.fileCount,
      status: value.status,
      note: value.note
    })
}

function isTaskSummary(value: unknown): boolean {
  return isRecord(value) && typeof value.taskId === 'string' && typeof value.customerName === 'string' &&
    typeof value.status === 'string' && typeof value.createdAt === 'string' && typeof value.fileCount === 'number' &&
    typeof value.mailCount === 'number'
}

function isShortText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max
}

function isAcceptanceAction(value: Record<string, unknown>): boolean {
  if (!isShortText(value.call, 80) || value.call.length === 0) return false
  const allowed = new Set(['action', 'call', 'caseTypeId', 'mailId', 'flowType', 'expectedFields'])
  if (Object.keys(value).some(key => !allowed.has(key))) return false
  if (value.caseTypeId !== undefined && !isShortText(value.caseTypeId, 80)) return false
  if (value.mailId !== undefined && !isShortText(value.mailId, 80)) return false
  if (value.flowType !== undefined && !isShortText(value.flowType, 20)) return false
  if (value.expectedFields !== undefined && (!isRecord(value.expectedFields) || Object.keys(value.expectedFields).length > 20 || Object.values(value.expectedFields).some(item => typeof item !== 'string'))) return false
  return true
}

function isCallEasy(value: unknown): boolean {
  if (!isRecord(value) || typeof value.handler !== 'string' || typeof value.call !== 'string') return false
  if (Object.keys(value).some(key => key !== 'handler' && key !== 'call' && key !== 'fields')) return false
  if (value.fields === undefined) return true
  if (!isRecord(value.fields) || Array.isArray(value.fields) || Object.keys(value.fields).length > 12) return false
  return Object.entries(value.fields).every(([key, item]) => /^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(key) &&
    typeof item === 'string' && item.length <= 200 && !/cookie|authorization|password|token/i.test(key))
}

function isReadonlyProbe(value: unknown): boolean {
  if (!isRecord(value) || !isShortText(value.call, 80) || !isRecord(value.expected)) return false
  if (Object.values(value.expected).some(item => typeof item !== 'string') || Object.keys(value.expected).length > 20) return false
  const allowed = new Set(['call', 'expected', 'caseTypeId', 'mailId', 'flowType'])
  if (Object.keys(value).some(key => !allowed.has(key))) return false
  if (value.caseTypeId !== undefined && !isShortText(value.caseTypeId, 80)) return false
  if (value.mailId !== undefined && !isShortText(value.mailId, 80)) return false
  if (value.flowType !== undefined && !isShortText(value.flowType, 20)) return false
  return true
}

function isClaim(value: unknown): value is { origin: string; operatorId: string; taskFingerprint: string } {
  return isRecord(value) && typeof value.origin === 'string' && value.origin.length > 0 && value.origin.length <= 200 &&
    typeof value.operatorId === 'string' && value.operatorId.length <= 80 &&
    typeof value.taskFingerprint === 'string' && value.taskFingerprint.length > 0 && value.taskFingerprint.length <= 20000 &&
    Object.keys(value).length === 3
}

function isLeaseSummary(value: unknown): boolean {
  return isRecord(value) && typeof value.executionId === 'string' && typeof value.taskFingerprint === 'string' &&
    typeof value.owner === 'string' && typeof value.status === 'string' && typeof value.requestSent === 'boolean' &&
    typeof value.easyMailId === 'string'
}

function isExistingMailDiagnostic(value: unknown): value is ExistingMailDiagnostic {
  return isRecord(value) && typeof value.mailId === 'string' && Array.isArray(value.fileIds) && value.fileIds.every(item => typeof item === 'string') &&
    Array.isArray(value.fileNames) && value.fileNames.every(item => typeof item === 'string') && value.writesAttempted === false &&
    Array.isArray(value.blockers) && value.blockers.every(item => typeof item === 'string') && isWorkflowView(value.workflow) &&
    Object.keys(value).length === 6
}

function isConfirmedPreview(value: unknown): value is { preview: MailDraftPreview; selection: SelectionClaim; confirmed: true } {
  return isRecord(value) && value.confirmed === true && isSelectionClaim(value.selection) && isMailDraftPreview(value.preview)
}

function isFlowId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function isFlowType(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 20 && /^[A-Za-z0-9_-]+$/.test(value)
}

function isWorkflowPreview(value: unknown): value is { executionId: string; nodeId: string; reviewerId: string; auditType: 'submit' | 'handover'; remark: string; urgencyId: string } {
  if (!isRecord(value) || Object.keys(value).length !== 6) return false
  return typeof value.executionId === 'string' && typeof value.nodeId === 'string' && typeof value.reviewerId === 'string' &&
    (value.auditType === 'submit' || value.auditType === 'handover') && typeof value.remark === 'string' && value.remark.length <= 2000 &&
    typeof value.urgencyId === 'string' && value.nodeId.length <= 80 && value.reviewerId.length <= 80 && value.urgencyId.length <= 80
}

const DICTIONARY_KINDS = new Set(['basic', 'flow', 'fieldColumn', 'listColumn', 'fileType', 'mailType', 'reviewer', 'picker', 'mailSet', 'signature', 'customerList'])

function isDictionaryRequest(value: unknown): value is DictionaryLoadRequest {
  if (!isRecord(value) || (value.force !== true && value.force !== false) || typeof value.kind !== 'string' || !DICTIONARY_KINDS.has(value.kind)) {
    return false
  }
  if (value.kind === 'picker') {
    const allowed = new Set(['kind', 'force', 'caseTypeId', 'country', 'procType'])
    if (!Object.keys(value).every(key => allowed.has(key))) return false
    if (value.caseTypeId !== undefined && !isFlowId(value.caseTypeId)) return false
    if (value.procType !== undefined && value.procType !== '' && !isFlowId(value.procType)) return false
    if (value.country !== undefined && (typeof value.country !== 'string' || value.country.length > 400 || !/^[A-Za-z0-9_,-]*$/.test(value.country))) return false
    return true
  }
  if (value.kind === 'fileType') {
    return typeof value.caseTypeId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.caseTypeId) &&
      Object.keys(value).length === 3
  }
  return Object.keys(value).length === 2
}

/** 浮窗和 Content Script 同处隔离环境，通过依赖注入收发消息。 */
export interface MessageBridge {
  request(message: ContentRequest, signal?: AbortSignal): Promise<ContentResponse>
}

