import { isQueryGuid } from '../../query/query-validator'
import type { TreeOption } from '../../query/option-tree'

const NUMBER_SUFFIX = /\s*(?:\((\d{6}[A-Z]{0,4})\)|（(\d{6}[A-Z]{0,4})）)$/i

export function fileDescriptionBase(value?: string): string {
  return (value ?? '').trim().replace(NUMBER_SUFFIX, '')
}

export function createFileDescriptionLeafResolver(nodes: TreeOption[]) {
  const byId = new Map<string, TreeOption[]>()
  const parents = new Set(nodes.map(node => node.parent?.toLowerCase()).filter(Boolean))
  for (const node of nodes) {
    const id = node.value.toLowerCase()
    const same = byId.get(id) ?? []
    same.push(node)
    byId.set(id, same)
  }
  const leaves = nodes.flatMap(node => {
    const id = node.value.toLowerCase()
    const label = node.label.trim()
    if (!label || !isQueryGuid(id) || node.selectable === false || parents.has(id) || byId.get(id)?.length !== 1) return []
    const ancestors: string[] = []
    const visited = new Set([id])
    let parentId = node.parent?.toLowerCase()
    while (parentId) {
      const matches = byId.get(parentId)
      if (visited.has(parentId) || matches?.length !== 1) return []
      visited.add(parentId)
      ancestors.push(matches[0].label.trim())
      parentId = matches[0].parent?.toLowerCase()
    }
    const suffix = label.match(NUMBER_SUFFIX)
    const path = [...ancestors].reverse().concat(label).join(' / ')
    return [{ id, label, path, base: fileDescriptionBase(label), code: (suffix?.[1] ?? suffix?.[2])?.toUpperCase(), ancestors }]
  })
  return (input: { fileDescription?: string; fileDescriptionCode?: string; fileType?: string; fileDescriptionId?: string }) => {
    const text = input.fileDescription?.trim() ?? ''
    if (input.fileDescriptionId) {
      const leaf = leaves.find(item => item.id === input.fileDescriptionId?.trim().toLowerCase())
      const match = leaf && (!text || text === leaf.label || text === leaf.base) ? leaf : null
      return { leaf: match, ambiguous: false, candidates: match ? [match] : [] }
    }
    const suffix = text.match(NUMBER_SUFFIX)
    const code = input.fileDescriptionCode?.trim().toUpperCase() || (suffix?.[1] ?? suffix?.[2])?.toUpperCase()
    const kind = input.fileType?.trim()
    if (!text && !code) return { leaf: null, ambiguous: false, candidates: [] }
    const base = fileDescriptionBase(text)
    let candidates = leaves.filter(leaf => (!text || (suffix ? leaf.label === text : leaf.base === base)) &&
      (!kind || leaf.ancestors.includes(kind)))
    if (code && (!text || candidates.some(leaf => leaf.code))) {
      candidates = candidates.filter(leaf => leaf.code === code)
    }
    return { leaf: candidates.length === 1 ? candidates[0] : null, ambiguous: candidates.length > 1, candidates }
  }
}
