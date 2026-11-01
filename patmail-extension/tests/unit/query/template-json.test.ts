import { describe, expect, it } from 'vitest'
import {
  readTemplateJson,
  templateJsonFileName,
  templateJsonText,
  TEMPLATE_JSON_FORMAT,
  TEMPLATE_JSON_VERSION,
  type TemplateJsonRead
} from '../../../src/query/template-json'

function conditionsOf(read: TemplateJsonRead): NonNullable<Extract<TemplateJsonRead, { ok: true }>['conditions']> {
  if (!read.ok) throw new Error(read.message)
  return read.conditions
}

function messageOf(read: TemplateJsonRead): string {
  if (read.ok) throw new Error('expected a rejection')
  return read.message
}

function rawJson(record: Record<string, unknown>): string {
  return JSON.stringify({ format: TEMPLATE_JSON_FORMAT, version: TEMPLATE_JSON_VERSION, ...record })
}

describe('查询模板 JSON 导出', () => {
  it('只写非空条件，不写模板名', () => {
    const text = templateJsonText('FileSearch', {
      fields: { case_volume: 'PA-1', app_no: '   ' },
      displayValues: { case_volume: '我方文号一', app_no: '多余显示名' },
      unknownFields: { filetemp: 'TPL-1', selfilename1: 'case_volume', tempName: '  ' }
    })
    const parsed = JSON.parse(text) as Record<string, unknown>
    expect(parsed.format).toBe(TEMPLATE_JSON_FORMAT)
    expect(parsed.version).toBe(TEMPLATE_JSON_VERSION)
    expect(parsed.queryType).toBe('FileSearch')
    expect(parsed.fields).toEqual({ case_volume: 'PA-1' })
    // 显示名只跟着条件走：没有条件的字段连同空值都不写。
    expect(parsed.displayValues).toEqual({ case_volume: '我方文号一' })
    expect(parsed.unknownFields).toEqual({ filetemp: 'TPL-1', selfilename1: 'case_volume' })
    expect(Object.keys(parsed)).not.toContain('name')
  })

  it('导出时丢掉查询表上没有的字段', () => {
    const parsed = JSON.parse(templateJsonText('FileSearch', {
      fields: { case_volume: 'PA-1', not_a_field: 'x' },
      unknownFields: JSON.parse('{"__proto__":"bad"}') as Record<string, string>
    })) as Record<string, unknown>
    expect(parsed.fields).toEqual({ case_volume: 'PA-1' })
    expect(parsed.unknownFields).toBeUndefined()
  })

  it('文件名带查询面、源模板名和时间戳', () => {
    expect(templateJsonFileName('LimitMonitor', '案卷模板', new Date(2026, 10, 1, 15, 30)))
      .toBe('查询模板-期限监控-案卷模板-20261101-153000.json')
    expect(templateJsonFileName('FilingSearch', '', new Date(2026, 0, 2, 8, 5, 7)))
      .toBe('查询模板-递交管理-20260102-080507.json')
  })

  it('源模板名进文件名前洗掉非法字符并限长', () => {
    // Windows 不允许 `\/:*?"<>|`，控制字符也要去掉，名字太长要截断，免得下载时被系统改名。
    expect(templateJsonFileName('FileSearch', '客户 A/B:C', new Date(2026, 10, 1, 15, 30)))
      .toBe('查询模板-文件管理-客户 A_B_C-20261101-153000.json')
    expect(templateJsonFileName('FileSearch', '名\u0000字\u001f', new Date(2026, 10, 1, 15, 30)))
      .toBe('查询模板-文件管理-名字-20261101-153000.json')
    const long = templateJsonFileName('FileSearch', '长'.repeat(50), new Date(2026, 10, 1, 15, 30))
    expect(long).toBe(`查询模板-文件管理-${'长'.repeat(40)}-20261101-153000.json`)
  })

  it('同一分钟内连点导出不会同名', () => {
    const first = templateJsonFileName('FileSearch', '案卷模板', new Date(2026, 10, 1, 15, 54, 1))
    const second = templateJsonFileName('FileSearch', '案卷模板', new Date(2026, 10, 1, 15, 54, 2))
    expect(first).not.toBe(second)
  })
})

describe('查询模板 JSON 导入', () => {
  it('同一张查询表的模板可以来回一遍', () => {
    const text = templateJsonText('FileSearch', {
      fields: { case_volume: 'PA-1', filetype: '227BFA59-A8A7-4EC6-928D-50FB5C29F960' },
      displayValues: { filetype: '受理通知书' },
      unknownFields: { selfilename1: 'case_volume' }
    })
    const conditions = conditionsOf(readTemplateJson(text, 'FileSearch'))
    expect(conditions.fields).toEqual({ case_volume: 'PA-1', filetype: '227BFA59-A8A7-4EC6-928D-50FB5C29F960' })
    expect(conditions.displayValues).toEqual({ filetype: '受理通知书' })
    expect(conditions.unknownFields).toEqual({ selfilename1: 'case_volume' })
  })

  it('核对字段：对不上查询表的整份拒收并点名', () => {
    const text = rawJson({ queryType: 'FilingSearch', fields: { case_volume: 'PA-1', not_a_field: 'x' } })
    const message = messageOf(readTemplateJson(text, 'FilingSearch'))
    expect(message).toContain('not_a_field')
    expect(message).toContain('递交管理')
  })

  it('三张查询表的模板不能混用', () => {
    const filing = templateJsonText('FilingSearch', { fields: { case_volume: 'PA-1' } })
    expect(messageOf(readTemplateJson(filing, 'FileSearch'))).toContain('递交管理')
    const limit = templateJsonText('LimitMonitor', { fields: { case_volume: 'PA-1' } })
    expect(messageOf(readTemplateJson(limit, 'FileSearch'))).toContain('期限监控')
  })

  it('格式不对、版本不认、JSON 坏了都不导入', () => {
    expect(messageOf(readTemplateJson('这不是 JSON', 'FileSearch'))).toContain('JSON')
    expect(messageOf(readTemplateJson('[1,2,3]', 'FileSearch'))).toContain('查询模板')
    expect(messageOf(readTemplateJson(JSON.stringify({ fields: { case_volume: 'PA-1' } }), 'FileSearch'))).toContain('查询模板')
    expect(messageOf(readTemplateJson(JSON.stringify({ format: TEMPLATE_JSON_FORMAT, version: 99, queryType: 'FileSearch', fields: { case_volume: 'PA-1' } }), 'FileSearch'))).toContain('版本')
  })

  it('值不是文本或超长都整份拒收并点名', () => {
    const wrongType = rawJson({ queryType: 'FilingSearch', fields: { case_volume: 42 } })
    expect(messageOf(readTemplateJson(wrongType, 'FilingSearch'))).toContain('case_volume')
    const tooLong = rawJson({ queryType: 'FilingSearch', fields: { case_volume: 'a'.repeat(501) } })
    expect(messageOf(readTemplateJson(tooLong, 'FilingSearch'))).toContain('长度')
  })

  it('附带字段只有文件查询和期限监控收，递交模板拒收', () => {
    const extras = rawJson({ queryType: 'FilingSearch', fields: { case_volume: 'PA-1' }, unknownFields: { selfilename1: 'case_volume' } })
    expect(messageOf(readTemplateJson(extras, 'FilingSearch'))).toContain('selfilename1')
    const limitExtras = rawJson({ queryType: 'LimitMonitor', fields: { case_volume: 'PA-1' }, unknownFields: { business_type_other: '显示字段' } })
    expect(conditionsOf(readTemplateJson(limitExtras, 'LimitMonitor')).unknownFields).toEqual({ business_type_other: '显示字段' })
    const danger = rawJson({ queryType: 'LimitMonitor', fields: { case_volume: 'PA-1' }, unknownFields: JSON.parse('{"__proto__":"bad"}') })
    expect(messageOf(readTemplateJson(danger, 'LimitMonitor'))).toContain('__proto__')
  })

  it('没有查询条件的模板不导入', () => {
    const empty = rawJson({ queryType: 'FileSearch', fields: { case_volume: '  ' } })
    expect(messageOf(readTemplateJson(empty, 'FileSearch'))).toContain('没有查询条件')
    const wrongShape = rawJson({ queryType: 'FileSearch', fields: 'PA-1' })
    expect(messageOf(readTemplateJson(wrongShape, 'FileSearch'))).toContain('条件结构')
  })
})
