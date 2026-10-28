import { describe, expect, it } from 'vitest'
import type { NormalizedDictionary } from '../../../src/api/dictionaries'
import { fallbackFields, pageSelectOptions } from '../../../src/query/form-page'
import {
  activateOptionFallback, choicesFromDictionary, rememberChoices, rememberDictionaries, rememberFormFields, savedChoices, scopeSavedChoices
} from '../../../src/query/option-fallback'
import type { FileSearchFormField } from '../../../src/shared/message'

const userId = 'option-fallback-user'

function dictionary(options: NormalizedDictionary['options'], status: NormalizedDictionary['status'] = 'ready'): NormalizedDictionary {
  return { key: 'dept', options, status, warnings: [] }
}

describe('option fallback', () => {
  it('replaces the saved list only when the new list has options', () => {
    activateOptionFallback(userId)
    expect(rememberChoices(userId, 'dept_id', [{ value: 'a', label: '一部' }])).toBe(true)
    expect(rememberChoices(userId, 'dept_id', [])).toBe(false)
    expect(savedChoices(userId, 'dept_id')).toEqual([{ value: 'a', label: '一部' }])
    expect(rememberChoices(userId, 'dept_id', [{ value: 'b', label: '二部', parent: 'a' }])).toBe(true)
    expect(savedChoices(userId, 'dept_id')).toEqual([{ value: 'b', label: '二部', parent: 'a' }])
  })

  it('writes a ready dictionary and skips an invalid one', () => {
    rememberDictionaries(userId, { dept_id: 'dept' }, {
      dept: dictionary([{ value: 'd1', label: '部门' }], 'invalid')
    })
    expect(savedChoices(userId, 'dept_id')?.[0]?.value).toBe('b')
    rememberDictionaries(userId, { dept_id: 'dept' }, {
      dept: dictionary([{ value: 'd2', label: '新部门', parentValue: 'root' }])
    })
    expect(savedChoices(userId, 'dept_id')).toEqual([{ value: 'd2', label: '新部门', parent: 'root' }])
    expect(choicesFromDictionary(dictionary([]))).toEqual([])
  })

  it('keeps an empty scan from wiping the last non-empty options', () => {
    const field: FileSearchFormField = {
      id: 'dept_id', label: '承办部门', section: 'case', advanced: false, control: 'select', visible: true, hiddenBy: [], options: []
    }
    rememberFormFields(userId, [field])
    expect(savedChoices(userId, 'dept_id')?.[0]?.value).toBe('d2')
    rememberFormFields(userId, [{ ...field, options: [{ value: 'd3', label: '脚本部门' }] }])
    expect(pageSelectOptions('dept_id', fallbackFields())?.some(item => item.value === 'd3')).toBe(true)
  })

  it('carries case scoping into the cache and narrows it at read time', () => {
    const dictionary: NormalizedDictionary = {
      key: 'caseStatus',
      status: 'ready',
      warnings: [],
      options: [
        { value: 's1', label: '未递交', metadata: { caseTypeId: 'type-patent', statusClass: 'CASE' } },
        { value: 's2', label: '第1年年费', metadata: { caseTypeId: 'type-patent', statusClass: 'PROC' } },
        { value: 's3', label: '未递交', metadata: { caseTypeId: 'type-mark', statusClass: 'CASE' } },
        { value: 's4', label: '一通', metadata: { caseTypeId: 'type-patent', statusClass: 'ALL' } }
      ]
    }
    rememberDictionaries(userId, { case_status: 'caseStatus' }, { caseStatus: dictionary })
    const cached = savedChoices(userId, 'case_status') ?? []
    expect(cached.map(item => item.value)).toEqual(['s1', 's2', 's3', 's4'])
    expect(cached[0]?.caseTypeId).toBe('type-patent')
    expect(cached[0]?.statusClass).toBe('CASE')
    // 原站口径：只留当前案件类型、状态分类为 ALL/CASE 的行；PROC（年费类）不进案件状态树。
    expect(scopeSavedChoices('case_status', cached, 'type-patent').map(item => item.value)).toEqual(['s1', 's4'])
    expect(scopeSavedChoices('case_status_id', cached, 'type-mark').map(item => item.value)).toEqual(['s3'])
    // 没带归属的旧缓存不做猜测，原样返回。
    expect(scopeSavedChoices('case_status', [{ value: 'x', label: '旧数据' }], 'type-patent')).toEqual([{ value: 'x', label: '旧数据' }])
  })
})
