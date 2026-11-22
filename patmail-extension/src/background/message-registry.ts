import { trustedOrigin } from '../api/config'
import { BROWSER_FILE_CHANNEL } from '../browser-download/types'
import { NATIVE_NAVIGATION_CHANNEL } from '../browser-download/native-navigation'
import { HAGUE_DRAFT_CHANNEL } from '../hague/draft-contract'
import { HAGUE_SESSION_CHANNEL } from '../hague/session-contract'
import type { EasyConnectionContext } from '../shared/connection'
import { DOCUMENT_EXPORT_CHANNEL } from '../shared/document-export'
import { DOWNLOAD_PROGRESS_CHANNEL, DOWNLOAD_RESULT_CHANNEL } from '../shared/download-progress'
import { EASY_PAGE_WORLD_CHANNEL } from '../shared/easy-page-world'
import { isRecord } from '../shared/guards'
import { MessageType, type AppMessage, type BackgroundResponse } from '../shared/message'
import { HAGUE_HTTP_CHANNEL } from './hague-http'
import { JIHUA_CHANNEL } from './jihua-page-world'

export const CALL_CHANNEL = 'patmail-call'
export const RESULT_CHANNEL = 'patmail-result'

const IGNORED_CHANNELS = new Set<string>([
  BROWSER_FILE_CHANNEL,
  NATIVE_NAVIGATION_CHANNEL,
  RESULT_CHANNEL,
  DOWNLOAD_PROGRESS_CHANNEL,
  DOWNLOAD_RESULT_CHANNEL,
])

const AUTHORITY_WRITES = new Set<string>([
  MessageType.SaveTask,
  MessageType.ClaimExecution,
  MessageType.MarkExecutionPrepared,
  MessageType.MarkExecutionSent,
  MessageType.MarkExecutionResponse,
  MessageType.MarkExecutionVerified,
  MessageType.CompleteExecution,
  MessageType.ReleaseExecution,
  MessageType.MarkExecutionUnknown,
  MessageType.ArchiveTask,
])

const AUTHORITY_READS = new Set<string>([
  MessageType.ListTasks,
  MessageType.GetTask,
  MessageType.ListAcceptance,
  MessageType.ValidateTaskMetadata,
  MessageType.RecoverExecution,
])

export type AgentChatPayload = Extract<AppMessage, { type: 'AGENT_CHAT' }>['payload']
export type AgentChatResultPayload = Extract<BackgroundResponse, { type: 'AGENT_CHAT_RESULT' }>['payload']
export type SaveDownloadPayload = Extract<AppMessage, { type: 'SAVE_DOWNLOAD' }>['payload']
export type WorkspaceRequest = Extract<AppMessage, { type: 'WORKSPACE' }>
export type StreamDownloadPayload = Extract<
  AppMessage,
  { type: 'STREAM_DOWNLOAD' | 'BROWSER_STREAM_DOWNLOAD' }
>['payload']
export type StreamDownloadResultPayload = Extract<BackgroundResponse, { type: 'STREAM_DOWNLOAD_RESULT' }>['payload']

export interface StreamDownloadController {
  command(
    payload: StreamDownloadPayload,
    tabId: number,
    owner: string,
  ): Promise<StreamDownloadResultPayload>
  discardTask(taskId: string, owner: string): Promise<void>
  pauseTask(taskId: string, owner: string): Promise<number[]>
}

export interface AppMessageHandler {
  readonly domain: string
  canHandle(message: AppMessage): boolean
  handle(message: AppMessage, sender: chrome.runtime.MessageSender): Promise<BackgroundResponse>
}

export interface ChannelMessageHandler {
  readonly channel: string
  handle(
    message: Record<string, unknown>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean | void
}

export interface BackgroundRegistryDeps {
  extensionId: string
  extensionOrigin: string
  connectionReady: Promise<void>
  getConnectionContext(): EasyConnectionContext
  warmEasySession(): Promise<void>
  recheckBoundSession(): Promise<string>
  agentChat(payload: AgentChatPayload): Promise<AgentChatResultPayload>
  workspace(message: WorkspaceRequest): Promise<BackgroundResponse>
  saveDownload(payload: SaveDownloadPayload): Promise<BackgroundResponse>
  queryDownloadState(downloadId: number): Promise<BackgroundResponse>
  notifyTabPause(tabId: number, message: AppMessage): Promise<void>
  streamDownloads: StreamDownloadController
  browserDownloads: StreamDownloadController
  markLegacyStreamsUsed(): void
  scopeExtensionPageMessage(message: AppMessage, context: EasyConnectionContext): AppMessage | { error: string }
  handleAuthority(scoped: AppMessage, context: EasyConnectionContext): Promise<BackgroundResponse | null>
  handleRecovery(
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
    context: EasyConnectionContext,
  ): boolean
  handleDocumentExport(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<unknown>
  handleHagueHttp(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<unknown>
  handleHagueDraft(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<unknown>
  handleHagueSession(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<unknown>
  handleJihua(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<unknown>
  handleEasyPageWorld(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<unknown>
}

function err(message: string): BackgroundResponse {
  return { type: MessageType.Error, payload: { message } }
}

function fromExtensionPage(sender: chrome.runtime.MessageSender, extensionOrigin: string): boolean {
  return typeof sender.url === 'string' && sender.url.startsWith(extensionOrigin)
}

export function createAppMessageHandlers(deps: BackgroundRegistryDeps): AppMessageHandler[] {
  const pingHandler: AppMessageHandler = {
    domain: 'session',
    canHandle: message => message.type === MessageType.Ping,
    handle: () => {
      if (deps.getConnectionContext().sessionStatus !== 'authenticated') {
        void deps.warmEasySession()
      }
      return Promise.resolve({ type: MessageType.Pong, payload: { ok: true } })
    },
  }

  const agentChatHandler: AppMessageHandler = {
    domain: 'agent',
    canHandle: message => message.type === MessageType.AgentChat,
    async handle(message, sender) {
      if (message.type !== MessageType.AgentChat) return err('后台没有处理这条消息。')
      const pageUrl = sender.url ?? sender.tab?.url ?? ''
      if (!pageUrl.startsWith(deps.extensionOrigin)) {
        return err('只有工作台页面可以调用 AI 助手。')
      }
      return { type: MessageType.AgentChatResult, payload: await deps.agentChat(message.payload) }
    },
  }

  const readonlyAcceptanceRejectHandler: AppMessageHandler = {
    domain: 'acceptance',
    canHandle: message => message.type === MessageType.RunReadonlyAcceptance,
    handle: () => Promise.resolve(err('后台没有处理这条消息。')),
  }

  const workspaceHandler: AppMessageHandler = {
    domain: 'workspace',
    canHandle: message => message.type === MessageType.Workspace,
    async handle(message) {
      if (message.type !== MessageType.Workspace) return err('后台没有处理这条消息。')
      try {
        return await deps.workspace(message)
      } catch (error: unknown) {
        return err(error instanceof Error ? error.message : '后台没有完成转发。')
      }
    },
  }

  const saveDownloadHandler: AppMessageHandler = {
    domain: 'download',
    canHandle: message => message.type === MessageType.SaveDownload,
    handle(message) {
      if (message.type !== MessageType.SaveDownload) return Promise.resolve(err('后台没有处理这条消息。'))
      return deps.saveDownload(message.payload)
    },
  }

  const streamDownloadHandler: AppMessageHandler = {
    domain: 'stream-download',
    canHandle: message => message.type === MessageType.StreamDownload || message.type === MessageType.BrowserStreamDownload,
    async handle(message, sender) {
      if (message.type !== MessageType.StreamDownload && message.type !== MessageType.BrowserStreamDownload) {
        return err('后台没有处理这条消息。')
      }
      const tabId = sender.tab?.id
      if (tabId === undefined || !trustedOrigin(sender.url ?? sender.tab?.url ?? '')) {
        return err('只有已连接的EASY来源页可以写入下载流。')
      }
      try {
        if (message.payload.action === 'start') {
          await deps.connectionReady
          await deps.recheckBoundSession()
          const context = deps.getConnectionContext()
          if (context.easyTabId !== tabId || context.sessionStatus !== 'authenticated' || !context.operatorId) {
            return err('请先重新确认同一EASY账号，再继续下载。')
          }
        }
        if (message.type === MessageType.StreamDownload) deps.markLegacyStreamsUsed()
        const downloads = message.type === MessageType.BrowserStreamDownload ? deps.browserDownloads : deps.streamDownloads
        const context = deps.getConnectionContext()
        return {
          type: MessageType.StreamDownloadResult,
          payload: await downloads.command(message.payload, tabId, JSON.stringify([context.easyOrigin, context.operatorId])),
        }
      } catch (error) {
        return err(error instanceof Error ? error.message : '下载流桥接失败。')
      }
    },
  }

  const discardDownloadHandler: AppMessageHandler = {
    domain: 'stream-download',
    canHandle: message => message.type === MessageType.DiscardDownload,
    async handle(message, sender) {
      if (message.type !== MessageType.DiscardDownload) return err('后台没有处理这条消息。')
      await deps.connectionReady
      const context = deps.getConnectionContext()
      const contentOwner =
        sender.tab?.id === context.easyTabId && trustedOrigin(sender.url ?? '') === context.easyOrigin
      if (
        (!fromExtensionPage(sender, deps.extensionOrigin) && !contentOwner) ||
        context.sessionStatus !== 'authenticated' ||
        !context.operatorId
      ) {
        return err('请先连接原任务的EASY账号，再丢弃下载。')
      }
      const downloads = message.payload.backend === 'browser' ? deps.browserDownloads : deps.streamDownloads
      await downloads.discardTask(message.payload.taskId, JSON.stringify([context.easyOrigin, context.operatorId]))
      return { type: MessageType.DiscardDownloadResult, payload: { ok: true } }
    },
  }

  const pauseDownloadHandler: AppMessageHandler = {
    domain: 'stream-download',
    canHandle: message => message.type === MessageType.PauseDownload,
    async handle(message, sender) {
      if (message.type !== MessageType.PauseDownload) return err('后台没有处理这条消息。')
      await deps.connectionReady
      const context = deps.getConnectionContext()
      const contentOwner =
        sender.tab?.id === context.easyTabId && trustedOrigin(sender.url ?? '') === context.easyOrigin
      const owner = context.operatorId || context.lastOperatorId
      if ((!fromExtensionPage(sender, deps.extensionOrigin) && !contentOwner) || !owner) {
        return err('下载任务账号范围无法确认。')
      }
      const downloads = message.payload.backend === 'browser' ? deps.browserDownloads : deps.streamDownloads
      const tabs = await downloads.pauseTask(message.payload.taskId, JSON.stringify([context.easyOrigin, owner]))
      if (context.easyTabId != null) tabs.push(context.easyTabId)
      await Promise.all([...new Set(tabs)].map(id => deps.notifyTabPause(id, message).catch(() => {})))
      return { type: MessageType.PauseDownloadResult, payload: { ok: true } }
    },
  }

  const downloadStateHandler: AppMessageHandler = {
    domain: 'download',
    canHandle: message => message.type === MessageType.DownloadState,
    handle(message) {
      if (message.type !== MessageType.DownloadState) return Promise.resolve(err('后台没有处理这条消息。'))
      return deps.queryDownloadState(message.payload.downloadId)
    },
  }

  const authorityHandler: AppMessageHandler = {
    domain: 'authority',
    canHandle: () => true,
    async handle(message, sender) {
      let scoped: AppMessage = message
      const accountScoped = AUTHORITY_WRITES.has(message.type) || AUTHORITY_READS.has(message.type)
      if (accountScoped || fromExtensionPage(sender, deps.extensionOrigin)) {
        if (accountScoped) {
          const gate = await deps.recheckBoundSession()
          if (AUTHORITY_WRITES.has(message.type) && gate !== 'same') {
            return err('会话已变化，请重新读取后再保存。')
          }
        }
        const next = deps.scopeExtensionPageMessage(message, deps.getConnectionContext())
        if ('error' in next) return err(next.error)
        scoped = next
      }
      const response = await deps.handleAuthority(scoped, deps.getConnectionContext())
      return response ?? err('后台没有处理这条消息。')
    },
  }

  return [
    pingHandler,
    agentChatHandler,
    readonlyAcceptanceRejectHandler,
    workspaceHandler,
    saveDownloadHandler,
    streamDownloadHandler,
    discardDownloadHandler,
    pauseDownloadHandler,
    downloadStateHandler,
    authorityHandler,
  ]
}

export function createChannelHandlers(deps: BackgroundRegistryDeps): Map<string, ChannelMessageHandler> {
  const entries: ChannelMessageHandler[] = [
    {
      channel: DOCUMENT_EXPORT_CHANNEL,
      handle(message, sender, sendResponse) {
        void deps.handleDocumentExport(message, sender).then(sendResponse)
        return true
      },
    },
    {
      channel: HAGUE_HTTP_CHANNEL,
      handle(message, sender, sendResponse) {
        void deps.handleHagueHttp(message, sender).then(sendResponse, () => {
          sendResponse({ ok: false, error: '海牙接口结果待核对。' })
        })
        return true
      },
    },
    {
      channel: HAGUE_DRAFT_CHANNEL,
      handle(message, sender, sendResponse) {
        void deps.handleHagueDraft(message, sender).then(sendResponse, () => {
          sendResponse({ ok: false, error: 'eHague 草稿操作结果不确定，请检查原站。' })
        })
        return true
      },
    },
    {
      channel: HAGUE_SESSION_CHANNEL,
      handle(message, sender, sendResponse) {
        void deps.handleHagueSession(message, sender).then(sendResponse, () => {
          sendResponse({ ok: false, error: 'eHague 登录态验证失败，请重新检测。' })
        })
        return true
      },
    },
    {
      channel: JIHUA_CHANNEL,
      handle(message, sender, sendResponse) {
        void deps.handleJihua(message, sender).then(sendResponse, (error: unknown) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message.slice(0, 500) : '季华页面没有完成操作。',
          })
        })
        return true
      },
    },
    {
      channel: EASY_PAGE_WORLD_CHANNEL,
      handle(message, sender, sendResponse) {
        void deps.connectionReady
          .then(() => deps.handleEasyPageWorld(message, sender))
          .then(sendResponse, () => {
            sendResponse({ ok: false, message: '原网站页面没有完成操作。' })
          })
        return true
      },
    },
  ]
  return new Map(entries.map(handler => [handler.channel, handler]))
}

export function createBackgroundMessageRegistry(deps: BackgroundRegistryDeps) {
  const appHandlers = createAppMessageHandlers(deps)
  const channelHandlers = createChannelHandlers(deps)

  return {
    async dispatchAppMessage(message: AppMessage, sender: chrome.runtime.MessageSender): Promise<BackgroundResponse> {
      for (const handler of appHandlers) {
        if (handler.canHandle(message)) {
          return handler.handle(message, sender)
        }
      }
      return err('后台没有处理这条消息。')
    },

    dispatchChannel(
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ): 'ignored' | 'handled' | 'unmatched' {
      const channel = isRecord(message) && typeof message.channel === 'string' ? message.channel : ''
      if (channel === BROWSER_FILE_CHANNEL || channel === NATIVE_NAVIGATION_CHANNEL) {
        return 'ignored'
      }
      if (deps.handleRecovery(message, sender, sendResponse, deps.getConnectionContext())) {
        return 'handled'
      }
      if (sender.id !== deps.extensionId) {
        return 'ignored'
      }
      if (IGNORED_CHANNELS.has(channel)) {
        return 'ignored'
      }
      const handler = channelHandlers.get(channel)
      if (handler) {
        handler.handle(message as Record<string, unknown>, sender, sendResponse)
        return 'handled'
      }
      return 'unmatched'
    },
  }
}
