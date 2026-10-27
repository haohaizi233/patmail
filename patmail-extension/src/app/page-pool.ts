/** 一页拉取的结果。session 表示登录失效：原地重试没用，等重新登录后补齐。 */
export type PageFetchResult<Row> = { ok: true; rows: Row[] } | { ok: false; session: boolean }

export interface PageRunOptions<Row> {
  /** 并行几页。默认 6：浏览器对同一主机（HTTP/1.1）就 6 条连接，打满即可，和递交导出取数同一个并发数。 */
  concurrency?: number
  /** 每页最多试几轮，默认 3。 */
  attempts?: number
  /** 重试间隔毫秒，默认 600，测试里可以调小。 */
  gapMs?: number
  /** 每读回一页报一次，带这页的行，用于边拉边收。 */
  onPage?: (page: number, rows: Row[]) => void
  /** 停止派发和重试，忽略取消后才返回的结果。 */
  signal?: AbortSignal
}

/**
 * 批量拉页的容灾跑法：每页自己重试，单页失败不拖垮整批，漏掉的页码原样带回；
 * 会话失效立刻停手，剩下的页交给「重试没读到的页」，不在原地空转。
 *
 * 分页是无游标的：每页请求都带完整条件加 pageIndex，页码在开跑前就知道，所以可以直接并发，
 * 不用等上一页回来再问下一页。调用方负责把批量页标成 batch，别占「新查询取消旧查询」的槽。
 */
export async function runPagedFetch<Row>(
  pages: readonly number[],
  fetchPage: (page: number) => Promise<PageFetchResult<Row>>,
  options: PageRunOptions<Row> = {}
): Promise<number[]> {
  const requestedConcurrency = options.concurrency ?? 6
  const concurrency = Number.isFinite(requestedConcurrency) ? Math.max(1, Math.trunc(requestedConcurrency)) : 6
  const attempts = Math.max(1, options.attempts ?? 3)
  const gapMs = Math.max(0, options.gapMs ?? 600)
  const missed = new Set(pages)
  let cursor = 0
  let sessionDown = false
  const stopped = (): boolean => sessionDown || options.signal?.aborted === true
  const worker = async (): Promise<void> => {
    while (!stopped() && cursor < pages.length) {
      const page = pages[cursor]
      cursor += 1
      let got: PageFetchResult<Row> = { ok: false, session: false }
      for (let round = 1; round <= attempts && !stopped(); round += 1) {
        try {
          got = await fetchPage(page)
        } catch {
          got = { ok: false, session: false }
        }
        if (options.signal?.aborted) return
        if (got.ok) break
        if (got.session) {
          sessionDown = true
          break
        }
        if (stopped()) break
        if (round < attempts && gapMs > 0) await new Promise(resolve => setTimeout(resolve, gapMs))
      }
      if (got.ok && !options.signal?.aborted) {
        options.onPage?.(page, got.rows)
        missed.delete(page)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(pages.length, 1)) }, () => worker()))
  return [...missed].sort((left, right) => left - right)
}
