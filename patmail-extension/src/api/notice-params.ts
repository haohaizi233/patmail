import { buildExportColumnsXml, type FeeExportGroup } from './fee-export'
import type { EasyOperation } from './transport'
import type {
  NoticeCertQuery,
  NoticeDownloadQuery,
  NoticeExportRequest,
  NoticeExportTab,
  NoticeHandExcelQuery,
  NoticeHandHisQuery,
  NoticeHandQuery,
  NoticeImportQuery,
  NoticeNolaiutoQuery,
  NoticeReplayQuery,
  NoticeRow,
  NoticeSearchRequest,
  NoticeTabId
} from './notice-types'

export const PATENT_CASE_TYPE_ID = '31D1A147-2931-43B5-94AE-B72B1525BA8A'
export const OFFICIAL_NOTICE_FILE_TYPE_ID = '81802CDE-D39D-4658-B45E-74631B0715C1'

export interface NoticeTabSpec {
  id: NoticeTabId
  label: string
  description: string
}

export const NOTICE_TABS: readonly NoticeTabSpec[] = [
  { id: 'import', label: '导入来文', description: '查询未处理/已完成来文，支持导入系统、匹配、标记无需导入与导出。' },
  { id: 'download', label: '来文下载', description: '从 CPC 接口获取并解析下载待处理电子官文。' },
  { id: 'cert', label: '专利电子证书下载', description: '获取 CPC 电子证书清单并下载解析证书。' },
  { id: 'replay', label: '来文二次下载', description: '从 CPC 云端重新勾选分析下载电子官文与导出核对清单。' },
  { id: 'hand', label: '异常来文', description: '查看分析异常或无法匹配的来文并更新处理状态。' },
  { id: 'handHis', label: '异常处理记录', description: '查看已手工处理的异常来文记录，支持恢复未处理或返还重新分析。' },
  { id: 'nolaiuto', label: '无需导入来文', description: '查看已排除导入的来文并支持恢复到导入来文队列。' },
  { id: 'handExcel', label: '电子申请清单对比', description: '上传官方电子申请清单 Excel，对比下载、导入与处理状态。' }
] as const

export const NOTICE_STATUS_OPTIONS = [
  { value: '0', label: '未处理' },
  { value: '1', label: '已完成' }
] as const

export const NOTICE_ORDERBY_OPTIONS = [
  { value: 'FaWenRQ', label: '官方发文日' },
  { value: 'oa_name', label: '来文类型' },
  { value: 'customer_name', label: '客户名称' },
  { value: 'ShenQingH', label: '申请号' }
] as const

export const NOTICE_YES_NO_OPTIONS = [
  { value: '', label: '请选择' },
  { value: '1', label: '是' },
  { value: '0', label: '否' }
] as const

export const NOTICE_UNGET_STATUS_OPTIONS = [
  { value: '', label: '请选择' },
  { value: 'unprocess', label: '未解析' },
  { value: 'process', label: '已解析' }
] as const

export const NOTICE_CERT_STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: '1', label: 'CPC官方-待下载' },
  { value: '2', label: 'CPC官方-解析失败' },
  { value: '3', label: 'CPC官方-解析成功' },
  { value: '4', label: '唯德系统-已下载未导入' },
  { value: '5', label: '唯德系统-导入失败' },
  { value: '6', label: '唯德系统-导入成功' }
] as const

export const NOTICE_REPLAY_APPLY_TYPE_OPTIONS = [
  { value: '', label: '请选择' },
  { value: '1', label: '国家申请' },
  { value: '2', label: 'PCT国际阶段' },
  { value: '3', label: '外观海牙' }
] as const

export const NOTICE_EXCEL_IMPORT_OPTIONS = [
  { value: '', label: '全部' },
  { value: '1', label: '是' },
  { value: '0', label: '否' }
] as const

export const NOTICE_EXCEL_DOWNLOAD_OPTIONS = [
  { value: '', label: '全部' },
  { value: '已下载', label: '已下载' },
  { value: '待下载', label: '待下载' }
] as const

export const NOTICE_EXCEL_HANDLE_OPTIONS = [
  { value: '', label: '全部' },
  { value: '1', label: '已处理' },
  { value: '0', label: '未处理' }
] as const

export const NOTICE_MAIL_STYLE_OPTIONS = [
  { value: '1', label: '同客户合并发文' },
  { value: '2', label: '同客户同类型合并发文' },
  { value: '3', label: '单个来文发文' }
] as const

export interface NoticeTableColumn {
  key: string
  label: string
  width?: string
  clickable?: boolean
  clickableAppNo?: boolean
}

export const NOTICE_IMPORT_COMPLETED_COLUMNS: readonly NoticeTableColumn[] = [
  { key: 'sn', label: '序号', width: '56px' },
  { key: 'oa_name', label: '来文名称', width: '160px', clickable: true },
  { key: 'oa_code', label: '来文编号', width: '96px' },
  { key: 'FaWenRQ', label: '官方发文日', width: '108px' },
  { key: 'assayer', label: '分析人', width: '80px' },
  { key: 'customer_name', label: '客户名称', width: '160px' },
  { key: 'ShenQingH', label: '申请号', width: '140px' },
  { key: 'case_volume', label: '我方文号', width: '130px' },
  { key: 'FaMingMC', label: '案件名称', width: '200px' },
  { key: 'customer_status', label: '客户状态', width: '96px' }
] as const

const NOTICE_IMPORT_FIELD_ALIASES: Record<string, readonly string[]> = {
  case_name: ['case_name', 'FaMingMC'],
  applicant_name: ['applicant_name', 'applicant_name_cn', 'first_applicant_name'],
  case_status: ['case_status', 'case_status_zh_cn'],
  customer_name: ['customer_name']
}

function isBlankNoticeCell(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

/** 导入来文列表按别名顺序回退取值，兼容 EASY 不同接口字段名。 */
export function noticeCellRaw(tab: string, row: Record<string, unknown>, key: string): unknown {
  if (tab !== 'import') return row[key]
  const aliases = NOTICE_IMPORT_FIELD_ALIASES[key]
  if (!aliases) return row[key]
  for (const alias of aliases) {
    if (!isBlankNoticeCell(row[alias])) return row[alias]
  }
  return row[key]
}

export const NOTICE_TABLE_COLUMNS: Record<NoticeTabId, readonly NoticeTableColumn[]> = {
  import: [
    { key: 'oa_name', label: '来文名称', width: '120px', clickable: true },
    { key: 'file_desc_code', label: '来文编号', width: '86px' },
    { key: 'FaWenRQ', label: '官方发文日', width: '82px' },
    { key: 'customer_name', label: '客户名称', width: '108px' },
    { key: 'assayer', label: '分析人', width: '56px' },
    { key: 'ShenQingH', label: '申请号', width: '130px' },
    { key: 'case_volume', label: '我方文号', width: '106px' },
    { key: 'case_name', label: '案件名称', width: '144px' },
    { key: 'case_status', label: '案件状态', width: '62px' },
    { key: 'applicant_name', label: '申请人', width: '138px' },
    { key: 'pic', label: '处理人', width: '56px' },
    { key: 'sales_user', label: '业务人员', width: '62px' },
    { key: 'remark', label: '案件备注', width: '96px' }
  ],
  download: [
    { key: 'sn', label: '序号', width: '56px' },
    { key: 'oa_name', label: '来文名称' },
    { key: 'oa_code', label: '来文编号', width: '100px' },
    { key: 'FaWenRQ', label: '官方发文日', width: '110px' },
    { key: 'fawenxlh', label: '发文序列号', width: '150px' },
    { key: 'ShenQingH', label: '申请号', width: '140px', clickableAppNo: true },
    { key: 'case_name', label: '案件名称' },
    { key: 'user_name', label: '账号', width: '120px' },
    { key: 'status', label: '下载状态', width: '110px' },
    { key: 'download_time', label: '下载时间', width: '140px' },
    { key: 'remark', label: '备注' }
  ],
  cert: [
    { key: 'sn', label: '序号', width: '56px' },
    { key: 'zhuanlisqh', label: '申请号', width: '140px', clickableAppNo: true },
    { key: 'certName', label: '证书名称' },
    { key: 'zhuanlimc', label: '发明名称' },
    { key: 'gonggaoDate', label: '授权公告日', width: '110px' },
    { key: 'gonggaoh', label: '授权公告号', width: '130px' },
    { key: 'zhuanliqr', label: '专利权人' },
    { key: 'fawenxlh', label: '发文序列号', width: '150px' },
    { key: 'fawenDate', label: '发文日期', width: '110px' },
    { key: 'user_name', label: '账号', width: '120px' },
    { key: 'status', label: '状态', width: '110px' },
    { key: 'remark', label: '备注' }
  ],
  replay: [
    { key: 'sn', label: '序号', width: '56px' },
    { key: 'tongzhismc', label: '来文名称' },
    { key: 'fawenxlh', label: '发文序列号', width: '150px' },
    { key: 'dianzifwrq', label: '官方发文日', width: '110px' },
    { key: 'cnApplicationnumber', label: '申请号', width: '140px' },
    { key: 'famingczmc', label: '发明创造名称' },
    { key: 'account', label: '账号', width: '120px' },
    { key: 'status', label: '状态', width: '110px' },
    { key: 'remark', label: '备注' }
  ],
  hand: [
    { key: 'sn', label: '序号', width: '56px' },
    { key: 'oa_name', label: '来文名称', clickable: true },
    { key: 'oa_code', label: '来文编号', width: '100px' },
    { key: 'FaWenRQ', label: '官方发文日', width: '110px' },
    { key: 'customer_name', label: '客户名称' },
    { key: 'ShenQingH', label: '申请号', width: '140px', clickableAppNo: true },
    { key: 'case_volume', label: '我方文号', width: '130px' },
    { key: 'case_name', label: '案件名称' },
    { key: 'customer_status', label: '客户状态', width: '96px' },
    { key: 'assayer', label: '分析人', width: '84px' },
    { key: 'oa_error_msg', label: '异常原因' }
  ],
  handHis: [
    { key: 'sn', label: '序号', width: '56px' },
    { key: 'oa_name', label: '来文名称', clickable: true },
    { key: 'FaWenRQ', label: '官方发文日', width: '110px' },
    { key: 'customer_name', label: '客户名称' },
    { key: 'ShenQingH', label: '申请号', width: '140px' },
    { key: 'case_volume', label: '我方文号', width: '130px' },
    { key: 'case_name', label: '案件名称' },
    { key: 'cn_name', label: '处理人', width: '84px' },
    { key: 'update_time', label: '处理时间', width: '140px' },
    { key: 'customer_status', label: '客户状态', width: '96px' }
  ],
  nolaiuto: [
    { key: 'sn', label: '序号', width: '56px' },
    { key: 'oa_name', label: '来文名称', clickable: true },
    { key: 'FaWenRQ', label: '官方发文日', width: '110px' },
    { key: 'customer_name', label: '客户名称' },
    { key: 'ShenQingH', label: '申请号', width: '140px' },
    { key: 'case_volume', label: '我方文号', width: '130px' },
    { key: 'case_name', label: '案件名称' },
    { key: 'cn_name', label: '处理人', width: '84px' },
    { key: 'update_time', label: '处理时间', width: '140px' }
  ],
  handExcel: [
    { key: 'sn', label: '序号', width: '56px' },
    { key: 'app_no', label: '申请号/不受理编号', width: '150px' },
    { key: 'notice_name', label: '通知书名称' },
    { key: 'case_name', label: '发明创造名称' },
    { key: 'doc_no', label: '发文序列号', width: '150px' },
    { key: 'doc_date', label: '电子发文日', width: '110px' },
    { key: 'upload_status', label: '下载状态', width: '100px' },
    { key: 'doc_identity', label: '电子证书', width: '110px' },
    { key: 'is_handle', label: '是否处理', width: '90px' }
  ]
}

export const NOTICE_DEFAULT_EXPORT_COLUMNS: Record<NoticeExportTab, Array<{ value: string; text: string }>> = {
  import: [
    { value: 'case_volume', text: '我方文号' },
    { value: 'case_volume_customer', text: '客户文号' },
    { value: 'case_name', text: '案件名称' },
    { value: 'ShenQingH', text: '申请号' },
    { value: 'app_date', text: '申请日' },
    { value: 'Examiner', text: '审查员' },
    { value: 'ExaminerTel', text: '审查员电话' },
    { value: 'ExaminerDept', text: '审查部门' },
    { value: 'customer_name', text: '客户名称' },
    { value: 'customer_code', text: '客户代码' },
    { value: 'assayer', text: '分析人' },
    { value: 'customer_status', text: '客户状态' },
    { value: 'sales', text: '业务员' },
    { value: 'sales_help', text: '业务助理' },
    { value: 'introducer', text: '外部案源人' },
    { value: 'sales_in_depts', text: '业务人员部门' },
    { value: 'app_area_name', text: '行政区划' },
    { value: 'upload_time', text: '导入日期' },
    { value: 'XiaZaiRQ', text: '下载日期' },
    { value: 'pic', text: '处理人' },
    { value: 'sales_user', text: '业务人员' },
    { value: 'is_speed_checkd', text: '是否优先审查' },
    { value: 'hearing_the_case', text: '是否预审案件' },
    { value: 'remark', text: '案件备注' },
    { value: 'apply_tags', text: '专利标签' },
    { value: 'case_status_zh_cn', text: '案件状态' },
    { value: 'oa_name', text: '来文名称' },
    { value: 'oa_code', text: '来文编号' },
    { value: 'notice_content', text: '来文备注' },
    { value: 'FaWenRQ', text: '官方发文日' },
    { value: 'FaWenXLH', text: '发文序列号' },
    { value: 'applicant_name_cn', text: '申请人' },
    { value: 'contract_no', text: '合同编号' }
  ],
  download: [
    { value: 'oa_name', text: '来文名称' },
    { value: 'oa_code', text: '来文编号' },
    { value: 'FaWenRQ', text: '官方发文日' },
    { value: 'fawenxlh', text: '发文序列号' },
    { value: 'ShenQingH', text: '申请号' },
    { value: 'case_name', text: '案件名称' },
    { value: 'user_name', text: '下载账号' },
    { value: 'download_time', text: '下载时间' }
  ],
  cert: [
    { value: 'zhuanlisqh', text: '申请号' },
    { value: 'certName', text: '证书名称' },
    { value: 'zhuanlimc', text: '发明名称' },
    { value: 'gonggaoDate', text: '授权公告日' },
    { value: 'gonggaoh', text: '授权公告号' },
    { value: 'zhuanliqr', text: '专利权人' },
    { value: 'fawenxlh', text: '发文序列号' },
    { value: 'fawenDate', text: '发文日期' },
    { value: 'status', text: '状态' }
  ],
  replay: [
    { value: 'tongzhismc', text: '来文名称' },
    { value: 'fawenxlh', text: '发文序列号' },
    { value: 'dianzifwrq', text: '官方发文日' },
    { value: 'cnApplicationnumber', text: '申请号' },
    { value: 'famingczmc', text: '发明创造名称' },
    { value: 'account', text: '账户' },
    { value: 'status', text: '是否导入系统' }
  ]
}

export type NoticeExportGroup = FeeExportGroup

/** 按原站 notice.js (ExportExcel / GetCPCCertListExport / ExportCPCReplayTzsList / ExportTzsList) 严格构造分组导出栏位 */
export function buildNoticeExportGroups(tab: NoticeExportTab, importQuery?: NoticeImportQuery): NoticeExportGroup[] {
  switch (tab) {
    case 'import': {
      const caseCols = [
        { value: 'case_volume', text: '我方文号' },
        { value: 'case_volume_customer', text: '客户文号' },
        { value: 'case_name', text: '案件名称' },
        { value: 'ShenQingH', text: '申请号' },
        { value: 'app_date', text: '申请日' },
        { value: 'Examiner', text: '审查员' },
        { value: 'ExaminerTel', text: '审查员电话' },
        { value: 'ExaminerDept', text: '审查部门' },
        { value: 'customer_name', text: '客户名称' },
        { value: 'customer_code', text: '客户代码' },
        { value: 'assayer', text: '分析人' },
        { value: 'customer_status', text: '客户状态' },
        { value: 'sales', text: '业务员' },
        { value: 'sales_help', text: '业务助理' },
        { value: 'introducer', text: '外部案源人' },
        { value: 'sales_in_depts', text: '业务人员部门' },
        { value: 'app_area_name', text: '行政区划' },
        { value: 'upload_time', text: '导入日期' },
        { value: 'XiaZaiRQ', text: '下载日期' },
        { value: 'pic', text: '处理人' },
        { value: 'sales_user', text: '业务人员' },
        { value: 'is_speed_checkd', text: '是否优先审查' },
        { value: 'hearing_the_case', text: '是否预审案件' },
        { value: 'remark', text: '案件备注' },
        { value: 'apply_tags', text: '专利标签' },
        ...(importQuery?.agency_id.trim() ? [{ value: 'agency_id', text: '代理机构' }] : []),
        ...(importQuery?.apply_type.trim() ? [{ value: 'apply_type', text: '申请类型' }] : []),
        ...(importQuery?.flow_direction.trim() ? [{ value: 'flow_direction', text: '案件流向' }] : []),
        { value: 'case_status_zh_cn', text: '案件状态' },
        { value: 'contract_no', text: '合同编号' }
      ]
      const fileCols = [
        { value: 'oa_name', text: '来文名称' },
        { value: 'oa_code', text: '来文编号' },
        { value: 'notice_content', text: '来文备注' },
        { value: 'FaWenRQ', text: '官方发文日' },
        { value: 'FaWenXLH', text: '发文序列号' }
      ]
      const biblioCols = [{ value: 'applicant_name_cn', text: '申请人' }]
      return [
        { id: 'case', title: '案件信息', columns: caseCols },
        { id: 'file', title: '文件信息', columns: fileCols },
        { id: 'biblio', title: '著录项目', columns: biblioCols }
      ]
    }
    case 'download':
      return [{ id: 'notice', title: '来文信息', columns: [...NOTICE_DEFAULT_EXPORT_COLUMNS.download] }]
    case 'cert':
      return [{ id: 'cert', title: '证书信息', columns: [...NOTICE_DEFAULT_EXPORT_COLUMNS.cert] }]
    case 'replay':
      return [{ id: 'replay', title: '来文信息', columns: [...NOTICE_DEFAULT_EXPORT_COLUMNS.replay] }]
  }
}

export function createDefaultNoticeImportQuery(): NoticeImportQuery {
  return {
    case_volume: '',
    is_fuzzy_query_case_volume: false,
    post_date_s: '',
    post_date_e: '',
    filedesc: '',
    status: '0',
    customer_name: '',
    customer_code: '',
    introducer: '',
    sales_help: '',
    applicant_name: '',
    apply_type: '',
    orderby: 'FaWenRQ',
    agency_id: '',
    app_no: '',
    flow_direction: '',
    assayer: '',
    xiazairq_s: '',
    xiazairq_e: '',
    app_area_name: '',
    branch_dept_id: '',
    is_speed_checkd: '',
    customer_country: '',
    apply_tags_id: '',
    hearing_the_case: '',
    is_hz_interfice: false,
    files_is_case: '',
    update_time_s: '',
    update_time_e: '',
    update_time_shmm: '',
    update_time_ehmm: '',
    pageIndex: 1,
    pageSize: 50
  }
}

export function createDefaultNoticeDownloadQuery(defaultStart = ''): NoticeDownloadQuery {
  return {
    account: '',
    casename: '',
    appno: '',
    startTime: defaultStart,
    endTime: '',
    status: 'unprocess',
    pageIndex: 1,
    pageSize: 50
  }
}

export function createDefaultNoticeCertQuery(): NoticeCertQuery {
  return {
    account: '',
    casename: '',
    appno: '',
    startTime: '',
    endTime: '',
    status: '1',
    xlh: '',
    pageIndex: 1,
    pageSize: 50
  }
}

export function createDefaultNoticeReplayQuery(defaultAccount = ''): NoticeReplayQuery {
  return {
    account: defaultAccount,
    applyType: '',
    applyNo: '',
    caseName: '',
    noticeName: '',
    xlh: '',
    startTime: '',
    endTime: '',
    pageIndex: 1,
    pageSize: 50
  }
}

export function createDefaultNoticeHandQuery(): NoticeHandQuery {
  return { assayer: '', keyword: '', pageIndex: 1, pageSize: 50 }
}

export function createDefaultNoticeHandHisQuery(): NoticeHandHisQuery {
  return { assayer: '', keyword: '', pageIndex: 1, pageSize: 50 }
}

export function createDefaultNoticeNolaiutoQuery(): NoticeNolaiutoQuery {
  return { keyword: '', pageIndex: 1, pageSize: 50 }
}

export function createDefaultNoticeHandExcelQuery(): NoticeHandExcelQuery {
  return { is_import: '', is_download: '', is_handle: '', pageIndex: 1, pageSize: 50 }
}

function appendImportFilterParams(params: URLSearchParams, q: NoticeImportQuery): void {
  params.set('case_volume', q.case_volume.trim())
  params.set('is_fuzzy_query_case_volume', q.is_fuzzy_query_case_volume ? 'true' : 'false')
  params.set('post_date_s', q.post_date_s.trim())
  params.set('post_date_e', q.post_date_e.trim())
  params.set('filedesc', q.filedesc.trim())
  params.set('status', q.status)
  params.set('customer_name', q.customer_name.trim())
  params.set('customer_code', q.customer_code.trim())
  params.set('introducer', q.introducer.trim())
  params.set('sales_help', q.sales_help.trim())
  params.set('applicant_name', q.applicant_name.trim())
  params.set('apply_type', q.apply_type.trim())
  params.set('orderby', q.orderby || 'FaWenRQ')
  params.set('agency_id', q.agency_id.trim())
  params.set('app_no', q.app_no.trim())
  params.set('flow_direction', q.flow_direction.trim())
  params.set('assayer', q.assayer.trim())
  params.set('xiazairq_s', q.xiazairq_s.trim())
  params.set('xiazairq_e', q.xiazairq_e.trim())
  params.set('app_area_name', q.app_area_name.trim())
  params.set('branch_dept_id', q.branch_dept_id.trim())
  params.set('is_speed_checkd', q.is_speed_checkd)
  params.set('customer_country', q.customer_country.trim())
  params.set('apply_tags_id', q.apply_tags_id.trim())
  params.set('hearing_the_case', q.hearing_the_case)
  params.set('is_hz_interfice', q.is_hz_interfice ? '1' : '')
  params.set('files_is_case', q.files_is_case)
  params.set('update_time_s', q.update_time_s.trim())
  params.set('update_time_e', q.update_time_e.trim())
  params.set('update_time_shmm', q.update_time_shmm.trim())
  params.set('update_time_ehmm', q.update_time_ehmm.trim())
}

function clampPage(pageIndex: number, pageSize: number): { pageIndex: string; pageSize: string } {
  const index = Number.isFinite(pageIndex) && pageIndex >= 1 ? Math.floor(pageIndex) : 1
  const size = Number.isFinite(pageSize) && pageSize >= 1 ? Math.min(200, Math.floor(pageSize)) : 50
  return { pageIndex: String(index), pageSize: String(size) }
}

export function buildNoticeSearchPayload(request: NoticeSearchRequest): {
  operation: EasyOperation
  params: URLSearchParams
} {
  const params = new URLSearchParams()
  const { pageIndex, pageSize } = clampPage(request.query.pageIndex, request.query.pageSize)
  params.set('pageIndex', pageIndex)
  params.set('pageSize', pageSize)

  switch (request.tab) {
    case 'import': {
      const completed = request.query.status === '1'
      const call = completed ? 'GetImportNoticeList' : 'SearchNotice'
      const operation: EasyOperation = completed ? 'noticeImportList' : 'noticeSearch'
      params.set('Call', call)
      appendImportFilterParams(params, request.query)
      params.set('log_pagename', 'NoticeInfo.aspx')
      return { operation, params }
    }
    case 'download': {
      const q = request.query
      params.set('Call', 'GetUnProcessTzsList')
      params.set('account', q.account.trim())
      params.set('casename', q.casename.trim())
      params.set('appno', q.appno.trim())
      params.set('startTime', q.startTime.trim())
      params.set('endTime', q.endTime.trim())
      params.set('status', q.status)
      return { operation: 'noticeUnProcessTzsList', params }
    }
    case 'cert': {
      const q = request.query
      params.set('Call', 'GetCertList')
      params.set('account', q.account.trim())
      params.set('casename', q.casename.trim())
      params.set('appno', q.appno.trim())
      params.set('startTime', q.startTime.trim())
      params.set('endTime', q.endTime.trim())
      params.set('status', q.status)
      params.set('xlh', q.xlh.trim())
      return { operation: 'noticeCertList', params }
    }
    case 'replay': {
      const q = request.query
      params.set('Call', 'GetReplayTzsList')
      params.set('account', q.account.trim())
      params.set('applyType', q.applyType)
      params.set('applyNo', q.applyNo.trim())
      params.set('caseName', q.caseName.trim())
      params.set('noticeName', q.noticeName.trim())
      params.set('xlh', q.xlh.trim())
      params.set('startTime', q.startTime.trim())
      params.set('endTime', q.endTime.trim())
      return { operation: 'noticeReplayTzsList', params }
    }
    case 'hand': {
      params.set('Call', 'GetHandNoticeList')
      params.set('assayer', request.query.assayer.trim())
      params.set('log_pagename', 'NoticeInfo.aspx')
      return { operation: 'noticeHandList', params }
    }
    case 'handHis': {
      params.set('Call', 'GetHandHisList')
      params.set('assayer', request.query.assayer.trim())
      params.set('log_pagename', 'NoticeInfo.aspx')
      return { operation: 'noticeHandHisList', params }
    }
    case 'nolaiuto': {
      params.set('Call', 'GetNolaiuto')
      params.set('log_pagename', 'NoticeInfo.aspx')
      return { operation: 'noticeNolaiutoList', params }
    }
    case 'handExcel': {
      const q = request.query
      params.set('Call', 'GethandExcelList')
      params.set('is_import', q.is_import)
      params.set('is_download', q.is_download)
      params.set('is_handle', q.is_handle)
      params.set('log_pagename', 'NoticeInfo.aspx')
      return { operation: 'noticeHandExcelList', params }
    }
  }
}

export function buildNoticeExportPayload(request: NoticeExportRequest): {
  operation: EasyOperation
  params: URLSearchParams
} {
  const params = new URLSearchParams()
  const baseColumns = request.columns?.length ? request.columns : [...NOTICE_DEFAULT_EXPORT_COLUMNS[request.tab]]
  let columns = baseColumns
  let operation: EasyOperation

  switch (request.tab) {
    case 'import': {
      operation = 'noticeExportReport'
      params.set('Call', 'ReportNoticeExcel')
      appendImportFilterParams(params, request.query)
      if (!request.columns?.length) {
        const extra = [...baseColumns]
        if (request.query.agency_id.trim()) extra.push({ value: 'agency_id', text: '代理机构' })
        if (request.query.apply_type.trim()) extra.push({ value: 'apply_type', text: '申请类型' })
        if (request.query.flow_direction.trim()) extra.push({ value: 'flow_direction', text: '案件流向' })
        columns = extra
      }
      break
    }
    case 'download': {
      operation = 'noticeExportTzs'
      const q = request.query
      params.set('Call', 'ExportExcelTzsList')
      params.set('account', q.account.trim())
      params.set('casename', q.casename.trim())
      params.set('appno', q.appno.trim())
      params.set('startTime', q.startTime.trim())
      params.set('endTime', q.endTime.trim())
      params.set('status', q.status)
      break
    }
    case 'cert': {
      operation = 'noticeExportCert'
      const q = request.query
      params.set('Call', 'GetCertListExport')
      params.set('account', q.account.trim())
      params.set('casename', q.casename.trim())
      params.set('appno', q.appno.trim())
      params.set('startTime', q.startTime.trim())
      params.set('endTime', q.endTime.trim())
      params.set('status', q.status)
      params.set('xlh', q.xlh.trim())
      break
    }
    case 'replay': {
      operation = 'noticeExportReplay'
      const q = request.query
      params.set('Call', 'ExportExcelTwoTzsList')
      params.set('account', q.account.trim())
      params.set('applyType', q.applyType)
      params.set('applyNo', q.applyNo.trim())
      params.set('caseName', q.caseName.trim())
      params.set('noticeName', q.noticeName.trim())
      params.set('xlh', q.xlh.trim())
      params.set('startTime', q.startTime.trim())
      params.set('endTime', q.endTime.trim())
      break
    }
  }

  params.set('e_coulums', buildExportColumnsXml(columns))
  params.set('log_pagename', 'IhgAdvExport.aspx')
  return { operation, params }
}

const KEYWORD_SEARCH_FIELDS = [
  'oa_name',
  'oa_code',
  'file_desc_code',
  'ShenQingH',
  'cn_applicationnumber',
  'case_volume',
  'customer_name',
  'case_name',
  'FaMingMC',
  'assayer',
  'cn_name',
  'TongZhiShuBH',
  'fawenxlh',
  'file_name',
  'oa_error_msg'
] as const

/** 异常来文 / 异常处理记录 / 无需导入来文 快捷关键字本地过滤（对齐原站 #ErrorNoticeInput / #ErrorInput / #NOInput）。 */
export function filterNoticeRowsByKeyword(rows: readonly NoticeRow[], keyword: string): NoticeRow[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return [...rows]
  return rows.filter(row =>
    KEYWORD_SEARCH_FIELDS.some(field => {
      const val = row[field]
      return (typeof val === 'string' || typeof val === 'number') && String(val).toLowerCase().includes(kw)
    })
  )
}

export interface NoticeStatusBadge {
  text: string
  tone: 'ok' | 'warn' | 'fail' | ''
}

/** 对齐 notice.js Notice.ProcessStatus(status, remark) */
export function formatDownloadProcessStatus(status: unknown, remark?: unknown): NoticeStatusBadge {
  const s = typeof status === 'string' ? status.trim() : ''
  const r = typeof remark === 'string' ? remark.trim() : ''
  switch (s) {
    case 'download fail':
      return { text: '通知书文件下载失败', tone: 'fail' }
    case 'processing':
      return { text: '处理中...', tone: 'warn' }
    case 'fail':
      return { text: r || '通知书解析失败', tone: 'fail' }
    case 'finish':
      return { text: '解析完成', tone: 'ok' }
    default:
      return { text: '待下载', tone: '' }
  }
}

/** 对齐 notice.js Notice.ProcessCertStatus(status, remark) */
export function formatCertProcessStatus(status: unknown, remark?: unknown): NoticeStatusBadge {
  const s = typeof status === 'string' || typeof status === 'number' ? String(status).trim() : ''
  const r = typeof remark === 'string' ? remark.trim() : ''
  switch (s) {
    case '1':
      return { text: '待下载', tone: 'warn' }
    case '2':
      return { text: '已下载', tone: 'ok' }
    case 'finish':
      return { text: '解析完成', tone: 'ok' }
    default:
      return { text: r || '状态异常', tone: 'fail' }
  }
}

export function noticeRowKey(tab: NoticeTabId, row: NoticeRow): string {
  if (tab === 'download' || tab === 'cert' || tab === 'replay') {
    const fid = typeof row.fid === 'string' ? row.fid.trim() : ''
    if (fid) return fid
  }
  if (tab === 'handExcel') {
    const docNo = typeof row.doc_no === 'string' ? row.doc_no.trim() : ''
    if (docNo) return docNo
  }
  const oaId = typeof row.oa_id === 'string' ? row.oa_id.trim() : ''
  if (oaId) return oaId
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  if (id) return id
  if (typeof row.sn === 'string') return row.sn.trim()
  if (typeof row.sn === 'number' && Number.isFinite(row.sn)) return String(row.sn)
  return ''
}
