import { fileSearchTimeoutMs, type FileSearchTimeoutMs } from './file-search-params'

function storage(): chrome.storage.LocalStorageArea | null {
  return globalThis.chrome?.storage?.local ?? null
}

function createTimeoutStore(key: string): {
  write: (value: unknown) => FileSearchTimeoutMs
  read: () => Promise<FileSearchTimeoutMs>
} {
  let cached: FileSearchTimeoutMs | null = null
  let generation = 0
  return {
    write(value: unknown): FileSearchTimeoutMs {
      const next = fileSearchTimeoutMs(value)
      cached = next
      generation += 1
      void storage()?.set({ [key]: next })
      return next
    },
    read(): Promise<FileSearchTimeoutMs> {
      if (cached != null) return Promise.resolve(cached)
      const area = storage()
      if (!area) {
        cached = 60_000
        return Promise.resolve(cached)
      }
      const ticket = generation
      return area.get(key).then(stored => {
        if (ticket !== generation && cached != null) return cached
        cached = fileSearchTimeoutMs(stored[key])
        return cached
      }).catch(() => {
        if (cached != null) return cached
        cached = 60_000
        return cached
      })
    }
  }
}

const limitTimeout = createTimeoutStore('patmail.limitMonitor.timeoutMs')
const filingTimeout = createTimeoutStore('patmail.filingSearch.timeoutMs')

/** 下拉一改就记下。后面的期限查询按这次选择等待，不再固定一分钟。 */
export function writeLimitTimeout(value: unknown): FileSearchTimeoutMs {
  return limitTimeout.write(value)
}

/** 发请求时再读一次。表格自动查询不经过查询按钮，也要拿到当前下拉。 */
export function readLimitTimeout(): Promise<FileSearchTimeoutMs> {
  return limitTimeout.read()
}

/** 递交查询的超时下拉，和期限查询分开记，各用各的。 */
export function writeFilingTimeout(value: unknown): FileSearchTimeoutMs {
  return filingTimeout.write(value)
}

export function readFilingTimeout(): Promise<FileSearchTimeoutMs> {
  return filingTimeout.read()
}
