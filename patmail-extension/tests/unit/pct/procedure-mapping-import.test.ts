import { expect, it } from 'vitest'
import { exportProcedureMappings, importProcedureMappings } from '../../../src/customer/procedure-mapping-import'
const custom = [{ id: 'old', procedure: '事项甲', condition: 'none' as const, mailTypeName: '类型甲' }]
const types = [{ id: 'type', name: '类型甲', parentId: '' }]
const procedures = [{ value: 'proc', label: '事项甲' }]
it('导出包含内置与自定义，往返不重复导入内置项', () => {
  const rows = exportProcedureMappings(custom)
  expect(rows).toHaveLength(8)
  const result = importProcedureMappings([], rows, types, procedures, () => 'new')
  expect(result.ok).toBe(true)
  if (result.ok) { expect(result.added).toBe(1); expect(result.mappings[0]).toMatchObject({ procedure: '事项甲', condition: 'none', mailTypeName: '类型甲' }) }
})
it('空条件默认无，同条重复跳过，冲突和非精确名称拒绝且不修改原配置', () => {
  const rows = [['处理事项', '文号条件', '发文类型'], ['事项甲', '', '类型甲']]
  const same = importProcedureMappings(custom, rows, types, procedures, () => 'new')
  expect(same.ok && same.added).toBe(0)
  expect(importProcedureMappings(custom, [rows[0], ['事项甲', '无', '类型甲-后缀']], types, procedures, () => 'new').ok).toBe(false)
  expect(importProcedureMappings([], [rows[0], ['未知事项', '无', '类型甲']], types, procedures, () => 'new').ok).toBe(false)
  expect(importProcedureMappings([], [rows[0], ['事项甲', '随便', '类型甲']], types, procedures, () => 'new').ok).toBe(false)
  expect(custom).toHaveLength(1)
})

it('真实 xlsx 编解码往返保留全名和无条件', async () => {
  const { xlsxBytes, readXlsxRows } = await import('../../../src/customer/xlsx-table')
  const table = await readXlsxRows(xlsxBytes(exportProcedureMappings(custom), '处理事项映射'))
  const imported = importProcedureMappings([], table, types, procedures, () => 'new')
  expect(imported.ok && imported.mappings[0].mailTypeName).toBe('类型甲')
  expect(imported.ok && imported.mappings[0].condition).toBe('none')
})
it('后续行冲突时原配置保持不变，内置项不能通过导入改写', () => {
  const rows = [['处理事项', '文号条件', '发文类型'], ['事项甲', '有客户文号', '类型甲'], ['事项甲', '无', '类型乙']]
  const result = importProcedureMappings(custom, rows, [...types, { id: 'other', name: '类型乙' }], procedures, () => 'new')
  expect(result.ok).toBe(false)
  expect(custom).toHaveLength(1)
  const builtin = importProcedureMappings([], [rows[0], ['提醒申请PCT', '无', '类型乙']], types, procedures, () => 'new')
  expect(builtin.ok && builtin.added).toBe(0)
})

it('同名叶子按树路径导入导出并在工作流选中正确分支', async () => {
  const { pctRowsFromWorkbook } = await import('../../../src/customer/pct-workbook')
  const nodes = [{ id: 'a', name: '审批分支甲' }, { id: 'b', name: '审批分支乙' }, { id: 'x', name: '同名发文', parentId: 'a' }, { id: 'y', name: '同名发文', parentId: 'b' }]
  const table = [['处理事项', '文号条件', '发文类型'], ['事项甲', '无', '审批分支乙/同名发文']]
  const imported = importProcedureMappings([], table, nodes, procedures, () => 'new')
  expect(imported.ok).toBe(true)
  if (!imported.ok) return
  expect(imported.mappings[0]).toMatchObject({ mailTypeName: '同名发文', mailTypePath: '审批分支乙/同名发文' })
  expect(exportProcedureMappings(imported.mappings, nodes).at(-1)?.[2]).toBe('审批分支乙/同名发文')
  const rows = pctRowsFromWorkbook([{ name: '事项甲', rows: [['我方文号'], ['A1']] }], nodes, undefined, 'block', imported.mappings).rows
  expect(rows[0].mailTypeId).toBe('y')
  const absent = pctRowsFromWorkbook([{ name: '事项甲', rows: [['我方文号'], ['A1']] }], nodes.filter(node => node.id !== 'y'), undefined, 'block', imported.mappings).rows
  expect(absent[0].mailTypeId).toBeUndefined()
})
