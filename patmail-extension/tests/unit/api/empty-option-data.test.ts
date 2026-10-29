import { afterEach, expect, it, vi } from 'vitest'
import { DictionaryService } from '../../../src/api/dictionaries/service'
import type { EasyTransport } from '../../../src/api/transport'
const keys: Record<string, string[]> = {
  deptTree: ['DeptTree'], treeUser: ['TreeUser'], treeAgent: ['TreeUser'], fileTempList: ['TempNameList'],
  deptBranch: ['BranchList'], applyTags: ['ApplyTags'], limitInit: ['CountryInfo', 'CaseType', 'ProcStatus', 'CustomerStatus', 'apply_type', 'case_status', 'Case_direction', 'BussType', 'procType'],
  limitCtrlProc: ['CtrlProc'], filingFlowNode: ['ApplyFlowNode', 'CaseType'], contractInit: ['table5']
}
afterEach(() => vi.unstubAllGlobals())
it('does not cache failed sources as empty, then caches a verified empty response', async () => {
  let fail = true
  const post = vi.fn(async (operation: string) => {
    if (operation === 'applyTags' && fail) return { ok: false, error: { code: 'NETWORK_ERROR', message: 'offline' } }
    return { ok: true, data: { ClientInfo: { IsLogin: true, Status: true }, ...Object.fromEntries(keys[operation]!.map(key => [key, null])) } }
  })
  const service = new DictionaryService({ post } as unknown as EasyTransport)
  const failed = await service.loadPicker('same-account', false)
  expect(failed.ok && failed.data.dictionaries.applyTags.status).toBe('invalid')
  fail = false
  const empty = await service.loadPicker('same-account', false)
  expect(empty.ok && empty.data.dictionaries.applyTags.status).toBe('empty')
  await service.loadPicker('same-account', false)
  expect(post.mock.calls.filter(call => call[0] === 'applyTags')).toHaveLength(2)
})
it('persists empty tombstones through hydration, ignores page fallback and keeps failures from erasing them', async () => {
  let storage: Record<string, unknown> = {}
  vi.stubGlobal('chrome', { storage: { local: { get: async () => storage, set: async (next: Record<string, unknown>) => { storage = next } } } })
  vi.resetModules()
  let fallback = await import('../../../src/query/option-fallback')
  fallback.rememberChoices('hydration-account', 'apply_tags_id', [{ value: 'old', label: '旧标签' }])
  fallback.rememberDictionaries('hydration-account', { apply_tags_id: 'applyTags' }, { applyTags: { key: 'applyTags', status: 'empty', options: [], warnings: [] } })
  await fallback.flushOptionFallback()
  vi.resetModules()
  fallback = await import('../../../src/query/option-fallback')
  await fallback.hydrateOptionFallback('hydration-account')
  expect(fallback.savedChoices('hydration-account', 'apply_tags_id')).toEqual([])
  fallback.rememberFormFields('hydration-account', [{ id: 'apply_tags_id', label: '标签', control: 'picker', options: [{ value: 'stale', label: '过期' }], section: 'case', advanced: false, visible: true, hiddenBy: [] }])
  fallback.rememberDictionaries('hydration-account', { apply_tags_id: 'applyTags' }, { applyTags: { key: 'applyTags', status: 'invalid', options: [], warnings: [] } })
  expect(fallback.savedChoices('hydration-account', 'apply_tags_id')).toEqual([])
  expect(fallback.savedChoices('another-account', 'apply_tags_id')).toBeNull()
})
