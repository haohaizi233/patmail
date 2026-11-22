import type { BillingDeskSnapshot, ExportOutcome } from '../../application/billing/billing-contracts'
import { BillingApplicationService } from '../../application/billing/billing-service'
import type { BillingRecoveryPort } from '../../application/billing/ports/billing-recovery-port'
import type { BillingTemplatePort } from '../../application/billing/ports/billing-template-port'
import type { BillingDownloadRequest, DownloadPort } from '../../application/billing/ports/download-port'
import type { ExchangeRatePort } from '../../application/billing/ports/exchange-rate-port'
import type { SpreadsheetPort } from '../../application/billing/ports/spreadsheet-port'
import { fetchPbcRates } from '../../billing/pbc-rates'
import { loadBillingTemplate } from '../../billing/template-assets'
import { fillBillingTemplate } from '../../billing/templates'
import { createRecoveryClient } from '../../recovery/client'

export function createBillingTemplateAdapter(): BillingTemplatePort {
  return {
    loadTemplate: id => loadBillingTemplate(id),
  }
}

export function createBillingSpreadsheetAdapter(): SpreadsheetPort {
  return {
    fill: (templateId, templateBytes, input) => fillBillingTemplate(templateId, templateBytes, input),
  }
}

export function createPbcExchangeRateAdapter(): ExchangeRatePort {
  return {
    fetchRates: () => fetchPbcRates(),
  }
}

/**
 * 浏览器 DOM `<a download>` 触发器：只能确认已把 Blob 交给浏览器接管，
 * 无法核验磁盘写入终态，因此明确返回 `download_started` 而非 `download_completed`。
 */
export function createBrowserBlobDownloadAdapter(): DownloadPort {
  return {
    download(request: BillingDownloadRequest): Promise<ExportOutcome> {
      const blob = new Blob([request.bytes as BlobPart], { type: request.mimeType })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = request.fileName
      try {
        document.body.appendChild(link)
        link.click()
      } finally {
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
      }
      return Promise.resolve({
        status: 'download_started',
        fileName: request.fileName,
        blockCount: request.blockCount,
        warnings: request.warnings,
      })
    },
  }
}

export interface ChromeDownloadDelta {
  id: number
  state?: { current?: string }
  error?: { current?: string }
}

export interface ChromeDownloadsVerifier {
  download(options: { url: string; filename: string; saveAs?: boolean }): Promise<number>
  search(query: { id: number }): Promise<Array<{ state: 'in_progress' | 'interrupted' | 'complete'; error?: string }>>
  onChanged?: {
    addListener(callback: (delta: ChromeDownloadDelta) => void): void
    removeListener(callback: (delta: ChromeDownloadDelta) => void): void
  }
}

export interface VerifiedDownloadOptions {
  settleTimeoutMs?: number
}

const DEFAULT_DOWNLOAD_SETTLE_TIMEOUT_MS = 15_000

function terminalOutcomeFromState(
  state: string,
  request: BillingDownloadRequest,
  downloadId: number,
  errorText?: string,
): ExportOutcome | null {
  if (state === 'complete') {
    return {
      status: 'download_completed',
      downloadId,
      fileName: request.fileName,
      blockCount: request.blockCount,
      warnings: request.warnings,
    }
  }
  if (state === 'interrupted') {
    return {
      status: 'download_interrupted',
      reason: errorText ? `下载中断：${errorText}` : '浏览器下载已中断，请重试。',
    }
  }
  return null
}

/**
 * 构建 Chrome Downloads 校验器：在扩展运行时包装 chrome.downloads 及其 onChanged 事件。
 */
export function createChromeExtensionDownloadsVerifier(): ChromeDownloadsVerifier | null {
  if (
    typeof chrome === 'undefined' ||
    typeof chrome.downloads?.download !== 'function' ||
    typeof chrome.downloads?.search !== 'function'
  ) {
    return null
  }
  return {
    download: options => chrome.downloads.download(options),
    search: async query => {
      const items = await chrome.downloads.search(query)
      return items.map(item => ({
        state: item.state,
        ...(item.error ? { error: String(item.error) } : {}),
      }))
    },
    ...(chrome.downloads.onChanged
      ? {
          onChanged: {
            addListener: cb => chrome.downloads.onChanged.addListener(cb),
            removeListener: cb => chrome.downloads.onChanged.removeListener(cb),
          },
        }
      : {}),
  }
}

/**
 * 可验证终态的 Chrome Downloads 适配器：
 * - 若提供 `onChanged`，在 `download()` 前注册监听并以 `search({ id })` 兜底消除快完成竞态
 * - 仅在确认终态 `complete` 时返回 `download_completed`，超时仍返回 `unknown`（保留 `downloadId`）
 */
export function createVerifiedChromeDownloadAdapter(
  verifier: ChromeDownloadsVerifier,
  options?: VerifiedDownloadOptions,
): DownloadPort {
  const settleTimeoutMs = Math.max(1, options?.settleTimeoutMs ?? DEFAULT_DOWNLOAD_SETTLE_TIMEOUT_MS)

  return {
    async download(request: BillingDownloadRequest): Promise<ExportOutcome> {
      const blob = new Blob([request.bytes as BlobPart], { type: request.mimeType })
      const url = URL.createObjectURL(blob)
      let downloadId: number | undefined
      let listener: ((delta: ChromeDownloadDelta) => void) | undefined
      let timer: ReturnType<typeof setTimeout> | undefined

      const cleanupWatchers = () => {
        if (timer !== undefined) {
          clearTimeout(timer)
          timer = undefined
        }
        if (listener && verifier.onChanged) {
          verifier.onChanged.removeListener(listener)
          listener = undefined
        }
      }

      try {
        const bufferedById = new Map<number, ChromeDownloadDelta>()
        let onLiveDelta: ((delta: ChromeDownloadDelta) => void) | undefined
        if (verifier.onChanged) {
          listener = delta => {
            const state = delta.state?.current
            if (state !== 'complete' && state !== 'interrupted') return
            if (downloadId === undefined) {
              bufferedById.set(delta.id, delta)
              return
            }
            if (delta.id === downloadId) onLiveDelta?.(delta)
          }
          verifier.onChanged.addListener(listener)
        }

        downloadId = await verifier.download({ url, filename: request.fileName, saveAs: false })
        const activeId = downloadId

        if (!verifier.onChanged) {
          const items = await verifier.search({ id: activeId })
          const item = items[0]
          if (!item) {
            return { status: 'unknown', downloadId: activeId, reason: '未在浏览器下载记录中查询到刚发起的导出任务。' }
          }
          return (
            terminalOutcomeFromState(item.state, request, activeId, item.error) ?? {
              status: 'download_started',
              downloadId: activeId,
              fileName: request.fileName,
              blockCount: request.blockCount,
              warnings: request.warnings,
            }
          )
        }

        return await new Promise<ExportOutcome>(resolve => {
          let settled = false
          const finish = (outcome: ExportOutcome) => {
            if (settled) return
            settled = true
            cleanupWatchers()
            resolve(outcome)
          }

          onLiveDelta = delta => {
            const state = delta.state?.current
            if (!state) return
            const outcome = terminalOutcomeFromState(state, request, activeId, delta.error?.current)
            if (outcome) finish(outcome)
          }

          const earlyDelta = bufferedById.get(activeId)
          if (earlyDelta) {
            onLiveDelta(earlyDelta)
            if (settled) return
          }

          timer = setTimeout(() => {
            finish({
              status: 'unknown',
              downloadId: activeId,
              reason: '等待浏览器下载终态超时，请在浏览器下载记录中核对结果。',
            })
          }, settleTimeoutMs)

          // search closes the early-completion race. If unavailable, the live event still
          // has until the deadline to confirm the result.
          void Promise.resolve()
            .then(() => verifier.search({ id: activeId }))
            .then(
              ([item]) => {
                if (settled || !item) return
                const terminal = terminalOutcomeFromState(item.state, request, activeId, item.error)
                if (terminal) finish(terminal)
              },
              () => undefined,
            )
        })
      } catch (err) {
        if (downloadId !== undefined) {
          return { status: 'unknown', downloadId, reason: '浏览器已接收导出任务，暂时无法核对下载结果。' }
        }
        return {
          status: 'failed',
          reason: err instanceof Error ? err.message : '浏览器下载发起失败',
        }
      } finally {
        cleanupWatchers()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
      }
    },
  }
}

export function createBillingRecoveryAdapter(): BillingRecoveryPort<BillingDeskSnapshot> {
  const recovery = createRecoveryClient()
  return {
    async load(scope: string): Promise<BillingDeskSnapshot | null> {
      const raw = await recovery.get('billing-desk', scope)
      if (!raw || typeof raw !== 'object') return null
      return raw as BillingDeskSnapshot
    },
    async save(scope: string, snapshot: BillingDeskSnapshot): Promise<void> {
      await recovery.put('billing-desk', scope, snapshot)
    },
  }
}

type BillingDownloadRecord = {
  state: 'requested' | 'started' | 'completed' | 'interrupted' | 'cancelled'
  id?: number
  at: number
}

export interface BillingDownloadTracking {
  get(key: string): Promise<unknown>
  put(key: string, record: BillingDownloadRecord): Promise<void>
  lock<T>(key: string, work: () => Promise<T>): Promise<T>
}

function downloadRecord(value: unknown): BillingDownloadRecord | null {
  if (value === null || value === undefined) return null
  if (
    typeof value !== 'object' ||
    !('state' in value) ||
    !('at' in value) ||
    typeof value.at !== 'number' ||
    (value.state !== 'requested' &&
      value.state !== 'started' &&
      value.state !== 'completed' &&
      value.state !== 'interrupted' &&
      value.state !== 'cancelled')
  ) {
    throw new Error('下载恢复记录无效。')
  }
  const id = 'id' in value ? value.id : undefined
  if (
    value.state !== 'requested' &&
    value.state !== 'cancelled' &&
    (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0)
  ) {
    throw new Error('下载恢复编号无效。')
  }
  return { state: value.state, at: value.at, ...(typeof id === 'number' ? { id } : {}) }
}

/** Browser download IDs live across extension pages and service-worker restarts. */
export function createTrackedBillingDownloadAdapter(
  verifier: ChromeDownloadsVerifier,
  storage: BillingDownloadTracking,
): DownloadPort {
  const delegate = createVerifiedChromeDownloadAdapter(verifier)
  return {
    async download(request) {
      const job = request.job
      if (!job) return delegate.download(request)
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(job.parameters))
      const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      const key = JSON.stringify(['phase3-download', job.scope, fingerprint])
      return storage.lock(key, async () => {
        const unknown = (id?: number): ExportOutcome => ({
          status: 'unknown',
          ...(id === undefined ? {} : { downloadId: id }),
          reason: '这份请款表已有待确认的下载，请先核对浏览器下载记录。',
        })
        let prior: BillingDownloadRecord | null
        try {
          prior = downloadRecord(await storage.get(key))
        } catch {
          return { status: 'failed', reason: '无法读取请款下载账本，未发起下载。' }
        }
        if (job.isStale?.()) return { status: 'failed', reason: '请款范围或账号已变化，未发起下载。' }
        if (prior?.state === 'completed' && prior.id !== undefined && Date.now() - prior.at < 86_400_000) {
          return terminalOutcomeFromState('complete', request, prior.id) ?? unknown(prior.id)
        }
        if (prior?.state === 'requested' || prior?.state === 'started') {
          if (prior.id === undefined) return unknown()
          const id = prior.id
          try {
            const [item] = await verifier.search({ id })
            const terminal = item && terminalOutcomeFromState(item.state, request, id, item.error)
            if (!terminal) return unknown(id)
            await storage.put(key, {
              state: item.state === 'complete' ? 'completed' : 'interrupted',
              id,
              at: Date.now(),
            })
            return terminal
          } catch {
            return unknown(id)
          }
        }
        try {
          await storage.put(key, { state: 'requested', at: Date.now() })
        } catch {
          return { status: 'failed', reason: '无法记录请款下载意图，未发起下载。' }
        }
        let id: number | undefined
        let notDispatched = false
        const tracked = createVerifiedChromeDownloadAdapter({
          ...verifier,
          async download(options) {
            if (job.isStale?.()) {
              notDispatched = true
              throw new Error('请款范围或账号已变化，未发起下载。')
            }
            id = await verifier.download(options)
            await storage.put(key, { state: 'started', id, at: Date.now() }).catch(() => undefined)
            return id
          },
        })
        const result = await tracked.download(request)
        if (notDispatched) {
          // Only release an intent when this page can prove the call never happened.
          await storage.put(key, { state: 'cancelled', at: Date.now() }).catch(() => undefined)
          return result
        }
        if (id !== undefined && (result.status === 'download_completed' || result.status === 'download_interrupted')) {
          await storage
            .put(key, {
              state: result.status === 'download_completed' ? 'completed' : 'interrupted',
              id,
              at: Date.now(),
            })
            .catch(() => undefined)
        }
        return result.status === 'failed' ? unknown(id) : result
      })
    },
  }
}

export interface DefaultBillingServiceOverrides {
  downloads?: DownloadPort
  verifier?: ChromeDownloadsVerifier
  settleTimeoutMs?: number
}

export function createDefaultBillingService(overrides?: DefaultBillingServiceOverrides): BillingApplicationService {
  const verifier = createChromeExtensionDownloadsVerifier()
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  const recovery = createRecoveryClient()
  const downloads =
    overrides?.downloads ??
    (overrides?.verifier
      ? createVerifiedChromeDownloadAdapter(overrides.verifier, { settleTimeoutMs: overrides.settleTimeoutMs })
      : verifier && locks
        ? createTrackedBillingDownloadAdapter(verifier, {
            get: key => recovery.get('billing-desk', key),
            put: (key, record) => recovery.put('billing-desk', key, record),
            lock: (key, work) => locks.request(key, work),
          })
        : createBrowserBlobDownloadAdapter())
  return new BillingApplicationService({
    templates: createBillingTemplateAdapter(),
    spreadsheet: createBillingSpreadsheetAdapter(),
    exchangeRates: createPbcExchangeRateAdapter(),
    downloads,
    recovery: createBillingRecoveryAdapter(),
  })
}
