import { mailTypePath, matchMailTypePath, type MailTypePathNode } from './mail-type-path'
import type { ProcedureMailTypeMapping } from '../mail/types'
import type { TreeOption } from '../query/option-tree'
import { matchMailTypeByName } from './mail-flow'
import { isProcedureMapping, PROCEDURE_MAIL_MAPPINGS, validProcedureMappings } from './procedure-mapping'

export function procedureConditionLabel(condition: ProcedureMailTypeMapping['condition']): string {
  return condition === 'none' ? '无' : condition === 'customer' ? '有客户文号' : '无客户文号，使用我方文号'
}

export function exportProcedureMappings(custom: ProcedureMailTypeMapping[], mailTypes: MailTypePathNode[] = []): string[][] {
  const path = (name: string, saved?: string) => saved || mailTypePath(mailTypes, matchMailTypePath(mailTypes, name)?.id ?? '') || name
  return [
    ['处理事项', '文号条件', '发文类型', '来源'],
    ...PROCEDURE_MAIL_MAPPINGS.flatMap(row => [
      [row.procedure, '有客户文号', path(row.customer), '系统内置'],
      [row.procedure, '无客户文号，使用我方文号', path(row.our), '系统内置']
    ]),
    ...custom.map(row => [row.procedure, procedureConditionLabel(row.condition), path(row.mailTypeName, row.mailTypePath), '自定义'])
  ]
}

type ImportResult = { ok: true; mappings: ProcedureMailTypeMapping[]; added: number; notice: string } | { ok: false; message: string }

/** 整表校验成功后才保存；同事项、同条件已有映射不覆盖。 */
export function importProcedureMappings(
  existing: ProcedureMailTypeMapping[], table: string[][],
  mailTypes: Array<{ id: string; name: string; parentId?: string }>, procedures: TreeOption[],
  createId: () => string
): ImportResult {
  const header = (table[0] ?? []).map(cell => cell.trim())
  const procCol = header.indexOf('处理事项'), typeCol = header.indexOf('发文类型'), conditionCol = header.indexOf('文号条件')
  if (procCol < 0 || typeCol < 0) return { ok: false, message: '表格需要「处理事项」和「发文类型」两列，文号条件留空时按「无」。' }
  const pending = [...existing]
  let skipped = 0
  for (let index = 1; index < table.length; index++) {
    const row = table[index]
    if (!row.some(cell => cell.trim())) continue
    const procedure = (row[procCol] ?? '').trim(), name = (row[typeCol] ?? '').trim()
    const label = conditionCol < 0 ? '' : (row[conditionCol] ?? '').trim()
    const fail = (message: string): ImportResult => ({ ok: false, message: `第 ${index + 1} 行：${message}本次未导入。` })
    if (!procedure || !name) return fail('处理事项或发文类型为空。')
    // 内置项来自代码，导出后再导入也不能修改。
    if (PROCEDURE_MAIL_MAPPINGS.some(item => item.procedure === procedure)) { skipped++; continue }
    const condition = !label || label === '无' ? 'none' : label === '有客户文号' ? 'customer' : label === '无客户文号，使用我方文号' ? 'our' : null
    if (!condition) return fail('文号条件应为「无」「有客户文号」或「无客户文号，使用我方文号」。')
    const matches = procedures.filter(item => item.value && item.label === procedure && !procedures.some(child => child.parent === item.value))
    if (matches.length !== 1) return fail('处理事项没有唯一对应原站的具体事项，请核对全名或重新读取。')
    const leafName = name.split('/').at(-1)?.trim() ?? ''
    const picked = matchMailTypePath(mailTypes, leafName, name.includes('/') ? name : undefined)
    if (!picked) return fail('发文类型没有唯一同名叶子节点，请核对完整名称或重新读取。')
    const found = pending.find(item => item.procedure === procedure && item.condition === condition)
    if (found) {
      if (!matchMailTypePath(mailTypes, found.mailTypeName, found.mailTypePath) || matchMailTypePath(mailTypes, found.mailTypeName, found.mailTypePath)?.id !== picked.id) return fail('该事项和文号条件已有其他映射，请先删除原项。')
      skipped++; continue
    }
    const next: ProcedureMailTypeMapping = { id: createId(), procedure, condition, mailTypeName: picked.name, mailTypePath: mailTypePath(mailTypes, picked.id) }
    if (!isProcedureMapping(next)) return fail('映射内容超出长度限制。')
    pending.push(next)
  }
  if (!validProcedureMappings(pending)) return { ok: false, message: '映射存在重复或无效条目，本次未导入。' }
  const added = pending.length - existing.length
  return { ok: true, mappings: pending, added, notice: `新增 ${added} 条，跳过内置或重复项 ${skipped} 条。` }
}
