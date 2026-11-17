export interface FeeTextCell {
  kind: 'text'
  key: string
  label: string
  placeholder?: string
  checks?: { key: string; label: string }[]
}

export interface FeeNamedCell {
  kind: 'named'
  key: string
  label: string
  placeholder?: string
  checks?: { key: string; label: string }[]
}

export interface FeeSelectCell {
  kind: 'select'
  key: string
  label: string
  checks?: { key: string; label: string }[]
}

export interface FeeDateCell {
  kind: 'dates'
  label: string
  start: string
  end: string
  empty?: string
  checks?: { key: string; label: string }[]
}

export type FeeCell = FeeTextCell | FeeNamedCell | FeeSelectCell | FeeDateCell

export interface FeeBlock {
  title: string
  more?: boolean
  cells: FeeCell[]
}

export const FEE_SELECTS: Record<string, { value: string; label: string }[]> = {
  case_type: [
    { value: '', label: 'ALL' },
    { value: '31D1A147-2931-43B5-94AE-B72B1525BA8A', label: '专利' },
    { value: '0E8A4B7F-E407-4EFF-9562-3809BF484207', label: '商标' },
    { value: 'ABD40742-04F9-455F-BC41-080E9D896F80', label: '版权/综合' },
    { value: '122136EA-F3E3-46C5-A529-EFC358AC764B', label: '其他' },
    { value: '882D9F78-7656-468E-BE98-68FE5E334A9B', label: '科技服务' },
    { value: '7A74BEB6-13DE-444B-892F-6E339D4067A2', label: '法律案件' },
    { value: '849F2D30-DDAA-4718-AD1E-1951DE67913D', label: '调查案' }
  ],
  notice_status: [
    { value: '', label: 'ALL' },
    { value: '0', label: '未通知' },
    { value: '1', label: '已通知' }
  ],
  pay_status: [
    { value: '', label: 'ALL' },
    { value: '0', label: '未缴费' },
    { value: '1', label: '已缴费' },
    { value: '2', label: '已确认' },
    { value: '3', label: '已登回执' }
  ],
  exists_invoice_no: [
    { value: '', label: 'ALL' },
    { value: '0', label: '否' },
    { value: '1', label: '是' }
  ],
  is_ahead_pub: [
    { value: '', label: '请选择' },
    { value: '1', label: '是' },
    { value: '0', label: '否' }
  ],
  is_vip: [
    { value: '', label: 'ALL' },
    { value: '0', label: '否' },
    { value: '1', label: '是' }
  ],
  generation_status: [
    { value: '', label: '请选择' },
    { value: '0', label: '未委托' },
    { value: '1', label: '已委托' },
    { value: '2', label: '已完成' }
  ],
  sourcetype: [
    { value: '', label: '--请选择--' },
    { value: '市区工会', label: '市区工会' },
    { value: '大学研讨会', label: '大学研讨会' }
  ],
  business_coop: [
    { value: '', label: '--请选择--' },
    { value: '专利公司', label: '专利公司' },
    { value: '商标公司', label: '商标公司' },
    { value: '法律公司', label: '法律公司' }
  ],
  bill_no: [
    { value: '', label: 'ALL' },
    { value: '1', label: '缴费单号为空' },
    { value: '2', label: '缴费单号不为空' }
  ],
  status: [
    { value: '', label: 'ALL' },
    { value: '0', label: '未付款' },
    { value: '1000', label: '审核中' },
    { value: '3000', label: '已完成' },
    { value: '5000', label: '已付款' }
  ],
  total_price: [
    { value: '', label: 'ALL' },
    { value: '0', label: '否' },
    { value: '1', label: '是' }
  ],
  is_advance_payment: [
    { value: '', label: '请选择' },
    { value: '1', label: '是' },
    { value: '0', label: '否' }
  ],
  fee_class: [
    { value: '', label: '选择费用类型' },
    { value: 'O', label: '官费' },
    { value: 'A', label: '代理费' },
    { value: 'T', label: '第三方费' }
  ],
  pay_type: [
    { value: '', label: '选择缴费类型' },
    { value: '0', label: '普通缴费' },
    { value: '1', label: '急件' },
    { value: '2', label: '电子缴费' }
  ],
  request_status: [
    { value: '', label: '选择请款状态' },
    { value: '0', label: '未请款' },
    { value: '1000', label: '草稿中' },
    { value: '2000', label: '审核中' },
    { value: '3000', label: '已完成' }
  ],
  receive_status: [
    { value: '', label: '选择收款状态' },
    { value: '0', label: '未收款' },
    { value: '1000', label: '部分收款' },
    { value: '3000', label: '已收款' }
  ]
}

export const FEE_OPTION_KEYS: Record<string, string> = {
  country: 'limitCountry',
  case_status: 'limitCaseStatus',
  branch_dept_id: 'branch',
  ctrl_proc: 'limitCtrlProc',
  proc_pic_id: 'user',
  sale_help_id: 'user',
  fee_create_user_id: 'user',
  commission_user: 'user',
  apply_tags: 'applyTags',
  customer_status: 'limitCustomerStatus',
  case_pic_id: 'user',
  proc_pic_dept_id: 'dept',
  charge_dept_id: 'dept'
}

const dates = (
  label: string,
  start: string,
  end: string,
  empty?: string,
  checks?: { key: string; label: string }[]
): FeeDateCell => ({
  kind: 'dates',
  label,
  start,
  end,
  empty,
  checks
})

export function feeCellKey(cell: FeeCell): string {
  return cell.kind === 'dates' ? `${cell.start}-${cell.end}` : cell.key
}

export const FEE_QUICK_CELLS: FeeTextCell[] = [
  {
    kind: 'text',
    key: 'case_volume',
    label: '我方文号',
    placeholder: '多个文号用分号、空格或换行隔开',
    checks: [
      { key: 'is_fuzzy_query_case_volume', label: '模糊查询' },
      { key: 'is_accurate_query_sort', label: '精确查询排序' }
    ]
  },
  {
    kind: 'text',
    key: 'app_no',
    label: '申请号',
    placeholder: '申请号',
    checks: [
      { key: 'is_fuzzy_query_app_no', label: '模糊查询' },
      { key: 'is_point_app_no', label: '去点查询' }
    ]
  },
  {
    kind: 'text',
    key: 'pct_app_no',
    label: 'PCT申请号',
    placeholder: 'PCT申请号',
    checks: [
      { key: 'is_fuzzy_query_pct_app_no', label: '模糊查询' }
    ]
  }
]

export const FEE_COMMON_CELLS: FeeCell[] = [
  // Row 1
  { kind: 'select', key: 'case_type', label: '案件类型' },
  { kind: 'named', key: 'case_status', label: '案件状态' },
  { kind: 'named', key: 'country', label: '申请国家/地区' },

  // Row 2
  { kind: 'text', key: 'customer_id', label: '客户名称', placeholder: '选择客户' },
  {
    kind: 'text',
    key: 'applicant_id',
    label: '申请人',
    placeholder: '选择申请人',
    checks: [{ key: 'first_applicant', label: '我方第一申请人' }]
  },
  { kind: 'named', key: 'branch_dept_id', label: '承办部门' },

  // Row 3
  { kind: 'select', key: 'fee_class', label: '费用类型' },
  { kind: 'text', key: 'request_no', label: '请款单号' },
  { kind: 'select', key: 'pay_type', label: '缴费类型' },

  // Row 4
  { kind: 'select', key: 'notice_status', label: '通知状态' },
  { kind: 'select', key: 'receive_status', label: '收款状态' },
  {
    kind: 'select',
    key: 'pay_status',
    label: '缴费状态',
    checks: [{ key: 'pay_status_is_agent_fee', label: '显示代理费' }]
  },

  // Row 5
  dates('应收日期', 'receive_due_date_from', 'receive_due_date_to', 'receive_due_date_isnull', [
    { key: 'receivepayor', label: '或缴费期限' }
  ]),
  dates('实收日期', 'receive_date_from', 'receive_date_to', 'receive_date_isnull'),
  dates('实付日期', 'pay_date_from', 'pay_date_to', 'pay_date_isnull', [
    { key: 'pay_date_is_agent_fee', label: '显示代理费' }
  ]),

  // Row 6
  dates('开票日期', 'invoice_time_from', 'invoice_time_to', 'invoice_time_isnull'),
  dates('申请日', 'app_date_from', 'app_date_to', 'app_date_isnull'),
  dates('缴费期限', 'pay_due_date_from', 'pay_due_date_to', 'pay_due_date_isnull', [
    { key: 'pay_due_date_is_agent_fee', label: '显示代理费' }
  ]),

  // Row 7
  { kind: 'named', key: 'ctrl_proc', label: '处理事项' },
  { kind: 'named', key: 'proc_pic_id', label: '处理事项处理人' },
  dates('处理事项完成日', 'finish_date_from', 'finish_date_to', 'finish_date_isnull')
]

export const FEE_ADVANCED_BLOCKS: FeeBlock[] = [
  {
    title: '基本信息条件',
    cells: [
      {
        kind: 'text',
        key: 'issue_no',
        label: '注册号',
        checks: [{ key: 'is_fuzzy_query_issue_no', label: '是否模糊查询' }]
      },
      { kind: 'text', key: 'case_volume_customer', label: '客户文号' },
      { kind: 'select', key: 'is_ahead_pub', label: '提前公布' },
      dates('委案日期', 'charge_date_from', 'charge_date_to', 'charge_date_isnull'),
      { kind: 'named', key: 'charge_dept_id', label: '案件承办部门' },
      { kind: 'text', key: 'case_name', label: '案件名称' },
      { kind: 'named', key: 'sale_help_id', label: '业务助理' },
      { kind: 'select', key: 'is_vip', label: '是否预审' },
      { kind: 'select', key: 'generation_status', label: '外代状态' }
    ]
  },
  {
    title: '扩展信息条件',
    cells: [
      { kind: 'text', key: 'contract_code', label: '合同编号' },
      { kind: 'text', key: 'product_name', label: '产品类别' },
      { kind: 'select', key: 'sourcetype', label: '案源类型' },
      { kind: 'text', key: 'introducer', label: '外部案源人' },
      { kind: 'text', key: 'inside_introducer', label: '内部案源人' },
      { kind: 'text', key: 'asst_office_case_no', label: '协办所案号' },
      { kind: 'named', key: 'apply_tags', label: '专利标签' },
      { kind: 'text', key: 'technical_field', label: '技术领域' },
      { kind: 'named', key: 'case_pic_id', label: '案件处理人' },
      { kind: 'named', key: 'customer_status', label: '客户状态' },
      { kind: 'text', key: 'customer_sale_id', label: '客户业务员' },
      { kind: 'text', key: 'customer_no', label: '客户编号' },
      { kind: 'text', key: 'customer_code', label: '客户代码' },
      { kind: 'text', key: 'ruleOutcustomer_id', label: '排除客户名称' },
      { kind: 'text', key: 'contact', label: '客户联系人' }
    ]
  },
  {
    title: '处理事项条件',
    cells: [
      dates('创建日期', 'proc_create_time_from', 'proc_create_time_to', 'proc_create_time_isnull'),
      { kind: 'named', key: 'proc_pic_dept_id', label: '处理人部门' },
      dates('处理事项官方期限', 'legal_due_date_from', 'legal_due_date_to'),
      dates('处理事项内部期限', 'int_doc_date_from', 'int_doc_date_to'),
      dates('处理事项客户期限', 'cus_due_date_from', 'cus_due_date_to'),
      { kind: 'text', key: 'review_stage', label: '处理事项阶段' },
      { kind: 'text', key: 'proc_remark', label: '处理事项备注' }
    ]
  },
  {
    title: '费用信息条件',
    cells: [
      dates('费用核查日期', 'check_time_from', 'check_time_to', 'check_time_isnull'),
      dates('请款日期', 'request_date_from', 'request_date_to', 'request_date_isnull'),
      { kind: 'text', key: 'receive_account_id', label: '收款公司账户' },
      { kind: 'select', key: 'business_coop', label: '乙方签约公司' },
      dates('销账日期', 'cancellation_date_from', 'cancellation_date_to'),
      { kind: 'select', key: 'exists_invoice_no', label: '开具发票' },
      { kind: 'text', key: 'receiptno', label: '发票号' },
      { kind: 'text', key: 'out_bill_no', label: '外方账单号' },
      dates('外方账单日期', 'out_bill_date_from', 'out_bill_date_to', 'out_bill_date_isnull'),
      dates('账单收文日', 'zt_receipt_bill_date_from', 'zt_receipt_bill_date_to', 'zt_receipt_bill_date_isnull'),
      dates('付款期限', 'zt_payment_delivery_date_from', 'zt_payment_delivery_date_to', 'zt_payment_delivery_date_isnull'),
      dates('销账审核完成日', 'bill_out_finish_date_start', 'bill_out_finish_date_end'),
      { kind: 'text', key: 'amount', label: '金额' },
      { kind: 'select', key: 'bill_no', label: '缴费单号' },
      { kind: 'named', key: 'fee_create_user_id', label: '费用创建人' },
      { kind: 'text', key: 'currency_id', label: '费用币别' },
      { kind: 'text', key: 'fee_remark', label: '费用备注' },
      { kind: 'select', key: 'status', label: '付款状态' },
      { kind: 'select', key: 'total_price', label: '全包价' },
      { kind: 'named', key: 'commission_user', label: '提成人' },
      { kind: 'select', key: 'is_advance_payment', label: '是否预收款' },
      { kind: 'text', key: 'fee_customer', label: '缴费抬头' },
      { kind: 'text', key: 'request_creator', label: '请款单创建人' }
    ]
  },
  {
    title: '其他信息条件',
    cells: [
      { kind: 'text', key: 'column_1', label: '自定义栏位1' },
      { kind: 'text', key: 'column_2', label: '特批编号' },
      { kind: 'text', key: 'column_3', label: '回款日期' },
      { kind: 'text', key: 'column_4', label: '业务立案编号' },
      { kind: 'text', key: 'column_5', label: '所属部门' },
      { kind: 'text', key: 'internal_number', label: '内部单号' }
    ]
  }
]
