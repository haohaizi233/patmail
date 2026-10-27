import { afterEach, describe, expect, it, vi } from 'vitest'
import { runPagedFetch, type PageFetchResult } from '../../../src/app/page-pool'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

const success = (page: number): PageFetchResult<number> => ({ ok: true, rows: [page * 10] })

afterEach(() => { vi.useRealTimers() })

describe('分页请求池', () => {
  it('默认同时拉六页，完成一页立即补位，乱序结果不漏不重', async () => {
    const gates = Array.from({ length: 9 }, () => deferred<PageFetchResult<number>>())
    const called: number[] = []
    const received: Array<[number, number[]]> = []
    let active = 0
    let peak = 0
    const pending = runPagedFetch([1, 2, 3, 4, 5, 6, 7, 8, 9], async page => {
      called.push(page)
      active += 1
      peak = Math.max(peak, active)
      try { return await gates[page - 1]!.promise }
      finally { active -= 1 }
    }, { onPage: (page, rows) => { received.push([page, rows]) } })

    expect(called).toEqual([1, 2, 3, 4, 5, 6])
    gates[2]!.resolve(success(3))
    await vi.waitFor(() => { expect(called).toEqual([1, 2, 3, 4, 5, 6, 7]) })
    expect(active).toBe(6)
    for (const page of [6, 1, 5, 2, 4, 9, 8, 7]) gates[page - 1]!.resolve(success(page))

    expect(await pending).toEqual([])
    expect(peak).toBe(6)
    expect(called).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(received.sort((a, b) => a[0] - b[0])).toEqual([
      [1, [10]], [2, [20]], [3, [30]], [4, [40]], [5, [50]],
      [6, [60]], [7, [70]], [8, [80]], [9, [90]]
    ])
  })

  it('登录失效时返回失败页及尚未派发的页，保留此前成功页', async () => {
    const called: number[] = []
    const received: number[] = []
    const missed = await runPagedFetch([1, 2, 3, 4, 5, 6, 7, 8], async page => {
      called.push(page)
      return page === 2 ? { ok: false, session: true } : success(page)
    }, { concurrency: 1, onPage: page => { received.push(page) } })

    expect(called).toEqual([1, 2])
    expect(received).toEqual([1])
    expect(missed).toEqual([2, 3, 4, 5, 6, 7, 8])
  })

  it('一个请求发现登录失效后，其他在途失败请求不再重试', async () => {
    const first = deferred<PageFetchResult<number>>()
    const second = deferred<PageFetchResult<number>>()
    const called: number[] = []
    const pending = runPagedFetch([1, 2, 3, 4], page => {
      called.push(page)
      return page === 1 ? first.promise : second.promise
    }, { concurrency: 2, gapMs: 0 })

    first.resolve({ ok: false, session: true })
    await Promise.resolve()
    second.resolve({ ok: false, session: false })

    expect(await pending).toEqual([1, 2, 3, 4])
    expect(called).toEqual([1, 2])
  })

  it('开始前已取消时不派发请求，并返回所有页', async () => {
    const controller = new AbortController()
    controller.abort()
    const called: number[] = []
    const missed = await runPagedFetch([1, 2, 3], async page => {
      called.push(page)
      return success(page)
    }, { signal: controller.signal })

    expect(called).toEqual([])
    expect(missed).toEqual([1, 2, 3])
  })

  it('批次中取消后忽略在途成功结果，保留已交付页且不派发新页', async () => {
    const controller = new AbortController()
    const second = deferred<PageFetchResult<number>>()
    const called: number[] = []
    const received: number[] = []
    const pending = runPagedFetch([1, 2, 3, 4], async page => {
      called.push(page)
      return page === 1 ? success(page) : second.promise
    }, {
      concurrency: 1,
      signal: controller.signal,
      onPage: page => { received.push(page) }
    })

    await vi.waitFor(() => { expect(called).toEqual([1, 2]) })
    controller.abort()
    second.resolve(success(2))

    expect(await pending).toEqual([2, 3, 4])
    expect(received).toEqual([1])
    expect(called).toEqual([1, 2])
  })

  it('取消重试等待时不再发请求或交付结果', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const called: number[] = []
    const received: number[] = []
    const pending = runPagedFetch([1, 2], async page => {
      called.push(page)
      return { ok: false, session: false }
    }, {
      concurrency: 1, gapMs: 600, signal: controller.signal,
      onPage: page => { received.push(page) }
    })

    await Promise.resolve()
    controller.abort()
    await vi.runAllTimersAsync()

    expect(await pending).toEqual([1, 2])
    expect(called).toEqual([1])
    expect(received).toEqual([])
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('非有限并发数 %s 仍能完整读取', async concurrency => {
    const received: number[] = []
    const missed = await runPagedFetch([1, 2], async page => success(page), {
      concurrency, onPage: page => { received.push(page) }
    })
    expect(missed).toEqual([])
    expect(received.sort()).toEqual([1, 2])
  })
})
