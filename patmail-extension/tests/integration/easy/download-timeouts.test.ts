import { afterEach, describe, expect, it, vi } from 'vitest'
import { EasyTransport } from '../../../src/api/transport'
import { EasyRuntime } from '../../../src/api/client'
import type { FileDownloadProgress } from '../../../src/shared/download-progress'

afterEach(() => vi.useRealTimers())
describe('大批下载的等待预算', () => {
  it('服务器准备6分钟不回包时仍持续报告存活与耗时，最终直接返回取包URL', async () => {
    vi.useFakeTimers()
    const progress: FileDownloadProgress[] = []
    const fetcher: typeof fetch = async (_url, init) => {
      const call = new URLSearchParams(String(init?.body)).get('Call')
      if (call === 'DownLoad') await new Promise(resolve => setTimeout(resolve, 360_000))
      return new Response(JSON.stringify({ ClientInfo: { IsLogin: true, Status: true },
        UserModel: { user_id: '11111111-1111-4111-8111-111111111111', user_name: 'fixture', Name: '验收员' },
        file_guid: '85ebabc1-cf99-490e-b5f7-298a77742012' }))
    }
    const runtime = new EasyRuntime('http://183.36.43.66:88', { fetcher })
    await runtime.checkSession()
    const pending = runtime.downloadFiles([{ fileId: '11111111-1111-4111-8111-111111111111', fileNo: 'A001', fileName: '验收.pdf' }], null, false, event => progress.push(event))
    await vi.advanceTimersByTimeAsync(360_001)
    expect(await pending).toMatchObject({ ok: true, data: { downloadUrl: 'http://183.36.43.66:88/AjaxServers/FileHandler.ashx?guid=85ebabc1-cf99-490e-b5f7-298a77742012' } })
    expect(progress.some(event => event.phase === 'packing' && (event.elapsedMs ?? 0) >= 345_000 && event.receivedBytes === 0)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('打包响应逐步增长超过5分钟仍持续读取，按真实字节上报并最终解析GUID', async () => {
    vi.useFakeTimers()
    const bytes: number[] = []
    const encoder = new TextEncoder()
    const result = JSON.stringify({ ClientInfo: { IsLogin: true, Status: true }, file_guid: '85ebabc1-cf99-490e-b5f7-298a77742012', note: '文件已打包' })
    const encoded = encoder.encode(result)
    const split = encoded.length - 9 // 有意切在UTF8中文文本附近。
    const fetcher: typeof fetch = async (_url, init) => new Response(new ReadableStream({ start(controller) {
      init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')))
      setTimeout(() => controller.enqueue(encoder.encode('  ')), 240_000)
      setTimeout(() => controller.enqueue(encoded.slice(0, split)), 360_000)
      setTimeout(() => { controller.enqueue(encoded.slice(split)); controller.close() }, 420_000)
    } }))
    const pending = new EasyTransport('http://183.36.43.66:88', { fetcher }).post('fileDownload', new URLSearchParams({ Call: 'DownLoad' }), undefined, undefined, received => bytes.push(received))
    await vi.advanceTimersByTimeAsync(420_001)
    expect(await pending).toMatchObject({ ok: true, data: { file_guid: '85ebabc1-cf99-490e-b5f7-298a77742012', note: '文件已打包' } })
    expect(bytes).toEqual([2, 2 + split, 2 + encoded.length])
  })
  it('取消信号仍能停止无总时限的打包，且不重发', async () => {
    const ticket = new AbortController()
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const pending = new EasyTransport('http://183.36.43.66:88', { fetcher }).post('fileDownload', new URLSearchParams({ Call: 'DownLoad' }), ticket.signal)
    ticket.abort()
    expect(await pending).toMatchObject({ ok: false, error: { code: 'REQUEST_ABORTED' } })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('DownLoad准备超过5分钟仍等待同一次请求，不取消、不重发', async () => {
    vi.useFakeTimers()
    let calls = 0
    let aborted = false
    const fetcher: typeof fetch = async (_url, init) => {
      calls++
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 360_000)
        init?.signal?.addEventListener('abort', () => { aborted = true; clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
      })
      return new Response(JSON.stringify({ ClientInfo: { IsLogin: true, Status: true }, file_guid: '85ebabc1-cf99-490e-b5f7-298a77742012' }))
    }
    const pending = new EasyTransport('http://183.36.43.66:88', { fetcher }).post('fileDownload', new URLSearchParams({ Call: 'DownLoad' }))
    await vi.advanceTimersByTimeAsync(360_001)
    expect(await pending).toMatchObject({ ok: true })
    expect(aborted).toBe(false)
    expect(calls).toBe(1)
  })
  it.each(['getFileName', 'fileDownload'] as const)('%s 在服务器需要70秒时不被旧60秒超时掐断，也不重复提交', async operation => {
    vi.useFakeTimers()
    let calls = 0
    const fetcher: typeof fetch = async (_url, init) => {
      calls++
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 70_000)
        init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
      })
      return new Response(JSON.stringify({ ClientInfo: { IsLogin: true, Status: true } }))
    }
    const call = operation === 'getFileName' ? 'GetFileName' : 'DownLoad'
    const pending = new EasyTransport('http://183.36.43.66:88', { fetcher }).post(operation, new URLSearchParams({ Call: call }))
    await vi.advanceTimersByTimeAsync(70_001)
    expect(await pending).toMatchObject({ ok: true })
    expect(calls).toBe(1)
  })
})
