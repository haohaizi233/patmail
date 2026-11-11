import { HAGUE_SESSION_CHANNEL, type HagueSession, type HagueTab } from './session-contract'
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
async function send(action: string, tabId?: number): Promise<Record<string, unknown>> {
  const response = await new Promise<unknown>((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) { reject(new Error('请在扩展工作台中连接 eHague。')); return }
    chrome.runtime.sendMessage({ channel: HAGUE_SESSION_CHANNEL, action, ...(tabId === undefined ? {} : { tabId }) }, (reply: unknown) => {
      if (chrome.runtime.lastError) reject(new Error('eHague 连接通道不可用，请重新加载扩展后再试。'))
      else resolve(reply)
    })
  })
  if (!record(response) || response.ok !== true) throw new Error(record(response) && typeof response.error === 'string' ? response.error : 'eHague 页面未返回验证结果。')
  return response
}
export const hagueSessionClient = {
  async listTabs(): Promise<HagueTab[]> {
    const response = await send('listTabs')
    if (!Array.isArray(response.tabs)) throw new Error('eHague 标签页列表无效。')
    return response.tabs.filter(record).flatMap(t => Number.isSafeInteger(t.id) && typeof t.title === 'string' ? [{ id: Number(t.id), title: t.title }] : [])
  },
  async verify(tabId: number): Promise<HagueSession> {
    const response = await send('verify', tabId), s = response.session
    if (!record(s) || s.tabId !== tabId || typeof s.documentId !== 'string' || !s.documentId || typeof s.title !== 'string' || typeof s.verifiedAt !== 'number' || typeof s.expiresAt !== 'number' || s.expiresAt <= Date.now() || s.expiresAt - s.verifiedAt > 300000) throw new Error('eHague 会话验证结果无效。')
    return { tabId, documentId: s.documentId, title: s.title, verifiedAt: s.verifiedAt, expiresAt: s.expiresAt }
  },
  async open(): Promise<void> { await send('open') }
}
