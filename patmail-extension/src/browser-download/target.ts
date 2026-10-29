import { newUuid } from '../utils/uuid'
import { BROWSER_FILE_CHANNEL, type BrowserFileReply, type BrowserFileRequest } from './types'

interface Target {
  taskId: string
  owner: string
  handle: FileSystemFileHandle
  writer: FileSystemWritableFileStream | null
  cursor: number
  released: boolean
  tail: Promise<unknown>
}
const targets = new Map<string, Target>()
let listeningRuntime: unknown

/** 调用方必须直接从用户点击进入，不能先等待WAL或网络。 */
export async function chooseBrowserDownloadTarget(taskId: string, owner: string, fileName: string): Promise<string> {
  const picker = (globalThis as typeof globalThis & { showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker
  if (!picker) throw new Error('请在 Chrome 或 Edge 的插件工作台中选择保存位置；当前页面不支持直接保存。')
  const handle = await picker.call(globalThis, { suggestedName: fileName, types: [{ description: 'ZIP压缩包', accept: { 'application/zip': ['.zip'] } }] })
  await releaseBrowserDownloadTarget(taskId)
  const targetId = newUuid()
  targets.set(targetId, { taskId, owner, handle, writer: null, cursor: 0, released: false, tail: Promise.resolve() })
  const runtime = globalThis.chrome?.runtime
  if (runtime?.onMessage && listeningRuntime !== runtime) {
    runtime.onMessage.addListener(handleBrowserFileMessage)
    listeningRuntime = runtime
  }
  return targetId
}

async function operate(target: Target, request: BrowserFileRequest): Promise<void> {
  if (request.action === 'pause') {
    const writer = target.writer
    if (writer) await writer.close()
    target.writer = null
    return
  }
  if (target.released) throw new Error('文件保存页面已离开，请重新选择保存位置后继续。')
  if (request.action === 'open') {
    if (target.writer) await target.writer.close()
    target.writer = await target.handle.createWritable({ keepExistingData: false, mode: 'exclusive' } as FileSystemCreateWritableOptions)
    target.cursor = 0
    return
  }
  if (!target.writer) throw new Error('保存文件尚未打开，请重新选择保存位置。')
  if (request.action === 'finish') {
    await target.writer.close()
    target.writer = null
    return
  }
  if (request.action !== 'write' || request.offset !== target.cursor || typeof request.data !== 'string' ||
    request.data.length > 349528 || !/^[A-Za-z0-9+/]*={0,2}$/.test(request.data)) throw new Error('保存文件的顺序或数据无效。')
  const bytes = Uint8Array.from(atob(request.data), char => char.charCodeAt(0))
  if (bytes.length > 256 * 1024) throw new Error('保存文件的片段过大。')
  await target.writer.write(bytes)
  target.cursor += bytes.length
}

/** 内容页没有文件句柄；只有同扩展后台可向已选目标派发文件操作。 */
export function handleBrowserFileMessage(message: unknown, sender: chrome.runtime.MessageSender, reply: (value: BrowserFileReply) => void): boolean {
  if (!message || typeof message !== 'object') return false
  const request = message as BrowserFileRequest
  if (request.channel !== BROWSER_FILE_CHANNEL || typeof request.targetId !== 'string') return false
  const runtime = globalThis.chrome?.runtime
  if (!runtime || sender.id !== runtime.id || sender.tab ||
    (sender.url && sender.url !== runtime.getURL('background.js'))) return false
  const target = targets.get(request.targetId)
  if (!target || target.taskId !== request.taskId) return false
  if (target.owner !== request.owner) { reply({ ok: false, error: '保存目标不属于当前账号。' }); return false }
  const work = target.tail.catch(() => {}).then(() => operate(target, request))
  target.tail = work
  void work.then(() => reply({ ok: true }), error => reply({ ok: false, error: error instanceof Error ? error.message : '文件没有保存成功，缓存仍保留。' }))
  return true
}

export async function releaseBrowserDownloadTarget(taskId: string): Promise<void> {
  await Promise.all([...targets.entries()].filter(([, target]) => target.taskId === taskId).map(async ([id, target]) => {
    target.released = true
    await target.tail.catch(() => {})
    const writer = target.writer
    if (writer) {
      try { await writer.close() }
      catch (error) {
        // 关闭失败时先终止旧的暂存写入，防止晚到提交覆盖新文件。
        await writer.abort(error)
        target.writer = null; targets.delete(id)
        throw error
      }
    }
    target.writer = null
    targets.delete(id)
  }))
}
