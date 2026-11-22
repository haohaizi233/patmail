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

export interface ChromeDownloadsVerifier {
  download(options: { url: string; filename: string; saveAs?: boolean }): Promise<number>
  search(query: { id: number }): Promise<Array<{ state: 'in_progress' | 'interrupted' | 'complete'; error?: string }>>
}

/**
 * 可验证终态的 Chrome Downloads 适配器：仅在查询到终态 `complete` 时才返回 `download_completed`。
 */
export function createVerifiedChromeDownloadAdapter(verifier: ChromeDownloadsVerifier): DownloadPort {
  return {
    async download(request: BillingDownloadRequest): Promise<ExportOutcome> {
      const blob = new Blob([request.bytes as BlobPart], { type: request.mimeType })
      const url = URL.createObjectURL(blob)
      let downloadId: number | undefined
      try {
        downloadId = await verifier.download({ url, filename: request.fileName, saveAs: false })
        const items = await verifier.search({ id: downloadId })
        const item = items[0]
        if (!item) {
          return { status: 'unknown', downloadId, reason: '未在浏览器下载记录中查询到刚发起的导出任务。' }
        }
        if (item.state === 'complete') {
          return {
            status: 'download_completed',
            downloadId,
            fileName: request.fileName,
            blockCount: request.blockCount,
            warnings: request.warnings,
          }
        }
        if (item.state === 'interrupted') {
          return {
            status: 'download_interrupted',
            reason: item.error ? `下载中断：${item.error}` : '浏览器下载已中断，请重试。',
          }
        }
        return {
          status: 'download_started',
          downloadId,
          fileName: request.fileName,
          blockCount: request.blockCount,
          warnings: request.warnings,
        }
      } catch (err) {
        if (downloadId !== undefined) {
          return { status: 'unknown', downloadId, reason: '浏览器已接收导出任务，暂时无法核对下载结果。' }
        }
        return {
          status: 'failed',
          reason: err instanceof Error ? err.message : '浏览器下载发起失败',
        }
      } finally {
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

export function createDefaultBillingService(): BillingApplicationService {
  return new BillingApplicationService({
    templates: createBillingTemplateAdapter(),
    spreadsheet: createBillingSpreadsheetAdapter(),
    exchangeRates: createPbcExchangeRateAdapter(),
    downloads: createBrowserBlobDownloadAdapter(),
    recovery: createBillingRecoveryAdapter(),
  })
}
