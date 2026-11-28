import { describe, expect, it } from 'vitest'
import { buildIcSearchParams, icCasesFromBody } from '../../../src/api/ic-search'
import { buildPatentSearchElement } from '../../../src/api/patent-search-params'

describe('案件查询', () => {
  it('客户文号补查写进客户文号栏，我方文号栏留空', () => {
    const built = buildIcSearchParams('HC20251191', () => 1, 'case_volume_customer')
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const element = built.data.get('Element') ?? ''
    expect(element).toContain('&lt;case_volume&gt;&lt;/case_volume&gt;')
    expect(element).toContain('&lt;case_volume_customer&gt;HC20251191&lt;/case_volume_customer&gt;')
    expect(element).not.toContain('&lt;case_volume&gt;HC20251191&lt;/case_volume&gt;')
  })

  it('按我方文号组装 ICSearchList，结束事项也走这张表', () => {
    const built = buildIcSearchParams('PA2519405CND', () => 1)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.data.get('Call')).toBe('ICSearchList')
    expect(built.data.get('log_pagename')).toBe('ICSearch.aspx')
    expect(built.data.get('is_proc')).toBe('false')
    const element = built.data.get('Element') ?? ''
    expect(element).toContain('&lt;case_volume&gt;PA2519405CND&lt;/case_volume&gt;')
    expect(element).toContain('&lt;case_volume_customer&gt;&lt;/case_volume_customer&gt;')
    expect(element).toContain('&lt;case_type&gt;31D1A147-2931-43B5-94AE-B72B1525BA8A&lt;/case_type&gt;')
    expect(element).toContain('&lt;tech_disclosure&gt;null&lt;/tech_disclosure&gt;')
    expect(built.data.get('cookie')).toBeNull()
    expect(built.data.get('pageSize')).toBe('10')
    expect(built.data.get('is_fuzzy_query_case_volume')).toBe('false')
  })

  it('我方文号可以单独打开模糊查询', () => {
    const built = buildIcSearchParams('CPA25113388CN', () => 1, 'case_volume', 50, true)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.data.get('is_fuzzy_query_case_volume')).toBe('true')
    expect(built.data.get('pageSize')).toBe('50')
    const customer = buildIcSearchParams('HC20251191', () => 1, 'case_volume_customer', 10, true)
    expect(customer.ok).toBe(true)
    if (!customer.ok) return
    expect(customer.data.get('is_fuzzy_query_case_volume')).toBe('false')
  })

  it('最多 8 个文号并成一次查询', () => {
    const volumes = ['PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PA8']
    const built = buildIcSearchParams(volumes.join(';'), () => 1, 'case_volume', 50)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.data.get('pageSize')).toBe('50')
    const element = built.data.get('Element') ?? ''
    expect(element).toContain(`&lt;case_volume&gt;${volumes.join(';')}&lt;/case_volume&gt;`)
    expect(buildIcSearchParams([...volumes, 'PA9'].join(';'), () => 1).ok).toBe(false)
    expect(buildIcSearchParams('P'.repeat(81), () => 1).ok).toBe(false)
  })

  it('从列表里取出文号和案件编号', () => {
    expect(icCasesFromBody({
      TableRows: [{ case_id: '06E2717F-6C2F-40E9-B675-34B8D947234E', case_volume: 'PA2519405CND' }]
    })).toEqual([{ caseId: '06E2717F-6C2F-40E9-B675-34B8D947234E', caseVolume: 'PA2519405CND' }])
    expect(icCasesFromBody({
      TableRows: [{ case_id: '06E2717F-6C2F-40E9-B675-34B8D947234E', case_volume: 'PA25117182CND-米茅', case_volume_customer: 'HC20251191' }]
    })).toEqual([{ caseId: '06E2717F-6C2F-40E9-B675-34B8D947234E', caseVolume: 'PA25117182CND-米茅', customerVolume: 'HC20251191' }])
    expect(icCasesFromBody({ TableRows: null })).toEqual([])
  })

  it('序列化语种、字数区间与国际检索单位（含 _text）', () => {
    const xml = buildPatentSearchElement({
      pageIndex: 1,
      pageSize: 20,
      fields: {
        zl_language: 'lang-en',
        zl_word_count_start: '1000',
        zl_word_count_end: '5000',
        retrieval_unit: 'CN'
      },
      displayValues: {
        retrieval_unit: '中国'
      }
    })
    expect(xml).toContain('&lt;zl_language&gt;lang-en&lt;/zl_language&gt;')
    expect(xml).toContain('&lt;zl_word_count_start&gt;1000&lt;/zl_word_count_start&gt;')
    expect(xml).toContain('&lt;zl_word_count_end&gt;5000&lt;/zl_word_count_end&gt;')
    expect(xml).toContain('&lt;retrieval_unit&gt;CN&lt;/retrieval_unit&gt;')
    expect(xml).toContain('&lt;retrieval_unit_text&gt;中国&lt;/retrieval_unit_text&gt;')
  })

  it('序列化处理事项末尾看稿次数、发客户日期与客户回复日期', () => {
    const xml = buildPatentSearchElement({
      pageIndex: 1,
      pageSize: 20,
      fields: {
        wsbdz_revise_title: '第2次看稿',
        wsbdz_finish_doc_date_start: '2026-01-01',
        wsbdz_finish_doc_date_end: '2026-01-31',
        wsbdz_finish_revise_date_start: '',
        wsbdz_finish_revise_date_end: ''
      },
      checks: {
        wsbdz_finish_revise_date_isnull: true
      }
    })
    expect(xml).toContain('&lt;wsbdz_revise_title&gt;第2次看稿&lt;/wsbdz_revise_title&gt;')
    expect(xml).toContain('&lt;wsbdz_finish_doc_date_start&gt;2026-01-01&lt;/wsbdz_finish_doc_date_start&gt;')
    expect(xml).toContain('&lt;wsbdz_finish_doc_date_end&gt;2026-01-31&lt;/wsbdz_finish_doc_date_end&gt;')
    expect(xml).toContain('&lt;wsbdz_finish_revise_date_isnull&gt;on&lt;/wsbdz_finish_revise_date_isnull&gt;')
  })
})