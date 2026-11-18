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
  checks?: FeeCheckItem[]
}

export interface FeeNamedCell {
  kind: 'named'
  key: string
  label: string
  placeholder?: string
  multiple?: boolean
  requiresCaseType?: boolean
  checks?: FeeCheckItem[]
}

export interface FeeCustomerModalCell {
  kind: 'customer-modal'
  key: 'customer_id' | 'ruleOutcustomer_id'
  label: string
  placeholder?: string
}

export interface FeeApplicantTreeCell {
  kind: 'applicant-tree'
  key: 'applicant_id'
  label: string
  placeholder?: string
  checks?: FeeCheckItem[]
}

export interface FeeSelectCell {
  kind: 'select'
  key: string
  label: string
  searchable?: boolean
  checks?: FeeCheckItem[]
}

export interface FeeDateCell {
  kind: 'dates'
  label: string
  start: string
  end: string
  empty?: string
  checks?: FeeCheckItem[]
}

export type FeeCell =
  | FeeTextareaCell
  | FeeTextCell
  | FeeNamedCell
  | FeeCustomerModalCell
  | FeeApplicantTreeCell
  | FeeSelectCell
  | FeeDateCell

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
  ]
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
  checks?: FeeCheckItem[]
): FeeDateCell => ({
  kind: 'dates',
  label,
  start,
  end,
  empty,
  checks
})

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
  dates('开卷日期', 'create_date_from', 'create_date_to', 'create_date_isnull'),
  dates('申请日', 'app_date_from', 'app_date_to', 'app_date_isnull'),
  dates('创建日期', 'createtime_from', 'createtime_to', 'createtime_isnull'),

  // Row 7
  { kind: 'named', key: 'ctrl_proc', label: '处理事项', placeholder: '选择处理事项' },
  { kind: 'named', key: 'proc_pic_id', label: '处理事项处理人' },
  dates('处理事项完成日', 'finish_date_from', 'finish_date_to', 'finish_date_isnull')
]

/** 高级查询 7 大分组（与原站 FeeSearch.aspx #tbCommon 行列与字段名 1:1 完全一致） */
export const FEE_ADVANCED_BLOCKS: FeeBlock[] = [
  {
    id: 'is_base',
    title: '基本信息条件',
    cells: [
      {
        kind: 'textarea',
        key: 'issue_no',
        label: '注册号',
        placeholder: MULTI_HINT,
        spanAll: true,
        checks: [{ key: 'is_fuzzy_query_issue_no', label: '是否模糊查询' }]
      },
      { kind: 'text', key: 'case_volume_customer', label: '客户文号', placeholder: '多个中间用分；空格或者换行隔开' },
      { kind: 'named', key: 'business_type', label: '业务类型' },
      { kind: 'select', key: 'is_close', label: '包含结案' },

      { kind: 'select', key: 'is_ahead_pub', label: '提前公布' },
      { kind: 'named', key: 'sale_id', label: '业务人员' },
      { kind: 'named', key: 'sale_dept_id', label: '业务人员部门' },

      dates('委案日期', 'charge_date_from', 'charge_date_to', 'charge_date_isnull'),
      { kind: 'named', key: 'charge_dept_id', label: '案件承办部门', placeholder: '请选择' },
      { kind: 'named', key: 'flow_user', label: '流程人员' },

      { kind: 'text', key: 'case_name', label: '案件名称' },
      { kind: 'named', key: 'sale_help_id', label: '业务助理' },
      { kind: 'named', key: 'case_status', label: '案件状态', placeholder: '请先选择案件类型，再选择案件状态' },

      { kind: 'select', key: 'hearing_the_case', label: '是否预审' },
      { kind: 'named', key: 'apply_type', label: '申请类型', requiresCaseType: true },
      { kind: 'select', key: 'case_agency_precorditem', label: '代理机构(案件)', searchable: true }
    ]
  },
  {
    id: 'is_adv',
    title: '扩展信息条件',
    cells: [
      { kind: 'text', key: 'contract_code', label: '合同编号' },
      { kind: 'named', key: 'product_name', label: '产品类别', placeholder: '请选择' },
      dates('授权发文日', 'authorize_date_from', 'authorize_date_to', 'authorize_date_isnull'),

      { kind: 'select', key: 'sourcetype', label: '案源类型' },
      { kind: 'text', key: 'introducer', label: '外部案源人' },
      { kind: 'text', key: 'inside_introducer', label: '内部案源人' },

      { kind: 'text', key: 'asst_office_case_no', label: '协办所案号' },
      { kind: 'named', key: 'apply_tags', label: '专利标签', placeholder: '请选择' },
      { kind: 'named', key: 'technical_field', label: '技术领域', placeholder: '请选择' }
    ]
  },
  {
    id: 'is_cust',
    title: '客户信息条件',
    cells: [
      { kind: 'text', key: 'applicant_name', label: '申请人名称' },
      { kind: 'text', key: 'inventor_name', label: '发明人' },
      { kind: 'select', key: 'case_agency', label: '代理机构(费用)', searchable: true },

      { kind: 'named', key: 'pic_id', label: '案件处理人' },
      { kind: 'named', key: 'pic_dept', label: '案件处理人部门', multiple: false },
      { kind: 'text', key: 'accurate_customer', label: '客户名称(模糊)' },

      { kind: 'named', key: 'customer_status', label: '客户状态' },
      { kind: 'text', key: 'nickname', label: '昵称' }
    ]
  },
  {
    id: 'is_agent',
    title: '著录项目信息条件',
    cells: [
      { kind: 'text', key: 'customer_code', label: '客户代码' },
      { kind: 'customer-modal', key: 'ruleOutcustomer_id', label: '排除客户名称', placeholder: '点击选择排除客户' },
      { kind: 'named', key: 'customer_sale_id', label: '客户业务员' },

      { kind: 'text', key: 'contact', label: '客户联系人', placeholder: '多个中间用分；空格或者换行隔开' },
      { kind: 'select', key: 'contact_type', label: '联系人类别' }
    ]
  },
  {
    id: 'is_proc',
    title: '处理事项条件',
    cells: [
      dates('创建日期', 'proc_create_time_from', 'proc_create_time_to', 'proc_create_time_isnull'),
      { kind: 'named', key: 'proc_pic_dept_id', label: '处理人部门', multiple: false },
      dates('官方发文日', 'doc_date_from', 'doc_date_to', 'doc_date_isnull'),

      dates('处理事项官方期限', 'legal_due_date_from', 'legal_due_date_to'),
      dates('处理事项内部期限', 'int_doc_date_from', 'int_doc_date_to'),
      dates('处理事项客户期限', 'cus_due_date_from', 'cus_due_date_to'),

      { kind: 'named', key: 'review_stage', label: '处理事项阶段' },
      { kind: 'text', key: 'proc_remark', label: '处理事项备注' }
    ]
  },
  {
    id: 'is_fee',
    title: '费用信息条件',
    cells: [
      dates('费用核查日期', 'check_time_from', 'check_time_to', 'check_time_isnull'),
      dates('请款日期', 'request_date_from', 'request_date_to', 'request_date_isnull'),
      { kind: 'text', key: 'request_no', label: '请款单号', placeholder: '多个中间用分；空格或者换行隔开' },

      { kind: 'select', key: 'notice_status', label: '通知状态' },
      { kind: 'named', key: 'receive_date_update_user', label: '实收日输机人员', multiple: false },
      dates('实收日输机日期', 'receive_date_update_time_from', 'receive_date_update_time_to', 'receive_date_update_time_isnull'),

      { kind: 'select', key: 'receive_account_id', label: '收款公司账户' },
      { kind: 'select', key: 'business_coop', label: '乙方签约公司' },
      { kind: 'named', key: 'pay_type', label: '缴费类型' },

      dates('销账日期', 'cancellation_date_from', 'cancellation_date_to'),
      { kind: 'select', key: 'exists_invoice_no', label: '开具发票' },
      dates('开票时间', 'invoice_time_from', 'invoice_time_to', 'invoice_time_isnull'),

      { kind: 'text', key: 'receiptno', label: '发票号' },
      { kind: 'text', key: 'out_bill_no', label: '外方账单号' },
      dates('外方账单日期', 'out_bill_date_from', 'out_bill_date_to', 'out_bill_date_isnull'),

      dates('账单收文日', 'zt_receipt_bill_date_from', 'zt_receipt_bill_date_to', 'zt_receipt_bill_date_isnull'),
      dates('付款期限', 'zt_payment_delivery_date_from', 'zt_payment_delivery_date_to', 'zt_payment_delivery_date_isnull'),
      { kind: 'text', key: 'amount', label: '金额' },

      { kind: 'select', key: 'bill_no', label: '缴费单号' },
      { kind: 'named', key: 'fee_create_user_id', label: '费用创建人' },
      { kind: 'named', key: 'currency_id', label: '费用币别' },

      { kind: 'text', key: 'fee_remark', label: '费用备注' },
      { kind: 'text', key: 'fee_customer', label: '缴费抬头' }
    ]
  },
  {
    id: 'is_ohter',
    title: '其他信息条件',
    cells: [
      { kind: 'text', key: 'column_1', label: '立案流程编号' },
      { kind: 'text', key: 'column_2', label: '签约主体' },
      { kind: 'text', key: 'column_3', label: '月结 特批单号' },
      { kind: 'text', key: 'column_4', label: '收款账户' },
      { kind: 'text', key: 'column_5', label: '收款日期' },
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
  return cell.kind === 'dates' ? `${cell.start}-${cell.end}` : cell.key
}
