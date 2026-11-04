import { expect, it } from 'vitest'
import { pctRowsFromWorkbook } from '../../../src/customer/pct-workbook'
it('通用 Sheet 的处理事项列能识别进国家，不误用普通 PCT 类型', () => {
  const parsed = pctRowsFromWorkbook([{ name: 'Sheet1', rows: [['我方文号', '客户文号', '处理事项'], ['A1', 'C1', 'PCT进国家阶段官方绝限']] }])
  expect(parsed.rows[0]).toMatchObject({ letterKind: 'national', mailTypeLabel: '提醒PCT申请进入国家案件（贵方案号）' })
})
it('外观导出表按文件名补缺失事项，兼容原站联系人列名', () => {
  const parsed = pctRowsFromWorkbook([{ name: 'case_list', rows: [['我方文号', '客户文号', '案件客户联系人IPR', '案件客户联系人'], ['A1', '', 'IPR甲', '联系人甲']] }], [], undefined, 'block', [], '外观提醒小客户-413.xlsx')
  expect(parsed.rows[0]).toMatchObject({ letterKind: 'design', procLabel: '提醒申请涉外外观', mailTypeLabel: '提醒外观申请（我方案号）', iprName: 'IPR甲', contactName: '联系人甲' })
})
