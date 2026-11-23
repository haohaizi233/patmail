export type NoticeTabId =
  | 'import'
  | 'download'
  | 'cert'
  | 'replay'
  | 'hand'
  | 'handHis'
  | 'nolaiuto'
  | 'handExcel'

export interface NoticeOptionItem {
  value: string
  label: string
  parent?: string
  selectable?: boolean
  extra?: Record<string, string>
}

export interface NoticeFileTypeNode {
  id: string
  name: string
  parentId: string
  selectable?: boolean
  treeType?: string
  code?: string
}

export interface NoticeInitData {
  applyTypes: NoticeOptionItem[]
  agencies: NoticeOptionItem[]
  directions: NoticeOptionItem[]
  applyTags: NoticeOptionItem[]
  branches: NoticeOptionItem[]
  countries: NoticeOptionItem[]
  fileTypes: NoticeFileTypeNode[]
  cpcAccounts: NoticeOptionItem[]
  defaultTzsStartDate: string
  handCount: number
  nolaiutoCount: number
  warnings: string[]
}

export interface NoticeImportQuery {
  case_volume: string
  is_fuzzy_query_case_volume: boolean
  post_date_s: string
  post_date_e: string
  filedesc: string
  status: '0' | '1'
  customer_name: string
  customer_code: string
  introducer: string
  sales_help: string
  applicant_name: string
  apply_type: string
  orderby: 'FaWenRQ' | 'oa_name' | 'customer_name' | 'ShenQingH'
  agency_id: string
  app_no: string
  flow_direction: string
  assayer: string
  xiazairq_s: string
  xiazairq_e: string
  app_area_name: string
  branch_dept_id: string
  is_speed_checkd: '' | '1' | '0'
  customer_country: string
  apply_tags_id: string
  hearing_the_case: '' | '1' | '0'
  is_hz_interfice: boolean
  files_is_case: '' | '1' | '0'
  update_time_s: string
  update_time_e: string
  update_time_shmm: string
  update_time_ehmm: string
  pageIndex: number
  pageSize: number
}

export interface NoticeDownloadQuery {
  account: string
  casename: string
  appno: string
  startTime: string
  endTime: string
  status: '' | 'unprocess' | 'process'
  pageIndex: number
  pageSize: number
}

export interface NoticeCertQuery {
  account: string
  casename: string
  appno: string
  startTime: string
  endTime: string
  status: '' | '1' | '2' | '3' | '4' | '5' | '6'
  xlh: string
  pageIndex: number
  pageSize: number
}

export interface NoticeReplayQuery {
  account: string
  applyType: '' | '1' | '2' | '3'
  applyNo: string
  caseName: string
  noticeName: string
  xlh: string
  startTime: string
  endTime: string
  pageIndex: number
  pageSize: number
}

export interface NoticeHandQuery {
  assayer: string
  keyword: string
  pageIndex: number
  pageSize: number
}

export interface NoticeHandHisQuery {
  assayer: string
  keyword: string
  pageIndex: number
  pageSize: number
}

export interface NoticeNolaiutoQuery {
  keyword: string
  pageIndex: number
  pageSize: number
}

export interface NoticeHandExcelQuery {
  is_import: '' | '1' | '0'
  is_download: '' | '已下载' | '待下载'
  is_handle: '' | '1' | '0'
  pageIndex: number
  pageSize: number
}

export type NoticeSearchRequest =
  | { tab: 'import'; query: NoticeImportQuery; timeoutMs?: number }
  | { tab: 'download'; query: NoticeDownloadQuery; timeoutMs?: number }
  | { tab: 'cert'; query: NoticeCertQuery; timeoutMs?: number }
  | { tab: 'replay'; query: NoticeReplayQuery; timeoutMs?: number }
  | { tab: 'hand'; query: NoticeHandQuery; timeoutMs?: number }
  | { tab: 'handHis'; query: NoticeHandHisQuery; timeoutMs?: number }
  | { tab: 'nolaiuto'; query: NoticeNolaiutoQuery; timeoutMs?: number }
  | { tab: 'handExcel'; query: NoticeHandExcelQuery; timeoutMs?: number }

export type NoticeRow = Record<string, unknown>

export interface NoticeSearchResult {
  tab: NoticeTabId
  rows: NoticeRow[]
  total: number
  pageIndex: number
  pageSize: number
  needCpcLogin?: boolean
  loginMessage?: string
}

export interface NoticeCheckNoticeItem {
  NeiBuBH: string
  file_desc_zh_cn: string
}

export interface NoticeSgReduceItem {
  case_volume: string
}

export interface NoticeUploadProcessRow {
  id: string
  sn: number
  zipFileName: string
  status: string
  process: string
  successNum: string
  failNum: string
  createTime: string
  remark: string
}

export type NoticeActionRequest =
  | { action: 'refreshCounts' }
  | { action: 'importCheck'; oaIds: string[] }
  | { action: 'importNotice'; oaIds: string[]; mailSales?: 'N' | 'Y'; checkName?: boolean }
  | { action: 'importCloseCase'; oaIds: string[] }
  | { action: 'recoveryProcessStatus'; oaIds: string[] }
  | { action: 'reMatchNotice'; oaIds: string[] }
  | { action: 'updateProcessStatus'; oaIds: string[] }
  | { action: 'changeNolaiuto'; oaIds: string[]; value: '1' | '0' }
  | { action: 'updateCaseName'; oaIds: string[] }
  | { action: 'recoveryStatusAnalyse'; oaIds: string[] }
  | { action: 'mailCustomer'; oaIds: string[]; mailStyle: '1' | '2' | '3' }
  | { action: 'getNoticeDetail'; oaId: string; ctrlProcId?: string }
  | {
      action: 'saveNoticeDetail'
      oaId: string
      importId: string
      oaDate: string
      oaTypeId: string
      caseId: string
      issueNo?: string
      issueDate?: string
      certificateNo?: string
    }
  | { action: 'updateHandExcel'; docNos: string[] }
  | { action: 'deleteDownloadOa'; fids: string[] }
  | { action: 'checkCpcUserStatus'; accountId: string }
  | { action: 'getCpcTzsUser' }
  | {
      action: 'fetchTzsList'
      account: string
      accountLabel?: string
      casename?: string
      appno?: string
      startTime?: string
      endTime?: string
      status?: string
    }
  | {
      action: 'downloadTzsList'
      account: string
      accountLabel?: string
      fids?: string[]
      xlh?: string[]
      casename?: string
      appno?: string
      startTime?: string
      endTime?: string
      status?: string
      isReplay?: boolean
    }
  | {
      action: 'fetchCertList'
      account: string
      accountLabel?: string
      casename?: string
      appno?: string
      startTime?: string
      endTime?: string
      status?: string
      xlh?: string
    }
  | {
      action: 'downloadCertList'
      account: string
      accountLabel?: string
      fids?: string[]
      xlh?: string[]
    }
  | { action: 'getUploadProcessList'; pageIndex?: number; pageSize?: number }
  | { action: 'uploadCpcZip'; kind: 'cpc' | 'gf'; fileName: string; mimeType: string; base64: string }
  | { action: 'openEasyNoticeTab' }

export interface NoticeActionResult {
  ok: boolean
  message: string
  needCpcLogin?: boolean
  loginAccountId?: string
  detail?: Record<string, unknown>
  detailFees?: Record<string, unknown>[]
  detailHebo?: Record<string, unknown>[]
  detailDuibi?: Record<string, unknown>[]
  checkWarnings?: string[]
  isErrorFee?: boolean
  statusRows?: Record<string, unknown>[]
  uploadProcessRows?: NoticeUploadProcessRow[]
  counts?: {
    handCount?: number
    nolaiutoCount?: number
  }
}

export type NoticeExportTab = 'import' | 'download' | 'cert' | 'replay'

export type NoticeExportRequest =
  | { tab: 'import'; query: NoticeImportQuery; columns?: Array<{ value: string; text: string }>; timeoutMs?: number }
  | { tab: 'download'; query: NoticeDownloadQuery; columns?: Array<{ value: string; text: string }>; timeoutMs?: number }
  | { tab: 'cert'; query: NoticeCertQuery; columns?: Array<{ value: string; text: string }>; timeoutMs?: number }
  | { tab: 'replay'; query: NoticeReplayQuery; columns?: Array<{ value: string; text: string }>; timeoutMs?: number }

export type NoticeExportStatus =
  | 'requested'
  | 'server_queued'
  | 'file_ready'
  | 'download_started'
  | 'downloading'
  | 'download_completed'
  | 'download_interrupted'
  | 'failed'
  | 'unknown'

export interface NoticeExportResult {
  status?: NoticeExportStatus
  async: boolean
  fileGuid?: string
  fileSize?: number | null
  downloadId?: number
  message: string
}

export interface NoticeExcelUploadRequest {
  fileName: string
  mimeType: string
  base64: string
}

export interface NoticeExcelUploadResult {
  ok: boolean
  message: string
}
