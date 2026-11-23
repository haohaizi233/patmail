import { describe, expect, it } from 'vitest'
import { LIMIT_BLOCKS, buildLimitQueryXml, limitColumnLabels, readLimitQueryXml } from '../../../src/api/limit-form'

describe('期限查询模板', () => {
  it('writes the site control names and reads them back as query fields', () => {
    const xml = buildLimitQueryXml({
      case_volume: 'PA1',
      customer_name: '甲客户',
      case_type: '31D1A147-2931-43B5-94AE-B72B1525BA8A',
      pageIndex: '1'
    })
    expect(xml).toContain('<case_volume_other>PA1</case_volume_other>')
    expect(xml).toContain('<customer_name>甲客户</customer_name>')
    expect(xml).not.toContain('pageIndex')
    const read = readLimitQueryXml(xml)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.data.fields.case_volume).toBe('PA1')
    expect(read.data.fields.customer_name).toBe('甲客户')
    expect(read.data.fields.case_type).toBe('31D1A147-2931-43B5-94AE-B72B1525BA8A')
  })

  it('keeps the display suffix and writes it back on the control name', () => {
    const proc = 'A72068F7-6520-4AAF-A026-DADEB792ED4E'
    const xml = buildLimitQueryXml(
      { ctrl_proc: proc, case_volume: 'PA1' },
      { ctrl_proc: '新申请' },
      { custom_flag: '1' }
    )
    expect(xml).toContain(`<ctrl_proc>${proc}</ctrl_proc>`)
    expect(xml).toContain('<ctrl_proc_text>新申请</ctrl_proc_text>')
    expect(xml).toContain('<case_volume_other>PA1</case_volume_other>')
    expect(xml).toContain('<custom_flag>1</custom_flag>')
    const read = readLimitQueryXml(xml)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.data.fields.ctrl_proc).toBe(proc)
    expect(read.data.fields.ctrl_proc_text).toBeUndefined()
    expect(read.data.displayValues.ctrl_proc).toBe('新申请')
    expect(read.data.unknownFields.custom_flag).toBe('1')
  })

  it('reads a limit-monitor template the way the site stores dropdowns', () => {
    const proc = '629cd76f-d7ed-4bf9-944b-a9b2b91b84a2,947e550e-b915-4558-ba82-4f936d22b3ef'
    const xml = [
      '<xmlRoot>',
      '<case_volume_other>PA25112030CN-YS</case_volume_other>',
      '<case_type>31D1A147-2931-43B5-94AE-B72B1525BA8A</case_type>',
      `<ctrl_proc>${proc}</ctrl_proc>`,
      '<ctrl_proc_text>提醒申请PCT,PCT进国家阶段官方绝限</ctrl_proc_text>',
      '<ctrl_proc_idtxtSearch>PCT</ctrl_proc_idtxtSearch>',
      '<case_status></case_status>',
      '<case_status_text></case_status_text>',
      '<f_nodeCurState>0</f_nodeCurState>',
      '<f_nodeIntDueDate_s>2026-09-12</f_nodeIntDueDate_s>',
      '<f_nodeIntDueDate_e>2026-09-12</f_nodeIntDueDate_e>',
      '</xmlRoot>'
    ].join('')
    const read = readLimitQueryXml(xml)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.data.fields.case_volume).toBe('PA25112030CN-YS')
    expect(read.data.fields.case_type).toBe('31D1A147-2931-43B5-94AE-B72B1525BA8A')
    expect(read.data.fields.ctrl_proc).toBe(proc)
    expect(read.data.fields.case_status_id).toBe('')
    expect(read.data.displayValues.ctrl_proc).toBe('提醒申请PCT,PCT进国家阶段官方绝限')
    expect(read.data.unknownFields.ctrl_proc_idtxtSearch).toBe('PCT')
    expect(read.data.unknownFields.f_nodeCurState).toBe('0')
    expect(read.data.unknownFields.f_nodeIntDueDate_s).toBe('2026-09-12')
    const again = buildLimitQueryXml(read.data.fields, read.data.displayValues, read.data.unknownFields)
    expect(again).toContain(`<ctrl_proc>${proc}</ctrl_proc>`)
    expect(again).toContain('<ctrl_proc_text>提醒申请PCT,PCT进国家阶段官方绝限</ctrl_proc_text>')
    expect(again).toContain('<ctrl_proc_idtxtSearch>PCT</ctrl_proc_idtxtSearch>')
    expect(again).toContain('<f_nodeCurState>0</f_nodeCurState>')
    expect(again).not.toContain('<case_status>')
  })

  it('maps a site display suffix back onto the query field', () => {
    const read = readLimitQueryXml('<xmlRoot><case_volume_other>PA1</case_volume_other><case_volume_other_text>文号</case_volume_other_text><custom_flag_text>不应进查询</custom_flag_text></xmlRoot>')
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.data.fields.case_volume).toBe('PA1')
    expect(read.data.displayValues.case_volume).toBe('文号')
    expect(read.data.fields.custom_flag).toBeUndefined()
    expect(read.data.unknownFields.custom_flag_text).toBe('不应进查询')
  })

  it('原站存回的双层 xmlRoot 也能读出全部字段', () => {
    const wrapped = '<xmlRoot><xmlRoot><case_volume_other>PA25213828CN</case_volume_other><ctrl_proc_text>提醒申请PCT</ctrl_proc_text></xmlRoot></xmlRoot>'
    const read = readLimitQueryXml(wrapped)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.data.fields.case_volume).toBe('PA25213828CN')
    expect(read.data.unknownFields.xmlRoot).toBeUndefined()
  })

  it('自定义栏位按原站控件名 column_1~column_5 存回模板', () => {
    const xml = buildLimitQueryXml({ column1: 'LX-2026-001', column3: 'YJ-88', column5: '2026-10-26' })
    expect(xml).toContain('<column_1>LX-2026-001</column_1>')
    expect(xml).toContain('<column_3>YJ-88</column_3>')
    expect(xml).toContain('<column_5>2026-10-26</column_5>')
    expect(xml).not.toContain('<column1>')
    const read = readLimitQueryXml(xml)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.data.fields.column1).toBe('LX-2026-001')
    expect(read.data.fields.column3).toBe('YJ-88')
    expect(read.data.fields.column5).toBe('2026-10-26')
  })

  it('自定义栏位标题按 GetFieldColumn 换成租户名字，旧模板节点照样读得回', () => {
    expect(limitColumnLabels([
      { field: 'column1', label: '立案流程编号' },
      { field: 'column2', label: '签约主体 即 世纪恒程 恒程创新' },
      { field: 'column3', label: '月结 特批单号' },
      { field: 'column6', label: '不该进来' },
      { field: 'column4', label: '   ' }
    ])).toEqual({
      column1: '立案流程编号',
      column2: '签约主体 即 世纪恒程 恒程创新',
      column3: '月结 特批单号'
    })
    const read = readLimitQueryXml('<xmlRoot><column1>老节点</column1></xmlRoot>')
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.data.fields.column1).toBe('老节点')
  })

  it('原站表单尾部那排字段在主区，不再藏进「更多条件」', () => {
    const keysOf = (more: boolean): string[] => LIMIT_BLOCKS
      .filter(block => Boolean(block.more) === more)
      .flatMap(block => block.cells.flatMap(cell => cell.kind === 'dates' ? [cell.start] : [cell.key]))
    const main = keysOf(false)
    const more = keysOf(true)
    for (const key of ['sales_help', 'flow_user_id', 'charge_date_from', 'proc_note', 'apply_tags_id', 'pic_dept_id', 'case_volume_customer', 'column1', 'column2', 'column3', 'column4', 'column5']) {
      expect(main).toContain(key)
      expect(more).not.toContain(key)
    }
  })
})
