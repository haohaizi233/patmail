export interface MailTypePathNode { id: string; name: string; parentId?: string }
/** 缺父节点或有环时拒绝伪造不完整路径。 */
export function mailTypePath(nodes: MailTypePathNode[], id: string): string {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const names: string[] = [], seen = new Set<string>()
  while (id) {
    if (seen.has(id)) return ''
    seen.add(id)
    const node = byId.get(id)
    if (!node) return ''
    names.unshift(node.name.trim()); id = node.parentId ?? ''
  }
  return names.join('/')
}
function normalized(path: string): string { return path.split('/').map(part => part.trim()).join('/') }
/** 旧配置无路径时仅接受唯一叶子；有路径时绝不回退到叶子同名项。 */
export function matchMailTypePath(nodes: MailTypePathNode[], name: string, path?: string): MailTypePathNode | null {
  const parents = new Set(nodes.map(node => node.parentId).filter(Boolean))
  const matches = nodes.filter(node => node.id && !parents.has(node.id) && (path ? normalized(mailTypePath(nodes, node.id)) === normalized(path) && node.name.trim() === name.trim() : node.name.trim() === name.trim()))
  return matches.length === 1 ? matches[0] : null
}
