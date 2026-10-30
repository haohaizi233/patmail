import { afterEach, expect, it, vi } from 'vitest'
import { createFullPageBridge } from '../../../src/app/services/full-page-bridge'
import { MessageType, type BackgroundRequest, type BackgroundResponse, type ContentResponse } from '../../../src/shared/message'
import { waitForDownloadJob, DOWNLOAD_JOB_SILENCE_MS } from '../../../src/utils/download-job'
const state = vi.hoisted(() => ({ start: vi.fn<(message: BackgroundRequest) => Promise<BackgroundResponse | null>>() }))
vi.mock('../../../src/utils/runtime', () => ({ sendToBackground: state.start }))
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.unstubAllGlobals(); vi.useRealTimers(); state.start.mockReset() })
function expectDownloadError(response: ContentResponse, message: string): void {
  if (response.type !== MessageType.Error) throw new Error('预期返回下载错误')
  expect(response.payload.message).toContain(message)
}
function delayedAcceptanceTimeout() {
  const response: ContentResponse = { type: MessageType.Error, payload: { message: '扩展后台没有在时限内返回。' } }
  let resolveStart: ((value: ContentResponse) => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    start: () => new Promise<ContentResponse>(resolve => {
      resolveStart = resolve
      timer = setTimeout(() => resolve(response), 70_000)
    }),
    resolveTimeout: () => {
      clearTimeout(timer)
      resolveStart?.(response)
    }
  }
}
it('工作台先收到受理回执，长任务不占后台消息通道，最终结果独立关联且清理监听', async () => {
  vi.useFakeTimers()
  const id = '85ebabc1-cf99-490e-b5f7-298a77742012'
  type Listener = (value: unknown, sender: { id: string }) => void
  const listeners = new Set<Listener>()
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', onMessage: {
    addListener: (listener: Listener) => listeners.add(listener), removeListener: (listener: Listener) => listeners.delete(listener)
  } } })
  state.start.mockResolvedValue({ type: MessageType.WorkspaceResult, payload: { forwarded: { type: 'DOWNLOAD_FILES_ACCEPTED', payload: { progressId: id } } } } as unknown as BackgroundResponse)
  let settled = false
  const pending = createFullPageBridge().request({ type: MessageType.DownloadFiles, payload: {
    items: [{ fileId: id, fileNo: 'A001', fileName: 'a.pdf' }], selection: null, stripAppNoDot: false, progressId: id
  } }).then(result => { settled = true; return result })
  for (let minute = 0; minute < 32; minute++) {
    await vi.advanceTimersByTimeAsync(60_000)
    for (const listener of listeners) listener({ channel: 'patmail-download-progress', id, progress: { phase: 'packing', done: 0, total: 1 } }, { id: 'test-extension' })
  }
  expect(settled).toBe(false)
  expect(listeners.size).toBe(1)
  const reply = { type: MessageType.DownloadFilesResult, payload: { ok: true, data: { fileName: 'test.zip', fileCount: 1, notice: '' } } }
  for (const listener of listeners) listener({ channel: 'patmail-download-result', id: 'other', body: reply }, { id: 'test-extension' })
  for (const listener of listeners) listener({ channel: 'patmail-download-result', id, body: reply }, { id: 'other-extension' })
  await Promise.resolve()
  expect(settled).toBe(false)
  for (const listener of listeners) listener({ channel: 'patmail-download-result', id, body: reply }, { id: 'test-extension' })
  expect(await pending).toEqual(reply)
  expect(listeners.size).toBe(0)
  const sent = state.start.mock.calls[0]?.[0]
  if (sent?.type !== MessageType.Workspace || sent.payload.action !== 'forward' || sent.payload.message.type !== MessageType.DownloadFiles) {
    throw new Error('预期转发 detached 下载请求')
  }
  expect(sent.payload.message.payload.detached).toBe(true)
})
it('收到来源标签页关闭事件后结束等待并清理监听', async () => {
  type Listener = (value: unknown, sender: { id: string; tab?: { id: number } }) => void
  const listeners = new Set<Listener>()
  const removed = new Set<(id: number) => void>()
  vi.stubGlobal('chrome', { runtime: { id: 'test', onMessage: { addListener: (fn: Listener) => listeners.add(fn), removeListener: (fn: Listener) => listeners.delete(fn) } },
    tabs: { onRemoved: { addListener: (fn: (id: number) => void) => removed.add(fn), removeListener: (fn: (id: number) => void) => removed.delete(fn) } } })
  const id = '85ebabc1-cf99-490e-b5f7-298a77742012'
  let settled = false
  const pending = waitForDownloadJob(id, async () => ({ type: MessageType.DownloadFilesAccepted, payload: { progressId: id } })).then(result => { settled = true; return result })
  for (const fn of listeners) fn({ channel: 'patmail-download-progress', id, progress: { phase: 'packing', done: 0, total: 1 } }, { id: 'test', tab: { id: 7 } })
  for (const fn of removed) fn(7)
  await Promise.resolve()
  expect(settled).toBe(true)
  expect(await pending).toMatchObject({ type: MessageType.Error })
  expect(listeners.size).toBe(0)
  expect(removed.size).toBe(0)
})
it('没有任何状态消息才判失联；工作台取消等待也清理监听', async () => {
  vi.useFakeTimers()
  const listeners = new Set<unknown>()
  vi.stubGlobal('chrome', { runtime: { id: 'test', onMessage: { addListener: (fn: unknown) => listeners.add(fn), removeListener: (fn: unknown) => listeners.delete(fn) } } })
  const id = '85ebabc1-cf99-490e-b5f7-298a77742012'
  const start = async () => ({ type: MessageType.DownloadFilesAccepted, payload: { progressId: id } })
  const pending = waitForDownloadJob(id, start)
  await vi.advanceTimersByTimeAsync(DOWNLOAD_JOB_SILENCE_MS + 1)
  expectDownloadError(await pending, '没有回报状态')
  expect(listeners.size).toBe(0)
  const controller = new AbortController()
  const waiting = waitForDownloadJob(id, start, controller.signal)
  controller.abort()
  expectDownloadError(await waiting, '已停止等待')
  expect(listeners.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('受理超时后短暂等待确认；期间进度和最终结果证明任务仍在运行', async () => {
  vi.useFakeTimers()
  type Listener = (value: unknown, sender: { id: string; tab?: { id: number } }) => void
  const listeners = new Set<Listener>()
  vi.stubGlobal('chrome', { runtime: { id: 'test', onMessage: {
    addListener: (fn: Listener) => listeners.add(fn), removeListener: (fn: Listener) => listeners.delete(fn)
  } } })
  const id = '85ebabc1-cf99-490e-b5f7-298a77742012'
  const timeout = { type: MessageType.Error, payload: { message: '扩展后台没有在时限内返回。' } }
  const start = () => new Promise<typeof timeout>(resolve => setTimeout(() => resolve(timeout), 70_000))
  const final = { type: MessageType.DownloadFilesResult, payload: { ok: true, data: { fileName: 'test.zip', fileCount: 1, notice: '' } } }
  const pending = waitForDownloadJob(id, start)

  await vi.advanceTimersByTimeAsync(70_000)
  for (const listener of listeners) listener({ channel: 'patmail-download-progress', id, progress: { phase: 'packing', done: 0, total: 1 } }, { id: 'test', tab: { id: 7 } })
  for (const listener of listeners) listener({ channel: 'patmail-download-result', id, body: final }, { id: 'test', tab: { id: 7 } })

  await expect(pending).resolves.toEqual(final)
  expect(listeners.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('受理超时后没有匹配进度或结果时仍在有限确认窗内报错', async () => {
  vi.useFakeTimers()
  const listeners = new Set<unknown>()
  vi.stubGlobal('chrome', { runtime: { id: 'test', onMessage: {
    addListener: (fn: unknown) => listeners.add(fn), removeListener: (fn: unknown) => listeners.delete(fn)
  } } })
  const id = '85ebabc1-cf99-490e-b5f7-298a77742012'
  const timeout = { type: MessageType.Error, payload: { message: '扩展后台没有在时限内返回。' } }
  const start = () => new Promise<typeof timeout>(resolve => setTimeout(() => resolve(timeout), 70_000))
  const pending = waitForDownloadJob(id, start)

  await vi.advanceTimersByTimeAsync(75_000)

  await expect(pending).resolves.toEqual(timeout)
  expect(listeners.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('受理确认窗口内取消会清理确认计时器和结果监听', async () => {
  vi.useFakeTimers()
  const listeners = new Set<unknown>()
  vi.stubGlobal('chrome', { runtime: { id: 'test', onMessage: {
    addListener: (fn: unknown) => listeners.add(fn), removeListener: (fn: unknown) => listeners.delete(fn)
  } } })
  const id = '85ebabc1-cf99-490e-b5f7-298a77742012'
  const timeout = { type: MessageType.Error, payload: { message: '扩展后台没有在时限内返回。' } }
  const controller = new AbortController()
  const start = () => new Promise<typeof timeout>(resolve => setTimeout(() => resolve(timeout), 70_000))
  const pending = waitForDownloadJob(id, start, controller.signal)

  await vi.advanceTimersByTimeAsync(70_000)
  controller.abort()

  expectDownloadError(await pending, '已停止等待')
  expect(listeners.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('取消后迟到的受理超时不再创建确认计时器', async () => {
  vi.useFakeTimers()
  const listeners = new Set<unknown>()
  vi.stubGlobal('chrome', { runtime: { id: 'test', onMessage: {
    addListener: (fn: unknown) => listeners.add(fn), removeListener: (fn: unknown) => listeners.delete(fn)
  } } })
  const id = '85ebabc1-cf99-490e-b5f7-298a77742012'
  const controller = new AbortController()
  const delayed = delayedAcceptanceTimeout()
  const pending = waitForDownloadJob(id, delayed.start, controller.signal)

  controller.abort()
  expectDownloadError(await pending, '已停止等待')
  delayed.resolveTimeout()
  await Promise.resolve()

  expect(listeners.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('最终结果后迟到的受理超时不再创建确认计时器', async () => {
  vi.useFakeTimers()
  type Listener = (value: unknown, sender: { id: string }) => void
  const listeners = new Set<Listener>()
  vi.stubGlobal('chrome', { runtime: { id: 'test', onMessage: {
    addListener: (fn: Listener) => listeners.add(fn), removeListener: (fn: Listener) => listeners.delete(fn)
  } } })
  const id = '85ebabc1-cf99-490e-b5f7-298a77742012'
  const delayed = delayedAcceptanceTimeout()
  const final: ContentResponse = { type: MessageType.DownloadFilesResult, payload: { ok: true, data: { fileName: 'test.zip', fileCount: 1, notice: '' } } }
  const pending = waitForDownloadJob(id, delayed.start)

  for (const listener of listeners) listener({ channel: 'patmail-download-result', id, body: final }, { id: 'test' })
  await expect(pending).resolves.toEqual(final)
  delayed.resolveTimeout()
  await Promise.resolve()

  expect(listeners.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})
