import { FILING_INPUT_FIELDS, type FilingInputField } from './filing-search-params'
import { FILING_PICKER_FIELDS } from './dictionaries/picker-catalog'

/** 递交管理查询条件的排版。来源：`Forms/NewFiling/Finished.aspx` 的查询条件区，一排两个条件。控件形态对齐 FilingList.js。 */

export interface FilingTextCell { kind: 'text'; key: string; label: string; hint?: string }
export interface FilingNamedCell { kind: 'named'; key: string; label: string }
export interface FilingSelectCell { kind: 'select'; key: string; label: string }
export interface FilingDateCell { kind: 'dates'; label: string; start: string; end: string }
export type FilingCell = FilingTextCell | FilingNamedCell | FilingSelectCell | FilingDateCell

export const FILING_FIELD_LABELS: Record<string, string> = {
  case_volume: '我方文号',
  ctrl_proc: '处理事项',
  customer_volume: '客户文号',
  customer: '客户',
  customer_code: '客户代码',
  flow_direction: '案件流向',
  case_name: '案件名称',
  case_type: '案件类型',
  audit_user_id: '办理人',
  create_time_start: '办理时间起',
  create_time_end: '办理时间止',
  create_user_id: '创建人',
  create_date_start: '创建时间起',
  create_date_end: '创建时间止',
  activity: '当前流程阶段',
  finish_date_start: '完成日起',
  finish_date_end: '完成日止',
  contract_no: '合同编号',
  business_coop: '签约单位',
  is_paper_notice: '是否需要纸质通知书',
  agent_name: '代理人',
  applicant: '申请人',
  app_no: '申请号',
  apply_type: '申请类型',
  app_date_start: '申请日起',
  app_date_end: '申请日止',
  history: '历史审核记录',
  sales_user_id: '业务员',
  branch_dept: '案件所属分部',
  history_remark: '流程审核备注',
  audit_type: '办理类型'
}

/** 递交条件下拉对应的字典名，与原站 FilingList.js 的填充来源一致。字典由 loadPicker 从原站实时拉。 */
export const FILING_OPTION_KEYS: Record<string, string> = FILING_PICKER_FIELDS

/**
 * 页面里写死的 select 选项。来源：`183.36.43.66.har` 里 `Forms/NewFiling/Finished.aspx` 的 HTML 原文。
 * 这三个 select 原站没有任何接口填充（FilingList.js 的 FinishedInit 只填 case_type、history、activity、
 * branch_dept、business_coop 和人员树，从不碰这三个），选项直接渲染在页面上。
 * 扫到原站页面时用页面的实时结果覆盖；扫不到时用这份抓包快照兜底，空值项统一显示「不限」。
 */
export const FILING_SELECTS: Record<string, { value: string; label: string }[]> = {
  flow_direction: [
    { value: 'II', label: '内-内' },
    { value: 'IO', label: '内-外' },
    { value: 'OI', label: '外-内' },
    { value: 'OO', label: '外-外' }
  ],
  is_paper_notice: [
    { value: '1', label: '是' },
    { value: '0', label: '否' }
  ],
  audit_type: [
    { value: 'submit', label: '提交' },
    { value: 'handover', label: '移交' },
    { value: 'reject', label: '退回' },
    { value: 'withdraw', label: '撤回' }
  ]
}

const dates = (label: string, start: string, end: string): FilingDateCell => ({ kind: 'dates', label, start, end })

/**
 * 查询条件按页面左右两列排。select 的选项在校对字段时从原站页面实时扫（ScanFilingForm），代码里不写死；
 * named 的选项从原站接口实时读：处理事项、当前流程阶段、历史审核记录、申请类型、案件类型、签约单位、分部和人员。
 * 历史审核记录在原站复用流程节点做选项（FilingList.js 把 ApplyFlowNode 挂进 `#history`），这里一样。
 */
export const FILING_BLOCKS: FilingCell[] = [
  { kind: 'text', key: 'case_volume', label: '我方文号' },
  { kind: 'named', key: 'ctrl_proc', label: '处理事项' },
  { kind: 'text', key: 'customer_volume', label: '客户文号' },
  { kind: 'text', key: 'customer', label: '客户' },
  { kind: 'text', key: 'customer_code', label: '客户代码' },
  { kind: 'select', key: 'flow_direction', label: '案件流向' },
  { kind: 'text', key: 'case_name', label: '案件名称' },
  { kind: 'named', key: 'case_type', label: '案件类型' },
  { kind: 'named', key: 'audit_user_id', label: '办理人' },
  dates('办理时间', 'create_time_start', 'create_time_end'),
  { kind: 'named', key: 'create_user_id', label: '创建人' },
  dates('创建时间', 'create_date_start', 'create_date_end'),
  { kind: 'named', key: 'activity', label: '当前流程阶段' },
  dates('完成日', 'finish_date_start', 'finish_date_end'),
  { kind: 'text', key: 'contract_no', label: '合同编号' },
  { kind: 'named', key: 'business_coop', label: '签约单位' },
  { kind: 'select', key: 'is_paper_notice', label: '是否需要纸质通知书' },
  { kind: 'text', key: 'agent_name', label: '代理人' },
  { kind: 'text', key: 'applicant', label: '申请人' },
  { kind: 'text', key: 'app_no', label: '申请号' },
  { kind: 'named', key: 'apply_type', label: '申请类型' },
  dates('申请日', 'app_date_start', 'app_date_end'),
  { kind: 'named', key: 'history', label: '历史审核记录' },
  { kind: 'named', key: 'sales_user_id', label: '业务员' },
  { kind: 'named', key: 'branch_dept', label: '案件所属分部' },
  { kind: 'text', key: 'history_remark', label: '流程审核备注' },
  { kind: 'select', key: 'audit_type', label: '办理类型' }
]

export function filingCellKeys(cell: FilingCell): string[] {
  return cell.kind === 'dates' ? [cell.start, cell.end] : [cell.key]
}

export function filingFieldLabel(name: string): string {
  return FILING_FIELD_LABELS[name] ?? name
}

/** 表单上填了值的字段。空字符串不进查询，也不进显示文本。 */
export function filingDraftFields(values: Record<string, string>): { fields: Record<string, string>; displayValues: Record<string, string> } {
  const fields: Record<string, string> = {}
  const displayValues: Record<string, string> = {}
  for (const name of FILING_INPUT_FIELDS as readonly FilingInputField[]) {
    const value = (values[name] ?? '').trim()
    if (!value) continue
    fields[name] = value
    const display = (values[`${name}_text`] ?? '').trim()
    if (display && display !== value) displayValues[name] = display
  }
  return { fields, displayValues }
}
