import { MessageType, type StreamDownloadCommand, type BackgroundResponse } from '../shared/message'
import type { FileDownloadProgress } from '../shared/download-progress'
import { sendToBackground } from './runtime'
import type { DownloadCache, CachedFileInfo } from '../api/stream-cache'
import { isRecord } from '../shared/guards'

export interface NativeDownloadContext { cache?: DownloadCache; zipCreatedAt?: string; taskId?: string }
const activeProducers = new Map<string, AbortController>()
// 冷后台恢复和启动前复查各可耗时36.5秒，原生目标连接另有15秒。
// 启动不能沿用普通状态查询的20秒预算，也不能因回执尚在路上就重发start。
const START_RECEIPT_MS = 130_000
export function pauseNativeDownload(taskId: string): void {
  activeProducers.get(taskId)?.abort(new Error('下载已暂停，本机缓存和任务已保留。'))
}
const encode = (bytes: Uint8Array) => {
  let text = ''
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(text)
}
const decode = (data: string) => Uint8Array.from(atob(data), char => char.charCodeAt(0))

/** 共用有界生产者；浏览器模式直接写已选目标，旧模式保留HTTP续传兼容。 */
export async function nativeStreamArchive(
  fileName: string,
  produce: (sink: WritableStream<Uint8Array>, signal: AbortSignal, onWork: (progress: FileDownloadProgress) => void, context: NativeDownloadContext) => Promise<void>,
  report: (progress: FileDownloadProgress) => void,
  options: { taskId?: string; manifest?: Record<string, unknown>; newCopy?: true; backend?: 'browser'; targetId?: string; onTaskId?: (taskId: string) => void; request?: (command: StreamDownloadCommand) => Promise<BackgroundResponse>; onDownloadId?: (id: number) => void } = {}
): Promise<number> {
  const controller = new AbortController()
  const signal = controller.signal
  const { backend, onTaskId, request: customRequest, onDownloadId, ...startOptions } = options
  const sendCommand = (payload: StreamDownloadCommand, timeout: number): Promise<BackgroundResponse | null> => {
    if (!customRequest) return sendToBackground({ type: backend === 'browser' ? MessageType.BrowserStreamDownload : MessageType.StreamDownload, payload }, timeout)
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve({type:MessageType.Error,payload:{message:'扩展后台没有在时限内返回。'}}),timeout)
      Promise.resolve().then(()=>customRequest(payload)).then(response=>{
        clearTimeout(timer)
        // A timed-out or paused start may still allocate a lease; close only its late token.
        if(payload.action==='start' && signal.aborted && response?.type===MessageType.StreamDownloadResult && response.payload.token)void sendCommand({action:'pause',token:response.payload.token},20000)
        resolve(response)
      },error=>{clearTimeout(timer);resolve({type:MessageType.Error,payload:{message:error instanceof Error?error.message:'扩展后台没有答上。'}})})
    })
  }
  const browser = backend === 'browser'
  if (options.taskId) {
    activeProducers.get(options.taskId)?.abort(new Error('任务已由新的恢复请求接管。'))
    activeProducers.set(options.taskId, controller)
  }
  const untilAbort = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 存量豁免：保留原始 rejection reason（AbortSignal/DOMException）
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason) }
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true })
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 存量豁免：保留原始 rejection reason（AbortSignal/DOMException）
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value) }, error => { signal.removeEventListener('abort', abort); reject(error) })
  })
  const retryDelay = (ms: number) => new Promise<void>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 存量豁免：保留原始 rejection reason（AbortSignal/DOMException）
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true })
  })
  const command = async (payload: StreamDownloadCommand) => {
    // 只重试无副作用的读取；写入/封存的应答丢失时，不能猜测后台是否已经提交。
    const retryable = payload.action === 'status' || (payload.action === 'cache' && (payload.command === 'info' || payload.command === 'read'))
    const cleanup = payload.action === 'pause' || payload.action === 'abort'
    for (let attempt = 0; ; attempt++) {
      if (!cleanup) signal.throwIfAborted()
      const request = sendCommand(payload,
        payload.action === 'start' ? START_RECEIPT_MS : payload.action === 'write' || payload.action === 'cache' || (browser && payload.action === 'finish') ? 130_000 : 20_000)
      if (payload.action === 'start' && !customRequest) {
        // 暂停可能先于启动回执到达。只关闭这次启动的令牌，不能按taskId暂停后来接管的恢复任务。
        void request.then(response => {
          if (signal.aborted && response?.type === MessageType.StreamDownloadResult && response.payload.token) {
            void sendCommand({ action: 'pause', token: response.payload.token }, 20_000).catch(() => {})
          }
        }).catch(() => {})
      }
      const response = await (cleanup ? request : untilAbort(request))
      if (response?.type === MessageType.StreamDownloadResult) return response.payload
      const reason = response?.type === MessageType.Error ? response.payload.message : '本机下载流没有应答。'
      const transient = !response || /扩展后台没有在时限内返回|扩展后台没有答上|message port closed|receiving end does not exist|service worker/i.test(reason)
      if (!transient) throw new Error(reason)
      const stage = payload.action === 'start' ? '下载初始化' : payload.action === 'checkpoint' ? '名称检查点保存'
        : payload.action === 'write' ? '浏览器数据写入' : payload.action === 'cache' ? '附件缓存操作'
          : payload.action === 'finish' ? '压缩包保存确认' : '下载状态查询'
      if (!retryable || attempt >= 2) throw new Error(`${stage}回执超时：${reason} 下载已暂停，缓存已保留；请点击「继续下载」恢复。`)
      await retryDelay(500 * (attempt + 1))
    }
  }
  const created = await command({ action: 'start', fileName, ...startOptions, ...(browser ? { expiresAt: Date.now() + START_RECEIPT_MS } : {}) }).catch(error => {
    controller.abort(error)
    if (options.taskId && activeProducers.get(options.taskId) === controller) activeProducers.delete(options.taskId)
    throw error
  })
  // 后台分配的任务号回报给调用方，续跑时凭同一任务号从检查点恢复。
  if (created.taskId) onTaskId?.(created.taskId)
  const reportRetainedFailures = () => {
    const total = Array.isArray(options.manifest?.items) ? options.manifest.items.length : 1
    const failed = Number(created.info?.failedCount ?? 0)
    const deduplicated = Number(created.info?.deduplicatedCount ?? 0)
    if (Number.isSafeInteger(failed) && Number.isSafeInteger(deduplicated) && failed >= 0 && deduplicated >= 0 && failed + deduplicated > 0 && failed + deduplicated <= total) report({ phase: 'packing', done: total, total, failed, deduplicated })
  }
  if (created.info?.completed === true && Number.isSafeInteger(created.info.completedBytes)) {
    reportRetainedFailures()
    if (options.taskId && activeProducers.get(options.taskId) === controller) activeProducers.delete(options.taskId)
    return Number(created.info.completedBytes)
  }
  if (!created.token) throw new Error('本机下载流缺少写入凭据。')
  const token = created.token
  const manifest = isRecord(created.info?.manifest) ? created.info.manifest : {}
  const names: Record<string, string[]> = {}
  if (isRecord(manifest.cachedNames)) for (const [key, list] of Object.entries(manifest.cachedNames)) {
    if (Array.isArray(list) && list.every(name => typeof name === 'string')) names[key] = list
  }
  const metadata = (info: Partial<CachedFileInfo>): Record<string, unknown> => ({
    ...(info.totalBytes === undefined ? {} : { totalBytes: info.totalBytes }),
    ...(typeof info.etag === 'string' ? { etag: info.etag } : {}),
    ...(typeof info.lastModified === 'string' ? { lastModified: info.lastModified } : {}),
    ...(typeof info.skipReason === 'string' ? { skipReason: info.skipReason } : {}),
    ...(typeof info.sourceNotice === 'string' ? { sourceNotice: info.sourceNotice } : {})
  })
  const cache: DownloadCache | undefined = created.taskId ? {
    names,
    async saveNames(offset, list) {
      if (names[String(offset)]?.join(';') === list.join(';')) return
      await command({ action: 'checkpoint', token, offset, names: list })
      names[String(offset)] = list.slice()
    },
    async info(index) {
      const result = (await command({ action: 'cache', command: 'info', token, index })).info
      if (!result || !Number.isSafeInteger(result.receivedBytes) || Number(result.receivedBytes) < 0 || typeof result.complete !== 'boolean') {
        throw new Error('本机附件检查点无效，不能继续下载。')
      }
      return result as unknown as CachedFileInfo
    },
    async reset(index, info) { await command({ action: 'cache', command: 'reset', token, index, metadata: metadata(info) }) },
    async write(index, offset, bytes) { await command({ action: 'cache', command: 'write', token, index, offset, data: encode(bytes) }) },
    async complete(index, info) { await command({ action: 'cache', command: 'complete', token, index, metadata: metadata(info) }) },
    async read(index, offset) { const result = await command({ action: 'cache', command: 'read', token, index, offset }); return decode(result.data ?? '') }
  } : undefined
  const context: NativeDownloadContext = { cache, taskId: created.taskId, zipCreatedAt: typeof manifest.zipCreatedAt === 'string' ? manifest.zipCreatedAt : undefined }
  let failure: Error | null = null, productionDone = false, succeeded = false
  // failure 由 track/sink 闭包写入、外层读取；TS 流分析看不到闭包写入，读取一律走这个函数保持声明类型。
  const currentFailure = (): Error | null => failure
  const pageGone = () => controller.abort(new Error('EASY来源页面已离开，下载已暂停并保留缓存。'))
  globalThis.addEventListener?.('pagehide', pageGone, { once: true })
  let sequence = 0, offset = 0, filled = 0
  const block = new Uint8Array(256 * 1024)
  const flush = async () => {
    if (!filled) return
    signal.throwIfAborted()
    await command({ action: 'write', token, sequence, offset, data: encode(block.subarray(0, filled)) })
    sequence++; offset += filled; filled = 0
  }
  const sink = new WritableStream<Uint8Array>({
    async write(chunk) {
      signal.throwIfAborted()
      for (let position = 0; position < chunk.length;) {
        const count = Math.min(block.length - filled, chunk.length - position)
        block.set(chunk.subarray(position, position + count), filled)
        filled += count; position += count
        if (filled === block.length) await flush()
      }
      if (sequence === 0 && filled) await flush()
    },
    async close() { await flush(); await command({ action: 'finish', token }); productionDone = true },
    async abort(reason) { failure ??= reason instanceof Error ? reason : new Error('输出失败，下载任务已保留。'); await command({ action: 'pause', token }).catch(() => {}) }
  })
  const track = (async () => {
    let downloadId = created.downloadId
    try {
      while (!signal.aborted) {
        if (browser) {
          const result = await untilAbort(command({ action: 'status', token }))
          const info = result.info
          if (!info || !Number.isSafeInteger(info.receivedBytes)) throw new Error('浏览器文件写入状态无效，缓存仍保留。')
          if (typeof info.downloadId === 'number' && Number.isSafeInteger(info.downloadId)) onDownloadId?.(info.downloadId)
          const receivedBytes = Number(info.receivedBytes)
          report({ phase: 'downloading', done: 0, total: 1, receivedBytes })
          if (info.state === 'complete' && productionDone) return receivedBytes
          await untilAbort(new Promise<void>(resolve => setTimeout(resolve, 500)))
          continue
        }
        if (downloadId === undefined) downloadId = (await untilAbort(command({ action: 'status', token }))).downloadId
        if (downloadId !== undefined) {
          const response = await untilAbort(sendToBackground({ type: MessageType.DownloadState, payload: { downloadId } }, 15_000))
          if (response?.type === MessageType.DownloadStateResult) {
            const snapshot = response.payload
            report({ phase: 'downloading', done: 0, total: 1, state: snapshot.state, receivedBytes: snapshot.receivedBytes,
              ...(snapshot.totalBytes ? { totalBytes: snapshot.totalBytes } : {}) })
            if (snapshot.state === 'complete' && productionDone) return Math.max(snapshot.receivedBytes, snapshot.totalBytes ?? 0)
            if (snapshot.state === 'interrupted' && /USER_CANCELED/.test(snapshot.error ?? '')) throw new Error('浏览器下载已取消，本机任务已保留，可在工作台继续或丢弃。')
            if (snapshot.state === 'interrupted' && productionDone) throw new Error('浏览器续传中断，本机完整缓存已保留，请继续下载。')
          } else if (productionDone) throw new Error('无法读取浏览器下载记录，本机完整缓存已保留。')
        }
        await untilAbort(new Promise<void>(resolve => setTimeout(resolve, 500)))
      }
    } catch (error) {
      if (!signal.aborted) { failure ??= error instanceof Error ? error : new Error('下载中断。'); controller.abort(failure) }
    }
    return 0
  })()
  const startedAt = Date.now()
  let lastWork: FileDownloadProgress = { phase: 'naming', done: 0, total: 1 }
  const onWork = (progress: FileDownloadProgress) => { lastWork = progress; report(progress) }
  const pulse = setInterval(() => {
    // track 独占状态轮询和重试，心跳只回报最近进度，避免重复轮询积压。
    if (!productionDone) report({ ...lastWork, elapsedMs: Date.now() - startedAt })
  }, 15000)
  try {
    if (created.info?.sealed === true) { reportRetainedFailures(); await command({ action: 'finish', token }); productionDone = true }
    else await produce(sink, signal, onWork, context)
    const bytes = await track
    const failed = currentFailure()
    if (failed) throw failed
    signal.throwIfAborted()
    succeeded = true
    // 下载complete与ZIP封存均已确认，才清理磁盘缓存。
    await command({ action: 'complete', token }).catch(async () => { await command({ action: 'pause', token }).catch(() => {}) })
    return bytes
  } catch (error) {
    failure ??= error instanceof Error ? error : new Error('流水下载中断，任务缓存仍保留。')
    controller.abort(failure)
    await command({ action: 'pause', token }).catch(() => {})
    await track
    throw failure
  } finally {
    if (options.taskId && activeProducers.get(options.taskId) === controller) activeProducers.delete(options.taskId)
    clearInterval(pulse)
    globalThis.removeEventListener?.('pagehide', pageGone)
    if (!succeeded) await command({ action: 'pause', token }).catch(() => {})
  }
}
