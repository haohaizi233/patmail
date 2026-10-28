import { MessageType, type StreamDownloadCommand } from '../shared/message'
import type { FileDownloadProgress } from '../shared/download-progress'
import { sendToBackground } from './runtime'
import { watchBrowserDownload } from './download-outcome'

/** 内容脚本只传有界数据块；本机URL由后台固定构造，页面不能指定中转目标。 */
export async function nativeStreamArchive(
  fileName: string,
  produce: (sink: WritableStream<Uint8Array>, signal: AbortSignal, onWork: (progress: FileDownloadProgress) => void) => Promise<void>,
  report: (progress: FileDownloadProgress) => void
): Promise<number> {
  const command = async (payload: StreamDownloadCommand) => {
    const response = await sendToBackground({ type: MessageType.StreamDownload, payload }, payload.action === 'write' ? 130_000 : 15_000)
    if (response?.type !== MessageType.StreamDownloadResult) throw new Error(response?.type === MessageType.Error ? response.payload.message : '本机下载流没有应答。')
    return response.payload
  }
  const created = await command({ action: 'start', fileName })
  if (!created.token) throw new Error('本机下载流缺少写入凭据。')
  const token = created.token
  const controller = new AbortController()
  const pageGone = () => controller.abort(new Error('EASY来源页面已离开，压缩包未完成。'))
  globalThis.addEventListener?.('pagehide', pageGone, { once: true })
  let sequence = 0
  let failure: Error | null = null
  const block = new Uint8Array(256 * 1024)
  let filled = 0
  const flush = async () => {
    if (!filled) return
    controller.signal.throwIfAborted()
    let binary = ''
    for (let offset = 0; offset < filled; offset += 8192) binary += String.fromCharCode(...block.subarray(offset, Math.min(filled, offset + 8192)))
    await command({ action: 'write', token, sequence: sequence++, data: btoa(binary) })
    filled = 0
  }
  const sink = new WritableStream<Uint8Array>({
    async write(chunk) {
      controller.signal.throwIfAborted()
      for (let offset = 0; offset < chunk.byteLength;) {
        const count = Math.min(block.byteLength - filled, chunk.byteLength - offset)
        block.set(chunk.subarray(offset, offset + count), filled)
        filled += count; offset += count
        if (filled === block.byteLength) await flush()
      }
      // 先发ZIP首块，让浏览器尽早创建在途记录；后续仍按256KiB合并，避免逐个小头部往返。
      if (sequence === 0 && filled) await flush()
    },
    async close() { await flush(); await command({ action: 'finish', token }) },
    async abort(reason) {
      failure ??= reason instanceof Error ? reason : new Error('流水写入失败，压缩包未完成。')
      await command({ action: 'abort', token }).catch(() => {})
    }
  })
  const track = (async () => {
    try {
      while (!controller.signal.aborted) {
        const status = await command({ action: 'status', token })
        if (status.downloadId !== undefined) {
          const outcome = await watchBrowserDownload({
            downloadId: status.downloadId, signal: controller.signal, onProgress: report,
            poll: async downloadId => {
              const response = await sendToBackground({ type: MessageType.DownloadState, payload: { downloadId } }, 15_000)
              return response?.type === MessageType.DownloadStateResult ? response.payload : null
            }
          })
          if (outcome?.state !== 'complete') throw new Error(outcome?.error ? `浏览器下载中断（${outcome.error}），压缩包未保存完整。` : '无法确认浏览器下载完成，压缩包未保存完整。')
          return outcome.receivedBytes
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (error) {
      failure ??= error instanceof Error ? error : new Error('浏览器下载中断。')
      controller.abort(failure)
    }
    return 0
  })()
  const started = Date.now()
  let lastWork: FileDownloadProgress = { phase: 'naming', done: 0, total: 1 }
  const onWork = (progress: FileDownloadProgress) => { lastWork = progress; report(progress) }
  const pulse = setInterval(() => {
    void command({ action: 'status', token }).catch(error => { failure ??= error; controller.abort(error) })
    report({ ...lastWork, elapsedMs: Date.now() - started })
  }, 15_000)
  try {
    await produce(sink, controller.signal, onWork)
    const bytes = await track
    if (failure) throw failure
    controller.signal.throwIfAborted()
    return bytes
  } catch (error) {
    failure ??= error instanceof Error ? error : new Error('流水下载失败。')
    controller.abort()
    await command({ action: 'abort', token }).catch(() => {})
    await track
    throw failure ?? error
  } finally {
    clearInterval(pulse)
    globalThis.removeEventListener?.('pagehide', pageGone)
    await command({ action: 'abort', token }).catch(() => {})
  }
}
