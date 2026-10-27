import type { FilingSearchRow } from '../api/filing-search-types'
import { FILING_FETCH_CONCURRENCY } from '../api/filing-export'
import { runPagedFetch, type PageFetchResult, type PageRunOptions } from './page-pool'

/** 一页拉取的结果。session 表示登录失效：原地重试没用，等重新登录后补齐。 */
export type FilingPageResult<Row = FilingSearchRow> = PageFetchResult<Row>

export type FilingPageRunOptions<Row = FilingSearchRow> = PageRunOptions<Row>

/**
 * 批量拉页的容灾跑法（递交翻页用）：每页自己重试，单页失败不拖垮整批，漏掉的页码原样带回；
 * 会话失效立刻停手，剩下的页交给「重试没读到的页」，不在原地空转。
 */
export function runFilingPages<Row = FilingSearchRow>(
  pages: readonly number[],
  fetchPage: (page: number) => Promise<FilingPageResult<Row>>,
  options: FilingPageRunOptions<Row> = {}
): Promise<number[]> {
  return runPagedFetch(pages, fetchPage, { concurrency: FILING_FETCH_CONCURRENCY, ...options })
}
