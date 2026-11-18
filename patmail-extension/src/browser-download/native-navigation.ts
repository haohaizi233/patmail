import { newUuid } from '../utils/uuid'

export const NATIVE_NAVIGATION_CHANNEL = 'PATMAIL_NATIVE_NAVIGATE'
interface Target { taskId: string; owner: string; frame?: HTMLIFrameElement }
const targets = new Map<string, Target>()
let listeningRuntime: unknown

// eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
export async function registerNativeDownloadTarget(taskId: string, owner: string): Promise<string> {
  releaseNativeDownloadTarget(taskId)
  const runtime = globalThis.chrome?.runtime
  if (!runtime?.onMessage) throw new Error('浏览器扩展后台不可用，请重新加载扩展后打开工作台。')
  const targetId = newUuid()
  targets.set(targetId, { taskId, owner })
  if (listeningRuntime !== runtime) {
    runtime.onMessage.addListener(handleNativeNavigation)
    listeningRuntime = runtime
  }
  return targetId
}

export function handleNativeNavigation(message: unknown, sender: chrome.runtime.MessageSender, reply: (value: { ok: boolean; error?: string }) => void): boolean {
  if (!message || typeof message !== 'object') return false
  const request = message as Record<string, unknown>
  const runtime = globalThis.chrome?.runtime
  if (request.channel !== NATIVE_NAVIGATION_CHANNEL || !runtime || sender.id !== runtime.id || sender.tab ||
    sender.url !== runtime.getURL('background.js') || typeof request.targetId !== 'string') return false
  const target = targets.get(request.targetId)
  if (!target || request.taskId !== target.taskId || request.owner !== target.owner || typeof request.url !== 'string' ||
    !request.url.startsWith(runtime.getURL('_patmail_native_download/'))) return false
  void (async () => {
    const workers = navigator.serviceWorker
    if (!workers) throw new Error('当前浏览器未提供扩展流式下载能力。')
    await workers.ready
    if (!workers.controller) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { workers.removeEventListener('controllerchange', ready); reject(new Error('下载后台尚未接管工作台，请重新打开工作台。')) }, 10_000)
      const ready = () => { if (workers.controller) { clearTimeout(timer); workers.removeEventListener('controllerchange', ready); resolve() } }
      workers.addEventListener('controllerchange', ready)
      ready()
    })
    if (targets.get(request.targetId as string) !== target) throw new Error('下载目标已离开。')
    target.frame?.remove()
    const frame = document.createElement('iframe')
    frame.hidden = true
    frame.title = '浏览器流式下载'
    frame.src = request.url as string
    target.frame = frame
    document.body.append(frame)
  })().then(() => reply({ ok: true }), error => reply({ ok: false, error: error instanceof Error ? error.message : '原生下载没有启动。' }))
  return true
}

export function releaseNativeDownloadTarget(taskId: string): void {
  for (const [id, target] of targets) if (target.taskId === taskId) { target.frame?.remove(); targets.delete(id) }
}
