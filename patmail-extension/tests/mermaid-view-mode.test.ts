import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

describe('Mermaid user view preference', () => {
  it('restores the saved preference after a fresh module load', async () => {
    const data: Record<string, unknown> = {}
    vi.stubGlobal('chrome', { storage: { local: {
      get: async (key: string) => ({ [key]: data[key] }),
      set: async (items: Record<string, unknown>) => { Object.assign(data, items) }
    } } })
    const first = await import('../src/settings/mermaid-view-mode')
    await first.saveMermaidViewMode('width')
    vi.resetModules()
    expect(await (await import('../src/settings/mermaid-view-mode')).loadMermaidViewMode()).toBe('width')
  })

  it.each([undefined, null, 'bogus', {}, 100])('uses a safe default for malformed stored data: %s', async stored => {
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ 'patmail.mermaidViewMode.v1': stored }) } } })
    expect(await (await import('../src/settings/mermaid-view-mode')).loadMermaidViewMode()).toBe('window')
  })

  it('does not overwrite a new click with a late stored read', async () => {
    let release!: (data: Record<string, unknown>) => void
    vi.stubGlobal('chrome', { storage: { local: {
      get: () => new Promise(resolve => { release = resolve }), set: async () => {}
    } } })
    const settings = await import('../src/settings/mermaid-view-mode')
    const reading = settings.loadMermaidViewMode()
    await settings.saveMermaidViewMode('original')
    release({ 'patmail.mermaidViewMode.v1': 'width' })
    expect(await reading).toBe('original')
  })

  it('serializes rapid writes so the last user choice wins', async () => {
    const data: Record<string, unknown> = {}
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    vi.stubGlobal('chrome', { storage: { local: {
      get: async () => data,
      set: async (items: Record<string, unknown>) => {
        if (items['patmail.mermaidViewMode.v1'] === 'width') await held
        Object.assign(data, items)
      }
    } } })
    const settings = await import('../src/settings/mermaid-view-mode')
    const first = settings.saveMermaidViewMode('width')
    const last = settings.saveMermaidViewMode('original')
    release()
    await Promise.all([first, last])
    expect(await settings.loadMermaidViewMode()).toBe('original')
  })

  it('keeps the current choice usable when persistence fails', async () => {
    vi.stubGlobal('chrome', { storage: { local: {
      get: async () => { throw new Error('unavailable') }, set: async () => { throw new Error('quota') }
    } } })
    const settings = await import('../src/settings/mermaid-view-mode')
    expect(await settings.saveMermaidViewMode('width')).toBe(false)
    expect(await settings.loadMermaidViewMode()).toBe('width')
  })

  it('restores the latest click even if the viewer reopens before its write completes', async () => {
    let stored = 'window'
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    vi.stubGlobal('chrome', { storage: { local: {
      get: async () => ({ 'patmail.mermaidViewMode.v1': stored }),
      set: async (items: Record<string, string>) => { await held; stored = items['patmail.mermaidViewMode.v1'] }
    } } })
    const settings = await import('../src/settings/mermaid-view-mode')
    const saving = settings.saveMermaidViewMode('width')
    const reopening = settings.loadMermaidViewMode()
    await Promise.resolve()
    release()
    await saving
    expect(await reopening).toBe('width')
  })
})
