import { isFileSearchBusinessField } from '../api/file-search-params'
import { FILE_PICKER_FIELDS } from '../api/dictionaries/picker-catalog'
import type { FileSearchFormField } from '../shared/message'
import { formFieldKey } from './form-page'
import { primaryQueryKeys, type QueryCell } from './form-layout'

function toCell(field: FileSearchFormField, key: string): QueryCell | null {
  const label = field.label.trim() || key
  if (key === 'filetype') return { kind: 'files', key, label }
  if (field.control === 'check') return { kind: 'checks', label, items: [{ key, label }] }
  if (field.control === 'select') return { kind: 'select', key, label }
  // 原站 TreeUser 字段（专利标签这种）在快照/缓存里可能记成 text：控件是接口回来后才异步初始化的。
  // 认识这个字段的下拉来源就按树形框渲染，不能退化成自由文本——原站只收内部 ID，手打名字查不到。
  if (field.control === 'picker' || FILE_PICKER_FIELDS[key]) return { kind: 'named', key, label }
  if (field.control === 'text') return { kind: 'text', key, label }
  return null
}

/** 原网站查询页上、第一屏之外、当前能看见的条件。藏起来的不放进来。 */
export function cellsFromLiveFields(fields: readonly FileSearchFormField[]): { case: QueryCell[]; file: QueryCell[] } {
  const primary = primaryQueryKeys()
  const seen = new Set<string>()
  const grouped = { case: [] as QueryCell[], file: [] as QueryCell[] }
  for (const field of fields) {
    if (!field.visible) continue
    const key = formFieldKey(field.id)
    if (!key || !isFileSearchBusinessField(key) || primary.has(key) || seen.has(key)) continue
    const cell = toCell(field, key)
    if (!cell) continue
    seen.add(key)
    grouped[field.section === 'file' ? 'file' : 'case'].push(cell)
  }
  return grouped
}
