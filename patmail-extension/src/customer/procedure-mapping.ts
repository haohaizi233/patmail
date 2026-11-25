import type { ProcedureMailTypeMapping } from '../mail/types'
import type { TreeOption } from '../query/option-tree'
import { PCT_CUSTOMER_VOLUME_TYPE_NAME, PCT_OUR_VOLUME_TYPE_NAME } from '../workflow/pct-config'
import { DESIGN_CUSTOMER_TYPE, DESIGN_OUR_TYPE, NATIONAL_CUSTOMER_TYPE, NATIONAL_OUR_TYPE, NATIONAL_PROC_LABEL } from './pct-sheet'

/** 系统内置规则；不写入用户可编辑配置。每个名称都是树中叶子节点的全名。 */
export const PROCEDURE_MAIL_MAPPINGS = Object.freeze([
  { procedure: '提醒申请PCT', customer: PCT_CUSTOMER_VOLUME_TYPE_NAME, our: PCT_OUR_VOLUME_TYPE_NAME },
  { procedure: NATIONAL_PROC_LABEL, customer: NATIONAL_CUSTOMER_TYPE, our: NATIONAL_OUR_TYPE },
  { procedure: '提醒申请涉外外观', customer: DESIGN_CUSTOMER_TYPE, our: DESIGN_OUR_TYPE }
].map(row => Object.freeze(row)))

export function isProcedureMapping(value: unknown): value is ProcedureMailTypeMapping {
  if (!value || typeof value !== 'object') return false
  const row = value as ProcedureMailTypeMapping
  return (row.mailTypePath === undefined || (typeof row.mailTypePath === 'string' && !!row.mailTypePath.trim() && row.mailTypePath.length <= 2000)) && typeof row.id === 'string' && !!row.id.trim() && typeof row.procedure === 'string' && !!row.procedure.trim() && row.procedure.length <= 80 &&
    (row.condition === 'none' || row.condition === 'customer' || row.condition === 'our') && typeof row.mailTypeName === 'string' && !!row.mailTypeName.trim() && row.mailTypeName.length <= 240
}

export function validProcedureMappings(rows: ProcedureMailTypeMapping[]): boolean {
  const keys = new Set<string>()
  const ids = new Set<string>()
  return rows.every(row => {
    const key = JSON.stringify([row.procedure.trim(), row.condition])
    if (ids.has(row.id) || keys.has(key) || PROCEDURE_MAIL_MAPPINGS.some(item => item.procedure === row.procedure.trim())) return false
    ids.add(row.id); keys.add(key)
    return true
  })
}

export function matchProcedureLeaf(nodes: TreeOption[], label: string): TreeOption | null {
  const matches = nodes.filter(node => node.value && node.selectable !== false && node.label.trim() === label.trim() &&
    !nodes.some(child => child.parent === node.value))
  const picked = matches.length === 1 ? matches[0] : undefined
  if (!picked || nodes.filter(node => node.value === picked.value).length !== 1) return null
  return picked
}
