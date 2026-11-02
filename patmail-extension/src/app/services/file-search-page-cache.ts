import type { FileSearchResult } from '../../api/file-search-types'

export interface FileSearchPageCache {
  /** Returns false when the response cannot be tied to a valid query-session page. */
  set(result: FileSearchResult): boolean
  get(querySessionId: string, pageSize: number, pageIndex: number): FileSearchResult | undefined
  clear(): void
}

export interface FileSearchPageCacheOptions {
  /** Bound memory use while keeping the most recently visited or bulk-read pages. */
  maxPages?: number
}

function cacheKey(querySessionId: string, pageSize: number, pageIndex: number): string {
  return JSON.stringify([querySessionId, pageSize, pageIndex])
}

function validLookup(querySessionId: string, pageSize: number, pageIndex: number): boolean {
  return Boolean(querySessionId.trim()) && querySessionId === querySessionId.trim() &&
    Number.isSafeInteger(pageSize) && pageSize > 0 && pageSize <= 100 &&
    Number.isSafeInteger(pageIndex) && pageIndex > 0
}

function validResult(result: FileSearchResult): boolean {
  const querySessionId = typeof result.querySessionId === 'string' ? result.querySessionId : ''
  return Boolean(querySessionId.trim()) && querySessionId === querySessionId.trim() && Array.isArray(result.items) &&
    Number.isSafeInteger(result.pageSize) && result.pageSize > 0 && result.pageSize <= 100 &&
    Number.isSafeInteger(result.pageIndex) && result.pageIndex > 0 &&
    Number.isSafeInteger(result.total) && result.total >= 0 &&
    Number.isSafeInteger(result.totalPages) && result.totalPages >= 0 &&
    result.pageIndex <= Math.max(1, result.totalPages)
}

/**
 * In-memory cache for complete query results. A caller owns the cache lifecycle
 * and should clear it when starting a different search or changing account scope.
 */
export function createFileSearchPageCache(options: FileSearchPageCacheOptions = {}): FileSearchPageCache {
  // The component clears this cache for each new query/account scope, so by default
  // it can retain every page traversed by the active query. Callers may opt into a
  // smaller LRU cap when they need to share the cache across a longer-lived scope.
  const requestedLimit = options.maxPages
  const maxPages = requestedLimit === undefined
    ? Number.POSITIVE_INFINITY
    : Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : Number.POSITIVE_INFINITY
  const pages = new Map<string, FileSearchResult>()

  return {
    set(result) {
      if (!validResult(result)) return false
      const id = result.querySessionId!
      const key = cacheKey(id, result.pageSize, result.pageIndex)
      // Map iteration order is the LRU order: refresh this page before insertion.
      pages.delete(key)
      pages.set(key, result)
      while (pages.size > maxPages) {
        const oldest = pages.keys().next().value
        if (oldest === undefined) break
        pages.delete(oldest)
      }
      return true
    },

    get(querySessionId, pageSize, pageIndex) {
      if (!validLookup(querySessionId, pageSize, pageIndex)) return undefined
      const id = querySessionId
      const key = cacheKey(id, pageSize, pageIndex)
      const result = pages.get(key)
      if (!result) return undefined
      pages.delete(key)
      pages.set(key, result)
      return result
    },

    clear() {
      pages.clear()
    }
  }
}
