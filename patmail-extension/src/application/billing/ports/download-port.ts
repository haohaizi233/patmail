import type { ExportOutcome } from '../billing-contracts'

export interface BillingDownloadRequest {
  bytes: Uint8Array
  fileName: string
  mimeType: string
  blockCount: number
  warnings: string[]
  job?: { scope: string; parameters: string; isStale?: () => boolean }
}

/** 文件导出与下载交接端口。支持终态核验的适配器应返回 download_completed / interrupted。 */
export interface DownloadPort {
  download(request: BillingDownloadRequest): Promise<ExportOutcome>
}
