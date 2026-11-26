import { handleDocumentExport } from './document-export'
import { handleHagueSessionMessage, keepHagueSessionAlive } from './hague-session'
import { handleHagueDraftMessage } from './hague-draft'
import { handleHagueHttp } from './hague-http'
import { indexedTransactionStore, ExecutionLedger } from '../automation/ledger'
import { IndexedTaskStore } from '../automation/indexed-store'
import { IndexedEvidenceStore, MemoryEvidenceStore } from '../automation/evidence-store'
import { handleAuthorityMessage } from './authority'
import { deliverAgentAnswer, handleAgentChat } from './agent'
import { scopeExtensionPageMessage } from './scope'
import { EasyConnectionController, sameConnectionSnapshot, tabOrigin, type ConnectionSnapshot } from '../shared/connection'
import { handleWorkspaceMessage, hasActiveForwards, openWorkspaceTab, recheckBoundSession, resumeEasySession, type WorkspaceHost } from './workspace'
import { isRecord } from '../shared/guards'
import { browserDownloadName } from '../shared/download-file-name'
import { prepareForwardedSearch } from '../api/message-guards'
import { downloadFilesRequestIssue, isMessage, MessageType, type AppMessage, type BackgroundResponse } from '../shared/message'
import { prepareApiDocs } from '../agent/rag-store'
import { hydrateWriteSwitch, watchWriteSwitch } from '../settings/write-switch'
import { customerMode, hydrateCustomerMode, preferredModeOrigin, originMatchesMode, watchCustomerMode } from '../settings/customer-mode'
import { LocalStreamDownloads } from './stream-download'
import { trustedOrigin } from '../api/config'
import { handleRecoveryMessage } from './recovery'
import { BrowserStreamDownloads } from './browser-download'
import { createBrowserDownloadStore } from '../browser-download/store'
import { type BrowserFileReply } from '../browser-download/types'
import { createNativeDownloadTarget, type NativeFetchEvent } from './native-download-target'
import { NATIVE_NAVIGATION_CHANNEL } from '../browser-download/native-navigation'
import { handleEasyPageWorld } from './easy-page-world'
import { handleJihuaMessage } from './jihua-page-world'
import { CALL_CHANNEL, createBackgroundMessageRegistry, RESULT_CHANNEL } from './message-registry'

const streamDownloads = new LocalStreamDownloads(chrome.downloads)
let legacyStreamsUsed = false
const nativeTarget = createNativeDownloadTarget({ openNavigation: (url, request) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('下载工作台没有响应，缓存仍保留。')), 15_000)
  chrome.runtime.sendMessage({ channel: NATIVE_NAVIGATION_CHANNEL, url, taskId: request.taskId, targetId: request.targetId, owner: request.owner }, (response: BrowserFileReply | undefined) => {
    clearTimeout(timer)
    const error = chrome.runtime.lastError?.message
    if (error || !response || !response.ok) reject(new Error(response && !response.ok ? response.error : '请保持下载工作台打开，再继续下载。'))
    else resolve()
  })
}) })
const workerScope = globalThis as unknown as {
  clients: { claim(): Promise<void> }
  addEventListener(type: 'fetch', listener: (event: NativeFetchEvent) => void): void
  addEventListener(type: 'activate', listener: (event: { waitUntil(promise: Promise<void>): void }) => void): void
}
workerScope.addEventListener('fetch', event => { nativeTarget.handleFetch(event) })
workerScope.addEventListener('activate', event => { event.waitUntil(workerScope.clients.claim()) })
// eslint-disable-next-line @typescript-eslint/unbound-method -- 存量豁免：保留原型方法引用
const browserDownloads = new BrowserStreamDownloads(createBrowserDownloadStore(), nativeTarget.host, nativeTarget.status)
const documentDownloads = new BrowserStreamDownloads(createBrowserDownloadStore(), request => nativeTarget.host(request), targetId => nativeTarget.status(targetId))

watchWriteSwitch()
// 扩展 Service Worker 不能用顶层 await，否则 Chrome 直接拒绝启动，工具栏点击没有监听。
void hydrateWriteSwitch()
void hydrateCustomerMode()
void prepareApiDocs()

const ownerId = globalThis.crypto.randomUUID()
const transactions = indexedTransactionStore()
const ledger = transactions ? new ExecutionLedger(transactions, ownerId) : null
const tasks = globalThis.indexedDB ? new IndexedTaskStore(globalThis.indexedDB) : null
const evidence = globalThis.indexedDB ? new IndexedEvidenceStore(globalThis.indexedDB) : new MemoryEvidenceStore()
const connection = new EasyConnectionController()
const CONNECTION_SNAPSHOT = 'patmail.connection.snapshot.v1'
let persistedSnapshot: ConnectionSnapshot | null = null
let connectionRestored = false

function persistConnection(): void {
  if (!connectionRestored) return
  const next = connection.snapshot()
  if (sameConnectionSnapshot(persistedSnapshot, next)) return
  persistedSnapshot = next
  void chrome.storage.local.set({ [CONNECTION_SNAPSHOT]: next })
  if (connection.context.sessionStatus === 'authenticated' && connection.context.operatorId) {
    const owner = JSON.stringify([connection.context.easyOrigin, connection.context.operatorId])
    browserDownloads.revokeOtherOwners(owner)
    if (legacyStreamsUsed) streamDownloads.revokeOtherOwners(owner)
  } else if (['expired', 'unauthenticated'].includes(connection.context.sessionStatus)) {
    browserDownloads.revokeOtherOwners('')
    if (legacyStreamsUsed) streamDownloads.revokeOtherOwners('')
  }
}

let warming: Promise<void> | null = null
let warmedAt = 0

const reinjected = new Map<number,Promise<void>>()

async function sendToTab(tabId: number, message: AppMessage): Promise<unknown> {
  const version=connection.context.connectionVersion
  try {
    return await chrome.tabs.sendMessage(tabId, message)
  } catch (error) {
    if (message.type === MessageType.SubmitLimitMail || message.type === MessageType.SubmitFileManage) throw error
    const text = error instanceof Error ? error.message : String(error)
    if (!/Receiving end does not exist|Could not establish connection/i.test(text) || !chrome.scripting?.executeScript) throw error
    let injection=reinjected.get(tabId)
    if(!injection){injection=chrome.scripting.executeScript({target:{tabId},files:['content.js']}).then(()=>{});reinjected.set(tabId,injection)}
    try{await injection}finally{if(reinjected.get(tabId)===injection)reinjected.delete(tabId)}
    if(connection.context.connectionVersion!==version)throw new Error('重连期间账号或页面已变化，请按当前账号重新发起操作。')
    return chrome.tabs.sendMessage(tabId, message)
  }
}

const host: WorkspaceHost = {
  connection,
  area: chrome.storage.local,
  tasks,
  evidence,
  queryTabs: () => chrome.tabs.query({}),
  getTab: (tabId) => chrome.tabs.get(tabId),
  createTab: async (url) => { await chrome.tabs.create({ url, active: true }) },
  focusTab: async (tabId, windowId) => {
    await chrome.tabs.update(tabId, { active: true })
    if (windowId != null) await chrome.windows.update(windowId, { focused: true })
  },
  openApp: async () => {
    const appUrl = chrome.runtime.getURL('app.html')
    const tabs = await chrome.tabs.query({})
    // eslint-disable-next-line @typescript-eslint/unbound-method -- 存量豁免：保留原型方法引用
    return openWorkspaceTab(tabs, appUrl, host.focusTab, async () => {
      const created = await chrome.tabs.create({ url: appUrl, active: true })
      if (created.id == null) throw new Error('没有打开工作台。')
      return created.id
    })
  },
  sendToTab,
  persist: persistConnection
}

function alignToMode(): void {
  connection.retarget(preferredModeOrigin(customerMode(),connection.context.easyOrigin))
  const tabId = connection.context.easyTabId
  if (tabId != null && !originMatchesMode(connection.context.easyOrigin)) connection.detach(tabId)
}

function warmEasySession(): Promise<void> {
  if (!connectionRestored) return connectionReady
  if (warming) return warming
  if (connection.context.sessionStatus === 'authenticated' && Date.now() - warmedAt < 1500) return Promise.resolve()
  warming = resumeEasySession(host).finally(() => {
    warming = null
    warmedAt = Date.now()
  })
  return warming
}

/** 先把上次的标签页捡回来，再向页面重读登录。这条完成前不回答工作台，避免把空连接当成没登录。 */
const connectionReady = (async () => {
  try {
    await hydrateCustomerMode()
    const stored = await chrome.storage.local.get(CONNECTION_SNAPSHOT)
    connection.restoreCandidate(stored[CONNECTION_SNAPSHOT])
    alignToMode()
    persistedSnapshot = connection.snapshot()
  } catch { /* 没有存过连接 */ }
  connectionRestored = true
  await warmEasySession()
})()

chrome.tabs.onRemoved.addListener((tabId) => {
  streamDownloads.cancelTab(tabId)
  browserDownloads.cancelTab(tabId); documentDownloads.cancelTab(tabId)
  reinjected.delete(tabId)
  connection.detach(tabId)
  persistConnection()
})
// tabs.loading也会因EASY内部mframe加载而出现；只有真正顶层导航才销毁来源文档。
chrome.webNavigation?.onBeforeNavigate.addListener(({ tabId, frameId,url }) => {
  if (frameId === 0) {
    streamDownloads.cancelTab(tabId); browserDownloads.cancelTab(tabId); documentDownloads.cancelTab(tabId)
    reinjected.delete(tabId)
    connection.observeNavigation(tabId,url)
    if(connection.context.easyTabId===tabId&&!originMatchesMode(connection.context.easyOrigin))connection.detach(tabId)
    persistConnection()
  }
})
let sessionReadTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSessionRead(tabId: number): void {
  if (sessionReadTimer != null) clearTimeout(sessionReadTimer)
  sessionReadTimer = setTimeout(() => {
    sessionReadTimer = undefined
    if (connection.context.easyTabId !== tabId || connection.context.sessionStatus === 'authenticated') return
    void recheckBoundSession(host).finally(() => persistConnection())
  }, 400)
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url && tabOrigin(info.url)!==connection.context.easyOrigin) {
    connection.observeNavigation(tabId, info.url ?? tab.url)
    if (connection.context.easyTabId === tabId && !originMatchesMode(connection.context.easyOrigin)) {
      connection.detach(tabId)
      connection.context = { ...connection.context, message: '这个页面不属于当前客户系统。' }
    }
    persistConnection()
  }
  if (connection.context.easyTabId === tabId && connection.context.sessionStatus === 'pending') {
    scheduleSessionRead(tabId)
  }
  const opened = tabOrigin(info.url ?? tab.url)
  if (opened && originMatchesMode(opened) && connection.context.sessionStatus !== 'authenticated') {
    void warmEasySession()
  }
})
watchCustomerMode(() => {
  alignToMode()
  persistConnection()
  void warmEasySession()
})
chrome.action.onClicked.addListener(() => { void host.openApp() })

function formatInvalidMessage(message: unknown): BackgroundResponse {
  const type = message && typeof message === 'object' && 'type' in message ? String((message as { type?: unknown }).type) : '未知'
  const inner = message && typeof message === 'object' && 'payload' in message
    && (message as { payload?: { action?: unknown; message?: { type?: unknown } } }).payload?.action === 'forward'
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 存量豁免：外部数据宽松 String() 兜底，保留既有校验行为
    ? String((message as { payload?: { message?: { type?: unknown } } }).payload?.message?.type ?? '')
    : ''
  const envelope = isRecord(message) && isRecord(message.payload) ? message.payload : undefined
  const downloadPayload = type === MessageType.DownloadFiles ? envelope
    : inner === MessageType.DownloadFiles && isRecord(envelope?.message) ? envelope.message.payload : undefined
  if (type === MessageType.DownloadFiles || inner === MessageType.DownloadFiles) {
    const issue = downloadFilesRequestIssue(downloadPayload)
    if (issue) return { type: MessageType.Error, payload: { message: `下载尚未启动：${issue}` } }
  }
  return { type: MessageType.Error, payload: { message: `后台没有接住${inner ? `转发 ${inner}` : type}。请在扩展管理页重新加载后再试。` } }
}

const messageRegistry = createBackgroundMessageRegistry({
  extensionId: chrome.runtime.id,
  extensionOrigin: chrome.runtime.getURL(''),
  connectionReady,
  getConnectionContext: () => connection.context,
  warmEasySession,
  recheckBoundSession: () => recheckBoundSession(host),
  agentChat: payload => handleAgentChat(payload, host),
  workspace: message => handleWorkspaceMessage(message, host),
  saveDownload: async payload => {
    const downloads = chrome.downloads
    if (!downloads?.download) {
      return { type: MessageType.Error, payload: { message: '扩展缺「下载」权限：到 chrome://extensions 给 PatMail 点一次「重新加载」后再试。' } }
    }
    try {
      const options: chrome.downloads.DownloadOptions = payload.fileName
        ? { url: payload.url, filename: payload.fileName, saveAs: false }
        : { url: payload.url, saveAs: false }
      const downloadId = await downloads.download(options)
      return { type: MessageType.SaveDownloadResult, payload: { ok: true, fileName: payload.fileName, downloadId } }
    } catch (error: unknown) {
      return { type: MessageType.Error, payload: { message: error instanceof Error ? error.message : '浏览器没有接住这次下载。' } }
    }
  },
  queryDownloadState: async downloadId => {
    const downloads = chrome.downloads
    if (!downloads?.search) {
      return { type: MessageType.Error, payload: { message: '扩展缺「下载」权限，读不到下载状态。' } }
    }
    try {
      const items = await downloads.search({ id: downloadId })
      const item = items[0]
      if (!item) return { type: MessageType.Error, payload: { message: '没有在浏览器下载记录里找到这个任务。' } }
      const receivedBytes = Number.isSafeInteger(item.bytesReceived) && item.bytesReceived >= 0 ? item.bytesReceived : 0
      const totalBytes = Number.isSafeInteger(item.totalBytes) && item.totalBytes > 0 ? item.totalBytes : null
      const state = item.state === 'complete' ? 'complete' : item.state === 'interrupted' ? 'interrupted' : 'inProgress'
      const fileName = state === 'complete' ? browserDownloadName(item.filename) : undefined
      return {
        type: MessageType.DownloadStateResult,
        payload: { ok: true, state, receivedBytes, totalBytes, ...(fileName ? { fileName } : {}), ...(item.error ? { error: String(item.error).slice(0, 200) } : {}) }
      }
    } catch (error: unknown) {
      return { type: MessageType.Error, payload: { message: error instanceof Error ? error.message : '浏览器没有回报下载状态。' } }
    }
  },
  notifyTabPause: async (tabId: number, message: AppMessage) => { await chrome.tabs.sendMessage(tabId, message) },
  streamDownloads,
  browserDownloads,
  markLegacyStreamsUsed: () => { legacyStreamsUsed = true },
  scopeExtensionPageMessage,
  handleAuthority: (scoped, ctx) => handleAuthorityMessage(scoped, {
    ledger,
    tasks,
    evidence,
    account: {
      easyOrigin: ctx.easyOrigin,
      operatorId: ctx.operatorId,
      ...(ctx.easyTabId == null ? {} : { easyTabId: ctx.easyTabId, connectionVersion: ctx.connectionVersion })
    }
  }),
  handleRecovery: handleRecoveryMessage,
  handleDocumentExport: (message, sender) => handleDocumentExport(message, sender, documentDownloads),
  handleHagueHttp,
  handleHagueDraft: handleHagueDraftMessage,
  handleHagueSession: handleHagueSessionMessage,
  handleJihua: handleJihuaMessage,
  handleEasyPageWorld: (message, sender) => handleEasyPageWorld(message, sender, {
    extensionId: chrome.runtime.id,
    allowsOrigin: origin => Boolean(trustedOrigin(origin)) && originMatchesMode(origin),
    executeScript: injection => chrome.scripting.executeScript(injection)
  })
})

/** 页面和后台用长连接。查询过程中还会调用 EASY 页面，不能占用一次性消息口。 */
async function dispatchExtensionMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<BackgroundResponse> {
  await connectionReady
  prepareForwardedSearch(message)
  if (!isMessage(message)) return formatInvalidMessage(message)
  return messageRegistry.dispatchAppMessage(message, sender)
}

function publish(response: BackgroundResponse, requestId: string | null, sendResponse: (value: BackgroundResponse) => void): void {
  try { sendResponse(response) } catch { /* 原来的消息口已经关掉 */ }
  if (!requestId) return
  try {
    chrome.runtime.sendMessage({ channel: RESULT_CHANNEL, id: requestId, body: response }, () => {
      void chrome.runtime.lastError
    })
  } catch { /* 页面已经离开 */ }
}

/** 每 20 秒碰一次扩展接口，空闲计时就不会到 30 秒。知易通或工作台还开着时，后台不会被睡过去。 */
const HEARTBEAT_MS = 20_000
function beat(): void {
  void chrome.runtime.getPlatformInfo()
}
beat()
void keepHagueSessionAlive()
setInterval(beat, HEARTBEAT_MS)
if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name !== 'patmail-keepalive') return
    beat()
    void keepHagueSessionAlive()
    if (connection.context.sessionStatus === 'authenticated') {
      if (!hasActiveForwards(host)) void recheckBoundSession(host).finally(() => persistConnection())
    } else {
      void warmEasySession()
    }
  })
  const created = chrome.alarms.create('patmail-keepalive', { periodInMinutes: 0.5 })
  void Promise.resolve(created).catch(() => {
    void chrome.alarms.create('patmail-keepalive', { periodInMinutes: 1 })
  })
}

/** 工作台停靠栏连着这条端口时，服务工作线程不会在等模型的空档里被回收。 */
let agentPorts = 0
chrome.runtime.onConnect.addListener(port => {
  if (port.sender?.id !== chrome.runtime.id) {
    port.disconnect()
    return
  }
  if (port.name === 'patmail-page') {
    port.onMessage.addListener(() => { /* 页面心跳，重置空闲计时 */ })
    void connectionReady.then(() => warmEasySession())
    port.onDisconnect.addListener(() => { void chrome.runtime.lastError })
    return
  }
  if (port.name !== 'patmail-agent') {
    port.disconnect()
    return
  }
  agentPorts += 1
  port.onMessage.addListener(() => { /* 停靠栏心跳 */ })
  port.onDisconnect.addListener(() => {
    agentPorts = Math.max(0, agentPorts - 1)
    if (agentPorts === 0) deliverAgentAnswer('跳过')
    void chrome.runtime.lastError
  })
})

/** MV3 Service Worker 是租约、任务和证据的唯一写入方。 */
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const routed = messageRegistry.dispatchChannel(message, sender, sendResponse)
  if (routed === 'ignored') return
  if (routed === 'handled') return true
  const requestId = isRecord(message) && message.channel === CALL_CHANNEL && typeof message.id === 'string' && message.id.length > 0 && message.id.length <= 80
    ? message.id : null
  const payload = requestId && isRecord(message) ? message.message : message
  void dispatchExtensionMessage(payload, sender).then(
    response => publish(response, requestId, sendResponse),
    (error: unknown) => publish({
      type: MessageType.Error,
      payload: { message: error instanceof Error ? error.message : '后台没有完成。' }
    }, requestId, sendResponse)
  )
  return true
})
