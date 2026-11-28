import { REPO_ROOT } from '../shared/paths.mjs'
import {ResearchOutputBudget,safeAnalysisOutput} from '../hague/research/hague-research-output.mjs'
import { HagueResearchDiagnostics } from '../hague/research/hague-research.mjs'
import { AnalysisWorker } from '../hague/research/hague-research-broker.mjs'
import { CdpUiBridge } from '../hague/diagnostics/hague-diagnostics-bridge.mjs'
import { observerEventsToTraces } from '../../src/hague/diagnostics/observer-adapter.mjs'
import { HagueDeepDiagnostics, safeHagueUrl, networkMetadata, correlateRequest, safeHagueSnapshotText, safeDraftTextSummary } from '../hague/diagnostics/hague-diagnostics.mjs'
import { sanitizeTraceEvent } from '../../src/hague/diagnostics/schema.mjs'
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { spawn } from 'node:child_process'
import { isIP } from 'node:net'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_PATMAIL_EXTENSION_ID = 'ieobhddlnmlopeagjkgbjfolpfhncikd'
export const OBSERVER_BINDING = '__patmailCdpObserver'
export const SERVICE_HEARTBEAT_MS = 15_000
export const SERVICE_READY_TIMEOUT_MS = 20_000
export const SERVICE_CONNECT_TIMEOUT_MS = 120_000
export const SERVICE_DISCOVERY_TIMEOUT_MS = 20_000
export const SERVICE_STOP_TIMEOUT_MS = 5_000
export const DISCOVERY_PROBE_TIMEOUT_MS = 2_000
export const DISCOVERY_WS_PROBE_TIMEOUT_MS = 5_000
export const LOG_RETENTION_MS = 24 * 60 * 60 * 1000

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = REPO_ROOT
const CONNECT_RETRY_MS = 2_000
const CONNECT_RETRY_MAX_MS = 30_000
const DISCOVERY_RETRY_MS = 5_000
const CONTROL_REQUEST_TIMEOUT_MS = 2_000
const CDP_COMMAND_TIMEOUT_MS = 8_000
const SNAPSHOT_POLL_MS = 2_000
const JIHUA_TASK_SNAPSHOT_MS = 15_000
const LOG_PRUNE_MS = 60 * 1000

const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))
const nowIso = () => new Date().toISOString()
const finiteNumber = value => typeof value === 'number' && Number.isFinite(value)

export function isLoopbackHostname(hostname) {
  const host = String(hostname ?? '').toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === 'localhost.') return true
  if (host === '::1' || host === '::ffff:127.0.0.1') return true
  if (isIP(host) === 4) return Number(host.split('.')[0]) === 127
  return false
}

export function validateEndpointUrl(value) {
  let url
  try {
    url = new URL(String(value))
  } catch {
    throw new Error('CDP endpoint must be an absolute localhost URL')
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
    throw new Error('CDP endpoint must use http, https, ws, or wss')
  }
  if (!isLoopbackHostname(url.hostname)) {
    throw new Error('CDP endpoint must use localhost or a loopback IP address')
  }
  if (url.username || url.password || url.hash) {
    throw new Error('CDP endpoint cannot include URL credentials or a fragment')
  }
  return url
}

export async function resolveWebSocketEndpoint(value, options = {}) {
  const endpoint = validateEndpointUrl(value)
  if (endpoint.protocol === 'ws:' || endpoint.protocol === 'wss:') return endpoint.href

  const isVersionPath = /^\/json\/version\/?$/i.test(endpoint.pathname)
  const isRootPath = endpoint.pathname === '/' && endpoint.search === ''
  if (isVersionPath || isRootPath) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch
    if (typeof fetchImpl !== 'function') throw new Error('Local DevTools discovery requires fetch support')
    const versionUrl = isVersionPath ? endpoint.href : new URL('/json/version', endpoint).href
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? SERVICE_DISCOVERY_TIMEOUT_MS)
    try {
      const response = await fetchImpl(versionUrl, { signal: controller.signal })
      if (!response?.ok) throw new Error('Local DevTools version endpoint returned an error')
      const body = await response.json()
      const advertised = validateEndpointUrl(body?.webSocketDebuggerUrl)
      if (advertised.protocol !== 'ws:' && advertised.protocol !== 'wss:') {
        throw new Error('Local DevTools version endpoint did not advertise a WebSocket URL')
      }
      return advertised.href
    } finally {
      clearTimeout(timeout)
    }
  }

  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:'
  return endpoint.href
}

export function parseDevToolsActivePort(content) {
  const lines = String(content ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const port = Number(lines[0])
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null
  const browserPath = typeof lines[1] === 'string' && lines[1].startsWith('/') ? lines[1] : '/devtools/browser'
  return { port, browserPath }
}

export function candidateUserDataDirs(env = process.env, home = homedir()) {
  const push = (list, value) => {
    if (typeof value === 'string' && value.trim()) list.push(value.trim())
  }
  const splitPaths = value => String(value ?? '').split(delimiter).map(entry => entry.trim()).filter(Boolean)
  const candidates = []
  for (const entry of splitPaths(env.PATMAIL_CDP_USER_DATA_DIRS)) push(candidates, entry)
  if (process.platform === 'win32') {
    const localAppData = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    push(candidates, join(localAppData, 'Google', 'Chrome', 'User Data'))
    push(candidates, join(localAppData, 'Microsoft', 'Edge', 'User Data'))
    push(candidates, join(localAppData, 'Chromium', 'User Data'))
    push(candidates, join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data'))
  } else if (process.platform === 'darwin') {
    push(candidates, join(home, 'Library', 'Application Support', 'Google', 'Chrome'))
    push(candidates, join(home, 'Library', 'Application Support', 'Microsoft Edge'))
    push(candidates, join(home, 'Library', 'Application Support', 'Chromium'))
    push(candidates, join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'))
  } else {
    const configHome = env.XDG_CONFIG_HOME ?? join(home, '.config')
    push(candidates, join(configHome, 'google-chrome'))
    push(candidates, join(configHome, 'microsoft-edge'))
    push(candidates, join(configHome, 'chromium'))
    push(candidates, join(configHome, 'BraveSoftware', 'Brave-Browser'))
  }
  return [...new Set(candidates)]
}

async function probeDevToolsEndpoint(httpUrl, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DISCOVERY_PROBE_TIMEOUT_MS)
  try {
    const response = await fetchImpl(httpUrl, { signal: controller.signal })
    if (!response?.ok) return null
    const body = await response.json()
    return typeof body?.webSocketDebuggerUrl === 'string' ? body.webSocketDebuggerUrl : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function discoverDevToolsEndpoint(options = {}) {
  const dirs = options.userDataDirs ?? candidateUserDataDirs(options.env ?? process.env, options.home ?? homedir())
  for (const dir of dirs) {
    let content
    try {
      content = await readFile(join(dir, 'DevToolsActivePort'), 'utf8')
    } catch {
      continue
    }
    const active = parseDevToolsActivePort(content)
    if (!active) continue
    const advertised = await probeDevToolsEndpoint(`http://127.0.0.1:${active.port}/json/version`, options)
    if (advertised) {
      try {
        return validateEndpointUrl(advertised).href
      } catch {
        // A non-loopback advertisement is ignored and discovery continues.
        continue
      }
    }
    const fallback = await resolveReachableWebSocketEndpoint(
      candidateDevToolsWebSocketUrls(active.port, active.browserPath),
      options
    )
    if (fallback) return fallback
  }
  return null
}

export function candidateDevToolsWebSocketUrls(port, browserPath) {
  const candidates = []
  const push = path => {
    if (typeof path !== 'string' || !path.startsWith('/')) return
    let url
    try {
      url = validateEndpointUrl(`ws://127.0.0.1:${port}${path}`)
    } catch {
      return
    }
    if (!candidates.includes(url.href)) candidates.push(url.href)
  }
  push(browserPath)
  push('/devtools/browser')
  return candidates
}

export async function probeWebSocketEndpoint(wsUrl, options = {}) {
  const WebSocketImpl = options.webSocketImpl === undefined ? globalThis.WebSocket : options.webSocketImpl
  if (typeof WebSocketImpl !== 'function') return null
  let socket
  try {
    socket = new WebSocketImpl(wsUrl)
  } catch {
    return false
  }
  try {
    await waitForWebSocketOpen(socket, options.timeoutMs ?? DISCOVERY_WS_PROBE_TIMEOUT_MS)
    return true
  } catch {
    return false
  } finally {
    try {
      socket.close()
    } catch {
      // The probe socket may already be closed.
    }
  }
}

export async function resolveReachableWebSocketEndpoint(candidates, options = {}) {
  const probe = options.wsProbeImpl ?? probeWebSocketEndpoint
  for (const candidate of candidates) {
    const reachable = await probe(candidate, options)
    if (reachable === null) {
      // Without a WebSocket implementation the candidates cannot be probed, so
      // only the explicitly requested fallback keeps the legacy behaviour.
      return options.requireAdvertisedUrl === false ? (candidates[0] ?? null) : null
    }
    if (reachable) return candidate
  }
  return null
}

async function readSavedEndpoint(paths) {
  const config = await readJson(paths.configPath)
  if (typeof config?.endpoint !== 'string') return null
  try {
    return validateEndpointUrl(config.endpoint).href
  } catch {
    return null
  }
}

export async function resolveEndpoint(options = {}) {
  const paths = createObserverPaths(options.root ?? WORKSPACE_ROOT)
  if (options.endpoint) {
    return { endpoint: validateEndpointUrl(options.endpoint).href, source: 'argument' }
  }
  const discovered = await discoverDevToolsEndpoint(options)
  if (discovered) return { endpoint: discovered, source: 'discovery' }
  const saved = await readSavedEndpoint(paths)
  if (saved) return { endpoint: saved, source: 'saved' }
  return { endpoint: null, source: 'none' }
}

export function isAllowedCdpMethod(method) {
  return typeof method === 'string'
    && /^[A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*$/.test(method)
    && !method.startsWith('Browser.')
}

export class EndpointUnavailableError extends Error {
  constructor(message = 'Local CDP endpoint is unavailable') {
    super(message)
    this.name = 'EndpointUnavailableError'
  }
}

export function connectionFailureReason(error) {
  if (error?.name === 'EndpointUnavailableError') return 'endpoint_unavailable'
  return error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'connect_timeout' : 'connect_failed'
}

export function nativeWebSocketFlags(nodeVersion = process.versions.node, webSocketAvailable = typeof globalThis.WebSocket === 'function') {
  const majorVersion = Number(String(nodeVersion).split('.')[0])
  return !webSocketAvailable && majorVersion === 20 ? ['--experimental-websocket'] : []
}

export function waitForWebSocketOpen(socket, timeoutMs = SERVICE_CONNECT_TIMEOUT_MS) {
  return new Promise((resolveOpen, rejectOpen) => {
    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('error', onError)
      socket.removeEventListener('close', onClose)
    }
    const settle = (callback, value) => {
      if (settled) return
      settled = true
      cleanup()
      callback(value)
    }
    const onOpen = () => settle(resolveOpen)
    const onError = () => settle(rejectOpen, new Error('CDP socket error'))
    const onClose = () => settle(rejectOpen, new Error('CDP socket closed before opening'))
    const timer = setTimeout(() => {
      settle(rejectOpen, Object.assign(new Error('CDP connection timed out'), { name: 'TimeoutError' }))
      try {
        socket.close()
      } catch {
        // Closing a socket that already failed is harmless.
      }
    }, timeoutMs)
    socket.addEventListener('open', onOpen, { once: true })
    socket.addEventListener('error', onError, { once: true })
    socket.addEventListener('close', onClose, { once: true })
  })
}

export function closeTrackedSockets(connectingSocket, activeSocket) {
  for (const socket of new Set([connectingSocket, activeSocket])) {
    if (!socket) continue
    try {
      socket.close()
    } catch {
      // The socket may already have closed.
    }
  }
}

export function createCdpSender(transport) {
  if (typeof transport !== 'function') throw new TypeError('CDP transport must be a function')
  return command => {
    if (!command || !isAllowedCdpMethod(command.method)) {
      throw new Error('Blocked unsafe CDP method')
    }
    return transport(command)
  }
}

export function sanitizeDiagnosticText(value, maxLength = 500) {
  if (typeof value !== 'string') return undefined
  const result = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/([?&](?:access_token|refresh_token|token|auth|authorization|cookie|password|secret|credential|key)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/\b(access_token|refresh_token|token|authorization|cookie|password|secret|credential|manifest|data|postData|formData|requestBody|responseBody)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^,;\s}\]]+)/gi, '$1$2[redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, match => {
      const safe = safeNetworkUrl(match)
      return safe.origin ? `${safe.origin}${safe.path}` : '[url]'
    })
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]')
  return result.slice(0, Math.max(0, maxLength))
}

export function safeConsoleMessage(args) {
  const values = []
  for (const argument of (Array.isArray(args) ? args : []).slice(0, 4)) {
    if (typeof argument?.value === 'string') {
      const value = sanitizeDiagnosticText(argument.value, 240)
      if (value) values.push(value)
      continue
    }
    if (argument?.className === 'Error' && typeof argument.description === 'string') {
      const value = sanitizeDiagnosticText(argument.description.split(/\r?\n/, 1)[0], 240)
      if (value) values.push(value)
    }
  }
  return values.join(' ').slice(0, 600)
}

function safeStack(value) {
  if (typeof value !== 'string') return undefined
  const retained = []
  for (const line of value.split(/\r?\n/)) {
    const frame = /^\s*at\s+(?:(.{1,100}?)\s+\()?((?:https?|chrome-extension):\/\/[^\s)]+):(\d+):(\d+)\)?\s*$/.exec(line)
    if (!frame) continue
    const functionName = safeIdentifier(frame[1]?.trim(), 100)
    let file
    try {
      const url = new URL(frame[2])
      file = `${url.origin}${url.pathname}`
    } catch {
      continue
    }
    retained.push(`at ${functionName ? `${functionName} ` : ''}(${file}:${frame[3]}:${frame[4]})`)
    if (retained.length >= 8) break
  }
  return retained.length ? retained.join('\n') : undefined
}

function extensionIdFromUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'chrome-extension:' ? url.hostname : ''
  } catch {
    return ''
  }
}

function isPatMailAppTarget(target, knownExtensionIds = new Set([DEFAULT_PATMAIL_EXTENSION_ID])) {
  if (!target || typeof target.url !== 'string') return false
  try {
    const url = new URL(target.url)
    if (url.protocol !== 'chrome-extension:') return false
    return /patmail/i.test(String(target.title ?? ''))
      || (knownExtensionIds.has(url.hostname) && /(?:^|\/)app\.html$/i.test(url.pathname))
  } catch {
    return false
  }
}

function isEasyTarget(target) {
  if (!target || (target.type && target.type !== 'page') || typeof target.url !== 'string') return false
  try {
    const url = new URL(target.url)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname === '183.36.43.66'
  } catch {
    return false
  }
}

function isJihuaTarget(target) {
  if (!target || target.type !== 'page' || typeof target.url !== 'string') return false
  try {
    const url = new URL(target.url)
    return url.protocol === 'https:'
      && url.hostname === 'oa.jihualab.net'
      && url.port === ''
      && !url.username
      && !url.password
  } catch {
    return false
  }
}

function isHagueTarget(target) {
  if (!target || target.type !== 'page' || typeof target.url !== 'string') return false
  try {
    const url = new URL(target.url)
    return url.protocol === 'https:'
      && url.hostname === 'hague.wipo.int'
      && url.port === ''
      && !url.username
      && !url.password
  } catch {
    return false
  }
}

export function selectTargets(targets, knownExtensionIds = new Set()) {
  const extensionIds = new Set([DEFAULT_PATMAIL_EXTENSION_ID, ...knownExtensionIds])
  for (const target of targets ?? []) {
    if (isPatMailAppTarget(target, extensionIds)) extensionIds.add(extensionIdFromUrl(target.url))
  }

  const selected = []
  for (const target of targets ?? []) {
    if (!target || typeof target.targetId !== 'string') continue
    if (isPatMailAppTarget(target, extensionIds)) {
      selected.push({ targetId: target.targetId, source: 'app' })
      continue
    }
    if (isEasyTarget(target)) {
      selected.push({ targetId: target.targetId, source: 'easy' })
      continue
    }
    if (isJihuaTarget(target)) {
      selected.push({ targetId: target.targetId, source: 'jihua' })
      continue
    }
    if (isHagueTarget(target)) {
      selected.push({ targetId: target.targetId, source: 'hague' })
      continue
    }
    const extensionId = extensionIdFromUrl(target.url)
    if (extensionId && extensionIds.has(extensionId) && ['page', 'service_worker', 'background_page'].includes(target.type)) {
      selected.push({ targetId: target.targetId, source: 'app' })
    }
  }
  return selected
}

export function targetSessionMetadata(target, sessionId) {
  return { type: 'unknown', url: '', title: '', ...target, sessionId }
}

function safeIdentifier(value, maxLength = 100) {
  if (typeof value !== 'string') return undefined
  const result = value.trim().slice(0, maxLength)
  if (!/^[\w.:/-]+$/.test(result) || /token|manifest|credential|cookie|password|secret|authorization|data/i.test(result)) return undefined
  return result
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function decodeFormValue(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}

function callFromForm(value) {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const bounded = value.slice(0, 64 * 1024)
  let offset = 0
  let examined = 0
  while (offset <= bounded.length && examined < 512) {
    const end = bounded.indexOf('&', offset)
    const pair = bounded.slice(offset, end < 0 ? bounded.length : end)
    const equals = pair.indexOf('=')
    const key = decodeFormValue(equals < 0 ? pair : pair.slice(0, equals))
    if (key.toLowerCase() === 'call') {
      return safeIdentifier(decodeFormValue(equals < 0 ? '' : pair.slice(equals + 1)), 120)
    }
    if (end < 0) break
    offset = end + 1
    examined += 1
  }
  return undefined
}

function safeJihuaPath(pathname) {
  if (pathname === '/prod-api/getInfo') return pathname
  if (pathname === '/prod-api/conow/pat/parameter/patent/update') return pathname
  if (/^\/prod-api\/conow\/pat\/parameter\/(?:INVENTION|UTILITY)$/.test(pathname)) {
    return '/prod-api/conow/pat/parameter/:type'
  }
  if (/^\/prod-api\/conow\/pat\/parameter\/(?:INVENTION|UTILITY)\/[A-Za-z0-9_-]{1,128}$/.test(pathname)) {
    return '/prod-api/conow/pat/parameter/:type/:id'
  }
  if (pathname === '/prod-api/conow/file/upload' || pathname === '/prod-api/conow/file/uploadAndOfc') return pathname
  return '/other'
}

export function safeNetworkUrl(value, postData = '', source = '') {
  let url
  try {
    url = new URL(String(value))
  } catch {
    return { origin: '', path: '/' }
  }
  if (url.protocol === 'chrome-extension:' && url.pathname.startsWith('/_patmail_native_download/')) {
    return { origin: `${url.protocol}//${url.host}`, path: '/_patmail_native_download/' }
  }
  if (url.hostname === 'oa.jihualab.net' || source === 'jihua') {
    if (url.protocol !== 'https:' || url.hostname !== 'oa.jihualab.net' || url.port !== '' || url.username || url.password) {
      return { origin: '', path: '/' }
    }
    return { origin: 'https://oa.jihualab.net', path: safeJihuaPath(url.pathname) }
  }
  if (url.hostname === 'hague.wipo.int' || source === 'hague') {
    const isWipoHost = url.hostname === 'hague.wipo.int'
    if (url.protocol !== 'https:' || !isWipoHost || url.port !== '' || url.username || url.password) {
      return { origin: '', path: '/' }
    }
    return safeHagueUrl(url.href) ?? { origin: '', path: '/' }
  }
  let call
  for (const [key, value] of url.searchParams) {
    if (key.toLowerCase() === 'call') {
      call = safeIdentifier(value, 120)
      break
    }
  }
  if (!call) call = callFromForm(postData)
  return {
    origin: url.origin === 'null' ? `${url.protocol}//${url.host}` : url.origin,
    path: url.pathname.slice(0, 2048),
    ...(call ? { call } : {}),
  }
}

function safeMimeType(value) {
  if (typeof value !== 'string') return undefined
  const mime = value.split(';', 1)[0].trim().toLowerCase()
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime) ? mime : undefined
}

export function safeNetworkResponseEvent(request, params) {
  const response = params?.response ?? {}
  const event = {
    source: request.source,
    ...(request.requestId ? { requestId: request.requestId } : {}),
    origin: request.origin,
    path: request.path,
    ...(request.call ? { call: request.call } : {}),
  }
  if (finiteNumber(params?.timestamp) && request.started) event.elapsedMs = Math.max(0, Math.round((params.timestamp - request.started) * 1000))
  if (Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) event.status = response.status
  const timing = response.timing ?? {}
  for (const [key, start, end] of [
    ['connectMs', timing.connectStart, timing.connectEnd],
    ['sendMs', timing.sendStart, timing.sendEnd],
    ['responseWaitMs', timing.sendEnd, timing.receiveHeadersStart],
  ]) {
    if (finiteNumber(start) && finiteNumber(end) && start >= 0 && end >= start && end - start <= 86_400_000) {
      event[key] = Math.round(end - start)
    }
  }
  const mime = safeMimeType(response.mimeType)
  if (mime) event.mime = mime
  return event
}

export function classifyJihuaErrorCategory(value) {
  if (typeof value !== 'string' || value.length === 0) return null
  if (/http\s*524|status\s*524|(?:^|\D)524(?:\D|$)/i.test(value)) return 'http_524'
  if (/http\s*5\d{2}|status\s*5\d{2}/i.test(value)) return 'http_5xx'
  if (/文件类型|文件格式|文件名应包含|扩展名|mime|file.?type|文件名.{0,10}(?:类型|后缀).{0,10}(?:不符|不匹配|错误)/i.test(value)) return 'file_type'
  if (/未匹配|没匹配到|无法匹配|材料.{0,12}(?:不存在|未配置|不支持)|(?:not match|unmatched material)/i.test(value)) return 'material_unmatched'
  if (/来源.{0,16}(?:无效|失效|不合法|不存在)|(?:无效|失效|不合法).{0,16}(?:来源|路径|目录)|未找到(?:任务)?来源|来源文件夹.{0,8}(?:不可用|失效)|source.{0,12}(?:invalid|not found)/i.test(value)) return 'source_invalid'
  if (/登录|令牌|\bauth(?:orization)?\b|\btoken\b/i.test(value)) return 'login'
  if (/会话|binding|\bsession\b/i.test(value)) return 'session'
  if (/超过时限|超时|\btimeout\b/i.test(value)) return 'timeout'
  if (/无法连接|连接失败|通信失败|网络|\bnetwork\b|\bfetch\b/i.test(value)) return 'network'
  if (/回执|\breceipt\b|\backnowledg/i.test(value)) return 'receipt'
  if (/文件|分块|\bfile\b|\bchunk\b/i.test(value)) return 'file'
  if (/indexeddb|持久化|存储|保存失败|\bstorage\b/i.test(value)) return 'storage'
  if (/无效|缺少|不在允许范围|格式|\binvalid\b|\bvalidation\b/i.test(value)) return 'validation'
  if (/\boa\b|上传|请求|服务器|\bhttp\b|\bremote\b/i.test(value)) return 'remote'
  return 'other'
}

export function summarizeJihuaTask(taskValue, classifyError) {
  if (!taskValue || typeof taskValue !== 'object' || Array.isArray(taskValue)) return null
  const taskStatuses = ['ready', 'running', 'pausing', 'paused', 'completed', 'failed', 'cancelled']
  const rowStatuses = ['pending', 'checking', 'uploading', 'associating', 'verifying', 'success', 'failed', 'already', 'unmatched', 'excluded']
  const errorCategories = ['http_524', 'http_5xx', 'file_type', 'material_unmatched', 'source_invalid', 'login', 'session', 'timeout', 'network', 'receipt', 'file', 'storage', 'validation', 'remote', 'other']
  // Keep this classifier local: this function is serialized into the browser page.
  const reasonCategories = [
    'material_unmapped', 'material_unsupported', 'case_not_found', 'case_ambiguous', 'application_format', 'application_type',
    'stage_disabled', 'category_limit', 'http524', 'other5xx', 'file_html', 'doc_pdf', 'doc_zip', 'pdf_invalid', 'docx_invalid',
    'doc_invalid', 'empty', 'large', 'permission', 'missing', 'receipt_unavailable', 'receipt_pending', 'association_unconfirmed',
    'no_attachment_id', 'session', 'network', 'storage', 'timeout', 'other',
  ]
  const classifyReason = value => {
    if (typeof value !== 'string' || !value.trim()) return null
    const text = value.trim()
    if (/(?:http|status(?:\s*code)?|状态码)\s*[:：]?\s*524\b/i.test(text)) return 'http524'
    if (/(?:http|status(?:\s*code)?|状态码)\s*[:：]?\s*5\d{2}\b/i.test(text)) return 'other5xx'
    if (/(?:http|status(?:\s*code)?|状态码)\s*[:：]?\s*413\b/i.test(text)) return 'large'
    if (/(?:不支持|不适用|unsupported|not supported).{0,16}(?:材料|material)|(?:材料|material).{0,24}(?:不支持|不适用|unsupported|not supported)|(?:台账|案件).{0,12}支持的材料/i.test(text)) return 'material_unsupported'
    if (/材料类型.{0,12}(?:未登记|未配置|无法匹配|未匹配)|(?:没|未)匹配到材料类型|(?:material|category).{0,20}(?:unmapped|not registered|unmatched)/i.test(text)) return 'material_unmapped'
    if (/没有匹配到该申请号的台账|(?:案件|台账).{0,16}(?:不存在|未找到)|case.{0,20}not found/i.test(text)) return 'case_not_found'
    if (/多条相同申请号的台账|(?:多条|重复|不唯一).{0,12}(?:案件|台账|case)|case.{0,20}ambiguous|duplicate.{0,20}case/i.test(text)) return 'case_ambiguous'
    if (/旧式申请号|仅支持\d+位中国专利申请号|文件名.{0,12}(?:应包含|缺少|格式无效)|申请号.{0,12}(?:格式无效|格式未匹配|仅支持\d+位|旧式)|(?:application\s*(?:no|number)|申请号).{0,24}(?:format|invalid)/i.test(text)) return 'application_format'
    if (/申请号.{0,12}(?:类型未匹配|类型不支持)|(?:application\s*(?:no|number)|申请号).{0,24}(?:type|kind).{0,16}(?:unmatched|unsupported|invalid)/i.test(text)) return 'application_type'
    if (/未启用该材料所属阶段|材料所属阶段.{0,12}未启用|stage.{0,16}disabled/i.test(text)) return 'stage_disabled'
    if (/平台该类上限|(?:材料|附件).{0,16}(?:数量|份数).{0,12}超过.{0,12}上限|category.{0,16}limit/i.test(text)) return 'category_limit'
    if (/文件实际是网页|(?:file|document).{0,16}(?:is|actual(?:ly)?).{0,8}(?:html|webpage)|<!doctype\s+html|<html\b/i.test(text)) return 'file_html'
    if (/扩展名是\s*DOC.{0,20}实际是\s*PDF|DOC.{0,16}actual(?:ly)?\s+PDF|DOC extension.{0,16}PDF/i.test(text)) return 'doc_pdf'
    if (/扩展名是\s*DOC.{0,20}(?:ZIP|压缩包)|DOC.{0,16}(?:ZIP container|archive)|ZIP 容器/i.test(text)) return 'doc_zip'
    if (/PDF.{0,24}(?:扩展名不符|内容不符|无效)|(?:invalid|mismatch).{0,16}PDF|PDF.{0,16}(?:invalid|mismatch)/i.test(text)) return 'pdf_invalid'
    if (/DOCX.{0,24}(?:扩展名不符|内容不符|无效)|(?:invalid|mismatch).{0,16}DOCX|DOCX.{0,16}(?:invalid|mismatch)/i.test(text)) return 'docx_invalid'
    if (/(?:不是可确认的 Word 文档|Word 文档.{0,12}(?:无效|不符)|invalid.{0,16}(?:Word|DOC) document)/i.test(text)) return 'doc_invalid'
    if (/文件为空|empty file|zero[- ]byte/i.test(text)) return 'empty'
    if (/(?:文件|附件).{0,12}(?:过大|超过.{0,12}(?:大小|限制))|(?:file|attachment).{0,16}(?:too large|exceeds?.{0,12}(?:size|limit))/i.test(text)) return 'large'
    if (/权限.{0,12}(?:未授权|不足|拒绝)|未授权.{0,12}(?:读取|目录)|permission.{0,16}(?:denied|not granted)|not authorized.{0,12}(?:read|directory)/i.test(text)) return 'permission'
    if (/本地文件句柄丢失|本地文件.{0,12}(?:丢失|不存在)|文件.{0,12}(?:已不存在|找不到)|(?:local )?file handle.{0,12}(?:lost|missing)|missing local file/i.test(text)) return 'missing'
    if (/原页面回执不可用|回执.{0,12}(?:不可用|丢失)|receipt.{0,16}(?:unavailable|lost)/i.test(text)) return 'receipt_unavailable'
    if (/回执.{0,16}(?:尚未确认|未确认|超过时限|等待)|receipt.{0,20}(?:pending|not confirmed|timeout|waiting)/i.test(text)) return 'receipt_pending'
    if (/回读未确认附件关联|未确认附件关联|附件关联.{0,12}(?:未确认|未完成)|association.{0,20}unconfirmed/i.test(text)) return 'association_unconfirmed'
    if (/附件.{0,12}(?:缺少|没有|无).{0,8}ID|(?:缺少|没有|无).{0,8}附件\s*ID|(?:no|missing).{0,12}attachment\s*ID/i.test(text)) return 'no_attachment_id'
    if (/登录|会话|\bsession\b|unauthori[sz]ed|\b401\b|\b403\b|标签页.{0,8}(?:失效|关闭)|页面.{0,8}(?:变化|关闭)/i.test(text)) return 'session'
    if (/无法连接|连接失败|通信失败|网络|\bnetwork\b|\bfetch\b|NetworkError/i.test(text)) return 'network'
    if (/indexeddb|持久化|存储|保存失败|\bstorage\b/i.test(text)) return 'storage'
    if (/超过时限|超时|\btimeout\b|\btimed out\b/i.test(text)) return 'timeout'
    return 'other'
  }
  const rows = Array.isArray(taskValue.rows) ? taskValue.rows : []
  const maxRows = 50_000
  const rowsExamined = Math.min(rows.length, maxRows)
  const rowStatusCounts = Object.fromEntries(rowStatuses.map(status => [status, 0]))
  const rowErrorCounts = Object.fromEntries(errorCategories.map(category => [category, 0]))
  const taskErrorCounts = Object.fromEntries(errorCategories.map(category => [category, 0]))
  const failedReasonCounts = Object.fromEntries(reasonCategories.map(category => [category, 0]))
  const unmatchedReasonCounts = Object.fromEntries(reasonCategories.map(category => [category, 0]))
  const taskReasonCounts = Object.fromEntries(reasonCategories.map(category => [category, 0]))
  let selectedCount = 0
  let sentCount = 0
  let pendingReceiptCount = 0
  let lastTaskReason = null
  const pauseReasonCode = classifyReason(taskValue.pauseReason)
  const recoveryValue = taskValue.recovery && typeof taskValue.recovery === 'object' && !Array.isArray(taskValue.recovery)
    ? taskValue.recovery
    : null
  const recovery = recoveryValue ? {
    attempt: Number.isSafeInteger(recoveryValue.attempt) && recoveryValue.attempt >= 0 ? Math.min(recoveryValue.attempt, 2_147_483_647) : 0,
    maxAttempts: Number.isSafeInteger(recoveryValue.maxAttempts) && recoveryValue.maxAttempts >= 0 ? Math.min(recoveryValue.maxAttempts, 2_147_483_647) : 0,
    retryAt: typeof recoveryValue.retryAt === 'number' && Number.isFinite(recoveryValue.retryAt) && recoveryValue.retryAt > 0
      ? Math.min(Math.max(1, Math.floor(recoveryValue.retryAt)), Number.MAX_SAFE_INTEGER)
      : 0,
    reasonCode: classifyReason(recoveryValue.reason),
  } : null
  const countError = (counts, value) => {
    if (typeof classifyError !== 'function' || typeof value !== 'string' || !value.trim()) return
    const category = classifyError(value)
    if (Object.hasOwn(counts, category)) counts[category] += 1
  }
  for (let index = 0; index < rowsExamined; index += 1) {
    const row = rows[index]
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    if (rowStatuses.includes(row.status)) rowStatusCounts[row.status] += 1
    if (row.selected === true) selectedCount += 1
    if (row.intent?.sent === true) sentCount += 1
    if (row.intent?.sent === true && !row.receipt) pendingReceiptCount += 1
    if (row.status === 'unmatched') {
      rowErrorCounts.material_unmatched += 1
      const reason = classifyReason(row.error)
      if (Object.hasOwn(unmatchedReasonCounts, reason)) unmatchedReasonCounts[reason] += 1
    } else {
      countError(rowErrorCounts, row.error)
      if (row.status === 'failed') {
        const reason = classifyReason(row.error)
        if (Object.hasOwn(failedReasonCounts, reason)) failedReasonCounts[reason] += 1
      }
    }
  }
  if (Array.isArray(taskValue.errors)) {
    for (const error of taskValue.errors.slice(0, 500)) {
      countError(taskErrorCounts, error)
      const reason = classifyReason(error)
      if (Object.hasOwn(taskReasonCounts, reason)) {
        taskReasonCounts[reason] += 1
        lastTaskReason = reason
      }
    }
  }
  return {
    status: taskStatuses.includes(taskValue.status) ? taskValue.status : 'unknown',
    rowCount: Math.min(rows.length, 2_147_483_647),
    rowsExamined,
    truncated: rows.length > maxRows,
    selectedCount,
    sentCount,
    pendingReceiptCount,
    rowStatusCounts,
    rowErrorCategories: rowErrorCounts,
    taskErrorCategories: taskErrorCounts,
    failedReasons: failedReasonCounts,
    unmatchedReasons: unmatchedReasonCounts,
    taskReasons: taskReasonCounts,
    lastTaskReason,
    pauseReasonCode,
    recovery,
  }
}

export function safeJihuaTaskSummary(value) {
  if (!objectValue(value)) return null
  const taskStatuses = ['ready', 'running', 'pausing', 'paused', 'completed', 'failed', 'cancelled', 'unknown']
  const rowStatuses = ['pending', 'checking', 'uploading', 'associating', 'verifying', 'success', 'failed', 'already', 'unmatched', 'excluded']
  const errorCategories = ['http_524', 'http_5xx', 'file_type', 'material_unmatched', 'source_invalid', 'login', 'session', 'timeout', 'network', 'receipt', 'file', 'storage', 'validation', 'remote', 'other']
  const reasonCategories = [
    'material_unmapped', 'material_unsupported', 'case_not_found', 'case_ambiguous', 'application_format', 'application_type',
    'stage_disabled', 'category_limit', 'http524', 'other5xx', 'file_html', 'doc_pdf', 'doc_zip', 'pdf_invalid', 'docx_invalid',
    'doc_invalid', 'empty', 'large', 'permission', 'missing', 'receipt_unavailable', 'receipt_pending', 'association_unconfirmed',
    'no_attachment_id', 'session', 'network', 'storage', 'timeout', 'other',
  ]
  const count = candidate => Number.isSafeInteger(candidate) && candidate >= 0 ? Math.min(candidate, 2_147_483_647) : 0
  const retryTimestamp = candidate => typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
    ? Math.min(Math.max(1, Math.floor(candidate)), Number.MAX_SAFE_INTEGER)
    : 0
  const safeCounts = (source, keys) => {
    const counts = objectValue(source) ?? {}
    return Object.fromEntries(keys.map(key => [key, count(counts[key])]))
  }
  const safeRecovery = source => {
    const recovery = objectValue(source)
    if (!recovery) return null
    return {
      attempt: count(recovery.attempt),
      maxAttempts: count(recovery.maxAttempts),
      retryAt: retryTimestamp(recovery.retryAt),
      reasonCode: reasonCategories.includes(recovery.reasonCode) ? recovery.reasonCode : null,
    }
  }
  return {
    status: taskStatuses.includes(value.status) ? value.status : 'unknown',
    rowCount: count(value.rowCount),
    rowsExamined: count(value.rowsExamined),
    truncated: value.truncated === true,
    selectedCount: count(value.selectedCount),
    sentCount: count(value.sentCount),
    pendingReceiptCount: count(value.pendingReceiptCount),
    rowStatusCounts: safeCounts(value.rowStatusCounts, rowStatuses),
    rowErrorCategories: safeCounts(value.rowErrorCategories, errorCategories),
    taskErrorCategories: safeCounts(value.taskErrorCategories, errorCategories),
    failedReasons: safeCounts(value.failedReasons, reasonCategories),
    unmatchedReasons: safeCounts(value.unmatchedReasons, reasonCategories),
    taskReasons: safeCounts(value.taskReasons, reasonCategories),
    lastTaskReason: reasonCategories.includes(value.lastTaskReason) ? value.lastTaskReason : null,
    pauseReasonCode: reasonCategories.includes(value.pauseReasonCode) ? value.pauseReasonCode : null,
    recovery: safeRecovery(value.recovery),
  }
}

export function safeRuntimeMetadata(message) {
  const root = objectValue(message)
  if (!root) return null
  if (root.channel === 'PATMAIL_JIHUA') return null
  const packetMessage = objectValue(root.message)
  const packetBody = objectValue(root.body)
  const rootPayload = objectValue(root.payload)
  const nestedPayload = objectValue(packetMessage?.payload) ?? objectValue(packetBody?.payload)
  const info = objectValue(nestedPayload?.info) ?? objectValue(rootPayload?.info)
  const progressObject = objectValue(root.progress) ?? objectValue(nestedPayload?.progress) ?? objectValue(rootPayload?.progress)
  const candidates = [root, packetMessage, packetBody, rootPayload, nestedPayload, info, progressObject].filter(Boolean)

  const firstString = keys => {
    for (const candidate of candidates) {
      for (const key of keys) {
        const value = safeIdentifier(candidate[key])
        if (value) return value
      }
    }
    return undefined
  }
  const firstNumber = keys => {
    for (const candidate of candidates) {
      for (const key of keys) {
        if (finiteNumber(candidate[key]) && candidate[key] >= 0) return candidate[key]
      }
    }
    return undefined
  }
  const channel = safeIdentifier(root.channel)
  const type = firstString(['type'])
  const action = firstString(['action'])
  const command = firstString(['command'])
  const call = firstString(['Call', 'call'])
  const firstId = key => {
    for (const candidate of candidates) {
      const value = candidate[key]
      if (typeof value === 'string') {
        const safe = safeIdentifier(value)
        if (safe) return safe
      }
      if (Number.isInteger(value) && value >= 0) return value
    }
    return undefined
  }
  const id = firstId('id')
  const requestId = firstId('requestId')
  const taskId = firstString(['taskId'])
  const progressId = firstString(['progressId'])
  const phase = firstString(['phase'])
  const status = firstString(['status', 'state'])
  const progressNumber = firstNumber(['progress', 'percent', 'value'])
  const done = firstNumber(['done'])
  const completed = firstNumber(['completed', 'completedBytes', 'done', 'current'])
  const total = firstNumber(['total', 'totalBytes', 'count'])
  const sequence = firstNumber(['sequence'])
  const receivedBytes = firstNumber(['receivedBytes'])
  const failed = firstNumber(['failed', 'failedCount'])
  const deduplicated = firstNumber(['deduplicated', 'deduplicatedCount'])
  const okValue = candidates.find(candidate => typeof candidate.ok === 'boolean')?.ok
  const errorObject = candidates.map(candidate => objectValue(candidate.error)).find(Boolean)
  const errorValue = candidates.map(candidate => candidate.error).find(value => typeof value === 'string' && value.length > 0)
  const hasError = Boolean(errorObject)
    || Boolean(errorValue)
    || candidates.some(candidate => candidate.error === true)
    || okValue === false
    || /error|failed/i.test(`${channel ?? ''} ${type ?? ''} ${action ?? ''} ${status ?? ''}`)

  const relevant = Boolean(channel?.startsWith('patmail-'))
    || /progress|error|failed/i.test(`${type ?? ''} ${action ?? ''} ${command ?? ''} ${phase ?? ''}`)
    || progressNumber !== undefined
    || progressObject !== null
    || hasError
  if (!relevant) return null

  const result = {}
  if (channel) result.channel = channel
  if (type) result.type = type
  if (action) result.action = action
  if (command) result.command = command
  if (call) result.call = call
  if (id) result.id = id
  if (requestId) result.requestId = requestId
  if (taskId) result.taskId = taskId
  if (progressId) result.progressId = progressId
  if (phase) result.phase = phase
  if (status) result.status = status
  if (progressObject) {
    const safeProgress = {}
    if (done !== undefined) safeProgress.done = done
    if (total !== undefined) safeProgress.total = total
    if (phase) safeProgress.phase = phase
    if (receivedBytes !== undefined) safeProgress.receivedBytes = receivedBytes
    if (failed !== undefined) safeProgress.failed = failed
    if (deduplicated !== undefined) safeProgress.deduplicated = deduplicated
    result.progress = safeProgress
  } else if (progressNumber !== undefined) {
    result.progress = progressNumber
  }
  if (completed !== undefined) result.completed = completed
  if (total !== undefined) result.total = total
  if (receivedBytes !== undefined) result.receivedBytes = receivedBytes
  if (failed !== undefined) result.failed = failed
  if (deduplicated !== undefined) result.deduplicated = deduplicated
  if (sequence !== undefined) result.sequence = sequence
  const itemCount = candidates.find(candidate => Array.isArray(candidate.items))?.items?.length
  if (Number.isInteger(itemCount) && itemCount >= 0) result.itemsCount = itemCount
  if (typeof okValue === 'boolean') result.ok = okValue
  if (hasError) {
    result.error = true
    const errorMetadata = candidates.find(candidate => typeof candidate.errorMessage === 'string' || typeof candidate.errorStack === 'string')
    const errorName = safeIdentifier(errorObject?.name ?? errorMetadata?.errorName, 80)
    const errorCode = safeIdentifier(errorObject?.code ?? errorMetadata?.errorCode, 80)
    const errorMessage = sanitizeDiagnosticText(errorObject?.message ?? errorValue ?? errorMetadata?.errorMessage)
    const errorStack = safeStack(errorObject?.stack ?? errorMetadata?.errorStack)
    if (errorName) result.errorName = errorName
    if (errorCode) result.errorCode = errorCode
    if (errorMessage) result.errorMessage = errorMessage
    if (errorStack) result.errorStack = errorStack
  }
  return result
}

export function safeDownloadSnapshot(items, startedAt, extensionId) {
  const sessionStart = Number(startedAt)
  return (items ?? []).filter(item => {
    const extensionPrefix = typeof extensionId === 'string' && extensionId ? `chrome-extension://${extensionId}/` : ''
    const ownedByPatMail = Boolean(extensionId) && (
      item?.byExtensionId === extensionId
      || (typeof item?.url === 'string' && (item.url.startsWith(extensionPrefix) || item.url.startsWith(`blob:${extensionPrefix}`)))
    )
    const started = Date.parse(item?.startTime ?? '')
    return ownedByPatMail && ((Number.isFinite(started) && started >= sessionStart) || item?.state === 'in_progress')
  }).map(item => {
    const snapshot = {
      filename: typeof item.filename === 'string' ? item.filename.slice(0, 2048) : '',
      state: safeIdentifier(item.state, 40) ?? 'unknown',
      exists: typeof item.exists === 'boolean' ? item.exists : null,
      mime: safeIdentifier(item.mime, 160) ?? '',
    }
    if (Number.isInteger(item.id) && item.id >= 0) snapshot.id = item.id
    if (typeof item.startTime === 'string' && Number.isFinite(Date.parse(item.startTime))) snapshot.startTime = new Date(item.startTime).toISOString()
    if (typeof item.endTime === 'string' && Number.isFinite(Date.parse(item.endTime))) snapshot.endTime = new Date(item.endTime).toISOString()
    if (finiteNumber(item.bytesReceived)) snapshot.receivedBytes = item.bytesReceived
    if (finiteNumber(item.totalBytes)) snapshot.totalBytes = item.totalBytes
    if (typeof item.paused === 'boolean') snapshot.paused = item.paused
    const error = safeIdentifier(item.error, 80)
    if (error) snapshot.error = error
    return snapshot
  })
}

export function filterRecentJsonl(content, cutoffMs) {
  const retained = []
  for (const line of String(content).split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line)
      const timestamp = Date.parse(record?.ts)
      if (Number.isFinite(timestamp) && timestamp >= cutoffMs) retained.push(line)
    } catch {
      // Ignore incomplete or malformed tail records while trimming the boundary file.
    }
  }
  return retained.length ? `${retained.join('\n')}\n` : ''
}

export function hourlyLogName(time) {
  const date = time instanceof Date ? time : new Date(time)
  const pad = value => String(value).padStart(2, '0')
  return `observer-${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}-${pad(date.getUTCHours())}.jsonl`
}

export function createObserverPaths(root = WORKSPACE_ROOT) {
  const dataDir = join(root, 'log', 'cdp')
  return {
    root,
    dataDir,
    configPath: join(dataDir, 'config.json'),
    lockPath: join(dataDir, 'service.lock.json'),
    statusPath: join(dataDir, 'status.json'),
  }
}

export function buildAppObserverInstallExpression() {
  const install = function installPatMailObserver() {
    const report = globalThis.__patmailCdpObserver
    const runtime = globalThis.chrome?.runtime
    const onMessage = runtime?.onMessage
    if (typeof report !== 'function' || typeof onMessage?.addListener !== 'function') return false
    if (globalThis.__patmailCdpObserverInstalled) return true
    globalThis.__patmailCdpObserverInstalled = true
    globalThis.addEventListener?.('patmail:hague-diagnostic', event => {
      try { report(JSON.stringify({ kind: 'hague-trace', event: event.detail })) } catch { /* Diagnostic observers never interrupt the app. */ }
    })


    const pick = (values, keys) => {
      for (const value of values) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue
        for (const key of keys) {
          const candidate = value[key]
          if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 100)
          if (Number.isInteger(candidate) && candidate >= 0) return candidate
        }
      }
      return undefined
    }
    const number = (values, keys) => {
      for (const value of values) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue
        for (const key of keys) {
          if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0) return value[key]
        }
      }
      return undefined
    }

    onMessage.addListener((packet, sender) => {
      if (!packet || typeof packet !== 'object') return
      if (packet.channel === 'PATMAIL_JIHUA') return
      const message = packet.message && typeof packet.message === 'object' ? packet.message : null
      const body = packet.body && typeof packet.body === 'object' ? packet.body : null
      const payload = packet.payload && typeof packet.payload === 'object'
        ? packet.payload
        : message?.payload && typeof message.payload === 'object'
          ? message.payload
          : body?.payload && typeof body.payload === 'object'
            ? body.payload
            : null
    const progressInfo = packet.progress && typeof packet.progress === 'object'
      ? packet.progress
      : payload?.progress && typeof payload.progress === 'object'
        ? payload.progress
        : null
      const values = [packet, message, body, payload, payload?.info, progressInfo].filter(Boolean)
      const channel = pick([packet], ['channel'])
      const type = pick(values, ['type'])
      const action = pick(values, ['action'])
      const command = pick(values, ['command'])
      const call = pick(values, ['Call', 'call'])
      const id = pick(values, ['id'])
      const requestId = pick(values, ['requestId'])
      const taskId = pick(values, ['taskId'])
      const progressId = pick(values, ['progressId'])
      const phase = pick(values, ['phase'])
      const status = pick(values, ['status', 'state'])
      const progressNumber = number(values, ['progress', 'percent', 'value'])
      const done = number(values, ['done'])
      const completed = number(values, ['completed', 'completedBytes', 'done', 'current'])
      const total = number(values, ['total', 'totalBytes', 'count'])
      const receivedBytes = number(values, ['receivedBytes'])
      const failed = number(values, ['failed', 'failedCount'])
      const deduplicated = number(values, ['deduplicated', 'deduplicatedCount'])
      const ok = values.find(value => typeof value.ok === 'boolean')?.ok
      const errorValue = values.find(value => typeof value.error === 'string' && value.error.length > 0)?.error
      const errorObject = values.find(value => value.error && typeof value.error === 'object')?.error
      const error = Boolean(errorValue || errorObject) || ok === false
      const relevant = (typeof channel === 'string' && channel.startsWith('patmail-'))
        || /progress|error|failed/i.test(`${type ?? ''} ${action ?? ''} ${command ?? ''} ${phase ?? ''} ${status ?? ''}`)
        || progressNumber !== undefined
        || progressInfo !== null
        || error
      if (!relevant) return
      if (sender?.id !== runtime.id) return
      const metadata = { kind: 'runtime-message' }
      if (channel) metadata.channel = channel
      if (type) metadata.type = type
      if (action) metadata.action = action
      if (command) metadata.command = command
      if (call) metadata.call = call
      if (id) metadata.id = id
      if (requestId) metadata.requestId = requestId
      if (taskId) metadata.taskId = taskId
      if (progressId) metadata.progressId = progressId
      if (phase) metadata.phase = phase
      if (status) metadata.status = status
      if (progressInfo) {
        const safeProgress = {}
        if (done !== undefined) safeProgress.done = done
        if (total !== undefined) safeProgress.total = total
        if (phase) safeProgress.phase = phase
        if (receivedBytes !== undefined) safeProgress.receivedBytes = receivedBytes
        if (failed !== undefined) safeProgress.failed = failed
        if (deduplicated !== undefined) safeProgress.deduplicated = deduplicated
        metadata.progress = safeProgress
      } else if (progressNumber !== undefined) metadata.progress = progressNumber
      if (completed !== undefined) metadata.completed = completed
      if (total !== undefined) metadata.total = total
      if (receivedBytes !== undefined) metadata.receivedBytes = receivedBytes
      if (failed !== undefined) metadata.failed = failed
      if (deduplicated !== undefined) metadata.deduplicated = deduplicated
      if (Array.isArray(payload?.items)) metadata.itemsCount = payload.items.length
      if (typeof ok === 'boolean') metadata.ok = ok
      if (error) {
        metadata.error = true
        if (typeof errorObject?.name === 'string') metadata.errorName = errorObject.name.slice(0, 80)
        if (typeof errorObject?.code === 'string') metadata.errorCode = errorObject.code.slice(0, 80)
        if (typeof (errorObject?.message ?? errorValue) === 'string') metadata.errorMessage = (errorObject?.message ?? errorValue).slice(0, 1000)
        if (typeof errorObject?.stack === 'string') metadata.errorStack = errorObject.stack.slice(0, 4000)
      }
      report(JSON.stringify(metadata))
    })
    return true
  }
  return `(${install.toString()})()`
}

export function buildAppSnapshotExpression(startedAt, includeJihuaTask = false) {
  const poll = function pollPatMailSnapshot(startTime, shouldPollJihuaTask, summarizeTask, classifyError) {
    const report = globalThis.__patmailCdpObserver
    if (typeof report !== 'function') return
    const pollJihuaTask = () => {
      if (!shouldPollJihuaTask) return
      const factory = globalThis.indexedDB
      if (typeof factory?.databases !== 'function' || typeof globalThis.setTimeout !== 'function' || typeof globalThis.clearTimeout !== 'function') return
      let active = true
      let database = null
      const finish = () => {
        if (!active) return
        active = false
        globalThis.clearTimeout(timeout)
        database?.close?.()
      }
      const timeout = globalThis.setTimeout(finish, 1_500)
      try {
        factory.databases().then(databases => {
          if (!active) return
          if (!Array.isArray(databases) || !databases.some(databaseInfo => databaseInfo?.name === 'patmail-jihua-inventory')) {
            finish()
            return
          }
          let request
          try {
            request = factory.open('patmail-jihua-inventory')
          } catch {
            finish()
            return
          }
          request.onupgradeneeded = () => {
            try { request.transaction?.abort() } catch { /* Abort a raced database creation rather than initialize it. */ }
            try { request.result?.close() } catch { /* The raced database may already be closed. */ }
            finish()
          }
          request.onerror = finish
          request.onblocked = finish
          request.onsuccess = () => {
            if (!active) {
              request.result?.close?.()
              return
            }
            database = request.result
            if (!database || !database.objectStoreNames?.contains('tasks')) {
              finish()
              return
            }
            let transaction
            try {
              transaction = database.transaction('tasks', 'readonly')
            } catch {
              finish()
              return
            }
            const taskRequest = transaction.objectStore('tasks').get('latest')
            taskRequest.onsuccess = () => {
              if (!active) return
              const summary = summarizeTask(taskRequest.result, classifyError)
              if (summary) report(JSON.stringify({ kind: 'jihua-task', summary }))
            }
            transaction.oncomplete = finish
            transaction.onerror = finish
            transaction.onabort = finish
          }
        }).catch(finish)
      } catch {
        // The local task snapshot is optional; a denied or unavailable IndexedDB read is ignored.
        finish()
      }
    }
    pollJihuaTask()
    const progress = []
    let topProgress = null
    let exportNotice = ''
    const draftTexts = []
    const hagueActive = !!globalThis.document?.querySelector?.('.hague-page')
    try {
      const topBar = globalThis.document.querySelector('.check-rainbow[role="progressbar"]')
      if (topBar) {
        const value = Number(topBar.getAttribute('aria-valuenow'))
        const max = Number(topBar.getAttribute('aria-valuemax'))
        topProgress = {
          ...(Number.isFinite(value) ? { value } : {}),
          ...(Number.isFinite(max) && max > 0 ? { max } : {}),
          ...(Number.isFinite(value) && Number.isFinite(max) && max > 0 ? { percent: Math.round((value / max) * 1000) / 10 } : {}),
          text: (topBar.getAttribute('aria-valuetext') ?? '').slice(0, 600),
        }
      }
      for (const element of globalThis.document.querySelectorAll('.check-rainbow[role="progressbar"], [role="progressbar"], progress, [aria-valuenow]')) {
        const rect = element.getBoundingClientRect()
        if (rect.top > 180 || rect.bottom < 0 || rect.width <= 0 || rect.height <= 0) continue
        const value = element.tagName === 'PROGRESS' ? element.value : Number(element.getAttribute('aria-valuenow'))
        const max = element.tagName === 'PROGRESS' ? element.max : Number(element.getAttribute('aria-valuemax'))
        const item = {}
        if (Number.isFinite(value)) item.value = value
        if (Number.isFinite(max) && max > 0) item.max = max
        if (Number.isFinite(value) && Number.isFinite(max) && max > 0) item.percent = Math.round((value / max) * 1000) / 10
        progress.push(item)
        if (progress.length >= 8) break
      }
      const notice = globalThis.document.querySelector('[aria-label="文件导出"] [role="status"]')
      exportNotice = typeof notice?.textContent === 'string' ? notice.textContent.trim().slice(0, 800) : ''
      // Hague draft probe: only visible alert/status text of the page, never form data.
      for (const element of globalThis.document.querySelectorAll('p.errors[role="alert"], p.errors.card, [role="status"] p')) {
        const text = (element.textContent ?? '').trim()
        if (text) draftTexts.push(text.slice(0, 400))
        if (draftTexts.length >= 6) break
      }
    } catch {
      // A Vue rerender can replace progress elements during a snapshot.
    }

    const sendDownloads = items => {
      const extensionId = globalThis.chrome?.runtime?.id
      const downloads = (Array.isArray(items) ? items : []).filter(item => {
        const extensionPrefix = typeof extensionId === 'string' && extensionId ? `chrome-extension://${extensionId}/` : ''
        const ownedByPatMail = Boolean(extensionId) && (
          item?.byExtensionId === extensionId
          || (typeof item?.url === 'string' && (item.url.startsWith(extensionPrefix) || item.url.startsWith(`blob:${extensionPrefix}`)))
        )
        if (!ownedByPatMail) return false
        const time = Date.parse(item?.startTime ?? '')
        return (Number.isFinite(time) && time >= startTime) || item?.state === 'in_progress'
      }).map(item => ({
        ...(typeof extensionId === 'string' ? { byExtensionId: extensionId } : {}),
        ...(Number.isInteger(item.id) && item.id >= 0 ? { id: item.id } : {}),
        ...(typeof item.startTime === 'string' ? { startTime: item.startTime.slice(0, 40) } : {}),
        ...(typeof item.endTime === 'string' ? { endTime: item.endTime.slice(0, 40) } : {}),
        filename: typeof item.filename === 'string' ? item.filename.slice(0, 2048) : '',
        state: typeof item.state === 'string' ? item.state.slice(0, 40) : 'unknown',
        exists: typeof item.exists === 'boolean' ? item.exists : null,
        mime: typeof item.mime === 'string' ? item.mime.slice(0, 160) : '',
        ...(typeof item.bytesReceived === 'number' ? { bytesReceived: item.bytesReceived } : {}),
        ...(typeof item.totalBytes === 'number' ? { totalBytes: item.totalBytes } : {}),
        ...(typeof item.error === 'string' ? { error: item.error.slice(0, 80) } : {}),
        ...(typeof item.paused === 'boolean' ? { paused: item.paused } : {}),
      }))
      report(JSON.stringify({ kind: 'snapshot', hagueActive, topProgress, progress, exportNotice, draftTexts, downloadsAvailable: true, downloads }))
    }
    const downloadsApi = globalThis.chrome?.downloads
    if (typeof downloadsApi?.search !== 'function') {
      report(JSON.stringify({ kind: 'snapshot', hagueActive, topProgress, progress, exportNotice, draftTexts, downloadsAvailable: false, downloads: [] }))
      return
    }
    try {
      const result = downloadsApi.search({ limit: 40, orderBy: ['-startTime'] })
      if (result && typeof result.then === 'function') result.then(sendDownloads, () => sendDownloads([]))
      else downloadsApi.search({ limit: 40, orderBy: ['-startTime'] }, sendDownloads)
    } catch {
      sendDownloads([])
    }
  }
  const taskHelpers = includeJihuaTask === true
    ? `,(${summarizeJihuaTask.toString()}),(${classifyJihuaErrorCategory.toString()})`
    : ',null,null'
  return `(${poll.toString()})(${JSON.stringify(Number(startedAt))},${includeJihuaTask === true}${taskHelpers})`
}

function logHourStart(filename) {
  const match = /^observer-(\d{4})-(\d{2})-(\d{2})-(\d{2})\.jsonl$/.exec(filename)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]))
}

class JsonlLogger {
  constructor(directory) {
    this.directory = directory
    this.queue = Promise.resolve()
    this.failureCount = 0
  }

  enqueue(action) {
    const next = this.queue.then(action)
    this.queue = next.catch(() => { this.failureCount += 1 })
    return next.catch(() => undefined)
  }

  log(kind, values = {}) {
    const record = { ts: nowIso(), kind, ...values }
    return this.enqueue(async () => {
      const filename = hourlyLogName(record.ts)
      await appendFile(join(this.directory, filename), `${JSON.stringify(record)}\n`, 'utf8')
    })
  }

  prune(now = Date.now()) {
    const cutoff = now - LOG_RETENTION_MS
    return this.enqueue(async () => {
      let filenames
      try {
        filenames = await readdir(this.directory)
      } catch {
        return
      }
      for (const filename of filenames) {
        const hourStart = logHourStart(filename)
        if (hourStart === null) continue
        const path = join(this.directory, filename)
        if (hourStart + 60 * 60 * 1000 <= cutoff) {
          await rm(path, { force: true }).catch(() => undefined)
          continue
        }
        if (hourStart <= cutoff) {
          const content = await readFile(path, 'utf8').catch(() => '')
          const filtered = filterRecentJsonl(content, cutoff)
          const tempPath = `${path}.${process.pid}.tmp`
          await writeFile(tempPath, filtered, 'utf8')
          try {
            await rename(tempPath, path)
          } catch {
            await unlink(path).catch(() => undefined)
            await rename(tempPath, path).catch(() => unlink(tempPath).catch(() => undefined))
          }
        }
      }
    })
  }

  async flush() {
    await this.queue
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function writeConfig(paths, endpoint, source = 'argument') {
  await mkdir(paths.dataDir, { recursive: true })
  const tempPath = `${paths.configPath}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`
  await writeFile(tempPath, `${JSON.stringify({ endpoint, source, updatedAt: nowIso() }, null, 2)}\n`, 'utf8')
  try {
    await rename(tempPath, paths.configPath)
  } catch {
    await unlink(paths.configPath).catch(() => undefined)
    await rename(tempPath, paths.configPath)
  }
}

async function writeStatusFile(paths, value) {
  const status = {
    state: safeIdentifier(value?.state, 40) ?? 'unknown',
    pid: Number.isInteger(value?.pid) ? value.pid : null,
    startedAt: typeof value?.startedAt === 'string' ? value.startedAt : null,
    heartbeatAt: typeof value?.heartbeatAt === 'string' ? value.heartbeatAt : nowIso(),
    endpointHost: safeIdentifier(value?.endpointHost, 80) ?? null,
    targets: Number.isInteger(value?.targets) && value.targets >= 0 ? value.targets : 0,
    logWriteFailures: Number.isInteger(value?.logWriteFailures) && value.logWriteFailures >= 0 ? value.logWriteFailures : 0,
  }
  const tempPath = `${paths.statusPath}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`
  await writeFile(tempPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8')
  try {
    await rename(tempPath, paths.statusPath)
  } catch {
    await unlink(paths.statusPath).catch(() => undefined)
    await rename(tempPath, paths.statusPath)
  }
}

async function readLock(paths) {
  const result = await readJson(paths.lockPath)
  if (result && Number.isInteger(result.pid) && typeof result.token === 'string' && result.token.length >= 32) return result
  try {
    const info = await stat(paths.lockPath)
    if (Date.now() - info.mtimeMs > 10_000) await unlink(paths.lockPath).catch(() => undefined)
  } catch {
    return null
  }
  return null
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

async function writeLockState(paths, token, changes) {
  const current = await readJson(paths.lockPath)
  if (!current || current.token !== token) throw new Error('CDP observer lock ownership was lost')
  const next = { ...current, ...changes, heartbeatAt: nowIso() }
  await writeFile(paths.lockPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

async function removeLockIfOwned(paths, token) {
  const current = await readJson(paths.lockPath)
  if (current?.token !== token) return false
  await unlink(paths.lockPath).catch(() => undefined)
  return true
}

function safeHost(value) {
  try {
    return validateEndpointUrl(value).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return 'localhost'
  }
}

function bearerToken(request) {
  const value = request.headers.authorization
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return ''
  return value.slice(7)
}

function tokenMatches(supplied, expected) {
  if (typeof supplied !== 'string' || typeof expected !== 'string') return false
  const left = Buffer.from(supplied)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(value))
}

async function controlRequest(state, path, method = 'GET', body, timeoutMs = CONTROL_REQUEST_TIMEOUT_MS) {
  if (!Number.isInteger(state?.controlPort) || !isProcessAlive(state.pid)) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`http://127.0.0.1:${state.controlPort}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${state.token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    })
    return { status: response.status, body: await response.json().catch(() => null) }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function waitDelay(ms) {
  return new Promise(resolveWait => setTimeout(resolveWait, ms))
}

export async function startObserver(options = {}) {
  const paths = createObserverPaths(options.root ?? WORKSPACE_ROOT)
  await mkdir(paths.dataDir, { recursive: true })
  const requestedEndpoint = options.endpoint ? validateEndpointUrl(options.endpoint).href : null
  let state = await readLock(paths)

  if (state) {
    if (!isProcessAlive(state.pid)) {
      await removeLockIfOwned(paths, state.token)
      state = null
    } else {
      if (requestedEndpoint) {
        const configure = await controlRequest(state, '/configure', 'POST', { endpoint: requestedEndpoint })
        if (configure?.status === 200) {
          const status = await controlRequest(state, '/status')
          return { ...(status?.body ?? {}), reused: true }
        }
      }
      const deadline = Date.now() + SERVICE_READY_TIMEOUT_MS
      while (Date.now() < deadline) {
        const response = await controlRequest(state, '/status')
        if (response?.status === 200 && response.body?.pid === state.pid) {
          return { ...response.body, reused: true }
        }
        await waitDelay(200)
        state = await readLock(paths) ?? state
        if (!isProcessAlive(state.pid)) break
      }
      if (isProcessAlive(state.pid)) {
        throw new Error('CDP observer lock is held by a live but unhealthy process; refusing to start a second service')
      }
      await removeLockIfOwned(paths, state.token)
    }
  }

  const resolved = await resolveEndpoint({ root: options.root ?? WORKSPACE_ROOT, endpoint: requestedEndpoint ?? undefined })
  const endpoint = resolved.endpoint
  if (endpoint) await writeConfig(paths, endpoint, resolved.source)
  const token = randomBytes(32).toString('hex')
  const reservation = {
    pid: process.pid,
    token,
    status: 'starting',
    controlPort: null,
    endpointHost: endpoint ? safeHost(endpoint) : null,
    startedAt: nowIso(),
    heartbeatAt: nowIso(),
  }
  try {
    await writeFile(paths.lockPath, `${JSON.stringify(reservation, null, 2)}\n`, { flag: 'wx' })
    await writeStatusFile(paths, reservation)
  } catch (error) {
    if (error?.code === 'EEXIST') {
      await waitDelay(200)
      return startObserver(options)
    }
    await removeLockIfOwned(paths, token)
    throw error
  }

  const entryPath = join(SCRIPT_DIR, 'cdp-observer.mjs')
  let spawnError
  let childExited = false
  const child = spawn(process.execPath, [...nativeWebSocketFlags(), entryPath, '__daemon'], {
    cwd: WORKSPACE_ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, PATMAIL_CDP_OBSERVER_TOKEN: token },
  })
  child.once('error', error => { spawnError = error })
  child.once('exit', () => { childExited = true })
  child.unref()

  const deadline = Date.now() + SERVICE_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (spawnError) {
      await removeLockIfOwned(paths, token)
      throw new Error(`Could not start CDP observer process: ${spawnError.name}`)
    }
    if (childExited) {
      await removeLockIfOwned(paths, token)
      throw new Error('CDP observer process exited before becoming healthy')
    }
    const current = await readLock(paths)
    if (current?.token === token && current.controlPort) {
      const response = await controlRequest(current, '/status')
      if (response?.status === 200 && response.body?.pid === current.pid) return { ...response.body, reused: false }
    }
    await waitDelay(200)
  }
  const current = await readLock(paths)
  if (current?.token === token && isProcessAlive(current.pid)) {
    const response = await controlRequest(current, '/status')
    if (response?.status === 200 && response.body?.pid === current.pid) return { ...response.body, reused: false }
  }
  await removeLockIfOwned(paths, token)
  throw new Error('CDP observer did not become healthy within 20 seconds')
}

export async function getObserverStatus(options = {}) {
  const paths = createObserverPaths(options.root ?? WORKSPACE_ROOT)
  const state = await readLock(paths)
  if (!state) return { state: 'stopped', pid: null, heartbeatAt: null }
  if (!isProcessAlive(state.pid)) return { state: 'stale', pid: state.pid, heartbeatAt: state.heartbeatAt ?? null }
  const response = await controlRequest(state, '/status')
  if (response?.status === 200 && response.body?.pid === state.pid) return response.body
  return {
    state: state.status === 'starting' ? 'starting' : 'unresponsive',
    pid: state.pid,
    heartbeatAt: state.heartbeatAt ?? null,
    endpointHost: state.endpointHost ?? null,
  }
}

export async function stopObserver(options = {}) {
  const paths = createObserverPaths(options.root ?? WORKSPACE_ROOT)
  const state = await readLock(paths)
  if (!state) return { stopped: true, state: 'stopped', pid: null }
  if (!isProcessAlive(state.pid)) {
    await removeLockIfOwned(paths, state.token)
    return { stopped: true, state: 'stopped', pid: state.pid }
  }
  const response = await controlRequest(state, '/stop', 'POST', {})
  if (response?.status !== 202 || response.body?.pid !== state.pid) {
    throw new Error('CDP observer health endpoint did not accept the stop request; no process was signaled')
  }
  const deadline = Date.now() + SERVICE_STOP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const current = await readLock(paths)
    if (!current || current.token !== state.token) return { stopped: true, state: 'stopped', pid: state.pid }
    await waitDelay(150)
  }
  return { stopped: false, state: 'stopping', pid: state.pid }
}

export class CdpObserverService {
  constructor(token, options = {}) {
    this.root = options.root ?? WORKSPACE_ROOT
    this.paths = createObserverPaths(this.root)
    this.token = token
    this.startedAt = Date.now()
    this.endpoint = options.endpoint ?? null
    this.endpointLocked = Boolean(options.endpoint)
    this.logger = new JsonlLogger(this.paths.dataDir)
    this.outputBudget = new ResearchOutputBudget()
    this.analysisWorker = new AnalysisWorker()
    this.deep = new HagueDeepDiagnostics((method, params, session) => this.sendCdp(method, params, session), (kind, fields) => this.recordResearchOutput(kind,fields), this.analysisWorker)
    this.research = new HagueResearchDiagnostics(this.deep, (method,params,session)=>this.sendCdp(method,params,session), (kind,fields)=>this.recordResearchOutput(kind,fields), {worker:this.analysisWorker})
    this.autoResearchEnabled = true
    this.autoResearchPending = null
    this.autoResearchAttempts = new Map()
    this.researchReadySessions = new Set()
    this.hagueTraces = []
    this.hagueContexts = new Map()
    this.knownAppTraces = new Map()
    this.research.observerStateProvider=()=>this.connectionStatus
    this.research.outputStatusProvider=()=>({dropped:this.outputBudget.dropped,pending:this.outputBudget.pending,peak:this.outputBudget.peakPending})
    this.bridge = new CdpUiBridge(command => this.sendCdp(command.method, command.params, command.sessionId), () => [...this.sessions.values()].filter(target => target.source === 'app' && target.type === 'page' && this.knownExtensionIds.has(extensionIdFromUrl(target.url))))
    this.controlServer = null
    this.ws = null
    this.connectingSocket = null
    this.connectionStatus = 'waiting'
    this.connectionReason = null
    this.stopRequested = false
    this.commandId = 0
    this.pendingCommands = new Map()
    this.selectedTargets = new Map()
    this.sessions = new Map()
    this.pendingTargets = new Set()
    this.configuredSessions = new Set()
    this.knownExtensionIds = new Set()
    this.networkRequests = new Map()
    this.lastSnapshotByTarget = new Map()
    this.lastJihuaTaskSnapshotByTarget = new Map()
    this.lastJihuaTaskSnapshotAt = 0
    this.snapshotBusyTargets = new Set()
    this.reconcileTimer = null
    this.heartbeatTimer = null
    this.snapshotTimer = null
    this.pruneTimer = null
    this.lastHeartbeatLogAt = 0
    this.lastConnectErrorReason = null
    this.lastConnectErrorLogAt = 0
    this.connectDelayMs = CONNECT_RETRY_MS
    this.startedAtIso = new Date(this.startedAt).toISOString()
    this.safeTransport = createCdpSender(command => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('CDP socket is not open')
      this.ws.send(JSON.stringify(command))
    })
  }

  async start() {
    await mkdir(this.paths.dataDir, { recursive: true })
    if (!this.endpoint) {
      const resolved = await resolveEndpoint({ root: this.root })
      this.endpoint = resolved.endpoint
    }
    this.controlServer = createServer((request, response) => { void this.handleControl(request, response) })
    this.controlServer.on('clientError', (_error, socket) => socket.destroy())
    await new Promise((resolveListen, rejectListen) => {
      this.controlServer.once('error', rejectListen)
      this.controlServer.listen(0, '127.0.0.1', () => {
        this.controlServer.off('error', rejectListen)
        resolveListen()
      })
    })
    const address = this.controlServer.address()
    if (!address || typeof address === 'string') throw new Error('Could not bind observer health endpoint')
    await writeLockState(this.paths, this.token, {
      pid: process.pid,
      status: this.connectionStatus,
      controlPort: address.port,
      endpointHost: this.endpoint ? safeHost(this.endpoint) : null,
      startedAt: this.startedAtIso,
    })
    await writeStatusFile(this.paths, this.statusSnapshot())
    await this.logger.prune(this.startedAt)
    await this.logger.log('service.started', { pid: process.pid, state: this.connectionStatus })
    this.heartbeatTimer = setInterval(() => { void this.heartbeat() }, SERVICE_HEARTBEAT_MS)
    this.heartbeatTimer.unref?.()
    this.snapshotTimer = setInterval(() => { void this.pollAppSnapshots() }, SNAPSHOT_POLL_MS)
    this.snapshotTimer.unref?.()
    this.pruneTimer = setInterval(() => { void this.logger.prune() }, LOG_PRUNE_MS)
    this.pruneTimer.unref?.()
    process.on('SIGINT', this.signalHandler)
    process.on('SIGTERM', this.signalHandler)
    void this.connectionLoop()
    return address.port
  }

  signalHandler = () => { void this.stop('signal') }

  async handleControl(request, response) {
    const address = request.socket.remoteAddress
    if (address !== '127.0.0.1' && address !== '::ffff:127.0.0.1') {
      sendJson(response, 403, { error: 'forbidden' })
      return
    }
    if (!tokenMatches(bearerToken(request), this.token)) {
      sendJson(response, 403, { error: 'forbidden' })
      return
    }
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (request.method === 'GET' && path === '/status') {
      sendJson(response, 200, this.statusSnapshot())
      return
    }
    if (path === '/hague-diagnostics') {
      if (request.method === 'GET') { sendJson(response, 200, this.research.status()); return }
      if (request.method !== 'POST') { sendJson(response, 405, {error:'method'}); return }
      const body = await this.readControlBody(request, response)
      if (!body) return
      try {
        if(body.mode!==undefined&&!['deep','research','basic'].includes(body.mode))throw Error('mode')
        if (body.action === 'disable') { this.autoResearchEnabled=false; sendJson(response, 200, await this.research.disable()); return }
        const target = [...this.sessions.values()].find(t => t.targetId === body.targetId && t.source === 'hague')
        if (body.action !== 'enable' || !target || body.mode==='basic') throw Error('target')
        this.autoResearchEnabled=false
        sendJson(response, 200, await this.research.enable(target, body.mode === 'research' ? 'research' : 'deep'))
      } catch { sendJson(response, 400, {error:'invalid_authorized_target'}) }
      return
    }
    if (request.method === 'POST' && path === '/configure') {
      const body = await this.readControlBody(request, response)
      if (!body) return
      try {
        const endpoint = validateEndpointUrl(body.endpoint).href
        if (endpoint !== this.endpoint || !this.endpointLocked) {
          await writeConfig(this.paths, endpoint, 'argument')
          this.endpoint = endpoint
          this.endpointLocked = true
          await this.logger.log('service.endpoint_changed', { host: safeHost(endpoint) })
          this.ws?.close()
        }
        sendJson(response, 200, this.statusSnapshot())
      } catch {
        sendJson(response, 400, { error: 'invalid_endpoint' })
      }
      return
    }
    if (request.method === 'POST' && path === '/stop') {
      sendJson(response, 202, { accepted: true, pid: process.pid })
      setTimeout(() => { void this.stop('requested') }, 50).unref?.()
      return
    }
    sendJson(response, 404, { error: 'not_found' })
  }

  async readControlBody(request, response) {
    let content = ''
    try {
      for await (const chunk of request) {
        content += chunk
        if (content.length > 4096) {
          sendJson(response, 413, { error: 'body_too_large' })
          return null
        }
      }
      return JSON.parse(content || '{}')
    } catch {
      sendJson(response, 400, { error: 'invalid_body' })
      return null
    }
  }

  statusSnapshot() {
    return {
      state: this.connectionStatus,
      pid: process.pid,
      startedAt: this.startedAtIso,
      heartbeatAt: nowIso(),
      endpointHost: this.endpoint ? safeHost(this.endpoint) : null,
      targets: this.sessions.size,
      logWriteFailures: this.logger.failureCount,
      hagueDeep: this.research.status(),
      hagueCdpUiBridge: this.bridge.state,
    }
  }

  async heartbeat() {
    if (this.stopRequested) return
    try {
      await writeLockState(this.paths, this.token, {
        pid: process.pid,
        status: this.connectionStatus,
        endpointHost: this.endpoint ? safeHost(this.endpoint) : null,
      })
      await writeStatusFile(this.paths, this.statusSnapshot())
      if (Date.now() - this.lastHeartbeatLogAt >= 60_000) {
        this.lastHeartbeatLogAt = Date.now()
        await this.logger.log('service.heartbeat', { pid: process.pid, state: this.connectionStatus })
      }
    } catch {
      void this.stop('lock_lost')
    }
  }

  async setConnectionStatus(status, reason) {
    if (this.connectionStatus === status) return
    this.connectionStatus = status
    await this.logger.log('cdp.connection', { state: status, ...(reason ? { reason } : {}) })
    await writeLockState(this.paths, this.token, {
      pid: process.pid,
      status,
      endpointHost: this.endpoint ? safeHost(this.endpoint) : null,
    }).catch(() => undefined)
    await writeStatusFile(this.paths, this.statusSnapshot()).catch(() => undefined)
  }

  async connectionLoop() {
    while (!this.stopRequested) {
      let socket
      let failureReason = null
      try {
        if (typeof WebSocket !== 'function') throw new Error('Node native WebSocket is unavailable')
        const endpoint = await resolveWebSocketEndpoint(await this.resolveConnectEndpoint())
        if (this.stopRequested) break
        socket = new WebSocket(endpoint)
        this.connectingSocket = socket
        await this.waitForSocketOpen(socket)
        if (this.connectingSocket === socket) this.connectingSocket = null
        if (this.stopRequested) {
          socket.close()
          break
        }
        this.ws = socket
        this.attachSocketEvents(socket)
        await this.onConnected()
        this.connectDelayMs = CONNECT_RETRY_MS
        await this.waitForSocketClose(socket)
      } catch (error) {
        try {
          socket?.close()
        } catch {
          // The connection may already be closed.
        }
        if (this.connectingSocket === socket) this.connectingSocket = null
        if (!this.stopRequested) {
          failureReason = connectionFailureReason(error)
          await this.setConnectionStatus('waiting', failureReason)
          await this.logger.log('cdp.connect_error', { reason: failureReason })
        }
      }
      if (socket && this.ws === socket) this.ws = null
      this.clearCdpState()
      if (this.stopRequested) break
      if (failureReason === 'endpoint_unavailable') {
        // No local CDP endpoint exists yet; poll discovery instead of backing off.
        this.connectDelayMs = CONNECT_RETRY_MS
        await sleep(DISCOVERY_RETRY_MS)
        continue
      }
      await this.setConnectionStatus('waiting', 'disconnected')
      await sleep(this.connectDelayMs)
      this.connectDelayMs = Math.min(this.connectDelayMs * 2, CONNECT_RETRY_MAX_MS)
    }
  }

  async resolveConnectEndpoint() {
    if (this.endpointLocked && this.endpoint) return this.endpoint
    const resolved = await resolveEndpoint({ root: this.root })
    if (!resolved.endpoint) throw new EndpointUnavailableError()
    this.endpoint = resolved.endpoint
    return this.endpoint
  }

  waitForSocketOpen(socket) {
    return waitForWebSocketOpen(socket, SERVICE_CONNECT_TIMEOUT_MS)
  }

  attachSocketEvents(socket) {
    socket.addEventListener('message', event => {
      try {
        const message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
        this.handleCdpMessage(message)
      } catch {
        void this.logger.log('cdp.protocol_error', { reason: 'invalid_message' })
      }
    })
    socket.addEventListener('error', () => {
      void this.logger.log('cdp.socket_error', { reason: 'socket_error' })
    })
    socket.addEventListener('close', () => {
      if (this.ws === socket) this.ws = null
      this.clearCdpState()
    }, { once: true })
  }

  waitForSocketClose(socket) {
    if (socket.readyState === WebSocket.CLOSED) return Promise.resolve()
    return new Promise(resolveClose => socket.addEventListener('close', resolveClose, { once: true }))
  }

  clearCdpState() {
    for (const pending of this.pendingCommands.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('CDP connection closed'))
    }
    this.pendingCommands.clear()
    this.selectedTargets.clear()
    this.autoResearchAttempts.clear()
    this.researchReadySessions.clear()
    void this.research.disable()
    this.bridge.clear()
    this.hagueContexts.clear()
    this.hagueTraces = []
    this.knownAppTraces.clear()
    this.sessions.clear()
    this.pendingTargets.clear()
    this.configuredSessions.clear()
    this.knownExtensionIds.clear()
    this.networkRequests.clear()
    this.lastSnapshotByTarget.clear()
    this.lastJihuaTaskSnapshotByTarget.clear()
    this.snapshotBusyTargets.clear()
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer)
    this.reconcileTimer = null
  }

  handleCdpMessage(message) {
    if (Number.isInteger(message?.id)) {
      const pending = this.pendingCommands.get(message.id)
      if (!pending) return
      this.pendingCommands.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new Error(`CDP command failed: ${pending.method}`))
      else pending.resolve(message.result ?? {})
      return
    }
    if (typeof message?.method !== 'string') return
    const params = message.params ?? {}
    const sessionId = message.sessionId ?? ''
    if (message.method.startsWith('Target.')) {
      this.handleTargetEvent(message.method, params)
      return
    }
    const target = this.sessions.get(sessionId)
    if (!target) return
    switch (message.method) {
      case 'Debugger.scriptParsed':
        void this.deep.script(target, params)
        break
      case 'Runtime.executionContextDestroyed':
        this.clearHagueSessionEvidence(sessionId)
        break
      case 'Runtime.executionContextsCleared':
        this.clearHagueSessionEvidence(sessionId)
        this.autoResearchAttempts.delete(sessionId)
        if (this.deep.target?.sessionId === sessionId) void this.research.disable().then(()=>this.ensureAutomaticResearch())
        void this.logger.log('runtime.contexts_cleared', {source:target.source})
        break
      case 'Runtime.bindingCalled':
        this.handleBinding(target, params)
        break
      case 'Runtime.consoleAPICalled':
        this.handleConsole(target, params)
        break
      case 'Runtime.exceptionThrown':
        this.handleException(target, params)
        break
      case 'Runtime.executionContextCreated':
        this.handleHagueContext(target, params)
        if (target.source === 'hague') void this.ensureAutomaticResearch()
        if (target.source === 'app') void this.installRuntimeObserver(sessionId)
        break
      case 'Network.requestWillBeSent':
        this.handleNetworkRequest(target, sessionId, params)
        break
      case 'Network.responseReceived':
        this.handleNetworkResponse(target, sessionId, params)
        break
      case 'Network.loadingFinished':
        this.handleNetworkFinished(target, sessionId, params)
        break
      case 'Network.loadingFailed':
        this.handleNetworkFailure(target, sessionId, params)
        break
      default:
        break
    }
  }

  handleTargetEvent(method, params) {
    if (method === 'Target.targetCreated' || method === 'Target.targetInfoChanged') {
      const targetInfo = params.targetInfo
      if (this.deep.target?.targetId === targetInfo?.targetId && this.deep.target.url !== targetInfo.url) void this.research.disable()
      if (targetInfo) {
        const appId = isPatMailAppTarget(targetInfo, this.knownExtensionIds) ? extensionIdFromUrl(targetInfo.url) : ''
        if (appId) this.knownExtensionIds.add(appId)
      }
      this.scheduleReconcile()
      return
    }
    if (method === 'Target.targetDestroyed') {
      const selected = this.selectedTargets.get(params.targetId)
      this.selectedTargets.delete(params.targetId)
      if (selected) {
        if (this.deep.target?.sessionId === selected.sessionId) void this.research.disable()
        this.clearHagueSessionEvidence(selected.sessionId)
        this.sessions.delete(selected.sessionId)
        this.lastSnapshotByTarget.delete(params.targetId)
        this.lastJihuaTaskSnapshotByTarget.delete(params.targetId)
        this.logger.log('target.detached', { source: selected.source, reason: 'destroyed' })
        this.scheduleReconcile()
      }
      return
    }
    if (method === 'Target.detachedFromTarget') {
      const target = this.sessions.get(params.sessionId)
      if (target) {
        if (this.deep.target?.sessionId === params.sessionId) void this.research.disable()
        this.clearHagueSessionEvidence(params.sessionId)
        this.sessions.delete(params.sessionId)
        this.selectedTargets.delete(target.targetId)
        this.configuredSessions.delete(params.sessionId)
        this.lastSnapshotByTarget.delete(target.targetId)
        this.lastJihuaTaskSnapshotByTarget.delete(target.targetId)
        this.logger.log('target.detached', { source: target.source, reason: 'detached' })
        this.scheduleReconcile()
      }
      return
    }
    if (method === 'Target.attachedToTarget') {
      const targetInfo = params.targetInfo
      const selected = selectTargets([targetInfo], this.knownExtensionIds)[0]
      if (selected && params.sessionId) {
        const target = { ...targetInfo, ...selected, sessionId: params.sessionId }
        this.selectedTargets.set(target.targetId, target)
        void this.initializeSession(target)
      }
    }
  }

  scheduleReconcile() {
    if (this.reconcileTimer || this.stopRequested) return
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = null
      void this.reconcileTargets()
    }, 250)
  }

  sendCdp(method, params = {}, sessionId) {
    const id = ++this.commandId
    const command = { id, method, params, ...(sessionId ? { sessionId } : {}) }
    return new Promise((resolveCommand, rejectCommand) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(id)
        rejectCommand(new Error(`CDP command timed out: ${method}`))
      }, CDP_COMMAND_TIMEOUT_MS)
      this.pendingCommands.set(id, { method, resolve: resolveCommand, reject: rejectCommand, timer })
      try {
        if(method === 'Network.getResponseBody') {
          if(!this.research.bodyCommandAllowed(params,sessionId))throw Error('Blocked body command')
          if(!this.ws || this.ws.readyState!==WebSocket.OPEN)throw Error('CDP socket is not open')
          this.ws.send(JSON.stringify(command))
        } else this.safeTransport(command)
      } catch (error) {
        clearTimeout(timer)
        this.pendingCommands.delete(id)
        rejectCommand(error)
      }
    })
  }

  async onConnected() {
    await this.setConnectionStatus('connected')
    await this.sendCdp('Target.setDiscoverTargets', { discover: true })
    const response = await this.sendCdp('Target.getTargets')
    await this.reconcileTargets(response.targetInfos ?? [])
  }

  async reconcileTargets(existingInfos) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    try {
      const response = existingInfos ? { targetInfos: existingInfos } : await this.sendCdp('Target.getTargets')
      const infos = response.targetInfos ?? []
      const infoById = new Map(infos.map(target => [target.targetId, target]))
      for (const target of infos) {
        if (isPatMailAppTarget(target, this.knownExtensionIds)) this.knownExtensionIds.add(extensionIdFromUrl(target.url))
      }
      const selected = selectTargets(infos, this.knownExtensionIds)
      const selectedById = new Map(selected.map(target => [target.targetId, target]))
      for (const [targetId, current] of this.selectedTargets) {
        const nextSelection = selectedById.get(targetId)
        const info = infoById.get(targetId)
        if (!nextSelection || !info) {
          this.selectedTargets.delete(targetId)
          if (this.deep.target?.sessionId === current.sessionId) void this.research.disable()
          this.clearHagueSessionEvidence(current.sessionId)
        this.sessions.delete(current.sessionId)
          this.configuredSessions.delete(current.sessionId)
          this.lastSnapshotByTarget.delete(targetId)
          this.lastJihuaTaskSnapshotByTarget.delete(targetId)
          this.snapshotBusyTargets.delete(targetId)
          for (const key of this.networkRequests.keys()) {
            if (key.startsWith(`${current.sessionId}:`)) this.networkRequests.delete(key)
          }
          this.pendingTargets.delete(targetId)
          void this.sendCdp('Target.detachFromTarget', { sessionId: current.sessionId }).catch(() => undefined)
          void this.logger.log('target.detached', { source: current.source, reason: 'no_longer_matched' })
          continue
        }
        const refreshed = { ...info, ...nextSelection, sessionId: current.sessionId }
        this.selectedTargets.set(targetId, refreshed)
        this.sessions.set(current.sessionId, refreshed)
      }
      for (const target of selected) {
        if (this.selectedTargets.has(target.targetId) || this.pendingTargets.has(target.targetId)) continue
        this.pendingTargets.add(target.targetId)
        const info = infoById.get(target.targetId)
        void this.attachTarget({ ...info, ...target })
      }
      await this.ensureAutomaticResearch()
    } catch {
      await this.logger.log('cdp.target_scan_error', { reason: 'target_scan_failed' })
    }
  }

  async attachTarget(selection) {
    try {
      const result = await this.sendCdp('Target.attachToTarget', { targetId: selection.targetId, flatten: true })
      if (!result.sessionId) return
      const existing = this.selectedTargets.get(selection.targetId)
      if (existing?.sessionId === result.sessionId) return
      const target = targetSessionMetadata(selection, result.sessionId)
      this.selectedTargets.set(selection.targetId, target)
      await this.initializeSession(target)
    } catch {
      await this.logger.log('target.attach_error', { source: selection.source })
    } finally {
      this.pendingTargets.delete(selection.targetId)
    }
  }

  async initializeSession(target) {
    const sessionId = target.sessionId
    if (!sessionId || this.configuredSessions.has(sessionId)) return
    this.configuredSessions.add(sessionId)
    this.sessions.set(sessionId, target)
    try {
      if (['app','hague'].includes(target.source)) await this.sendCdp('Runtime.addBinding', { name: OBSERVER_BINDING }, sessionId)
      await this.sendCdp('Runtime.enable', {}, sessionId)
      await this.sendCdp('Network.enable', {}, sessionId)
      if (target.source === 'app') await this.installRuntimeObserver(sessionId)
      await this.logger.log('target.attached', { source: target.source, type: safeIdentifier(target.type, 40) ?? 'unknown' })
      this.researchReadySessions.add(sessionId)
      await this.ensureAutomaticResearch()
    } catch {
      this.clearHagueSessionEvidence(sessionId)
        this.sessions.delete(sessionId)
      this.configuredSessions.delete(sessionId)
      this.selectedTargets.delete(target.targetId)
      await this.logger.log('target.initialize_error', { source: target.source })
    }
  }

  async ensureAutomaticResearch() {
    if (!this.autoResearchEnabled || this.stopRequested || this.deep.target) return
    if (this.autoResearchPending) return this.autoResearchPending
    for (const session of this.autoResearchAttempts.keys()) if (!this.sessions.has(session)) this.autoResearchAttempts.delete(session)
    for (const session of this.researchReadySessions) if (!this.sessions.has(session)) this.researchReadySessions.delete(session)
    const target = [...this.sessions.values()].filter(t=>t.source==='hague' && t.type==='page' && this.researchReadySessions.has(t.sessionId) && safeHagueUrl(t.url) && this.autoResearchAttempts.get(t.sessionId)!==t.url).sort((a,b)=>a.targetId.localeCompare(b.targetId))[0]
    if (!target) return
    this.autoResearchAttempts.set(target.sessionId,target.url)
    const pending = this.research.enable(target,'research')
    this.autoResearchPending = pending
    try { await pending } catch { /* Diagnostic activation must not interrupt session initialization. */ }
    finally {
      if (this.autoResearchPending === pending) this.autoResearchPending=null
      if (this.autoResearchEnabled && !this.deep.target) this.scheduleReconcile()
    }
  }

  async installRuntimeObserver(sessionId) {
    const target = this.sessions.get(sessionId)
    if (!target || target.source !== 'app') return
    try {
      await this.sendCdp('Runtime.evaluate', {
        expression: buildAppObserverInstallExpression(),
        returnByValue: true,
        awaitPromise: false,
      }, sessionId)
    } catch {
      await this.logger.log('runtime.observer_install_error', { source: 'app' })
    }
  }

  clearHagueSessionEvidence(sessionId) {
    for (const key of this.hagueContexts.keys()) if (key.startsWith(`${sessionId}:`)) this.hagueContexts.delete(key)
    this.hagueTraces = this.hagueTraces.filter(event => event.sessionId !== sessionId)
  }

  handleHagueContext(target, params) {
    const context = params.context
    const frameId = context?.auxData?.frameId
    if (target.source !== 'hague' || !Number.isInteger(context?.id) || typeof frameId !== 'string' || !/^[A-Za-z0-9_.:-]{1,120}$/.test(frameId) || context.origin !== 'https://hague.wipo.int') return
    if (this.hagueContexts.size >= 512) this.hagueContexts.delete(this.hagueContexts.keys().next().value)
    this.hagueContexts.set(`${target.sessionId}:${context.id}`, frameId)
  }

  handleBinding(target, params) {
    if (!['app','hague'].includes(target.source) || params.name !== OBSERVER_BINDING || typeof params.payload !== 'string' || params.payload.length > 16000) return
    let value
    try {
      value = JSON.parse(params.payload)
    } catch {
      return
    }
    if (target.source === 'hague' && value?.kind !== 'hague-trace') return
    if (value?.kind === 'hague-trace') {
      let event = sanitizeTraceEvent(value.event)
      if (event && target.source === 'app' && !event.requestId) { void this.logger.log('hague.trace', event); return }
      if (event && event.source === 'application' && event.requestId) {
        const key = `${event.traceId}:${event.requestId}`
        if (target.source === 'app') {
          this.knownAppTraces.set(key, event)
          if (this.knownAppTraces.size > 500) this.knownAppTraces.delete(this.knownAppTraces.keys().next().value)
        } else {
          const known = this.knownAppTraces.get(key)
          const frameId = this.hagueContexts.get(`${target.sessionId}:${params.executionContextId}`)
          if (!known || !frameId || event.phase !== 'request.dispatched' || ['caseRunId','httpMethod','urlPath'].some(k => !event[k] || event[k] !== known[k])) return
          event = {...known,phase:'request.dispatched',timestamp:event.timestamp,targetId:target.targetId,sessionId:target.sessionId,frameId,cdpRequestId:undefined,correlationConfidence:'unmatched'}
        }
        this.hagueTraces = this.hagueTraces.filter(candidate => candidate.traceId !== event.traceId || candidate.requestId !== event.requestId)
        this.hagueTraces.push({...event,timestamp:Date.parse(event.timestamp)})
        if (this.hagueTraces.length > 500) this.hagueTraces.shift()
        void this.logger.log('hague.trace', event)
      }
      return
    }
    if (value?.kind === 'jihua-task') {
      const summary = safeJihuaTaskSummary(value.summary)
      if (!summary) return
      const signature = JSON.stringify(summary)
      if (this.lastJihuaTaskSnapshotByTarget.get(target.targetId) === signature) return
      this.lastJihuaTaskSnapshotByTarget.set(target.targetId, signature)
      void this.logger.log('jihua.task', summary)
      return
    }
    if (value?.kind === 'runtime-message') {
      const metadata = safeRuntimeMetadata(value)
      if (metadata) void this.logger.log('runtime.message', metadata)
      return
    }
    if (value?.kind !== 'snapshot') return
    const progress = Array.isArray(value.progress) ? value.progress.slice(0, 8).map(item => {
      const snapshot = {}
      if (finiteNumber(item?.value)) snapshot.value = item.value
      if (finiteNumber(item?.max)) snapshot.max = item.max
      if (finiteNumber(item?.percent)) snapshot.percent = item.percent
      return snapshot
    }) : []
    const hagueActive = value.hagueActive === true
    const topBar = objectValue(value.topProgress)
    const topText = hagueActive ? safeHagueSnapshotText(topBar?.text) : sanitizeDiagnosticText(topBar?.text, 600)
    const topProgress = topBar ? {
      ...(finiteNumber(topBar.value) ? { value: topBar.value } : {}),
      ...(finiteNumber(topBar.max) ? { max: topBar.max } : {}),
      ...(finiteNumber(topBar.percent) ? { percent: topBar.percent } : {}),
      ...(topText ? { text: topText } : {}),
    } : null
    const exportNotice = hagueActive ? safeHagueSnapshotText(value.exportNotice) : sanitizeDiagnosticText(value.exportNotice, 800) ?? ''
    const draftTextSummary = safeDraftTextSummary(value.draftTexts)
    const downloads = safeDownloadSnapshot(value.downloads, this.startedAt, extensionIdFromUrl(target.url))
    const event = {
      topProgress,
      progress,
      exportNotice,
      ...(draftTextSummary.count ? { draftTextSummary } : {}),
      downloadsAvailable: value.downloadsAvailable === true,
      downloads,
    }
    const signature = JSON.stringify(event)
    if (this.lastSnapshotByTarget.get(target.targetId) === signature) return
    this.lastSnapshotByTarget.set(target.targetId, signature)
    void this.logger.log('app.snapshot', event)
  }

  handleConsole(target, params) {
    if (!['warning', 'error', 'assert'].includes(params.type)) return
    if (target.source === 'jihua' || target.source === 'hague') {
      const text = (params.args ?? []).filter(argument => argument?.type === 'string' && typeof argument.value === 'string')
        .map(argument => argument.value).join(' ').slice(0, 2000)
      const errorCategory = classifyJihuaErrorCategory(text)
      void this.logger.log('runtime.console', { source: target.source, level: params.type, ...(errorCategory ? { errorCategory } : {}) })
      return
    }
    const message = safeConsoleMessage(params.args)
    void this.logger.log('runtime.console', {
      source: target.source,
      level: params.type,
      ...(message ? { message } : {}),
    })
  }

  handleException(target, params) {
    const details = params.exceptionDetails ?? {}
    const exceptionName = ['jihua','hague'].includes(target.source)
      ? (['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'DOMException'].includes(details.exception?.className) ? details.exception.className : undefined)
      : safeIdentifier(details.exception?.className, 60)
    const rawMessage = details.exception?.description?.split(/\r?\n/, 1)[0] ?? details.text
    const message = ['jihua','hague'].includes(target.source) ? undefined : sanitizeDiagnosticText(rawMessage, 500)
    const errorCategory = target.source === 'jihua' ? classifyJihuaErrorCategory(rawMessage) : undefined
    const frames = (details.stackTrace?.callFrames ?? []).slice(0, 8).map(frame => {
      const url = safeNetworkUrl(frame.url, '', target.source)
      const name = target.source === 'hague' ? undefined : safeIdentifier(frame.functionName, 80)
      const line = Number.isInteger(frame.lineNumber) && frame.lineNumber >= 0 ? frame.lineNumber + 1 : null
      const column = Number.isInteger(frame.columnNumber) && frame.columnNumber >= 0 ? frame.columnNumber + 1 : null
      if (!url.origin || line === null) return null
      return `${name ? `${name} ` : ''}${url.origin}${url.path}:${line}${column === null ? '' : `:${column}`}`
    }).filter(Boolean)
    void this.logger.log('runtime.exception', {
      source: target.source,
      ...(exceptionName ? { name: exceptionName } : {}),
      ...(message ? { message } : {}),
      ...(errorCategory ? { errorCategory } : {}),
      ...(frames.length ? { stack: frames } : {}),
      ...(Number.isInteger(details.lineNumber) && details.lineNumber >= 0 ? { line: details.lineNumber } : {}),
      ...(Number.isInteger(details.columnNumber) && details.columnNumber >= 0 ? { column: details.columnNumber } : {}),
    })
  }

  recordResearchOutput(kind, fields) {
    try{const safe=safeAnalysisOutput(fields);if(safe&&this.outputBudget.submit(kind,safe,(k,event)=>this.logger.log(k,event)))this.bridge?.enqueue(safe)}catch{this.outputBudget.dropped++}
  }

  logNetwork(kind, event) {
    void this.logger.log(kind, event)
    for (const trace of observerEventsToTraces([{ts:nowIso(),kind,...event}])) this.bridge.enqueue(trace)
  }

  retainedHagueMetadata(request) {
    if (request.source !== 'hague') return {}
    const result = {}
    for (const key of ['targetId','sessionId','frameId','httpMethod','resourceType','correlationConfidence','candidateCount','traceId','caseRunId','stepIndex','operation','transportMode','applicationRequestId','sourceLocation']) if (request[key] !== undefined) result[key] = request[key]
    return result
  }

  hagueRequestMetadata(target, sessionId, params) {
    if (target.source !== 'hague') return {}
    const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(value) ? value : undefined
    const frame = params.initiator?.stack?.callFrames?.[0]
    const location = frame && safeHagueUrl(frame.url)
    return {targetId:safeId(target.targetId),sessionId:safeId(sessionId),frameId:safeId(params.frameId),
      httpMethod:['GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS'].includes(params.request?.method) ? params.request.method : 'OTHER',
      resourceType:['Document','XHR','Fetch','Script','Stylesheet','Image','Other'].includes(params.type) ? params.type : 'Other',
      ...correlateRequest({targetId:target.targetId,frameId:params.frameId,httpMethod:params.request?.method,urlPath:safeHagueUrl(params.request?.url)?.path,timestamp:Date.now(),sessionId,cdpRequestId:params.requestId},this.hagueTraces),
      ...(location && Number.isInteger(frame.lineNumber) && frame.lineNumber >= 0 ? {sourceLocation:{urlPath:location.path,line:frame.lineNumber+1,column:Math.max(0,frame.columnNumber ?? 0)+1}} : {})}
  }

  handleNetworkRequest(target, sessionId, params) {
    this.research.request(target,sessionId,params)
    const previous = this.networkRequests.get(`${sessionId}:${params.requestId}`)
    const redirects = [...(previous?.redirects ?? [])]
    if (previous && params.redirectResponse) redirects.push({origin:previous.origin,path:previous.path,httpStatus:networkMetadata({status:params.redirectResponse.status}).httpStatus})
    // Chrome reports redirect responses here, not in responseReceived. Preserve
    // the allowed hop before discarding an out-of-scope destination; never copy
    // its Location, headers or destination URL into the diagnostic record.
    if (previous?.source === 'hague' && Number.isInteger(params.redirectResponse?.status) && params.redirectResponse.status >= 300 && params.redirectResponse.status < 400) {
      this.logNetwork('network.response', {
        ...this.retainedHagueMetadata(previous),
        ...safeNetworkResponseEvent(previous, {response:params.redirectResponse,timestamp:params.timestamp}),
        ...networkMetadata({status:params.redirectResponse.status}),
        redirects:redirects.slice(-8),
      })
    }
    const postData = target.source === 'jihua' || target.source === 'hague' ? '' : params.request?.postData
    const url = safeNetworkUrl(params.request?.url, postData, target.source)
    if (!url.origin || url.origin === 'null') {
      this.networkRequests.delete(`${sessionId}:${params.requestId}`)
      return
    }
    const key = `${sessionId}:${params.requestId}`
    const started = finiteNumber(params.timestamp) ? params.timestamp : 0
    const requestId = safeIdentifier(String(params.requestId ?? ''), 120)
    const metadata = previous?.source === 'hague' && params.redirectResponse
      ? {...this.retainedHagueMetadata(previous),httpMethod:['GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS'].includes(params.request?.method)?params.request.method:'OTHER'}
      : this.hagueRequestMetadata(target, sessionId, params)
    if (this.networkRequests.size >= 2048) this.networkRequests.delete(this.networkRequests.keys().next().value)
    this.networkRequests.set(key, { source: target.source, requestId, ...url, started, status:null, redirects:redirects.slice(-8), ...metadata })
    this.logNetwork('network.request', { source: target.source, ...metadata, redirects:redirects.slice(-8), httpStatus:null, ...(requestId ? { requestId } : {}), origin: url.origin, path: url.path, ...(url.call ? { call: url.call } : {}) })
  }

  handleNetworkResponse(target, sessionId, params) {
    this.research.response(sessionId,params)
    const request = this.networkRequests.get(`${sessionId}:${params.requestId}`)
    if (!request) return
    const event = {...this.retainedHagueMetadata(request), ...safeNetworkResponseEvent(request, params), ...networkMetadata({status:params.response?.status}), redirects:request.redirects}
    request.status = event.status
    request.mime = event.mime
    this.logNetwork('network.response', event)
  }

  handleNetworkFinished(target, sessionId, params) {
    void this.research.finished(sessionId,params)
    const key = `${sessionId}:${params.requestId}`
    const request = this.networkRequests.get(key)
    if (!request) return
    const elapsedMs = finiteNumber(params.timestamp) && request.started ? Math.max(0, Math.round((params.timestamp - request.started) * 1000)) : undefined
    this.logNetwork('network.finished', {
      source: target.source,
      ...this.retainedHagueMetadata(request),
      ...networkMetadata(request, params),
      redirects:request.redirects,
      ...(request.requestId ? { requestId: request.requestId } : {}),
      origin: request.origin,
      path: request.path,
      ...(request.call ? { call: request.call } : {}),
      ...(elapsedMs !== undefined ? { elapsedMs } : {}),
      ...(finiteNumber(params.encodedDataLength) ? { bytes: params.encodedDataLength } : {}),
    })
    this.networkRequests.delete(key)
  }

  handleNetworkFailure(target, sessionId, params) {
    this.research.forget(sessionId,params)
    const key = `${sessionId}:${params.requestId}`
    const request = this.networkRequests.get(key)
    if (!request) return
    const elapsedMs = finiteNumber(params.timestamp) && request.started ? Math.max(0, Math.round((params.timestamp - request.started) * 1000)) : undefined
    this.logNetwork('network.failure', {
      source: target.source,
      ...this.retainedHagueMetadata(request),
      ...networkMetadata(request, params),
      redirects:request.redirects,
      ...(request.requestId ? { requestId: request.requestId } : {}),
      origin: request.origin,
      path: request.path,
      ...(request.call ? { call: request.call } : {}),
      ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    })
    this.networkRequests.delete(key)
  }

  async pollAppSnapshots() {
    this.research.emit('research.status',{researchState:this.research.status().state,stats:this.research.status().stats})
    if (this.stopRequested || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
    for (const [sessionId, target] of this.sessions) {
      if (target.source !== 'app' || target.type !== 'page' || this.snapshotBusyTargets.has(target.targetId)) continue
      let includeJihuaTask = false
      if (Date.now() - this.lastJihuaTaskSnapshotAt >= JIHUA_TASK_SNAPSHOT_MS) {
        try {
          includeJihuaTask = new URL(target.url).pathname.toLowerCase().endsWith('/app.html')
        } catch {
          includeJihuaTask = false
        }
        if (includeJihuaTask) this.lastJihuaTaskSnapshotAt = Date.now()
      }
      this.snapshotBusyTargets.add(target.targetId)
      try {
        await this.sendCdp('Runtime.evaluate', {
          expression: buildAppSnapshotExpression(this.startedAt, includeJihuaTask),
          returnByValue: false,
          awaitPromise: false,
        }, sessionId)
      } catch {
        // A page reload can invalidate a session between polling ticks.
      } finally {
        this.snapshotBusyTargets.delete(target.targetId)
      }
    }
  }

  async stop(reason) {
    if (this.stopRequested) return
    this.stopRequested = true
    await this.research.disable()
    this.bridge.clear()
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.snapshotTimer) clearInterval(this.snapshotTimer)
    if (this.pruneTimer) clearInterval(this.pruneTimer)
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer)
    process.off('SIGINT', this.signalHandler)
    process.off('SIGTERM', this.signalHandler)
    await this.logger.log('service.stopped', { pid: process.pid, reason })
    await writeStatusFile(this.paths, { ...this.statusSnapshot(), state: 'stopped' }).catch(() => undefined)
    closeTrackedSockets(this.connectingSocket, this.ws)
    this.controlServer?.close()
    await this.logger.flush()
    await removeLockIfOwned(this.paths, this.token)
  }
}

export async function runObserverDaemon(token, options = {}) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('Missing observer process token')
  const paths = createObserverPaths(options.root ?? WORKSPACE_ROOT)
  const lock = await readJson(paths.lockPath)
  if (lock?.token !== token) throw new Error('Observer process token does not own the service lock')
  const service = new CdpObserverService(token, options)
  await service.start()
  return service
}



export async function configureHagueDiagnostics(action, targetId, options = {}) {
  const paths = createObserverPaths(options.root ?? WORKSPACE_ROOT)
  const state = await readJson(paths.lockPath)
  const response = await controlRequest(state, '/hague-diagnostics', action === 'status' ? 'GET' : 'POST', action === 'status' ? undefined : {action,targetId,mode:options.mode}, 30_000)
  if (!response) throw new Error('Observer unavailable; start the existing service first')
  if (response.status !== 200) throw new Error('Hague diagnostics control rejected')
  return response.body
}
