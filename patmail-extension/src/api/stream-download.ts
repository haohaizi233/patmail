import { ZipWriter } from '@zip.js/zip.js'
import type { EasyTransport } from './transport'
import { buildDownloadParams, readDownloadHandle, type DownloadFileItem } from './file-download'
import { resolveDownloadFileNames, stripApplicationNoDot, type FileDownloadSelection } from '../mail/download-name'
import type { FileDownloadProgress } from '../shared/download-progress'
import { DownloadTokens } from './download-tokens'
import { prefetchFile, type PrefetchedFormat } from './stream-file'
import { cachedFileResponse, type DownloadCache } from './stream-cache'
import { asError, sourceUnavailableError, UnavailableDownloadFileError, RetryableDownloadFileError } from './download-failure'
import { finalDownloadNameKey } from '../mail/deduplicate'

export interface StreamDownloadOptions {
  deduplicate?: boolean
  caseScopes?: Record<string, string>
  resolvedNames?: Record<string, string>
  tokens?: DownloadTokens
  namePost?: EasyTransport['post']
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

/** 源文件真实格式不是PDF时按真实格式换后缀；只改冒充PDF的附件名。 */
const convertedSuffix: Partial<Record<PrefetchedFormat, string>> = { zip: '.zip', 'word-html': '.html', eml: '.eml' }
function convertedEntryName(format: PrefetchedFormat, name: string): string {
  const suffix = convertedSuffix[format]
  return suffix && /\.pdf$/i.test(name) ? name.replace(/\.pdf$/i, suffix) : name
}

/** 六个业务令牌；持久缓存与ZIP消费分别背压，ZIP仍按输入顺序写入。 */
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
  const preferred = () => nextOffset - scheduled < 6 ? 'naming' as const : 'download' as const
  const budget = options.tokens ?? new DownloadTokens(preferred)
  const restorePriority = options.tokens?.setPreferred(preferred)
  const scoped = { post: async (...args: Parameters<EasyTransport['post']>) => {
    if (args[0] === 'getFileName' && options.namePost) return options.namePost(...args)
    const release = await budget.acquire(args[0] === 'getFileName' ? 'naming' : 'download', signal)
    try { return await transport.post(...args) } finally { release() }
  } } as EasyTransport
  const queue: { offset: number; names: string[] }[] = []
  const accept = async (offset: number, names: string[]) => {
    while (!signal.aborted && (queue.length >= 2 || ((!options.cache || options.deduplicate) && offset !== nextOffset))) await wait()
    signal.throwIfAborted()
    queue.push({ offset, names }); nextOffset += names.length; wake()
  }
  const producer = (async () => {
    if (selection) {
      const named = await resolveDownloadFileNames(scoped, items.map(item => item.fileId), selection, {
        signal, concurrency: 6, resolvedBatches: options.cache?.names,
        resolvedNames: options.resolvedNames,
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
  type Prepared = { content: () => Promise<Awaited<ReturnType<typeof prefetchFile>>>; name: string; networkFinished: Promise<void>; finished: Promise<void>; duplicate?: boolean }
  const jobs = new Map<number, Promise<Prepared | null>>()
  const pumps = new Set<Promise<void>>()
  const fileFailure = (error: unknown) => {
    if (!(error instanceof UnavailableDownloadFileError) && !(error instanceof RetryableDownloadFileError)) fail(error)
  }
  const open = async (index: number, generated: string): Promise<Prepared> => {
    const item = items[index]
    const name = stripAppNoDot ? stripApplicationNoDot(generated) : generated
    const params = buildDownloadParams([item.fileNo], [name])
    if (!params) throw new Error('文件编号或生成名称无效，没有完成压缩包。')
    const cached = await options.cache?.info(index)
    if (cached?.skipReason) throw new UnavailableDownloadFileError(cached.skipReason)
    if (cached && !cached.complete && cached.totalBytes != null && cached.receivedBytes === cached.totalBytes) {
      await options.cache!.complete(index, cached)
      cached.complete = true
    }
    const fetcher = options.fetchFile ?? globalThis.fetch.bind(globalThis)
    let finishNetwork!: () => void
    const networkFinished = new Promise<void>(resolve => { finishNetwork = resolve })
    const validate = async (file: Awaited<ReturnType<typeof prefetchFile>>) => {
      pumps.add(file.finished)
      void file.finished.then(() => pumps.delete(file.finished))
      try { await file.ready } catch (error) { await file.finished; throw error }
      return file
    }
    const fetchFresh = async () => {
      let prepared = await scoped.post('fileDownload', params, signal)
      // 仅重新准备当前附件；不重复任何邮件或写入操作。
      for (let attempt = 1; !prepared.ok && [502, 503, 504].includes(prepared.error.status ?? 0) && attempt < 3; attempt++) {
        await untilAbort(new Promise<void>(resolve => setTimeout(resolve, attempt * 200)))
        signal.throwIfAborted()
        prepared = await scoped.post('fileDownload', params, signal)
      }
      if (!prepared.ok) throw sourceUnavailableError(prepared.error.message) ?? new Error(prepared.error.message)
      const handle = readDownloadHandle(prepared.data)
      if (!handle.ok) throw sourceUnavailableError(handle.error.message) ?? new Error(handle.error.message)
      const url = transport.fileDownloadUrl(handle.data.fileGuid, handle.data.fileSize)
      if (!url) throw new Error('取文件句柄无效。')
      const file = await prefetchFile(url, item.fileName, handle.data.fileSize === 0, handle.data.notice,
        budget, signal, options.cache ? target => cachedFileResponse(target, index, options.cache!, signal, fetcher, handle.data.notice) : fetcher, fileFailure,
        options.cache ? offset => options.cache!.read(index, offset) : undefined)
      void file.networkFinished.then(finishNetwork)
      return validate(file)
    }
    const recover = async (fromCache: boolean) => {
      for (let attempt = 1; ; attempt++) {
        signal.throwIfAborted()
        try {
          if (fromCache && attempt === 1) {
            return await validate(await prefetchFile('local-cache', item.fileName, cached!.receivedBytes === 0, cached!.sourceNotice ?? '', null, signal,
              () => cachedFileResponse('local-cache', index, options.cache!, signal, fetcher), fileFailure))
          }
          return await fetchFresh()
        } catch (error) {
          signal.throwIfAborted()
          if (!(error instanceof RetryableDownloadFileError)) throw error
          // 校验发生在创建ZIP条目前，且旧正文泵已停止；只丢弃该附件的异常缓存。
          await options.cache?.reset(index, {})
          if (attempt >= 3) throw new UnavailableDownloadFileError(`${error.message} 已尝试3次，跳过此附件。`)
          await untilAbort(new Promise<void>(resolve => setTimeout(resolve, attempt * 200)))
        }
      }
    }
    if (cached?.complete && options.cache) {
      // 完整磁盘缓存按序消费时才读取；旧版异常缓存也走相同校验与重取流程。
      return { name, networkFinished: Promise.resolve(), finished: Promise.resolve(), content: () => recover(true) }
    }
    const content = recover(false)
    // 网络EOF即释放调度窗口；正文校验和重试完成才释放持久任务窗口。
    // 不能让等待缓存落盘的校验重新扣住六路网络并发。
    const finished = content.then(file => file.finished, fileFailure).finally(finishNetwork)
    return { content: () => content, name, networkFinished, finished }
  }
  let preparing = 0, persisting = 0
  const failures: Array<{ name: string; reason: string }> = []
  const converted: Array<{ from: string; to: string; kind: PrefetchedFormat }> = []
  const namedKeys = new Set<string>()
  let deduplicated = 0
  // 持久模式仅保留每个附件的小描述符，正文留在磁盘；完成的附件不能
  // 继续占住网络窗口。内存模式仍限制六个256KiB正文缓冲。
  const lookahead = options.cache ? items.length : 6
  const dispatch = (async () => {
    while (scheduled < items.length) {
      while (!queue.length && !signal.aborted) await wait()
      signal.throwIfAborted()
      const batch = queue.shift()!
      wake()
      for (const [offset, generated] of batch.names.entries()) {
        while ((scheduled - done >= lookahead || preparing >= 6 || persisting >= (options.cache ? 12 : 6)) && !signal.aborted) await wait()
        signal.throwIfAborted()
        const index = batch.offset + offset
        // 网络可乱序完成；实际条目名在顺序入包时分配，恢复时后缀保持一致。
        const name = stripAppNoDot ? stripApplicationNoDot(generated) : generated
        const key = JSON.stringify([options.caseScopes?.[items[index].fileId] ?? items[index].fileId, finalDownloadNameKey(name)])
        if (options.deduplicate && namedKeys.has(key)) {
          jobs.set(index, Promise.resolve({ name, duplicate: true, networkFinished: Promise.resolve(), finished: Promise.resolve(), content: () => Promise.reject(new Error('重复附件不能下载')) }))
          scheduled++; wake(); continue
        }
        namedKeys.add(key)
        preparing++; persisting++
        jobs.set(index, open(index, generated).then(file => {
          void file.networkFinished.then(() => { preparing--; wake() })
          void file.finished.then(() => { persisting--; wake() })
          return { ...file, name }
        }).catch(error => {
          preparing--; persisting--; wake()
          if (error instanceof UnavailableDownloadFileError) return { name, networkFinished: Promise.resolve(), finished: Promise.resolve(), content: () => Promise.reject(asError(error)) }
          fail(error); return null
        }))
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
      if (file.duplicate) {
        deduplicated++; jobs.delete(done); done++; wake()
        options.onProgress?.({ phase: 'packing', done, total: items.length, failed: failures.length, deduplicated })
        continue
      }
      let content: Awaited<ReturnType<typeof prefetchFile>>
      try { content = await file.content() }
      catch (error) {
        if (!(error instanceof UnavailableDownloadFileError)) throw error
        const reason = error.message.slice(0, 1000)
        failures.push({ name: file.name, reason })
        if (options.cache) {
          const cached = await options.cache.info(done)
          if (!cached.skipReason) {
            await options.cache.reset(done, { totalBytes: 0, skipReason: reason })
          }
          if (!cached.skipReason || !cached.complete) await options.cache.complete(done, { totalBytes: 0, skipReason: reason })
        }
        jobs.delete(done); done++; wake()
        options.onProgress?.({ phase: 'packing', done, total: items.length, failed: failures.length, deduplicated })
        continue
      }
      const actualName = convertedEntryName(content.format, file.name)
      const entryName = safeEntryName(actualName, used)
      if (actualName !== file.name) converted.push({ from: file.name, to: entryName, kind: content.format })
      await untilAbort(archive.add(entryName, content.body, { signal }))
      await content.finished
      jobs.delete(done)
      done++; wake()
      options.onProgress?.({ phase: 'packing', done, total: items.length, failed: failures.length, deduplicated })
    }
    await producer; await dispatch
    signal.throwIfAborted()
    if (failures.length || converted.length) {
      const lines = ['PatMail 下载说明', `所选 ${items.length} 个；成功 ${items.length - failures.length - deduplicated} 个；跳过 ${failures.length} 个；过滤重名 ${deduplicated} 个。`, '']
      if (failures.length) lines.push('以下附件经正文检查确认不可用：', ...failures.map(item => `${item.name}\t${item.reason}`), '')
      if (converted.length) {
        const sections: Array<[PrefetchedFormat, string]> = [
          ['zip', '以下源文件实际为ZIP，已保留完整原包（包括其中的PDF/XML等文件）：'],
          ['word-html', '以下源文件实际为Word HTML文档，已按真实格式保存为HTML：'],
          ['eml', '以下源文件实际为EML邮件正文，已按真实格式保存为EML：']
        ]
        for (const [kind, title] of sections) {
          const rows = converted.filter(item => item.kind === kind)
          if (rows.length) lines.push(title, ...rows.map(item => `${item.from}\t保存为 ${item.to}`), '')
        }
        if (lines.at(-1) === '') lines.pop()
      }
      const data = new TextEncoder().encode(lines.join('\r\n'))
      const report = new ReadableStream<Uint8Array>({ start(target) { target.enqueue(data); target.close() } })
      await untilAbort(archive.add(safeEntryName(failures.length ? '下载失败清单.txt' : '源文件格式说明.txt', used), report, { signal }))
    }
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
    restorePriority?.()
  }
}
