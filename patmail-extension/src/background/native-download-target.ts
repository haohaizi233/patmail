import { BROWSER_FILE_CHANNEL, type BrowserFileReply, type BrowserFileRequest } from '../browser-download/types'

export interface NativeDownloadItem { id: number; url: string; state: string; paused?: boolean; error?: string; bytesReceived?: number; totalBytes?: number }
export interface NativeDownloadChange { id: number; state?: { current?: string }; paused?: { current?: boolean }; error?: { current?: string } }
interface DownloadApi {
  search(query: { url: string }): Promise<NativeDownloadItem[]>
  cancel(id: number): Promise<void>
  onChanged: { addListener(listener: (change: NativeDownloadChange) => void): void; removeListener(listener: (change: NativeDownloadChange) => void): void }
}
export interface NativeDownloadTargetOptions {
  openNavigation(url: string, request: BrowserFileRequest): Promise<void>
  resolveFileName?(request: BrowserFileRequest): string | Promise<string>
  getURL?(path: string): string
  downloads?: DownloadApi
  attachTimeoutMs?: number
  finishTimeoutMs?: number
  pollIntervalMs?: number
}
export interface NativeFetchEvent { request: Request; respondWith(response: Response | Promise<Response>): void }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  // Attach/complete may fail before their corresponding host request starts waiting.
  void promise.catch(() => {})
  return { promise, resolve, reject }
}
type Deferred = ReturnType<typeof deferred<void>>
interface Session {
  request: BrowserFileRequest; url: string; fileName: string; cursor: number
  stream: ReadableStream<Uint8Array>; controller: ReadableStreamDefaultController<Uint8Array>
  attached: Deferred; completed: Deferred; demand?: Deferred
  pending?: { bytes: Uint8Array; ack: Deferred }
  error?: Error; closing: boolean; done: boolean; claimed: boolean; downloadId?: number
  timer?: ReturnType<typeof setInterval>; attachTimer?: ReturnType<typeof setTimeout>
  listener: (change: NativeDownloadChange) => void
  cancellation?: Promise<void>
}

/** A navigation, unlike downloads.download(extensionURL), passes through the MV3 fetch handler. */
export function createNativeDownloadTarget(options: NativeDownloadTargetOptions) {
  const getURL = options.getURL ?? (path => chrome.runtime.getURL(path))
  const downloads = options.downloads ?? chrome.downloads
  const prefix = getURL('_patmail_native_download/')
  const sessions = new Map<string, Session>(), capabilities = new Map<string, Session>()
  const errorOf = (value: unknown) => value instanceof Error ? value : new Error(String(value))
  function cleanup(s: Session) {
    clearInterval(s.timer); clearTimeout(s.attachTimer)
    downloads.onChanged.removeListener(s.listener); capabilities.delete(s.url)
  }
  function cancelNative(s: Session): Promise<void> {
    return s.cancellation ??= (async () => {
      if (s.downloadId === undefined) {
        const item = (await downloads.search({ url: s.url })).find(item => item.url === s.url)
        if (item) s.downloadId = item.id
      }
      if (s.downloadId !== undefined) await downloads.cancel(s.downloadId)
    })()
  }
  function fail(s: Session, reason: unknown, cancel = true) {
    if (s.done || s.error) return
    s.error = errorOf(reason); cleanup(s)
    s.attached.reject(s.error); s.completed.reject(s.error)
    s.pending?.ack.reject(s.error); s.pending = undefined
    s.demand?.reject(s.error); s.demand = undefined
    try { s.controller.error(s.error) } catch { /* consumer may have already cancelled */ }
    if (cancel) void cancelNative(s).catch(() => {})
  }
  function status(s: Session, item: Pick<NativeDownloadItem, 'state' | 'paused' | 'error'>) {
    if (s.error || s.done) return
    if (item.paused || item.state === 'interrupted' || item.error) {
      fail(s, new Error('Chrome 下载已暂停或取消，缓存已保留，请在插件中继续。')); return
    }
    if (item.state === 'complete') {
      if (!s.closing) { fail(s, new Error('Chrome 下载提前结束，缓存仍保留。')); return }
      s.done = true; cleanup(s); s.completed.resolve()
    }
  }
  function watch(s: Session) {
    let polling = false
    const poll = async () => {
      if (polling || s.done || s.error) return
      polling = true
      try {
        const item = (await downloads.search({ url: s.url })).find(item => item.url === s.url)
        if (item) { s.downloadId = item.id; status(s, item) }
      } catch (error) { fail(s, error) }
      finally { polling = false }
    }
    downloads.onChanged.addListener(s.listener)
    s.timer = setInterval(() => { void poll() }, options.pollIntervalMs ?? 250)
    void poll()
  }
  function pump(s: Session) {
    if (!s.pending || !s.demand || s.error) return
    const pending = s.pending, demand = s.demand
    s.pending = undefined; s.demand = undefined
    s.controller.enqueue(pending.bytes); s.cursor += pending.bytes.byteLength
    pending.ack.resolve(); demand.resolve()
  }
  async function open(request: BrowserFileRequest) {
    const previous = sessions.get(request.targetId)
    if (previous) {
      if (previous.request.taskId !== request.taskId || previous.request.owner !== request.owner) throw new Error('下载目标不属于当前任务或账号。')
      if (!previous.done) { fail(previous, new Error('下载目标已重新打开。')); await cancelNative(previous) }
    }
    const fileName = options.resolveFileName ? await options.resolveFileName(request) : request.fileName ?? 'PatMail.zip'
    const suffix = /\.pdf$/i.test(fileName) ? 'pdf' : 'zip'
    const url = prefix + crypto.randomUUID() + '/' + crypto.randomUUID() + '.' + suffix
    const s = { request: { ...request }, url, fileName, cursor: 0, attached: deferred<void>(), completed: deferred<void>(),
      closing: false, done: false, claimed: false, listener: (_change: NativeDownloadChange) => {} } as Session
    s.stream = new ReadableStream<Uint8Array>({
      start(controller) { s.controller = controller },
      pull() { s.demand = deferred<void>(); const waiting = s.demand.promise; pump(s); return waiting },
      cancel(reason) { fail(s, new Error('Chrome 下载接收端已关闭，缓存仍保留：' + String(reason ?? '取消'))); return cancelNative(s) }
    }, { highWaterMark: 0 })
    s.listener = change => {
      if (change.id !== s.downloadId) return
      if (change.paused?.current || change.state?.current === 'interrupted' || change.error?.current) status(s, { state: 'interrupted', paused: change.paused?.current })
      else if (change.state?.current === 'complete') status(s, { state: 'complete' })
    }
    sessions.set(request.targetId, s); capabilities.set(url, s)
    s.attachTimer = setTimeout(() => fail(s, new Error('Chrome 下载导航未连接，请保持工作台打开后重试。')), options.attachTimeoutMs ?? 15000)
    // The workbench may disappear without answering its runtime message. The attach
    // deadline must still release the producer in that case.
    void Promise.resolve().then(() => options.openNavigation(url, request)).catch(error => fail(s, error))
    try { await s.attached.promise }
    catch (error) { fail(s, error); throw error }
  }
  async function operate(request: BrowserFileRequest): Promise<void> {
    if (request.channel !== BROWSER_FILE_CHANNEL || !request.taskId || !request.targetId || !request.owner) throw new Error('下载目标请求无效。')
    if (request.action === 'open') return open(request)
    const s = sessions.get(request.targetId)
    if (!s) {
      if (request.action === 'pause') return
      throw new Error('原生下载目标已离开，请在插件中继续。')
    }
    if (s.request.taskId !== request.taskId || s.request.owner !== request.owner) throw new Error('下载目标不属于当前任务或账号。')
    if (request.action === 'pause') {
      if (s.done) return
      fail(s, new Error('插件下载已暂停，缓存已保留。')); await cancelNative(s); return
    }
    if (s.error) throw s.error
    if (request.action === 'finish') {
      if (!s.closing && !s.done) {
        if (s.pending) throw new Error('ZIP 片段仍在写入，不能完成下载。')
        s.closing = true; s.controller.close(); s.demand?.resolve(); s.demand = undefined
      }
      const timer = setTimeout(() => fail(s, new Error('Chrome 尚未确认文件保存完成，缓存已保留。')), options.finishTimeoutMs ?? 120000)
      try { await s.completed.promise } finally { clearTimeout(timer) }
      return
    }
    if (request.action !== 'write' || s.closing || s.done || s.pending || request.offset !== s.cursor || typeof request.data !== 'string' ||
      request.data.length > 349528 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(request.data)) throw new Error('原生下载片段的顺序或编码无效。')
    const bytes = Uint8Array.from(atob(request.data), char => char.charCodeAt(0))
    if (bytes.length > 256 * 1024) throw new Error('原生下载片段超过256KiB。')
    if (!bytes.length) return
    s.pending = { bytes, ack: deferred<void>() }; const ack = s.pending.ack.promise
    pump(s); await ack
  }
  return {
    async status(targetId: string): Promise<{ state: 'inProgress' | 'complete'; receivedBytes: number; totalBytes?: number; downloadId?: number } | undefined> {
      const s = sessions.get(targetId)
      if (!s) return undefined
      if (s.error) throw s.error
      const item = (await downloads.search({ url: s.url })).find(item => item.url === s.url)
      if (item) { s.downloadId = item.id; status(s, item) }
      if (s.error) throw s.error
      return { ...(s.downloadId === undefined ? {} : { downloadId: s.downloadId }), state: s.done ? 'complete' : 'inProgress', receivedBytes: item?.bytesReceived ?? 0, ...(item?.totalBytes && item.totalBytes > 0 ? { totalBytes: item.totalBytes } : {}) }
    },
    async host(request: BrowserFileRequest): Promise<BrowserFileReply> {
      try { await operate(request); return { ok: true } }
      catch (error) { return { ok: false, error: errorOf(error).message } }
    },
    handleFetch(event: NativeFetchEvent): boolean {
      // Match the full extension URL rather than URL.origin (extension schemes can serialize it as null).
      if (!event.request.url.startsWith(prefix)) return false
      const s = capabilities.get(event.request.url)
      if (!s || s.claimed || s.error || event.request.method !== 'GET' || event.request.mode !== 'navigate') {
        event.respondWith(new Response('Download not found', { status: 404 })); return true
      }
      s.claimed = true; capabilities.delete(s.url); clearTimeout(s.attachTimer)
      const name = s.fileName.replace(/[\r\n\\/\u0000]/g, '_')
      const encoded = encodeURIComponent(name).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase())
      event.respondWith(new Response(s.stream, { headers: { 'Content-Type': /\.pdf$/i.test(name) ? 'application/pdf' : 'application/zip', 'Content-Disposition': `attachment; filename="PatMail.${/\.pdf$/i.test(name) ? 'pdf' : 'zip'}"; filename*=UTF-8''${encoded}`, 'Cache-Control': 'no-store' } }))
      watch(s); s.attached.resolve(); return true
    }
  }
}
