import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDownloadNamePreview, type DownloadNamePreviewState } from '../../../src/app/services/download-name-preview'
import type { FileDownloadSelection } from '../../../src/mail/download-name'
import { MessageType, type ContentRequest, type ContentResponse, type MessageBridge } from '../../../src/shared/message'

afterEach(() => vi.useRealTimers())
function readPreviewNames(preview: ReturnType<typeof createDownloadNamePreview>, ids: string[], selection: FileDownloadSelection | null): Record<string, string> {
  return preview.snapshot(ids, selection)
}
describe('download name preview scheduling', () => {
  it('resets names and isolates old requests when account or query context changes', async () => {
    vi.useFakeTimers()
    const finish: ((response: ContentResponse) => void)[] = []
    const request = vi.fn(() => new Promise<ContentResponse>(resolve => finish.push(resolve)))
    let state: DownloadNamePreviewState | undefined
    const preview = createDownloadNamePreview({ request }, value => { state = value })
    const recipe = { newFilename: 'one', fileNameType: 'txt' }
    preview.refresh(['one'], recipe)
    await vi.advanceTimersByTimeAsync(250)
    preview.clear()
    preview.refresh(['one'], recipe)
    await vi.advanceTimersByTimeAsync(250)
    expect(request).toHaveBeenCalledTimes(2)
    finish[0]({ type: MessageType.ResolveDownloadNamesResult, payload: { ok: true, data: { names: ['old.pdf'] } } })
    await vi.advanceTimersByTimeAsync(0)
    expect(state?.names).toEqual({})
    finish[1]({ type: MessageType.ResolveDownloadNamesResult, payload: { ok: true, data: { names: ['current.pdf'] } } })
    await vi.advanceTimersByTimeAsync(0)
    expect(state?.names).toEqual({ one: 'current.pdf' })
    preview.clear()
    preview.refresh(['one'], recipe)
    expect(state?.names).toEqual({})
    preview.cancel()
  })

  it('snapshots only cached requested IDs and normalizes an explicit recipe without templateId', async () => {
    vi.useFakeTimers()
    const requests: { ids: string[]; finish: (response: ContentResponse) => void }[] = []
    const request = vi.fn((message: ContentRequest) => new Promise<ContentResponse>(resolve => {
      if (message.type === MessageType.ResolveDownloadNames) requests.push({ ids: message.payload.fileIds, finish: resolve })
    }))
    const bridge: MessageBridge = { request }
    let state: DownloadNamePreviewState | undefined
    const preview = createDownloadNamePreview(bridge, value => { state = value })
    const templateRecipe = { templateId: 'template', newFilename: 'one', fileNameType: 'txt' }
    const explicitRecipe = { newFilename: 'one', fileNameType: 'txt' }

    expect(readPreviewNames(preview, ['one'], templateRecipe)).toEqual({})
    expect(request).not.toHaveBeenCalled()
    preview.refresh(['one', 'two', 'three'], templateRecipe)
    await vi.advanceTimersByTimeAsync(250)
    requests[0].finish({ type: MessageType.ResolveDownloadNamesResult, payload: { ok: true, data: { names: ['one.pdf', 'two.pdf', 'three.pdf'] } } })
    await vi.advanceTimersByTimeAsync(0)

    expect(readPreviewNames(preview, ['two', 'missing', 'one', 'two'], explicitRecipe)).toEqual({ two: 'two.pdf', one: 'one.pdf' })
    expect(readPreviewNames(preview, ['one', 'two', 'three'], { newFilename: 'different', fileNameType: 'txt' })).toEqual({})
    preview.refresh(['one', 'two', 'three'], explicitRecipe)
    expect(state).toMatchObject({ names: { one: 'one.pdf', two: 'two.pdf', three: 'three.pdf' }, done: 3, pending: false })
    await vi.advanceTimersByTimeAsync(250)
    expect(requests).toHaveLength(1)

    preview.clear()
    expect(readPreviewNames(preview, ['one', 'two', 'three'], explicitRecipe)).toEqual({})
    preview.cancel()
  })

  it('keeps a late result from a canceled generation snapshotable in the same context', async () => {
    vi.useFakeTimers()
    let finish!: (response: ContentResponse) => void
    const bridge: MessageBridge = { request: vi.fn(() => new Promise<ContentResponse>(resolve => { finish = resolve })) }
    const preview = createDownloadNamePreview(bridge, () => {})
    const recipe = { newFilename: 'one', fileNameType: 'txt' }
    preview.refresh(['late'], recipe)
    await vi.advanceTimersByTimeAsync(250)
    preview.cancel()
    finish({ type: MessageType.ResolveDownloadNamesResult, payload: { ok: true, data: { names: ['late.pdf'] } } })
    await vi.advanceTimersByTimeAsync(0)

    expect(readPreviewNames(preview, ['late'], recipe)).toEqual({ late: 'late.pdf' })
    preview.clear()
  })

  it('reuses a pending recipe after cache eviction and merges its result into the current cache', async () => {
    vi.useFakeTimers()
    let finish!: (response: ContentResponse) => void
    const request = vi.fn(() => new Promise<ContentResponse>(resolve => { finish = resolve }))
    let state: DownloadNamePreviewState | undefined
    const preview = createDownloadNamePreview({ request }, value => { state = value })
    const recipe = { newFilename: 'one', fileNameType: 'txt' }
    preview.refresh(['one'], recipe)
    await vi.advanceTimersByTimeAsync(250)
    for (let i = 0; i < 8; i++) preview.refresh(['one'], { newFilename: `other${i}`, fileNameType: 'txt' })
    preview.refresh(['one'], recipe)
    await vi.advanceTimersByTimeAsync(250)
    expect(request).toHaveBeenCalledTimes(1)
    finish({ type: MessageType.ResolveDownloadNamesResult, payload: { ok: true, data: { names: ['current.pdf'] } } })
    await vi.advanceTimersByTimeAsync(0)
    expect(state).toMatchObject({ names: { one: 'current.pdf' }, done: 1, pending: false, error: '' })
    preview.cancel()
  })
  it('coalesces pending batches after candidate refresh and retains successful older recipes in cache', async () => {
    vi.useFakeTimers()
    const requests: { ids: string[]; finish: (response: ContentResponse) => void }[] = []
    const bridge: MessageBridge = { request: vi.fn((message: ContentRequest) => new Promise<ContentResponse>(resolve => {
      if (message.type === MessageType.ResolveDownloadNames) requests.push({ ids: message.payload.fileIds, finish: resolve })
    })) }
    let state: DownloadNamePreviewState | undefined
    const preview = createDownloadNamePreview(bridge, value => { state = value })
    const ids = Array.from({ length: 80 }, (_, i) => `file-${i}`)
    const recipe = { newFilename: 'old', fileNameType: 'txt' }
    preview.refresh(ids, recipe)
    await vi.advanceTimersByTimeAsync(250)
    preview.refresh(ids, recipe)
    await vi.advanceTimersByTimeAsync(250)
    expect(requests).toHaveLength(2)
    preview.refresh(ids, { newFilename: 'new', fileNameType: 'txt' })
    requests.forEach(request => request.finish({ type: MessageType.ResolveDownloadNamesResult, payload: { ok: true, data: { names: request.ids.map(id => `${id}.pdf`) } } }))
    await vi.advanceTimersByTimeAsync(0)
    expect(state?.names).toEqual({})
    preview.refresh(ids, recipe)
    expect(state?.done).toBe(80)
    await vi.advanceTimersByTimeAsync(250)
    expect(requests).toHaveLength(2)
    preview.cancel()
  })
  it('batches forty IDs with at most six in flight, and ignores replies from an older recipe', async () => {
    vi.useFakeTimers()
    const requests: { ids: string[]; finish: (response: ContentResponse) => void }[] = []
    const bridge: MessageBridge = { request: vi.fn((message: ContentRequest) => new Promise<ContentResponse>(resolve => {
      if (message.type === MessageType.ResolveDownloadNames) requests.push({ ids: message.payload.fileIds, finish: resolve })
    })) }
    let state: DownloadNamePreviewState | undefined
    const preview = createDownloadNamePreview(bridge, value => { state = value })
    const ids = Array.from({ length: 321 }, (_, i) => `file-${i}`)
    preview.refresh(ids, { templateId: 'template', newFilename: 'old', fileNameType: 'txt' })
    await vi.advanceTimersByTimeAsync(250)
    expect(requests).toHaveLength(6)
    expect(requests.every(request => request.ids.length === 40)).toBe(true)
    preview.refresh(ids, { templateId: 'template', newFilename: 'new', fileNameType: 'txt' })
    requests.slice(0, 6).forEach(request => request.finish({ type: MessageType.ResolveDownloadNamesResult, payload: { ok: true, data: { names: request.ids.map(() => 'stale.pdf') } } }))
    await vi.advanceTimersByTimeAsync(250)
    expect(requests).toHaveLength(12)
    expect(state?.names).toEqual({})
    requests.slice(6).forEach(request => request.finish({ type: MessageType.ResolveDownloadNamesResult, payload: { ok: true, data: { names: request.ids.map(id => `${id}.pdf`) } } }))
    await vi.advanceTimersByTimeAsync(0)
    expect(requests).toHaveLength(15)
    expect(requests[14].ids).toHaveLength(1)
    requests.slice(12).forEach(request => request.finish({ type: MessageType.ResolveDownloadNamesResult, payload: { ok: true, data: { names: request.ids.map(id => `${id}.pdf`) } } }))
    await vi.advanceTimersByTimeAsync(0)
    expect(state?.done).toBe(321)
    expect(state?.pending).toBe(false)
    expect(Object.values(state!.names)).not.toContain('stale.pdf')
    preview.refresh(ids, { templateId: 'template', newFilename: 'new', fileNameType: 'txt' })
    await vi.advanceTimersByTimeAsync(250)
    expect(requests).toHaveLength(15)
    preview.cancel()
  })

  it('does not contact the source without DIY, and exposes errors without removing unknown candidates', async () => {
    vi.useFakeTimers()
    const request = vi.fn(async () => ({ type: MessageType.Error, payload: { message: 'offline' } }))
    let state: DownloadNamePreviewState | undefined
    const preview = createDownloadNamePreview({ request }, value => { state = value })
    preview.refresh(['one'], null)
    await vi.advanceTimersByTimeAsync(250)
    expect(request).not.toHaveBeenCalled()
    preview.refresh(['one'], { newFilename: 'test', fileNameType: 'txt' })
    await vi.advanceTimersByTimeAsync(250)
    expect(state).toMatchObject({ names: {}, error: 'offline', pending: false })
    preview.cancel()
  })
})
