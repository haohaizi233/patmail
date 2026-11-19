import { apiError, type ApiResult } from './types'

export interface FeeCheckItem {
  key: string
  label: string
}

export interface FeeTextareaCell {
  kind: 'textarea'
  key: string
  label: string
  placeholder?: string
  spanAll?: boolean
  checks?: FeeCheckItem[]
}

export interface FeeTextCell {
  kind: 'text'
  key: string
  label: string
  placeholder?: string
  help?: string
  checks?: FeeCheckItem[]
}

export interface FeeNamedCell {
  kind: 'named'
  key: string
  label: string
  placeholder?: string
  help?: string
  multiple?: boolean
  requiresCaseType?: boolean
  checks?: FeeCheckItem[]
}

export interface FeeCustomerModalCell {
  kind: 'customer-modal'
  key: 'customer_id' | 'ruleOutcustomer_id'
  label: string
  placeholder?: string
  help?: string
}

export interface FeeApplicantTreeCell {
  kind: 'applicant-tree'
  key: 'applicant_id'
  label: string
  placeholder?: string
  help?: string
  checks?: FeeCheckItem[]
}

export interface FeeSelectCell {
  kind: 'select'
  key: string
  label: string
  help?: string
  searchable?: boolean
  checks?: FeeCheckItem[]
}

export interface FeeDateCell {
  kind: 'dates'
  label: string
  start: string
  end: string
  empty?: string
  help?: string
  checks?: FeeCheckItem[]
}

export interface FeeSpacerCell {
  kind: 'spacer'
  id: string
}

export type FeeCell =
  | FeeTextareaCell
  | FeeTextCell
  | FeeNamedCell
  | FeeCustomerModalCell
  | FeeApplicantTreeCell
  | FeeSelectCell
  | FeeDateCell
  | FeeSpacerCell

export interface FeeBlock {
  title: string
  id: string
  cells: FeeCell[]
}

/** 静态回退选项：与原站 FeeSearch.aspx + FeeSearch.js 严格逐项对齐（未连原站或接口未返回时兜底）。 */
export const FEE_SELECTS: Record<string, { value: string; label: string }[]> = {
  // FeeSearch.js L542 排除科技服务 (882D9F78-7656-468E-BE98-68FE5E334A9B)
  case_type: [
    { value: '', label: 'ALL' },
    { value: '31D1A147-2931-43B5-94AE-B72B1525BA8A', label: '专利' },
    { value: '0E8A4B7F-E407-4EFF-9562-3809BF484207', label: '商标' },
    { value: 'ABD40742-04F9-455F-BC41-080E9D896F80', label: '版权/综合' },
    { value: '122136EA-F3E3-46C5-A529-EFC358AC764B', label: '其他' },
    { value: '7A74BEB6-13DE-444B-892F-6E339D4067A2', label: '法律案件' },
    { value: '849F2D30-DDAA-4718-AD1E-1951DE67913D', label: '调查案' }
  ],
  pay_status: [
    { value: '', label: 'ALL' },
    { value: '0', label: '未缴费' },
    { value: '1', label: '已缴费' },
    { value: '2', label: '已确认' },
    { value: '3', label: '已登回执' }
  ],
  is_close: [
    { value: '', label: '是' },
    { value: '1', label: '否' }
  ],
  is_ahead_pub: [
    { value: '', label: '请选择' },
    { value: '1', label: '是' },
    { value: '0', label: '否' }
  ],
  hearing_the_case: [
    { value: '', label: 'ALL' },
    { value: '0', label: '否' },
    { value: '1', label: '是' }
  ],
  sourcetype: [
    { value: '', label: '--请选择--' },
    { value: 'SGH', label: '市区工会' },
    { value: 'DXYTH', label: '大学研讨会' }
  ],
  contact_type: [
    { value: '', label: '--请选择--' }
  ],
  notice_status: [
    { value: '', label: 'ALL' },
    { value: '0', label: '未通知' },
    { value: '1', label: '已通知' }
  ],
  receive_account_id: [
    { value: '', label: '--请选择--' }
  ],
  business_coop: [
    { value: '', label: '--请选择--' }
  ],
  exists_invoice_no: [
    { value: '', label: 'ALL' },
    { value: '0', label: '否' },
    { value: '1', label: '是' }
  ],
  bill_no: [
    { value: '', label: 'ALL' },
    { value: '0', label: '缴费单号为空' },
    { value: '1', label: '缴费单号不为空' }
  ],
  case_agency_precorditem: [
    { value: '', label: 'ALL' }
  ],
  case_agency: [
    { value: '', label: 'ALL' }
  ]
}

/** 固定静态 TreeUser 多选树（原站 FeeSearch.js 写死或由 FeeSearchInit 返回） */
export const FEE_STATIC_TREES: Record<string, { value: string; label: string }[]> = {
  Case_direction: [
    { value: 'II', label: '内-内' },
    { value: 'IO', label: '内-外' },
    { value: 'OI', label: '外-内' },
    { value: 'OO', label: '外-外' }
  ],
  fee_class: [
    { value: 'O', label: '官费' },
    { value: 'A', label: '代理费' },
    { value: 'T', label: '第三方费用' }
  ],
  request_status: [
    { value: '0', label: '未请款' },
    { value: '100', label: '草稿中' },
    { value: '1000', label: '审核中' },
    { value: '3000', label: '已完成' }
  ],
  receive_status: [
    { value: 'MN', label: '不收款' },
    { value: 'MW', label: '未收款' },
    { value: 'MY', label: '已收款' },
    { value: 'MB', label: '部分收款' },
    { value: 'WPZ', label: '未配置费用' }
  ],
  pay_type: [
    { value: '0', label: '代缴' },
    { value: '1', label: '客户自缴' },
    { value: '2', label: '客户放弃' },
    { value: '3', label: '其他' }
  ],
  app_date_month: Array.from({ length: 12 }, (_, idx) => ({
    value: String(idx + 1),
    label: `${idx + 1}`
  }))
}

/** 复用 PatMail 通用 picker 字典的字段映射 */
export const FEE_OPTION_KEYS: Record<string, string> = {
  country: 'limitCountry',
  branch_dept_id: 'branch',
  ctrl_proc: 'limitCtrlProc',
  proc_pic_id: 'user',
  sale_id: 'user',
  sale_dept_id: 'dept',
  charge_dept_id: 'dept',
  flow_user: 'user',
  sale_help_id: 'user',
  case_status: 'limitCaseStatus',
  apply_type: 'limitApplyType',
  business_type: 'limitBussType',
  apply_tags: 'applyTags',
  pic_id: 'user',
  pic_dept: 'dept',
  customer_status: 'limitCustomerStatus',
  customer_sale_id: 'user',
  proc_pic_dept_id: 'dept',
  receive_date_update_user: 'user',
  fee_create_user_id: 'user'
}

const dates = (
  label: string,
  start: string,
  end: string,
  empty?: string,
  checks?: FeeCheckItem[],
  help?: string
): FeeDateCell => ({
  kind: 'dates',
  label,
  start,
  end,
  empty,
  checks,
  ...(help ? { help } : {})
})

const spacer = (id: string): FeeSpacerCell => ({ kind: 'spacer', id })

const MULTI_HINT = '多个中间用分；空格或者换行隔开,默认小于10条模糊查询，大于10条精确查询'

/** Row 0: 顶部 3 列多行文号 / 申请号快速检索区（原站 tbCommon Row 0，textarea） */
export const FEE_QUICK_CELLS: FeeTextareaCell[] = [
  {
    kind: 'textarea',
    key: 'case_volume',
    label: '我方文号',
    placeholder: MULTI_HINT,
    checks: [
      { key: 'is_fuzzy_query_case_volume', label: '模糊查询' },
      { key: 'is_accurate_query_sort', label: '精确查询排序' }
    ]
  },
  {
    kind: 'textarea',
    key: 'app_no',
    label: '申请号',
    placeholder: MULTI_HINT,
    checks: [
      { key: 'is_fuzzy_query_app_no', label: '模糊查询' },
      { key: 'is_point_app_no', label: '去点查询' }
    ]
  },
  {
    kind: 'textarea',
    key: 'pct_app_no',
    label: 'PCT申请号',
    placeholder: MULTI_HINT,
    checks: [
      { key: 'is_fuzzy_query_pct_app_no', label: '模糊查询' }
    ]
  }
]

/** Rows 1–7: 常用查询条件（与原站 FeeSearch.aspx #tbCommon 行列排布 1:1 完全一致） */
export const FEE_COMMON_CELLS: FeeCell[] = [
  // Row 1
  { kind: 'select', key: 'case_type', label: '案件类型' },
  { kind: 'named', key: 'Case_direction', label: '案件流向', placeholder: '选择案件流向' },
  { kind: 'named', key: 'country', label: '申请国家(地区)' },

  // Row 2
  { kind: 'customer-modal', key: 'customer_id', label: '客户名称', placeholder: '选择客户' },
  {
    kind: 'applicant-tree',
    key: 'applicant_id',
    label: '申请人',
    placeholder: '选择申请人',
    checks: [{ key: 'first_applicant', label: '限第一申请人' }]
  },
  { kind: 'named', key: 'branch_dept_id', label: '所属分部' },

  // Row 3
  { kind: 'named', key: 'fee_class', label: '费用类型', placeholder: '选择费用类型' },
  { kind: 'named', key: 'fee_type', label: '费用名称', placeholder: '选择费用名称', requiresCaseType: true },
  dates('缴费期限', 'pay_due_date_from', 'pay_due_date_to', 'pay_due_date_isnull', [
    { key: 'pay_due_date_is_agent_fee', label: '显示代理费' }
  ]),

  // Row 4
  { kind: 'named', key: 'request_status', label: '请款状态', placeholder: '选择请款状态' },
  { kind: 'named', key: 'receive_status', label: '收款状态', placeholder: '选择收款状态' },
  {
    kind: 'select',
    key: 'pay_status',
    label: '缴费状态',
    checks: [{ key: 'pay_status_is_agent_fee', label: '显示代理费' }]
  },

  // Row 5
  dates('应收日期', 'receive_due_date_from', 'receive_due_date_to', 'receive_due_date_isnull', [
    { key: 'receivepayor', label: '应收日期和缴费期限“或”查询' }
  ]),
  dates('实收日期', 'receive_date_from', 'receive_date_to', 'receive_date_isnull'),
  dates('实付日期', 'pay_date_from', 'pay_date_to', 'pay_date_isnull', [
    { key: 'pay_date_is_agent_fee', label: '显示代理费' }
  ]),

  // Row 6
  dates('开卷日期', 'createtime_from', 'createtime_to', 'createtime_isnull'),
  dates('申请日', 'app_date_from', 'app_date_to', 'app_date_isnull'),
  dates('费用创建日期', 'create_date_from', 'create_date_to', 'create_date_isnull'),

  // Row 7
  { kind: 'named', key: 'ctrl_proc', label: '处理事项', placeholder: '选择处理事项' },
  { kind: 'named', key: 'proc_pic_id', label: '处理事项处理人' },
  dates('处理事项完成日', 'finish_date_from', 'finish_date_to', 'finish_date_isnull')
]

/** 高级查询 7 大分组（与原站 d.hiseeip.com FeeSearch.aspx #tbCommon 每一行、每一列 1:1 严格对齐） */
export const FEE_ADVANCED_BLOCKS: FeeBlock[] = [
  {
    id: 'is_base',
    title: '基本信息条件',
    cells: [
      // TR[10]
      { kind: 'named', key: 'app_date_month', label: '申请日月份', placeholder: '请选择' },
      spacer('base-tr10-c2'),
      spacer('base-tr10-c3'),
      // TR[11]
      {
        kind: 'textarea',
        key: 'issue_no',
        label: '注册号',
        placeholder: MULTI_HINT,
        spanAll: true,
        checks: [{ key: 'is_fuzzy_query_issue_no', label: '是否模糊查询' }]
      },
      // TR[12]
      { kind: 'text', key: 'case_volume_customer', label: '客户文号', placeholder: '多个中间用分；空格或者换行隔开' },
      { kind: 'named', key: 'business_type', label: '业务类型' },
      { kind: 'select', key: 'is_close', label: '包含结案' },
      // TR[13]
      { kind: 'select', key: 'is_ahead_pub', label: '提前公布' },
      { kind: 'named', key: 'sale_id', label: '业务人员' },
      { kind: 'named', key: 'sale_dept_id', label: '业务人员部门' },
      // TR[14]
      dates('委案日期', 'charge_date_from', 'charge_date_to', 'charge_date_isnull'),
      { kind: 'named', key: 'charge_dept_id', label: '案件承办部门', placeholder: '请选择' },
      { kind: 'named', key: 'flow_user', label: '流程人员' },
      // TR[15]
      { kind: 'text', key: 'case_name', label: '案件名称' },
      { kind: 'named', key: 'sale_help_id', label: '业务助理' },
      { kind: 'named', key: 'case_status', label: '案件状态', placeholder: '请先选择案件类型，再选择案件状态' },
      // TR[16]
      { kind: 'select', key: 'hearing_the_case', label: '是否预审' },
      { kind: 'named', key: 'apply_type', label: '申请类型', requiresCaseType: true },
      { kind: 'select', key: 'case_agency_precorditem', label: '代理机构(案件)', searchable: true, help: '案件代理机构的费用' }
    ]
  },
  {
    id: 'is_adv',
    title: '扩展信息条件',
    cells: [
      // TR[19]
      { kind: 'text', key: 'contract_code', label: '合同编号' },
      { kind: 'named', key: 'product_name', label: '产品类别', placeholder: '请选择' },
      dates('授权发文日', 'authorize_date_from', 'authorize_date_to', 'authorize_date_isnull'),
      // TR[20]
      { kind: 'select', key: 'sourcetype', label: '案源类型' },
      { kind: 'text', key: 'introducer', label: '外部案源人' },
      { kind: 'text', key: 'inside_introducer', label: '内部案源人' },
      // TR[21]
      { kind: 'text', key: 'asst_office_case_no', label: '协办所案号' },
      { kind: 'named', key: 'apply_tags', label: '专利标签', placeholder: '请选择' },
      { kind: 'named', key: 'technical_field', label: '技术领域', placeholder: '请选择' },
      // TR[24]（专业领域已隐藏，仅展示新申请递交日）
      dates('新申请递交日', 'filing_date_start', 'filing_date_end'),
      spacer('adv-tr24-c2'),
      spacer('adv-tr24-c3')
    ]
  },
  {
    id: 'is_cust',
    title: '客户信息条件',
    cells: [
      // TR[26]
      { kind: 'text', key: 'applicant_name', label: '申请人名称', help: '案件申请人的中英文名称（模糊匹配）' },
      { kind: 'text', key: 'inventor_name', label: '发明人' },
      { kind: 'select', key: 'case_agency', label: '代理机构(费用)', searchable: true, help: '案件为该代理机构的费用' },
      // TR[27]
      { kind: 'named', key: 'pic_id', label: '案件处理人' },
      { kind: 'named', key: 'pic_dept', label: '案件处理人部门', multiple: false },
      { kind: 'text', key: 'accurate_customer', label: '客户名称(模糊)', help: '输入关键字模糊查询' },
      // TR[28]（是否大客户已隐藏）
      { kind: 'named', key: 'customer_status', label: '客户状态' },
      { kind: 'text', key: 'nickname', label: '昵称' },
      spacer('cust-tr28-c3')
    ]
  },
  {
    id: 'is_agent',
    title: '著录项目信息条件',
    cells: [
      // TR[32]
      { kind: 'text', key: 'customer_code', label: '客户代码' },
      { kind: 'customer-modal', key: 'ruleOutcustomer_id', label: '排除客户名称', placeholder: '点击选择排除客户', help: '没有案件的客户' },
      { kind: 'named', key: 'customer_sale_id', label: '客户业务员' },
      // TR[33]
      { kind: 'text', key: 'contact', label: '客户联系人', placeholder: '多个中间用分；空格或者换行隔开' },
      { kind: 'select', key: 'contact_type', label: '联系人类别', help: '如果客户联系人填写了数据,该栏位会和联系人结合使用，如果客户联系人没有填写，该栏位单独使用！' },
      spacer('agent-tr33-c3')
    ]
  },
  {
    id: 'is_proc',
    title: '处理事项条件',
    cells: [
      // TR[35]
      dates('创建日期', 'proc_create_time_from', 'proc_create_time_to', 'proc_create_time_isnull'),
      { kind: 'named', key: 'proc_pic_dept_id', label: '处理人部门', multiple: false },
      dates('官方发文日', 'doc_date_from', 'doc_date_to', 'doc_date_isnull'),
      // TR[36]
      dates('处理事项官方期限', 'legal_due_date_from', 'legal_due_date_to'),
      dates('处理事项内部期限', 'int_doc_date_from', 'int_doc_date_to'),
      dates('处理事项客户期限', 'cus_due_date_from', 'cus_due_date_to'),
      // TR[37]
      { kind: 'named', key: 'review_stage', label: '处理事项阶段' },
      { kind: 'text', key: 'proc_remark', label: '处理事项备注' },
      spacer('proc-tr37-c3')
    ]
  },
  {
    id: 'is_fee',
    title: '费用信息条件',
    cells: [
      // TR[39]
      dates('费用核查日期', 'check_time_from', 'check_time_to', 'check_time_isnull', undefined, '案件费用设置核查的日期'),
      dates('请款日期', 'request_date_from', 'request_date_to', 'request_date_isnull'),
      { kind: 'text', key: 'request_no', label: '请款单号', placeholder: '多个中间用分；空格或者换行隔开' },
      // TR[40]
      { kind: 'select', key: 'notice_status', label: '通知状态' },
      { kind: 'named', key: 'receive_date_update_user', label: '实收日输机人员', multiple: false, help: '费用实收日期填写时的人员' },
      dates('实收日输机日期', 'receive_date_update_time_from', 'receive_date_update_time_to', 'receive_date_update_time_isnull', undefined, '费用实收日期填写时的时间'),
      // TR[41]
      { kind: 'select', key: 'receive_account_id', label: '收款公司账户' },
      { kind: 'select', key: 'business_coop', label: '乙方签约公司' },
      { kind: 'named', key: 'pay_type', label: '缴费类型' },
      // TR[42]
      dates('销账日期', 'cancellation_date_from', 'cancellation_date_to'),
      { kind: 'select', key: 'exists_invoice_no', label: '开具发票' },
      dates('开票时间', 'invoice_time_from', 'invoice_time_to', 'invoice_time_isnull'),
      // TR[43]
      { kind: 'text', key: 'receiptno', label: '发票号' },
      { kind: 'text', key: 'out_bill_no', label: '外方账单号' },
      dates('外方账单日期', 'out_bill_date_from', 'out_bill_date_to', 'out_bill_date_isnull'),
      // TR[44]（销账审核完成日已隐藏）
      dates('账单收文日', 'zt_receipt_bill_date_from', 'zt_receipt_bill_date_to', 'zt_receipt_bill_date_isnull'),
      dates('付款期限', 'zt_payment_delivery_date_from', 'zt_payment_delivery_date_to', 'zt_payment_delivery_date_isnull'),
      spacer('fee-tr44-c3'),
      // TR[45]
      { kind: 'text', key: 'amount', label: '金额' },
      { kind: 'select', key: 'bill_no', label: '缴费单号' },
      { kind: 'named', key: 'fee_create_user_id', label: '费用创建人' },
      // TR[47]（付款状态已隐藏）
      { kind: 'named', key: 'currency_id', label: '费用币别' },
      { kind: 'text', key: 'fee_remark', label: '费用备注' },
      spacer('fee-tr47-c3'),
      // TR[51]
      { kind: 'text', key: 'fee_customer', label: '缴费抬头' },
      spacer('fee-tr51-c2'),
      spacer('fee-tr51-c3')
    ]
  },
  {
    id: 'is_ohter',
    title: '其他信息条件',
    cells: [
      // TR[54]（动态标题来自 PatentAction.ashx?Call=GetFieldColumn）
      { kind: 'text', key: 'column_1', label: '自定义栏位1' },
      { kind: 'text', key: 'column_2', label: '自定义栏位2' },
      { kind: 'text', key: 'column_3', label: '自定义栏位3' },
      // TR[55]
      { kind: 'text', key: 'column_4', label: '自定义栏位4' },
      { kind: 'text', key: 'column_5', label: '自定义栏位5' },
      {
        kind: 'text',
        key: 'office_no',
        label: '缴费单号',
        checks: [{ key: 'office_no_is_agent_fee', label: '显示代理费' }]
      }
    ]
  }
]

export function feeCellKey(cell: FeeCell): string {
  if (cell.kind === 'spacer') return cell.id
  return cell.kind === 'dates' ? `${cell.start}-${cell.end}` : cell.key
}

function collectCellKeys(cells: FeeCell[]): { fields: string[]; checks: string[] } {
  const fields: string[] = []
  const checks: string[] = []
  for (const cell of cells) {
    if (cell.kind === 'spacer') continue
    if (cell.kind === 'dates') {
      fields.push(cell.start, cell.end)
      if (cell.empty) checks.push(cell.empty)
      for (const chk of cell.checks ?? []) checks.push(chk.key)
    } else {
      fields.push(cell.key)
      if ('checks' in cell && cell.checks) {
        for (const chk of cell.checks) checks.push(chk.key)
      }
    }
  }
  return { fields, checks }
}

const quickCollected = collectCellKeys(FEE_QUICK_CELLS)
const commonCollected = collectCellKeys(FEE_COMMON_CELLS)
const advCollected = collectCellKeys(FEE_ADVANCED_BLOCKS.flatMap(b => b.cells))

export const FEE_CHECK_KEYS = new Set<string>([
  ...quickCollected.checks,
  ...commonCollected.checks,
  ...advCollected.checks
])

export const FEE_ADVANCED_KEYS = new Set<string>([
  ...advCollected.fields,
  ...advCollected.checks
])

export const FEE_ALL_INPUT_KEYS = new Set<string>([
  ...quickCollected.fields,
  ...quickCollected.checks,
  ...commonCollected.fields,
  ...commonCollected.checks,
  ...advCollected.fields,
  ...advCollected.checks
])

export function isFeeSearchInputField(key: string): boolean {
  return FEE_ALL_INPUT_KEYS.has(key)
}

/** 原站 FeeSearch.aspx 控件 ID 与查询参数名不一致的 2 处映射（QueryHistory 按 DOM id 读写 XML） */
const FIELD_TO_FEE_XML: Record<string, string> = {
  applicant_id: 'applicant',
  charge_dept_id: 'charge_dept'
}
const FEE_XML_TO_FIELD: Record<string, string> = {
  applicant: 'applicant_id',
  charge_dept: 'charge_dept_id'
}

const FEE_NODE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const FEE_UNSAFE_NODE = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_FEE_XML_CHARS = 200_000
const MAX_FEE_XML_NODES = 400

export interface FeeCustomerRef {
  id: string
  name: string
}

export interface FeeParsedQuery {
  fields: Record<string, string>
  checks: Record<string, boolean>
  displayValues: Record<string, string>
  customers: FeeCustomerRef[]
  ruleOutCustomers: FeeCustomerRef[]
  unknownFields: Record<string, string>
}

function escapeFeeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function pushFeeNode(parts: string[], used: Set<string>, name: string, value: string): void {
  const text = value.trim()
  if (!text || !FEE_NODE_NAME.test(name) || used.has(name) || FEE_UNSAFE_NODE.has(name)) return
  used.add(name)
  parts.push(`<${name}>${escapeFeeXml(text)}</${name}>`)
}

/**
 * 构造原站 FeeSearch 历史查询模板 XML（与 QueryHistory.SaveQueryCondition 双向兼容）。
 * - customer_id 严格按原站 FeeSearch 特例序列化为 JSON 数组 + `[{ value, text }]`
 * - 树形框附写 `{控件}_text`；勾选框写 `on`
 */
export function buildFeeQueryXml(input: {
  fields: Record<string, string>
  checks?: Record<string, boolean>
  displayValues?: Record<string, string>
  customers?: FeeCustomerRef[]
  ruleOutCustomers?: FeeCustomerRef[]
  unknownFields?: Record<string, string>
}): string {
  const parts: string[] = []
  const used = new Set<string>()
  const fields = input.fields
  const checks = input.checks ?? {}
  const displayValues = input.displayValues ?? {}
  const customers = input.customers ?? []
  const ruleOutCustomers = input.ruleOutCustomers ?? []
  const unknownFields = input.unknownFields ?? {}

  if (customers.length) {
    pushFeeNode(parts, used, 'customer_id', JSON.stringify(customers.map(c => c.id)))
    pushFeeNode(parts, used, 'customer_id_text', JSON.stringify(customers.map(c => ({ value: c.id, text: c.name }))))
  }
  if (ruleOutCustomers.length) {
    pushFeeNode(parts, used, 'ruleOutcustomer_id', ruleOutCustomers.map(c => c.id).join(';'))
    pushFeeNode(parts, used, 'ruleOutcustomer_id_text', ruleOutCustomers.map(c => c.name).join(';'))
  }

  for (const key of Object.keys(fields).sort()) {
    if (!isFeeSearchInputField(key) || FEE_CHECK_KEYS.has(key)) continue
    if (key === 'customer_id' && customers.length) continue
    if (key === 'ruleOutcustomer_id' && ruleOutCustomers.length) continue
    const node = FIELD_TO_FEE_XML[key] ?? key
    const val = (fields[key] ?? '').trim()
    if (!val) continue
    pushFeeNode(parts, used, node, val)
    const label = (displayValues[key] ?? '').trim()
    if (label && label !== val) pushFeeNode(parts, used, `${node}_text`, label)
  }

  for (const key of Object.keys(checks).sort()) {
    if (!FEE_CHECK_KEYS.has(key) || !checks[key]) continue
    pushFeeNode(parts, used, key, 'on')
  }

  for (const key of Object.keys(unknownFields).sort()) {
    pushFeeNode(parts, used, key, unknownFields[key] ?? '')
  }

  return `<xmlRoot>${parts.join('')}</xmlRoot>`
}

function parseCustomerRefs(rawIds: string, rawText: string): FeeCustomerRef[] {
  const idsText = rawIds.trim()
  const labelText = rawText.trim()
  if (!idsText && !labelText) return []

  // 原站 FeeSearch 格式：customer_id = ["id1",...], customer_id_text = [{"value":"id1","text":"名1"},...]
  try {
    const parsedInfo = labelText ? JSON.parse(labelText) as unknown : null
    if (Array.isArray(parsedInfo)) {
      const refs = parsedInfo
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map(item => ({
          id: typeof item.value === 'string' ? item.value.trim() : typeof item.id === 'string' ? item.id.trim() : '',
          name: typeof item.text === 'string' ? item.text.trim() : typeof item.name === 'string' ? item.name.trim() : ''
        }))
        .filter(item => Boolean(item.id))
      if (refs.length) return refs
    }
  } catch { /* fallback below */ }

  let ids: string[] = []
  try {
    const parsedIds = idsText ? JSON.parse(idsText) as unknown : null
    if (Array.isArray(parsedIds)) {
      ids = parsedIds.map(v => String(v ?? '').trim()).filter(Boolean)
    }
  } catch { /* fallback below */ }
  if (!ids.length && idsText) {
    ids = idsText.split(/[;,]/).map(s => s.trim()).filter(Boolean)
  }
  const names = labelText ? labelText.split(/[;,]/).map(s => s.trim()).filter(Boolean) : []
  return ids.map((id, idx) => ({ id, name: names[idx] || id }))
}

function mapFeeXmlNode(nodeName: string): string | null {
  if (FEE_UNSAFE_NODE.has(nodeName)) return null
  const mapped = FEE_XML_TO_FIELD[nodeName] ?? nodeName
  return isFeeSearchInputField(mapped) ? mapped : null
}

/** 解析原站 FeeSearch 历史查询模板 XML（兼容原站单层/双层 xmlRoot 与客户 JSON 格式）。 */
export function readFeeQueryXml(xml: string): ApiResult<FeeParsedQuery> {
  if (typeof xml !== 'string' || !xml.trim()) return apiError('INVALID_RESPONSE', '费用模板为空。')
  if (xml.length > MAX_FEE_XML_CHARS) return apiError('INVALID_RESPONSE', '费用模板超出大小限制。')
  if (/<!DOCTYPE|<!ENTITY|<!ELEMENT|<!ATTLIST/i.test(xml)) return apiError('INVALID_RESPONSE', '费用模板包含不允许的文档类型声明。')
  if (typeof DOMParser === 'undefined') return apiError('INVALID_RESPONSE', '当前环境无法解析费用模板。')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return apiError('INVALID_RESPONSE', '费用模板无法解析。')
  const root = doc.documentElement
  if (!root || root.nodeName !== 'xmlRoot') return apiError('INVALID_RESPONSE', '费用模板缺少 xmlRoot。')

  let nodes = Array.from(root.children)
  while (nodes.length === 1 && nodes[0].nodeName === 'xmlRoot') nodes = Array.from(nodes[0].children)
  if (nodes.length > MAX_FEE_XML_NODES) return apiError('INVALID_RESPONSE', '费用模板节点过多。')

  const fields: Record<string, string> = {}
  const checks: Record<string, boolean> = {}
  const displayValues: Record<string, string> = {}
  const unknownFields: Record<string, string> = {}
  let rawCustId = ''
  let rawCustText = ''
  let rawRuleOutId = ''
  let rawRuleOutText = ''

  for (const node of nodes) {
    const name = node.nodeName
    if (FEE_UNSAFE_NODE.has(name)) continue
    const value = (node.textContent ?? '').trim()
    if (!value) continue

    if (name === 'customer_id') { rawCustId = value; continue }
    if (name === 'customer_id_text') { rawCustText = value; continue }
    if (name === 'ruleOutcustomer_id') { rawRuleOutId = value; continue }
    if (name === 'ruleOutcustomer_id_text') { rawRuleOutText = value; continue }

    if (name.endsWith('_text')) {
      const key = mapFeeXmlNode(name.slice(0, -'_text'.length))
      if (key) displayValues[key] = value
      else if (FEE_NODE_NAME.test(name)) unknownFields[name] = value
      continue
    }

    const key = mapFeeXmlNode(name)
    if (key) {
      if (FEE_CHECK_KEYS.has(key)) {
        const lower = value.toLowerCase()
        if (lower === 'on' || lower === 'true' || lower === '1') checks[key] = true
      } else {
        fields[key] = value
      }
    } else if (FEE_NODE_NAME.test(name)) {
      unknownFields[name] = value
    }
  }

  const customers = parseCustomerRefs(rawCustId, rawCustText)
  if (customers.length) {
    fields.customer_id = customers.map(c => c.id).join(';')
    displayValues.customer_id = customers.map(c => c.name).join(';') + ';'
  }
  const ruleOutCustomers = parseCustomerRefs(rawRuleOutId, rawRuleOutText)
  if (ruleOutCustomers.length) {
    fields.ruleOutcustomer_id = ruleOutCustomers.map(c => c.id).join(';')
    displayValues.ruleOutcustomer_id = ruleOutCustomers.map(c => c.name).join(';') + ';'
  }

  return { ok: true, data: { fields, checks, displayValues, customers, ruleOutCustomers, unknownFields } }
}
