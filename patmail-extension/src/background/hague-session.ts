import { HAGUE_HOME, HAGUE_ORIGIN, HAGUE_SESSION_CHANNEL } from '../hague/session-contract'

/** This function is injected on the selected tab. Keep it self-contained and read-only. */
export async function probeHagueLogin(): Promise<{ authenticated: boolean; message?: string }> {
  if (location.origin !== 'https://hague.wipo.int') return { authenticated: false, message: '所选页面不是 eHague 官方页面。' }
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch('/HagueEFilingWeb/protected/portfolioManager.xhtml', { method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'follow', signal: controller.signal })
    if (!response.ok || new URL(response.url).origin !== 'https://hague.wipo.int' || new URL(response.url).pathname !== '/HagueEFilingWeb/protected/portfolioManager.xhtml') return { authenticated: false, message: 'eHague 登录未通过，请先在原站完成登录及二次验证。' }
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html')
    const authenticated = !!doc.querySelector('form#portfolio') && !!doc.querySelector('form#quickSearchPanel') && !!doc.querySelector('input[name="javax.faces.ViewState"]') && !doc.querySelector('input[type="password"]')
    return { authenticated, ...(authenticated ? {} : { message: '未读到已登录的案件列表，请先在 eHague 原站完成登录。' }) }
  } catch { return { authenticated: false, message: '无法确认 eHague 登录态，请检查网络并在原站完成登录后重新检测。' } }
  finally { clearTimeout(timer) }
}
type Tab = { id?: number; title?: string; url?: string }
export interface HagueSessionHost {
  extensionId: string
  queryTabs(): Promise<Tab[]>
  getTab(id: number): Promise<Tab>
  getDocumentId(id: number): Promise<string | undefined>
  createTab(url: string): Promise<void>
  executeScript(injection: { target: chrome.scripting.InjectionTarget; world: 'ISOLATED'; func: typeof probeHagueLogin }): Promise<Array<{ documentId?: string; result?: unknown }>>
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isHague = (url?: string): boolean => { try { return !!url && new URL(url).origin === HAGUE_ORIGIN } catch { return false } }
export function createHagueSessionHandler(host: HagueSessionHost) {
  return async (message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> => {
    let validSender = false
    try { const url = new URL(sender.url ?? ''); validSender = sender.id === host.extensionId && url.protocol === 'chrome-extension:' && url.hostname === host.extensionId && url.pathname === '/app.html' } catch { /* Untrusted sender. */ }
    if (!validSender || !record(message) || message.channel !== HAGUE_SESSION_CHANNEL) return { ok: false, error: 'eHague 会话调用方无效。' }
    try {
      if (message.action === 'listTabs') {
        const tabs = await host.queryTabs()
        return { ok: true, tabs: tabs.filter(t => Number.isSafeInteger(t.id) && isHague(t.url)).map(t => ({ id: t.id, title: t.title || 'WIPO eHague' })) }
      }
      if (message.action === 'open') { await host.createTab(HAGUE_HOME); return { ok: true } }
      if (message.action !== 'verify' || !Number.isSafeInteger(message.tabId) || Number(message.tabId) < 0) return { ok: false, error: '请选择 eHague 标签页。' }
      const tabId = Number(message.tabId), tab = await host.getTab(tabId)
      if (tab.id !== tabId || !isHague(tab.url)) return { ok: false, error: '所选标签页已关闭或不在 eHague 官方站点。' }
      const results = await host.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', func: probeHagueLogin })
      const probe = results[0]?.result, documentId = results[0]?.documentId
      if (!record(probe) || probe.authenticated !== true || !documentId) return { ok: false, error: record(probe) && typeof probe.message === 'string' ? probe.message : 'eHague 登录态无法确认。' }
      const [after, currentDocument] = await Promise.all([host.getTab(tabId), host.getDocumentId(tabId)])
      if (!isHague(after.url) || after.url !== tab.url || currentDocument !== documentId) return { ok: false, error: '验证时页面已变化，请重新连接并检测。' }
      const verifiedAt = Date.now()
      return { ok: true, session: { tabId, title: tab.title || 'WIPO eHague', documentId, verifiedAt, expiresAt: verifiedAt + 300000 } }
    } catch { return { ok: false, error: '无法连接 eHague 标签页，请确认页面仍打开后重新检测。' } }
  }
}
export function handleHagueSessionMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  return createHagueSessionHandler({
    extensionId: chrome.runtime.id,
    queryTabs: () => chrome.tabs.query({ url: `${HAGUE_ORIGIN}/*` }),
    getTab: id => chrome.tabs.get(id),
    getDocumentId: async tabId => (await chrome.webNavigation.getFrame({ tabId, frameId: 0 }))?.documentId,
    createTab: async url => { await chrome.tabs.create({ url }) },
    executeScript: injection => chrome.scripting.executeScript(injection)
  })(message, sender)
}

/** One read-only touch per minute while a protected eHague tab is open; never opens or logs in. */
export function createHagueKeepalive(host:Pick<HagueSessionHost,'queryTabs'|'executeScript'>,clock:()=>number=Date.now){
  let running=false,lastStarted=Number.NEGATIVE_INFINITY
  return async():Promise<void>=>{
    const now=clock()
    if(running||now-lastStarted<60000)return
    running=true;lastStarted=now
    try{
      const tabs=await host.queryTabs()
      const tab=tabs.find(t=>Number.isSafeInteger(t.id)&&isHague(t.url)&&new URL(t.url!).pathname.startsWith('/HagueEFilingWeb/protected/'))
      if(tab)await host.executeScript({target:{tabId:tab.id!,frameIds:[0]},world:'ISOLATED',func:probeHagueLogin})
    }catch{ /* Closed tabs or an expired login do not trigger navigation or another login attempt. */ }
    finally{running=false}
  }
}
export const keepHagueSessionAlive=createHagueKeepalive({
  queryTabs:()=>chrome.tabs.query({url:`${HAGUE_ORIGIN}/*`}),
  executeScript:injection=>chrome.scripting.executeScript(injection)
})
