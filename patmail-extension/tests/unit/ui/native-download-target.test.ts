import { describe, expect, it, vi } from 'vitest'
import { createNativeDownloadTarget, type NativeDownloadItem, type NativeDownloadChange } from '../../../src/background/native-download-target'
import { BROWSER_FILE_CHANNEL, type BrowserFileRequest } from '../../../src/browser-download/types'

function fixture(options: { attachTimeoutMs?: number; fileName?: string } = {}) {
  let url = '', response: Response | undefined
  let items: NativeDownloadItem[] = []
  const listeners = new Set<(change: NativeDownloadChange) => void>()
  const cancel = vi.fn(async (id: number) => { const item = items.find(i => i.id === id); if (item) item.state = 'interrupted' })
  const target = createNativeDownloadTarget({ getURL: p => `chrome-extension://abc/${p}`, resolveFileName: () => options.fileName ?? '报告.zip',
    openNavigation: async value => { url = value }, attachTimeoutMs: options.attachTimeoutMs ?? 1000, pollIntervalMs: 5, finishTimeoutMs: 1000,
    downloads: { search: async () => items, cancel, onChanged: { addListener: cb => { listeners.add(cb) }, removeListener: cb => { listeners.delete(cb) } } } })
  const request = (action: BrowserFileRequest['action'], extra = {}): BrowserFileRequest => ({ channel: BROWSER_FILE_CHANNEL, targetId: 'target', taskId: 'task', owner: 'owner', action, ...extra })
  const attach = async () => {
    const opened = target.host(request('open'))
    await vi.waitFor(() => expect(url).not.toBe(''))
    const handled = target.handleFetch({ request: { url, method: 'GET', mode: 'navigate' } as Request, respondWith: r => { response = r as Response } })
    expect(handled).toBe(true); expect(await opened).toEqual({ ok: true })
    return response!.body!.getReader()
  }
  return { target, request, attach, cancel, get url() { return url }, get response() { return response },
    setItems(value: NativeDownloadItem[]) { items = value }, change(value: NativeDownloadChange) { for (const cb of listeners) cb(value) }, listeners }
}

describe('native stream download target', () => {
  it('opens on navigation attachment before any ZIP byte and uses unknown length UTF8 attachment', async () => {
    const f = fixture(); const reader = await f.attach()
    expect(f.response!.headers.get('content-length')).toBeNull()
    expect(f.response!.headers.get('content-disposition')).toContain("filename*=UTF-8''")
    await reader.cancel()
  })
  it('holds write acknowledgement until a consumer pulls, and preserves byte order', async () => {
    const f = fixture(); const reader = await f.attach(); let acknowledged = false
    const write = f.target.host(f.request('write', { offset: 0, data: btoa('abc') })).then(r => { acknowledged = true; return r })
    await new Promise(resolve => setTimeout(resolve, 15)); expect(acknowledged).toBe(false)
    expect((await reader.read()).value).toEqual(new Uint8Array([97, 98, 99])); expect(await write).toEqual({ ok: true })
    expect(await f.target.host(f.request('write', { offset: 0, data: btoa('x') }))).toMatchObject({ ok: false })
    await reader.cancel()
  })
  it('does not acknowledge finish until Chrome reports complete', async () => {
    const f = fixture(); const reader = await f.attach(); f.setItems([{ id: 7, url: f.url, state: 'in_progress' }])
    let done = false; const finish = f.target.host(f.request('finish')).then(r => { done = true; return r })
    expect(await reader.read()).toEqual({ done: true, value: undefined })
    await new Promise(resolve => setTimeout(resolve, 15)); expect(done).toBe(false)
    f.setItems([{ id: 7, url: f.url, state: 'complete' }]); expect(await finish).toEqual({ ok: true }); expect(f.listeners.size).toBe(0)
  })
  it('turns native user pause into a rejected write and cancels the old record', async () => {
    const f = fixture(); const reader = await f.attach(); f.setItems([{ id: 8, url: f.url, state: 'in_progress' }])
    await vi.waitFor(() => expect(f.listeners.size).toBe(1))
    await new Promise(resolve => setTimeout(resolve, 15))
    const pending = f.target.host(f.request('write', { offset: 0, data: btoa('abc') }))
    f.change({ id: 8, paused: { current: true } })
    expect(await pending).toMatchObject({ ok: false }); expect(await f.target.host(f.request('write', { offset: 0, data: btoa('abc') }))).toMatchObject({ ok: false })
    await vi.waitFor(() => expect(f.cancel).toHaveBeenCalledWith(8)); await reader.cancel().catch(() => {})
  })
  it('rejects consumer cancellation and finish instead of claiming saved', async () => {
    const f = fixture(); const reader = await f.attach(); const pending = f.target.host(f.request('write', { offset: 0, data: btoa('abc') }))
    await reader.cancel('user canceled'); expect(await pending).toMatchObject({ ok: false }); expect(await f.target.host(f.request('finish'))).toMatchObject({ ok: false })
  })
  it('rejects foreign owners and does not consume the one-use URL for a fetch request', async () => {
    const f = fixture(); const reader = await f.attach()
    expect(await f.target.host(f.request('pause', { owner: 'other' }))).toMatchObject({ ok: false })
    let status = 0
    expect(f.target.handleFetch({ request: { url: f.url, method: 'GET', mode: 'navigate' } as Request, respondWith: r => { status = (r as Response).status } })).toBe(true)
    expect(status).toBe(404)
    expect(f.target.handleFetch({ request: { url: f.url.replace('//abc/', '//other/'), method: 'GET', mode: 'navigate' } as Request, respondWith: () => {} })).toBe(false)
    await reader.cancel()
  })
  it('times out an unattached navigation and leaves no listeners running', async () => {
    const f = fixture({ attachTimeoutMs: 20 }); expect(await f.target.host(f.request('open'))).toMatchObject({ ok: false }); expect(f.listeners.size).toBe(0)
  })
  it('pause releases a blocked producer and cancels the native download', async () => {
    const f = fixture(); await f.attach(); f.setItems([{ id: 9, url: f.url, state: 'in_progress' }]); await new Promise(resolve => setTimeout(resolve, 15))
    const pending = f.target.host(f.request('write', { offset: 0, data: btoa('abc') })); expect(await f.target.host(f.request('pause'))).toEqual({ ok: true })
    expect(await pending).toMatchObject({ ok: false }); expect(f.cancel).toHaveBeenCalledWith(9); expect(f.listeners.size).toBe(0)
  })
  it('reports actual Chrome progress and propagates an interruption before another write', async () => {
    const f = fixture(); const reader = await f.attach()
    f.setItems([{ id: 10, url: f.url, state: 'in_progress', bytesReceived: 123, totalBytes: 1000 }])
    expect(await f.target.status('target')).toEqual({ downloadId: 10, state: 'inProgress', receivedBytes: 123, totalBytes: 1000 })
    f.setItems([{ id: 10, url: f.url, state: 'interrupted', bytesReceived: 123 }])
    await expect(f.target.status('target')).rejects.toThrow('缓存已保留')
    await reader.cancel().catch(() => {})
  })
  it('a non-navigation request cannot burn a fresh capability', async () => {
    const f = fixture(); const opened = f.target.host(f.request('open'))
    await vi.waitFor(() => expect(f.url).not.toBe(''))
    let status = 0
    f.target.handleFetch({ request: { url: f.url, method: 'GET', mode: 'cors' } as Request, respondWith: r => { status = (r as Response).status } })
    expect(status).toBe(404)
    let response: Response | undefined
    f.target.handleFetch({ request: { url: f.url, method: 'GET', mode: 'navigate' } as Request, respondWith: r => { response = r as Response } })
    expect(await opened).toEqual({ ok: true }); await response!.body!.cancel()
  })
})

it('serves raw PDF with PDF MIME and suffix through the native stream', async () => {
 const f=fixture({fileName:'Summary-WIPO123.pdf'});const reader=await f.attach()
 expect(f.url).toMatch(/\.pdf$/)
 expect(f.response!.headers.get('content-type')).toBe('application/pdf')
 expect(f.response!.headers.get('content-disposition')).toContain('filename="PatMail.pdf"')
 await reader.cancel()
})
