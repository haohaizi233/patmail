import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createJihuaMessageHandler,
  JIHUA_CHANNEL,
  runJihuaPageWorld,
  type JihuaMessageHost,
} from '../../../src/background/jihua-page-world'

const EXTENSION_ID = 'patmail-extension-id'
const OA_ORIGIN = 'https://oa.jihualab.net'
const TOKEN = 'temporary-test-token-value'
const BINDING = 'binding-01234567-89ab-cdef'
const REFRESHED_BINDING = 'binding-11223344-5566-7788'

function appSender(overrides: Partial<chrome.runtime.MessageSender> = {}): chrome.runtime.MessageSender {
  return {
    id: EXTENSION_ID,
    url: `chrome-extension://${EXTENSION_ID}/app.html?route=jihua#upload`,
    tab: { id: 90 },
    ...overrides,
  } as chrome.runtime.MessageSender
}

function hostFixture() {
  const executeScript = vi.fn(async (injection: Parameters<JihuaMessageHost['executeScript']>[0]) => {
    const result = await injection.func(...injection.args)
    return [{ documentId: 'oa-document-1', result }]
  })
  const host: JihuaMessageHost = {
    extensionId: EXTENSION_ID,
    queryTabs: async () => [
      { id: 1, title: '发明台账', url: `${OA_ORIGIN}/patentParameter/invention` },
      { id: 2, title: 'Other', url: 'https://example.test/' },
      { id: 3, title: 'Wrong scheme', url: 'http://oa.jihualab.net/' },
      { id: 4, title: 'Wrong port', url: 'https://oa.jihualab.net:444/' },
    ],
    getTab: async (tabId) => ({
      id: tabId,
      title: '发明台账',
      url: `${OA_ORIGIN}/patentParameter/invention`,
    }),
    executeScript,
  }
  return { host, executeScript }
}

function installPage(token = TOKEN) {
  const pageWindow: Record<PropertyKey, unknown> = {}
  vi.stubGlobal('window', pageWindow)
  vi.stubGlobal('location', { origin: OA_ORIGIN, href: `${OA_ORIGIN}/patentParameter/invention` })
  vi.stubGlobal('document', { cookie: token ? `Admin-Token=${encodeURIComponent(token)}` : '' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 200, user: { userId: 'user-1' } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })))
  return pageWindow
}

function installCrypto() {
  vi.stubGlobal('crypto', {
    subtle: {
      digest: vi.fn(async (_algorithm: string, input: BufferSource) => {
        const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        const text = new TextDecoder().decode(bytes)
        let state = 2166136261
        for (let index = 0; index < text.length; index++) state = Math.imul(state ^ text.charCodeAt(index), 16777619)
        return new Uint8Array(32).fill(state & 0xff).buffer
      }),
    },
    randomUUID: vi.fn()
      .mockReturnValueOnce(BINDING)
      .mockReturnValueOnce(REFRESHED_BINDING)
      .mockReturnValueOnce('binding-99aabbcc-ddee-ff00')
      .mockReturnValue(BINDING),
    getRandomValues: vi.fn((array: Uint8Array) => array.fill(7)),
  })
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Jihua MAIN-world transport', () => {
  it('retains the upstream HTTP status for an HTML gateway error instead of reporting a login page', async () => {
    installPage()
    installCrypto()
    const connected = await runJihuaPageWorld('connect', {}) as { sessionKey: string; binding: string }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>gateway timeout</html>', {
      status: 524, headers: { 'Content-Type': 'text/html' },
    })))
    await runJihuaPageWorld('startRequest', {
      requestId: 'gateway-error', sessionKey: connected.sessionKey, binding: connected.binding,
      path: '/conow/pat/parameter/INVENTION?pageNum=1&pageSize=100&PATENT_NUM=2021100850612',
    })
    let result: { receipt?: { state?: string; error?: string } } = {}
    await vi.waitFor(async () => {
      result = await runJihuaPageWorld('receipt', { requestId: 'gateway-error', sessionKey: connected.sessionKey, binding: connected.binding }) as typeof result
      expect(result.receipt?.state).toBe('failed')
    })
    expect(result.receipt?.error).toContain('HTTP 524')
    expect(result.receipt?.error).not.toContain('登录页')
  })

  it('accepts only this extension app sender and does not reject an app sender with a tab field', async () => {
    const { host, executeScript } = hostFixture()
    const handle = createJihuaMessageHandler(host)

    const accepted = await handle({ channel: JIHUA_CHANNEL, action: 'listTabs' }, appSender())
    const wrongPage = await handle(
      { channel: JIHUA_CHANNEL, action: 'listTabs' },
      appSender({ url: `chrome-extension://${EXTENSION_ID}/popup.html` }),
    )
    const wrongExtension = await handle(
      { channel: JIHUA_CHANNEL, action: 'listTabs' },
      appSender({ id: 'other-extension' }),
    )

    expect(accepted).toEqual({
      ok: true,
      tabs: [{ id: 1, title: '发明台账' }],
    })
    expect(wrongPage).toMatchObject({ ok: false })
    expect(wrongExtension).toMatchObject({ ok: false })
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('connects only an exact HTTPS OA host and pins the MAIN result document id', async () => {
    const { host, executeScript } = hostFixture()
    installPage()
    installCrypto()
    const handle = createJihuaMessageHandler(host)

    const response = await handle(
      { channel: JIHUA_CHANNEL, action: 'connect', tabId: 1 },
      appSender(),
    ) as { ok: boolean; session?: { key: string; tabId: number; documentId: string; title: string }; binding?: string }

    expect(response.ok).toBe(true)
    expect(response.session?.key).toMatch(/^[a-f0-9]{64}$/)
    expect(response.session).toMatchObject({ tabId: 1, documentId: 'oa-document-1', title: '发明台账' })
    expect(response.binding).toBe(BINDING)
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      world: 'MAIN',
      target: { tabId: 1, frameIds: [0] },
      args: ['connect', expect.any(Object)],
    }))

    host.getTab = async () => ({ id: 1, url: 'https://oa.jihualab.net:444/' })
    const rejected = await handle(
      { channel: JIHUA_CHANNEL, action: 'connect', tabId: 1 },
      appSender(),
    )
    expect(rejected).toMatchObject({ ok: false })
    expect(executeScript).toHaveBeenCalledTimes(1)
  })

  it('keeps the same opaque owner across token refresh but fences the old binding and a different user', async () => {
    const pageWindow = installPage()
    installCrypto()
    let userId = 'user-1'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 200, user: { userId } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    const first = await runJihuaPageWorld('connect', {}) as { ok: boolean; sessionKey?: string; binding?: string }
    expect(first.ok).toBe(true)
    expect(first.sessionKey).toMatch(/^[a-f0-9]{64}$/)
    expect(first.binding).toBe(BINDING)
    expect(JSON.stringify(first)).not.toContain(TOKEN)

    vi.stubGlobal('document', { cookie: 'Admin-Token=refreshed-token' })
    const refreshed = await runJihuaPageWorld('connect', {}) as { ok: boolean; sessionKey?: string; binding?: string }
    expect(refreshed.sessionKey).toBe(first.sessionKey)
    expect(refreshed.binding).toBe(REFRESHED_BINDING)

    const stale = await runJihuaPageWorld('checkSession', { sessionKey: first.sessionKey, binding: first.binding }) as { ok: boolean }
    const current = await runJihuaPageWorld('checkSession', { sessionKey: refreshed.sessionKey, binding: refreshed.binding }) as { ok: boolean }
    expect(stale.ok).toBe(false)
    expect(current.ok).toBe(true)

    userId = 'user-2'
    const otherAccount = await runJihuaPageWorld('connect', {}) as { ok: boolean; sessionKey?: string }
    expect(otherAccount.ok).toBe(true)
    expect(otherAccount.sessionKey).not.toBe(first.sessionKey)
    expect(pageWindow).toBeTruthy()
  })

  it('stages bounded chunks and reuses one multipart POST for the same request id', async () => {
    const pageWindow = installPage()
    installCrypto()
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (requestUrl(_input).endsWith('/getInfo')) return new Response(JSON.stringify({ code: 200, user: { userId: 'user-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      const body = init?.body as FormData
      expect(body.get('TABLE_NAME')).toBe('PAT_PATENT_PARAMETER')
      expect(body.get('APPENDIX_TYPE')).toBe('ACPT_NOTICE')
      expect(body.get('OFC_TYPE')).toBe('FETCH_PDF')
      expect(body.get('file')).toBeInstanceOf(Blob)
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
      return new Response(JSON.stringify({ code: 200, data: { appendixList: [{ ID: 'attachment-1' }] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetcher)

    const connected = await runJihuaPageWorld('connect', {}) as { sessionKey: string; binding: string }
    const upload = {
      requestId: 'upload-1',
      sessionKey: connected.sessionKey,
      binding: connected.binding,
      fileName: 'notice.pdf',
      mimeType: 'application/pdf',
      size: 3,
      appendixType: 'ACPT_NOTICE',
      ofcType: 'FETCH_PDF',
      chunkSize: 2,
      chunkCount: 2,
    }
    const staged0 = await runJihuaPageWorld('stageChunk', {
      ...upload,
      chunkIndex: 0,
      offset: 0,
      base64: btoa('ab'),
    }) as { ok: boolean }
    const staged1 = await runJihuaPageWorld('stageChunk', {
      ...upload,
      chunkIndex: 1,
      offset: 2,
      base64: btoa('c'),
    }) as { ok: boolean }
    expect(staged0.ok).toBe(true)
    expect(staged1.ok).toBe(true)

    const firstStart = await runJihuaPageWorld('startUpload', upload) as { ok: boolean; receipt?: { state: string } }
    const duplicateStart = await runJihuaPageWorld('startUpload', upload) as { ok: boolean; receipt?: { state: string } }
    const conflict = await runJihuaPageWorld('startUpload', { ...upload, appendixType: 'FIRST_RESULT' }) as { ok: boolean }
    await Promise.resolve()
    await Promise.resolve()

    expect(firstStart.ok).toBe(true)
    expect(duplicateStart.ok).toBe(true)
    expect(conflict.ok).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(2) // one /getInfo and one multipart POST
    expect(fetcher).toHaveBeenCalledWith(`${OA_ORIGIN}/prod-api/conow/file/uploadAndOfc`, expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
    }))
    const sentForm = fetcher.mock.calls[1]?.[1]?.body as FormData
    expect([...sentForm.keys()]).toEqual(['TABLE_NAME', 'APPENDIX_TYPE', 'OFC_TYPE', 'file'])
    expect(pageWindow).toBeTruthy()
  })

  it('keeps bounded OA error details while redacting any echoed token', async () => {
    installPage()
    installCrypto()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const body = requestUrl(input).endsWith('/getInfo')
        ? { code: 200, user: { userId: 'user-1' } }
        : { code: 500, msg: `平台关联失败\nAuthorization: Bearer ${TOKEN}` }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    const connected = await runJihuaPageWorld('connect', {}) as { sessionKey: string; binding: string }
    const request = {
      requestId: 'error-detail-1',
      method: 'GET',
      path: '/conow/pat/parameter/INVENTION?pageNum=1&pageSize=100&PATENT_NUM=202610000001X',
      sessionKey: connected.sessionKey,
      binding: connected.binding,
    }
    await runJihuaPageWorld('startRequest', request)
    let result: { receipt?: { state?: string; error?: string } } = {}
    await vi.waitFor(async () => {
      result = await runJihuaPageWorld('receipt', request) as { receipt?: { state?: string; error?: string } }
      expect(result.receipt?.state).toBe('failed')
    })
    expect(result.receipt?.error).toContain('平台关联失败')
    expect(result.receipt?.error).not.toContain(TOKEN)
    expect(result.receipt?.error).toContain('[已隐藏]')
  })

  it('keeps a write receipt until the owning page acknowledges a settled result', async () => {
    installPage()
    installCrypto()
    let finishWrite!: (response: Response) => void
    let updateBody: BodyInit | null | undefined
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (requestUrl(input).endsWith('/getInfo')) return new Response(JSON.stringify({ code: 200, user: { userId: 'user-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      updateBody = init?.body
      return await new Promise<Response>(resolve => { finishWrite = resolve })
    })
    vi.stubGlobal('fetch', fetcher)
    const connected = await runJihuaPageWorld('connect', {}) as { sessionKey: string; binding: string }
    const write = {
      requestId: 'update-ack-1',
      sessionKey: connected.sessionKey,
      binding: connected.binding,
      method: 'POST',
      path: '/conow/pat/parameter/patent/update',
      body: { patentParameter: { ID: 'record-1', PATENT_NO: 'CN202110085061.2' }, acptNoticeAppendixList: ['attachment-1'] },
    }
    const first = await runJihuaPageWorld('startRequest', write) as { ok: boolean; receipt?: { state: string } }
    const earlyAck = await runJihuaPageWorld('ackReceipt', write) as { ok: boolean }
    const duplicate = await runJihuaPageWorld('startRequest', write) as { ok: boolean; receipt?: { state: string } }
    expect(first).toMatchObject({ ok: true, receipt: { state: 'pending' } })
    expect(earlyAck.ok).toBe(false)
    expect(duplicate).toMatchObject({ ok: true, receipt: { state: 'pending' } })
    expect(fetcher).toHaveBeenCalledTimes(2) // getInfo plus one write
    expect(updateBody).toBe('{"acptNoticeAppendixList":["attachment-1"],"patentParameter":{"ID":"record-1","PATENT_NO":"CN202110085061.2"}}')

    finishWrite(new Response(JSON.stringify({ code: 200, msg: 'updated' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    let receipt: { receipt?: { state?: string } } = {}
    await vi.waitFor(async () => {
      receipt = await runJihuaPageWorld('receipt', write) as { receipt?: { state?: string } }
      expect(receipt.receipt?.state).toBe('done')
    })
    const acknowledged = await runJihuaPageWorld('ackReceipt', write) as { ok: boolean; acknowledged?: boolean }
    const cleared = await runJihuaPageWorld('receipt', write) as { receipt?: { state?: string } }
    expect(acknowledged).toEqual({ ok: true, acknowledged: true })
    expect(cleared.receipt?.state).toBe('missing')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects malformed application numbers before sending a full-record update', async () => {
    installPage()
    installCrypto()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: 200, user: { userId: 'user-1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetcher)
    const connected = await runJihuaPageWorld('connect', {}) as { sessionKey: string; binding: string }
    const rejected = await runJihuaPageWorld('startRequest', {
      requestId: 'invalid-update-1',
      sessionKey: connected.sessionKey,
      binding: connected.binding,
      method: 'POST',
      path: '/conow/pat/parameter/patent/update',
      body: { patentParameter: { ID: 'record-1', PATENT_NO: 'not-an-application-number' } },
    }) as { ok: boolean }

    expect(rejected.ok).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1) // schema-only /getInfo; no update POST
  })

  it('rejects delete and arbitrary URL requests before fetch', async () => {
    installPage()
    installCrypto()
    const fetcher = vi.fn(async (input: RequestInfo | URL) => requestUrl(input).endsWith('/getInfo')
      ? new Response(JSON.stringify({ code: 200, user: { userId: 'user-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      : new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetcher)
    const connected = await runJihuaPageWorld('connect', {}) as { sessionKey: string; binding: string }

    const deleted = await runJihuaPageWorld('startRequest', {
      sessionKey: connected.sessionKey,
      binding: connected.binding,
      requestId: 'delete-1',
      method: 'POST',
      path: '/prod-api/conow/file/delete',
      body: { id: ['attachment-1'] },
    }) as { ok: boolean }
    const external = await runJihuaPageWorld('startRequest', {
      sessionKey: connected.sessionKey,
      binding: connected.binding,
      requestId: 'external-1',
      method: 'GET',
      path: 'https://evil.example/upload',
    }) as { ok: boolean }

    expect(deleted.ok).toBe(false)
    expect(external.ok).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1) // the schema-only /getInfo request
  })
})
