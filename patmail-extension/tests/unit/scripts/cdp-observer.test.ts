import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'

const corePath = resolve(process.cwd(), 'scripts/cdp-observer-core.mjs')
const loadedObserver: unknown = existsSync(corePath) ? await import(pathToFileURL(corePath).href) : {}
const observer = loadedObserver as Record<string, unknown>

function required<T extends ((...args: never[]) => unknown) | (new (...args: never[]) => unknown)>(name: string): T {
  const value = observer[name]
  expect(value, `cdp-observer-core must export ${name}`).toBeTypeOf('function')
  return value as T
}

const jihuaReasonCategories = [
  'material_unmapped', 'material_unsupported', 'case_not_found', 'case_ambiguous', 'application_format', 'application_type',
  'stage_disabled', 'category_limit', 'http524', 'other5xx', 'file_html', 'doc_pdf', 'doc_zip', 'pdf_invalid', 'docx_invalid',
  'doc_invalid', 'empty', 'large', 'permission', 'missing', 'receipt_unavailable', 'receipt_pending', 'association_unconfirmed',
  'no_attachment_id', 'session', 'network', 'storage', 'timeout', 'other',
]
const reasonCounts = (overrides: Record<string, number> = {}): Record<string, number> => Object.fromEntries([
  ...jihuaReasonCategories.map(category => [category, 0]),
  ...Object.entries(overrides),
]) as Record<string, number>

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
    // 夹具用 resolve 生成平台原生绝对路径：值里不能出现平台路径分隔符（Windows ';' / POSIX ':'），
    // 否则 'D:' 这类盘符冒号会在 POSIX 上被 split(delimiter) 切开。
    const custom = [resolve('/custom/User Data'), resolve('/edge/User Data')]
    const home = resolve('/Users/test')
    const dirs = candidateUserDataDirs({ PATMAIL_CDP_USER_DATA_DIRS: custom.join(delimiter) }, home)
    expect(dirs.slice(0, 2)).toEqual(custom)
    expect(new Set(dirs).size).toBe(dirs.length)
    expect(candidateUserDataDirs({}, home).length).toBeGreaterThan(1)
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

  it('selects only the PatMail app, its extension workers, and the EASY / Jihua / Hague hosts', () => {
    const selectTargets = required<(targets: Array<Record<string, unknown>>, knownIds?: Set<string>) => Array<{ targetId: string; source: string }>>('selectTargets')
    const targets = [
      { targetId: 'app', type: 'page', title: 'PatMail', url: 'chrome-extension://abc123/app.html' },
      { targetId: 'foreign-app', type: 'page', title: 'Other', url: 'chrome-extension://foreign/app.html' },
      { targetId: 'worker', type: 'service_worker', title: '', url: 'chrome-extension://abc123/background.js' },
      { targetId: 'easy', type: 'page', title: 'EASY', url: 'http://183.36.43.66:88/Default.aspx' },
      { targetId: 'jihua', type: 'page', title: '季华 OA', url: 'https://oa.jihualab.net:443/workbench' },
      { targetId: 'hague', type: 'page', title: 'WIPO Hague', url: 'https://hague.wipo.int/#/landing/home' },
      { targetId: 'lookalike', type: 'page', title: 'Other', url: 'https://183.36.43.660/' },
      { targetId: 'jihua-http', type: 'page', title: 'Other', url: 'http://oa.jihualab.net/' },
      { targetId: 'jihua-port', type: 'page', title: 'Other', url: 'https://oa.jihualab.net:8443/' },
      { targetId: 'jihua-lookalike', type: 'page', title: 'Other', url: 'https://oa.jihualab.net.attacker.example/' },
      { targetId: 'jihua-credentials', type: 'page', title: 'Other', url: 'https://user@oa.jihualab.net/' },
      { targetId: 'jihua-worker', type: 'service_worker', title: 'Other', url: 'https://oa.jihualab.net/' },
      { targetId: 'hague-http', type: 'page', title: 'Other', url: 'http://hague.wipo.int/#/landing/home' },
      { targetId: 'hague-port', type: 'page', title: 'Other', url: 'https://hague.wipo.int:8443/#/landing/home' },
      { targetId: 'hague-lookalike', type: 'page', title: 'Other', url: 'https://hague.wipo.int.attacker.example/' },
      { targetId: 'hague-credentials', type: 'page', title: 'Other', url: 'https://user@hague.wipo.int/#/landing/home' },
      { targetId: 'hague-worker', type: 'service_worker', title: 'Other', url: 'https://hague.wipo.int/' },
      { targetId: 'other-extension', type: 'page', title: 'Other', url: 'chrome-extension://different/options.html' },
      { targetId: 'unrelated', type: 'page', title: 'News', url: 'https://example.test/' },
    ]

    expect(selectTargets(targets)).toEqual([
      { targetId: 'app', source: 'app' },
      { targetId: 'worker', source: 'app' },
      { targetId: 'easy', source: 'easy' },
      { targetId: 'jihua', source: 'jihua' },
      { targetId: 'hague', source: 'hague' },
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

  it('keeps Jihua network metadata to the exact OA origin and fixed route categories', () => {
    const safeNetworkUrl = required<(url: string, postData?: string, source?: string) => Record<string, unknown>>('safeNetworkUrl')
    const appNumber = 'CN202611020001'
    const fileName = '申请材料-保密.docx'
    const detail = safeNetworkUrl(
      `https://oa.jihualab.net/prod-api/conow/pat/parameter/INVENTION/${appNumber}?PATENT_NUM=${appNumber}&token=private`,
      `PATENT_NO=${appNumber}&fileName=${encodeURIComponent(fileName)}`,
      'jihua',
    )
    expect(detail).toEqual({ origin: 'https://oa.jihualab.net', path: '/prod-api/conow/pat/parameter/:type/:id' })
    expect(JSON.stringify(detail)).not.toContain(appNumber)
    expect(JSON.stringify(detail)).not.toContain(fileName)

    expect(safeNetworkUrl(
      'https://oa.jihualab.net/prod-api/conow/file/uploadAndOfc?fileName=private.docx',
      'token=private&base64=private',
      'jihua',
    )).toEqual({ origin: 'https://oa.jihualab.net', path: '/prod-api/conow/file/uploadAndOfc' })
    expect(safeNetworkUrl('https://other.example/private?token=secret', 'fileName=private.docx', 'jihua'))
      .toEqual({ origin: '', path: '/' })
    expect(safeNetworkUrl('http://oa.jihualab.net/prod-api/getInfo', '', 'jihua'))
      .toEqual({ origin: '', path: '/' })
    expect(safeNetworkUrl('https://oa.jihualab.net:8443/prod-api/getInfo', '', 'jihua'))
      .toEqual({ origin: '', path: '/' })
    expect(safeNetworkUrl('https://oa.jihualab.net/prod-api/conow/pat/parameter/UTILITY?PATENT_NUM=private', '', 'jihua'))
      .toEqual({ origin: 'https://oa.jihualab.net', path: '/prod-api/conow/pat/parameter/:type' })
    expect(safeNetworkUrl('https://oa.jihualab.net/private/CN202611020001.docx', '', 'jihua'))
      .toEqual({ origin: 'https://oa.jihualab.net', path: '/other' })
  })

  it('keeps Hague network metadata to HTTPS WIPO origins and paths without query strings or post bodies', () => {
    const safeNetworkUrl = required<(url: string, postData?: string, source?: string) => Record<string, unknown>>('safeNetworkUrl')
    expect(safeNetworkUrl('https://hague.wipo.int/api/v1/workbench?token=secret#/landing/home', 'Call=Private&token=secret', 'hague'))
      .toEqual({ origin: 'https://hague.wipo.int', path: '/[redacted]' })
    expect(safeNetworkUrl('https://www3.wipo.int/auth/session?ticket=secret', '', 'hague'))
      .toEqual({ origin: '', path: '/' })
    expect(safeNetworkUrl('http://hague.wipo.int/api/v1/workbench', '', 'hague'))
      .toEqual({ origin: '', path: '/' })
    expect(safeNetworkUrl('https://hague.wipo.int:8443/api/v1/workbench', '', 'hague'))
      .toEqual({ origin: '', path: '/' })
    expect(safeNetworkUrl('https://other.example/api?token=secret', '', 'hague'))
      .toEqual({ origin: '', path: '/' })
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

  it('keeps only valid numeric response timing segments without headers or bodies', () => {
    const safeNetworkResponseEvent = required<(request: Record<string, unknown>, params: Record<string, unknown>) => Record<string, unknown>>('safeNetworkResponseEvent')
    const request = { source: 'jihua', origin: 'https://oa.jihualab.net', path: '/prod-api/conow/file/upload' }
    const event = safeNetworkResponseEvent(request, { response: {
      status: 524, headers: { authorization: 'private' }, body: 'private',
      timing: { connectStart: 1, connectEnd: 5, sendStart: 8, sendEnd: 1508, receiveHeadersStart: 151508, private: 'secret' },
    } })
    expect(event).toEqual({ ...request, status: 524, connectMs: 4, sendMs: 1500, responseWaitMs: 150000 })
    expect(safeNetworkResponseEvent(request, { response: { timing: {
      connectStart: -1, connectEnd: 5, sendStart: 50, sendEnd: 40, receiveHeadersStart: Infinity,
    } } })).toEqual(request)
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

  it('does not inspect or forward Jihua transfer messages that can contain business data', () => {
    const safeRuntimeMetadata = required<(message: unknown) => Record<string, unknown> | null>('safeRuntimeMetadata')
    expect(safeRuntimeMetadata({
      channel: 'PATMAIL_JIHUA',
      action: 'startUpload',
      payload: { applicationNo: 'CN202611020001', fileName: '申请材料-保密.docx', base64: 'private' },
      error: '上传失败：申请号 CN202611020001，文件 申请材料-保密.docx',
    })).toBeNull()
  })

  it('aggregates Jihua task state into bounded counters and fixed error categories', () => {
    const summarizeJihuaTask = required<(task: Record<string, unknown>, classifyError: (value: unknown) => string | null) => Record<string, unknown> | null>('summarizeJihuaTask')
    const classifyJihuaErrorCategory = required<(value: unknown) => string | null>('classifyJihuaErrorCategory')
    const summary = summarizeJihuaTask({
      id: 'task-private',
      status: 'running',
      rows: [
        { status: 'success', selected: true, error: '', applicationNo: 'CN202611020001', fileName: '申请材料-保密.docx' },
        { status: 'uploading', selected: true, error: '', applicationNo: 'CN202611020002', fileName: '另一个材料.docx', intent: { sent: true } },
        { status: 'failed', selected: false, error: 'OA 上传失败：CN202611020003 的申请材料-内部.docx', applicationNo: 'CN202611020003', intent: { sent: true }, receipt: { attachments: [] } },
        { status: 'failed', selected: true, error: '季华登录已失效，请重新连接。' },
        { status: 'not-a-known-state', selected: true, error: 'IndexedDB 持久化失败' },
        { status: 'unmatched', selected: false, error: '没匹配到材料类型：CN202611020004' },
      ],
      errors: ['等待回执超过时限：CN202611020001', '无法连接季华 OA；请检查网络。'],
      roots: [{ name: 'private-folder-name' }],
    }, classifyJihuaErrorCategory)
    expect(summary).toEqual({
      status: 'running',
      rowCount: 6,
      rowsExamined: 6,
      truncated: false,
      selectedCount: 4,
      sentCount: 2,
      pendingReceiptCount: 1,
      rowStatusCounts: {
        pending: 0, checking: 0, uploading: 1, associating: 0, verifying: 0,
        success: 1, failed: 2, already: 0, unmatched: 1, excluded: 0,
      },
      rowErrorCategories: {
        http_524: 0, http_5xx: 0, file_type: 0, material_unmatched: 1, source_invalid: 0,
        login: 1, session: 0, timeout: 0, network: 0, receipt: 0, file: 0, storage: 1, validation: 0, remote: 1, other: 0,
      },
      taskErrorCategories: {
        http_524: 0, http_5xx: 0, file_type: 0, material_unmatched: 0, source_invalid: 0,
        login: 0, session: 0, timeout: 1, network: 1, receipt: 0, file: 0, storage: 0, validation: 0, remote: 0, other: 0,
      },
      failedReasons: reasonCounts({ session: 1, other: 1 }),
      unmatchedReasons: reasonCounts({ material_unmapped: 1 }),
      taskReasons: reasonCounts({ receipt_pending: 1, network: 1 }),
      lastTaskReason: 'network',
      pauseReasonCode: null,
      recovery: null,
    })
    expect(JSON.stringify(summary)).not.toContain('CN202611020001')
    expect(JSON.stringify(summary)).not.toContain('申请材料')
    expect(JSON.stringify(summary)).not.toContain('private-folder-name')
    expect(JSON.stringify(summary)).not.toContain('CN202611020004')
  })

  it('maps common Jihua failures to fixed error-code categories', () => {
    const classifyJihuaErrorCategory = required<(value: unknown) => string | null>('classifyJihuaErrorCategory')
    expect(classifyJihuaErrorCategory('OA 上传失败（HTTP 524）：CN202611020001 申请材料.docx')).toBe('http_524')
    expect(classifyJihuaErrorCategory('文件类型与材料清单不匹配：保密材料.docx')).toBe('file_type')
    expect(classifyJihuaErrorCategory('文件名应包含申请号、案件名称和材料描述')).toBe('file_type')
    expect(classifyJihuaErrorCategory('没匹配到材料类型：CN202611020001')).toBe('material_unmatched')
    expect(classifyJihuaErrorCategory('季华来源文件夹已失效：保密材料')).toBe('source_invalid')
    expect(classifyJihuaErrorCategory('OA 请求失败（HTTP 503）')).toBe('http_5xx')
  })

  it('classifies HTTP 413 as a request-size failure without retaining response details', () => {
    const summarizeJihuaTask = required<(task: Record<string, unknown>, classifyError: (value: unknown) => string | null) => Record<string, unknown> | null>('summarizeJihuaTask')
    const classifyJihuaErrorCategory = required<(value: unknown) => string | null>('classifyJihuaErrorCategory')
    const summary = summarizeJihuaTask({ status: 'failed', rows: [{ status: 'failed', error: 'OA 上传失败（HTTP 413）；private response' }] }, classifyJihuaErrorCategory)
    expect((summary?.failedReasons as Record<string, number>).large).toBe(1)
    expect((summary?.failedReasons as Record<string, number>).other).toBe(0)
    expect(JSON.stringify(summary)).not.toContain('private response')
  })

  it('separates fixed failure reasons by failed, unmatched, and latest task errors', () => {
    const summarizeJihuaTask = required<(task: Record<string, unknown>, classifyError: (value: unknown) => string | null) => Record<string, unknown> | null>('summarizeJihuaTask')
    const classifyJihuaErrorCategory = required<(value: unknown) => string | null>('classifyJihuaErrorCategory')
    const safeJihuaTaskSummary = required<(value: Record<string, unknown>) => Record<string, unknown> | null>('safeJihuaTaskSummary')
    const cases: Array<[string, string, 'failed' | 'unmatched']> = [
      ['材料类型未登记', 'material_unmapped', 'unmatched'],
      ['文件描述没有匹配到该台账支持的材料', 'material_unsupported', 'unmatched'],
      ['没有匹配到该申请号的台账', 'case_not_found', 'unmatched'],
      ['平台存在多条相同申请号的台账', 'case_ambiguous', 'unmatched'],
      ['申请号格式无效', 'application_format', 'unmatched'],
      ['该申请号类型未匹配', 'application_type', 'unmatched'],
      ['平台当前未启用该材料所属阶段', 'stage_disabled', 'failed'],
      ['平台该类上限为 2 份', 'category_limit', 'unmatched'],
      ['OA 上传失败（HTTP 524）', 'http524', 'failed'],
      ['OA 请求失败（HTTP 503）', 'other5xx', 'failed'],
      ['文件实际是网页', 'file_html', 'failed'],
      ['文件扩展名是 DOC，实际是 PDF', 'doc_pdf', 'failed'],
      ['文件扩展名是 DOC，实际是 ZIP 容器', 'doc_zip', 'failed'],
      ['文件内容与 PDF 扩展名不符', 'pdf_invalid', 'failed'],
      ['文件内容与 DOCX 扩展名不符', 'docx_invalid', 'failed'],
      ['文件内容不是可确认的 Word 文档', 'doc_invalid', 'failed'],
      ['文件为空，未上传', 'empty', 'failed'],
      ['文件超过大小限制', 'large', 'failed'],
      ['本地目录读取权限未授权', 'permission', 'failed'],
      ['本地文件句柄丢失', 'missing', 'failed'],
      ['上次上传已发送，但原页面回执不可用', 'receipt_unavailable', 'failed'],
      ['上次上传回执尚未确认，请稍后继续', 'receipt_pending', 'failed'],
      ['台账回读未确认附件关联', 'association_unconfirmed', 'failed'],
      ['上传响应没有附件 ID', 'no_attachment_id', 'failed'],
      ['季华登录会话已变化', 'session', 'failed'],
      ['无法连接季华 OA，请检查网络', 'network', 'failed'],
      ['IndexedDB 持久化失败', 'storage', 'failed'],
      ['上传超过时限', 'timeout', 'failed'],
      ['CUSTOMER_SECRET_123', 'other', 'failed'],
    ]
    const summary = summarizeJihuaTask({
      status: 'failed',
      pauseReason: 'OA 上传失败（HTTP 524）',
      recovery: {
        attempt: 3,
        maxAttempts: 3,
        retryAt: Number.MAX_SAFE_INTEGER + 1,
        reason: 'HTTP 524 PRIVATE_RECOVERY_REASON_456',
        rawApplication: 'CN202611020001',
      },
      rows: [
        ...cases.map(([error, , status]) => ({ status, error })),
        { status: 'success', error: '文件实际是网页' },
        { status: 'uploading', error: '文件实际是网页' },
        { status: 'pending', error: '文件实际是网页' },
      ],
      errors: ['OA 上传失败（HTTP 524）', '上次上传回执尚未确认', '无法连接季华 OA'],
    }, classifyJihuaErrorCategory)
    const failedReasons = summary?.failedReasons as Record<string, number>
    const unmatchedReasons = summary?.unmatchedReasons as Record<string, number>
    const taskReasons = summary?.taskReasons as Record<string, number>
    for (const [, reason, status] of cases) {
      expect((status === 'failed' ? failedReasons : unmatchedReasons)[reason], `${status}:${reason}`).toBe(1)
    }
    expect(failedReasons.file_html).toBe(1)
    expect(unmatchedReasons.file_html).toBe(0)
    expect(taskReasons).toEqual(reasonCounts({ http524: 1, receipt_pending: 1, network: 1 }))
    expect(summary?.lastTaskReason).toBe('network')
    expect(summary?.pauseReasonCode).toBe('http524')
    expect(summary?.recovery).toEqual({ attempt: 3, maxAttempts: 3, retryAt: Number.MAX_SAFE_INTEGER, reasonCode: 'http524' })
    expect(safeJihuaTaskSummary(summary!)?.pauseReasonCode).toBe('http524')
    expect(JSON.stringify(summary)).not.toContain('PRIVATE_RECOVERY_REASON_456')

    const safeSummary = safeJihuaTaskSummary({
      ...summary,
      failedReasons: { ...failedReasons, injected: 'CUSTOMER_SECRET_123' },
      unmatchedReasons: { ...unmatchedReasons, injected: 'CUSTOMER_SECRET_123' },
      taskReasons: { ...taskReasons, injected: 'CUSTOMER_SECRET_123' },
      lastTaskReason: 'CUSTOMER_SECRET_123',
      pauseReasonCode: 'CUSTOMER_SECRET_123',
      pauseReason: 'CUSTOMER_SECRET_123',
      recovery: {
        attempt: Number.MAX_SAFE_INTEGER,
        maxAttempts: -1,
        retryAt: Number.MAX_SAFE_INTEGER + 1,
        reasonCode: 'http524',
        reason: 'PRIVATE_RECOVERY_REASON_456',
        applicationNo: 'CN202611020001',
      },
      rawError: 'CUSTOMER_SECRET_123',
    })
    expect(safeSummary?.lastTaskReason).toBeNull()
    expect(JSON.stringify(safeSummary)).not.toContain('CUSTOMER_SECRET_123')
    expect(JSON.stringify(safeSummary)).not.toContain('injected')
    expect(JSON.stringify(safeSummary)).not.toContain('PRIVATE_RECOVERY_REASON_456')
    expect(safeSummary?.recovery).toEqual({
      attempt: 2_147_483_647,
      maxAttempts: 0,
      retryAt: Number.MAX_SAFE_INTEGER,
      reasonCode: 'http524',
    })
  })

  it('retains cancelled task state in both local and sanitized diagnostic summaries', () => {
    const summarizeJihuaTask = required<(task: Record<string, unknown>, classifyError: (value: unknown) => string | null) => Record<string, unknown> | null>('summarizeJihuaTask')
    const safeJihuaTaskSummary = required<(value: Record<string, unknown>) => Record<string, unknown> | null>('safeJihuaTaskSummary')
    const classifyJihuaErrorCategory = required<(value: unknown) => string | null>('classifyJihuaErrorCategory')
    const summary = summarizeJihuaTask({ status: 'cancelled', rows: [{ status: 'pending', selected: true, intent: { sent: true } }] }, classifyJihuaErrorCategory)
    expect(summary).toMatchObject({ status: 'cancelled', pendingReceiptCount: 1 })
    expect(safeJihuaTaskSummary(summary!)).toMatchObject({ status: 'cancelled', pendingReceiptCount: 1 })
  })

  it('caps Jihua row traversal and validates summaries to a fixed metadata shape', () => {
    const summarizeJihuaTask = required<(task: Record<string, unknown>, classifyError: (value: unknown) => string | null) => Record<string, unknown> | null>('summarizeJihuaTask')
    const classifyJihuaErrorCategory = required<(value: unknown) => string | null>('classifyJihuaErrorCategory')
    const safeJihuaTaskSummary = required<(value: Record<string, unknown>) => Record<string, unknown> | null>('safeJihuaTaskSummary')
    const summary = summarizeJihuaTask({
      status: 'running',
      rows: Array.from({ length: 50_001 }, () => ({ status: 'pending', selected: true })),
    }, classifyJihuaErrorCategory)
    expect(summary).toMatchObject({ rowCount: 50_001, rowsExamined: 50_000, truncated: true, selectedCount: 50_000 })

    const safeSummary = safeJihuaTaskSummary({
      ...summary,
      rowStatusCounts: { ...(summary?.rowStatusCounts as Record<string, number>), failed: 4 },
      rowErrorCategories: { ...(summary?.rowErrorCategories as Record<string, number>), http_524: 3 },
      taskErrorCategories: { ...(summary?.taskErrorCategories as Record<string, number>), network: 2 },
      failedReasons: { ...(summary?.failedReasons as Record<string, number>), http524: 4, injected: 2 },
      unmatchedReasons: { ...(summary?.unmatchedReasons as Record<string, number>), material_unmapped: 5, injected: 2 },
      taskReasons: { ...(summary?.taskReasons as Record<string, number>), network: 2, injected: 2 },
      lastTaskReason: 'network',
      applicationNo: 'CN202611020001',
      fileName: 'private.docx',
      rowCount: Number.MAX_SAFE_INTEGER,
      rowStatusCountsPrivate: { customerName: 'private' },
    })
    expect(safeSummary?.rowCount).toBe(2_147_483_647)
    const rowStatusCounts = safeSummary?.rowStatusCounts as Record<string, unknown> | undefined
    const rowErrorCategories = safeSummary?.rowErrorCategories as Record<string, unknown> | undefined
    const taskErrorCategories = safeSummary?.taskErrorCategories as Record<string, unknown> | undefined
    const failedReasons = safeSummary?.failedReasons as Record<string, unknown> | undefined
    const unmatchedReasons = safeSummary?.unmatchedReasons as Record<string, unknown> | undefined
    const taskReasons = safeSummary?.taskReasons as Record<string, unknown> | undefined
    expect(rowStatusCounts?.failed).toBe(4)
    expect(rowErrorCategories?.http_524).toBe(3)
    expect(taskErrorCategories?.network).toBe(2)
    expect(failedReasons?.http524).toBe(4)
    expect(unmatchedReasons?.material_unmapped).toBe(5)
    expect(taskReasons?.network).toBe(2)
    expect(safeSummary?.lastTaskReason).toBe('network')
    expect(JSON.stringify(safeSummary)).not.toContain('applicationNo')
    expect(JSON.stringify(safeSummary)).not.toContain('private.docx')
    expect(JSON.stringify(safeSummary)).not.toContain('customerName')
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

    listeners[0]({ channel: 'PATMAIL_JIHUA', action: 'startUpload', payload: { applicationNo: 'CN202611020001', fileName: '申请材料-保密.docx' } }, { id: 'patmail-extension-id' })
    expect(emitted).toHaveLength(1)
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

  it('reads the latest Jihua task only through a read-only IndexedDB transaction', async () => {
    const buildAppSnapshotExpression = required<(startedAt: number, includeJihuaTask?: boolean) => string>('buildAppSnapshotExpression')
    const expression = buildAppSnapshotExpression(Date.now(), true)
    expect(expression).toContain("factory.open('patmail-jihua-inventory')")
    expect(expression).toContain('globalThis.setTimeout(finish, 1_500)')
    expect(expression).toContain("database.transaction('tasks', 'readonly')")
    expect(expression).toContain(".get('latest')")
    expect(expression).not.toContain("transaction('tasks', 'readwrite')")

    const task = {
      status: 'failed',
      pauseReason: 'OA 请求失败（HTTP 503）',
      recovery: { attempt: 2, maxAttempts: 3, retryAt: 1_799_999_999_999, reason: 'OA 请求失败（HTTP 503）' },
      rows: [{ status: 'failed', selected: true, error: '文件上传失败：CN202611020001 申请材料.docx', applicationNo: 'CN202611020001', fileName: '申请材料.docx' }],
      errors: ['OA 请求失败（HTTP 503）'],
    }
    const emitted: Array<Record<string, unknown>> = []
    const transactionModes: string[] = []
    const taskRequest: { result?: unknown; onsuccess?: () => void } = { result: task }
    let taskRequestSuccess: (() => void) | undefined
    Object.defineProperty(taskRequest, 'onsuccess', {
      get: () => taskRequestSuccess,
      set: (handler: (() => void) | undefined) => {
        taskRequestSuccess = handler
        void Promise.resolve().then(() => taskRequestSuccess?.())
      },
    })
    const transaction = {
      objectStore: () => ({ get: (key: string) => {
        expect(key).toBe('latest')
        return taskRequest
      } }),
      oncomplete: undefined as (() => void) | undefined,
      onerror: undefined as (() => void) | undefined,
    }
    Object.defineProperty(transaction, 'oncomplete', {
      set: (handler: (() => void) | undefined) => { void Promise.resolve().then(() => handler?.()) },
    })
    const database = {
      objectStoreNames: { contains: (name: string) => name === 'tasks' },
      transaction: (_store: string, mode: string) => {
        transactionModes.push(mode)
        return transaction
      },
      close: vi.fn(),
    }
    const indexedDB = {
      databases: vi.fn(async () => [{ name: 'patmail-jihua-inventory' }]),
      open: vi.fn((name: string) => {
        expect(name).toBe('patmail-jihua-inventory')
        const request: { result?: typeof database; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void } = { result: database }
        let success: (() => void) | undefined
        Object.defineProperty(request, 'onsuccess', {
          get: () => success,
          set: (handler: (() => void) | undefined) => {
            success = handler
            void Promise.resolve().then(() => success?.())
          },
        })
        return request
      }),
    }
    const chrome = { runtime: { id: 'patmail-id' }, downloads: { search: () => Promise.resolve([]) } }
    let resolveTaskSummary!: (value: Record<string, unknown>) => void
    const taskSummary = new Promise<Record<string, unknown>>(resolve => { resolveTaskSummary = resolve })
    runInNewContext(expression, {
      document: { querySelector: () => null, querySelectorAll: () => [] },
      chrome,
      indexedDB,
      setTimeout,
      clearTimeout,
      __patmailCdpObserver: (value: string) => {
        const parsed: unknown = JSON.parse(value) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const record = parsed as Record<string, unknown>
          emitted.push(record)
          if (record.kind === 'jihua-task') resolveTaskSummary(record)
        }
      },
    })
    await taskSummary
    expect(indexedDB.databases).toHaveBeenCalledOnce()
    expect(indexedDB.open).toHaveBeenCalledOnce()
    expect(transactionModes).toEqual(['readonly'])
    expect(database.close).toHaveBeenCalledOnce()
    const summary = emitted.find(value => value.kind === 'jihua-task')?.summary
    expect(summary).toMatchObject({
      status: 'failed', rowCount: 1, selectedCount: 1, rowErrorCategories: { file: 1, remote: 0 },
      failedReasons: { other: 1 }, taskReasons: { other5xx: 1 }, lastTaskReason: 'other5xx', pauseReasonCode: 'other5xx',
      recovery: { attempt: 2, maxAttempts: 3, retryAt: 1_799_999_999_999, reasonCode: 'other5xx' },
    })
    expect(JSON.stringify(emitted)).not.toContain('CN202611020001')
    expect(JSON.stringify(emitted)).not.toContain('申请材料.docx')
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

it('filters applicant/reference text through actual app snapshot persistence', () => {
  const Service = required<new(token:string)=>{logger:{log:(kind:string,event:unknown)=>Promise<void>};handleBinding:(target:object,params:object)=>void}>('CdpObserverService')
  const service = new Service('test-token-not-connected')
  const logged:unknown[]=[]
  service.logger = {log:async(kind,event)=>{logged.push({kind,event})}}
  const privateText='Applicant Alice Example WIPO123456789 alice@example.com 123 Private Road secret.pdf'
  service.handleBinding({source:'app',targetId:'test',url:'chrome-extension://ieobhddlnmlopeagjkgbjfolpfhncikd/app.html'}, {name:'__patmailCdpObserver',payload:JSON.stringify({kind:'snapshot',hagueActive:true,topProgress:{value:1,max:2,text:'接口失败 '+privateText},exportNotice:'正在生成PDF '+privateText,draftTexts:[privateText,'草稿保存失败 '+privateText],progress:[],downloads:[]})})
  expect(JSON.stringify(logged)).not.toContain('Alice')
  expect(JSON.stringify(logged)).not.toContain('123456789')
  expect(JSON.stringify(logged)).not.toContain('Private Road')
  expect(JSON.stringify(logged)).not.toContain('secret.pdf')
  expect(logged).toEqual([{kind:'app.snapshot',event:{topProgress:{value:1,max:2,text:'error'},progress:[],exportNotice:'running',draftTextSummary:{count:2,categories:['notice','error']},downloadsAvailable:false,downloads:[]}}])
})
it('keeps the observed Hague redirect status before dropping a request that leaves the allowed origin', () => {
 const Service=required<new(token:string)=>{logger:{log:(kind:string,event:unknown)=>Promise<void>};networkRequests:Map<string,unknown>;handleNetworkRequest:(target:object,session:string,params:object)=>void;handleNetworkResponse:(target:object,session:string,params:object)=>void}>('CdpObserverService')
 const service=new Service('offline-test');const logged:unknown[]=[];service.logger={log:async(kind,event)=>{logged.push({kind,event})}}
 const target={source:'hague',targetId:'12345678',sessionId:'s'}
 service.handleNetworkRequest(target,'s',{requestId:'41.2',request:{url:'https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml',method:'POST'},timestamp:1})
 expect(service.networkRequests.size).toBe(1)
 service.handleNetworkRequest(target,'s',{requestId:'41.2',request:{url:'https://evil.example/private',method:'GET'},redirectResponse:{status:302,mimeType:'text/html',headers:{Location:'https://evil.example/private?token=PRIVATE_TOKEN',Cookie:'PRIVATE_COOKIE'}},timestamp:2})
 service.handleNetworkResponse(target,'s',{requestId:'41.2',response:{status:200},timestamp:3})
 expect(service.networkRequests.size).toBe(0)
 expect(logged).toHaveLength(2)
 expect(logged[1]).toMatchObject({kind:'network.response',event:{source:'hague',requestId:'41.2',status:302,httpStatus:302,httpCategory:'redirect',path:'/HagueEFilingWeb/protected/page/application.xhtml'}})
 expect(JSON.stringify(logged)).not.toContain('evil.example')
 expect(JSON.stringify(logged)).not.toContain('PRIVATE_')
})

it('keeps redirect-hop ownership instead of correlating the same CDP request to another case', () => {
 type Harness={logger:{log:(kind:string,event:unknown)=>Promise<void>};bridge:{clear:()=>void};hagueRequestMetadata:()=>Record<string,unknown>;handleNetworkRequest:(target:object,session:string,params:object)=>void;handleNetworkResponse:(target:object,session:string,params:object)=>void}
 const Service=required<new(token:string)=>Harness>('CdpObserverService'),service=new Service('offline-redirect')
 const logged:unknown[]=[];service.logger={log:(kind,event)=>{logged.push({kind,event});return Promise.resolve()}}
 let correlations=0
 service.hagueRequestMetadata=()=>{correlations++;return{traceId:correlations===1?'trace-original':'trace-wrong',caseRunId:'case-original',applicationRequestId:'req-original',correlationConfidence:'probable',httpMethod:'POST'}}
 const target={source:'hague',targetId:'aaaaaaaa',sessionId:'bbbbbbbb'}
 try{
  service.handleNetworkRequest(target,'bbbbbbbb',{requestId:'41.3',request:{url:'https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml',method:'POST'},timestamp:1})
  service.handleNetworkRequest(target,'bbbbbbbb',{requestId:'41.3',request:{url:'https://hague.wipo.int/HagueEFilingWeb/protected/page/summary.xhtml',method:'GET'},redirectResponse:{status:303},timestamp:2})
  service.handleNetworkResponse(target,'bbbbbbbb',{requestId:'41.3',response:{status:200},timestamp:3})
  expect(correlations).toBe(1)
  expect(logged).toHaveLength(4)
  expect(logged[1]).toMatchObject({kind:'network.response',event:{httpStatus:303,httpMethod:'POST',traceId:'trace-original'}})
  expect(logged[2]).toMatchObject({kind:'network.request',event:{httpMethod:'GET',traceId:'trace-original'}})
  expect(logged[3]).toMatchObject({kind:'network.response',event:{httpStatus:200,traceId:'trace-original',caseRunId:'case-original'}})
  expect(JSON.stringify(logged)).not.toContain('trace-wrong')
 }finally{service.bridge.clear()}
})

it('enriches only known application request evidence using observed context and keeps six lanes ambiguous', () => {
 type Harness={logger:{log:(kind:string,event:unknown)=>Promise<void>};hagueTraces:Record<string,unknown>[];hagueContexts:Map<string,string>;handleBinding:(target:object,params:object)=>void;handleHagueContext:(target:object,params:object)=>void;hagueRequestMetadata:(target:object,session:string,params:object)=>Record<string,unknown>;clearHagueSessionEvidence:(session:string)=>void}
 const Service=required<new(token:string)=>Harness>('CdpObserverService');const service=new Service('offline');service.logger={log:async()=>{}}
 const target={source:'hague',targetId:'aaaaaaaa',sessionId:'bbbbbbbb'}
 service.handleHagueContext(target,{context:{id:7,origin:'https://hague.wipo.int',auxData:{frameId:'cccccccc'}}})
 const binding=(t:object,event:object)=>service.handleBinding(t,{name:'__patmailCdpObserver',executionContextId:7,payload:JSON.stringify({kind:'hague-trace',event})})
 const event={version:1,source:'application',phase:'request.dispatched',timestamp:new Date().toISOString(),traceId:'trace-one',caseRunId:'case-one',requestId:'req-one',httpMethod:'POST',urlPath:'/HagueEFilingWeb/protected/page/application.xhtml'}
 binding(target,event);expect(service.hagueTraces).toHaveLength(0)
 binding({source:'app'},event);binding(target,{...event,targetId:'FAKE',frameId:'FAKE',cdpRequestId:'41.2'})
 expect(service.hagueTraces).toHaveLength(1)
 expect(service.hagueTraces[0]).toMatchObject({targetId:'aaaaaaaa',sessionId:'bbbbbbbb',frameId:'cccccccc'})
 const params={frameId:'cccccccc',requestId:'41.2',request:{method:'POST',url:'https://hague.wipo.int'+event.urlPath}}
 expect(service.hagueRequestMetadata(target,'bbbbbbbb',params)).toMatchObject({correlationConfidence:'probable',candidateCount:1});expect(service.hagueRequestMetadata(target,'bbbbbbbb',params).traceId).toBeUndefined()
 for(let i=2;i<=6;i++){const next={...event,traceId:'trace-'+i,caseRunId:'case-'+i,requestId:'req-'+i};binding({source:'app'},next);binding(target,next)}
 expect(service.hagueTraces).toHaveLength(6)
 const ambiguous=service.hagueRequestMetadata(target,'bbbbbbbb',params)
 expect(ambiguous.correlationConfidence).toBe('ambiguous');expect(ambiguous.traceId).toBeUndefined();expect(ambiguous.caseRunId).toBeUndefined();expect(ambiguous.applicationRequestId).toBeUndefined()
 service.clearHagueSessionEvidence('bbbbbbbb');expect(service.hagueContexts.size).toBe(0);expect(service.hagueTraces).toHaveLength(0)
})
