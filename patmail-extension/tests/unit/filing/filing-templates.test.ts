import { readFileSync } from 'node:fs'
import { projectPath } from '../../helpers/project'
import { describe, expect, it } from 'vitest'
import { LARGE_CUSTOMER_ORIGIN } from '../../../src/api/config'
import { filingDraftFields } from '../../../src/api/filing-form'
import { filingTemplateValues, filingTemplatesOf, applyFilingBuiltin, FILING_BUILTIN_TEMPLATES, FILING_TEMPLATE_TYPE } from '../../../src/query/filing-templates'
import { isQueryTemplate } from '../../../src/query/query-validator'
import type { QueryTemplate } from '../../../src/query/query-types'
import { BundleTemplateRepository } from '../../../src/query/repository'
import { MemoryBundleRepository, readBundle } from '../../../src/storage/query-bundle'
import { isMessage, MessageType } from '../../../src/shared/message'
import { queryTemplate } from '../../factories/query-template'

const now = '2026-10-23T00:00:00.000Z'
const guid = '6dd56b2b-1e1a-4e8b-9ac0-760cd305506a'

function filingTemplate(overrides: Partial<QueryTemplate> = {}): QueryTemplate {
  return queryTemplate({
    id: 'local-1', name: '本月递交', queryType: FILING_TEMPLATE_TYPE,
    fields: { create_date_end: '2026-10-23', ctrl_proc: guid },
    displayValues: { ctrl_proc: '新申请' },
    createdAt: now, updatedAt: now,
    ...overrides
  })
}

const scope = { easyOrigin: LARGE_CUSTOMER_ORIGIN, operatorId: '227BFA59-A8A7-4EC6-928D-50FB5C29F960', easyTabId: 7, connectionVersion: 1 }

describe('递交查询模板校验', () => {
  it('本地递交模板收下，原网站来的递交模板拒收', () => {
    expect(isQueryTemplate(filingTemplate())).toBe(true)
    // 原站的递交列表没有模板功能，也不认这种查询，模板只能是本机的。
    expect(isQueryTemplate(filingTemplate({ source: 'easy', sourceQueryId: scope.operatorId }))).toBe(false)
    expect(isQueryTemplate(filingTemplate({ queryType: '别的查询' as QueryTemplate['queryType'] }))).toBe(false)
    expect(isQueryTemplate(filingTemplate({ name: ' ' }))).toBe(false)
  })

  it('条件键只收递交表单字段，显示文本同口径', () => {
    expect(isQueryTemplate(filingTemplate({ fields: { filetype: '证书' } }))).toBe(false)
    expect(isQueryTemplate(filingTemplate({ fields: { case_volume: 'PA-1' } }))).toBe(true)
    expect(isQueryTemplate(filingTemplate({ displayValues: { case_volume: 'PA 一' } }))).toBe(true)
    expect(isQueryTemplate(filingTemplate({ displayValues: { not_a_field: 'x' } }))).toBe(false)
    const polluted = JSON.parse('{"__proto__":"x","case_volume":"PA-1"}') as Record<string, string>
    expect(isQueryTemplate(filingTemplate({ fields: polluted }))).toBe(false)
  })

  it('递交模板没有原站页面字段，unknownFields 只能为空', () => {
    expect(isQueryTemplate(filingTemplate({ unknownFields: {} }))).toBe(true)
    expect(isQueryTemplate(filingTemplate({ unknownFields: { TreefiletypetxtSearch: '意见陈述' } }))).toBe(false)
    // 文件查询模板照旧能带原站页面字段。
    expect(isQueryTemplate({
      id: 'local-2', name: '文件查询', source: 'local', queryType: 'FileSearch',
      fields: { filetype: '603ca943-a07a-4894-9461-29dff2d60c4b' },
      displayValues: { filetype: '专利证书' },
      unknownFields: { TreefiletypetxtSearch: '意见陈述' },
      version: 1, createdAt: now, updatedAt: now
    })).toBe(true)
  })
})

describe('递交查询模板取用', () => {
  it('只挑本机的递交模板，别的查询类型不混进来', () => {
    const filing = filingTemplate()
    const file = { ...filingTemplate(), id: 'local-2', queryType: 'FileSearch' as const }
    expect(filingTemplatesOf([filing, file]).map(item => item.id)).toEqual(['local-1'])
  })

  it('表单值和模板条件可以互相转换', () => {
    const values = {
      case_volume: 'PA2619787CND-YS',
      ctrl_proc: guid,
      ctrl_proc_text: '新申请',
      create_date_end: '2026-10-23'
    }
    const draft = filingDraftFields(values)
    expect(draft.fields).toEqual({
      case_volume: 'PA2619787CND-YS',
      ctrl_proc: guid,
      create_date_end: '2026-10-23'
    })
    expect(draft.displayValues).toEqual({ ctrl_proc: '新申请' })
    const template = filingTemplate({ fields: draft.fields, displayValues: draft.displayValues })
    expect(isQueryTemplate(template)).toBe(true)
    // 套用模板时显示文本写回 `{字段}_text`，和表单自己存的口径一致。
    expect(filingTemplateValues(template)).toEqual(values)
  })
})

describe('内置模板', () => {
  it('「退回」就两个条件：处理事项 新申请、客户自撰，办理类型 退回', () => {
    const returned = FILING_BUILTIN_TEMPLATES.find(item => item.name === '退回')
    expect(returned).toBeTruthy()
    expect(returned?.conditions).toEqual([
      { key: 'ctrl_proc', labels: ['新申请', '客户自撰'] },
      { key: 'audit_type', labels: ['退回'] }
    ])
    expect(returned?.id.startsWith('builtin-')).toBe(true)
  })

  it('按显示名对内部 ID，只覆盖自己的条件；对不上的记下来不套用', () => {
    const returned = FILING_BUILTIN_TEMPLATES.find(item => item.name === '退回')
    if (!returned) throw new Error('缺内置模板「退回」')
    const optionsOf = (key: string) => key === 'ctrl_proc'
      ? [{ value: 'guid-1', label: '新申请' }, { value: 'guid-2', label: '客户自撰' }]
      : [{ value: '', label: '不限' }, { value: 'reject', label: '退回' }]
    const applied = applyFilingBuiltin(returned, optionsOf, { create_date_end: '2026-10-23' })
    expect(applied.missing).toEqual([])
    expect(applied.values).toEqual({
      create_date_end: '2026-10-23',
      ctrl_proc: 'guid-1,guid-2',
      ctrl_proc_text: '新申请，客户自撰',
      audit_type: 'reject',
      audit_type_text: '退回'
    })
    const blocked = applyFilingBuiltin(returned, () => [], { create_date_end: '2026-10-23' })
    expect(blocked.missing.map(item => item.label)).toEqual(['新申请', '客户自撰', '退回'])
    expect(blocked.values).toEqual({ create_date_end: '2026-10-23' })
  })
})

describe('递交模板存本机配置包', () => {
  it('和文件查询模板同一套存储，各自不混', async () => {
    const memory = new MemoryBundleRepository()
    const repository = new BundleTemplateRepository(memory)
    await repository.save(filingTemplate())
    await repository.save({
      id: 'local-2', name: '文件查询', source: 'local', queryType: 'FileSearch',
      fields: { case_volume: 'PA-1' }, version: 1, createdAt: now, updatedAt: now
    })
    expect(filingTemplatesOf(await repository.list()).map(item => item.name)).toEqual(['本月递交'])
    expect((await repository.get('local-1'))?.queryType).toBe('FilingSearch')
    const stored = (await memory.load()).bundle
    expect(readBundle(stored).writable).toBe(true)
    await repository.delete('local-1')
    expect(await repository.get('local-1')).toBeNull()
  })
})

describe('递交模板消息', () => {
  it('保存和删除走同一套工作台动作', () => {
    const save = { type: MessageType.Workspace, payload: { action: 'saveQueryTemplate', template: filingTemplate(), expectedScope: scope, expectedVersion: null } }
    expect(isMessage(save)).toBe(true)
    expect(isMessage({ ...save, payload: { ...save.payload, expectedVersion: 0 } })).toBe(false)
    expect(isMessage({ ...save, payload: { ...save.payload, template: filingTemplate({ source: 'easy' }) } })).toBe(false)
    expect(isMessage({ type: MessageType.Workspace, payload: { action: 'deleteQueryTemplate', id: 'local-1', expectedScope: scope } })).toBe(true)
  })
})

describe('递交模板页面接线', () => {
  it('递交管理页保存本地模板，查询模板页有递交入口，文件页不收递交模板', () => {
    const filing = readFileSync(projectPath('src/app/components/FilingSearchQuery.vue'), 'utf8')
    expect(filing).toContain("action: 'saveQueryTemplate'")
    expect(filing).toContain("action: 'deleteQueryTemplate'")
    expect(filing).toContain('queryType: FILING_TEMPLATE_TYPE')
    expect(filing).toContain('只存在本机')
    // 模板按卡片列出，点一下就套用，和文件管理页的按模板查询一致；内置模板带「内置」徽标。
    expect(filing).toContain('class="template-picks"')
    expect(filing).toContain('toggleTemplate')
    expect(filing).toContain('FILING_BUILTIN_TEMPLATES')
    expect(filing).toContain(`item.builtin ? '内置' : '本地'`)
    const templates = readFileSync(projectPath('src/app/pages/TemplatesPage.vue'), 'utf8')
    expect(templates).toContain('递交管理')
    expect(templates).toContain('manage')
    const fileSection = readFileSync(projectPath('src/floating/QueryTemplateSection.vue'), 'utf8')
    expect(fileSection).toContain("item.queryType === 'FileSearch'")
  })
})
