import { readFileSync } from 'node:fs'
import { apiDocsPath } from '../../helpers/project'
import { describe, expect, it } from 'vitest'
import { buildGetSearchFilesFromFields, buildGetSearchFilesParams, closedCaseParam, fileSearchValueLimit } from '../../../src/api/file-search-params'

const documentedNames = [...readFileSync(apiDocsPath('04-文件查询.md'), 'utf8')
  .matchAll(/^\d+ ([A-Za-z_][A-Za-z_0-9]*)$/gm)].map(match => match[1])

describe('GetSearchFiles 参数 Builder', () => {
  it('emits every documented field except the callback serialization artifact', () => {
    expect(documentedNames).toHaveLength(117)
    const result = buildGetSearchFilesParams({ caseVolume: ' PA-123 ', pageIndex: 1, pageSize: 50 }, undefined, () => 1790000000123)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const expected = documentedNames.filter(name => name !== '_doneCallback')
    expected.splice(expected.indexOf('IsFirst'), 0, 'is_vip', 'specialtyid')
    expect([...result.data.keys()]).toEqual(expected)
    expect(result.data.get('is_vip')).toBe('')
    expect(result.data.get('specialtyid')).toBe('')
    expect(result.data.get('Call')).toBe('GetSearchFiles')
    expect(result.data.get('IsFirst')).toBe('false')
    expect(result.data.get('log_pagename')).toBe('FileSearch.aspx')
    expect(result.data.get('_t')).toBe('1790000000123')
    expect(result.data.get('fileclass')).toBe('general')
    expect(result.data.get('case_type')).toBe('31D1A147-2931-43B5-94AE-B72B1525BA8A')
    expect(result.data.get('is_pat')).toBe('0')
    expect(result.data.get('customer')).toBe('')
    expect(result.data.get('is_close')).toBe('')
    expect(result.data.has('order_by_search')).toBe(false)
  })

  it('keeps closed cases unless the form explicitly excludes them', () => {
    expect(closedCaseParam(undefined)).toBe('')
    expect(closedCaseParam('是')).toBe('')
    expect(closedCaseParam('1')).toBe('1')
    const included = buildGetSearchFilesFromFields({ case_volume: 'PA-1', is_close: '是' }, { pageIndex: 1, pageSize: 20 }, undefined, () => 1)
    const excluded = buildGetSearchFilesFromFields({ case_volume: 'PA-1', is_close: '1' }, { pageIndex: 1, pageSize: 20 }, undefined, () => 1)
    expect(included.ok && included.data.get('is_close')).toBe('')
    expect(excluded.ok && excluded.data.get('is_close')).toBe('1')
  })

  it('maps UI filters, preserves Chinese and special characters, and removes only application-number dots', () => {
    const result = buildGetSearchFilesParams({
      caseVolume: ' PA&01 ', applicationNo: '2026.000-1', customerName: '客户 A&B',
      fileName: '证书+附件', fileDescriptionId: '603ca943-a07a-4894-9461-29dff2d60c4b',
      pageIndex: 2, pageSize: 20
    }, undefined, () => 7)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const params = result.data
    expect(params.get('case_volume')).toBe('PA&01')
    expect(params.get('app_no')).toBe('2026000-1')
    expect(params.get('customer_name_vague')).toBe('客户 A&B')
    expect(params.get('file_name')).toBe('证书+附件')
    expect(params.get('filetype')).toBe('603ca943-a07a-4894-9461-29dff2d60c4b')
    expect(params.get('pageIndex')).toBe('2')
    expect(new URLSearchParams(params.toString()).get('file_name')).toBe('证书+附件')
  })

  it.each([
    [{ pageIndex: 1, pageSize: 20 }, 'INVALID_QUERY'],
    [{ caseVolume: 'A', pageIndex: 0, pageSize: 20 }, 'INVALID_QUERY'],
    [{ caseVolume: 'A', pageIndex: 1, pageSize: -1 }, 'INVALID_QUERY'],
    [{ fileDescriptionId: '专利证书', pageIndex: 1, pageSize: 20 }, 'INVALID_QUERY']
  ] as const)('rejects missing filters and invalid pagination or internal IDs', (query, code) => {
    const result = buildGetSearchFilesParams(query)
    expect(result).toMatchObject({ ok: false, error: { code } })
  })

  it('keeps tenant configuration separate from UI filters', () => {
    const result = buildGetSearchFilesParams(
      { fileName: '通知书', pageIndex: 1, pageSize: 20 },
      { fileClass: 'tenant-source', caseTypeId: '', isPatent: 1, colsel: ';file_id;file_name;' },
      () => 42
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.get('fileclass')).toBe('tenant-source')
    expect(result.data.get('case_type')).toBe('')
    expect(result.data.get('is_pat')).toBe('1')
    expect(result.data.get('colsel')).toBe(';file_id;file_name;')
  })

  it('文件描述带尾逗号不误杀，真不是内部 ID 时点名报错', () => {
    const trailing = buildGetSearchFilesFromFields(
      { case_volume: 'PA-1', filetype: 'EFD8CC29-E202-4463-835D-F29684ECF699,' },
      { pageIndex: 1, pageSize: 20 }, undefined, () => 1
    )
    expect(trailing.ok).toBe(true)
    if (trailing.ok) expect(trailing.data.get('filetype')).toBe('EFD8CC29-E202-4463-835D-F29684ECF699')
    const bad = buildGetSearchFilesFromFields(
      { case_volume: 'PA-1', filetype: '受理通知书,专利证书' },
      { pageIndex: 1, pageSize: 20 }, undefined, () => 1
    )
    expect(bad).toMatchObject({ ok: false, error: { code: 'INVALID_QUERY' } })
    if (!bad.ok) expect(bad.error.message).toContain('受理通知书')
  })

  it('keeps a long my-volume list like the site template instead of dropping the whole filter', () => {
    // 2026-10-26 抓包：原站模板「季华-新申请文档」的 case_volume 是 534 条共 8163 字。
    // 以前按 4000 字丢掉整条，查询退化成全库（91510 条）。
    const caseVolume = Array.from({ length: 534 }, (_, index) => `PA25${String(100000 + index)}CND-YS`).join('\n')
    expect(caseVolume.length).toBeGreaterThan(4000)
    expect(caseVolume.length).toBeLessThanOrEqual(fileSearchValueLimit('case_volume'))
    const result = buildGetSearchFilesFromFields(
      { case_volume: caseVolume, filetype: 'EFD8CC29-E202-4463-835D-F29684ECF699' },
      { pageIndex: 1, pageSize: 20 }, undefined, () => 1
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.get('case_volume')).toBe(caseVolume)
    expect(fileSearchValueLimit('app_no')).toBe(fileSearchValueLimit('case_volume'))
    expect(fileSearchValueLimit('case_name')).toBeLessThan(fileSearchValueLimit('case_volume'))
  })
})
