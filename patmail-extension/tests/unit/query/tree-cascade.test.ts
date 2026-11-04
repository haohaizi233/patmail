import { expect, it } from 'vitest'
import { buildOptionTree, toggleTreeSelection, treeCheckState } from '../../../src/query/option-tree'
const tree = buildOptionTree([
  { value: 'root', label: '根' }, { value: 'group', label: '分类', parent: 'root', selectable: false },
  { value: 'a', label: '甲', parent: 'group' }, { value: 'b', label: '乙', parent: 'group' }, { value: 'other', label: '其他' }
])
it('父节点勾选覆盖所有后代，分类只参与联动不作为业务值提交', () => {
  expect(toggleTreeSelection(tree, [], 'root')).toEqual(['root', 'a', 'b'])
  expect(toggleTreeSelection(tree, [], 'group')).toEqual(['a', 'b'])
})
it('取消子节点移除祖先完整选中，保留兄弟和其他分支；再勾子节点不自动选祖先', () => {
  const selected = toggleTreeSelection(tree, ['root', 'a', 'b', 'other'], 'a')
  expect(selected).toEqual(['b', 'other'])
  expect(treeCheckState(tree, selected, 'group')).toEqual({ checked: false, indeterminate: true })
  expect(toggleTreeSelection(tree, selected, 'a')).toEqual(['b', 'other', 'a'])
  expect(toggleTreeSelection(tree, ['a', 'b', 'other'], 'group')).toEqual(['other'])
})

it('重复人员ID只挂载一次，优先保留有效父级，不作为孤立根节点重复显示', () => {
  const duplicated = buildOptionTree([
    { value: 'person', label: '人员', parent: 'deleted' },
    { value: 'company', label: '公司' },
    { value: 'dept', label: '部门', parent: 'company' },
    { value: 'person', label: '人员', parent: 'dept' },
    { value: 'person', label: '人员', parent: 'deleted' }
  ])
  expect(duplicated.roots).toEqual(['company'])
  expect(duplicated.byId.get('dept')?.childIds).toEqual(['person'])
  expect(toggleTreeSelection(duplicated, [], 'company')).toEqual(['company', 'dept', 'person'])
})
