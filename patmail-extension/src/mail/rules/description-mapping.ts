import { isQueryGuid } from '../../query/query-validator'
import { pageSelectOptions } from '../../query/form-page'
import type { DescriptionMailTypeMapping, MailGroup } from '../types'

/** EASY 的文件描述树会在标签末尾附上六位文书编号及可选字母后缀。 */
export function fileDescriptionBase(value?: string): string {
  return (value ?? '').trim().replace(/\s*(?:\(\d{6}[A-Z]{0,4}\)|（\d{6}[A-Z]{0,4}）)$/i, '')
}

export function descriptionMappingsOverlap(left: DescriptionMailTypeMapping, right: DescriptionMailTypeMapping): boolean {
  const key = mappingKey(left)
  if (key && key === mappingKey(right)) return true
  const text = left.fileDescriptionText?.trim()
  const other = right.fileDescriptionText?.trim()
  if (!text || !other) return false
  return text === other || text === fileDescriptionBase(other) || other === fileDescriptionBase(text)
}

export function resolveDescriptionText(description: string, mappings: DescriptionMailTypeMapping[]): {
  mapping: DescriptionMailTypeMapping | null
  conflict: boolean
  ambiguousDescription?: boolean
  fallbackLabel?: string
} {
  const text = description.trim()
  const base = fileDescriptionBase(text)
  if (!base) return { mapping: null, conflict: false }
  const hits = mappings.filter(item => {
    if (!item.enabled || !isQueryGuid(item.mailTypeId)) return false
    const label = item.fileDescriptionText?.trim()
    return text === base ? fileDescriptionBase(label) === base : label === text || label === base
  })
  if (new Set(hits.map(item => item.mailTypeId.toLowerCase())).size > 1) return { mapping: null, conflict: true }
  const exact = hits.find(item => item.fileDescriptionText?.trim() === text)
  if (exact || text !== base || !hits.length) return { mapping: exact ?? null, conflict: false }
  const nodes = pageSelectOptions('filetype') ?? []
  const parents = new Set(nodes.map(node => node.parent).filter(Boolean))
  const candidates = nodes.filter(node => !parents.has(node.value) && fileDescriptionBase(node.label) === base)
  if (candidates.length > 1) return { mapping: null, conflict: true, ambiguousDescription: true }
  const fallback = candidates.length === 1 ? hits.find(item => item.fileDescriptionText?.trim() === candidates[0].label) : null
  return fallback ? { mapping: fallback, conflict: false, fallbackLabel: candidates[0].label } : { mapping: null, conflict: false }
}

export function mappingKey(item: { fileDescriptionId?: string; fileDescriptionText?: string }): string | null {
  const id = item.fileDescriptionId?.trim()
  if (id) return `id:${id.toLowerCase()}`
  const text = item.fileDescriptionText?.trim()
  return text ? `text:${text}` : null
}

export function resolveMailType(group: MailGroup, mappings: DescriptionMailTypeMapping[]): { mapping: DescriptionMailTypeMapping | null; conflict: boolean } {
  if (group.descriptionIdentity.startsWith('text:')) return resolveDescriptionText(group.descriptionIdentity.slice(5), mappings.filter(item => !item.fileDescriptionId?.trim()))
  const enabled = mappings.filter(item => item.enabled && isQueryGuid(item.mailTypeId) && mappingKey(item) === group.descriptionIdentity.toLowerCase())
  if (enabled.length > 1) return { mapping: null, conflict: true }
  return { mapping: enabled[0] ?? null, conflict: false }
}

/** 有内部 ID 时只按 ID 匹配。同一键有多条有效映射时不取第一条。 */
export function matchMailType(group: MailGroup, mappings: DescriptionMailTypeMapping[]): DescriptionMailTypeMapping | null {
  return resolveMailType(group, mappings).mapping
}

export function upsertMapping(mappings: DescriptionMailTypeMapping[], next: DescriptionMailTypeMapping): { ok: true; mappings: DescriptionMailTypeMapping[] } | { ok: false; message: string } {
  const key = mappingKey(next)
  if (!key || !isQueryGuid(next.mailTypeId)) return { ok: false, message: '请填写文件描述，并选择发文类型。' }
  const clash = mappings.find(item => item.id !== next.id && item.enabled && next.enabled && descriptionMappingsOverlap(item, next) && item.mailTypeId.toLowerCase() !== next.mailTypeId.toLowerCase())
  if (clash) return { ok: false, message: '同一文件描述已经对应另一个发文类型。请修改原映射或取消。' }
  const previous = mappings.find(item => item.id === next.id)
  const saved = { ...next, version: (previous?.version ?? 0) + 1, updatedAt: new Date().toISOString() }
  return { ok: true, mappings: mappings.filter(item => item.id !== next.id).concat(saved) }
}
