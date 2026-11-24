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
import { browserDownloadName } from '../../shared/download-file-name'

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

class DownloadNotDispatchedError extends Error {
  readonly notDispatched = true
}

function clickNamedDownload(url: string, fileName: string): void {
  let clicked = false
  let link: HTMLAnchorElement | undefined
  try {
    link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    clicked = true
    link.click()
  } catch (error) {
    if (!clicked) {
      throw error instanceof DownloadNotDispatchedError
        ? error
        : new DownloadNotDispatchedError(error instanceof Error ? error.message : '浏览器未能发起下载。')
    }
    throw error
  } finally {
    link?.remove()
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
      try {
        clickNamedDownload(url, request.fileName)
      } finally {
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
  search(query: { id?: number; url?: string }): Promise<Array<{
    id?: number
    state: 'in_progress' | 'interrupted' | 'complete'
    error?: string
    filename?: string
  }>>
  onChanged?: {
    addListener(callback: (delta: ChromeDownloadDelta) => void): void
    removeListener(callback: (delta: ChromeDownloadDelta) => void): void
  }
}

export interface VerifiedDownloadOptions {
  settleTimeoutMs?: number
}

const DEFAULT_DOWNLOAD_SETTLE_TIMEOUT_MS = 15_000

async function readDownloadItem(verifier: ChromeDownloadsVerifier, id: number) {
  let timer: number | undefined
  try {
    return await Promise.race([
      verifier.search({ id }).then(items => items[0]),
      new Promise<undefined>(resolve => { timer = window.setTimeout(resolve, 750) }),
    ])
  } catch {
    return undefined
  } finally {
    window.clearTimeout(timer)
  }
}

function terminalOutcomeFromState(
  state: string,
  request: BillingDownloadRequest,
  downloadId: number,
  errorText?: string,
  savedFileName?: string,
): ExportOutcome | null {
  if (state === 'complete') {
    return {
      status: 'download_completed',
      downloadId,
      fileName: request.fileName,
      ...(savedFileName ? { savedFileName } : {}),
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
    typeof chrome.downloads?.search !== 'function' ||
    !chrome.downloads.onCreated ||
    typeof document === 'undefined'
  ) {
    return null
  }
  return {
    download: ({ url, filename }) => new Promise((resolve, reject) => {
      // A named DOM download preserves the suggested name for an extension-page Blob.
      // The fresh object URL identifies this one download independently of its filename.
      const created = chrome.downloads.onCreated
      const cleanup = () => {
        clearTimeout(timer)
        created.removeListener(onCreated)
      }
      const onCreated = (item: chrome.downloads.DownloadItem) => {
        if (item.url !== url) return
        cleanup()
        resolve(item.id)
      }
      const timer = setTimeout(() => {
        cleanup()
        void chrome.downloads.search({ url }).then(
          items => {
            const matched = items[0]
            if (matched && typeof matched.id === 'number') {
              resolve(matched.id)
              return
            }
            reject(new Error('浏览器未返回下载编号。'))
          },
          () => {
            reject(new Error('浏览器未返回下载编号。'))
          },
        )
      }, DEFAULT_DOWNLOAD_SETTLE_TIMEOUT_MS)
      let dispatched = false
      try {
        created.addListener(onCreated)
        dispatched = true
        clickNamedDownload(url, filename)
      } catch (error) {
        cleanup()
        if (!dispatched || error instanceof DownloadNotDispatchedError) {
          reject(
            error instanceof DownloadNotDispatchedError
              ? error
              : new DownloadNotDispatchedError(error instanceof Error ? error.message : '浏览器未能发起下载。'),
          )
          return
        }
        reject(error instanceof Error ? error : new Error('浏览器未能发起下载。'))
      }
    }),
    search: async query => {
      const items = await chrome.downloads.search(query)
      return items.map(item => ({
        id: item.id,
        state: item.state,
        filename: item.filename,
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
            terminalOutcomeFromState(item.state, request, activeId, item.error, browserDownloadName(item.filename)) ?? {
              status: 'download_started',
              downloadId: activeId,
              fileName: request.fileName,
              blockCount: request.blockCount,
              warnings: request.warnings,
            }
          )
        }

        const outcome = await new Promise<ExportOutcome>(resolve => {
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
                const terminal = terminalOutcomeFromState(item.state, request, activeId, item.error, browserDownloadName(item.filename))
                if (terminal) finish(terminal)
              },
              () => undefined,
            )
        })
        if (outcome.status === 'download_completed' && !outcome.savedFileName) {
          const savedFileName = browserDownloadName((await readDownloadItem(verifier, activeId))?.filename)
          if (savedFileName) return { ...outcome, savedFileName }
        }
        return outcome
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

async function ledgerKey(scope: string, parameters: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parameters))
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return JSON.stringify(['phase3-download', scope, fingerprint])
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
      const key = await ledgerKey(job.scope, job.parameters)
      const legacyKeys = [...new Set(await Promise.all((job.legacyParameters ?? []).map(p => ledgerKey(job.scope, p))))].filter(
        k => k !== key,
      )
      return storage.lock(key, async () => {
        const unknown = (id?: number): ExportOutcome => ({
          status: 'unknown',
          ...(id === undefined ? {} : { downloadId: id }),
          reason: '这份请款表已有待确认的下载，请先核对浏览器下载记录。',
        })
        let priorKey = key
        let prior: BillingDownloadRecord | null
        try {
          prior = downloadRecord(await storage.get(key))
        } catch {
          return { status: 'failed', reason: '无法读取请款下载账本，未发起下载。' }
        }
        if (job.isStale?.()) return { status: 'failed', reason: '请款范围或账号已变化，未发起下载。' }
        const isReusableCompleted = async (record: BillingDownloadRecord | null): Promise<ExportOutcome | null> => {
          if (record?.state !== 'completed' || record.id === undefined || Date.now() - record.at >= 86_400_000) {
            return null
          }
          const item = await readDownloadItem(verifier, record.id)
          const savedName = browserDownloadName(item?.filename)
          // An explicit export click can replace a completed legacy receipt whose Blob UUID became the filename.
          if (!savedName || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?: \(\d+\))?\.xlsx$/i.test(savedName)) {
            return terminalOutcomeFromState('complete', request, record.id, undefined, savedName) ?? unknown(record.id)
          }
          return null
        }
        const reusableOutcome = await isReusableCompleted(prior)
        if (reusableOutcome) return reusableOutcome

        if (!prior || prior.state === 'cancelled' || prior.state === 'interrupted' || prior.state === 'completed') {
          for (const legacyKey of legacyKeys) {
            let legacyRecord: BillingDownloadRecord | null = null
            try {
              legacyRecord = downloadRecord(await storage.get(legacyKey))
            } catch {
              continue
            }
            if (!legacyRecord) continue
            const legacyCompleted = await isReusableCompleted(legacyRecord)
            if (legacyCompleted) {
              await storage.put(key, legacyRecord).catch(() => undefined)
              return legacyCompleted
            }
            if (legacyRecord.state === 'requested' || legacyRecord.state === 'started') {
              prior = legacyRecord
              priorKey = legacyKey
              break
            }
          }
        }
        if (prior?.state === 'requested' || prior?.state === 'started') {
          if (prior.id === undefined) return unknown()
          const id = prior.id
          try {
            const [item] = await verifier.search({ id })
            const terminal = item && terminalOutcomeFromState(item.state, request, id, item.error, browserDownloadName(item.filename))
            if (!terminal) return unknown(id)
            const settledRecord: BillingDownloadRecord = {
              state: item.state === 'complete' ? 'completed' : 'interrupted',
              id,
              at: Date.now(),
            }
            await storage.put(priorKey, settledRecord)
            if (priorKey !== key) await storage.put(key, settledRecord).catch(() => undefined)
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
        let dispatchAttempted = false
        let notDispatched = false
        const tracked = createVerifiedChromeDownloadAdapter({
          ...verifier,
          async download(options) {
            if (job.isStale?.()) {
              notDispatched = true
              throw new DownloadNotDispatchedError('请款范围或账号已变化，未发起下载。')
            }
            dispatchAttempted = true
            try {
              id = await verifier.download(options)
            } catch (error) {
              if (
                error instanceof DownloadNotDispatchedError ||
                (typeof error === 'object' && error !== null && 'notDispatched' in error && error.notDispatched === true)
              ) {
                notDispatched = true
              }
              throw error
            }
            await storage.put(key, { state: 'started', id, at: Date.now() }).catch(() => undefined)
            return id
          },
        })
        const result = await tracked.download(request)
        if (notDispatched || !dispatchAttempted) {
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
