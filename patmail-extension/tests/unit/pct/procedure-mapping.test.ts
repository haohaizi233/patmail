import { expect, it } from 'vitest'
import { nationalTypeName } from '../../../src/customer/pct-sheet'
import { matchMailTypeByName } from '../../../src/customer/mail-flow'
import { matchMailTypePath } from '../../../src/customer/mail-type-path'
import { pctRowsFromWorkbook } from '../../../src/customer/pct-workbook'
import { PROCEDURE_MAIL_MAPPINGS } from '../../../src/customer/procedure-mapping'

it('外观按客户文号选择全名', () => {
  expect(nationalTypeName({ letterKind: 'design', ourVolume: 'A1' })).toBe('提醒外观申请（我方案号）')
  expect(nationalTypeName({ letterKind: 'design', customerVolume: 'C1' })).toBe('提醒涉外外观申请（贵方案号）')
})
it('拒绝前缀和树分类节点', () => {
  expect(matchMailTypeByName([{ id: '1', name: '目标-其他' }], '目标')).toBeNull()
  const tree = [{ id: 'p', name: '目标', parentId: '' }, { id: 'c', name: '子项', parentId: 'p' }]
  expect(matchMailTypeByName(tree, '目标')).toBeNull()
})
it('Sheet 名写入处理事项，无需原表存在该列', () => {
  const parsed = pctRowsFromWorkbook([{ name: '提醒申请涉外外观', rows: [['我方文号', '客户文号'], ['A1', '']] }])
  expect(parsed.rows[0]).toMatchObject({ procLabel: '提醒申请涉外外观', letterKind: 'design', mailTypeLabel: '提醒外观申请（我方案号）' })
})
it('三种内置事项同时导入，Sheet 优先于行内旧事项且不修改原始数据', () => {
  const sheets = PROCEDURE_MAIL_MAPPINGS.map((rule, index) => ({
    name: rule.procedure,
    rows: [['我方文号', '客户文号', '处理事项'], [`A${index}`, 'C1', '旧事项']]
  }))
  const parsed = pctRowsFromWorkbook(sheets)
  expect(parsed.rows.map(row => row.procLabel)).toEqual(PROCEDURE_MAIL_MAPPINGS.map(row => row.procedure))
  expect(sheets[0].rows[1][2]).toBe('旧事项')
  expect(PROCEDURE_MAIL_MAPPINGS.flatMap(row => [row.customer, row.our])).toHaveLength(6)
  expect(Object.isFrozen(PROCEDURE_MAIL_MAPPINGS[0])).toBe(true)
})
it('唯一同名叶子可以匹配，同名叶子重复时不猜选', () => {
  const tree = [{ id: 'p', name: '分类', parentId: '' }, { id: 'c', name: '目标', parentId: 'p' }]
  expect(matchMailTypeByName(tree, '目标')).toEqual({ id: 'c', name: '目标' })
  expect(matchMailTypeByName([...tree, { id: 'd', name: '目标', parentId: 'p' }], '目标')).toBeNull()
})

it('同一发文类型 ID 指向两条分支时不采用其中一个路径', () => {
  const tree = [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' },
    { id: 'leaf', name: '旧目标', parentId: 'a' }, { id: 'leaf', name: '目标', parentId: 'b' }]
  expect(matchMailTypePath(tree, '目标', '乙/目标')).toBeNull()
})

it('DIY 映射持久化并按工作表名称和文号条件选择全名', async () => {
  const { emptyMailRules, readMailRules } = await import('../../../src/mail/repository')
  const bundle = emptyMailRules('owner')
  const custom = [{ id: 'custom', procedure: '新提醒', condition: 'our' as const, mailTypeName: '新提醒（我方案号）' }]
  const loaded = readMailRules({ ...bundle, procedureMappings: custom }, 'owner')
  expect(loaded.bundle.procedureMappings).toEqual(custom)
  const parsed = pctRowsFromWorkbook([{ name: '新提醒', rows: [['我方文号'], ['A1']] }], [{ id: 'leaf', name: '新提醒（我方案号）' }], undefined, 'block', custom)
  expect(parsed.rows[0]).toMatchObject({ procLabel: '新提醒', mailTypeId: 'leaf', mailTypeLabel: '新提醒（我方案号）' })
})

it('拒绝覆盖内置事项和重复的自定义条件，允许同一事项两种文号条件', async () => {
  const { emptyMailRules, readMailRules } = await import('../../../src/mail/repository')
  const bundle = emptyMailRules('owner')
  const row = { id: 'x', procedure: '自定义进国家提醒', condition: 'our' as const, mailTypeName: '指定全名' }
  expect(readMailRules({ ...bundle, procedureMappings: [{ ...row, procedure: '提醒申请PCT' }] }, 'owner').writable).toBe(false)
  expect(readMailRules({ ...bundle, procedureMappings: [row, { ...row, id: 'y' }] }, 'owner').writable).toBe(false)
  expect(readMailRules({ ...bundle, procedureMappings: [row, { ...row, id: 'y', condition: 'customer' }] }, 'owner').writable).toBe(true)
  const parsed = pctRowsFromWorkbook([{ name: row.procedure, rows: [['我方文号', '客户文号'], ['A1', ''], ['A2', 'C2']] }], [{ id: 'leaf', name: row.mailTypeName }], undefined, 'block', [row])
  expect(parsed.rows).toHaveLength(2)
  expect(parsed.rows[0].mailTypeId).toBe('leaf')
  expect(parsed.rows[1].mailTypeId).toBeUndefined()
})

it('无条件映射适用于两种文号，具体文号条件优先于无条件兜底', async () => {
  const { emptyMailRules, readMailRules } = await import('../../../src/mail/repository')
  const custom = [{ id: 'none', procedure: '通用提醒', condition: 'none' as const, mailTypeName: '通用全名' }]
  expect(readMailRules({ ...emptyMailRules('owner'), procedureMappings: custom }, 'owner').writable).toBe(true)
  const sheets = [{ name: '通用提醒', rows: [['我方文号', '客户文号'], ['A1', ''], ['A2', 'C2']] }]
  const nodes = [{ id: 'common', name: '通用全名' }, { id: 'special', name: '客户专用全名' }]
  expect(pctRowsFromWorkbook(sheets, nodes, undefined, 'block', custom).rows.map(row => row.mailTypeId)).toEqual(['common', 'common'])
  expect(pctRowsFromWorkbook(sheets, nodes, undefined, 'block', [...custom, { id: 'c', procedure: '通用提醒', condition: 'customer', mailTypeName: '客户专用全名' }]).rows.map(row => row.mailTypeId)).toEqual(['common', 'special'])
})
