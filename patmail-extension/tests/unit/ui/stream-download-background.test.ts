import { describe, expect, it, vi } from 'vitest'
import { LocalStreamDownloads } from '../../../src/background/stream-download'
const token = 'a'.repeat(64)
describe('原生流下载后台', () => {
  it.each([false, true])('封存前取消的活动下载不能被自动续传（持久任务：%s）', async durable => {
    const taskId = '11111111-1111-4111-8111-111111111111'
    let state = 'in_progress'
    const resume = vi.fn(async () => { state = 'complete' })
    const service = new LocalStreamDownloads({
      download: async () => 77, cancel: vi.fn(), resume,
      search: async (query: chrome.downloads.DownloadQuery) => 'urlRegex' in query ? [] : [{ id: 77, state, canResume: true, error: 'USER_CANCELED' }]
    } as never, async () => new Response(JSON.stringify({ protocol: 'patmail-stream-v1', token,
      ...(durable ? { version: 2, taskId } : {}) })))
    await service.command({ action: 'start', fileName: '取消.zip', ...(durable ? { manifest: {} } : {}) }, 10)
    // 原生取消发生在前台两次状态轮询之间，随后生产者封存 ZIP。
    state = 'interrupted'
    await expect(service.command({ action: 'finish', token }, 10)).rejects.toThrow(/取消/)
    expect(state).toBe('interrupted')
    expect(resume).not.toHaveBeenCalled()
  })
  it.each(['NETWORK_FAILED', 'USER_CANCELED'])('持久任务恢复复用原downloadId，封存后才续传并保留暂停任务（%s）', async error => {
    const id = '11111111-1111-4111-8111-111111111111'
    const calls: string[] = []
    const download = vi.fn(), resume = vi.fn(async () => {})
    const fetcher: typeof fetch = async (url, init) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions -- 存量豁免：多项历史存量，理由见 docs/ci/quality-gates.md
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      return new Response(JSON.stringify({ protocol: 'patmail-stream-v1', version: 2, token, taskId: id, sealed: true, manifest: {} }))
    }
    const service = new LocalStreamDownloads({ download, cancel: vi.fn(), resume,
      search: vi.fn(async () => [{ id: 77, state: 'interrupted', canResume: true, error }]) } as never, fetcher)
    const created = await service.command({ action: 'start', fileName: '模板.zip', taskId: id, manifest: {} }, 10, 'origin|owner')
    expect(created).toMatchObject({ taskId: id, downloadId: 77 })
    expect(download).not.toHaveBeenCalled()
    await service.command({ action: 'finish', token }, 10)
    expect(resume).toHaveBeenCalledWith(77)
    await service.command({ action: 'pause', token }, 10)
    expect(calls.some(path => path.includes('/pause/'))).toBe(true)
    expect((await service.command({ action: 'status', token }, 10)).downloadId).toBe(77)
  })
  it('活动任务的网络中断仍可在封存后自动续传，显式恢复也可续传用户取消', async () => {
    let error = 'NETWORK_FAILED'
    let state = 'interrupted'
    const service = new LocalStreamDownloads({
      download: async () => 77, cancel: vi.fn(),
      resume: async () => { state = 'in_progress' },
      search: async () => [{ id: 77, state, canResume: true, error }]
    } as never, async () => new Response(JSON.stringify({ protocol: 'patmail-stream-v1', token, sealed: true })))
    await service.command({ action: 'start', fileName: '恢复.zip' }, 10)
    await service.command({ action: 'finish', token }, 10)
    expect(state).toBe('in_progress')
    state = 'interrupted'; error = 'USER_CANCELED'
    await service.command({ action: 'resume', token }, 10)
    expect(state).toBe('in_progress')
  })
  it('创建后立即返回令牌，不等待原生下载收到首字节；写请求绑定来源标签且不重发', async () => {
    const calls: { path: string; init?: RequestInit }[] = []
    let accept!: (id: number) => void
    const download = vi.fn(() => new Promise<number>(resolve => { accept = resolve }))
    const fetcher: typeof fetch = async (url, init) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 存量豁免：外部数据宽松 String() 兜底，保留既有校验行为
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
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
