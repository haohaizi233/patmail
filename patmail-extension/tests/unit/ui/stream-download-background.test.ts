import { describe, expect, it, vi } from 'vitest'
import { LocalStreamDownloads } from '../../../src/background/stream-download'
const token = 'a'.repeat(64)
describe('原生流下载后台', () => {
  it('创建后立即返回令牌，不等待原生下载收到首字节；写请求绑定来源标签且不重发', async () => {
    const calls: { path: string; init?: RequestInit }[] = []
    let accept!: (id: number) => void
    const download = vi.fn(() => new Promise<number>(resolve => { accept = resolve }))
    const fetcher: typeof fetch = async (url, init) => {
      calls.push({ path: String(url), init })
      return new Response(JSON.stringify({ protocol: 'patmail-stream-v1', token }), { status: 200 })
    }
    const service = new LocalStreamDownloads({ download, cancel: vi.fn(async () => {}) }, fetcher)
    expect(await service.command({ action: 'start', fileName: '模板.zip' }, 10)).toEqual({ ok: true, token })
    await expect(service.command({ action: 'write', token, sequence: 0, data: 'YQ==' }, 11)).rejects.toThrow()
    await service.command({ action: 'write', token, sequence: 0, data: 'YQ==' }, 10)
    expect(calls.at(-1)?.init?.body).toEqual(Uint8Array.of(97))
    accept(77)
    expect(await service.command({ action: 'finish', token }, 10)).toEqual({ ok: true, downloadId: 77 })
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ filename: '模板.zip', url: expect.stringContaining('/stream/' + token) }))
    expect(calls.filter(call => call.init?.method === 'PUT')).toHaveLength(1)
  })
  it('桥接不可用时不启动下载并说明启动入口', async () => {
    const download = vi.fn()
    const service = new LocalStreamDownloads({ download, cancel: vi.fn() }, async () => { throw new Error('offline') })
    await expect(service.command({ action: 'start', fileName: '模板.zip' }, 10)).rejects.toThrow(/start-stream-download|start.py/)
    expect(download).not.toHaveBeenCalled()
  })
})
