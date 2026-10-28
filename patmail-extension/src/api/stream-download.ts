import { ZipWriter } from '@zip.js/zip.js'
import type { EasyTransport } from './transport'
import { buildDownloadParams, readDownloadHandle, type DownloadFileItem } from './file-download'
import { resolveDownloadFileNames, stripApplicationNoDot, type FileDownloadSelection } from '../mail/download-name'
import type { FileDownloadProgress } from '../shared/download-progress'
import { DownloadTokens } from './download-tokens'
import { prefetchFile } from './stream-file'
import { cachedFileResponse, type DownloadCache } from './stream-cache'

export interface StreamDownloadOptions {
  sink: WritableStream<Uint8Array>
  signal?: AbortSignal
  fetchFile?: (url: string, init?: RequestInit) => Promise<Response>
  onProgress?: (progress: FileDownloadProgress) => void
  cache?: DownloadCache
  zipCreatedAt?: string
}

function safeEntryName(value: string, used: Set<string>): string {
  const clean = value.replace(/[\\/<>:"|?*\x00-\x1f]+/g, '_').replace(/^[. ]+|[. ]+$/g, '') || '文件'
  const dot = clean.lastIndexOf('.')
  const stem = dot > 0 ? clean.slice(0, dot) : clean
  const extension = dot > 0 ? clean.slice(dot) : ''
  let name = clean
  for (let index = 2; used.has(name.toLowerCase()); index++) name = stem + ' (' + index + ')' + extension
  used.add(name.toLowerCase())
  return name
}

/** 六份有界正文预取，共用六个业务令牌，ZIP仍按输入顺序逐份写入。 */
export async function streamDownloadFiles(
  transport: EasyTransport, items: DownloadFileItem[], selection: FileDownloadSelection | null,
  stripAppNoDot: boolean, options: StreamDownloadOptions
): Promise<void> {
  const controller = new AbortController()
  const signal = controller.signal
  let failure: unknown
  const waiters = new Set<() => void>()
  const wake = () => { for (const resolve of waiters) resolve(); waiters.clear() }
  const wait = () => new Promise<void>(resolve => { waiters.add(resolve) })
  const fail = (error: unknown) => {
    failure ??= error
    controller.abort(error)
    wake()
  }
  const cancel = () => fail(options.signal?.reason ?? new Error('下载已取消。'))
  const untilAbort = <T>(operation: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const aborted = () => { signal.removeEventListener('abort', aborted); reject(signal.reason) }
    if (signal.aborted) aborted()
    else signal.addEventListener('abort', aborted, { once: true })
    operation.then(value => { signal.removeEventListener('abort', aborted); resolve(value) }, error => {
      signal.removeEventListener('abort', aborted); reject(error)
    })
  })
  if (options.signal?.aborted) cancel()
  options.signal?.addEventListener('abort', cancel, { once: true })

  let nextOffset = 0, scheduled = 0, done = 0
  const budget = new DownloadTokens(() => nextOffset - scheduled < 6 ? 'naming' : 'download')
  const scoped = { post: async (...args: Parameters<EasyTransport['post']>) => {
    const release = await budget.acquire(args[0] === 'getFileName' ? 'naming' : 'download', signal)
    try { return await transport.post(...args) } finally { release() }
  } } as EasyTransport
  const queue: { offset: number; names: string[] }[] = []
  const accept = async (offset: number, names: string[]) => {
    while (!signal.aborted && (offset !== nextOffset || queue.length >= 2)) await wait()
    signal.throwIfAborted()
    queue.push({ offset, names }); nextOffset += names.length; wake()
  }
  const producer = (async () => {
    if (selection) {
      const named = await resolveDownloadFileNames(scoped, items.map(item => item.fileId), selection, {
        signal, concurrency: 6, resolvedBatches: options.cache?.names,
        onBatch: async (offset, names) => {
          await options.cache?.saveNames(offset, names)
          await accept(offset, names)
        },
        onFailure: result => { if (!result.ok) fail(new Error(result.error.message)) },
        onProgress: (count, total) => options.onProgress?.({ phase: 'naming', done: count, total })
      })
      if (!named.ok) throw new Error(named.error.message)
    } else {
      for (let offset = 0; offset < items.length; offset += 40) await accept(offset, items.slice(offset, offset + 40).map(item => item.fileName))
    }
  })().catch(fail)

  const used = new Set<string>()
  type Prepared = Awaited<ReturnType<typeof prefetchFile>> & { name: string }
  const jobs = new Map<number, Promise<Prepared | null>>()
  const pumps = new Set<Promise<void>>()
  const open = async (index: number, generated: string): Promise<Prepared> => {
    const item = items[index]
    const name = stripAppNoDot ? stripApplicationNoDot(generated) : generated
    const params = buildDownloadParams([item.fileNo], [name])
    if (!params) throw new Error('文件编号或生成名称无效，没有完成压缩包。')
    const cached = await options.cache?.info(index)
    if (cached?.complete && options.cache) {
      const file = await prefetchFile('local-cache', item.fileName, cached.receivedBytes === 0, '', null, signal,
        () => cachedFileResponse('local-cache', index, options.cache!, signal, options.fetchFile ?? globalThis.fetch.bind(globalThis)), fail)
      pumps.add(file.finished); void file.finished.then(() => pumps.delete(file.finished))
      return { ...file, name }
    }
    const prepared = await scoped.post('fileDownload', params, signal)
    if (!prepared.ok) throw new Error(prepared.error.message)
    const handle = readDownloadHandle(prepared.data)
    if (!handle.ok) throw new Error(handle.error.message)
    const url = transport.fileDownloadUrl(handle.data.fileGuid, handle.data.fileSize)
    if (!url) throw new Error('取文件句柄无效。')
    const fetcher = options.fetchFile ?? globalThis.fetch.bind(globalThis)
    const file = await prefetchFile(url, item.fileName, handle.data.fileSize === 0, handle.data.notice,
      budget, signal, options.cache ? target => cachedFileResponse(target, index, options.cache!, signal, fetcher) : fetcher, fail)
    pumps.add(file.finished)
    void file.finished.then(() => pumps.delete(file.finished))
    return { ...file, name }
  }
  const dispatch = (async () => {
    while (scheduled < items.length) {
      while (!queue.length && !signal.aborted) await wait()
      signal.throwIfAborted()
      const batch = queue.shift()!
      wake()
      for (const [offset, generated] of batch.names.entries()) {
        while (scheduled - done >= 6 && !signal.aborted) await wait()
        signal.throwIfAborted()
        const index = batch.offset + offset
        // 名称在派发顺序里分配，避免响应顺序改变重名后缀。
        const name = safeEntryName(stripAppNoDot ? stripApplicationNoDot(generated) : generated, used)
        jobs.set(index, open(index, generated).then(file => ({ ...file, name })).catch(error => { fail(error); return null }))
        scheduled++; wake()
      }
    }
  })().catch(fail)

  const output = options.sink.getWriter()
  const archive = new ZipWriter(new WritableStream<Uint8Array>({ write: chunk => {
    signal.throwIfAborted()
    return output.write(chunk)
  } }), {
    level: 0, zip64: true, useWebWorkers: false, bufferedWrite: false,
    ...(options.zipCreatedAt ? { lastModDate: new Date(options.zipCreatedAt), extendedTimestamp: false, ntfs: false } : {})
  })
  try {
    while (done < items.length) {
      while (!jobs.has(done) && !signal.aborted) await wait()
      signal.throwIfAborted()
      const file = await jobs.get(done)!
      signal.throwIfAborted()
      if (!file) throw failure
      await untilAbort(archive.add(file.name, file.body, { signal }))
      await file.finished
      jobs.delete(done)
      done++; wake()
      options.onProgress?.({ phase: 'packing', done, total: items.length })
    }
    await producer; await dispatch
    signal.throwIfAborted()
    await untilAbort(archive.close())
    await untilAbort(output.close())
  } catch (error) {
    fail(error)
    // 底层写入若卡住，abort()也会等那笔写入；不能因此扣住整个任务。
    void output.abort(failure).catch(() => {})
    throw failure
  } finally {
    if (failure) controller.abort(failure)
    await Promise.all([producer, dispatch, ...jobs.values()])
    await Promise.all(pumps)
    output.releaseLock()
    options.signal?.removeEventListener('abort', cancel)
  }
}
