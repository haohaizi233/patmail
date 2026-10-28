import { ZipWriter } from '@zip.js/zip.js'
import type { EasyTransport } from './transport'
import { buildDownloadParams, readDownloadHandle, type DownloadFileItem } from './file-download'
import { resolveDownloadFileNames, stripApplicationNoDot, type FileDownloadSelection } from '../mail/download-name'
import type { FileDownloadProgress } from '../shared/download-progress'

export interface StreamDownloadOptions {
  sink: WritableStream<Uint8Array>
  signal?: AbortSignal
  fetchFile?: (url: string, init?: RequestInit) => Promise<Response>
  onProgress?: (progress: FileDownloadProgress) => void
}

/** 同源业务请求共用5个额度；正文读到EOF前也占一个，不能只限制取响应头的阶段。 */
class RequestBudget {
  private active = 0
  private waiters: (() => void)[] = []
  async acquire(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted()
    while (this.active >= 5) {
      await new Promise<void>((resolve, reject) => {
        const wake = () => { signal.removeEventListener('abort', abort); resolve() }
        const abort = () => { this.waiters = this.waiters.filter(item => item !== wake); reject(new Error('下载已取消。')) }
        this.waiters.push(wake)
        signal.addEventListener('abort', abort, { once: true })
      })
    }
    signal.throwIfAborted()
    this.active++
    return () => { this.active--; this.waiters.shift()?.() }
  }
}

function safeEntryName(value: string, used: Set<string>): string {
  const clean = value.replace(/[\\/<>:"|?*\x00-\x1f]+/g, '_').replace(/^[. ]+|[. ]+$/g, '') || '文件'
  const dot = clean.lastIndexOf('.')
  const stem = dot > 0 ? clean.slice(0, dot) : clean
  const extension = dot > 0 ? clean.slice(dot) : ''
  let name = clean
  for (let index = 2; used.has(name.toLowerCase()); index++) name = `${stem} (${index})${extension}`
  used.add(name.toLowerCase())
  return name
}

/** 有界元数据队列+单文件流；仅保存ZIP目录和名称，绝不聚合文件正文或完整压缩包。 */
export async function streamDownloadFiles(
  transport: EasyTransport, items: DownloadFileItem[], selection: FileDownloadSelection | null,
  stripAppNoDot: boolean, options: StreamDownloadOptions
): Promise<void> {
  const controller = new AbortController()
  const cancel = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) cancel()
  options.signal?.addEventListener('abort', cancel, { once: true })
  const signal = controller.signal
  const budget = new RequestBudget()
  const scoped = { post: async (...args: Parameters<EasyTransport['post']>) => {
    const release = await budget.acquire(signal)
    try { return await transport.post(...args) } finally { release() }
  } } as EasyTransport
  const queue: { offset: number; names: string[] }[] = []
  let nextOffset = 0
  const waiters = new Set<() => void>()
  const wake = () => { for (const resolve of waiters) resolve(); waiters.clear() }
  const wait = () => new Promise<void>(resolve => { waiters.add(resolve) })
  signal.addEventListener('abort', wake)
  const accept = async (offset: number, names: string[]) => {
    while (!signal.aborted && (offset !== nextOffset || queue.length >= 2)) await wait()
    signal.throwIfAborted()
    queue.push({ offset, names })
    nextOffset += names.length
    wake()
  }
  let producerError: unknown
  const producer = (async () => {
    if (selection) {
      const named = await resolveDownloadFileNames(scoped, items.map(item => item.fileId), selection, {
        signal, onBatch: accept,
        onFailure: failure => {
          if (!failure.ok) producerError ??= new Error(failure.error.message)
          controller.abort()
          wake()
        },
        onProgress: (done, total) => options.onProgress?.({ phase: 'naming', done, total })
      })
      if (!named.ok) throw new Error(named.error.message)
    } else {
      for (let offset = 0; offset < items.length; offset += 40) await accept(offset, items.slice(offset, offset + 40).map(item => item.fileName))
    }
  })().catch(error => { producerError ??= error; controller.abort(); wake() })
  // 输出abort由外层持有：ZipWriter失败时不写中央目录，原生下载必须随之中断。
  const output = options.sink.getWriter()
  const archive = new ZipWriter(new WritableStream<Uint8Array>({ write: chunk => output.write(chunk) }), {
    level: 0, zip64: true, useWebWorkers: false, bufferedWrite: false
  })
  let done = 0
  const used = new Set<string>()
  try {
    signal.throwIfAborted()
    while (done < items.length) {
      while (!queue.length && !signal.aborted) await wait()
      if (producerError) throw producerError
      signal.throwIfAborted()
      const batch = queue.shift()!
      wake()
      for (const [offset, generated] of batch.names.entries()) {
        signal.throwIfAborted()
        const item = items[batch.offset + offset]
        const name = stripAppNoDot ? stripApplicationNoDot(generated) : generated
        const params = buildDownloadParams([item.fileNo], [name])
        if (!params) throw new Error('文件编号或生成名称无效，没有完成压缩包。')
        options.onProgress?.({ phase: 'packing', done, total: items.length })
        const prepared = await scoped.post('fileDownload', params, signal)
        if (!prepared.ok) throw new Error(prepared.error.message)
        const handle = readDownloadHandle(prepared.data)
        if (!handle.ok) throw new Error(handle.error.message)
        // 原站单文件成功也可能带“共1个文件…下载失败”；与原站GetFile一样认有效句柄，再校验实际正文。
        const url = transport.fileDownloadUrl(handle.data.fileGuid, handle.data.fileSize)
        if (!url) throw new Error('取文件句柄无效。')
        const release = await budget.acquire(signal)
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
        try {
          const response = await (options.fetchFile ?? globalThis.fetch.bind(globalThis))(url, { credentials: 'include', signal })
          if (!response.ok || !response.body) throw new Error('读取文件失败，没有完成压缩包。')
          const htmlAttachment = /\.x?html?$/i.test(item.fileName)
          if (!htmlAttachment && /text\/html/i.test(response.headers.get('content-type') ?? '')) throw new Error('取文件返回了网页，没有完成压缩包。')
          const length = response.headers.get('content-length')
          const encoded = response.headers.get('content-encoding')
          reader = response.body.getReader()
          // 仅读取首1KiB验证类型；首个网络块可能更大，保留该块按原样交给ZIP，不聚合整份文件。
          const first: Uint8Array[] = []
          let firstBytes = 0
          while (firstBytes < 1024) {
            const chunk = await reader.read()
            if (chunk.done) break
            first.push(chunk.value)
            firstBytes += chunk.value.byteLength
          }
          const prefix = new Uint8Array(Math.min(firstBytes, 1024))
          let prefixOffset = 0
          for (const chunk of first) {
            const count = Math.min(chunk.byteLength, prefix.byteLength - prefixOffset)
            prefix.set(chunk.subarray(0, count), prefixOffset)
            prefixOffset += count
            if (prefixOffset === prefix.byteLength) break
          }
          const header = new TextDecoder().decode(prefix)
          if ((!firstBytes && handle.data.fileSize !== 0) || (/\.pdf$/i.test(item.fileName) && !header.includes('%PDF'))) {
            throw new Error(handle.data.notice || '源文件正文为空或PDF格式不符，没有完成压缩包。')
          }
          if (!htmlAttachment && /^\s*(?:<!doctype\s+html|<html|<script)/i.test(header)) throw new Error('文件响应是网页，没有完成压缩包。')
          let bytes = 0
          const data = new ReadableStream<Uint8Array>({
            async pull(target) {
              try {
                const buffered = first.shift()
                const chunk = buffered ? { done: false as const, value: buffered } : await reader!.read()
                if (chunk.done) {
                  if (!encoded && length !== null && Number(length) !== bytes) throw new Error('文件传输不完整，没有完成压缩包。')
                  target.close()
                } else {
                  bytes += chunk.value.byteLength
                  target.enqueue(chunk.value)
                }
              } catch (error) { target.error(error) }
            },
            cancel: () => reader!.cancel()
          })
          await archive.add(safeEntryName(name, used), data, { signal })
        } finally {
          await reader?.cancel().catch(() => {})
          reader?.releaseLock()
          release()
        }
        done++
        options.onProgress?.({ phase: 'packing', done, total: items.length })
      }
    }
    await producer
    if (producerError) throw producerError
    signal.throwIfAborted()
    await archive.close()
    await output.close()
  } catch (error) {
    producerError ??= error
    controller.abort()
    wake()
    await output.abort(error).catch(() => {})
    await producer
    throw producerError ?? error
  } finally {
    output.releaseLock()
    options.signal?.removeEventListener('abort', cancel)
    signal.removeEventListener('abort', wake)
  }
}
