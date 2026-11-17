import { hagueReadResponse } from '../hague/read-error'
import { isContentRequest, MessageType, type ContentResponse, type FileSearchFormField, type MessageBridge, type QuerySurfaceEntry } from '../shared/message'
import { surfaceIdFromMenuUrl } from '../customer/query-surfaces'
import type { ProcessOpenTarget } from '../api/mail-process'
import { sendToBackground } from '../utils/runtime'
import { watchBrowserDownload } from '../utils/download-outcome'
import { nativeStreamArchive, pauseNativeDownload } from '../utils/stream-download'
import { templateArchiveName } from '../api/file-download'
import { runWithDownloadRecovery } from '../api/download-failure'
import { injectPanel } from './injector'
import { startArchiveDownload } from './save-file'
import { DOWNLOAD_PROGRESS_CHANNEL, DOWNLOAD_RESULT_CHANNEL, type FileDownloadProgress } from '../shared/download-progress'
import { readPageInfo, scanPage } from './scanner'
import { EasyRuntime } from '../api/client'
import { scanFileSearchForm } from '../query/scan-file-search-form.mjs'
import { scanFilingForm, waitFilingFormOptions } from '../query/scan-filing-form.mjs'
import { LiveEasyAcceptanceRunner } from '../automation/acceptance-runner'
import { hydrateCustomerMode, watchCustomerMode } from '../settings/customer-mode'
import { hydrateWriteSwitch, watchWriteSwitch } from '../settings/write-switch'
import { openEasyPageTab, readEasyPageMenu } from './easy-page-world'

watchWriteSwitch()
void hydrateWriteSwitch()
watchCustomerMode()
void hydrateCustomerMode()

// API 请求始终由目标页面同源的 Content Script 发起，沿用浏览器已有会话。
const easyRuntime = new EasyRuntime(location.origin)

/** 结果提示要进消息校验（200 字内）：打包提示和下载状态拼一起后统一截断。 */
function noticeOf(packing: string, tail: string): string {
  return [packing.trim(), tail.trim()].filter(Boolean).join(' ').slice(0, 200)
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} 字节` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function hasSearchTable(doc: Document): boolean {
  return Boolean(doc.querySelector('#table_element'))
}

async function waitForCaseTypes(doc: Document): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 8000) {
    const select = doc.querySelector('#case_type')
    if (select && select.querySelectorAll('option').length > 1) return
    await new Promise(resolve => window.setTimeout(resolve, 300))
  }
}

async function waitForSelectOptions(doc: Document, id: string): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 2500) {
    const select = doc.querySelector(`#${id}`)
    if (!(select instanceof HTMLSelectElement)) return
    if (select.options.length > 1) return
    await new Promise(resolve => window.setTimeout(resolve, 200))
  }
}

async function scanDocument(doc: Document): Promise<FileSearchFormField[]> {
  await waitForCaseTypes(doc)
  await waitForSelectOptions(doc, 'filetemp')
  return scanFileSearchForm(doc).fields
}

function openEasyTab(tabId: string, title: string, path: string): Promise<{ ok: boolean; message: string }> {
  return openEasyPageTab(tabId, title, path)
}

async function openProcessForm(target: ProcessOpenTarget): Promise<{ ok: boolean; message: string }> {
  const resolved = await easyRuntime.resolveProcessForm(target)
  if (!resolved.ok) return { ok: false, message: resolved.error.message.slice(0, 200) }
  return openEasyTab(`f_${target.id}`, target.title, resolved.data)
}

/** `_UserMenu` 属于 EASY 页面主世界；由后台在发起消息的文档中读取。 */
function readUserMenu(): Promise<Array<{ name: string; url: string }>> {
  return readEasyPageMenu()
}

/** 查询入口跟着原网站菜单走：菜单上有哪几项、叫什么名字，下拉里就出哪几项。 */
async function readQuerySurfaces(): Promise<{ surfaces: QuerySurfaceEntry[] }> {
  const entries = await readUserMenu()
  const surfaces: QuerySurfaceEntry[] = []
  for (const entry of entries) {
    const id = surfaceIdFromMenuUrl(entry.url)
    if (!id || surfaces.some(item => item.id === id)) continue
    surfaces.push({ id, label: entry.name, url: entry.url })
  }
  return { surfaces }
}

async function readFileSearchForm(): Promise<FileSearchFormField[]> {
  if (hasSearchTable(document)) return scanDocument(document)
  const frame = document.querySelector('iframe#mframe')
  if (frame instanceof HTMLIFrameElement) {
    const current = frame.contentDocument
    if (!current || !hasSearchTable(current)) {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('文件查询页没有打开')), 20000)
        frame.addEventListener('load', () => { window.clearTimeout(timer); resolve() }, { once: true })
        frame.src = '/Forms/Patent/FileSearch.aspx'
      })
    }
    const doc = frame.contentDocument
    if (doc && hasSearchTable(doc)) return scanDocument(doc)
  }
  return scanFileSearchForm(document).fields
}

/** 递交查询条件在 `Forms/NewFiling/Finished.aspx`，可能开在同源 iframe 里，个别入口还套一层。 */
function hasFilingForm(doc: Document): boolean {
  return Boolean(doc.querySelector('#audit_type, #is_paper_notice, #flow_direction'))
}

function findFilingDoc(doc: Document, depth: number): Document | null {
  if (hasFilingForm(doc)) return doc
  if (depth >= 3) return null
  for (const frame of Array.from(doc.querySelectorAll('iframe, frame'))) {
    if (!(frame instanceof HTMLIFrameElement || frame instanceof HTMLFrameElement)) continue
    if (frame.closest('patmail-root')) continue
    try {
      const inner = frame.contentDocument
      const hit = inner ? findFilingDoc(inner, depth + 1) : null
      if (hit) return hit
    } catch {
      // 跨域 iframe 不读
    }
  }
  return null
}

/** 递交查询页没开时把它载进主框架再扫，和文件查询一致；这样下拉能实时读到，不依赖用户先开页面。 */
async function readFilingForm(): Promise<FileSearchFormField[]> {
  const found = findFilingDoc(document, 0)
  if (found) {
    await waitFilingFormOptions(found)
    return scanFilingForm(found).fields
  }
  const frame = document.querySelector('iframe#mframe')
  if (frame instanceof HTMLIFrameElement) {
    const current = frame.contentDocument
    if (!current || !hasFilingForm(current)) {
      await new Promise<void>(resolve => {
        const timer = window.setTimeout(() => resolve(), 20000)
        frame.addEventListener('load', () => { window.clearTimeout(timer); resolve() }, { once: true })
        frame.src = '/Forms/NewFiling/Finished.aspx'
      })
    }
    const doc = frame.contentDocument
    if (doc && hasFilingForm(doc)) {
      await waitFilingFormOptions(doc)
      return scanFilingForm(doc).fields
    }
  }
  return []
}

const bridge: MessageBridge = {
  async request(message, signal): Promise<ContentResponse> {
    switch (message.type) {
      case MessageType.ScanPage:
        return { type: MessageType.ScanResult, payload: scanPage(document) }
      case MessageType.GetPageInfo:
        return { type: MessageType.PageInfo, payload: readPageInfo(document) }
      case MessageType.ShowPanel:
        injectPanel(bridge)
        return { type: MessageType.PanelShown, payload: { ok: true } }
      case MessageType.Ping:
        return await sendToBackground(message) ?? {
          type: MessageType.Error, payload: { message: '后台连接已失效，请刷新网页。' }
        }
      case MessageType.CheckSession:
        return { type: MessageType.SessionResult, payload: await easyRuntime.checkSession() }
      case MessageType.CancelSessionCheck:
        easyRuntime.cancelSessionCheck()
        return { type: MessageType.SessionCheckCancelled, payload: { ok: true } }
      case MessageType.SearchFiles:
        return { type: MessageType.SearchFilesResult,
          payload: await easyRuntime.searchFiles(message.payload.query, message.payload.timeoutMs, message.payload.batch === true) }
      case MessageType.SearchLimitMonitor:
        return { type: MessageType.SearchLimitMonitorResult,
          payload: await easyRuntime.searchLimitMonitor(message.payload.query, message.payload.timeoutMs) }
      case MessageType.SearchFiling:
        return { type: MessageType.SearchFilingResult,
          payload: await easyRuntime.searchFiling(message.payload.query, message.payload.timeoutMs, message.payload.batch === true) }
      case MessageType.SearchFee:
        return { type: MessageType.SearchFeeResult,
          payload: await easyRuntime.searchFees(message.payload.query, message.payload.timeoutMs, message.payload.batch === true) }
      case MessageType.SearchFeeAmount:
        return { type: MessageType.SearchFeeAmountResult,
          payload: await easyRuntime.searchFeesAmount(message.payload.query, message.payload.timeoutMs) }
      case MessageType.SubmitLimitMail:
        return { type: MessageType.SubmitLimitMailResult,
          payload: await easyRuntime.submitLimitMails(message.payload.userId, message.payload.items) }
      case MessageType.SubmitFileManage:
        return { type: MessageType.SubmitFileManageResult,
          payload: await easyRuntime.submitFileManageMails(message.payload.items) }
      case MessageType.ResolveDownloadNames: {
        const named = await easyRuntime.resolveDownloadNames(message.payload.fileIds, message.payload.selection)
        return {
          type: MessageType.ResolveDownloadNamesResult,
          payload: named.ok ? { ok: true, data: { names: named.data } } : named
        }
      }
      case MessageType.DownloadFiles: {
        let failedFiles = 0
        let duplicateFiles = 0
        const report = (progress: FileDownloadProgress): void => {
          failedFiles = Math.max(failedFiles, progress.failed ?? 0)
          duplicateFiles = Math.max(duplicateFiles, progress.deduplicated ?? 0)
          if (!message.payload.progressId) return
          try {
            chrome.runtime.sendMessage({ channel: DOWNLOAD_PROGRESS_CHANNEL, id: message.payload.progressId, progress }, () => { void chrome.runtime.lastError })
          } catch { /* 工作台已离开或扩展已重载，不中断正在准备的下载 */ }
        }
        if (message.payload.stream) {
          const fileName = message.payload.archiveName ?? templateArchiveName()
          let streamTaskId = message.payload.taskId
          let recoveries = 0
          const startStream = () => nativeStreamArchive(fileName, (sink, signal, onWork, context) => easyRuntime.streamFiles(
            message.payload.items, message.payload.selection, message.payload.stripAppNoDot, sink, signal, onWork, { ...context, deduplicate: message.payload.deduplicate, resolvedNames: message.payload.resolvedNames, caseScopes: message.payload.caseScopes }
          ), report, { ...(streamTaskId ? { taskId: streamTaskId } : {}),
            ...(message.payload.browserTarget ? { backend: 'browser' as const, targetId: message.payload.browserTarget } : {}),
            ...(message.payload.saveAsNew ? { newCopy: true as const } : {}),
            onTaskId: (taskId: string) => { streamTaskId = taskId }, manifest: {
            items: message.payload.items, selection: message.payload.selection,
            stripAppNoDot: message.payload.stripAppNoDot, archiveName: fileName,
            ...(message.payload.deduplicate ? { deduplicate: true, caseScopes: message.payload.caseScopes } : {}),
            ...(message.payload.resolvedNames ? { resolvedNames: message.payload.resolvedNames } : {})
          } })
          try {
            // 凭据失效、会话波动、工作台暂离会打断传输，但本机持久缓存完好；
            // 同一任务自动续跑（等同工作台的「继续下载」），不让整批下载终止。
            const bytes = await runWithDownloadRecovery(startStream, { attempts: 3,
              onRetry: (attempt, error) => { recoveries = attempt; console.warn(`[PatMail] 流水下载中断，自动续跑 ${attempt}/3`, error) } })
            return { type: MessageType.DownloadFilesResult, payload: { ok: true, data: {
              fileName, fileCount: Math.max(1, message.payload.items.length - duplicateFiles), notice: `${message.payload.browserTarget ? '文件已保存' : '浏览器下载完成'}（${formatBytes(bytes)}）。${duplicateFiles ? `过滤 ${duplicateFiles} 个同案件同名旧文件。` : ''}${failedFiles ? `成功 ${message.payload.items.length - failedFiles - duplicateFiles} 个，跳过 ${failedFiles} 个不可用附件；详情见ZIP内下载失败清单。` : ''}${recoveries ? `中途自动续跑 ${recoveries} 次。` : ''}`
            } } }
          } catch (error) {
            console.warn('[PatMail] 流水下载失败', error)
            const reason = error instanceof Error ? error.message : '流水下载失败，压缩包未完成。'
            const hint = recoveries ? ` 已自动续跑 ${recoveries} 次仍未恢复；任务缓存已保留，可在工作台点「继续下载」。` : ''
            return { type: MessageType.DownloadFilesResult, payload: { ok: false, error: { code: 'BUSINESS_ERROR',
              message: (reason + hint).slice(0, 1200)
            } } }
          }
        }
        const downloaded = await easyRuntime.downloadFiles(message.payload.items, message.payload.selection, message.payload.stripAppNoDot, report)
        if (!downloaded.ok) return { type: MessageType.DownloadFilesResult, payload: downloaded }
        if (message.payload.archiveName) downloaded.data.fileName = message.payload.archiveName
        report({ phase: 'saving', done: 0, total: 1 })
        // 浏览器负责落盘：走后台的 chrome.downloads 才会在下载记录里留下条目，文件名也听插件的。
        const saved = await sendToBackground({
          type: MessageType.SaveDownload,
          payload: { url: downloaded.data.downloadUrl, fileName: downloaded.data.fileName, ...(message.payload.progressId ? { progressId: message.payload.progressId } : {}) }
        }, 30_000)
        if (saved?.type !== MessageType.SaveDownloadResult) {
          const reason = saved?.type === MessageType.Error ? saved.payload.message : '扩展后台没有接住这次下载。'
          // 兜底走原站的办法：隐藏 iframe 指到取包地址，浏览器照样下载并留记录，文件名以下载记录为准。
          startArchiveDownload(document, downloaded.data.downloadUrl)
          return {
            type: MessageType.DownloadFilesResult,
            payload: {
              ok: true,
              data: {
                fileName: downloaded.data.fileName,
                fileCount: downloaded.data.fileCount,
                notice: noticeOf(downloaded.data.notice, `另存走了浏览器直接下载，文件名以下载记录为准（${reason}）`)
              }
            }
          }
        }
        // 任务已交给浏览器后继续流式回报下载字节，直到完成或中断才定最终结果。
        const outcome = typeof saved.payload.downloadId === 'number'
          ? await watchBrowserDownload({
            downloadId: saved.payload.downloadId,
            poll: async id => {
              const state = await sendToBackground({ type: MessageType.DownloadState, payload: { downloadId: id } }, 15_000)
              return state?.type === MessageType.DownloadStateResult ? state.payload : null
            },
            onProgress: report
          })
          : null
        if (outcome?.state === 'interrupted') {
          return {
            type: MessageType.DownloadFilesResult,
            payload: {
              ok: false,
              error: { code: 'BUSINESS_ERROR', message: noticeOf('', `浏览器下载中断${outcome.error ? `（${outcome.error}）` : ''}，压缩包没有保存完整，请重新下载。`) }
            }
          }
        }
        return {
          type: MessageType.DownloadFilesResult,
          payload: {
            ok: true,
            data: {
              fileName: downloaded.data.fileName,
              fileCount: downloaded.data.fileCount,
              notice: noticeOf(downloaded.data.notice, outcome
                ? `浏览器下载完成（${formatBytes(outcome.receivedBytes)}）。`
                : '已交给浏览器下载，进度看浏览器右上角下载记录。')
            }
          }
        }
      }
      case MessageType.DiscardDownload:
        return await sendToBackground(message) as ContentResponse ?? { type: MessageType.Error, payload: { message: '本机下载任务没有响应。' } }
      case MessageType.PauseDownload:
        pauseNativeDownload(message.payload.taskId)
        return { type: MessageType.PauseDownloadResult, payload: { ok: true } }
      case MessageType.ExportCaseContacts:
        return { type: MessageType.ExportCaseContactsResult,
          payload: await easyRuntime.exportCaseContacts(message.payload.volumes) }
      case MessageType.ListMailProcesses:
        return { type: MessageType.ListMailProcessesResult,
          payload: await easyRuntime.listMailProcesses(message.payload.query) }
      case MessageType.OpenEasyForm:
        return { type: MessageType.OpenEasyFormResult, payload: await openProcessForm(message.payload.target) }
      case MessageType.ListFlowReviewers:
        return { type: MessageType.ListFlowReviewersResult,
          payload: await easyRuntime.listFlowReviewers() }
      case MessageType.ReadCaseDemands:
        return { type: MessageType.CaseDemandResult,
          payload: await easyRuntime.readCaseDemands(message.payload.caseId, signal) }
      case MessageType.ReadCaseBusFlow:
        return { type: MessageType.CaseBusFlowResult,
          payload: await easyRuntime.readCaseBusFlow(message.payload.caseId, message.payload.procId, signal) }
      case MessageType.LookupIcFlow:
        return { type: MessageType.LookupIcFlowResult,
          payload: await easyRuntime.lookupIcFlow(message.payload.rows) }
      case MessageType.CancelHagueRead:
        easyRuntime.cancelHagueRead(message.payload.batchId)
        return { type: MessageType.CancelHagueReadResult, payload: { cancelled: true } }
      case MessageType.ReadHagueCase:
        return hagueReadResponse(() => easyRuntime.readHagueCase(message.payload.caseVolume, message.payload.batchId))
      case MessageType.ReadCaseFields:
        return { type: MessageType.ReadCaseFieldsResult,
          payload: { text: await easyRuntime.readCaseFields(message.payload.caseVolume) } }
      case MessageType.ReadFilingFlow:
        return { type: MessageType.ReadFilingFlowResult,
          payload: await easyRuntime.filingFlowHistory(message.payload.filingId) }
      case MessageType.ReadUserInfo:
        return { type: MessageType.ReadUserInfoResult,
          payload: await easyRuntime.filingUserInfo(message.payload.userId) }
      case MessageType.ReadCustomerDemands:
        return { type: MessageType.CustomerDemandResult,
          payload: await easyRuntime.readCustomerDemands(message.payload.customerId, signal) }
      case MessageType.ReadCustomerDirectory:
        return { type: MessageType.CustomerDirectoryResult,
          payload: await easyRuntime.readCustomerDirectory(message.payload.customerId, signal) }
      case MessageType.ReadMailContacts:
        return { type: MessageType.MailContactResult,
          payload: await easyRuntime.readMailContacts(message.payload.mailId, message.payload.customerId, signal) }
      case MessageType.ReadMailAddresses:
        return { type: MessageType.MailAddressResult,
          payload: await easyRuntime.readMailAddresses(message.payload.mailId) }
      case MessageType.ListHistoryQueries:
        return { type: MessageType.HistoryQueriesResult,
          payload: await easyRuntime.listHistoryQueries(message.payload.force, signal, message.payload.surface ?? 'file') }
      case MessageType.GetHistoryQuery:
        return { type: MessageType.HistoryQueryResult,
          payload: await easyRuntime.getHistoryQuery(message.payload.queryId, signal, message.payload.surface ?? 'file') }
      case MessageType.SaveHistoryQuery:
        return { type: MessageType.HistoryQuerySaved,
          payload: await easyRuntime.saveHistoryQuery(message.payload.title, message.payload.queryId, message.payload.queryXml, signal, message.payload.surface === 'limit' ? 'limit' : 'file') }
      case MessageType.DeleteHistoryQuery:
        return { type: MessageType.HistoryQueryDeleted,
          payload: await easyRuntime.deleteHistoryQuery(message.payload.queryId, signal, message.payload.surface === 'limit' ? 'limit' : 'file') }
      case MessageType.SaveFileTempName:
        return { type: MessageType.FileTempNamesResult,
          payload: await easyRuntime.saveFileTempName(message.payload, signal) }
      case MessageType.DeleteFileTempName:
        return { type: MessageType.FileTempNamesResult,
          payload: await easyRuntime.deleteFileTempName(message.payload.tempId, signal) }
      case MessageType.ScanFileSearchForm:
        return { type: MessageType.FileSearchFormResult, payload: { fields: await readFileSearchForm() } }
      case MessageType.ScanFilingForm:
        return { type: MessageType.FilingFormResult, payload: { fields: await readFilingForm() } }
      case MessageType.ReadQuerySurfaces:
        return { type: MessageType.QuerySurfacesResult, payload: await readQuerySurfaces() }
      case MessageType.LoadDictionary:
        return { type: MessageType.DictionaryResult,
          payload: await easyRuntime.loadDictionary(message.payload, signal) }
      case MessageType.CreateEasyMail:
        return { type: MessageType.MailExecutionResult, payload: {
          view: message.payload.confirmed ? await easyRuntime.createEasyMail(message.payload.preview, message.payload.selection) : null
        } }
      case MessageType.SaveEasyMail:
        return { type: MessageType.MailExecutionResult, payload: {
          view: message.payload.confirmed ? await easyRuntime.saveEasyMail(message.payload.executionId, message.payload.preview, message.payload.selection, message.payload.acknowledgedDigest) : null
        } }
      case MessageType.FindMailExecution:
        return { type: MessageType.MailExecutionResult, payload: { view: await easyRuntime.findMailExecution(message.payload.fingerprint) } }
      case MessageType.InspectEasyMail:
        return { type: MessageType.MailExecutionResult, payload: { view: await easyRuntime.inspectEasyMail(message.payload.executionId) } }
      case MessageType.ReadWorkflow:
        return { type: MessageType.WorkflowResult, payload: { view: await easyRuntime.readWorkflow(message.payload.mailId, message.payload.flowType) } }
      case MessageType.RefreshWorkflow:
        return { type: MessageType.WorkflowResult, payload: { view: await easyRuntime.refreshWorkflow(message.payload.executionId) } }
      case MessageType.PreviewWorkflow:
        return { type: MessageType.WorkflowResult, payload: { view: await easyRuntime.previewWorkflow(message.payload.executionId, message.payload) } }
      case MessageType.RestoreWorkflow:
        return { type: MessageType.WorkflowResult, payload: { view: await easyRuntime.restoreWorkflow(message.payload.mailId) } }
      case MessageType.DiagnoseExistingMail:
        return { type: MessageType.ExistingMailDiagnostic, payload: await easyRuntime.diagnoseExistingMail(message.payload.mailId, message.payload.flowType) }
      case MessageType.CallEasy:
        return {
          type: MessageType.CallEasyResult,
          payload: { text: await easyRuntime.callDocumented(message.payload.handler, message.payload.call, message.payload.fields ?? {}) }
        }
      case MessageType.RunReadonlyAcceptance: {
        const probe = await easyRuntime.probeReadonly(message.payload.call, {
          caseTypeId: message.payload.caseTypeId,
          mailId: message.payload.mailId,
          flowType: message.payload.flowType
        })
        const runner = new LiveEasyAcceptanceRunner({ kind: 'live', call: () => Promise.resolve(probe) })
        const row = await runner.run({
          origin: location.origin,
          operatorId: '',
          call: message.payload.call,
          expected: message.payload.expected
        })
        return { type: MessageType.AcceptanceResult, payload: { records: [row as unknown as Record<string, unknown>], probe } }
      }
      case MessageType.CancelFileSearch:
        easyRuntime.cancelFileSearch()
        return { type: MessageType.FileSearchCancelled, payload: { ok: true } }
      case MessageType.CancelLimitMonitor:
        easyRuntime.cancelLimitMonitor()
        return { type: MessageType.FileSearchCancelled, payload: { ok: true } }
    }
  }
}

const pageWorld = globalThis as typeof globalThis & { __patmailContent?: boolean }
if (!pageWorld.__patmailContent) {
  pageWorld.__patmailContent = true

  // Popup 发给当前顶层页面；返回 true 保持异步响应通道存活。
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return
    if (!isContentRequest(message)) {
      const type = message && typeof message === 'object' && 'type' in message ? String((message as { type?: unknown }).type) : '未知'
      sendResponse({ type: MessageType.Error, payload: { message: `当前 EASY 页面脚本不认识 ${type}。请刷新这个 EASY 标签页。` } } satisfies ContentResponse)
      return
    }
    if (message.type === MessageType.DownloadFiles && message.payload.detached && message.payload.progressId) {
      const id = message.payload.progressId
      const publish = (body: ContentResponse): void => {
        try { chrome.runtime.sendMessage({ channel: DOWNLOAD_RESULT_CHANNEL, id, body }, () => { void chrome.runtime.lastError }) } catch { /* 工作台可关闭，浏览器下载已独立交接 */ }
      }
      sendResponse({ type: MessageType.DownloadFilesAccepted, payload: { progressId: id } } satisfies ContentResponse)
      void bridge.request(message).then(publish).catch(() => publish({ type: MessageType.Error, payload: { message: '下载准备失败，请检查原站页面。' } }))
      return
    }
    void bridge.request(message).then(sendResponse).catch(() => {
      sendResponse({ type: MessageType.Error, payload: { message: '页面读取失败，请刷新后重试。' } } satisfies ContentResponse)
    })
    return true
  })

  let pagePort: chrome.runtime.Port | null = null
  let pagePulse = 0
  function holdBackground(): void {
    if (!chrome.runtime?.id || pagePort) return
    try {
      const port = chrome.runtime.connect({ name: 'patmail-page' })
      pagePort = port
      pagePulse = window.setInterval(() => {
        try { port.postMessage({ kind: 'tick' }) } catch { /* 端口已断，等 onDisconnect 重连 */ }
      }, 20_000)
      port.onDisconnect.addListener(() => {
        void chrome.runtime.lastError
        window.clearInterval(pagePulse)
        if (pagePort === port) pagePort = null
        window.setTimeout(holdBackground, 500)
      })
    } catch { /* 扩展刚重新加载，等页面再次可见 */ }
  }
  holdBackground()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') holdBackground()
  })
}

// 正式入口是完整工作台。浮窗只在收到 SHOW_PANEL 时挂载。

