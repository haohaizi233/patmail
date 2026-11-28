import type { PatentSearchQuery } from './patent-search-types'
import type { FeeSearchQuery } from './fee-search-params'

export const PATENT_EXPORT_WORKFLOW_ID = 'patent-list-export'

export type FeeExportMode = 'cond' | 'checked' | 'count'

export type FeeExportBelongKey = 'FeeSearch_ExportByCond' | 'FeeSearch_ExportCountByCond' | 'NoticeInfo' | 'ICSearch'

export interface FeeExportColumn {
  value: string
  text: string
  /** 默认是否勾选（对齐 FeeSearch.js：未写或 true 为默认勾选，false 为默认不勾选） */
  defaultChecked?: boolean
}

export interface FeeExportGroup {
  id: string
  title: string
  columns: FeeExportColumn[]
}

export interface FeeExportTemplate {
  typeId: string
  typeText: string
}

export interface FeeExportTemplateColumn {
  seq: number
  value: string
  text: string
}

export interface FeeExportConfigRequest {
  action: 'list' | 'detail' | 'add' | 'up' | 'del'
  belongKey: FeeExportBelongKey
  typeId?: string
  modelName?: string
  columns?: Array<{ value: string; text: string }>
}

export interface FeeExportConfigResponse {
  templates?: FeeExportTemplate[]
  columns?: FeeExportTemplateColumn[]
  message?: string
}

export type FeeExportRequest = {
  columns: Array<{ value: string; text: string }>
  timeoutMs?: number
} & ({ mode: FeeExportMode; query?: FeeSearchQuery; feeIds?: string[] }
  | { mode: 'patent'; query: PatentSearchQuery })

export type FeeExportStatus =
  | 'requested'
  | 'server_queued'
  | 'file_ready'
  | 'download_started'
  | 'downloading'
  | 'download_completed'
  | 'download_interrupted'
  | 'failed'
  | 'unknown'

export interface FeeExportResponse {
  status?: FeeExportStatus
  async: boolean
  fileGuid?: string
  fileSize?: number | null
  downloadId?: number
  message: string
}

export const TRADEMARK_CASE_TYPE_ID = '0E8A4B7F-E407-4EFF-9562-3809BF484207'

export function belongKeyForMode(mode: FeeExportMode): FeeExportBelongKey {
  return mode === 'count' ? 'FeeSearch_ExportCountByCond' : 'FeeSearch_ExportByCond'
}

export function exportTitleForMode(mode: FeeExportMode): string {
  if (mode === 'checked') return '导出勾选费用'
  if (mode === 'count') return '导出汇总数据'
  return '导出清单'
}

function escapeInnerText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 校验是否为合法安全的 XML 元素标签名（且排除原型污染键名） */
export function isValidXmlElementName(name: string): boolean {
  if (!name || name.length > 100) return false
  if (name === '__proto__' || name === 'prototype' || name === 'constructor') return false
  return /^[a-zA-Z_][a-zA-Z0-9_.-]*$/.test(name)
}

/** 清理并去重栏位列表 */
export function sanitizeExportColumns(columns: Array<{ value: string; text: string }>, keepRepeated = false): Array<{ value: string; text: string }> {
  const result: Array<{ value: string; text: string }> = []
  const seen = new Set<string>()
  for (const col of columns || []) {
    const value = (col.value || '').trim()
    const text = (col.text || '').trim()
    if (!value || !text || (!keepRepeated && seen.has(value))) continue
    if (!isValidXmlElementName(value)) continue
    seen.add(value)
    result.push({ value, text })
  }
  return result
}

/** 构造原站 IhgAdvExport.Submit 的 e_coulums 参数（实体编码 XML，绕过 ASP.NET 请求校验） */
export function buildExportColumnsXml(columns: Array<{ value: string; text: string }>, keepRepeated = false): string {
  const sanitized = sanitizeExportColumns(columns, keepRepeated)
  return sanitized
    .map(col => `&lt;${col.value}&gt;${escapeInnerText(col.text)}&lt;/${col.value}&gt;`)
    .join('')
}

/** 构造原站 IhgAdvExport.SaveOutItemModel / UpOutItemModel 的 element 参数 */
export function buildTemplateElementXml(columns: Array<{ value: string; text: string }>, keepRepeated = false): string {
  const sanitized = sanitizeExportColumns(columns, keepRepeated)
  return sanitized
    .map((col, idx) => (
      `&lt;item&gt;&lt;value&gt;${col.value}&lt;/value&gt;&lt;text&gt;${escapeInnerText(col.text)}&lt;/text&gt;&lt;sort&gt;${idx + 1}&lt;/sort&gt;&lt;/item&gt;`
    ))
    .join('')
}

/** 按原站 FeeSearch.js 严格构造三种导出模式的分组导出栏位（与 d.hiseeip.com 生产配置一致） */
export function buildFeeExportGroups(
  mode: FeeExportMode,
  options: { caseType?: string; fieldColumns?: Record<string, string> } = {}
): FeeExportGroup[] {
  const caseType = (options.caseType ?? '').trim()
  const includeTrademark = !caseType || caseType.toUpperCase() === TRADEMARK_CASE_TYPE_ID
  const fieldColumns = options.fieldColumns ?? {}

  if (mode === 'count') {
    const caseCols: FeeExportColumn[] = [
      { value: 'case_volume', text: '我方文号' },
      { value: 'case_status', text: '案件状态' },
      { value: 'case_name', text: '案件名称' },
      { value: 'case_volume_customer', text: '客户文号' },
      { value: 'issue_no', text: '注册号' },
      { value: 'app_no', text: '申请号' },
      { value: 'app_date', text: '申请日' },
      { value: 'filing_date', text: '新申请递交日' },
      { value: 'business_type', text: '业务类型' },
      { value: 'filing_type', text: '申请方式' },
      { value: 'sales', text: '业务员' },
      { value: 'country_id', text: '申请国家(地区)' },
      { value: 'sales_dept', text: '业务部门' },
      { value: 'create_time', text: '开卷日期' },
      { value: 'charge_date', text: '委案日期' },
      { value: 'apply_type', text: '申请类型' },
      { value: 'case_proc', text: '案件处理人' },
      { value: 'pct_app_no', text: 'PCT申请号' },
      { value: 'pct_app_date', text: 'PCT申请日' },
      { value: 'case_remark', text: '案件备注' },
      { value: 'ctrl_proc', text: '处理事项' },
      { value: 'ctrl_proc_case_status', text: '处理事项(含阶段)' },
      { value: 'finish_date', text: '处理事项完成日' },
      { value: 'review_stage', text: '缴年费阶段' },
      { value: 'IPR_contact', text: 'IPR联系人' },
      { value: 'dept_name', text: '所属分部' },
      { value: 'case_direction', text: '案件流向' },
      { value: 'proc_status', text: '处理事项状态' },
      { value: 'proc_remark', text: '处理事项备注' },
      { value: 'receipt_no', text: '收据号' },
      { value: 'technical_field', text: '技术领域' },
      { value: 'case_coefficient', text: '案件系数', defaultChecked: false },
      { value: 'related_volume_sa', text: '是否同日申请', defaultChecked: false },
      { value: 'related_case_volume', text: '同日申请案号', defaultChecked: false },
      { value: 'is_speed_checkd', text: '是否优先审查', defaultChecked: false },
      { value: 'hearing_the_case', text: '是否快速预审', defaultChecked: false },
      { value: 'contact_case', text: '案件联系人', defaultChecked: false },
      ...(includeTrademark ? [{ value: 'register_type_code', text: '商标类别' }] : []),
      { value: 'customer_name', text: '客户名称' },
      { value: 'customer_code', text: '客户代码' },
      { value: 'contact', text: '案件客户联系人' },
      { value: 'contact_email', text: '案件客户联系人邮箱' },
      { value: 'personal_email', text: '案件客户联系人私人邮箱' }
    ]
    const biblioCols: FeeExportColumn[] = [
      { value: 'agency_name', text: '代理机构名称' },
      { value: 'applicant_name', text: '申请人' }
    ]
    const feeCols: FeeExportColumn[] = [
      { value: 'o_amount', text: '官费' },
      { value: 'o_currency', text: '官费币别' },
      { value: 'a_amount', text: '代理费' },
      { value: 'a_currency', text: '代理费币别' },
      { value: 't_amount', text: '第三方费' },
      { value: 't_currency', text: '第三方费币别' },
      { value: 'total_oa_amount', text: '费用总计（官费+代理费）' },
      { value: 'total_oat_amount', text: '费用总计（官费+代理费+第三方费）' },
      { value: 'o_recieve_amount', text: '官费实收金额' },
      { value: 'o_recieve_currency', text: '官费实收币别' },
      { value: 'a_recieve_amount', text: '代理费实收金额' },
      { value: 'a_recieve_currency', text: '代理费实收币别' },
      { value: 'total_oa_recieve_amount', text: '实收金额总计（官费实收+代理费实收）' },
      { value: 'pay_type_text', text: '缴费类型' },
      { value: 'account_name', text: '收款公司账号' },
      { value: 'fee_remarks', text: '费用备注' },
      { value: 'update_log', text: '修改记录' },
      { value: 'pay_due_date', text: '缴费期限' },
      { value: 'pay_date', text: '实付日期' },
      { value: 'receive_date', text: '实收日期' },
      { value: 'create_date', text: '费用创建日期' },
      { value: 'fee_name', text: '费用名称' },
      { value: 'fee_desc', text: '费用描述' },
      { value: 'invoice_no', text: '发票号' },
      { value: 'coefficient', text: '数量' },
      { value: 'inventor', text: '发明人' },
      { value: 'fee_customer', text: '缴费抬头' },
      { value: 'bill_no', text: '缴费单号' },
      { value: 'all_fee_name', text: '年费费用全称' }
    ]
    return [
      { id: 'case', title: '案件信息', columns: caseCols },
      { id: 'biblio', title: '著录项目', columns: biblioCols },
      { id: 'fee', title: '费用信息', columns: feeCols }
    ]
  }

  if (mode === 'checked') {
    const customCols: FeeExportColumn[] = ['column_1', 'column_2', 'column_3'].map((key, idx) => ({
      value: key,
      text: fieldColumns[key] || `自定义栏位${idx + 1}`,
      defaultChecked: false
    }))
    return [
      {
        id: 'case',
        title: '案件信息',
        columns: [
          { value: 'case_volume', text: '我方文号' },
          { value: 'case_name', text: '案件名称' },
          { value: 'case_status', text: '案件状态' },
          { value: 'case_volume_customer', text: '客户文号' },
          { value: 'trade_img', text: '商标图样', defaultChecked: false },
          { value: 'product_name', text: '产品类别' },
          { value: 'sale_name', text: '业务人员' },
          { value: 'create_time', text: '开卷日期' },
          { value: 'charge_date', text: '委案日期' },
          { value: 'country', text: '国家(地区)' },
          { value: 'receipt_no', text: '收据号' },
          { value: 'contract_code', text: '合同号' },
          ...(includeTrademark ? [{ value: 'register_type_code', text: '商标类别' }] : []),
          { value: 'dept_name', text: '所属分部' },
          { value: 'business_type', text: '业务类型' },
          { value: 'case_direction', text: '案件流向' },
          { value: 'pic_dept', text: '案件处理人部门' },
          { value: 'apply_type', text: '申请类型' },
          { value: 'app_no', text: '申请号' },
          { value: 'app_date', text: '申请日' },
          { value: 'issue_no', text: '注册号' },
          { value: 'case_remark', text: '案件备注' },
          { value: 'is_ahead_pub', text: '是否提前公开', defaultChecked: false },
          { value: 'charge_dept_name', text: '案件承办部门' },
          { value: 'customer_name', text: '客户名称' },
          { value: 'customer_code', text: '客户代码' },
          { value: 'customer_status', text: '客户状态', defaultChecked: false },
          { value: 'contact', text: '案件客户联系人' },
          { value: 'case_coefficient', text: '案件系数', defaultChecked: false },
          { value: 'contact_mobile', text: '案件客户联系人电话' },
          { value: 'contact_email', text: '案件客户联系人邮箱' },
          { value: 'personal_email', text: '案件客户联系人私人邮箱' },
          { value: 'nickname', text: '客户昵称' },
          { value: 'related_volume_sa', text: '是否同日申请', defaultChecked: false },
          { value: 'related_case_volume', text: '同日申请案号', defaultChecked: false },
          { value: 'is_speed_checkd', text: '是否优先审查', defaultChecked: false },
          { value: 'hearing_the_case', text: '是否快速预审', defaultChecked: false },
          { value: 'contact_case', text: '案件联系人', defaultChecked: false }
        ]
      },
      {
        id: 'proc',
        title: '处理事项',
        columns: [
          { value: 'ctrl_proc', text: '处理事项' },
          { value: 'ctrl_proc_case_status', text: '处理事项(含阶段)' },
          { value: 'pic_name', text: '处理事项处理人' },
          { value: 'proc_remark', text: '事项备注' },
          { value: 'finish_date', text: '处理事项完成日' },
          { value: 'first_doc_date', text: '初稿日' },
          { value: 'int_doc_date', text: '内部定稿日' },
          { value: 'back_date', text: '返稿日' },
          { value: 'finish_doc_date', text: '定稿日' },
          { value: 'case_mail_date', text: '送合作所日' }
        ]
      },
      {
        id: 'biblio',
        title: '著录项目',
        columns: [
          { value: 'applicants', text: '申请人' },
          { value: 'agency_name', text: '代理机构' },
          { value: 'inventor', text: '发明人' }
        ]
      },
      {
        id: 'fee',
        title: '费用信息',
        columns: [
          { value: 'fee_class', text: '费用类型' },
          { value: 'fee_type', text: '费用名称' },
          { value: 'fee_desc', text: '费用描述' },
          { value: 'fee_desc_en', text: '费用描述英文' },
          { value: 'amount', text: '金额' },
          { value: 'currency_id', text: '币别' },
          { value: 'target_currency_id', text: '换算后币别' },
          { value: 'target_amount', text: '换算后金额' },
          { value: 'receive_due_date', text: '应收日期' },
          { value: 'request_date', text: '请款日期' },
          { value: 'receive_date', text: '实收日期' },
          { value: 'receive_amount', text: '实收/实付金额' },
          { value: 'receive_currency_id', text: '实收币别' },
          { value: 'pay_due_date', text: '缴费期限' },
          { value: 'fee_customer', text: '缴费抬头' },
          { value: 'pay_date', text: '实付日期' },
          { value: 'request_no', text: '请款单号' },
          { value: 'review_stage', text: '缴年费阶段' },
          { value: 'pay_type_text', text: '缴费类型' },
          { value: 'fee_rate', text: '汇率' },
          { value: 'discount_rate', text: '折扣率' },
          { value: 'fee_remarks', text: '费用备注' },
          { value: 'update_log', text: '修改记录' },
          { value: 'account_name', text: '收款公司账号' },
          { value: 'out_bill_no', text: '外方账单号' },
          { value: 'out_bill_date', text: '外方账单日期' },
          { value: 'create_date', text: '费用创建日期' },
          { value: 'invoice_no', text: '发票号' },
          { value: 'invoice_time', text: '开票日期' },
          { value: 'receive_status', text: '收款状态' },
          { value: 'bill_in_no', text: '收款单号' },
          { value: 'pay_status', text: '缴费状态' },
          { value: 'cancellation_date', text: '销账日期' },
          { value: 'request_remark', text: '请款单备注' },
          { value: 'coefficient', text: '数量' }
        ]
      },
      {
        id: 'ext',
        title: '扩展信息',
        columns: [
          { value: 'claim_number', text: '权利要求项数' },
          { value: 'spec_pages', text: '说明书页数' },
          { value: 'introducer', text: '外部案源人' },
          { value: 'inside_introducer', text: '内部案源人' },
          { value: 'filing_date', text: '新申请递交日' }
        ]
      },
      {
        id: 'custom',
        title: '自定义栏位',
        columns: customCols
      }
    ]
  }

  // Default: mode === 'cond' (FeeSearch.ExportByCond)
  const customKeys = Object.keys(fieldColumns).length
    ? Object.keys(fieldColumns).sort()
    : ['column_1', 'column_2', 'column_3', 'column_4', 'column_5']
  const customCols: FeeExportColumn[] = customKeys.map((key, idx) => ({
    value: key,
    text: fieldColumns[key] || `自定义栏位${idx + 1}`,
    defaultChecked: false
  }))

  return [
    {
      id: 'case',
      title: '案件信息',
      columns: [
        { value: 'case_volume', text: '我方文号' },
        { value: 'case_name', text: '案件名称' },
        { value: 'case_status', text: '案件状态' },
        { value: 'case_type', text: '案件类型' },
        { value: 'trade_img', text: '商标图样', defaultChecked: false },
        { value: 'apply_name', text: '提案名称', defaultChecked: false },
        { value: 'case_volume_customer', text: '客户文号' },
        { value: 'product_name', text: '产品类别' },
        { value: 'case_pic_name', text: '案件处理人' },
        { value: 'foreign_pic_case', text: '案件对外处理人' },
        { value: 'package_app', text: '同日申请', defaultChecked: false },
        { value: 'package_submit', text: '同日递交', defaultChecked: false },
        { value: 'is_essence_exam_text', text: '是否同时提实审' },
        { value: 'is_ahead_pub_text', text: '是否提前公布' },
        { value: 'is_fee_reduce_text', text: '是否请求费用减缓' },
        { value: 'is_speed_checkd_text', text: '是否优先审查' },
        { value: 'is_request_das_text', text: '是否同时请求DAS码' },
        { value: 'hearing_the_case_text', text: '是否预审案件' },
        { value: 'is_fast_services_case_text', text: '是否是快维案件', defaultChecked: false },
        { value: 'sale_name', text: '业务人员', defaultChecked: false },
        { value: 'sales_help', text: '业务助理', defaultChecked: false },
        { value: 'sales_dept', text: '业务部门', defaultChecked: false },
        { value: 'create_time', text: '开卷日期' },
        { value: 'charge_date', text: '委案日期' },
        { value: 'country', text: '国家(地区)' },
        { value: 'receipt_no', text: '收据号', defaultChecked: false },
        { value: 'receipt_piaoju_date', text: '收据开票日期', defaultChecked: false },
        { value: 'contract_code', text: '合同号' },
        { value: 'asst_office_case_no', text: '协办所案号' },
        { value: 'case_coefficient', text: '案件系数', defaultChecked: false },
        ...(includeTrademark ? [{ value: 'register_type_code', text: '商标类别' }] : []),
        { value: 'charge_dept_name', text: '案件承办部门' },
        { value: 'dept_name', text: '所属分部' },
        { value: 'business_type', text: '业务类型' },
        { value: 'case_direction', text: '案件流向' },
        { value: 'pic_dept', text: '案件处理人部门' },
        { value: 'apply_type', text: '申请类型' },
        { value: 'app_no', text: '申请号' },
        { value: 'app_date', text: '申请日' },
        { value: 'issue_no', text: includeTrademark ? '注册号/公告号' : '公告号' },
        { value: 'issue_date', text: '公告日' },
        { value: 'divisional_date', text: '新申请递交日' },
        { value: 'case_remark', text: '案件备注' },
        { value: 'is_ahead_pub', text: '是否提前公开', defaultChecked: false },
        { value: 'fee_reduce_grade', text: '费减比例', defaultChecked: false },
        { value: 'bill_no', text: '缴费单号', defaultChecked: false },
        { value: 'pct_app_no', text: 'PCT申请号', defaultChecked: false },
        { value: 'pct_app_date', text: 'PCT申请日', defaultChecked: false },
        { value: 'priority_date', text: '优先权日', defaultChecked: false },
        { value: 'customer_name', text: '客户名称' },
        { value: 'customer_from', text: '客户来源' },
        { value: 'nickname', text: '客户昵称' },
        { value: 'customer_code', text: '客户代码', defaultChecked: false },
        { value: 'customer_status', text: '客户状态', defaultChecked: false },
        { value: 'serial_no', text: '流水号', defaultChecked: false },
        { value: 'contact', text: '案件客户联系人' },
        { value: 'contact_mobile', text: '案件客户联系人电话' },
        { value: 'contact_email', text: '案件客户联系人邮箱' },
        { value: 'personal_email', text: '案件客户联系人私人邮箱', defaultChecked: false },
        { value: 'related_volume_sa', text: '是否同日申请', defaultChecked: false },
        { value: 'related_case_volume', text: '同日申请案号', defaultChecked: false },
        { value: 'is_speed_checkd', text: '是否优先审查', defaultChecked: false },
        { value: 'hearing_the_case', text: '是否快速预审', defaultChecked: false },
        { value: 'contact_case', text: '案件联系人', defaultChecked: false }
      ]
    },
    {
      id: 'proc',
      title: '处理事项',
      columns: [
        { value: 'ctrl_proc', text: '处理事项' },
        { value: 'ctrl_proc_case_status', text: '处理事项(含阶段)' },
        { value: 'pic_name', text: '处理事项处理人', defaultChecked: false },
        { value: 'proc_dept', text: '处理事项处理人部门', defaultChecked: false },
        { value: 'proc_remark', text: '事项备注' },
        { value: 'finish_date', text: '处理事项完成日' },
        { value: 'first_doc_date', text: '初稿日' },
        { value: 'int_doc_date', text: '内部定稿日' },
        { value: 'back_date', text: '返稿日' },
        { value: 'finish_doc_date', text: '定稿日' },
        { value: 'case_mail_date', text: '送合作所日' },
        { value: 'proc_status', text: '处理事项状态' },
        { value: 'legal_due_date', text: '官方期限' },
        { value: 'int_due_date', text: '内部期限' },
        { value: 'cus_due_date', text: '客户期限' },
        { value: 'payment_no', text: '付款单号' }
      ]
    },
    {
      id: 'biblio',
      title: '著录项目',
      columns: [
        { value: 'applicants', text: '申请人' },
        { value: 'agency_name', text: '代理机构' },
        { value: 'inventor', text: '发明人' }
      ]
    },
    {
      id: 'fee',
      title: '费用信息',
      columns: [
        { value: 'fee_class', text: '费用类型' },
        { value: 'fee_type', text: '费用名称' },
        { value: 'fee_desc', text: '费用描述' },
        { value: 'fee_desc_en', text: '费用描述英文' },
        { value: 'amount', text: '金额' },
        { value: 'currency_id', text: '币别' },
        { value: 'target_currency_id', text: '换算后币别' },
        { value: 'target_amount', text: '换算后金额' },
        { value: 'receive_due_date', text: '应收日期' },
        { value: 'request_date', text: '请款日期' },
        { value: 'receive_date', text: '实收日期' },
        { value: 'receive_amount', text: '实收/实付金额' },
        { value: 'receive_currency_id', text: '实收币别' },
        { value: 'pay_due_date', text: '缴费期限' },
        { value: 'fee_customer', text: '缴费抬头' },
        { value: 'pay_date', text: '实付日期' },
        { value: 'request_no', text: '请款单号' },
        { value: 'review_stage', text: '缴年费阶段' },
        { value: 'pay_type_text', text: '缴费类型' },
        { value: 'fee_rate', text: '汇率' },
        { value: 'discount_rate', text: '折扣率' },
        { value: 'fee_remarks', text: '费用备注' },
        { value: 'update_log', text: '修改记录' },
        { value: 'account_name', text: '收款公司账号' },
        { value: 'out_bill_no', text: '外方账单号' },
        { value: 'out_bill_date', text: '外方账单日期' },
        { value: 'zt_receipt_bill_date', text: '账单收文日' },
        { value: 'zt_payment_delivery_date', text: '付款期限' },
        { value: 'create_date', text: '费用创建日期' },
        { value: 'invoice_no', text: '发票号' },
        { value: 'invoice_time', text: '开票日期' },
        { value: 'fee_agency_name', text: '费用合作所代理机构', defaultChecked: false },
        { value: 'receive_status', text: '收款状态' },
        { value: 'bill_in_no', text: '收款单号' },
        { value: 'pay_status', text: '缴费状态' },
        { value: 'coefficient', text: '数量' },
        { value: 'all_fee_name', text: '年费费用全称' },
        { value: 'request_remark', text: '请款单备注' },
        { value: 'cancellation_date', text: '销账日期' }
      ]
    },
    {
      id: 'ext',
      title: '扩展信息',
      columns: [
        { value: 'claim_number', text: '权利要求项数' },
        { value: 'spec_pages', text: '说明书页数' },
        { value: 'technical_field', text: '技术领域' },
        { value: 'introducer', text: '外部案源人' },
        { value: 'inside_introducer', text: '内部案源人' },
        { value: 'apply_tags', text: '专利标签' },
        { value: 'authorize_date', text: '授权发文日' }
      ]
    },
    {
      id: 'custom',
      title: '自定义栏位',
      columns: customCols
    }
  ]
}
