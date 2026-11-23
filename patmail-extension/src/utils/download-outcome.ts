import type { FileDownloadProgress } from '../shared/download-progress'

/** 后台DOWNLOAD_STATE_RESULT的状态回读；后台将原生bytesReceived统一映射为receivedBytes。 */
export interface BrowserDownloadSnapshot {
  state?: string
  receivedBytes?: number
  totalBytes?: number | null
  error?: string
  fileName?: string
}

/** 浏览器下载的终态。complete 才算保存完成；interrupted 说明压缩包没保存完整。 */
export interface BrowserDownloadOutcome {
  state: 'complete' | 'interrupted'
  receivedBytes: number
  totalBytes: number | null
  error: string
  fileName?: string
}

export interface WatchBrowserDownloadOptions {
  downloadId: number
  /** 回读一次下载状态；拿不到任务返回 null。 */
  poll: (downloadId: number) => Promise<BrowserDownloadSnapshot | null>
  onProgress?: (progress: FileDownloadProgress) => void
  intervalMs?: number
  signal?: AbortSignal
  /** 连续多少次读不到任务就放弃跟踪（返回 null），由调用方按「已交给浏览器」兜底。 */
  maxMisses?: number
}

const sleep = (milliseconds: number, signal?: AbortSignal): Promise<void> => new Promise(resolve => {
  const timer = setTimeout(finish, milliseconds)
  function finish(): void {
    clearTimeout(timer)
    signal?.removeEventListener('abort', finish)
    resolve()
  }
  signal?.addEventListener('abort', finish, { once: true })
})

/**
 * 按真实字节流式回报浏览器下载进度，直到完成或中断才返回。
 * 字节数没变就不重复上报：暂停中的下载不能靠没变化的进度把工作台的失联检查永远续期。
 * 连续读不到任务或被取消时返回 null，表示终态未知，由调用方保持「已交给浏览器下载」的口径。
 */
export async function watchBrowserDownload(options: WatchBrowserDownloadOptions): Promise<BrowserDownloadOutcome | null> {
  const intervalMs = options.intervalMs ?? 1000
  const maxMisses = options.maxMisses ?? 5
  const startedAt = Date.now()
  let misses = 0
  let sent: { receivedBytes: number; totalBytes: number | null } | null = null
  for (;;) {
    if (options.signal?.aborted) return null
    let snapshot: BrowserDownloadSnapshot | null = null
    try {
      snapshot = await options.poll(options.downloadId)
    } catch {
      snapshot = null
    }
    if (options.signal?.aborted) return null
    if (!snapshot) {
      misses += 1
      if (misses >= maxMisses) return null
      await sleep(intervalMs, options.signal)
      continue
    }
    misses = 0
    const receivedBytes = Number.isSafeInteger(snapshot.receivedBytes) && (snapshot.receivedBytes ?? 0) >= 0 ? snapshot.receivedBytes as number : 0
    const totalBytes = Number.isSafeInteger(snapshot.totalBytes) && (snapshot.totalBytes ?? 0) > 0 ? snapshot.totalBytes as number : null
    const error = typeof snapshot.error === 'string' ? snapshot.error.slice(0, 200) : ''
    if (snapshot.state === 'complete' || snapshot.state === 'interrupted') {
      // 完成瞬间 bytesReceived 偶尔还是 0：按已落盘长度（totalBytes）补足，最终提示不能写成 0 字节。
      const savedBytes = snapshot.state === 'complete' && totalBytes ? Math.max(receivedBytes, totalBytes) : receivedBytes
      options.onProgress?.({
        phase: 'downloading', done: 0, total: 1, state: snapshot.state,
        elapsedMs: Date.now() - startedAt, receivedBytes: savedBytes, ...(totalBytes === null ? {} : { totalBytes })
      })
      return { state: snapshot.state, receivedBytes: savedBytes, totalBytes, error, ...(snapshot.fileName ? { fileName: snapshot.fileName } : {}) }
    }
    // 只有字节数或总长度变化才算新进度；不变的在途状态不重复报。
    if (!sent || sent.receivedBytes !== receivedBytes || sent.totalBytes !== totalBytes) {
      sent = { receivedBytes, totalBytes }
      options.onProgress?.({
        phase: 'downloading', done: 0, total: 1, state: 'inProgress',
        elapsedMs: Date.now() - startedAt, receivedBytes, ...(totalBytes === null ? {} : { totalBytes })
      })
    }
    await sleep(intervalMs, options.signal)
  }
}
