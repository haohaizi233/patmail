import type { DownloadTokens } from './download-tokens'
import { responseNetworkFinished } from './stream-cache'
import { asError, sourceUnavailableError } from './download-failure'

export const FILE_BUFFER_BYTES = 256 * 1024
const BLOCK_BYTES = 64 * 1024

/** 应用队列按字节背压；网络读取与按序ZIP消费独立进行。 */
export async function prefetchFile(
  url: string, filename: string, emptyAllowed: boolean, notice: string,
  budget: DownloadTokens | null, signal: AbortSignal, fetchFile: (url: string, init?: RequestInit) => Promise<Response>,
  fail: (error: unknown) => void,
  replay?: (offset: number) => Promise<Uint8Array>
): Promise<{ body: ReadableStream<Uint8Array>; ready: Promise<void>; finished: Promise<void>; networkFinished: Promise<void>; readonly bufferedBytes: number; readonly format: 'zip' | 'original' }> {
  const release = budget ? await budget.acquire('download', signal) : () => {}
  let finishNetwork!: () => void
  const networkFinished = new Promise<void>(resolve => { finishNetwork = () => { release(); resolve() } })
  let validate!: () => void, rejectValidation!: (error: unknown) => void
  const ready = new Promise<void>((resolve, reject) => { validate = resolve; rejectValidation = reject })
  void ready.catch(() => {})
  let reader: ReadableStreamDefaultReader<Uint8Array>
  let format: 'zip' | 'original' = 'original'
  let length: string | null, encoded: string | null
  try {
    const response = await fetchFile(url, { credentials: 'include', signal })
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {})
      throw new Error('读取文件失败，没有完成压缩包。')
    }
    if (!/\.x?html?$/i.test(filename) && /text\/html/i.test(response.headers.get('content-type') ?? '')) {
      await response.body.cancel()
      throw new Error('取文件返回了网页，没有完成压缩包。')
    }
    length = response.headers.get('content-length')
    encoded = response.headers.get('content-encoding')
    reader = response.body.getReader()
    const transportFinished = responseNetworkFinished(response)
    if (transportFinished) void transportFinished.then(finishNetwork)
  } catch (error) { finishNetwork(); throw error }

  const queue: Uint8Array[] = []
  let bufferedBytes = 0, ended = false, failure: unknown
  let available = 0, consumed = 0
  let bodyController!: ReadableStreamDefaultController<Uint8Array>
  const waiters = new Set<() => void>()
  const wake = () => { for (const resolve of waiters) resolve(); waiters.clear() }
  const wait = () => new Promise<void>(resolve => { waiters.add(resolve) })
  const stop = () => {
    failure ??= signal.reason ?? new Error('下载已取消。')
    queue.length = 0; bufferedBytes = 0
    try { bodyController.error(failure) } catch { /* 已结束 */ }
    void reader.cancel(failure).catch(() => {})
    wake()
  }
  // ZIP按序消费时才创建回放流，提前完成的磁盘附件只保留水位与描述符。
  let body: ReadableStream<Uint8Array> | undefined
  const createBody = () => new ReadableStream<Uint8Array>({
    start(controller) { bodyController = controller },
    async pull(controller) {
      if (replay) {
        while (consumed === available && !ended && !failure) await wait()
        signal.throwIfAborted()
        if (failure) throw asError(failure)
        if (consumed === available) { controller.close(); return }
        const stored = await replay(consumed)
        const chunk = stored.subarray(0, Math.min(stored.length, available - consumed))
        if (!chunk.length) throw new Error('本机附件缓存不完整，不能继续写入压缩包。')
        consumed += chunk.length; controller.enqueue(chunk); return
      }
      while (!queue.length && !ended && !failure) await wait()
      if (failure) throw asError(failure)
      const chunk = queue.shift()
      if (chunk) { bufferedBytes -= chunk.byteLength; controller.enqueue(chunk); wake() }
      else controller.close()
    },
    cancel(reason) { fail(reason ?? new Error('ZIP读取已取消。')); stop() }
  }, { highWaterMark: 0 })
  signal.addEventListener('abort', stop, { once: true })
  if (signal.aborted) stop()
  const push = async (chunk: Uint8Array) => {
    // cachedFileResponse确认落盘后才交付字节。磁盘模式只推进水位，ZIP自行回读，
    // 不能因ZIP的256KiB内存队列填满而扣住网络额度。
    if (replay) { available += chunk.length; wake(); return }
    for (let offset = 0; offset < chunk.byteLength; offset += BLOCK_BYTES) {
      const count = Math.min(BLOCK_BYTES, chunk.byteLength - offset)
      while (bufferedBytes + count > FILE_BUFFER_BYTES && !signal.aborted) await wait()
      signal.throwIfAborted()
      queue.push(chunk.slice(offset, offset + count)); bufferedBytes += count; wake()
    }
  }
  const pump = async () => {
    const first: Uint8Array[] = []
    let firstBytes = 0, eof = false
    while (firstBytes < 1024) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) { eof = true; break }
      first.push(chunk.value); firstBytes += chunk.value.byteLength
    }
    const prefix = new Uint8Array(Math.min(1024, firstBytes))
    let offset = 0
    for (const chunk of first) {
      const count = Math.min(chunk.byteLength, prefix.byteLength - offset)
      prefix.set(chunk.subarray(0, count), offset); offset += count
      if (offset === prefix.byteLength) break
    }
    const header = new TextDecoder().decode(prefix)
    if (!/\.x?html?$/i.test(filename) && /^\s*(?:<!doctype\s+html|<html|<script)/i.test(header)) {
      throw new Error('文件响应是网页，没有完成压缩包。')
    }
    if (eof && !encoded && length !== null && Number(length) !== firstBytes) throw new Error('文件传输不完整，没有完成压缩包。')
    // EASY may return a ZIP containing the PDF and accompanying XML. Preserve
    // those original bytes and let the caller choose the actual entry suffix.
    if (prefix[0] === 0x50 && prefix[1] === 0x4b && prefix[2] === 0x03 && prefix[3] === 0x04) format = 'zip'
    if ((!firstBytes && !emptyAllowed) || (/\.pdf$/i.test(filename) && format !== 'zip' && !header.includes('%PDF'))) {
      const emptyArchive = eof && firstBytes === 22 && prefix[0] === 0x50 && prefix[1] === 0x4b && prefix[2] === 0x05 && prefix[3] === 0x06 && prefix.subarray(4).every(value => value === 0)
      // The gateway's notice is stale on many valid responses. Only a complete
      // empty ZIP plus that notice is positive evidence of an unavailable PDF.
      throw (emptyArchive ? sourceUnavailableError(notice) : undefined) ?? new Error(notice || '源文件正文为空或PDF格式不符，没有完成压缩包。')
    }
    validate()
    let bytes = firstBytes
    for (const chunk of first) await push(chunk)
    first.length = 0
    while (!eof) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) { eof = true; break }
      bytes += chunk.value.byteLength
      await push(chunk.value)
    }
    if (!encoded && length !== null && Number(length) !== bytes) throw new Error('文件传输不完整，没有完成压缩包。')
    ended = true; wake()
  }
  const finished = pump().catch(error => {
    rejectValidation(error)
    failure ??= error
    fail(error)
    stop()
  }).finally(async () => {
    // EOF时即归还网络额度，已缓冲的字节可以稍后再写进ZIP。
    signal.removeEventListener('abort', stop)
    await reader.cancel().catch(() => {})
    finishNetwork()
    reader.releaseLock()
  })
  return { get body() { return body ??= createBody() }, ready, finished, networkFinished, get bufferedBytes() { return bufferedBytes }, get format() { return format } }
}
