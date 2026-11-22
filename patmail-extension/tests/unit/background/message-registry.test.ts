import { describe, expect, it, vi } from 'vitest'
import { LARGE_CUSTOMER_ORIGIN } from '../../../src/api/config'
import { BROWSER_FILE_CHANNEL } from '../../../src/browser-download/types'
import { HAGUE_HTTP_CHANNEL } from '../../../src/background/hague-http'
import { JIHUA_CHANNEL } from '../../../src/background/jihua-page-world'
import {
  createBackgroundMessageRegistry,
  type BackgroundRegistryDeps,
  type StreamDownloadController,
  type StreamDownloadPayload,
  type WorkspaceRequest,
} from '../../../src/background/message-registry'
import { HAGUE_DRAFT_CHANNEL } from '../../../src/hague/draft-contract'
import { HAGUE_SESSION_CHANNEL } from '../../../src/hague/session-contract'
import type { EasyConnectionContext } from '../../../src/shared/connection'
import { DOCUMENT_EXPORT_CHANNEL } from '../../../src/shared/document-export'
import { DOWNLOAD_PROGRESS_CHANNEL } from '../../../src/shared/download-progress'
import { EASY_PAGE_WORLD_CHANNEL } from '../../../src/shared/easy-page-world'
import { MessageType } from '../../../src/shared/message'

const EXT_ID = 'ext-test-id'
const EXT_ORIGIN = `chrome-extension://${EXT_ID}/`

function makeContext(overrides: Partial<EasyConnectionContext> = {}): EasyConnectionContext {
  return {
    easyOrigin: LARGE_CUSTOMER_ORIGIN,
    operatorId: '11111111-1111-4111-8111-111111111111',
    lastOperatorId: '',
    displayName: '测试用户',
    lastDisplayName: '测试用户',
    easyTabId: 10,
    connectionVersion: 1,
    sessionStatus: 'authenticated',
    accountOffer: null,
    lastCheckedAt: '2026-11-22T00:00:00Z',
    message: 'ok',
    ...overrides,
  }
}

function makeStreamController(): StreamDownloadController {
  return {
    command: vi.fn<StreamDownloadController['command']>(() =>
      Promise.resolve({ ok: true as const, token: 'tok-1' }),
    ),
    discardTask: vi.fn(() => Promise.resolve()),
    pauseTask: vi.fn(() => Promise.resolve([20])),
  }
}

function makeDeps(contextOverrides: Partial<EasyConnectionContext> = {}): {
  deps: BackgroundRegistryDeps
  streamDownloads: StreamDownloadController
  browserDownloads: StreamDownloadController
  notifiedTabs: number[]
  warmCalls: number
  legacyMarked: boolean
} {
  const ctx = makeContext(contextOverrides)
  const streamDownloads = makeStreamController()
  const browserDownloads = makeStreamController()
  const notifiedTabs: number[] = []
  const state = {
    warmCalls: 0,
    legacyMarked: false,
  }

  const deps: BackgroundRegistryDeps = {
    extensionId: EXT_ID,
    extensionOrigin: EXT_ORIGIN,
    connectionReady: Promise.resolve(),
    getConnectionContext: () => ctx,
    warmEasySession: () => {
      state.warmCalls += 1
      return Promise.resolve()
    },
    recheckBoundSession: () => Promise.resolve('same'),
    agentChat: () =>
      Promise.resolve({
        ok: true,
        data: { reply: 'ok', model: 'm', steps: 0, history: [], sessions: [], activeId: 's1' },
      }),
    workspace: () => Promise.resolve({ type: MessageType.Pong, payload: { ok: true } }),
    saveDownload: payload =>
      Promise.resolve({
        type: MessageType.SaveDownloadResult,
        payload: { ok: true, fileName: payload.fileName, downloadId: 1 },
      }),
    queryDownloadState: () =>
      Promise.resolve({
        type: MessageType.DownloadStateResult,
        payload: { ok: true, state: 'complete', receivedBytes: 100, totalBytes: 100 },
      }),
    notifyTabPause: tabId => {
      notifiedTabs.push(tabId)
      return Promise.resolve()
    },
    streamDownloads,
    browserDownloads,
    markLegacyStreamsUsed: () => {
      state.legacyMarked = true
    },
    scopeExtensionPageMessage: msg => msg,
    handleAuthority: () => Promise.resolve(null),
    handleRecovery: () => false,
    handleDocumentExport: () => Promise.resolve({ ok: true }),
    handleHagueHttp: () => Promise.resolve({ ok: true }),
    handleHagueDraft: () => Promise.resolve({ ok: true }),
    handleHagueSession: () => Promise.resolve({ ok: true }),
    handleJihua: () => Promise.resolve({ ok: true }),
    handleEasyPageWorld: () => Promise.resolve({ ok: true }),
  }

  return {
    deps,
    streamDownloads,
    browserDownloads,
    notifiedTabs,
    get warmCalls() {
      return state.warmCalls
    },
    get legacyMarked() {
      return state.legacyMarked
    },
  }
}

const STREAM_START: StreamDownloadPayload = {
  action: 'start',
  taskId: '33333333-3333-4333-8333-333333333333',
  fileName: 'bundle.zip',
}

const STREAM_FINISH: StreamDownloadPayload = {
  action: 'finish',
  token: 'tok-1',
}

describe('BackgroundMessageRegistry', () => {
  it('handles Ping and warms EASY session only when unauthenticated', async () => {
    const setup = makeDeps({ sessionStatus: 'unauthenticated' })
    const registry = createBackgroundMessageRegistry(setup.deps)
    const pong1 = await registry.dispatchAppMessage({ type: MessageType.Ping }, {})
    expect(pong1).toEqual({ type: MessageType.Pong, payload: { ok: true } })
    expect(setup.warmCalls).toBe(1)

    const authSetup = makeDeps({ sessionStatus: 'authenticated' })
    const authRegistry = createBackgroundMessageRegistry(authSetup.deps)
    await authRegistry.dispatchAppMessage({ type: MessageType.Ping }, {})
    expect(authSetup.warmCalls).toBe(0)
  })

  it('enforces extension-page origin on AgentChat and rejects RunReadonlyAcceptance', async () => {
    const { deps } = makeDeps()
    const registry = createBackgroundMessageRegistry(deps)

    const blocked = await registry.dispatchAppMessage(
      { type: MessageType.AgentChat, payload: { action: 'history' } },
      { url: `${LARGE_CUSTOMER_ORIGIN}/Index.aspx` },
    )
    expect(blocked).toEqual({
      type: MessageType.Error,
      payload: { message: '只有工作台页面可以调用 AI 助手。' },
    })

    const allowed = await registry.dispatchAppMessage(
      { type: MessageType.AgentChat, payload: { action: 'history' } },
      { url: `${EXT_ORIGIN}app.html` },
    )
    expect(allowed.type).toBe(MessageType.AgentChatResult)

    const rejected = await registry.dispatchAppMessage(
      { type: MessageType.RunReadonlyAcceptance, payload: { call: 'Test', expected: {} } },
      {},
    )
    expect(rejected).toEqual({ type: MessageType.Error, payload: { message: '后台没有处理这条消息。' } })
  })

  it('handles Workspace errors, SaveDownload, and DownloadState cleanly', async () => {
    const { deps } = makeDeps()
    deps.workspace = () => Promise.reject(new Error('转发超时'))
    const registry = createBackgroundMessageRegistry(deps)

    const wsMessage: WorkspaceRequest = { type: MessageType.Workspace, payload: { action: 'listTabs' } }
    const wsErr = await registry.dispatchAppMessage(wsMessage, {})
    expect(wsErr).toEqual({ type: MessageType.Error, payload: { message: '转发超时' } })

    const saveRes = await registry.dispatchAppMessage(
      { type: MessageType.SaveDownload, payload: { url: 'blob:1', fileName: 'a.zip' } },
      {},
    )
    expect(saveRes.type).toBe(MessageType.SaveDownloadResult)

    const stateRes = await registry.dispatchAppMessage(
      { type: MessageType.DownloadState, payload: { downloadId: 1 } },
      {},
    )
    expect(stateRes.type).toBe(MessageType.DownloadStateResult)
  })

  it('validates sender origin and bound session for StreamDownload, DiscardDownload, and PauseDownload', async () => {
    const setup = makeDeps()
    const registry = createBackgroundMessageRegistry(setup.deps)

    const untrustedStream = await registry.dispatchAppMessage(
      { type: MessageType.StreamDownload, payload: STREAM_START },
      { url: 'https://evil.example/page', tab: { id: 10 } as chrome.tabs.Tab },
    )
    expect(untrustedStream).toEqual({
      type: MessageType.Error,
      payload: { message: '只有已连接的EASY来源页可以写入下载流。' },
    })

    const mismatchTab = await registry.dispatchAppMessage(
      { type: MessageType.StreamDownload, payload: STREAM_START },
      { url: `${LARGE_CUSTOMER_ORIGIN}/main.aspx`, tab: { id: 99 } as chrome.tabs.Tab },
    )
    expect(mismatchTab).toEqual({
      type: MessageType.Error,
      payload: { message: '请先重新确认同一EASY账号，再继续下载。' },
    })

    const validStream = await registry.dispatchAppMessage(
      { type: MessageType.StreamDownload, payload: STREAM_START },
      { url: `${LARGE_CUSTOMER_ORIGIN}/main.aspx`, tab: { id: 10 } as chrome.tabs.Tab },
    )
    expect(validStream.type).toBe(MessageType.StreamDownloadResult)
    expect(setup.legacyMarked).toBe(true)

    const validBrowserStream = await registry.dispatchAppMessage(
      { type: MessageType.BrowserStreamDownload, payload: STREAM_FINISH },
      { url: `${LARGE_CUSTOMER_ORIGIN}/main.aspx`, tab: { id: 10 } as chrome.tabs.Tab },
    )
    expect(validBrowserStream.type).toBe(MessageType.StreamDownloadResult)

    const discarded = await registry.dispatchAppMessage(
      { type: MessageType.DiscardDownload, payload: { taskId: 't1', backend: 'browser' } },
      { url: `${EXT_ORIGIN}app.html` },
    )
    expect(discarded).toEqual({ type: MessageType.DiscardDownloadResult, payload: { ok: true } })

    const paused = await registry.dispatchAppMessage(
      { type: MessageType.PauseDownload, payload: { taskId: 't1' } },
      { url: `${LARGE_CUSTOMER_ORIGIN}/main.aspx`, tab: { id: 10 } as chrome.tabs.Tab },
    )
    expect(paused).toEqual({ type: MessageType.PauseDownloadResult, payload: { ok: true } })
    expect(setup.notifiedTabs).toEqual([20, 10])
  })

  it('guards authority writes on session change and routes channel messages safely', async () => {
    const { deps } = makeDeps()
    deps.recheckBoundSession = () => Promise.resolve('changed')
    const registry = createBackgroundMessageRegistry(deps)

    const blockedWrite = await registry.dispatchAppMessage(
      { type: MessageType.SaveTask, payload: { task: {} } },
      { url: `${EXT_ORIGIN}app.html` },
    )
    expect(blockedWrite).toEqual({
      type: MessageType.Error,
      payload: { message: '会话已变化，请重新读取后再保存。' },
    })

    const fallbackAuth = await registry.dispatchAppMessage(
      {
        type: MessageType.ListTasks,
        payload: { origin: LARGE_CUSTOMER_ORIGIN, operatorId: '11111111-1111-4111-8111-111111111111' },
      },
      { url: `${EXT_ORIGIN}app.html` },
    )
    expect(fallbackAuth).toEqual({
      type: MessageType.Error,
      payload: { message: '后台没有处理这条消息。' },
    })

    const sendResponse = vi.fn()
    expect(registry.dispatchChannel({ channel: BROWSER_FILE_CHANNEL }, { id: EXT_ID }, sendResponse)).toBe('ignored')
    expect(registry.dispatchChannel({ channel: DOWNLOAD_PROGRESS_CHANNEL }, { id: EXT_ID }, sendResponse)).toBe(
      'ignored',
    )
    expect(registry.dispatchChannel({ channel: HAGUE_HTTP_CHANNEL }, { id: 'other-ext' }, sendResponse)).toBe(
      'ignored',
    )

    for (const ch of [
      DOCUMENT_EXPORT_CHANNEL,
      HAGUE_HTTP_CHANNEL,
      HAGUE_DRAFT_CHANNEL,
      HAGUE_SESSION_CHANNEL,
      JIHUA_CHANNEL,
      EASY_PAGE_WORLD_CHANNEL,
    ]) {
      expect(registry.dispatchChannel({ channel: ch }, { id: EXT_ID }, sendResponse)).toBe('handled')
    }
    expect(registry.dispatchChannel({ channel: 'unknown-chan' }, { id: EXT_ID }, sendResponse)).toBe('unmatched')
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledTimes(6)
    })
  })

  it('covers rejection fallbacks, recovery interception, and unauthorized download paths', async () => {
    const setup = makeDeps({ sessionStatus: 'unauthenticated', operatorId: '', lastOperatorId: '' })
    setup.deps.scopeExtensionPageMessage = () => ({ error: '账号范围校验失败' })
    const unauthRegistry = createBackgroundMessageRegistry(setup.deps)

    const discardBlocked = await unauthRegistry.dispatchAppMessage(
      { type: MessageType.DiscardDownload, payload: { taskId: 't1' } },
      { url: `${EXT_ORIGIN}app.html` },
    )
    expect(discardBlocked).toEqual({
      type: MessageType.Error,
      payload: { message: '请先连接原任务的EASY账号，再丢弃下载。' },
    })

    const pauseBlocked = await unauthRegistry.dispatchAppMessage(
      { type: MessageType.PauseDownload, payload: { taskId: 't1' } },
      { url: `${EXT_ORIGIN}app.html` },
    )
    expect(pauseBlocked).toEqual({
      type: MessageType.Error,
      payload: { message: '下载任务账号范围无法确认。' },
    })

    const scopeBlocked = await unauthRegistry.dispatchAppMessage(
      {
        type: MessageType.ListTasks,
        payload: { origin: LARGE_CUSTOMER_ORIGIN, operatorId: '11111111-1111-4111-8111-111111111111' },
      },
      { url: `${EXT_ORIGIN}app.html` },
    )
    expect(scopeBlocked).toEqual({
      type: MessageType.Error,
      payload: { message: '账号范围校验失败' },
    })

    const failSetup = makeDeps({ operatorId: '', lastOperatorId: '11111111-1111-4111-8111-111111111111', easyTabId: null })
    failSetup.deps.streamDownloads.command = vi.fn<StreamDownloadController['command']>(() =>
      Promise.reject(new Error('写入中断')),
    )
    failSetup.deps.notifyTabPause = vi.fn(() => Promise.reject(new Error('tab closed')))
    failSetup.deps.handleAuthority = () => Promise.resolve({ type: MessageType.Pong, payload: { ok: true } })
    failSetup.deps.handleHagueHttp = () => Promise.reject(new Error('net'))
    failSetup.deps.handleHagueDraft = () => Promise.reject(new Error('timeout'))
    failSetup.deps.handleHagueSession = () => Promise.reject(new Error('expired'))
    failSetup.deps.handleJihua = () => Promise.reject(new Error('导入失败'))
    failSetup.deps.handleEasyPageWorld = () => Promise.reject(new Error('page failed'))
    const failRegistry = createBackgroundMessageRegistry(failSetup.deps)

    const streamErr = await failRegistry.dispatchAppMessage(
      { type: MessageType.StreamDownload, payload: STREAM_FINISH },
      { url: `${LARGE_CUSTOMER_ORIGIN}/main.aspx`, tab: { id: 10 } as chrome.tabs.Tab },
    )
    expect(streamErr).toEqual({ type: MessageType.Error, payload: { message: '写入中断' } })

    const pauseLegacy = await failRegistry.dispatchAppMessage(
      { type: MessageType.PauseDownload, payload: { taskId: 't2', backend: 'browser' } },
      { url: `${EXT_ORIGIN}app.html` },
    )
    expect(pauseLegacy).toEqual({ type: MessageType.PauseDownloadResult, payload: { ok: true } })

    const authOk = await failRegistry.dispatchAppMessage(
      {
        type: MessageType.ListTasks,
        payload: { origin: LARGE_CUSTOMER_ORIGIN, operatorId: '11111111-1111-4111-8111-111111111111' },
      },
      { url: `${EXT_ORIGIN}app.html` },
    )
    expect(authOk).toEqual({ type: MessageType.Pong, payload: { ok: true } })

    const responses: unknown[] = []
    const collect = (value: unknown) => {
      responses.push(value)
    }
    for (const ch of [HAGUE_HTTP_CHANNEL, HAGUE_DRAFT_CHANNEL, HAGUE_SESSION_CHANNEL, JIHUA_CHANNEL, EASY_PAGE_WORLD_CHANNEL]) {
      expect(failRegistry.dispatchChannel({ channel: ch }, { id: EXT_ID }, collect)).toBe('handled')
    }
    await vi.waitFor(() => {
      expect(responses).toHaveLength(5)
    })
    expect(responses).toEqual(
      expect.arrayContaining([
        { ok: false, error: '海牙接口结果待核对。' },
        { ok: false, error: 'eHague 草稿操作结果不确定，请检查原站。' },
        { ok: false, error: 'eHague 登录态验证失败，请重新检测。' },
        { ok: false, error: '导入失败' },
        { ok: false, message: '原网站页面没有完成操作。' },
      ]),
    )

    failSetup.deps.handleRecovery = () => true
    expect(failRegistry.dispatchChannel(null, { id: EXT_ID }, collect)).toBe('handled')
  })
})
