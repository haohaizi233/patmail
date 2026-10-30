import { isMessage, MessageType, type ContentResponse } from '../shared/message'
import { isRecord } from '../shared/guards'
import { DOWNLOAD_RESULT_CHANNEL, DOWNLOAD_PROGRESS_CHANNEL, isDownloadProgress } from '../shared/download-progress'

// 检测来源页面失联，按状态消息续期，不限制压缩任务总时长。后台标签页可能一分钟才调度一次定时器。
export const DOWNLOAD_JOB_SILENCE_MS = 600_000
/** 受理回执超时后，给匹配的进度或最终结果一个有限确认窗口。 */
export const DOWNLOAD_ACCEPTANCE_CONFIRMATION_MS = 5_000
const BACKGROUND_TIMEOUT_MESSAGE = '扩展后台没有在时限内返回。'

/** 页面任务独立运行，后台只短暂转发受理；最终结果另发，避免长消息和30分钟等待预算。 */
export function waitForDownloadJob(id: string, start: () => Promise<ContentResponse>, signal?: AbortSignal): Promise<ContentResponse> {
  return new Promise(resolve => {
    let settled = false
    let sourceTabId: number | undefined
    let silence: ReturnType<typeof setTimeout> | undefined
    let acceptanceConfirmation: ReturnType<typeof setTimeout> | undefined
    let progressObserved = false
    const runtime = chrome.runtime
    const finish = (result: ContentResponse): void => {
      if (settled) return
      settled = true
      clearTimeout(silence)
      clearTimeout(acceptanceConfirmation)
      runtime.onMessage.removeListener(onResult)
      chrome.tabs?.onRemoved?.removeListener(sourceRemoved)
      signal?.removeEventListener('abort', abort)
      window.removeEventListener('pagehide', leave)
      resolve(result)
    }
    const error = (message: string) => finish({ type: MessageType.Error, payload: { message } })
    const abort = () => error('已停止等待；原站的下载准备会继续，完成后交给浏览器。')
    const leave = () => error('工作台已离开；原站的下载准备会继续，完成后交给浏览器。')
    const sourceRemoved = (tabId: number) => {
      if (tabId === sourceTabId) error('EASY 来源标签页已关闭，无法继续接收下载结果。请重新打开页面，并检查浏览器下载记录。')
    }
    const renew = () => {
      clearTimeout(silence)
      silence = setTimeout(() => error('下载页面长时间没有回报状态，已停止等待。请检查 EASY 页面和浏览器下载记录，避免重复打包。'), DOWNLOAD_JOB_SILENCE_MS)
    }
    const onResult = (packet: unknown, sender: chrome.runtime.MessageSender): void => {
      if (sender.id !== runtime.id || !isRecord(packet) || packet.id !== id) return
      if (packet.channel === DOWNLOAD_PROGRESS_CHANNEL && isDownloadProgress(packet.progress)) {
        progressObserved = true
        clearTimeout(acceptanceConfirmation)
        acceptanceConfirmation = undefined
        sourceTabId ??= sender.tab?.id
        renew()
        return
      }
      if (packet.channel !== DOWNLOAD_RESULT_CHANNEL) return
      const body = packet.body
      if (isMessage(body) && (body.type === MessageType.DownloadFilesResult || body.type === MessageType.Error)) finish(body)
      else error('下载任务返回了无法识别的结果。')
    }
    runtime.onMessage.addListener(onResult)
    chrome.tabs?.onRemoved?.addListener(sourceRemoved)
    signal?.addEventListener('abort', abort, { once: true })
    window.addEventListener('pagehide', leave, { once: true })
    renew()
    if (signal?.aborted) { abort(); return }
    void start().then(response => {
      if (settled) return
      if (response.type === MessageType.DownloadFilesAccepted) {
        if (response.payload.progressId !== id) error('下载任务受理编号不一致。')
        return
      }
      if (response.type === MessageType.Error && response.payload.message === BACKGROUND_TIMEOUT_MESSAGE) {
        if (progressObserved) return
        acceptanceConfirmation = setTimeout(() => finish(response), DOWNLOAD_ACCEPTANCE_CONFIRMATION_MS)
        return
      }
      // 兼容尚未刷新、仍直接返回最终结果的内容脚本。
      finish(response)
    }).catch(() => error('下载任务没有被原站页面接收，请刷新后重试。'))
  })
}
