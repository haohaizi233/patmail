import { describe, expect, it } from 'vitest'
import { PATENT_CASE_TYPE_ID, buildColselString, defaultPatentVisibleColumns } from '../../src/api/patent-form'
import { normalizePatentBasicDicts, normalizePatentSearch } from '../../src/api/patent-search-normalizer'
import {
  buildPatentSearchElement,
  buildPatentSearchParams,
  isPatentSearchQuery
} from '../../src/api/patent-search-params'
import { historyRequest, historySaveRequest, isHistorySurface } from '../../src/api/query-history/surfaces'

describe('patent search api (ICSearchList)', () => {
  it('builds Element XML with default case_type, object _text tags, and checkbox flags', () => {
    const element = buildPatentSearchElement({
      pageIndex: 1,
      pageSize: 20,
      is_proc: true,
      is_fuzzy_query_case_volume: true,
      is_fuzzy_query_pct_app_no: true,
      fields: {
        case_volume: 'P2026-001 & <test>',
        country: 'CN,US',
        p_case_info__from_stage: 'AP'
      },
      displayValues: {
        country: '中国,美国',
        p_case_info__from_stage: '新申请'
      },
      checks: {
        is_essence_exam: true,
        is_fast_services_case: true,
        is_examine_delay: true,
        pic_no_user: true,
        app_date_isnull: true
      }
    })

    expect(element).toContain('&lt;case_volume&gt;P2026-001 &amp;amp; test>&lt;/case_volume&gt;')
    expect(element).toContain('&lt;country&gt;CN,US&lt;/country&gt;&lt;country_text&gt;中国,美国&lt;/country_text&gt;')
    expect(element).toContain('&lt;p_case_info__from_stage&gt;AP&lt;/p_case_info__from_stage&gt;&lt;p_case_info__from_stage_text&gt;新申请&lt;/p_case_info__from_stage_text&gt;')
    expect(element).toContain(`&lt;case_type&gt;${PATENT_CASE_TYPE_ID}&lt;/case_type&gt;`)
    expect(element).toContain('&lt;tech_disclosure&gt;null&lt;/tech_disclosure&gt;')
    expect(element).toContain('&lt;is_proc&gt;on&lt;/is_proc&gt;')
    expect(element).toContain('&lt;is_fuzzy_query_case_volume&gt;on&lt;/is_fuzzy_query_case_volume&gt;')
    expect(element).toContain('&lt;is_fuzzy_query_pct_app_no&gt;on&lt;/is_fuzzy_query_pct_app_no&gt;')
    expect(element).toContain('&lt;is_essence_exam&gt;true&lt;/is_essence_exam&gt;')
    expect(element).toContain('&lt;is_fast_services_case&gt;true&lt;/is_fast_services_case&gt;')
    expect(element).toContain('&lt;is_examine_delay&gt;true&lt;/is_examine_delay&gt;')
    expect(element).toContain('&lt;pic_no_user&gt;1&lt;/pic_no_user&gt;')
    expect(element).toContain('&lt;app_date_isnull&gt;on&lt;/app_date_isnull&gt;')
    expect(element).not.toContain('&lt;is_ahead_pub&gt;')
  })

  it('builds ICSearchList URLSearchParams and validates page bounds', () => {
    const ok = buildPatentSearchParams(
      {
        pageIndex: 2,
        pageSize: 50,
        is_proc: false,
        is_remove_symbol: true,
        is_fuzzy_query_pct_app_no: true,
        is_first: true,
        fields: { case_volume: 'CN123' }
      },
      () => 1700000000000
    )
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.data.get('Call')).toBe('ICSearchList')
      expect(ok.data.get('pageIndex')).toBe('2')
      expect(ok.data.get('pageSize')).toBe('50')
      expect(ok.data.get('is_proc')).toBe('false')
      expect(ok.data.get('is_remove_symbol')).toBe('true')
      expect(ok.data.get('is_fuzzy_query_pct_app_no')).toBe('true')
      expect(ok.data.get('is_first')).toBe('true')
      expect(ok.data.get('is_top_volume_search')).toBe('')
      expect(ok.data.get('log_pagename')).toBe('ICSearch.aspx')
      expect(ok.data.get('_t')).toBe('1700000000000')
      expect(ok.data.get('colsel')).toBe(buildColselString(defaultPatentVisibleColumns(false)))
    }

    const bad = buildPatentSearchParams({
      pageIndex: 0,
      pageSize: 20,
      fields: {}
    })
    expect(bad.ok).toBe(false)
  })

  it('normalizes ICSearchList responses and handles business errors', () => {
    const query = { pageIndex: 1, pageSize: 20, fields: {} }
    const ok = normalizePatentSearch(
      {
        ClientInfo: { Status: true, Result: true, Message: '' },
        TableRowsCount: '2',
        TableRows: [
          {
            case_id: '11111111-1111-1111-1111-111111111111',
            case_volume: 'P260001',
            case_name: '一种专利检索装置',
            applicants: '测试公司',
            app_no: '202610000001.0',
            country_name: '中国'
          }
        ]
      },
      query
    )
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.data.total).toBe(2)
      expect(ok.data.totalPages).toBe(1)
      expect(ok.data.rows[0].caseVolume).toBe('P260001')
      expect(ok.data.rows[0].caseName).toBe('一种专利检索装置')
    }

    const expired = normalizePatentSearch(
      { ClientInfo: { Status: false, IsLogin: false, Message: '未登录' } },
      query
    )
    expect(expired.ok).toBe(false)
    if (!expired.ok) expect(expired.error.code).toBe('SESSION_EXPIRED')
  })

  it('validates PatentSearchQuery and patent history surface', () => {
    expect(
      isPatentSearchQuery({
        pageIndex: 1,
        pageSize: 20,
        is_proc: true,
        is_fuzzy_query_pct_app_no: true,
        is_first: true,
        fields: { case_volume: 'P260001' },
        checks: { is_essence_exam: true }
      })
    ).toBe(true)
    expect(
      isPatentSearchQuery({
        pageIndex: 1,
        pageSize: 20,
        fields: { unknown_evil_field: '1' }
      })
    ).toBe(false)

    expect(isHistorySurface('patent')).toBe(true)
    expect(historyRequest('patent', '').get('query_type')).toBe('ICSearch')
    expect(historyRequest('patent', '').get('log_pagename')).toBe('ICSearch.aspx')
    expect(historySaveRequest('patent', '测试', '', '<xmlRoot></xmlRoot>').get('query_type')).toBe('ICSearch')
  })

  it('filters CaseStatus by status_class (ALL/CASE) and reads BussType from bussType', () => {
    const otherCaseTypeId = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'
    const dicts = normalizePatentBasicDicts({
      CaseType: [
        { case_type_id: PATENT_CASE_TYPE_ID.toLowerCase(), case_type_code: 'P', case_type: '专利' },
        { case_type_id: otherCaseTypeId, case_type_code: 'T', case_type: '商标' }
      ],
      CaseStatus: [
        { case_status_id: 's1', case_status: '未递交', case_type_id: PATENT_CASE_TYPE_ID, status_class: 'CASE' },
        { case_status_id: 's2', case_status: '已递交', case_type_id: PATENT_CASE_TYPE_ID.toLowerCase(), status_class: 'ALL' },
        { case_status_id: 's3', case_status: '第1年年费', case_type_id: PATENT_CASE_TYPE_ID, status_class: 'PROC' },
        { case_status_id: 's4', case_status: 'PPH', case_type_id: PATENT_CASE_TYPE_ID, status_class: 'PROC' },
        { case_status_id: 's5', case_status: '商标注册', case_type_id: otherCaseTypeId, status_class: 'CASE' }
      ],
      BussType: [
        { business_type_id: 'b1', bussType: '普通新申请', case_type_id: PATENT_CASE_TYPE_ID },
        { business_type_id: 'b2', business_type: '兜底类型', case_type_id: PATENT_CASE_TYPE_ID.toLowerCase() },
        { business_type_id: 'b3', bussType: '商标申请', case_type_id: otherCaseTypeId }
      ]
    })

    expect(dicts.caseStatuses).toEqual([
      { value: 's1', label: '未递交' },
      { value: 's2', label: '已递交' }
    ])
    expect(dicts.bussTypes).toEqual([
      { value: 'b1', label: '普通新申请' },
      { value: 'b2', label: '兜底类型' }
    ])
  })

  it('normalizes advanced dictionary lists and serializes newly added fields', () => {
    const dicts = normalizePatentBasicDicts({
      generation_status: [{ id: 'g1', text_zh_cn: '已转外代' }],
      ProtectionCenter: [{ id: 'pc1', name: '深圳保护中心' }],
      ApplicantType: [{ value: 'at1', text_zh_cn: '个人' }],
      sourcetype: [{ value: 'SGH', text_zh_cn: '市区工会' }],
      customerclass: [{ id: 'cc1', cus_class_name: '现有客户' }],
      RelateType: [{ value: 'rt1', text_zh_cn: '同日申请' }]
    })

    expect(dicts.generationStatuses).toEqual([{ value: 'g1', label: '已转外代' }])
    expect(dicts.protectionCenters).toEqual([{ value: 'pc1', label: '深圳保护中心' }])
    expect(dicts.applicantTypes).toEqual([{ value: 'at1', label: '个人' }])
    expect(dicts.sourceTypes).toEqual([{ value: 'SGH', label: '市区工会' }])
    expect(dicts.customerClasses).toEqual([{ value: 'cc1', label: '现有客户' }])
    expect(dicts.relateTypes).toEqual([{ value: 'rt1', label: '同日申请' }])

    expect(
      isPatentSearchQuery({
        pageIndex: 1,
        pageSize: 20,
        fields: {
          related_type: 'rt1',
          proc_user_assistant: 'u1',
          protection_center: 'pc1',
          customer_id: 'c1'
        },
        checks: { protection_center_isnull: true }
      })
    ).toBe(true)

    const xml = buildPatentSearchElement({
      pageIndex: 1,
      pageSize: 20,
      fields: {
        related_type: 'rt1',
        proc_user_assistant: 'u1'
      },
      displayValues: {
        related_type: '同日申请',
        proc_user_assistant: '张三'
      },
      checks: { protection_center_isnull: true }
    })

    expect(xml).toContain('&lt;related_type&gt;rt1&lt;/related_type&gt;&lt;related_type_text&gt;同日申请&lt;/related_type_text&gt;')
    expect(xml).toContain('&lt;proc_user_assistant&gt;u1&lt;/proc_user_assistant&gt;&lt;proc_user_assistant_text&gt;张三&lt;/proc_user_assistant_text&gt;')
    expect(xml).toContain('&lt;protection_center_isnull&gt;on&lt;/protection_center_isnull&gt;')
  })
})
