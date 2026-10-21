import { FILING_INPUT_FIELDS, type FilingInputField } from './filing-search-params'

/** 递交管理查询条件的排版。来源：`Forms/NewFiling/Filing.aspx` 的「查询条件」区，一排两个条件。 */

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

/** 递交条件下拉对应的字典名。字典由 loadPicker 从原站实时拉，键名见 dictionaries/picker-catalog。 */
export const FILING_OPTION_KEYS: Record<string, string> = {
  ctrl_proc: 'limitCtrlProc',
  activity: 'filingFlowNode',
  flow_direction: 'limitDirection',
  case_type: 'limitCaseType',
  audit_user_id: 'user',
  create_user_id: 'user',
  sales_user_id: 'user',
  business_coop: 'filingContract',
  apply_type: 'limitApplyType',
  branch_dept: 'branch'
}

const dates = (label: string, start: string, end: string): FilingDateCell => ({ kind: 'dates', label, start, end })

/**
 * 查询条件按页面左右两列排。原站页面上的下拉里，
 * 「是否需要纸质通知书」「历史审核记录」「办理类型」的取值没有抓包样本，
 * 这三项先按文本提交，页面显示值本身就是提交值。
 */
export const FILING_BLOCKS: FilingCell[] = [
  { kind: 'text', key: 'case_volume', label: '我方文号' },
  { kind: 'named', key: 'ctrl_proc', label: '处理事项' },
  { kind: 'text', key: 'customer_volume', label: '客户文号' },
  { kind: 'text', key: 'customer', label: '客户' },
  { kind: 'text', key: 'customer_code', label: '客户代码' },
  { kind: 'named', key: 'flow_direction', label: '案件流向' },
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
  { kind: 'text', key: 'is_paper_notice', label: '是否需要纸质通知书', hint: '原站是下拉，取值未核对，先按文本提交' },
  { kind: 'text', key: 'agent_name', label: '代理人' },
  { kind: 'text', key: 'applicant', label: '申请人' },
  { kind: 'text', key: 'app_no', label: '申请号' },
  { kind: 'named', key: 'apply_type', label: '申请类型' },
  dates('申请日', 'app_date_start', 'app_date_end'),
  { kind: 'text', key: 'history', label: '历史审核记录', hint: '原站是下拉，取值未核对，先按文本提交' },
  { kind: 'named', key: 'sales_user_id', label: '业务员' },
  { kind: 'named', key: 'branch_dept', label: '案件所属分部' },
  { kind: 'text', key: 'history_remark', label: '流程审核备注' },
  { kind: 'text', key: 'audit_type', label: '办理类型', hint: '原站是下拉，取值未核对，先按文本提交' }
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
