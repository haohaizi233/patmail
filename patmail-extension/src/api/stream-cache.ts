export interface CachedFileInfo {
  receivedBytes: number
  complete: boolean
  totalBytes?: number | null
  etag?: string
  lastModified?: string
  skipReason?: string
  /** 原站通知只作正文校验时的线索，不能单独判定失败；冷恢复需保留。 */
  sourceNotice?: string
}

// Transport EOF is independent of the durable response stream's completion.
const networkCompletions = new WeakMap<Response, Promise<void>>()
export const responseNetworkFinished = (response: Response): Promise<void> | undefined => networkCompletions.get(response)
export const CACHE_QUEUE_BYTES = 512 * 1024
const CACHE_BLOCK_BYTES = 256 * 1024
export interface DownloadCache {
  names: Record<string, string[]>
  saveNames(offset: number, names: string[]): Promise<void>
  info(index: number): Promise<CachedFileInfo>
  reset(index: number, metadata: Partial<CachedFileInfo>): Promise<void>
  write(index: number, offset: number, bytes: Uint8Array): Promise<void>
  complete(index: number, metadata: Partial<CachedFileInfo>): Promise<void>
  read(index: number, offset: number): Promise<Uint8Array>
}

/** 全部回放都保持未知长度ReadableStream模式，确保ZIP本地头与首轮一致。 */
export async function cachedFileResponse(
  url: string, index: number, cache: DownloadCache, signal: AbortSignal,
  fetcher: (url: string, init?: RequestInit) => Promise<Response>, sourceNotice = ''
): Promise<Response> {
  let info = await cache.info(index)
  if (!info.complete && info.totalBytes != null && info.receivedBytes === info.totalBytes) {
    await cache.complete(index, info)
    info = { ...info, complete: true }
  }
  let prefix = info.complete ? info.receivedBytes : 0
  let source: Response | undefined
  if (!info.complete) {
    const validator = info.etag && !info.etag.startsWith('W/') ? info.etag : info.lastModified
    const headers = new Headers()
    if (info.receivedBytes && validator) {
      prefix = info.receivedBytes
      headers.set('Range', `bytes=${prefix}-`); headers.set('If-Range', validator)
    }
    source = await fetcher(url, { credentials: 'include', signal, headers })
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(source.headers.get('content-range') ?? '')
    const etag = source.headers.get('etag') ?? ''
    const modified = source.headers.get('last-modified') ?? ''
    const accepted = prefix > 0 && source.status === 206 && range && Number(range[1]) === prefix &&
      Number(range[2]) >= prefix && Number(range[2]) + 1 === Number(range[3]) &&
      (!info.etag || etag === info.etag) && (!info.lastModified || modified === info.lastModified)
    if (prefix && !accepted && source.status !== 200) {
      await source.body?.cancel()
      source = await fetcher(url, { credentials: 'include', signal })
    }
    if (!source.ok || !source.body) return source
    if (!accepted) {
      prefix = 0
      const size = source.headers.get('content-length')
      info = { receivedBytes: 0, complete: false, ...(sourceNotice ? { sourceNotice: sourceNotice.slice(0, 1000) } : {}), etag: source.headers.get('content-encoding') ? '' : source.headers.get('etag') ?? '', lastModified: source.headers.get('content-encoding') ? '' : source.headers.get('last-modified') ?? '',
        totalBytes: !source.headers.get('content-encoding') && size !== null ? Number(size) : null }
      await cache.reset(index, info)
    } else info = { ...info, totalBytes: Number(range![3]) }
  }
  const reader = source?.body?.getReader()
  let replayed = 0, received = prefix
  let sourceEnded = !reader, stopped = false, failure: unknown
  let finishNetwork!: () => void
  const networkFinished = new Promise<void>(resolve => { finishNetwork = resolve })
  const queue: Uint8Array[] = []
  let queuedBytes = 0
  const waiters = new Set<() => void>()
  const wake = () => { for (const resolve of waiters) resolve(); waiters.clear() }
  const wait = () => new Promise<void>(resolve => { waiters.add(resolve) })
  const stop = async (reason: unknown) => {
    stopped = true; failure ??= reason; queue.length = 0; queuedBytes = 0; wake()
    await reader?.cancel(reason).catch(() => {})
    finishNetwork()
  }
  const abort = () => { void stop(signal.reason ?? new Error('下载已取消。')) }
  signal.addEventListener('abort', abort, { once: true })
  // At most two queued blocks, one assembling block, and the browser's current
  // source chunk. A slow disk applies real backpressure instead of buffering files.
  const drainNetwork = async () => {
    if (!reader) { finishNetwork(); return }
    let pending = new Uint8Array(), pendingOffset = 0
    while (!stopped) {
      while (queuedBytes >= CACHE_QUEUE_BYTES && !stopped) await wait()
      if (stopped) return
      const block = new Uint8Array(CACHE_BLOCK_BYTES)
      let filled = 0
      while (filled < block.length && !stopped) {
        signal.throwIfAborted()
        if (pendingOffset === pending.length) {
          const chunk = await reader.read()
          if (stopped) return
          if (chunk.done) { sourceEnded = true; finishNetwork(); break }
          pending = chunk.value; pendingOffset = 0
        }
        const count = Math.min(block.length - filled, pending.length - pendingOffset)
        block.set(pending.subarray(pendingOffset, pendingOffset + count), filled)
        filled += count; pendingOffset += count
      }
      if (stopped) return
      if (filled) {
        const part = filled === block.length ? block : block.slice(0, filled)
        queue.push(part); queuedBytes += part.length
      }
      wake()
      if (sourceEnded) return
    }
  }
  void drainNetwork().catch(async error => { await stop(error) })
  if (signal.aborted) abort()
  const body = new ReadableStream<Uint8Array>({
    async pull(target) {
      try {
        signal.throwIfAborted()
        if (replayed < prefix) {
          const chunk = await cache.read(index, replayed)
          if (!chunk.length || replayed + chunk.length > prefix) throw new Error('本机附件缓存不完整，不能续传。')
          replayed += chunk.length; target.enqueue(chunk); return
        }
        if (!reader) { signal.removeEventListener('abort', abort); target.close(); return }
        while (!queue.length && !sourceEnded && !failure) await wait()
        if (failure) throw failure
        const part = queue.shift()
        if (!part) {
          if (info.totalBytes != null && received !== info.totalBytes) throw new Error('文件传输不完整，没有完成压缩包。')
          await cache.complete(index, { ...info, totalBytes: received })
          reader.releaseLock(); signal.removeEventListener('abort', abort); target.close(); return
        }
        queuedBytes -= part.length; wake()
        await cache.write(index, received, part)
        signal.throwIfAborted()
        received += part.length
        target.enqueue(part)
      } catch (error) { target.error(error); await stop(error); signal.removeEventListener('abort', abort) }
    },
    async cancel(reason) { await stop(reason ?? new Error('读取已取消。')); signal.removeEventListener('abort', abort) }
  }, { highWaterMark: 0 })
  const responseHeaders = new Headers()
  if (info.totalBytes != null) responseHeaders.set('Content-Length', String(info.totalBytes))
  const contentType = source?.headers.get('content-type')
  if (contentType) responseHeaders.set('Content-Type', contentType)
  const response = new Response(body, { headers: responseHeaders })
  networkCompletions.set(response, networkFinished)
  return response
}
