import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendToBackground } from '../../../src/utils/runtime'
import { MessageType, type BackgroundRequest } from '../../../src/shared/message'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('HTTP 内容脚本后台通信', () => {
  it.each([
    [MessageType.DiscardDownload, MessageType.DiscardDownloadResult],
    [MessageType.PauseDownload, MessageType.PauseDownloadResult]
  ] as const)('%s 的成功响应不会被通信白名单丢弃', async (type, result) => {
    const response = { type: result, payload: { ok: true } }
    vi.stubGlobal('chrome', { runtime: {
      onMessage: { addListener() {}, removeListener() {} },
      sendMessage: (_envelope: unknown, callback: (value: unknown) => void) => callback(response)
    } })
    await expect(sendToBackground({ type, payload: { taskId: '11111111-1111-4111-8111-111111111111' } })).resolves.toEqual(response)
  })
  it('没有 randomUUID 时仍能发送取包消息并接收浏览器的响应', async () => {
    const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
    vi.stubGlobal('crypto', { getRandomValues })
    const listeners = new Set<unknown>()
    let sent: { id: string; message: unknown } | undefined
    const response = { type: MessageType.SaveDownloadResult, payload: { ok: true, fileName: 'test.zip' } }
    vi.stubGlobal('chrome', { runtime: {
      onMessage: { addListener: (fn: unknown) => listeners.add(fn), removeListener: (fn: unknown) => listeners.delete(fn) },
      sendMessage: (envelope: typeof sent, callback: (value: unknown) => void) => {
        sent = envelope
        callback(response)
      }
    } })
    const request = { type: MessageType.SaveDownload, payload: {
      url: 'http://183.36.43.66:88/AjaxServers/FileHandler.ashx?guid=85ebabc1-cf99-490e-b5f7-298a77742012',
      fileName: 'test.zip'
    } } as const
    await expect(sendToBackground(request)).resolves.toEqual(response)
    expect(sent?.message).toEqual(request)
    expect(sent?.id).toMatch(/^[0-9a-f-]{32,36}$/i)
    expect(listeners.size).toBe(0)
  })

  it('HTTP 页面同时发送多个请求时按不同消息 ID 接收乱序推送结果', async () => {
    const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
    vi.stubGlobal('crypto', { getRandomValues })
    type Listener = (value: unknown, sender: { id: string }) => void
    const listeners = new Set<Listener>()
    const ids: string[] = []
    vi.stubGlobal('chrome', { runtime: {
      id: 'extension-id',
      onMessage: { addListener: (fn: Listener) => listeners.add(fn), removeListener: (fn: Listener) => listeners.delete(fn) },
      sendMessage: (envelope: { id: string }) => { ids.push(envelope.id) }
    } })
    const first = sendToBackground({ type: MessageType.Ping })
    const second = sendToBackground({ type: MessageType.Ping })
    const pong = { type: MessageType.Pong, payload: { ok: true } }
    const error = { type: MessageType.Error, payload: { message: 'second response' } }
    for (const fn of listeners) fn({ channel: 'patmail-result', id: ids[1], body: error }, { id: 'extension-id' })
    for (const fn of listeners) fn({ channel: 'patmail-result', id: ids[0], body: pong }, { id: 'extension-id' })
    await expect(Promise.all([first, second])).resolves.toEqual([pong, error])
    expect(new Set(ids).size).toBe(2)
    expect(listeners.size).toBe(0)
  })

  it('detached 下载的消息口关闭后仍接收独立结果通道回执', async () => {
    type Listener = (value: unknown, sender: { id: string }) => void
    const listeners = new Set<Listener>()
    let sent: { id: string; message: unknown } | undefined
    const runtime = {
      id: 'extension-id',
      lastError: undefined as { message: string } | undefined,
      onMessage: {
        addListener: (listener: Listener) => listeners.add(listener),
        removeListener: (listener: Listener) => listeners.delete(listener)
      },
      sendMessage: (envelope: typeof sent, callback: (value: unknown) => void) => {
        sent = envelope
        runtime.lastError = { message: 'The message port closed before a response was received.' }
        callback(undefined)
        runtime.lastError = undefined
      }
    }
    vi.stubGlobal('chrome', { runtime })
    const id = '85ebabc1-cf99-490e-b5f7-298a77742012'
    const request = {
      type: MessageType.Workspace,
      payload: { action: 'forward', message: {
        type: MessageType.DownloadFiles,
        payload: { items: [{ fileId: id, fileNo: 'A001', fileName: 'a.pdf' }], selection: null, stripAppNoDot: false, progressId: id, detached: true }
      } }
    } as BackgroundRequest
    const response = { type: MessageType.DownloadStateResult, payload: { ok: true, state: 'inProgress', receivedBytes: 1, totalBytes: null } }
    const pending = sendToBackground(request, 1_000)
    for (const listener of listeners) listener({ channel: 'patmail-result', id: sent?.id, body: response }, { id: 'extension-id' })
    await expect(pending).resolves.toEqual(response)
    expect(listeners.size).toBe(0)
  })

  it.each([
    [MessageType.BrowserStreamDownload, 'write'],
    [MessageType.BrowserStreamDownload, 'finish'],
    [MessageType.StreamDownload, 'write'],
    [MessageType.StreamDownload, 'finish']
  ] as const)(
    '%s 的 %s 消息口关闭后仍等待同 requestId 的结果，且不重发副作用命令', async (type, action) => {
      vi.useFakeTimers()
      type Listener = (value: unknown, sender: { id: string }) => void
      const listeners = new Set<Listener>()
      let sent: { id: string; message: unknown } | undefined
      let sends = 0
      const runtime = {
        id: 'extension-id',
        lastError: undefined as { message: string } | undefined,
        onMessage: {
          addListener: (listener: Listener) => listeners.add(listener),
          removeListener: (listener: Listener) => listeners.delete(listener)
        },
        sendMessage: (envelope: typeof sent, callback: (value: unknown) => void) => {
          sends++
          sent = envelope
          runtime.lastError = { message: 'The message port closed before a response was received.' }
          callback(undefined)
          runtime.lastError = undefined
        }
      }
      vi.stubGlobal('chrome', { runtime })
      const payload = action === 'write'
        ? { action, token: 'a'.repeat(64), sequence: 0, offset: 0, data: 'YQ==' }
        : { action, token: 'a'.repeat(64) }
      const request = { type, payload } as const satisfies BackgroundRequest
      const pending = sendToBackground(request, 1_000)
      expect(sends).toBe(1)
      expect(listeners.size).toBe(1)
      const response = { type: MessageType.StreamDownloadResult, payload: { ok: true } }
      for (const listener of listeners) listener({ channel: 'patmail-result', id: sent?.id, body: response }, { id: 'extension-id' })
      await expect(pending).resolves.toEqual(response)
      expect(sends).toBe(1)
      expect(listeners.size).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it.each([MessageType.BrowserStreamDownload, MessageType.StreamDownload] as const)(
    '%s 消息口关闭且没有独立回执时仍在既有超时后失败并清理监听', async type => {
      vi.useFakeTimers()
      type Listener = (value: unknown, sender: { id: string }) => void
      const listeners = new Set<Listener>()
      let sends = 0
      const runtime = {
        id: 'extension-id',
        lastError: undefined as { message: string } | undefined,
        onMessage: {
          addListener: (listener: Listener) => listeners.add(listener),
          removeListener: (listener: Listener) => listeners.delete(listener)
        },
        sendMessage: (_envelope: unknown, callback: (value: unknown) => void) => {
          sends++
          runtime.lastError = { message: 'The message channel closed before a response was received.' }
          callback(undefined)
          runtime.lastError = undefined
        }
      }
      vi.stubGlobal('chrome', { runtime })
      const request = { type, payload: { action: 'finish', token: 'a'.repeat(64) } } as const satisfies BackgroundRequest
      const pending = sendToBackground(request, 1_000)
      expect(listeners.size).toBe(1)
      expect(vi.getTimerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(1_000)
      const result = await pending
      if (result?.type !== MessageType.Error) throw new Error('缺少超时错误')
      expect(result.payload.message).toBe('扩展后台没有在时限内返回。')
      expect(sends).toBe(1)
      expect(listeners.size).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it('普通请求的消息口关闭仍立即返回具体错误', async () => {
    vi.useFakeTimers()
    const listeners = new Set<unknown>()
    const runtime = {
      id: 'extension-id',
      lastError: { message: 'The message port closed before a response was received.' },
      onMessage: { addListener: (listener: unknown) => listeners.add(listener), removeListener: (listener: unknown) => listeners.delete(listener) },
      sendMessage: (_envelope: unknown, callback: (value: unknown) => void) => callback(undefined)
    }
    vi.stubGlobal('chrome', { runtime })
    const result = await sendToBackground({ type: MessageType.Ping }, 5_000)
    if (result?.type !== MessageType.Error) throw new Error('普通请求必须返回消息口错误')
    expect(result.payload.message).toContain('message port closed')
    expect(listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
