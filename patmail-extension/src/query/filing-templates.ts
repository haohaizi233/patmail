import type { QueryTemplate } from './query-types'

/**
 * 递交查询的本地模板。原站的递交列表没有查询模板，也无处写回：
 * 模板只存本机配置包（storage/query-bundle），条件口径和递交管理的表单一致，
 * 主条件是 api/filing-form 的输入字段，树形框的中文名另存 `{字段}` 的显示文本。
 */
export const FILING_TEMPLATE_TYPE = 'FilingSearch'

/** 配置包里属于递交查询的模板。别的查询类型的模板不能套进递交表单。 */
export function filingTemplatesOf(templates: readonly QueryTemplate[]): QueryTemplate[] {
  return templates.filter(item => item.source === 'local' && item.queryType === FILING_TEMPLATE_TYPE)
}

/** 套用模板时填回表单的值：主条件直接进 values，显示文本写 `{字段}_text`，和表单自己存的口径一致。 */
export function filingTemplateValues(template: QueryTemplate): Record<string, string> {
  const values: Record<string, string> = { ...template.fields }
  for (const [key, text] of Object.entries(template.displayValues ?? {})) {
    const label = text.trim()
    if (label) values[`${key}_text`] = label
  }
  return values
}

/** 内置模板的条件按显示名写。处理事项这类树形框的内部 ID 是各租户自己的数据，不能写进代码，套用时再和下拉对上。 */
export interface FilingBuiltinCondition {
  /** 条件字段键，只收递交表单的输入字段。 */
  key: string
  /** 显示名；树形框多选就写多个。 */
  labels: string[]
}

/** 随扩展内置的递交模板：固定在代码里，谁登录都能点，不能改也不能删。改条件就「保存到本地」存成自己的。 */
export interface FilingBuiltinTemplate {
  id: string
  name: string
  conditions: FilingBuiltinCondition[]
}

/** 内置模板「退回」：查新申请、客户自撰里被退回的递交。就这两个条件，其余条件留着你自己的填法。 */
export const FILING_BUILTIN_TEMPLATES: FilingBuiltinTemplate[] = [
  {
    id: 'builtin-filing-returned',
    name: '退回',
    conditions: [
      { key: 'ctrl_proc', labels: ['新申请', '客户自撰'] },
      { key: 'audit_type', labels: ['退回'] }
    ]
  }
]

export interface FilingBuiltinOption {
  value: string
  label: string
}

export interface FilingBuiltinApplied {
  /** 覆盖内置模板自己的条件，其余键原样留着。 */
  values: Record<string, string>
  /** 没对上下拉的条件值。这种时候不套用，免得查出来的范围悄悄变宽。 */
  missing: Array<{ key: string; label: string }>
}

/** 按显示名对出内部 ID：对得上的写进 values（显示文本写 `{字段}_text`），对不上的记进 missing。 */
export function applyFilingBuiltin(
  template: FilingBuiltinTemplate,
  optionsOf: (key: string) => readonly FilingBuiltinOption[],
  base: Record<string, string> = {}
): FilingBuiltinApplied {
  const values = { ...base }
  const missing: Array<{ key: string; label: string }> = []
  for (const condition of template.conditions) {
    const options = optionsOf(condition.key)
    const ids: string[] = []
    const labels: string[] = []
    for (const label of condition.labels) {
      const hit = options.find(item => item.label === label || item.value === label)
      if (!hit) {
        missing.push({ key: condition.key, label })
        continue
      }
      ids.push(hit.value)
      labels.push(hit.label)
    }
    if (!ids.length) continue
    values[condition.key] = ids.join(',')
    const text = labels.join('，')
    if (text !== ids.join(',')) values[`${condition.key}_text`] = text
  }
  return { values, missing }
}
