import { describe, expect, it } from 'vitest'
import type { FileSearchResult } from '../../../src/api/file-search-types'
import { createFileSearchPageCache } from '../../../src/app/services/file-search-page-cache'

const sessionA = '11111111-1111-4111-8111-111111111111'
const sessionB = '22222222-2222-4222-8222-222222222222'

function page(pageIndex: number, options: { sessionId?: string; pageSize?: number; total?: number; totalPages?: number } = {}): FileSearchResult {
  return {
    items: [{
      fileId: `file-${pageIndex}`,
      fileName: `附件 ${pageIndex}.pdf`,
      fileStatus: '已处理',
      caseName: `案件 ${pageIndex}`,
      customerVolume: `客户文号 ${pageIndex}`,
      uploadTime: '2026-11-02 10:00:00'
    }],
    total: options.total ?? 201,
    pageIndex,
    pageSize: options.pageSize ?? 100,
    totalPages: options.totalPages ?? 3,
    ...(options.sessionId === undefined ? { querySessionId: sessionA } : { querySessionId: options.sessionId })
  }
}

describe('文件查询完整页缓存', () => {
  it('按查询来源、每页数量和页码返回原始完整结果', () => {
    const cache = createFileSearchPageCache()
    const first = page(1)
    const second = page(2)

    expect(cache.set(first)).toBe(true)
    expect(cache.set(second)).toBe(true)
    expect(cache.get(sessionA, 100, 1)).toBe(first)
    expect(cache.get(sessionA, 100, 2)).toBe(second)
    expect(cache.get(sessionA, 50, 2)).toBeUndefined()
    expect(cache.get(sessionB, 100, 2)).toBeUndefined()
    expect(cache.get(` ${sessionA}`, 100, 2)).toBeUndefined()
    expect(cache.get(sessionA, 100, 3)).toBeUndefined()
  })

  it('拒绝没有有效分页信息或查询来源的结果', () => {
    const cache = createFileSearchPageCache()

    expect(cache.set(page(1, { sessionId: '' }))).toBe(false)
    expect(cache.set({ ...page(1), pageIndex: 0 })).toBe(false)
    expect(cache.set({ ...page(1), pageSize: 0 })).toBe(false)
    expect(cache.set({ ...page(1), pageSize: 101 })).toBe(false)
    expect(cache.get(sessionA, 100, 1)).toBeUndefined()
  })

  it('默认保留超过256页的当前查询结果', () => {
    const cache = createFileSearchPageCache()
    const first = page(1, { total: 30_000, totalPages: 300 })
    cache.set(first)
    for (let pageIndex = 2; pageIndex <= 300; pageIndex++) {
      cache.set(page(pageIndex, { total: 30_000, totalPages: 300 }))
    }

    expect(cache.get(sessionA, 100, 1)).toBe(first)
    expect(cache.get(sessionA, 100, 300)).toBeDefined()
  })

  it('超过容量时淘汰最近最少使用的页面', () => {
    const cache = createFileSearchPageCache({ maxPages: 2 })
    const first = page(1)
    const second = page(2)

    cache.set(first)
    cache.set(second)
    cache.get(sessionA, 100, 1)
    cache.set(page(3))

    expect(cache.get(sessionA, 100, 1)).toBe(first)
    expect(cache.get(sessionA, 100, 2)).toBeUndefined()
    expect(cache.get(sessionA, 100, 3)).toBeDefined()
  })

  it('clear 会释放所有查询页面', () => {
    const cache = createFileSearchPageCache()
    cache.set(page(1))

    cache.clear()

    expect(cache.get(sessionA, 100, 1)).toBeUndefined()
  })
})
