import type { FeeSearchRow } from '../../api/fee-search-types'
import type { BillInfo } from '../../billing/fee-model'
import type { BillingOptions, BillingTemplateId } from '../../billing/templates'

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
      blockCount: number
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
