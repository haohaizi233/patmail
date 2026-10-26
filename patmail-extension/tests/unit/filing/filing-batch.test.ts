import { describe, expect, it } from 'vitest'
import { EasyRuntime } from '../../../src/api/client'
import type { FilingSearchQuery } from '../../../src/api/filing-search-params'

const authenticated = { ClientInfo: { IsLogin: true, Status: true, Result: true } }

function query(pageIndex: number): FilingSearchQuery {
  return { fields: { case_volume: `PA${pageIndex}` }, pageIndex, pageSize: 20 }
}

function filingPage(page: number): Response {
  return new Response(JSON.stringify({ TableRows: null, TableRowsCount: String(page), ClientInfo: authenticated.ClientInfo }))
}

/** 每个请求按 pageIndex 挂起，等测试来放行；被 abort 的记进 aborted。 */
function pagingFetcher(state: { aborted: string[]; pending: Map<string, (response: Response) => void> }): typeof fetch {
  return async (url, init) => {
    if (String(url).endsWith('Login.ashx')) return new Response(JSON.stringify(authenticated))
    const page = new URLSearchParams(String(init?.body)).get('pageIndex') ?? '?'
    return new Promise<Response>((resolve, reject) => {
      state.pending.set(page, resolve)
      init?.signal?.addEventListener('abort', () => {
        state.aborted.push(page)
        state.pending.delete(page)
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      })
    })
  }
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('递交查询的批量拉页', () => {
  it('batch 拉页互不取消：并行几页各自成活', async () => {
    const state = { aborted: [] as string[], pending: new Map<string, (response: Response) => void>() }
    const runtime = new EasyRuntime('http://183.36.43.66:88', { fetcher: pagingFetcher(state) })
    await runtime.checkSession()
    const runs = [1, 2, 3, 4].map(page => runtime.searchFiling(query(page), undefined, true))
    await settle()
    expect(state.pending.size).toBe(4)
    for (const page of ['1', '2', '3', '4']) state.pending.get(page)!(filingPage(Number(page)))
    const results = await Promise.all(runs)
    expect(state.aborted).toEqual([])
    expect(results.map(item => (item.ok ? item.data.total : -1))).toEqual([1, 2, 3, 4])
  })

  it('普通查询仍然新查取消旧查', async () => {
    const state = { aborted: [] as string[], pending: new Map<string, (response: Response) => void>() }
    const runtime = new EasyRuntime('http://183.36.43.66:88', { fetcher: pagingFetcher(state) })
    await runtime.checkSession()
    const first = runtime.searchFiling(query(1))
    await settle()
    const second = runtime.searchFiling(query(2))
    await settle()
    expect(state.aborted).toEqual(['1'])
    state.pending.get('2')!(filingPage(2))
    const [oldRun, newRun] = await Promise.all([first, second])
    expect(oldRun.ok).toBe(false)
    expect(newRun.ok).toBe(true)
    expect(newRun.ok && newRun.data.total).toBe(2)
  })

  it('批量拉页不打断正在跑的手工查询', async () => {
    const state = { aborted: [] as string[], pending: new Map<string, (response: Response) => void>() }
    const runtime = new EasyRuntime('http://183.36.43.66:88', { fetcher: pagingFetcher(state) })
    await runtime.checkSession()
    const manual = runtime.searchFiling(query(1))
    await settle()
    const batch = runtime.searchFiling(query(2), undefined, true)
    await settle()
    expect(state.aborted).toEqual([])
    state.pending.get('1')!(filingPage(1))
    state.pending.get('2')!(filingPage(2))
    const [manualResult, batchResult] = await Promise.all([manual, batch])
    expect(manualResult.ok && manualResult.data.total).toBe(1)
    expect(batchResult.ok && batchResult.data.total).toBe(2)
  })
})
