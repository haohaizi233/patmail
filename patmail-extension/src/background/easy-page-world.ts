import { EASY_PAGE_WORLD_CHANNEL, type EasyPageWorldReply } from '../shared/easy-page-world'

/** Serialized by Chrome into the requested document; it must not capture extension variables. */
function runEasyPageWorld(action: string, id: string, title: string, path: string, origin: string): EasyPageWorldReply {
  if (location.origin !== origin) return { ok: false, message: '原网站页面已经变化，请重新读取。' }
  const page = window as Window & {
    _UserMenu?: unknown
    AddBusinessTab?: (id: string, title: string, path: string) => void
    $?: { dialog?: (options: Record<string, unknown>) => unknown }
  }
  const nodes: unknown[] = Array.isArray(page._UserMenu) ? page._UserMenu : []
  const menu = nodes.filter((node): node is Record<string, unknown> => Boolean(node) && typeof node === 'object')
    .filter(node => node.is_business || node.is_page)
  if (action === 'read-menu') {
    return { ok: true, entries: menu.flatMap(node => {
      const url = typeof node.menu_url === 'string' ? node.menu_url.trim().slice(0, 200) : ''
      const name = node.menu_name ?? node.name ?? node.title ?? node.menu_title ?? node.text
      return url ? [{ name: typeof name === 'string' ? name.trim().slice(0, 40) : '', url }] : []
    }) }
  }
  if (typeof page.AddBusinessTab !== 'function') return { ok: false, message: '当前标签不是 EASY 首页，打不开内部页签。请先回到首页。' }
  try {
    if (new URL(path, location.href).origin !== origin) return { ok: false, message: '只能打开当前 EASY 系统的页面。' }
  } catch { return { ok: false, message: '原网站页面地址无效。' } }
  const bare = path.split('?')[0].toLowerCase()
  if (bare === 'ihgforms/downloadlist.aspx' && typeof page.$?.dialog === 'function') {
    page.$.dialog({
      title: '下载清单', id: 'DownloadList', content: 'url:Ihgforms/DownloadList.aspx',
      width: 960, height: 530, lock: true, max: false, min: false, resize: false
    })
    return { ok: true }
  }
  const allowed = bare.includes('forms/faq') || bare === 'ihgforms/downloadlist.aspx' || menu.some(node => typeof node.menu_url === 'string' && node.menu_url.toLowerCase() === bare)
  if (!allowed) return { ok: false, message: '原网站菜单里没有这个页面，不能打开。' }
  page.AddBusinessTab(id, title, path)
  return { ok: true }
}

interface MainWorldInjection {
  target: chrome.scripting.InjectionTarget
  world: 'MAIN'
  func: typeof runEasyPageWorld
  args: [string, string, string, string, string]
}
export interface EasyPageWorldHost {
  extensionId: string
  allowsOrigin(origin: string): boolean
  executeScript(injection: MainWorldInjection): Promise<Array<{ result?: unknown }>>
}

export async function handleEasyPageWorld(value: unknown, sender: chrome.runtime.MessageSender, host: EasyPageWorldHost): Promise<EasyPageWorldReply> {
  const denied = { ok: false, message: '无法确认原网站页面，不能读取或打开页签。' } as const
  if (sender.id !== host.extensionId || sender.tab?.id === undefined || !sender.url) return denied
  let origin: string
  try { origin = new URL(sender.url).origin } catch { return denied }
  if (!host.allowsOrigin(origin)) return denied
  if (!value || typeof value !== 'object') return denied
  const request = value as Record<string, unknown>
  if (request.channel !== EASY_PAGE_WORLD_CHANNEL || (request.action !== 'read-menu' && request.action !== 'open-tab')) return denied
  if (request.action === 'open-tab' && !['tabId', 'title', 'path'].every(key => typeof request[key] === 'string' && request[key].length > 0 && request[key].length <= 2000)) return denied
  try {
    const results = await host.executeScript({
      target: { tabId: sender.tab.id, ...(sender.documentId ? { documentIds: [sender.documentId] } : { frameIds: [sender.frameId ?? 0] }) },
      world: 'MAIN', func: runEasyPageWorld,
      args: [request.action, typeof request.tabId === 'string' ? request.tabId : '', typeof request.title === 'string' ? request.title : '', typeof request.path === 'string' ? request.path : '', origin]
    })
    const result = results[0]?.result
    if (result && typeof result === 'object' && 'ok' in result && typeof result.ok === 'boolean') return result as EasyPageWorldReply
    return { ok: false, message: '原网站没有返回页签信息，请重新读取。' }
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message.slice(0, 200) : '原网站页面没有完成操作。' }
  }
}
