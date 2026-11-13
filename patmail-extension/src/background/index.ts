import { DOCUMENT_EXPORT_CHANNEL } from '../shared/document-export'
import { handleDocumentExport } from './document-export'
import { handleHagueSessionMessage, keepHagueSessionAlive } from './hague-session'
import { handleHagueDraftMessage } from './hague-draft'
import { HAGUE_DRAFT_CHANNEL } from '../hague/draft-contract'
import { HAGUE_HTTP_CHANNEL, handleHagueHttp } from './hague-http'
import { HAGUE_SESSION_CHANNEL } from '../hague/session-contract'
import { indexedTransactionStore, ExecutionLedger } from '../automation/ledger'
import { IndexedTaskStore } from '../automation/indexed-store'
import { IndexedEvidenceStore, MemoryEvidenceStore } from '../automation/evidence-store'
import { handleAuthorityMessage } from './authority'
import { deliverAgentAnswer, handleAgentChat } from './agent'
import { scopeExtensionPageMessage } from './scope'
import { EasyConnectionController, sameConnectionSnapshot, tabOrigin, type ConnectionSnapshot } from '../shared/connection'
import { handleWorkspaceMessage, openWorkspaceTab, recheckBoundSession, resumeEasySession, type WorkspaceHost } from './workspace'
import { isRecord } from '../shared/guards'
import { prepareForwardedSearch } from '../api/message-guards'
import { downloadFilesRequestIssue, isMessage, MessageType, type AppMessage, type BackgroundResponse } from '../shared/message'
import { prepareApiDocs } from '../agent/rag-store'
import { hydrateWriteSwitch, watchWriteSwitch } from '../settings/write-switch'
import { customerMode, hydrateCustomerMode, modeOrigin, originMatchesMode, watchCustomerMode } from '../settings/customer-mode'
import { DOWNLOAD_PROGRESS_CHANNEL, DOWNLOAD_RESULT_CHANNEL } from '../shared/download-progress'
import { LocalStreamDownloads } from './stream-download'
import { trustedOrigin } from '../api/config'
import { handleRecoveryMessage } from './recovery'
import { BrowserStreamDownloads } from './browser-download'
import { createBrowserDownloadStore } from '../browser-download/store'
import { BROWSER_FILE_CHANNEL, type BrowserFileReply } from '../browser-download/types'
import { createNativeDownloadTarget, type NativeFetchEvent } from './native-download-target'
import { NATIVE_NAVIGATION_CHANNEL } from '../browser-download/native-navigation'
import { EASY_PAGE_WORLD_CHANNEL } from '../shared/easy-page-world'
import { handleEasyPageWorld } from './easy-page-world'
import { handleJihuaMessage, JIHUA_CHANNEL } from './jihua-page-world'

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
const browserDownloads = new BrowserStreamDownloads(createBrowserDownloadStore(), nativeTarget.host, nativeTarget.status)
const documentDownloads = new BrowserStreamDownloads(createBrowserDownloadStore(), request => nativeTarget.host(request), targetId => nativeTarget.status(targetId))

watchWriteSwitch()
// 扩展 Service Worker 不能用顶层 await，否则 Chrome 直接拒绝启动，工具栏点击没有监听。
void hydrateWriteSwitch()
void hydrateCustomerMode()
void prepareApiDocs()

const CALL_CHANNEL = 'patmail-call'
const RESULT_CHANNEL = 'patmail-result'

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

const reinjected = new Set<number>()

async function sendToTab(tabId: number, message: AppMessage): Promise<unknown> {
  try {
    return await chrome.tabs.sendMessage(tabId, message)
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    if (reinjected.has(tabId) || !/Receiving end does not exist|Could not establish connection/i.test(text) || !chrome.scripting?.executeScript) throw error
    reinjected.add(tabId)
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
    return chrome.tabs.sendMessage(tabId, message)
  }
}

const host: WorkspaceHost = {
  connection,
  area: chrome.storage.local as unknown as WorkspaceHost['area'],
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
  connection.retarget(modeOrigin(customerMode()))
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
chrome.webNavigation?.onBeforeNavigate.addListener(({ tabId, frameId }) => {
  if (frameId === 0) { streamDownloads.cancelTab(tabId); browserDownloads.cancelTab(tabId); documentDownloads.cancelTab(tabId) }
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
  if (info.url || info.status === 'loading') {
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

function fromExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''))
}

const WRITES = new Set<string>([
  MessageType.SaveTask, MessageType.ClaimExecution, MessageType.MarkExecutionPrepared,
  MessageType.MarkExecutionSent, MessageType.MarkExecutionResponse, MessageType.MarkExecutionVerified,
  MessageType.CompleteExecution, MessageType.ReleaseExecution, MessageType.MarkExecutionUnknown,
  MessageType.ArchiveTask
])
const READS = new Set<string>([
  MessageType.ListTasks, MessageType.GetTask, MessageType.ListAcceptance,
  MessageType.ValidateTaskMetadata, MessageType.RecoverExecution
])

/** 页面和后台用长连接。查询过程中还会调用 EASY 页面，不能占用一次性消息口。 */
async function dispatchExtensionMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<BackgroundResponse> {
  await connectionReady
  prepareForwardedSearch(message)
  if (!isMessage(message)) {
    const type = message && typeof message === 'object' && 'type' in message ? String((message as { type?: unknown }).type) : '未知'
    const inner = message && typeof message === 'object' && 'payload' in message
      && (message as { payload?: { action?: unknown; message?: { type?: unknown } } }).payload?.action === 'forward'
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
  if (message.type === MessageType.Ping) {
    if (connection.context.sessionStatus !== 'authenticated') void warmEasySession()
    return { type: MessageType.Pong, payload: { ok: true } }
  }
  if (message.type === MessageType.AgentChat) {
    const pageUrl = sender.url ?? sender.tab?.url ?? ''
    if (!pageUrl.startsWith(chrome.runtime.getURL(''))) {
      return { type: MessageType.Error, payload: { message: '只有工作台页面可以调用 AI 助手。' } }
    }
    return { type: MessageType.AgentChatResult, payload: await handleAgentChat(message.payload, host) }
  }
  if (message.type === MessageType.RunReadonlyAcceptance) {
    return { type: MessageType.Error, payload: { message: '后台没有处理这条消息。' } }
  }
  if (message.type === MessageType.Workspace) {
    try {
      return await handleWorkspaceMessage(message, host)
    } catch (error: unknown) {
      return { type: MessageType.Error, payload: { message: error instanceof Error ? error.message : '后台没有完成转发。' } }
    }
  }
  /** 打包下载的压缩包由浏览器直接落盘：走 chrome.downloads 才会在下载记录里留下条目，文件名也听插件的。 */
  if (message.type === MessageType.SaveDownload) {
    const downloads = chrome.downloads
    if (!downloads?.download) {
      return { type: MessageType.Error, payload: { message: '扩展缺「下载」权限：到 chrome://extensions 给 PatMail 点一次「重新加载」后再试。' } }
    }
    try {
      const downloadId = await downloads.download({ url: message.payload.url, filename: message.payload.fileName, saveAs: false })
      return { type: MessageType.SaveDownloadResult, payload: { ok: true, fileName: message.payload.fileName, downloadId } }
    } catch (error: unknown) {
      return { type: MessageType.Error, payload: { message: error instanceof Error ? error.message : '浏览器没有接住这次下载。' } }
    }
  }
  if (message.type === MessageType.StreamDownload || message.type === MessageType.BrowserStreamDownload) {
    const tabId = sender.tab?.id
    if (tabId === undefined || !trustedOrigin(sender.url ?? sender.tab?.url ?? '')) {
      return { type: MessageType.Error, payload: { message: '只有已连接的EASY来源页可以写入下载流。' } }
    }
    try {
      if (message.payload.action === 'start') {
        await connectionReady
        await recheckBoundSession(host)
        if (connection.context.easyTabId !== tabId || connection.context.sessionStatus !== 'authenticated' || !connection.context.operatorId) {
          return { type: MessageType.Error, payload: { message: '请先重新确认同一EASY账号，再继续下载。' } }
        }
      }
      if (message.type === MessageType.StreamDownload) legacyStreamsUsed = true
      const downloads = message.type === MessageType.BrowserStreamDownload ? browserDownloads : streamDownloads
      return { type: MessageType.StreamDownloadResult, payload: await downloads.command(message.payload, tabId,
        JSON.stringify([connection.context.easyOrigin, connection.context.operatorId])) }
    } catch (error) {
      return { type: MessageType.Error, payload: { message: error instanceof Error ? error.message : '下载流桥接失败。' } }
    }
  }
  if (message.type === MessageType.DiscardDownload) {
    await connectionReady
    const contentOwner = sender.tab?.id === connection.context.easyTabId && trustedOrigin(sender.url ?? '') === connection.context.easyOrigin
    if ((!fromExtensionPage(sender) && !contentOwner) || connection.context.sessionStatus !== 'authenticated' || !connection.context.operatorId) {
      return { type: MessageType.Error, payload: { message: '请先连接原任务的EASY账号，再丢弃下载。' } }
    }
    const downloads = message.payload.backend === 'browser' ? browserDownloads : streamDownloads
    await downloads.discardTask(message.payload.taskId, JSON.stringify([connection.context.easyOrigin, connection.context.operatorId]))
    return { type: MessageType.DiscardDownloadResult, payload: { ok: true } }
  }
  if (message.type === MessageType.PauseDownload) {
    await connectionReady
    const context = connection.context
    const contentOwner = sender.tab?.id === context.easyTabId && trustedOrigin(sender.url ?? '') === context.easyOrigin
    const owner = context.operatorId || context.lastOperatorId
    if ((!fromExtensionPage(sender) && !contentOwner) || !owner) return { type: MessageType.Error, payload: { message: '下载任务账号范围无法确认。' } }
    const downloads = message.payload.backend === 'browser' ? browserDownloads : streamDownloads
    const tabs = await downloads.pauseTask(message.payload.taskId, JSON.stringify([context.easyOrigin, owner]))
    if (context.easyTabId != null) tabs.push(context.easyTabId)
    await Promise.all([...new Set(tabs)].map(id => chrome.tabs.sendMessage(id, message).catch(() => {})))
    return { type: MessageType.PauseDownloadResult, payload: { ok: true } }
  }
  /** 浏览器下载进度由内容脚本回读：后台只做一次状态查询，下载再多分钟也不占后台定时器。 */
  if (message.type === MessageType.DownloadState) {
    const downloads = chrome.downloads
    if (!downloads?.search) {
      return { type: MessageType.Error, payload: { message: '扩展缺「下载」权限，读不到下载状态。' } }
    }
    try {
      const items = await downloads.search({ id: message.payload.downloadId })
      const item = items[0]
      // 任务已经不在下载记录里（被清掉或还没建出来）：明确报错，让调用方按读不到处理，不能假装还在传。
      if (!item) return { type: MessageType.Error, payload: { message: '没有在浏览器下载记录里找到这个任务。' } }
      const receivedBytes = Number.isSafeInteger(item.bytesReceived) && item.bytesReceived >= 0 ? item.bytesReceived : 0
      const totalBytes = Number.isSafeInteger(item.totalBytes) && item.totalBytes > 0 ? item.totalBytes : null
      const state = item.state === 'complete' ? 'complete' : item.state === 'interrupted' ? 'interrupted' : 'inProgress'
      return {
        type: MessageType.DownloadStateResult,
        payload: { ok: true, state, receivedBytes, totalBytes, ...(item.error ? { error: String(item.error).slice(0, 200) } : {}) }
      }
    } catch (error: unknown) {
      return { type: MessageType.Error, payload: { message: error instanceof Error ? error.message : '浏览器没有回报下载状态。' } }
    }
  }
  let scoped: AppMessage = message
  const accountScoped = WRITES.has(message.type) || READS.has(message.type)
  if (accountScoped || fromExtensionPage(sender)) {
    if (accountScoped) {
      const gate = await recheckBoundSession(host)
      if (WRITES.has(message.type) && gate !== 'same') {
        return { type: MessageType.Error, payload: { message: '会话已变化，请重新读取后再保存。' } }
      }
    }
    const next = scopeExtensionPageMessage(message, connection.context)
    if ('error' in next) return { type: MessageType.Error, payload: { message: next.error } }
    scoped = next
  }
  const response = await handleAuthorityMessage(scoped, {
    ledger,
    tasks,
    evidence,
    account: {
      easyOrigin: connection.context.easyOrigin,
      operatorId: connection.context.operatorId,
      ...(connection.context.easyTabId == null ? {} : { easyTabId: connection.context.easyTabId, connectionVersion: connection.context.connectionVersion })
    }
  })
  return response ?? { type: MessageType.Error, payload: { message: '后台没有处理这条消息。' } }
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
    if (connection.context.sessionStatus === 'authenticated') void recheckBoundSession(host).finally(() => persistConnection())
    else void warmEasySession()
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
  if (isRecord(message) && (message.channel === BROWSER_FILE_CHANNEL || message.channel === NATIVE_NAVIGATION_CHANNEL)) return
  if (handleRecoveryMessage(message, sender, sendResponse, connection.context)) return true
  if (sender.id !== chrome.runtime.id) return
  if (isRecord(message) && message.channel === DOCUMENT_EXPORT_CHANNEL) {
    void handleDocumentExport(message, sender, documentDownloads).then(sendResponse)
    return true
  }
  if (isRecord(message) && message.channel === HAGUE_HTTP_CHANNEL) {
    void handleHagueHttp(message,sender).then(sendResponse,()=>sendResponse({ok:false,error:'海牙接口结果待核对。'}))
    return true
  }
  if (isRecord(message) && message.channel === HAGUE_DRAFT_CHANNEL) {
    void handleHagueDraftMessage(message, sender).then(sendResponse, () => sendResponse({ ok:false, error:'eHague 草稿操作结果不确定，请检查原站。' }))
    return true
  }
  if (isRecord(message) && message.channel === HAGUE_SESSION_CHANNEL) {
    void handleHagueSessionMessage(message, sender).then(sendResponse, () => sendResponse({ ok: false, error: 'eHague 登录态验证失败，请重新检测。' }))
    return true
  }
  if (isRecord(message) && message.channel === JIHUA_CHANNEL) {
    void handleJihuaMessage(message, sender).then(sendResponse, (error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message.slice(0, 500) : '季华页面没有完成操作。' }))
    return true
  }
  if (isRecord(message) && message.channel === EASY_PAGE_WORLD_CHANNEL) {
    void connectionReady.then(() => handleEasyPageWorld(message, sender, {
      extensionId: chrome.runtime.id,
      allowsOrigin: origin => Boolean(trustedOrigin(origin)) && originMatchesMode(origin),
      executeScript: injection => chrome.scripting.executeScript(injection)
    })).then(sendResponse, () => sendResponse({ ok: false, message: '原网站页面没有完成操作。' }))
    return true
  }
  if (isRecord(message) && message.channel === RESULT_CHANNEL) return
  if (isRecord(message) && message.channel === DOWNLOAD_PROGRESS_CHANNEL) return
  if (isRecord(message) && message.channel === DOWNLOAD_RESULT_CHANNEL) return
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
