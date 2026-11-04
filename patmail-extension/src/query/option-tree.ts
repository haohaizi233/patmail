export interface TreeOption {
  value: string
  label: string
  selectable?: boolean
  parent?: string
}

export interface OptionTreeNode {
  value: string
  label: string
  selectable?: boolean
  childIds: string[]
}

export interface OptionTree {
  roots: string[]
  byId: Map<string, OptionTreeNode>
}

/** 至少有一个选项的父节点也在这份列表里，才按树展示。 */
export function hasOptionTree(options: readonly TreeOption[]): boolean {
  const ids = new Set(options.map(item => item.value))
  return options.some(item => Boolean(item.parent) && item.parent !== item.value && ids.has(item.parent ?? ''))
}

export function buildOptionTree(options: readonly TreeOption[]): OptionTree {
  // 字典可能重复返回同一业务ID。只保留一次，已有有效父级优先于悬空副本。
  const ids = new Set(options.map(option => option.value).filter(Boolean))
  const canonical = new Map<string, TreeOption>()
  const linked = (option: TreeOption) => !!option.parent && option.parent !== option.value && ids.has(option.parent)
  for (const option of options) {
    if (!option.value) continue
    const previous = canonical.get(option.value)
    if (!previous || (!linked(previous) && linked(option))) canonical.set(option.value, option)
  }
  const byId = new Map<string, OptionTreeNode>()
  for (const option of canonical.values()) {
    byId.set(option.value, { value: option.value, label: option.label, childIds: [], ...(option.selectable === false ? { selectable: false } : {}) })
  }
  const roots: string[] = []
  for (const option of canonical.values()) {
    const node = byId.get(option.value)!
    const parent = option.parent && option.parent !== option.value ? byId.get(option.parent) : undefined
    if (parent) parent.childIds.push(node.value)
    else roots.push(node.value)
  }
  return { roots, byId }
}

/** 搜索命中节点，并带上通往根的父级，方便手动展开前先看到路径。 */
export function searchOptionTree(tree: OptionTree, query: string): { visible: Set<string>; expand: Set<string> } {
  const text = query.trim().toLowerCase()
  const visible = new Set<string>()
  const expand = new Set<string>()
  if (!text) return { visible, expand }
  const parentOf = new Map<string, string>()
  for (const node of tree.byId.values()) {
    for (const childId of node.childIds) parentOf.set(childId, node.value)
  }
  for (const node of tree.byId.values()) {
    if (!node.label.toLowerCase().includes(text)) continue
    visible.add(node.value)
    let parent = parentOf.get(node.value)
    const trail = new Set<string>([node.value])
    while (parent && !trail.has(parent)) {
      visible.add(parent)
      expand.add(parent)
      trail.add(parent)
      parent = parentOf.get(parent)
    }
  }
  return { visible, expand }
}
/** 完整子树，不受搜索过滤或展开状态影响。 */
function subtreeIds(tree: OptionTree, id: string): string[] {
  const ids: string[] = [], seen = new Set<string>()
  const visit = (key: string) => {
    if (seen.has(key) || !tree.byId.has(key)) return
    seen.add(key); ids.push(key)
    for (const child of tree.byId.get(key)!.childIds) visit(child)
  }
  visit(id)
  return ids
}

export function treeCheckState(tree: OptionTree, selected: readonly string[], id: string): { checked: boolean; indeterminate: boolean } {
  const node = tree.byId.get(id)
  const values = subtreeIds(tree, id).filter(key => tree.byId.get(key)?.selectable !== false)
  const chosen = new Set(selected)
  const checked = node?.selectable === false ? values.length > 0 && values.every(key => chosen.has(key)) : chosen.has(id)
  return { checked, indeterminate: !checked && values.some(key => chosen.has(key)) }
}

/** 原站 OrgTree.js 默认 Y:s、N:ps：选中向下，取消向上和向下。 */
export function toggleTreeSelection(tree: OptionTree, selected: readonly string[], id: string): string[] {
  const node = tree.byId.get(id)
  if (!node || (node.selectable === false && !node.childIds.length)) return [...selected]
  const next = new Set(selected)
  const remove = treeCheckState(tree, selected, id).checked
  for (const key of subtreeIds(tree, id)) {
    if (remove) next.delete(key)
    else if (tree.byId.get(key)?.selectable !== false) next.add(key)
  }
  if (remove) {
    const parentOf = new Map<string, string>()
    for (const parent of tree.byId.values()) for (const child of parent.childIds) parentOf.set(child, parent.value)
    const seen = new Set<string>([id])
    let parent = parentOf.get(id)
    while (parent && !seen.has(parent)) { seen.add(parent); next.delete(parent); parent = parentOf.get(parent) }
  }
  return [...next]
}
