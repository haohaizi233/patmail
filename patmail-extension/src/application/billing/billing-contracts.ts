import type { FeeSearchRow } from '../../api/fee-search-types'
import type { BillInfo } from '../../billing/fee-model'
import type { BillingOptions, BillingTemplateId } from '../../billing/templates'

export interface BatchExportItemOutcome {
  customer: string
  status: 'generated' | 'download_started' | 'download_completed' | 'download_interrupted' | 'unknown' | 'failed'
  fileName: string
  savedFileName?: string
  blockCount: number
  warnings: string[]
  reason?: string
}

export interface BatchExportProgress {
  done: number
  total: number
  currentCustomer: string
}

/**
 * 明确区分请款工作簿生成结果与浏览器下载终态，
 * 避免无法核验终态的 `<a download>` 触发被误报为已完成落盘。
 */
export type ExportOutcome =
  | {
      status: 'generated'
      bytes: Uint8Array
      fileName: string
      blockCount: number
      warnings: string[]
    }
  | {
      status: 'download_started'
      downloadId?: number
      fileName: string
      blockCount: number
      warnings: string[]
    }
  | {
      status: 'download_completed'
      downloadId: number
      fileName: string
      savedFileName?: string
      blockCount: number
      warnings: string[]
    }
  | {
      status: 'batch_completed'
      totalCount: number
      successCount: number
      failedCount: number
      blockCount: number
      items: BatchExportItemOutcome[]
      warnings: string[]
    }
  | { status: 'download_interrupted'; reason: string }
  | { status: 'unknown'; reason: string; downloadId?: number }
  | { status: 'failed'; reason: string }

export interface PctExceptionItem {
  row: FeeSearchRow
  reason: string
}

export interface ReconciliationSummary {
  totalRows: number
  totalCases: number
  unrequestedCount: number
  requestedCount: number
  matchedCasesCount: number
  unmatchedCases: string[]
}

export interface BillingExportParameters {
  headers: Record<string, string>
  options: BillingOptions
  rates: Record<string, number>
  rateSourceUrl: string
  rateDate: string
  /** 是否允许不同客户合并进入同一张表（默认 false，按客户分表导出）。 */
  allowMixedCustomers?: boolean
}

export interface ExportBillingCommand {
  templateId: BillingTemplateId
  rows: FeeSearchRow[]
  bills: Record<string, BillInfo[]>
  parameters: BillingExportParameters
  fileSelectionIssue: string
  feeSelectionIssue: string
  reconciliationRequestedCount: number
  confirmExistingFees: boolean
  pctExportExceptionsCount: number
  confirmPctExceptions: boolean
  needsForeignRates: boolean
  ratesCheckedOn: string
  ratesLoading: boolean
  missingRateCodes: string[]
  usesManualRate: boolean
  manualRateDate: string
  today?: Date
  /** 多客户分表流水线并发度（默认 4）。 */
  concurrency?: number
  /** 多客户分表流水线进度回调。 */
  onProgress?: (progress: BatchExportProgress) => void
  /** Account scope used to associate a browser download with this export. */
  downloadScope?: string
  /** 生成工作簿期间由调用方检测范围、账号或确认态是否已变化。 */
  isStale?: () => boolean
}

export interface BillingDeskSnapshot {
  version: 1
  template: BillingTemplateId
  step: 1 | 2 | 3
  headers: Record<string, string>
  options: BillingOptions
  allowMixedCustomers?: boolean
  extra: string[]
  excluded: string[]
  volumeInput: string
  bills: Record<string, BillInfo[]>
  syncKey: string
  rates: Record<string, number>
  clearedRates: Record<string, boolean>
  rateDate: string
  fees?: unknown
}
