import { expect, it } from 'vitest'
import { buildFileTypeTree } from '../../../src/schema/file-type-tree'
import { mailTypePath, matchMailTypePath } from '../../../src/customer/mail-type-path'
const root = 'aaaaaaaa-1111-4111-8111-111111111111'
const leaf = 'bbbbbbbb-1111-4111-8111-111111111111'
it('文件描述保留组合ID的分类和子节点', () => {
  const category = `${root}_${leaf}`
  const tree = buildFileTypeTree([{ id: root, name: '专利', pid: '' }, { id: category, name: '分类', pid: root }, { id: leaf, name: '文件', pid: category }])
  expect(tree.rootIds).toEqual([root])
  expect(tree.nodes.find(n => n.id === category)?.childIds).toEqual([leaf])
  expect(tree.nodes.find(n => n.id === category)?.selectable).toBe(false)
})
it('同名叶子按完整树路径定位，路径不存在不能退回同名项', () => {
  const nodes = [{ id: 'a', name: '分支甲' }, { id: 'b', name: '分支乙' }, { id: 'x', name: '同名', parentId: 'a' }, { id: 'y', name: '同名', parentId: 'b' }]
  expect(mailTypePath(nodes, 'y')).toBe('分支乙/同名')
  expect(matchMailTypePath(nodes, '同名', '分支乙/同名')?.id).toBe('y')
  expect(matchMailTypePath(nodes, '同名')).toBeNull()
  expect(matchMailTypePath(nodes, '同名', '不存在/同名')).toBeNull()
})
