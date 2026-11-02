export const JIHUA_CHANNEL = 'PATMAIL_JIHUA'

const OA_ORIGIN = 'https://oa.jihualab.net'
const APP_PATH = '/app.html'

export interface JihuaMessageHost {
  extensionId: string
  queryTabs(): Promise<Array<{ id?: number; title?: string; url?: string }>>
  getTab(tabId: number): Promise<{ id?: number; title?: string; url?: string }>
  executeScript(injection: {
    target: chrome.scripting.InjectionTarget
    world: 'MAIN'
    func: typeof runJihuaPageWorld
    args: [string, Record<string, unknown>]
  }): Promise<Array<{ documentId?: string; result?: unknown }>>
}

type JihuaSessionPayload = { key: string; tabId: number; documentId: string; title: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function safeError(value: unknown): string {
  const text = value instanceof Error ? value.message : typeof value === 'string' ? value : ''
  return (text || '季华页面没有完成操作。').replace(/[\r\n\0]/g, ' ').slice(0, 500)
}

function isOaTab(tab: { url?: string }): boolean {
  if (typeof tab.url !== 'string') return false
  try {
    const url = new URL(tab.url)
    return url.protocol === 'https:' && url.hostname === 'oa.jihualab.net' && url.port === '' && url.origin === OA_ORIGIN
  } catch {
    return false
  }
}

function isAppSender(sender: chrome.runtime.MessageSender, extensionId: string): boolean {
  if (sender.id !== extensionId || typeof sender.url !== 'string') return false
  try {
    const url = new URL(sender.url)
    return url.protocol === 'chrome-extension:' && url.hostname === extensionId && url.pathname === APP_PATH
  } catch {
    return false
  }
}

function isSession(value: unknown): value is JihuaSessionPayload {
  if (!isRecord(value)) return false
  return typeof value.key === 'string' && /^[a-f0-9]{64}$/i.test(value.key) &&
    Number.isSafeInteger(value.tabId) && typeof value.documentId === 'string' && value.documentId.length > 0 &&
    typeof value.title === 'string'
}

function validBinding(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{16,128}$/.test(value)
}

export function createJihuaMessageHandler(host: JihuaMessageHost): (
  message: unknown,
  sender: chrome.runtime.MessageSender,
) => Promise<unknown> {
  return async (message, sender) => {
    if (!isAppSender(sender, host.extensionId) || !isRecord(message) || message.channel !== JIHUA_CHANNEL || typeof message.action !== 'string') {
      return { ok: false, error: '季华页面调用方无效。' }
    }

    if (message.action === 'listTabs') {
      try {
        const tabs = await host.queryTabs()
        return {
          ok: true,
          tabs: tabs.filter(tab => Number.isSafeInteger(tab.id) && isOaTab(tab))
            .map(tab => ({ id: tab.id!, title: typeof tab.title === 'string' ? tab.title : '季华 OA' })),
        }
      } catch {
        return { ok: false, error: '读取季华 OA 标签页失败。' }
      }
    }

    if (!Number.isSafeInteger(message.tabId)) return { ok: false, error: '季华 OA 标签页编号无效。' }
    const tabId = message.tabId as number
    let tab: { id?: number; title?: string; url?: string }
    try {
      tab = await host.getTab(tabId)
    } catch {
      return { ok: false, error: '季华 OA 标签页已关闭。' }
    }
    if (tab.id !== tabId || !isOaTab(tab)) return { ok: false, error: '请选择已登录的季华 OA HTTPS 标签页。' }

    if (message.action === 'connect') {
      try {
        const results = await host.executeScript({
          target: { tabId, frameIds: [0] },
          world: 'MAIN',
          func: runJihuaPageWorld,
          args: ['connect', {}],
        })
        const result = results[0]?.result
        const documentId = results[0]?.documentId
        if (!isRecord(result) || result.ok !== true || typeof result.sessionKey !== 'string' ||
            !/^[a-f0-9]{64}$/i.test(result.sessionKey) || !validBinding(result.binding) || typeof documentId !== 'string' || !documentId) {
          return { ok: false, error: isRecord(result) && typeof result.error === 'string' ? safeError(result.error) : '季华 OA 登录状态无法确认。' }
        }
        return {
          ok: true,
          session: { key: result.sessionKey, tabId, documentId, title: typeof tab.title === 'string' ? tab.title : '季华 OA' },
          binding: result.binding,
        }
      } catch {
        return { ok: false, error: '无法连接季华 OA 主页面，请确认标签页仍打开。' }
      }
    }

    const session = message.session
    if (!isSession(session) || session.tabId !== tabId || typeof message.binding !== 'string' || !validBinding(message.binding)) {
      return { ok: false, error: '季华页面会话信息无效。' }
    }
    if (session.documentId.length > 256 || session.title.length > 500) return { ok: false, error: '季华页面会话信息无效。' }

    const { channel: _channel, action, session: _session, binding, tabId: _tabId, ...payload } = message
    const allowed = new Set(['checkSession', 'stageChunk', 'startRequest', 'startUpload', 'receipt', 'ackReceipt', 'discardStage'])
    if (!allowed.has(action)) return { ok: false, error: '季华页面操作不在允许范围内。' }
    try {
      const results = await host.executeScript({
        target: { tabId, documentIds: [session.documentId] },
        world: 'MAIN',
        func: runJihuaPageWorld,
        args: [action, { ...payload, sessionKey: session.key, binding }],
      })
      const result = results[0]?.result
      if (!isRecord(result)) return { ok: false, error: '季华页面没有返回有效回执。' }
      if (result.ok !== true && typeof result.error !== 'string') return { ok: false, error: '季华页面拒绝了该操作。' }
      return result
    } catch {
      return { ok: false, error: '季华页面已变化或关闭，原请求回执不可用。' }
    }
  }
}

/**
 * This function is injected into the OA MAIN world. Keep every helper and constant
 * inside it: Chrome serializes the function and does not carry module closures.
 */
export async function runJihuaPageWorld(action: string, payload: Record<string, unknown>): Promise<unknown> {
  const STATE_KEY = '__PATMAIL_JIHUA_TRANSPORT_V1__'
  const CHUNK_LIMIT = 256 * 1024
  const MAX_STAGED_FILES = 12
  const MAX_OPERATIONS = 4096
  const MAX_FILE_BYTES = 256 * 1024 * 1024
  const APPENDIX_TYPES = new Set([
    'FIRST_RESULT', 'MODIFY_TECHNICAL_DISCLOSURE', 'FINAL_SEARCH_REPORT', 'FINAL_RESULT', 'FAST_PROMISE',
    'FAST_ACPT_NOTICE', 'FAST_CHECK_REQ_NOTICE', 'FAST_CHECK_REQ_PASS', 'FINAL_TECHNICAL_DISCLOSURE',
    'FINAL_APPLICATION_DOCUMENTS', 'COMMIT_SASAC_REQUEST', 'COMMIT_SASAC_APPLY', 'ACPT_NOTICE',
    'FEE_REDUCTION_APPROVAL_NOTICE', 'FIRST_FIX', 'PATENT_REQUEST', 'APPLY_FILE', 'FIRST_CHECK_PASS_NOTICE',
    'SUB_EXAM_PHASE_NOTICE', 'EXA_STAGE_NOTICE', 'REVIEW_NOTICE', 'OPINION_STATEMENT', 'CLAIM',
    'PRIORITY_REVIEW_RESULT_NOTICE', 'PRIORITY_REVIEW_REQ', 'PRIORITY_REVIEW_PROXY', 'PRIORITY_REVIEW_PROOF',
    'CORP_CERTIFICATE', 'PRIORITY_REVIEW_NOTICE', 'GRANT_NOTICE', 'REGISTRATION_NOTICE', 'STATUS_RIGHT',
    'REJECT_DECISION', 'REJECT_REPORT', 'REGARD_AS_REVOKE', 'COMPLIANCE_NOTICE', 'TRANSFER_PRO_QUALIFIED',
    'EXP_INVOICE', 'FUND_REQ',
  ])
  const OFC_TYPES: Record<string, string> = {
    FAST_ACPT_NOTICE: 'FETCH_NOTICE',
    ACPT_NOTICE: 'FETCH_PDF',
    SUB_EXAM_PHASE_NOTICE: 'FETCH_PUBTIME',
    EXA_STAGE_NOTICE: 'FETCH_ISSUETIME',
    PRIORITY_REVIEW_RESULT_NOTICE: 'FETCH_REVIEWRESULT',
    STATUS_RIGHT: 'FETCH_AUTHORTIME',
    REJECT_DECISION: 'FETCH_REJECTTIME',
  }

  type Receipt = { state: 'missing' | 'pending' | 'done' | 'failed'; value?: unknown; error?: string }
  type Operation = { owner: string; fingerprint: string; method: 'GET' | 'POST'; receipt: Receipt }
  type ByteChunk = Uint8Array<ArrayBuffer>
  type UploadMetadata = {
    requestId: string; fileName: string; mimeType: string; size: number; appendixType: string
    ofcType?: string; chunkSize: number; chunkCount: number
  }
  type StagedFile = { owner: string; signature: string; metadata: UploadMetadata; chunks: Map<number, ByteChunk>; bytes: number }
  type PageState = {
    ownerKey: string; tokenFingerprint: string; binding: string
    staged: Map<string, StagedFile>; operations: Map<string, Operation>
  }
  const page = window as unknown as Record<string, unknown>

  function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value))
  }
  function fail(error: string): { ok: false; error: string } { return { ok: false, error: error.slice(0, 500) } }
  function getState(): PageState {
    const existing = page[STATE_KEY] as PageState | undefined
    if (existing && existing.staged instanceof Map && existing.operations instanceof Map) return existing
    const created: PageState = { ownerKey: '', tokenFingerprint: '', binding: '', staged: new Map(), operations: new Map() }
    page[STATE_KEY] = created
    return created
  }
  async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  }
  function requestToken(): string {
    const prefix = 'Admin-Token='
    const entry = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))
    if (!entry) return ''
    const raw = entry.slice(prefix.length)
    try { return decodeURIComponent(raw) } catch { return raw }
  }
  function backendMessage(value: unknown, token: string): string {
    if (!isRecord(value) || typeof value.msg !== 'string') return ''
    return value.msg
      .replaceAll(token, '[已隐藏]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]')
      .replace(/(?:Admin-Token|access[_ -]?token)\s*[:=]\s*\S+/gi, '[令牌已隐藏]')
      .replace(/[\r\n\0]/g, ' ')
      .trim()
      .slice(0, 400)
  }
  function newBinding(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  }
  function safeJson(value: unknown, depth = 0, count = { keys: 0 }): string {
    if (depth > 32) throw new Error('请求数据嵌套过深。')
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('请求包含无效数字。')
      return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
      if (value.length > 10000) throw new Error('请求数据过大。')
      return `[${value.map(item => safeJson(item, depth + 1, count)).join(',')}]`
    }
    if (!isRecord(value)) throw new Error('请求数据结构无效。')
    const keys = Object.keys(value).sort()
    count.keys += keys.length
    if (count.keys > 20000 || keys.some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) {
      throw new Error('请求包含不允许的字段。')
    }
    return `{${keys.map(key => `${JSON.stringify(key)}:${safeJson(value[key], depth + 1, count)}`).join(',')}}`
  }
  function validRequestId(value: unknown): value is string {
    return typeof value === 'string' && value.length >= 1 && value.length <= 128 && /^[a-zA-Z0-9._:-]+$/.test(value)
  }
  async function fetchJson(url: string, method: 'GET' | 'POST', token: string, body?: unknown, timeoutMs = 120000): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${token}` }
      let bodyText: string | undefined
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json;charset=UTF-8'
        bodyText = safeJson(body)
        if (bodyText.length > 16 * 1024 * 1024) throw new Error('请求数据超过大小限制。')
      }
      const response = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers,
        ...(bodyText === undefined ? {} : { body: bodyText }),
        signal: controller.signal,
      })
      if (!response.ok && !/\bjson\b/i.test(response.headers.get('content-type') ?? '')) {
        throw new Error(`OA 请求失败（HTTP ${response.status}）；结果未确认，请先回读核对。`)
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (!/\bjson\b/i.test(contentType)) throw new Error('OA 响应不是 JSON，可能已跳转登录页；结果未确认。')
      let result: unknown
      try { result = await response.json() } catch { throw new Error('OA 返回的数据格式无效；结果未确认。') }
      const detail = backendMessage(result, token)
      if (!response.ok) throw new Error(`OA 请求失败（HTTP ${response.status}）${detail ? `：${detail}` : '；结果未确认。'}`)
      if (!isRecord(result) || result.code !== 200) {
        if (isRecord(result) && (result.code === 401 || result.code === 403)) throw new Error('季华登录已失效，请重新连接 OA 页面。')
        throw new Error(detail ? `OA 未确认请求成功：${detail}` : 'OA 没有确认请求成功；请先回读核对。')
      }
      return result
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw new Error('OA 请求超过时限；结果未确认，请回读核对。')
      if (error instanceof TypeError) throw new Error('无法连接季华 OA；结果未确认，请检查网络后回读核对。')
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
  async function connect(): Promise<unknown> {
    if (location.origin !== 'https://oa.jihualab.net') return fail('当前页面不是受支持的季华 OA HTTPS 页面。')
    const token = requestToken()
    if (!token || token.length > 8192) return fail('季华 OA 尚未登录或登录令牌不可读取。')
    try {
      const response = await fetchJson(`${location.origin}/prod-api/getInfo`, 'GET', token, undefined, 30000)
      if (!isRecord(response) || response.code !== 200 || !isRecord(response.user)) return fail('季华 OA 登录信息格式无法确认。')
      const userIdValue = response.user.userId
      if ((typeof userIdValue !== 'string' && typeof userIdValue !== 'number') || !String(userIdValue).trim() || String(userIdValue).length > 256) {
        return fail('季华 OA 登录信息缺少稳定用户编号。')
      }
      const state = getState()
      const ownerKey = await sha256(`jihua:${String(userIdValue).trim()}`)
      const tokenFingerprint = await sha256(token)
      const binding = newBinding()
      // Staged bytes have not reached the server until startUpload creates an operation.
      // Drop abandoned pre-send staging on reconnect while preserving in-flight receipts.
      for (const [requestId, staged] of state.staged) {
        if (!state.operations.has(requestId)) {
          staged.chunks.clear()
          state.staged.delete(requestId)
        }
      }
      state.ownerKey = ownerKey
      state.tokenFingerprint = tokenFingerprint
      state.binding = binding
      return { ok: true, sessionKey: ownerKey, binding }
    } catch (error) {
      return fail(error instanceof Error ? error.message : '无法确认季华 OA 登录状态。')
    }
  }
  async function authorize(): Promise<{ state: PageState; token: string } | { error: string }> {
    const state = getState()
    const token = requestToken()
    if (!token || !state.ownerKey || payload.sessionKey !== state.ownerKey || payload.binding !== state.binding) {
      return { error: '季华页面连接已变化，请重新连接后继续。' }
    }
    if (await sha256(token) !== state.tokenFingerprint) return { error: '季华登录状态已变化，请重新连接后继续。' }
    return { state, token }
  }
  function decodeBase64(value: string): ByteChunk {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('分块编码无效。')
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    return bytes
  }
  function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return false
    return true
  }
  function parseUploadMetadata(value: Record<string, unknown>): UploadMetadata {
    if (!validRequestId(value.requestId)) throw new Error('上传请求编号无效。')
    if (typeof value.fileName !== 'string' || !value.fileName.trim() || value.fileName.length > 255 || /[\\/\r\n\0]/.test(value.fileName)) {
      throw new Error('文件名无效。')
    }
    if (typeof value.mimeType !== 'string' || value.mimeType.length > 127 || !/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(value.mimeType)) {
      throw new Error('文件类型无效。')
    }
    if (!Number.isSafeInteger(value.size) || (value.size as number) <= 0 || (value.size as number) > MAX_FILE_BYTES) {
      throw new Error('文件超过当前本地暂存上限 256 MiB，请拆分材料或通过季华原站上传。')
    }
    if (typeof value.appendixType !== 'string' || !APPENDIX_TYPES.has(value.appendixType)) throw new Error('材料类型不在季华传文清单中。')
    const expectedOfc = OFC_TYPES[value.appendixType]
    if (value.ofcType !== undefined && value.ofcType !== expectedOfc) throw new Error('官文识别类型与材料不匹配。')
    if (!Number.isSafeInteger(value.chunkSize) || (value.chunkSize as number) < 1 || (value.chunkSize as number) > CHUNK_LIMIT) throw new Error('文件分块大小无效。')
    const size = value.size as number
    const chunkSize = value.chunkSize as number
    const chunkCount = Math.ceil(size / chunkSize)
    if (!Number.isSafeInteger(value.chunkCount) || value.chunkCount !== chunkCount || chunkCount > 20000) throw new Error('文件分块数量无效。')
    return {
      requestId: value.requestId,
      fileName: value.fileName,
      mimeType: value.mimeType,
      size,
      appendixType: value.appendixType,
      ...(typeof value.ofcType === 'string' ? { ofcType: value.ofcType } : {}),
      chunkSize,
      chunkCount,
    }
  }
  function uploadSignature(metadata: UploadMetadata): string {
    return JSON.stringify(metadata)
  }
  function allowedRequest(value: Record<string, unknown>): { url: string; method: 'GET' | 'POST'; body?: unknown } {
    if (typeof value.path !== 'string' || value.path.length > 4096 || !value.path.startsWith('/') || value.path.startsWith('//') || value.path.includes('#')) {
      throw new Error('季华 API 路径无效。')
    }
    const method = value.method === undefined ? 'GET' : value.method
    if (method !== 'GET' && method !== 'POST') throw new Error('季华 API 方法不在允许范围内。')
    const parsed = new URL(value.path, location.origin)
    if (parsed.origin !== location.origin || parsed.username || parsed.password || parsed.hash) throw new Error('季华 API 只能使用当前 OA 来源。')
    let path = decodeURIComponent(parsed.pathname)
    if (path.startsWith('/prod-api/')) path = path.slice('/prod-api'.length)
    if (path.includes('\\') || path.includes('//')) throw new Error('季华 API 路径无效。')
    if (method === 'GET') {
      const listMatch = path.match(/^\/conow\/pat\/parameter\/(INVENTION|UTILITY)$/)
      if (listMatch) {
        const allowed = new Set(['pageNum', 'pageSize', 'PATENT_NUM'])
        const seen = new Set<string>()
        for (const key of parsed.searchParams.keys()) {
          if (!allowed.has(key) || seen.has(key)) throw new Error('季华台账查询参数不在允许范围内。')
          seen.add(key)
        }
        const values = Object.fromEntries(parsed.searchParams.entries())
        if (!/^[1-9]\d{0,3}$/.test(values.pageNum ?? '') || Number(values.pageNum) > 1000 ||
            !/^(?:[1-9]\d?|100)$/.test(values.pageSize ?? '') || !/^\d{12}[\dX]$/.test(values.PATENT_NUM ?? '')) {
          throw new Error('季华台账查询参数无效。')
        }
        return { url: `${location.origin}/prod-api${path}${parsed.search}`, method }
      }
      const detailMatch = path.match(/^\/conow\/pat\/parameter\/(INVENTION|UTILITY)\/([A-Za-z0-9_-]{1,128})$/)
      if (detailMatch && !parsed.search) return { url: `${location.origin}/prod-api${path}`, method }
      throw new Error('季华只读 API 不在允许范围内。')
    }
    if (path !== '/conow/pat/parameter/patent/update' || parsed.search) throw new Error('季华写入 API 不在允许范围内。')
    const update = value.body
    const rawApplicationNo = isRecord(update) && isRecord(update.patentParameter) && typeof update.patentParameter.PATENT_NO === 'string'
      ? update.patentParameter.PATENT_NO
      : ''
    const normalizedApplicationNo = rawApplicationNo.trim().toUpperCase().replace(/\s+/g, '').replace(/^CN/, '').replace(/[.-]/g, '')
    if (!isRecord(update) || !isRecord(update.patentParameter) || typeof update.patentParameter.ID !== 'string' ||
        !update.patentParameter.ID.trim() || update.patentParameter.ID.length > 128 ||
        !/^\d{12}[\dX]$/.test(normalizedApplicationNo)) {
      throw new Error('季华台账更新缺少有效案件标识。')
    }
    for (const [key, ids] of Object.entries(update)) {
      if (key === 'patentParameter') continue
      if (!/^[A-Za-z][A-Za-z0-9]*AppendixList$/.test(key) || !Array.isArray(ids) || ids.length > 100 ||
          ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 128)) {
        throw new Error('季华附件关联字段或附件 ID 无效。')
      }
    }
    const serialized = safeJson(update)
    if (serialized.length > 16 * 1024 * 1024) throw new Error('季华更新数据超过大小限制。')
    return { url: `${location.origin}/prod-api${path}`, method, body: value.body }
  }
  function receiptFor(state: PageState, requestId: string): Receipt {
    return state.operations.get(requestId)?.receipt ?? { state: 'missing' }
  }
  function startOperation(state: PageState, token: string, requestId: string, fingerprint: string, url: string,
    method: 'GET' | 'POST', body?: unknown, timeoutMs = 120000): Promise<unknown> {
    const previous = state.operations.get(requestId)
    if (previous) {
      if (previous.owner !== state.ownerKey || previous.fingerprint !== fingerprint) throw new Error('该 request id 已用于其他请求，未重复发送。')
      return Promise.resolve({ ok: true, receipt: previous.receipt })
    }
    if (state.operations.size >= MAX_OPERATIONS) throw new Error('页面回执表已满。请在完成当前任务后重新连接页面。')
    const operation: Operation = { owner: state.ownerKey, fingerprint, method, receipt: { state: 'pending' } }
    state.operations.set(requestId, operation)
    void (async () => {
      try {
        const value = await fetchJson(url, method, token, body, timeoutMs)
        operation.receipt = { state: 'done', value }
      } catch (error) {
        operation.receipt = { state: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : 'OA 请求结果未确认。' }
      } finally {
        const staged = state.staged.get(requestId)
        if (staged) {
          staged.chunks.clear()
          state.staged.delete(requestId)
        }
      }
    })()
    return Promise.resolve({ ok: true, receipt: operation.receipt })
  }

  try {
    if (action === 'connect') return await connect()
    if (location.origin !== 'https://oa.jihualab.net') return fail('当前页面不是受支持的季华 OA HTTPS 页面。')
    const authorized = await authorize()
    if ('error' in authorized) return fail(authorized.error)
    const { state, token } = authorized

    if (action === 'checkSession') return { ok: true, sessionKey: state.ownerKey }
    if (action === 'receipt') {
      if (!validRequestId(payload.requestId)) return fail('请求编号无效。')
      const operation = state.operations.get(payload.requestId)
      if (operation && operation.owner !== state.ownerKey) return fail('请求回执属于另一季华账号。')
      const receipt = receiptFor(state, payload.requestId)
      if (operation?.method === 'GET' && receipt.state !== 'pending') state.operations.delete(payload.requestId)
      return { ok: true, receipt }
    }
    if (action === 'ackReceipt') {
      if (!validRequestId(payload.requestId)) return fail('请求编号无效。')
      const operation = state.operations.get(payload.requestId)
      if (!operation) return { ok: true, acknowledged: true }
      if (operation.owner !== state.ownerKey) return fail('请求回执属于另一季华账号。')
      if (operation.method !== 'POST') return fail('仅已持久化的写请求回执可以确认清理。')
      if (operation.receipt.state === 'pending') return fail('请求仍在处理中，不能清理回执。')
      operation.receipt.value = undefined
      operation.receipt.error = undefined
      const staged = state.staged.get(payload.requestId)
      staged?.chunks.clear()
      state.staged.delete(payload.requestId)
      state.operations.delete(payload.requestId)
      return { ok: true, acknowledged: true }
    }
    if (action === 'discardStage') {
      if (!validRequestId(payload.requestId)) return fail('请求编号无效。')
      if (state.operations.has(payload.requestId)) return fail('该请求已开始，不能丢弃上传回执。')
      const staged = state.staged.get(payload.requestId)
      if (staged && staged.owner !== state.ownerKey) return fail('暂存文件属于另一季华账号。')
      staged?.chunks.clear()
      state.staged.delete(payload.requestId)
      return { ok: true }
    }
    if (action === 'stageChunk') {
      const metadata = parseUploadMetadata(payload)
      if (!Number.isSafeInteger(payload.chunkIndex) || (payload.chunkIndex as number) < 0 || (payload.chunkIndex as number) >= metadata.chunkCount ||
          !Number.isSafeInteger(payload.offset) || typeof payload.base64 !== 'string') return fail('上传分块信息无效。')
      if (state.operations.has(metadata.requestId)) return fail('该上传请求已开始，不能重新暂存。')
      let staged = state.staged.get(metadata.requestId)
      const signature = uploadSignature(metadata)
      if (!staged) {
        if (state.staged.size >= MAX_STAGED_FILES) return fail('页面暂存文件数已达上限，请稍后重试。')
        staged = { owner: state.ownerKey, signature, metadata, chunks: new Map(), bytes: 0 }
        state.staged.set(metadata.requestId, staged)
      }
      if (staged.owner !== state.ownerKey || staged.signature !== signature) return fail('同一上传请求编号对应了不同文件信息。')
      const chunkIndex = payload.chunkIndex as number
      const offset = payload.offset as number
      if (offset !== chunkIndex * metadata.chunkSize) return fail('上传分块偏移无效。')
      const bytes = decodeBase64(payload.base64)
      const expectedLength = Math.min(metadata.chunkSize, metadata.size - offset)
      if (bytes.length !== expectedLength) return fail('上传分块长度与文件信息不符。')
      const previous = staged.chunks.get(chunkIndex)
      if (previous) {
        if (!sameBytes(previous, bytes)) return fail('相同分块编号收到不同内容。')
        return { ok: true, receivedBytes: staged.bytes }
      }
      staged.chunks.set(chunkIndex, bytes)
      staged.bytes += bytes.length
      return { ok: true, receivedBytes: staged.bytes }
    }
    if (action === 'startRequest') {
      if (!validRequestId(payload.requestId)) return fail('请求编号无效。')
      const request = allowedRequest(payload)
      const bodyJson = request.body === undefined ? '' : safeJson(request.body)
      const fingerprint = await sha256(JSON.stringify([request.method, request.url, bodyJson]))
      return await startOperation(state, token, payload.requestId, fingerprint, request.url, request.method, request.body, 120000)
    }
    if (action === 'startUpload') {
      const metadata = parseUploadMetadata(payload)
      const target = metadata.ofcType ? 'uploadAndOfc' : 'upload'
      const signature = uploadSignature(metadata)
      const fingerprint = await sha256(JSON.stringify([target, signature]))
      const previous = state.operations.get(metadata.requestId)
      if (previous) {
        if (previous.owner !== state.ownerKey || previous.fingerprint !== fingerprint) return fail('该上传 request id 已用于其他请求。')
        return { ok: true, receipt: previous.receipt }
      }
      const staged = state.staged.get(metadata.requestId)
      if (!staged || staged.owner !== state.ownerKey || staged.signature !== signature || staged.bytes !== metadata.size || staged.chunks.size !== metadata.chunkCount) {
        return fail('上传文件分块不完整，尚未发送。')
      }
      for (let index = 0; index < metadata.chunkCount; index++) if (!staged.chunks.has(index)) return fail('上传文件分块不完整，尚未发送。')
      if (state.operations.size >= MAX_OPERATIONS) return fail('页面回执表已满。请在完成当前任务后重新连接页面。')
      const operation: Operation = { owner: state.ownerKey, fingerprint, method: 'POST', receipt: { state: 'pending' } }
      state.operations.set(metadata.requestId, operation)
      const parts: ByteChunk[] = []
      for (let index = 0; index < metadata.chunkCount; index++) parts.push(staged.chunks.get(index)!)
      const blob = new Blob(parts, { type: metadata.mimeType })
      const form = new FormData()
      form.append('TABLE_NAME', 'PAT_PATENT_PARAMETER')
      form.append('APPENDIX_TYPE', metadata.appendixType)
      if (metadata.ofcType) form.append('OFC_TYPE', metadata.ofcType)
      // Match the platform's Element Upload contract: metadata parts precede the file.
      form.append('file', blob, metadata.fileName)
      const endpoint = `${location.origin}/prod-api/conow/file/${target}`
      void (async () => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 600000)
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
            body: form,
            signal: controller.signal,
          })
          if (!response.ok && !/\bjson\b/i.test(response.headers.get('content-type') ?? '')) {
            throw new Error(`OA 上传失败（HTTP ${response.status}）；结果未确认，请先回读核对。`)
          }
          const contentType = response.headers.get('content-type') ?? ''
          if (!/\bjson\b/i.test(contentType)) throw new Error('OA 响应不是 JSON，可能已跳转登录页；上传结果未确认。')
          let value: unknown
          try { value = await response.json() } catch { throw new Error('OA 返回的数据格式无效；上传结果未确认。') }
          const detail = backendMessage(value, token)
          if (!response.ok) throw new Error(`OA 上传失败（HTTP ${response.status}）${detail ? `：${detail}` : '；结果未确认。'}`)
          if (!isRecord(value) || value.code !== 200) {
            if (isRecord(value) && (value.code === 401 || value.code === 403)) throw new Error('季华登录已失效，请重新连接 OA 页面。')
            throw new Error(detail ? `OA 未确认上传成功：${detail}` : 'OA 没有确认上传成功；请先回读核对。')
          }
          operation.receipt = { state: 'done', value }
        } catch (error) {
          const detail = error instanceof DOMException && error.name === 'AbortError'
            ? 'OA 上传超过时限；结果未确认，请先回读核对。'
            : error instanceof TypeError
              ? '无法连接季华 OA；上传结果未确认，请先回读核对。'
              : error instanceof Error ? error.message : '上传结果未确认，请先回读核对。'
          operation.receipt = { state: 'failed', error: detail.slice(0, 500) }
        } finally {
          clearTimeout(timer)
          staged.chunks.clear()
          state.staged.delete(metadata.requestId)
        }
      })()
      return { ok: true, receipt: operation.receipt }
    }
    return fail('季华页面操作不在允许范围内。')
  } catch (error) {
    return fail(error instanceof Error ? error.message : '季华页面没有完成操作。')
  }
}

export async function handleJihuaMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id || !chrome.tabs || !chrome.scripting?.executeScript) {
    return { ok: false, error: '季华页面连接能力不可用。' }
  }
  return createJihuaMessageHandler({
    extensionId: chrome.runtime.id,
    queryTabs: () => chrome.tabs.query({}),
    getTab: tabId => chrome.tabs.get(tabId),
    executeScript: injection => chrome.scripting.executeScript(injection),
  })(message, sender)
}
