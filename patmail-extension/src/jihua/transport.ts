import { JIHUA_CHANNEL } from '../background/jihua-page-world'
import type { JihuaSession, JihuaTransport, Material, RemoteReceipt } from './types'

export interface JihuaCommand {
  channel: string
  action: string
  [key: string]: unknown
}
export type JihuaCommandSender = (command: JihuaCommand) => Promise<unknown>

const CHUNK_SIZE = 256 * 1024
const DEFAULT_STAGING_BUDGET = 128 * 1024 * 1024
const MAX_FILE_BYTES = 256 * 1024 * 1024
const MAX_CHUNK_RETRIES = 2
const MAX_READ_RETRIES = 2

export interface JihuaTransportOptions {
  binding?: string
  pollIntervalMs?: number
  requestTimeoutMs?: number
  uploadTimeoutMs?: number
  maxStagingBytes?: number
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function responseError(value: unknown): string {
  const object = record(value)
  if (object && typeof object.error === 'string') return object.error.slice(0, 500)
  return '季华页面没有返回有效回执。'
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500)
  return typeof error === 'string' ? error.slice(0, 500) : '季华操作失败。'
}

class RetryableReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetryableReadError'
  }
}

class TransportStoppedError extends Error {
  constructor() {
    super('季华任务已取消，停止等待。')
    this.name = 'TransportStoppedError'
  }
}

function isChannelFailure(error: unknown): boolean {
  return /扩展后台没有返回|回执不可用|页面已变化或关闭|Receiving end does not exist|message port closed|runtime callback closed/i.test(errorMessage(error))
}

function assertOk(value: unknown): Record<string, unknown> {
  const object = record(value)
  if (!object || object.ok !== true) throw new Error(responseError(value))
  return object
}

function parseReceipt(value: unknown): RemoteReceipt {
  const response = assertOk(value)
  const receipt = record(response.receipt)
  if (!receipt || !['missing', 'pending', 'done', 'failed'].includes(String(receipt.state))) {
    throw new Error('季华页面返回的请求回执格式无效。')
  }
  return {
    state: receipt.state as RemoteReceipt['state'],
    ...(Object.hasOwn(receipt, 'value') ? { value: receipt.value } : {}),
    ...(typeof receipt.error === 'string' ? { error: receipt.error.slice(0, 500) } : {}),
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const stride = 0x8000
  for (let offset = 0; offset < bytes.length; offset += stride) {
    const slice = bytes.subarray(offset, Math.min(offset + stride, bytes.length))
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('无法读取所选文件。'))
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) reject(new Error('读取的文件分块格式无效。'))
      else resolve(reader.result)
    }
    reader.readAsArrayBuffer(blob)
  })
}

class StagingByteBudget {
  private used = 0
  private stopped = false
  private readonly waiting: Array<{ size: number; resolve: (release: () => void) => void; reject: (error: Error) => void }> = []
  constructor(private readonly limit: number) {}

  acquire(size: number): Promise<() => void> {
    if (this.stopped) return Promise.reject(new TransportStoppedError())
    return new Promise((resolve, reject) => {
      this.waiting.push({ size, resolve, reject })
      this.pump()
    })
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    for (const waiter of this.waiting.splice(0)) waiter.reject(new TransportStoppedError())
  }

  private pump(): void {
    while (!this.stopped && this.waiting.length) {
      const next = this.waiting[0]
      const canUse = this.used === 0 || (next.size <= this.limit && this.used + next.size <= this.limit)
      if (!canUse) return
      this.waiting.shift()
      this.used += next.size
      let released = false
      next.resolve(() => {
        if (released) return
        released = true
        this.used = Math.max(0, this.used - next.size)
        this.pump()
      })
    }
  }
}

function payloadIdentity(value: unknown): string {
  try { return JSON.stringify(value) ?? 'undefined' } catch { throw new Error('季华请求数据无法序列化。') }
}

export function createJihuaTransport(
  session: JihuaSession,
  send: JihuaCommandSender,
  options: JihuaTransportOptions = {},
): JihuaTransport {
  const binding = options.binding ?? (session as JihuaSession & { binding?: string }).binding
  if (!binding || !/^[a-zA-Z0-9-]{16,128}$/.test(binding)) throw new Error('季华页面连接信息缺少本页绑定标识。')
  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? 500)
  const requestTimeoutMs = Math.max(1000, options.requestTimeoutMs ?? 120000)
  const uploadTimeoutMs = Math.max(1000, options.uploadTimeoutMs ?? 600000)
  const byteBudget = new StagingByteBudget(Math.max(1, options.maxStagingBytes ?? DEFAULT_STAGING_BUDGET))
  const operations = new Map<string, { fingerprint: string; promise: Promise<unknown>; write: boolean; settled: boolean }>()
  let stopped = false
  const stopListeners = new Set<() => void>()

  function stoppedError(): TransportStoppedError { return new TransportStoppedError() }
  function ensureActive(): void { if (stopped) throw stoppedError() }

  function waitWhileActive<T>(promise: Promise<T>): Promise<T> {
    if (stopped) {
      void promise.catch(() => {})
      return Promise.reject(stoppedError())
    }
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const cleanup = () => { stopListeners.delete(onStop) }
      const finish = (complete: () => void) => {
        if (settled) return
        settled = true
        cleanup()
        complete()
      }
      const onStop = () => finish(() => reject(stoppedError()))
      stopListeners.add(onStop)
      promise.then(value => {
        if (stopped) finish(() => reject(stoppedError()))
        else finish(() => resolve(value))
      }, error => finish(() => reject(error instanceof Error ? error : new Error(errorMessage(error)))))
    })
  }

  function sendWhileActive(command: JihuaCommand): Promise<unknown> {
    ensureActive()
    let pending: Promise<unknown>
    try { pending = Promise.resolve(send(command)) }
    catch (error) { return Promise.reject(error instanceof Error ? error : new Error(errorMessage(error))) }
    return waitWhileActive(pending)
  }

  function delayWhileActive(ms: number): Promise<void> {
    ensureActive()
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const timerState: { timer?: ReturnType<typeof setTimeout> } = {}
      const onStop = () => {
        if (settled) return
        settled = true
        if (timerState.timer) clearTimeout(timerState.timer)
        stopListeners.delete(onStop)
        reject(stoppedError())
      }
      stopListeners.add(onStop)
      timerState.timer = setTimeout(() => {
        if (settled) return
        settled = true
        stopListeners.delete(onStop)
        resolve()
      }, ms)
      if (stopped) onStop()
    })
  }

  function stopWaiting(): void {
    if (stopped) return
    stopped = true
    byteBudget.stop()
    for (const listener of [...stopListeners]) listener()
    stopListeners.clear()
  }

  function command(action: string, fields: Record<string, unknown> = {}): JihuaCommand {
    return { channel: JIHUA_CHANNEL, action, tabId: session.tabId, session, binding, ...fields }
  }

  async function sendReceipt(requestId: string): Promise<RemoteReceipt> {
    return parseReceipt(await sendWhileActive(command('receipt', { requestId })))
  }

  async function waitForReceipt(requestId: string, timeoutMs: number, initial?: RemoteReceipt): Promise<unknown> {
    const deadline = Date.now() + timeoutMs
    let receipt = initial
    let first = true
    let channelFailures = 0
    while (Date.now() <= deadline) {
      if (!first || !receipt || receipt.state === 'pending' || receipt.state === 'missing') {
        if (pollIntervalMs) await delayWhileActive(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())))
        try { receipt = await sendReceipt(requestId) }
        catch (error) {
          if (!isChannelFailure(error)) throw error
          channelFailures++
          if (channelFailures >= 3 || Date.now() >= deadline) throw new RetryableReadError(`等待季华请求回执时通信失败：${errorMessage(error)}`)
          first = false
          continue
        }
        channelFailures = 0
      }
      first = false
      if (receipt.state === 'done') return receipt.value
      if (receipt.state === 'failed') throw new Error(receipt.error || '季华请求没有确认成功；请先回读核对。')
      if (receipt.state === 'missing') throw new RetryableReadError('季华页面没有保留该请求回执；读取结果可安全重试，写入结果需先回读核对且不能重发。')
    }
    throw new Error('等待季华请求回执超时；结果未确认，请回读核对且不要重发。')
  }

  function runOnce(requestId: string, fingerprint: string, write: boolean, operation: () => Promise<unknown>): Promise<unknown> {
    const previous = operations.get(requestId)
    if (previous) {
      if (previous.fingerprint !== fingerprint) return Promise.reject(new Error('request id 已用于不同季华请求，不能复用。'))
      return previous.promise
    }
    const promise = operation()
    const entry = { fingerprint, promise, write, settled: false }
    operations.set(requestId, entry)
    const settle = () => {
      entry.settled = true
      if (!write && operations.get(requestId) === entry) operations.delete(requestId)
    }
    void promise.then(settle, settle)
    return promise
  }

  async function requestOnce(path: string, method: 'GET' | 'POST', body: unknown, requestId: string): Promise<unknown> {
    let started: unknown
    try {
      started = await sendWhileActive(command('startRequest', { path, method, body, requestId }))
    } catch (error) {
      if (stopped) throw stoppedError()
      // A lost callback can follow an accepted request. Observe its receipt before deciding.
      try {
        const receipt = await sendReceipt(requestId)
        if (receipt.state === 'done') return receipt.value
        if (receipt.state === 'failed') throw new Error(receipt.error || '季华请求没有确认成功；请先回读核对。')
        if (receipt.state === 'missing') throw new RetryableReadError('季华页面没有保留该请求回执；读取结果可安全重试，写入结果需先回读核对且不能重发。')
        return await waitForReceipt(requestId, requestTimeoutMs, receipt)
      } catch (receiptError) {
        if (receiptError instanceof RetryableReadError) throw receiptError
        if (method === 'GET' && isChannelFailure(receiptError)) throw new RetryableReadError(errorMessage(receiptError))
        throw new Error(errorMessage(receiptError || error))
      }
    }
    let response: Record<string, unknown>
    try { response = assertOk(started) }
    catch (error) {
      if (method === 'GET' && isChannelFailure(error)) throw new RetryableReadError(errorMessage(error))
      throw error
    }
    const initial = record(response.receipt)
    if (!initial || !['missing', 'pending', 'done', 'failed'].includes(String(initial.state))) throw new Error('季华页面返回的请求回执格式无效。')
    let value: unknown
    try {
      value = await waitForReceipt(requestId, requestTimeoutMs, {
        state: initial.state as RemoteReceipt['state'],
        ...(Object.hasOwn(initial, 'value') ? { value: initial.value } : {}),
        ...(typeof initial.error === 'string' ? { error: initial.error.slice(0, 500) } : {}),
      })
    } finally {
      // A read may finish before the injection reply is serialized. Consume its final receipt
      // once so the MAIN page can discard the now-unneeded response payload.
      if (method === 'GET' && (initial.state === 'done' || initial.state === 'failed')) {
        try { await sendReceipt(requestId) } catch { /* The read value or error is already known. */ }
      }
    }
    return value
  }

  function canRetryRead(error: unknown): boolean {
    return error instanceof RetryableReadError
  }

  async function requestWithReadRetry(path: string, body: unknown, initialRequestId: string): Promise<unknown> {
    let requestId = initialRequestId
    for (let attempt = 0; attempt <= MAX_READ_RETRIES; attempt++) {
      try { return await requestOnce(path, 'GET', body, requestId) }
      catch (error) {
        if (attempt === MAX_READ_RETRIES || !canRetryRead(error)) throw error
        requestId = crypto.randomUUID()
      }
    }
    throw new Error('季华读取没有取得回执。')
  }

  async function uploadOnce(file: File, material: Material, requestId: string, beforeSend: () => Promise<void>): Promise<unknown> {
    const release = await byteBudget.acquire(file.size)
    let mayDiscardStage = true
    try {
      const chunkCount = Math.ceil(file.size / CHUNK_SIZE)
      const metadata = {
        requestId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        appendixType: material.appendixType,
        ...(material.ofcType ? { ofcType: material.ofcType } : {}),
        chunkSize: CHUNK_SIZE,
        chunkCount,
      }
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
        ensureActive()
        const offset = chunkIndex * CHUNK_SIZE
        const bytes = new Uint8Array(await waitWhileActive(readBlob(file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size)))))
        const base64 = toBase64(bytes)
        let acknowledged = false
        let lastError: unknown
        for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES && !acknowledged; attempt++) {
          try {
            const reply = assertOk(await sendWhileActive(command('stageChunk', { ...metadata, chunkIndex, offset, base64 })))
            if (reply.receivedBytes !== offset + bytes.length) throw new Error('季华页面返回的分块确认长度不匹配。')
            acknowledged = true
          } catch (error) {
            if (stopped) throw stoppedError()
            lastError = error
          }
        }
        if (!acknowledged) throw new Error(`文件分块暂存失败：${errorMessage(lastError)}`)
      }

      // Persist the sent checkpoint only after all bytes are staged and before starting multipart fetch.
      ensureActive()
      await waitWhileActive(Promise.resolve().then(() => {
        ensureActive()
        return beforeSend()
      }))
      ensureActive()
      mayDiscardStage = false
      let initial: RemoteReceipt | undefined
      try {
        initial = parseReceipt(await sendWhileActive(command('startUpload', metadata)))
      } catch (error) {
        if (stopped) throw stoppedError()
        // The MAIN page deduplicates startUpload by requestId; inspect the receipt without replaying the POST.
        const receipt = await sendReceipt(requestId)
        if (receipt.state === 'missing') {
          mayDiscardStage = true
          throw error
        }
        initial = receipt
      }
      return await waitForReceipt(requestId, uploadTimeoutMs, initial)
    } finally {
      if (mayDiscardStage) {
        if (stopped) {
          try {
            void Promise.resolve(send(command('discardStage', { requestId }))).catch(() => {})
          } catch { /* Local page cleanup is best effort. */ }
        } else {
          try { await sendWhileActive(command('discardStage', { requestId })) } catch { /* Local page cleanup is best effort. */ }
        }
      }
      release()
    }
  }

  const transport: JihuaTransport = {
    session,
    stopWaiting,
    async checkSession(): Promise<void> {
      const result = assertOk(await sendWhileActive(command('checkSession')))
      if (result.sessionKey !== session.key) throw new Error('季华 OA 登录账号已变化，请确认账号后再继续。')
    },
    request(path, method = 'GET', body, requestId): Promise<unknown> {
      const actualRequestId = requestId ?? (method === 'GET' ? crypto.randomUUID() : '')
      if (!actualRequestId || actualRequestId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(actualRequestId)) {
        return Promise.reject(new Error('写入季华台账必须有有效 request id。'))
      }
      if (method !== 'GET' && method !== 'POST') return Promise.reject(new Error('季华 API 方法不在允许范围内。'))
      const fingerprint = payloadIdentity([path, method, body])
      return runOnce(actualRequestId, fingerprint, method === 'POST', () => method === 'GET'
        ? requestWithReadRetry(path, body, actualRequestId)
        : requestOnce(path, method, body, actualRequestId))
    },
    upload(file, material, requestId, beforeSend): Promise<unknown> {
      if (!requestId || requestId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(requestId)) {
        return Promise.reject(new Error('上传季华附件必须有有效 request id。'))
      }
      if (!Number.isSafeInteger(file.size) || file.size <= 0) return Promise.reject(new Error('无法上传空文件或大小无效的文件。'))
      if (file.size > MAX_FILE_BYTES) return Promise.reject(new Error('文件超过当前本地暂存上限 256 MiB，请拆分材料或通过季华原站上传。'))
      const fingerprint = payloadIdentity([file.name, file.type, file.size, material.appendixType, material.ofcType ?? ''])
      return runOnce(requestId, fingerprint, true, () => uploadOnce(file, material, requestId, beforeSend))
    },
    async receipt(requestId: string): Promise<RemoteReceipt> {
      if (!requestId || requestId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(requestId)) throw new Error('请求编号无效。')
      return sendReceipt(requestId)
    },
    async acknowledge(requestId: string): Promise<void> {
      if (!requestId || requestId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(requestId)) throw new Error('请求编号无效。')
      const local = operations.get(requestId)
      if (local && (!local.write || !local.settled)) throw new Error('写入结果尚未完成或尚未持久化，不能清理回执。')
      const result = assertOk(await sendWhileActive(command('ackReceipt', { requestId })))
      if (result.acknowledged !== true) throw new Error('季华页面没有确认清理已持久化的请求回执。')
      if (local && operations.get(requestId) === local) operations.delete(requestId)
    },
  }
  return transport
}

function sendRuntime(command: JihuaCommand): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      reject(new Error('浏览器扩展消息通道不可用。'))
      return
    }
    chrome.runtime.sendMessage(command, response => {
      if (chrome.runtime.lastError) reject(new Error('季华扩展后台没有返回；请稍后重试并先核对页面回执。'))
      else resolve(response)
    })
  })
}

export async function listJihuaTabs(): Promise<Array<{ id: number; title: string }>> {
  const response = assertOk(await sendRuntime({ channel: JIHUA_CHANNEL, action: 'listTabs' }))
  if (!Array.isArray(response.tabs)) throw new Error('季华 OA 标签页列表格式无效。')
  return response.tabs.flatMap(item => {
    const tab = record(item)
    if (!tab || !Number.isSafeInteger(tab.id) || typeof tab.title !== 'string') return []
    return [{ id: tab.id as number, title: tab.title.slice(0, 500) }]
  })
}

export async function connectJihuaTab(tabId: number): Promise<JihuaTransport> {
  if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error('季华 OA 标签页编号无效。')
  const response = assertOk(await sendRuntime({ channel: JIHUA_CHANNEL, action: 'connect', tabId }))
  const value = record(response.session)
  if (!value || typeof value.key !== 'string' || !/^[a-f0-9]{64}$/i.test(value.key) || value.tabId !== tabId ||
      typeof value.documentId !== 'string' || !value.documentId || typeof value.title !== 'string' ||
      typeof response.binding !== 'string') throw new Error('季华 OA 会话信息格式无效。')
  const session: JihuaSession = {
    key: value.key,
    tabId,
    documentId: value.documentId,
    title: value.title,
  }
  return createJihuaTransport(session, sendRuntime, { binding: response.binding })
}

export type { Material, RemoteReceipt }
