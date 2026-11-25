export interface MailTypePathNode { id: string; name: string; parentId?: string }
/** 缺父节点、编号重复或有环时拒绝采用路径。 */
export function mailTypePath(nodes: MailTypePathNode[], id: string): string {
  const byId = new Map<string, MailTypePathNode | null>()
  for (const node of nodes) {
    const key = node.id.toLowerCase()
    byId.set(key, byId.has(key) ? null : node)
  }
  const names: string[] = [], seen = new Set<string>()
  while (id) {
    const key = id.toLowerCase()
    if (seen.has(key)) return ''
    seen.add(key)
    const node = byId.get(key)
    if (!node) return ''
    names.unshift(node.name.trim()); id = node.parentId ?? ''
  }
  return names.join('/')
}
function normalized(path: string): string { return path.split('/').map(part => part.trim()).join('/') }
/** 旧配置无路径时仅接受唯一叶子；有路径时绝不回退到叶子同名项。 */
export function matchMailTypePath(nodes: MailTypePathNode[], name: string, path?: string): MailTypePathNode | null {
  const parents = new Set(nodes.map(node => node.parentId?.toLowerCase()).filter(Boolean))
  const matches = nodes.filter(node => {
    if (!node.id.trim() || parents.has(node.id.toLowerCase()) || node.name.trim() !== name.trim()) return false
    if (!path) return true
    const actual = mailTypePath(nodes, node.id)
    return Boolean(actual && normalized(actual) === normalized(path))
  })
  if (!path && matches.length === 1 && !mailTypePath(nodes, matches[0].id)) return null
  return matches.length === 1 ? matches[0] : null
}
