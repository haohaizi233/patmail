export interface CachedFileInfo {
  receivedBytes: number
  complete: boolean
  totalBytes?: number | null
  etag?: string
  lastModified?: string
}
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
  fetcher: (url: string, init?: RequestInit) => Promise<Response>
): Promise<Response> {
  let info = await cache.info(index)
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
      info = { receivedBytes: 0, complete: false, etag: source.headers.get('etag') ?? '', lastModified: source.headers.get('last-modified') ?? '',
        totalBytes: !source.headers.get('content-encoding') && size !== null ? Number(size) : null }
      await cache.reset(index, info)
    } else info = { ...info, totalBytes: Number(range![3]) }
  }
  const reader = source?.body?.getReader()
  let replayed = 0, received = prefix
  const body = new ReadableStream<Uint8Array>({
    async pull(target) {
      try {
        signal.throwIfAborted()
        if (replayed < prefix) {
          const chunk = await cache.read(index, replayed)
          if (!chunk.length || replayed + chunk.length > prefix) throw new Error('本机附件缓存不完整，不能续传。')
          replayed += chunk.length; target.enqueue(chunk); return
        }
        if (!reader) { target.close(); return }
        const chunk = await reader.read()
        if (chunk.done) {
          if (info.totalBytes != null && received !== info.totalBytes) throw new Error('文件传输不完整，没有完成压缩包。')
          await cache.complete(index, { ...info, totalBytes: received })
          reader.releaseLock(); target.close(); return
        }
        for (let offset = 0; offset < chunk.value.length; offset += 65536) {
          signal.throwIfAborted()
          const part = chunk.value.subarray(offset, offset + 65536)
          await cache.write(index, received, part)
          received += part.length
        }
        target.enqueue(chunk.value)
      } catch (error) { target.error(error); await reader?.cancel(error).catch(() => {}) }
    },
    async cancel(reason) { await reader?.cancel(reason).catch(() => {}) }
  }, { highWaterMark: 0 })
  const responseHeaders = new Headers()
  if (info.totalBytes != null) responseHeaders.set('Content-Length', String(info.totalBytes))
  const contentType = source?.headers.get('content-type')
  if (contentType) responseHeaders.set('Content-Type', contentType)
  return new Response(body, { headers: responseHeaders })
}
