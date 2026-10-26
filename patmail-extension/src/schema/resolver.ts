import type { DictionaryOption } from '../api/dictionaries/types'

export interface ResolvedDisplay {
  text: string
  unresolved: boolean
}

/** 只生成展示文案，不改写已经保存的内部 ID。 */
export function resolveInternalIdDisplay(value: string, options: DictionaryOption[], multiple = false): ResolvedDisplay {
  if (!value.trim()) return { text: '未设置', unresolved: false }
  const ids = multiple ? value.split(',').map(item => item.trim()).filter(Boolean) : [value.trim()]
  const labels = ids.map(id => options.find(item => item.value === id)?.label)
  if (labels.some(label => !label)) return { text: '未识别的历史 ID', unresolved: true }
  return { text: labels.join('、'), unresolved: false }
}

export function unknownIds(value: string, options: DictionaryOption[]): string[] {
  return value.split(',').map(item => item.trim()).filter(id => id && !options.some(item => item.value === id))
}

/**
 * 多选值（逗号拼的内部 ID）逐个换显示名，再用逗号拼回去，和原站 `{控件}_text` 的写法一致。
 * 有一个换不出来就返回空串：宁可不写这节，也不把 GUID 串当名字存进模板。
 */
export function resolveMultiLabel(value: string, options: Array<{ value: string; label: string }>): string {
  const parts = value.split(',').map(item => item.trim()).filter(Boolean)
  const labels = parts.map(part => options.find(item => item.value === part)?.label?.trim() ?? '')
  return parts.length > 0 && labels.every(Boolean) ? labels.join(',') : ''
}

export interface FileDescriptionDisplay {
  ids: string[]
  labels: string[]
  resolved: boolean
  unresolvedIds: string[]
  text: string
}

/** 内部 ID 串的样子：十六进制段用短横线连起来。名字里一般有中文，不会长成这样。 */
export function looksLikeInternalIds(value: string): boolean {
  const parts = value.split(/[,，]/).map(item => item.trim()).filter(Boolean)
  return parts.length > 0 && parts.every(part => /^[0-9a-f-]{16,}$/i.test(part) && part.includes('-'))
}

/** 手工查询和历史模板共用。历史显示文本不能把未解析 ID 标成已解析，也不能把 GUID 串当名字摆出来。 */
export function resolveFileDescriptionDisplay(input: {
  savedIds: string
  descriptions?: Array<{ id: string; name: string }>
  historyText?: string
}): FileDescriptionDisplay {
  const ids = input.savedIds.split(',').map(item => item.trim()).filter(Boolean)
  const descriptions = input.descriptions ?? []
  const labels: string[] = []
  const unresolvedIds: string[] = []
  for (const id of ids) {
    const name = descriptions.find(item => item.id.toLowerCase() === id.toLowerCase())?.name
    if (name) labels.push(name)
    else unresolvedIds.push(id)
  }
  const resolved = ids.length > 0 && unresolvedIds.length === 0
  // 历史文本如果本身就是 ID 串（模板存坏了），不能当名字显示。
  const history = input.historyText?.trim() ?? ''
  const historyText = history && !looksLikeInternalIds(history) ? history : ''
  let text = '未设置'
  if (ids.length === 0) text = '未设置'
  else if (resolved) text = labels.join('、')
  else if (historyText) text = `${historyText}（未识别的历史 ID）`
  else text = ids.length > 1 ? `已选 ${ids.length} 项（未识别的历史 ID）` : '未识别的历史 ID'
  return { ids, labels, resolved, unresolvedIds, text }
}
