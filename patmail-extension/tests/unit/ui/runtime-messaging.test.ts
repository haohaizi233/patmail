import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendToBackground } from '../../../src/utils/runtime'
import { MessageType } from '../../../src/shared/message'

afterEach(() => vi.unstubAllGlobals())

describe('HTTP 内容脚本后台通信', () => {
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
})
