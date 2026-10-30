import {
  EASY_PAGE_WORLD_CHANNEL,
  type EasyPageWorldMenuEntry,
  type EasyPageWorldReply,
  type EasyPageWorldRequest
} from '../shared/easy-page-world'

type EasyPageWorldSender = (request: EasyPageWorldRequest) => Promise<unknown>

const OPEN_TAB_FAILURE = '原网站没有接住打开请求。请回到 EASY 首页后再试。'
const OPEN_TAB_SUCCESS = '已在 EASY 首页打开。'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMenuEntry(value: unknown): value is EasyPageWorldMenuEntry {
  return isRecord(value) && typeof value.name === 'string' && typeof value.url === 'string'
}

function isReply(value: unknown): value is EasyPageWorldReply {
  if (!isRecord(value)) return false
  if (value.ok === false) return typeof value.message === 'string'
  if (value.ok !== true) return false
  return value.entries === undefined || (Array.isArray(value.entries) && value.entries.every(isMenuEntry))
}

function sendRuntimeMessage(request: EasyPageWorldRequest): Promise<unknown> {
  return chrome.runtime.sendMessage(request)
}

async function request(request: EasyPageWorldRequest, send: EasyPageWorldSender): Promise<EasyPageWorldReply | null> {
  try {
    const reply = await send(request)
    return isReply(reply) ? reply : null
  } catch {
    return null
  }
}

export async function readEasyPageMenu(send: EasyPageWorldSender = sendRuntimeMessage): Promise<EasyPageWorldMenuEntry[]> {
  const reply = await request({ channel: EASY_PAGE_WORLD_CHANNEL, action: 'read-menu' }, send)
  if (!reply?.ok || !reply.entries) return []
  return reply.entries.flatMap(entry => {
    const url = entry.url.trim().slice(0, 200)
    if (!url) return []
    return [{ name: entry.name.trim().slice(0, 40), url }]
  })
}

export async function openEasyPageTab(
  tabId: string,
  title: string,
  path: string,
  send: EasyPageWorldSender = sendRuntimeMessage
): Promise<{ ok: boolean; message: string }> {
  const reply = await request({ channel: EASY_PAGE_WORLD_CHANNEL, action: 'open-tab', tabId, title, path }, send)
  if (!reply) return { ok: false, message: OPEN_TAB_FAILURE }
  if (reply.ok) return { ok: true, message: OPEN_TAB_SUCCESS }
  return { ok: false, message: reply.message.slice(0, 200) }
}
