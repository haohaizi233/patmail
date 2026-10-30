import { readGeneratedFileNames } from '../mail/download-name'
import { isRecord, readClientInfo } from './response-guards'
import { apiError, type ApiResult } from './types'

interface Cell { promise: Promise<ApiResult<string>>; resolve(value: ApiResult<string>): void; settled: boolean }
/** Per-account/query source cache. Joining readers do not acquire network slots. */
export class DownloadNameRequests {
  private readonly cells = new Map<string, Cell>()
  clear(): void { this.cells.clear() }
  async post(params: URLSearchParams, signal: AbortSignal | undefined, request: (params: URLSearchParams) => Promise<ApiResult<unknown>>): Promise<ApiResult<unknown>> {
    if (signal?.aborted) return apiError('REQUEST_ABORTED', '请求已取消。')
    const ids = (params.get('file_ids') ?? '').split(';')
    if (!ids.length || ids.length > 40 || ids.some(id => !id)) return apiError('INVALID_QUERY', '命名批次无效。')
    const recipe = JSON.stringify([...params.entries()].filter(([key]) => key !== 'file_ids').sort(([a], [b]) => a.localeCompare(b)))
    const fresh = new Map<string, { key: string; cell: Cell }>()
    const requested = ids.map(id => {
      const key = JSON.stringify([recipe, id])
      let cell = this.cells.get(key)
      if (!cell) {
        let resolve!: Cell['resolve']
        cell = { promise: new Promise(yes => { resolve = yes }), resolve: value => resolve(value), settled: false }
        this.cells.set(key, cell); fresh.set(id, { key, cell })
      }
      return cell
    })
    if (fresh.size) {
      const missing = [...fresh.keys()], next = new URLSearchParams(params)
      next.set('file_ids', missing.join(';'))
      void (async () => {
        let response: ApiResult<unknown>
        try { response = await request(next) } catch { response = apiError('NETWORK_ERROR', '下载名称请求中断，请重试。') }
        let values: string[] | null = null
        if (response.ok) {
          const client = isRecord(response.data) ? readClientInfo(response.data.ClientInfo) : null
          if (client?.ok && client.data.IsLogin === false) response = apiError('SESSION_EXPIRED', 'EASY 登录状态已失效。')
          else {
            values = readGeneratedFileNames(response.data, missing.length)
            if (!values) response = apiError('INVALID_RESPONSE', '下载名称没有生成完整的文件名。')
          }
        }
        missing.forEach((id, index) => {
          const { key, cell } = fresh.get(id)!
          cell.settled = true
          cell.resolve(response.ok ? { ok: true, data: values![index] } : response)
          if (!response.ok && this.cells.get(key) === cell) this.cells.delete(key)
        })
        if (this.cells.size > 20_000) for (const [key, cell] of this.cells) {
          if (this.cells.size <= 20_000) break
          if (cell.settled) this.cells.delete(key)
        }
      })()
    }
    const result = Promise.all(requested.map(cell => cell.promise)).then(results => {
      const failure = results.find(value => !value.ok)
      if (failure && !failure.ok) return failure
      return { ok: true as const, data: { ClientInfo: { IsLogin: true, Status: true }, file_names: results.map(value => value.ok ? value.data : '').join(';') } }
    })
    if (!signal) return result
    return new Promise(resolve => {
      const abort = () => { signal.removeEventListener('abort', abort); resolve(apiError('REQUEST_ABORTED', '请求已取消。')) }
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      void result.then(value => { signal.removeEventListener('abort', abort); resolve(value) })
    })
  }
}
