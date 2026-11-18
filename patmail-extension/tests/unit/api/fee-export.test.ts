import { describe, expect, it } from 'vitest'
import {
  belongKeyForMode,
  buildExportColumnsXml,
  buildFeeExportGroups,
  buildTemplateElementXml,
  TRADEMARK_CASE_TYPE_ID
} from '../../../src/api/fee-export'

describe('fee export protocol builders', () => {
  it('encodes e_coulums and template element XML matching EASY IhgAdvExport.js', () => {
    const cols = [
      { value: 'case_volume', text: '我方文号' },
      { value: 'amount', text: '金额<CNY>&税' }
    ]
    expect(buildExportColumnsXml(cols)).toBe(
      '&lt;case_volume&gt;我方文号&lt;/case_volume&gt;&lt;amount&gt;金额&lt;CNY&gt;&amp;税&lt;/amount&gt;'
    )
    expect(buildTemplateElementXml(cols)).toBe(
      '&lt;item&gt;&lt;value&gt;case_volume&lt;/value&gt;&lt;text&gt;我方文号&lt;/text&gt;&lt;sort&gt;1&lt;/sort&gt;&lt;/item&gt;' +
      '&lt;item&gt;&lt;value&gt;amount&lt;/value&gt;&lt;text&gt;金额&lt;CNY&gt;&amp;税&lt;/text&gt;&lt;sort&gt;2&lt;/sort&gt;&lt;/item&gt;'
    )
  })

  it('maps modes to exact EASY belong_key and dynamic custom column labels', () => {
    expect(belongKeyForMode('cond')).toBe('FeeSearch_ExportByCond')
    expect(belongKeyForMode('checked')).toBe('FeeSearch_ExportByCond')
    expect(belongKeyForMode('count')).toBe('FeeSearch_ExportCountByCond')

    const condGroups = buildFeeExportGroups('cond', {
      caseType: TRADEMARK_CASE_TYPE_ID,
      fieldColumns: { column_1: '自定义栏位1', column_2: '特批编号', column_3: '回款日期' }
    })
    expect(condGroups.map(g => g.title)).toEqual(['案件信息', '处理事项', '著录项目', '费用信息', '扩展信息', '自定义栏位'])
    expect(condGroups[0].columns.some(c => c.value === 'register_type_code')).toBe(true)
    expect(condGroups[5].columns.find(c => c.value === 'column_2')?.text).toBe('特批编号')

    const patentGroups = buildFeeExportGroups('cond', { caseType: '31D1A147-2931-43B5-94AE-B72B1525BA8A' })
    expect(patentGroups[0].columns.some(c => c.value === 'register_type_code')).toBe(false)

    const countGroups = buildFeeExportGroups('count')
    expect(countGroups.map(g => g.title)).toEqual(['案件信息', '著录项目', '费用信息'])
    expect(countGroups[2].columns.some(c => c.value === 'total_oa_amount')).toBe(true)
  })
})
