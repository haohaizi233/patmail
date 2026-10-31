import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'

const corePath = resolve(process.cwd(), 'scripts/cdp-observer-core.mjs')
const loadedObserver: unknown = existsSync(corePath) ? await import(pathToFileURL(corePath).href) : {}
const observer = loadedObserver as Record<string, unknown>

function required<T extends (...args: never[]) => unknown>(name: string): T {
  const value = observer[name]
  expect(value, `cdp-observer-core must export ${name}`).toBeTypeOf('function')
  return value as T
}

describe('CDP observer endpoint policy', () => {
  it('enables Node 20 native WebSocket while leaving newer runtimes unchanged', () => {
    const nativeWebSocketFlags = required<(version: string, available: boolean) => string[]>('nativeWebSocketFlags')
    expect(nativeWebSocketFlags('20.19.0', false)).toEqual(['--experimental-websocket'])
    expect(nativeWebSocketFlags('24.14.0', false)).toEqual([])
    expect(nativeWebSocketFlags('20.19.0', true)).toEqual([])
  })

  it('classifies connect timeouts and cleans every WebSocket handshake listener', async () => {
    const connectionFailureReason = required<(error: Error) => string>('connectionFailureReason')
    const waitForWebSocketOpen = required<(socket: object, timeoutMs: number) => Promise<void>>('waitForWebSocketOpen')
    const listeners = new Map<string, Set<() => void>>()
    const socket = {
      addEventListener: vi.fn((type: string, listener: () => void) => {
        const set = listeners.get(type) ?? new Set<() => void>()
        set.add(listener)
        listeners.set(type, set)
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => listeners.get(type)?.delete(listener)),
      close: vi.fn(() => {
        for (const listener of listeners.get('error') ?? []) listener()
      }),
    }

    const waiting = waitForWebSocketOpen(socket, 5)
    await expect(waiting).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(connectionFailureReason(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))).toBe('connect_timeout')
    expect(connectionFailureReason(new Error('socket refused'))).toBe('connect_failed')
    expect(connectionFailureReason(Object.assign(new Error('no endpoint'), { name: 'EndpointUnavailableError' }))).toBe('endpoint_unavailable')
    expect(socket.close).toHaveBeenCalledOnce()
    expect([...listeners.values()].every(set => set.size === 0)).toBe(true)
  })

  it('closes the connecting socket when stop is requested during the handshake', () => {
    const closeTrackedSockets = required<(connecting: { close: () => void }, active?: { close: () => void } | null) => void>('closeTrackedSockets')
    const connecting = { close: vi.fn() }
    closeTrackedSockets(connecting, null)
    expect(connecting.close).toHaveBeenCalledOnce()
  })

  it('converts local HTTP DevTools endpoints to WebSocket endpoints', async () => {
    const resolveWebSocketEndpoint = required<(value: string, options?: object) => Promise<string>>('resolveWebSocketEndpoint')
    await expect(resolveWebSocketEndpoint('http://127.0.0.1:49323/devtools/browser/test'))
      .resolves.toBe('ws://127.0.0.1:49323/devtools/browser/test')
  })

  it('discovers the advertised WebSocket URL from a local /json/version endpoint', async () => {
    const resolveWebSocketEndpoint = required<(value: string, options?: object) => Promise<string>>('resolveWebSocketEndpoint')
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ webSocketDebuggerUrl: 'ws://localhost:49323/devtools/browser/discovered' }),
    })
    await expect(resolveWebSocketEndpoint('http://localhost:49323/json/version', { fetchImpl }))
      .resolves.toBe('ws://localhost:49323/devtools/browser/discovered')
  })

  it('rejects non-loopback hosts, including deceptive localhost suffixes', async () => {
    const resolveWebSocketEndpoint = required<(value: string) => Promise<string>>('resolveWebSocketEndpoint')
    await expect(resolveWebSocketEndpoint('ws://192.168.1.20:9222/devtools/browser/x'))
      .rejects.toThrow(/localhost|loopback/i)
    await expect(resolveWebSocketEndpoint('http://localhost.attacker.example:9222/json/version'))
      .rejects.toThrow(/localhost|loopback/i)
  })

  it('rejects a remote WebSocket URL advertised by a local version endpoint', async () => {
    const resolveWebSocketEndpoint = required<(value: string, options?: object) => Promise<string>>('resolveWebSocketEndpoint')
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ webSocketDebuggerUrl: 'ws://192.168.1.20:9222/devtools/browser/x' }),
    })
    await expect(resolveWebSocketEndpoint('http://127.0.0.1:9222/json/version', { fetchImpl }))
      .rejects.toThrow(/localhost|loopback/i)
  })
})

describe('CDP observer endpoint discovery', () => {
  it('resolves the endpoint from the argument, discovery, saved config, or nothing', async () => {
    const resolveEndpoint = required<(options: Record<string, unknown>) => Promise<{ endpoint: string | null; source: string }>>('resolveEndpoint')
    const root = mkdtempSync(join(tmpdir(), 'patmail-cdp-root-'))
    const browserDir = mkdtempSync(join(tmpdir(), 'patmail-cdp-browser-'))
    const emptyDir = mkdtempSync(join(tmpdir(), 'patmail-cdp-empty-'))
    try {
      mkdirSync(join(root, 'log', 'cdp'), { recursive: true })
      writeFileSync(join(root, 'log', 'cdp', 'config.json'), JSON.stringify({ endpoint: 'ws://127.0.0.1:12000/devtools/browser' }))
      writeFileSync(join(browserDir, 'DevToolsActivePort'), '12000\n/devtools/browser\n')

      const advertised = 'ws://127.0.0.1:12000/devtools/browser/abc123'
      const fetchOk = async () => ({ ok: true, json: async () => ({ webSocketDebuggerUrl: advertised }) })
      const fetchDown = async () => {
        throw new Error('offline')
      }

      await expect(resolveEndpoint({ root, endpoint: 'http://127.0.0.1:13000', userDataDirs: [browserDir], fetchImpl: fetchOk }))
        .resolves.toEqual({ endpoint: 'http://127.0.0.1:13000/', source: 'argument' })
      await expect(resolveEndpoint({ root, userDataDirs: [browserDir], fetchImpl: fetchOk }))
        .resolves.toEqual({ endpoint: advertised, source: 'discovery' })
      await expect(resolveEndpoint({ root, userDataDirs: [emptyDir], fetchImpl: fetchDown }))
        .resolves.toEqual({ endpoint: 'ws://127.0.0.1:12000/devtools/browser', source: 'saved' })

      const bareRoot = mkdtempSync(join(tmpdir(), 'patmail-cdp-bare-'))
      try {
        await expect(resolveEndpoint({ root: bareRoot, userDataDirs: [emptyDir], fetchImpl: fetchDown }))
          .resolves.toEqual({ endpoint: null, source: 'none' })
      } finally {
        rmSync(bareRoot, { recursive: true, force: true })
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(browserDir, { recursive: true, force: true })
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })

  it('ignores non-loopback advertised URLs and can fall back to the active port', async () => {
    const discoverDevToolsEndpoint = required<(options: Record<string, unknown>) => Promise<string | null>>('discoverDevToolsEndpoint')
    const browserDir = mkdtempSync(join(tmpdir(), 'patmail-cdp-browser-'))
    try {
      writeFileSync(join(browserDir, 'DevToolsActivePort'), '12000\n/devtools/browser\n')
      const remote = async () => ({ ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://192.168.1.20:9222/devtools/browser/x' }) })
      await expect(discoverDevToolsEndpoint({ userDataDirs: [browserDir], fetchImpl: remote })).resolves.toBeNull()
      const offline = async () => {
        throw new Error('offline')
      }
      await expect(discoverDevToolsEndpoint({ userDataDirs: [browserDir], fetchImpl: offline, requireAdvertisedUrl: false, wsProbeImpl: async () => true }))
        .resolves.toBe('ws://127.0.0.1:12000/devtools/browser')
    } finally {
      rmSync(browserDir, { recursive: true, force: true })
    }
  })

  it('falls back to the generic browser path when the recorded path rejects connections', async () => {
    const discoverDevToolsEndpoint = required<(options: Record<string, unknown>) => Promise<string | null>>('discoverDevToolsEndpoint')
    const browserDir = mkdtempSync(join(tmpdir(), 'patmail-cdp-browser-'))
    try {
      writeFileSync(join(browserDir, 'DevToolsActivePort'), '12000\n/devtools/browser/abc123\n')
      const offline = async () => {
        throw new Error('offline')
      }
      const probed: string[] = []
      const wsProbeImpl = async (url: string) => {
        probed.push(url)
        return url === 'ws://127.0.0.1:12000/devtools/browser'
      }
      await expect(discoverDevToolsEndpoint({ userDataDirs: [browserDir], fetchImpl: offline, wsProbeImpl }))
        .resolves.toBe('ws://127.0.0.1:12000/devtools/browser')
      expect(probed).toEqual([
        'ws://127.0.0.1:12000/devtools/browser/abc123',
        'ws://127.0.0.1:12000/devtools/browser',
      ])
    } finally {
      rmSync(browserDir, { recursive: true, force: true })
    }
  })

  it('reports no endpoint while every candidate socket is unreachable', async () => {
    const discoverDevToolsEndpoint = required<(options: Record<string, unknown>) => Promise<string | null>>('discoverDevToolsEndpoint')
    const browserDir = mkdtempSync(join(tmpdir(), 'patmail-cdp-browser-'))
    try {
      writeFileSync(join(browserDir, 'DevToolsActivePort'), '12000\n/devtools/browser/abc123\n')
      const offline = async () => {
        throw new Error('offline')
      }
      await expect(discoverDevToolsEndpoint({ userDataDirs: [browserDir], fetchImpl: offline, wsProbeImpl: async () => false }))
        .resolves.toBeNull()
    } finally {
      rmSync(browserDir, { recursive: true, force: true })
    }
  })

  it('trusts the recorded path only when socket probing is unavailable', async () => {
    const discoverDevToolsEndpoint = required<(options: Record<string, unknown>) => Promise<string | null>>('discoverDevToolsEndpoint')
    const browserDir = mkdtempSync(join(tmpdir(), 'patmail-cdp-browser-'))
    try {
      writeFileSync(join(browserDir, 'DevToolsActivePort'), '12000\n/devtools/browser/abc123\n')
      const offline = async () => {
        throw new Error('offline')
      }
      await expect(discoverDevToolsEndpoint({ userDataDirs: [browserDir], fetchImpl: offline, webSocketImpl: null, requireAdvertisedUrl: false }))
        .resolves.toBe('ws://127.0.0.1:12000/devtools/browser/abc123')
      await expect(discoverDevToolsEndpoint({ userDataDirs: [browserDir], fetchImpl: offline, webSocketImpl: null }))
        .resolves.toBeNull()
    } finally {
      rmSync(browserDir, { recursive: true, force: true })
    }
  })

  it('builds candidate browser WebSocket URLs and probes them with a bounded handshake', async () => {
    const candidateDevToolsWebSocketUrls = required<(port: number, browserPath: string) => string[]>('candidateDevToolsWebSocketUrls')
    const probeWebSocketEndpoint = required<(url: string, options?: Record<string, unknown>) => Promise<boolean | null>>('probeWebSocketEndpoint')
    expect(candidateDevToolsWebSocketUrls(9222, '/devtools/browser/abc123')).toEqual([
      'ws://127.0.0.1:9222/devtools/browser/abc123',
      'ws://127.0.0.1:9222/devtools/browser',
    ])
    expect(candidateDevToolsWebSocketUrls(9222, 'nonsense')).toEqual(['ws://127.0.0.1:9222/devtools/browser'])

    const makeSocket = (result: 'open' | 'error' | 'hang') =>
      class {
        private listeners = new Map<string, Set<() => void>>()
        constructor() {
          if (result === 'hang') return
          queueMicrotask(() => {
            for (const listener of this.listeners.get(result === 'open' ? 'open' : 'error') ?? []) listener()
          })
        }
        addEventListener(type: string, listener: () => void) {
          const set = this.listeners.get(type) ?? new Set<() => void>()
          set.add(listener)
          this.listeners.set(type, set)
        }
        removeEventListener(type: string, listener: () => void) {
          this.listeners.get(type)?.delete(listener)
        }
        close() {}
      }
    await expect(probeWebSocketEndpoint('ws://127.0.0.1:9222/devtools/browser', { webSocketImpl: makeSocket('open') })).resolves.toBe(true)
    await expect(probeWebSocketEndpoint('ws://127.0.0.1:9222/devtools/browser', { webSocketImpl: makeSocket('error') })).resolves.toBe(false)
    await expect(probeWebSocketEndpoint('ws://127.0.0.1:9222/devtools/browser', { webSocketImpl: makeSocket('hang'), timeoutMs: 5 })).resolves.toBe(false)
    await expect(probeWebSocketEndpoint('ws://127.0.0.1:9222/devtools/browser', { webSocketImpl: null })).resolves.toBeNull()
  })

  it('parses DevToolsActivePort and rejects malformed port files', () => {
    const parseDevToolsActivePort = required<(content: string) => { port: number; browserPath: string } | null>('parseDevToolsActivePort')
    expect(parseDevToolsActivePort('12000\n/devtools/browser\n')).toEqual({ port: 12000, browserPath: '/devtools/browser' })
    expect(parseDevToolsActivePort('9222')).toEqual({ port: 9222, browserPath: '/devtools/browser' })
    expect(parseDevToolsActivePort('not-a-port\n/devtools/browser')).toBeNull()
    expect(parseDevToolsActivePort('70000\n/devtools/browser')).toBeNull()
  })

  it('honours PATMAIL_CDP_USER_DATA_DIRS before the platform defaults', () => {
    const candidateUserDataDirs = required<(env: object, home: string) => string[]>('candidateUserDataDirs')
    const custom = [join('D:', 'custom', 'User Data'), join('E:', 'edge', 'User Data')]
    const dirs = candidateUserDataDirs({ PATMAIL_CDP_USER_DATA_DIRS: custom.join(delimiter) }, join('C:', 'Users', 'test'))
    expect(dirs.slice(0, 2)).toEqual(custom)
    expect(new Set(dirs).size).toBe(dirs.length)
    expect(candidateUserDataDirs({}, join('C:', 'Users', 'test')).length).toBeGreaterThan(1)
  })
})

describe('CDP observer target and event filtering', () => {
  it('blocks the download behavior command before it reaches the protocol transport', () => {
    const createCdpSender = required<(transport: (command: unknown) => unknown) => (command: { method: string }) => unknown>('createCdpSender')
    const transport = vi.fn((command: unknown): unknown => command)
    const send = createCdpSender(transport)

    expect(send({ method: 'Target.getTargets' })).toEqual({ method: 'Target.getTargets' })
    expect(() => send({ method: 'Browser.setDownloadBehavior' })).toThrow(/blocked/i)
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport).toHaveBeenCalledWith({ method: 'Target.getTargets' })
  })

  it('does not import or connect Playwright from either service module', () => {
    const cli = readFileSync(resolve(process.cwd(), 'scripts/cdp-observer.mjs'), 'utf8')
    const core = readFileSync(resolve(process.cwd(), 'scripts/cdp-observer-core.mjs'), 'utf8')
    expect(`${cli}\n${core}`).not.toMatch(/playwright|connectOverCDP/i)
  })

  it('selects only the PatMail app, its extension workers, and the EASY host', () => {
    const selectTargets = required<(targets: Array<Record<string, unknown>>, knownIds?: Set<string>) => Array<{ targetId: string; source: string }>>('selectTargets')
    const targets = [
      { targetId: 'app', type: 'page', title: 'PatMail', url: 'chrome-extension://abc123/app.html' },
      { targetId: 'foreign-app', type: 'page', title: 'Other', url: 'chrome-extension://foreign/app.html' },
      { targetId: 'worker', type: 'service_worker', title: '', url: 'chrome-extension://abc123/background.js' },
      { targetId: 'easy', type: 'page', title: 'EASY', url: 'http://183.36.43.66:88/Default.aspx' },
      { targetId: 'lookalike', type: 'page', title: 'Other', url: 'https://183.36.43.660/' },
      { targetId: 'other-extension', type: 'page', title: 'Other', url: 'chrome-extension://different/options.html' },
      { targetId: 'unrelated', type: 'page', title: 'News', url: 'https://example.test/' },
    ]

    expect(selectTargets(targets)).toEqual([
      { targetId: 'app', source: 'app' },
      { targetId: 'worker', source: 'app' },
      { targetId: 'easy', source: 'easy' },
    ])
    expect(selectTargets([{ targetId: 'easy', type: 'page', title: 'Other', url: 'https://example.test/' }])).toEqual([])
  })

  it('preserves target type and URL metadata when adding the flattened session ID', () => {
    const targetSessionMetadata = required<(target: Record<string, unknown>, sessionId: string) => Record<string, unknown>>('targetSessionMetadata')
    expect(targetSessionMetadata({ targetId: 'app', source: 'app', type: 'page', title: 'PatMail', url: 'chrome-extension://patmail-id/app.html' }, 'session-1'))
      .toEqual({ targetId: 'app', source: 'app', type: 'page', title: 'PatMail', url: 'chrome-extension://patmail-id/app.html', sessionId: 'session-1' })
  })

  it('keeps network metadata to origin, path, and Call without reading request bodies', () => {
    const safeNetworkUrl = required<(url: string, postData?: string) => Record<string, unknown>>('safeNetworkUrl')
    expect(safeNetworkUrl('https://user:pass@183.36.43.66:88/Ajax/Report.ashx?Call=GetRows&token=secret&x=1'))
      .toEqual({ origin: 'https://183.36.43.66:88', path: '/Ajax/Report.ashx', call: 'GetRows' })
    expect(safeNetworkUrl('http://183.36.43.66:88/AjaxServers/Report.ashx', 'Call=DownLoad&password=private&token=secret'))
      .toEqual({ origin: 'http://183.36.43.66:88', path: '/AjaxServers/Report.ashx', call: 'DownLoad' })
  })

  it('records only safe response status, MIME, and timing metadata', () => {
    const safeNetworkResponseEvent = required<(request: Record<string, unknown>, params: Record<string, unknown>) => Record<string, unknown>>('safeNetworkResponseEvent')
    expect(safeNetworkResponseEvent({
      source: 'easy', requestId: '41.2', origin: 'http://183.36.43.66:88', path: '/AjaxServers/Report.ashx', call: 'GetFile', started: 10,
    }, {
      timestamp: 11.234,
      response: { status: 403, mimeType: 'text/html; charset=utf-8', headers: { authorization: 'private' }, body: 'private' },
    })).toEqual({
      source: 'easy', requestId: '41.2', origin: 'http://183.36.43.66:88', path: '/AjaxServers/Report.ashx', call: 'GetFile', elapsedMs: 1234, status: 403, mime: 'text/html',
    })
  })

  it('archives only progress/error metadata from runtime messages', () => {
    const safeRuntimeMetadata = required<(message: unknown) => Record<string, unknown> | null>('safeRuntimeMetadata')
    expect(safeRuntimeMetadata({
      channel: 'patmail-download-progress',
      message: { type: 'DOWNLOAD_PROGRESS', token: 'secret', data: 'base64-private', manifest: { secret: true } },
      payload: { phase: 'saving', progress: 64, completed: 4, total: 8, credentials: 'private' },
    })).toEqual({
      channel: 'patmail-download-progress',
      type: 'DOWNLOAD_PROGRESS',
      phase: 'saving',
      progress: 64,
      completed: 4,
      total: 8,
    })

    expect(safeRuntimeMetadata({ channel: 'unrelated', payload: { token: 'secret', data: 'private' } })).toBeNull()
  })

  it('extracts the actual onMessage CALL and packet.progress object without retaining message bodies', () => {
    const safeRuntimeMetadata = required<(message: unknown) => Record<string, unknown> | null>('safeRuntimeMetadata')
    expect(safeRuntimeMetadata({
      channel: 'patmail-download-progress',
      message: { type: 'DOWNLOAD_FILES', payload: { Call: 'DownloadFiles', taskId: 'task-42', rows: [{ customer: 'private' }] } },
      progress: { done: 5, total: 12, phase: 'packing', receivedBytes: 512, failed: 1, deduplicated: 2, token: 'secret' },
    })).toEqual({
      channel: 'patmail-download-progress',
      type: 'DOWNLOAD_FILES',
      call: 'DownloadFiles',
      taskId: 'task-42',
      phase: 'packing',
      progress: { done: 5, total: 12, phase: 'packing', receivedBytes: 512, failed: 1, deduplicated: 2 },
      completed: 5,
      total: 12,
      receivedBytes: 512,
      failed: 1,
      deduplicated: 2,
    })

    expect(safeRuntimeMetadata({
      channel: 'patmail-download-result',
      body: { payload: {
        Call: 'DownloadFiles', ok: false,
        error: {
          code: 'SAVE_FAILED',
          message: 'Download failed token=secret at https://example.test/file?token=private',
          stack: 'Error: private\n    at save (https://example.test/app.js?token=secret:10:4)',
        },
        data: 'private',
      } },
    })).toEqual({
      channel: 'patmail-download-result',
      call: 'DownloadFiles',
      ok: false,
      error: true,
      errorCode: 'SAVE_FAILED',
      errorMessage: 'Download failed token=[redacted] at https://example.test/file',
      errorStack: 'at save (https://example.test/app.js:10:4)',
    })
  })

  it('keeps console errors useful while removing query tokens and credentials', () => {
    const safeConsoleMessage = required<(args: unknown[]) => string>('safeConsoleMessage')
    expect(safeConsoleMessage([
      { type: 'string', value: 'Download failed token=secret at https://example.test/file?token=private' },
      { type: 'object', description: '{ cookie: "private" }' },
    ])).toBe('Download failed token=[redacted] at https://example.test/file')
  })

  it('installs a sender-checked binding that forwards real packet.progress metadata only', () => {
    const buildAppObserverInstallExpression = required<() => string>('buildAppObserverInstallExpression')
    const listeners: Array<(packet: unknown, sender: { id: string }) => void> = []
    const emitted: Array<Record<string, unknown>> = []
    const runtime = {
      id: 'patmail-extension-id',
      onMessage: { addListener: (listener: (packet: unknown, sender: { id: string }) => void) => listeners.push(listener) },
    }
    runInNewContext(buildAppObserverInstallExpression(), {
      chrome: { runtime },
      __patmailCdpObserver: (value: string) => {
        const parsed: unknown = JSON.parse(value) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) emitted.push(parsed as Record<string, unknown>)
      },
    })
    const packet = {
      channel: 'patmail-download-progress',
      id: 'message-2',
      requestId: 13,
      message: { type: 'DOWNLOAD_FILES', payload: { Call: 'DownloadFiles', taskId: 'task-9' } },
      progress: { done: 2, total: 8, phase: 'packing', receivedBytes: 256, failed: 0, deduplicated: 1, data: 'private' },
    }

    listeners[0](packet, { id: 'unrelated-extension' })
    expect(emitted).toEqual([])
    listeners[0](packet, { id: 'patmail-extension-id' })
    expect(emitted).toEqual([{
      kind: 'runtime-message',
      channel: 'patmail-download-progress',
      type: 'DOWNLOAD_FILES',
      call: 'DownloadFiles',
      id: 'message-2',
      requestId: 13,
      taskId: 'task-9',
      phase: 'packing',
      progress: { done: 2, total: 8, phase: 'packing', receivedBytes: 256, failed: 0, deduplicated: 1 },
      completed: 2,
      total: 8,
      receivedBytes: 256,
      failed: 0,
      deduplicated: 1,
    }])
  })

  it('polls only the named top progress and export notice without reading full page text', () => {
    const buildAppSnapshotExpression = required<(startedAt: number) => string>('buildAppSnapshotExpression')
    const expression = buildAppSnapshotExpression(Date.now())
    expect(expression).toContain('.check-rainbow[role="progressbar"]')
    expect(expression).toContain('[aria-label="文件导出"] [role="status"]')
    expect(expression).toContain('item?.byExtensionId === extensionId')
    expect(expression).toContain('blob:${extensionPrefix}')
    expect(expression).not.toContain('document.body.innerText')
  })

  it('passes only PatMail downloads through the real snapshot and Node filtering pipeline', async () => {
    const buildAppSnapshotExpression = required<(startedAt: number) => string>('buildAppSnapshotExpression')
    const safeDownloadSnapshot = required<(items: Array<Record<string, unknown>>, startedAt: number, extensionId: string) => Array<Record<string, unknown>>>('safeDownloadSnapshot')
    const startedAt = Date.now()
    const ownDownload = {
      id: 7,
      byExtensionId: 'patmail-id',
      startTime: new Date(startedAt + 1_000).toISOString(),
      filename: 'D:\\exports\\result.zip',
      state: 'complete',
      exists: true,
      mime: 'application/zip',
      bytesReceived: 2048,
      totalBytes: 2048,
      url: 'blob:chrome-extension://patmail-id/cache/private',
    }
    const otherDownload = {
      id: 8,
      startTime: new Date(startedAt + 1_000).toISOString(),
      filename: 'other.zip',
      state: 'complete',
      exists: true,
      mime: 'application/zip',
      url: 'https://example.test/other.zip',
    }
    const emitted: Array<Record<string, unknown>> = []
    const document = { querySelector: () => null, querySelectorAll: () => [] }
    const chrome = {
      runtime: { id: 'patmail-id' },
      downloads: { search: () => Promise.resolve([ownDownload, otherDownload]) },
    }
    runInNewContext(buildAppSnapshotExpression(startedAt), {
      document,
      chrome,
      __patmailCdpObserver: (value: string) => {
        const parsed: unknown = JSON.parse(value) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) emitted.push(parsed as Record<string, unknown>)
      },
    })
    await new Promise(resolveLater => setTimeout(resolveLater, 0))
    const snapshot = emitted.find(value => value.kind === 'snapshot')
    expect(snapshot).toBeDefined()
    const downloads = snapshot?.downloads as Array<Record<string, unknown>>
    expect(downloads).toHaveLength(1)
    expect(JSON.stringify(downloads)).not.toContain('blob:chrome-extension')
    expect(safeDownloadSnapshot(downloads, startedAt, 'patmail-id')).toEqual([{
      filename: ownDownload.filename,
      state: 'complete',
      exists: true,
      mime: 'application/zip',
      id: 7,
      startTime: ownDownload.startTime,
      receivedBytes: 2048,
      totalBytes: 2048,
    }])
  })

  it('records only current-session download fields requested for troubleshooting', () => {
    const safeDownloadSnapshot = required<(items: Array<Record<string, unknown>>, startedAt: number, extensionId: string) => Array<Record<string, unknown>>>('safeDownloadSnapshot')
    expect(safeDownloadSnapshot([
      { id: 3, byExtensionId: 'patmail-id', startTime: '2026-10-31T02:00:02.000Z', endTime: '2026-10-31T02:00:09.000Z', filename: 'D:\\exports\\result.zip', state: 'complete', exists: true, mime: 'application/zip', bytesReceived: 100, totalBytes: 100, error: 'FILE_FAILED', paused: false, url: 'https://example.test/?token=secret' },
      { id: 4, startTime: '2026-10-31T02:00:03.000Z', filename: 'other.zip', state: 'complete', exists: true, mime: 'application/zip', url: 'https://example.test/?token=secret' },
      { id: 2, startTime: '2026-10-31T01:59:00.000Z', filename: 'old.zip', state: 'complete', exists: false, mime: 'application/zip' },
    ], Date.parse('2026-10-31T02:00:00.000Z'), 'patmail-id')).toEqual([
      { id: 3, startTime: '2026-10-31T02:00:02.000Z', endTime: '2026-10-31T02:00:09.000Z', filename: 'D:\\exports\\result.zip', state: 'complete', exists: true, mime: 'application/zip', receivedBytes: 100, totalBytes: 100, error: 'FILE_FAILED', paused: false },
    ])
  })
})

describe('CDP observer log retention', () => {
  it('uses the shared project log path and exposes a token-free status file path', () => {
    const createObserverPaths = required<(root: string) => { root: string; dataDir: string; configPath: string; lockPath: string; statusPath: string }>('createObserverPaths')
    expect(createObserverPaths('D:\\workspace')).toEqual({
      root: 'D:\\workspace',
      dataDir: join('D:\\workspace', 'log', 'cdp'),
      configPath: join('D:\\workspace', 'log', 'cdp', 'config.json'),
      lockPath: join('D:\\workspace', 'log', 'cdp', 'service.lock.json'),
      statusPath: join('D:\\workspace', 'log', 'cdp', 'status.json'),
    })
  })

  it('filters expired records from the partially retained JSONL boundary file', () => {
    const filterRecentJsonl = required<(content: string, cutoffMs: number) => string>('filterRecentJsonl')
    const content = [
      JSON.stringify({ ts: '2026-10-30T23:59:59.000Z', kind: 'old' }),
      JSON.stringify({ ts: '2026-10-31T00:00:00.000Z', kind: 'boundary' }),
      JSON.stringify({ ts: '2026-10-31T00:00:01.000Z', kind: 'new' }),
      'malformed record',
    ].join('\n')

    expect(filterRecentJsonl(content, Date.parse('2026-10-31T00:00:00.000Z')))
      .toBe([JSON.stringify({ ts: '2026-10-31T00:00:00.000Z', kind: 'boundary' }), JSON.stringify({ ts: '2026-10-31T00:00:01.000Z', kind: 'new' })].join('\n') + '\n')
  })

  it('assigns hourly log buckets in UTC', () => {
    const hourlyLogName = required<(time: number | Date) => string>('hourlyLogName')
    expect(hourlyLogName(Date.parse('2026-10-31T02:59:59.000Z'))).toBe('observer-2026-10-31-02.jsonl')
    expect(hourlyLogName(Date.parse('2026-10-31T03:00:00.000Z'))).toBe('observer-2026-10-31-03.jsonl')
  })
})
