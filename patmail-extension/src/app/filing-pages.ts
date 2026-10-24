import type { FilingSearchRow } from '../api/filing-search-types'
import { FILING_FETCH_CONCURRENCY } from '../api/filing-export'

/** 一页拉取的结果。session 表示登录失效：原地重试没用，等重新登录后补齐。 */
export type FilingPageResult = { ok: true; rows: FilingSearchRow[] } | { ok: false; session: boolean }

export interface FilingPageRunOptions {
  /** 并行几页，默认和导出取数同一个并发数（6），把请求打满。 */
  concurrency?: number
  /** 每页最多试几轮，默认 3。 */
  attempts?: number
  /** 重试间隔毫秒，默认 600，测试里可以调小。 */
  gapMs?: number
  /** 每读回一页报一次，带这页的行，用于边拉边收。 */
  onPage?: (page: number, rows: FilingSearchRow[]) => void
}

/**
 * 批量拉页的容灾跑法：每页自己重试，单页失败不拖垮整批，漏掉的页码原样带回；
 * 会话失效立刻停手，剩下的页交给「重试没读到的页」，不在原地空转。
 */
export async function runFilingPages(
  pages: readonly number[],
  fetchPage: (page: number) => Promise<FilingPageResult>,
  options: FilingPageRunOptions = {}
): Promise<number[]> {
  const concurrency = Math.max(1, options.concurrency ?? FILING_FETCH_CONCURRENCY)
  const attempts = Math.max(1, options.attempts ?? 3)
  const gapMs = Math.max(0, options.gapMs ?? 600)
  const missed = new Set<number>()
  let cursor = 0
  let sessionDown = false
  const worker = async (): Promise<void> => {
    while (!sessionDown && cursor < pages.length) {
      const page = pages[cursor]
      cursor += 1
      let got: FilingPageResult = { ok: false, session: false }
      for (let round = 1; round <= attempts; round += 1) {
        try {
          got = await fetchPage(page)
        } catch {
          got = { ok: false, session: false }
        }
        if (got.ok || got.session) break
        if (round < attempts && gapMs > 0) await new Promise(resolve => setTimeout(resolve, gapMs))
      }
      if (got.ok) options.onPage?.(page, got.rows)
      else {
        missed.add(page)
        if (got.session) sessionDown = true
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(pages.length, 1)) }, () => worker()))
  return [...missed].sort((left, right) => left - right)
}
