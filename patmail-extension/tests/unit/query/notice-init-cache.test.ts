import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoticeInitData } from '../../../src/api/notice-types'
import {
  hasCachedNoticeOptions,
  mergeNoticeInitData,
  peekNoticeInitCache,
  readNoticeInitCache,
  resetNoticeInitCacheForTests,
  saveNoticeInitCache
} from '../../../src/query/notice-init-cache'

function makeInit(partial: Partial<NoticeInitData> = {}): NoticeInitData {
  return {
    applyTypes: [],
    agencies: [],
    directions: [],
    applyTags: [],
    branches: [],
    countries: [],
    fileTypes: [],
    users: [],
    cpcAccounts: [],
    defaultTzsStartDate: '2023-01-01',
    handCount: 0,
    nolaiutoCount: 0,
    warnings: [],
    ...partial
  }
}

describe('notice-init-cache', () => {
  afterEach(() => {
    resetNoticeInitCacheForTests()
    vi.unstubAllGlobals()
  })

  it('persists and restores per-user init cache while stripping transient warnings', async () => {
    const store = new Map<string, unknown>()
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: (key: string) => Promise.resolve({ [key]: store.get(key) }),
          set: (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) store.set(k, v)
            return Promise.resolve()
          }
        }
      }
    })

    const init = makeInit({
      applyTypes: [{ value: 'a1', label: '发明专利' }],
      agencies: [{ value: 'ag1', label: '某某所 (44001)' }],
      detailFileTypes: [
        { id: '81802CDE-D39D-4658-B45E-74631B0715C1', name: '官方来文', parentId: '', selectable: false },
        { id: '8c44762d-44d5-4473-b4fc-b818373d6763', name: '国际检索单位书面意见(PCT/ISA/237)', parentId: '81802CDE-D39D-4658-B45E-74631B0715C1' }
      ],
      users: [{ id: 'u1', name: '张三', parentId: '0', treeType: 'User' }],
      defaultTzsStartDate: '2026-10-01',
      handCount: 42,
      nolaiutoCount: 99,
      warnings: ['临时警告']
    })

    await saveNoticeInitCache('user-1', {
      initData: init,
      userOptions: [{ value: 'u1', label: '张三' }]
    })

    expect(peekNoticeInitCache('user-1')?.initData.warnings).toEqual([])
    expect(hasCachedNoticeOptions(peekNoticeInitCache('user-1')?.initData ?? null)).toBe(true)

    resetNoticeInitCacheForTests()
    const restored = await readNoticeInitCache('user-1')
    expect(restored?.initData.applyTypes).toEqual([{ value: 'a1', label: '发明专利' }])
    expect(restored?.initData.detailFileTypes).toEqual([
      { id: '81802CDE-D39D-4658-B45E-74631B0715C1', name: '官方来文', parentId: '', selectable: false },
      { id: '8c44762d-44d5-4473-b4fc-b818373d6763', name: '国际检索单位书面意见(PCT/ISA/237)', parentId: '81802CDE-D39D-4658-B45E-74631B0715C1' }
    ])
    expect(restored?.initData.users).toEqual([{ id: 'u1', name: '张三', parentId: '0', treeType: 'User' }])
    expect(restored?.initData.defaultTzsStartDate).toBe('2026-10-01')
    expect(restored?.initData.handCount).toBe(42)
    expect(restored?.userOptions).toEqual([{ value: 'u1', label: '张三' }])
    expect(await readNoticeInitCache('user-2')).toBeNull()
  })

  it('keeps cached fallback options when background refresh partially fails and suppresses warnings in silent mode', () => {
    const cached = makeInit({
      applyTypes: [{ value: 'a1', label: '发明专利' }],
      agencies: [{ value: 'ag1', label: '旧代理所' }],
      countries: [{ value: 'CN', label: '中国' }],
      detailFileTypes: [{ id: 'ft-root', name: '官方来文', parentId: '', selectable: false }],
      users: [{ id: 'u1', name: '张三', parentId: '0', treeType: 'User' }],
      defaultTzsStartDate: '2026-09-01',
      handCount: 18,
      nolaiutoCount: 120
    })

    const incoming = makeInit({
      applyTypes: [],
      agencies: [{ value: 'ag2', label: '新代理所' }],
      countries: [{ value: 'CN', label: '中国' }],
      users: [],
      defaultTzsStartDate: '2023-01-01',
      handCount: 0,
      nolaiutoCount: 0,
      warnings: ['申请类型读取失败：请求超时，请重试。']
    })

    const silentMerged = mergeNoticeInitData(cached, incoming, { preserveCounts: true, silent: true })
    expect(silentMerged.applyTypes).toEqual([{ value: 'a1', label: '发明专利' }])
    expect(silentMerged.agencies).toEqual([{ value: 'ag2', label: '新代理所' }])
    expect(silentMerged.detailFileTypes).toEqual([{ id: 'ft-root', name: '官方来文', parentId: '', selectable: false }])
    expect(silentMerged.users).toEqual([{ id: 'u1', name: '张三', parentId: '0', treeType: 'User' }])
    expect(silentMerged.defaultTzsStartDate).toBe('2026-09-01')
    expect(silentMerged.handCount).toBe(18)
    expect(silentMerged.nolaiutoCount).toBe(120)
    expect(silentMerged.warnings).toEqual([])

    const explicitMerged = mergeNoticeInitData(cached, incoming, { preserveCounts: true, silent: false })
    expect(explicitMerged.warnings).toEqual(['申请类型读取失败：请求超时，请重试。'])
  })
})
