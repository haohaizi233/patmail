import type { FeeSearchRow } from '../../api/fee-search-types'
import {
  billInfoFromFile,
  isMideaPctCustomer,
  isPctCase,
  isUnrequestedFee as checkUnrequestedFee,
  matchedBillDate,
  missingCurrencies,
  pctFeeProblem,
  pctSelectionProblem,
  sortFeeRows as orderFeeRows,
  type BillInfo,
} from '../../billing/fee-model'
import { normalizeCurrency } from '../../billing/pbc-rates'
import { BILLING_TEMPLATES, formatLocalDate, mideaForeignGroups, type BillingTemplateId } from '../../billing/templates'
import type { SelectedPatentFile } from '../../mail/types'
import type { ExportBillingCommand, PctExceptionItem, ReconciliationSummary } from './billing-contracts'

export function isUnrequestedFee(row: FeeSearchRow): boolean {
  return checkUnrequestedFee(row)
}

export function sortFeeRows(rows: FeeSearchRow[]): FeeSearchRow[] {
  return orderFeeRows(rows)
}

export function buildBillingSyncKey(templateId: BillingTemplateId, activeVolumes: readonly string[]): string {
  return `${templateId}\u0001${[...activeVolumes].sort().join('\n')}`
}

export function extractBillMapFromFiles(
  fileSelection: Record<string, SelectedPatentFile>,
  recoveredBills: Record<string, BillInfo[]>,
): Record<string, BillInfo[]> {
  if (!Object.keys(fileSelection).length) return recoveredBills
  const result: Record<string, BillInfo[]> = {}
  for (const file of Object.values(fileSelection)) {
    const bill = billInfoFromFile(file)
    if (!bill || !bill.caseVolume) continue
    if (!result[bill.caseVolume]) result[bill.caseVolume] = []
    result[bill.caseVolume].push(bill)
  }
  return result
}

export function computeActiveCaseVolumes(
  autoExtractedVolumes: readonly string[],
  extraVolumes: readonly string[],
  excludedVolumes: readonly string[],
): string[] {
  const excluded = new Set(excludedVolumes)
  const set = new Set<string>([...autoExtractedVolumes, ...extraVolumes])
  return [...set].filter(vol => Boolean(vol) && !excluded.has(vol))
}

export function collectPctCandidates(knownRows: readonly FeeSearchRow[]): Map<string, FeeSearchRow[]> {
  const candidates = new Map<string, FeeSearchRow[]>()
  for (const row of knownRows) {
    if (!isMideaPctCustomer(row.customerName) || !isUnrequestedFee(row) || pctFeeProblem(row)) continue
    const name = row.customerName.trim()
    const rows = candidates.get(name) ?? []
    rows.push(row)
    candidates.set(name, rows)
  }
  return candidates
}

export function collectPctExceptions(knownRows: readonly FeeSearchRow[]): PctExceptionItem[] {
  return knownRows.flatMap(row => {
    if (
      !isPctCase(row) ||
      !isUnrequestedFee(row) ||
      (row.customerName.trim() && !isMideaPctCustomer(row.customerName))
    ) {
      return []
    }
    const reason = pctFeeProblem(row) || (row.customerName.trim() ? '' : 'EASY 客户名称缺失')
    return reason ? [{ row, reason }] : []
  })
}

export function filterPctExportExceptions(
  exceptions: readonly PctExceptionItem[],
  selectedCustomer: string,
): PctExceptionItem[] {
  if (!selectedCustomer) return []
  return exceptions.filter(
    ({ row }) => !row.customerName.trim() || row.customerName.trim() === selectedCustomer,
  )
}

export function computeEffectiveExchangeRates(
  pbcPerCny: Record<string, number>,
  customRates: Record<string, number>,
  clearedRates: Record<string, boolean>,
): Record<string, number> {
  const out: Record<string, number> = { CNY: 1 }
  for (const [code, val] of Object.entries(pbcPerCny)) {
    if (!clearedRates[code] && Number.isFinite(val) && val > 0) out[code] = val
  }
  for (const [code, val] of Object.entries(customRates)) {
    if (!clearedRates[code] && Number.isFinite(val) && val > 0) out[code] = val
  }
  return out
}

export function collectInvolvedCurrencies(rows: readonly FeeSearchRow[]): string[] {
  const codes = new Set<string>()
  for (const row of rows) {
    const c = normalizeCurrency(row.currency)
    if (c) codes.add(c)
  }
  for (const c of ['USD', 'EUR', 'JPY', 'GBP', 'CHF', 'HKD']) codes.add(c)
  return [...codes].filter(c => c !== 'CNY')
}

export function hasForeignCurrencyRows(rows: readonly FeeSearchRow[]): boolean {
  return rows.some(row => normalizeCurrency(row.currency) !== 'CNY')
}

export function findMissingRates(rows: FeeSearchRow[], effectiveRates: Record<string, number>): string[] {
  return missingCurrencies(rows, effectiveRates)
}

export function computeBillingReconciliation(
  templateId: BillingTemplateId,
  selectedFeeRows: FeeSearchRow[],
  billMap: Record<string, BillInfo[]>,
): ReconciliationSummary {
  const caseSet = new Set<string>()
  let unrequestedCount = 0
  let requestedCount = 0
  for (const row of selectedFeeRows) {
    if (row.caseVolume) caseSet.add(row.caseVolume)
    if (isUnrequestedFee(row)) unrequestedCount++
    else requestedCount++
  }
  const allCases = [...caseSet]
  const matchedCases: string[] = []
  const unmatchedCases: string[] = []
  const mideaGroups = templateId === 'midea-foreign' ? mideaForeignGroups(selectedFeeRows) : null
  for (const vol of allCases) {
    const groups = mideaGroups?.filter(group => group.caseVolume === vol)
    if (
      groups
        ? groups.length && groups.every(group => matchedBillDate(group, billMap[vol]))
        : billMap[vol]?.length
    ) {
      matchedCases.push(vol)
    } else {
      unmatchedCases.push(vol)
    }
  }
  return {
    totalRows: selectedFeeRows.length,
    totalCases: allCases.length,
    unrequestedCount,
    requestedCount,
    matchedCasesCount: matchedCases.length,
    unmatchedCases,
  }
}

export function validateBillingFeeSelection(input: {
  selectionPending: boolean
  selectionIncomplete: boolean
  selectedCount: number
  ready: boolean
  syncKeyMatches: boolean
  isMideaPct: boolean
  selectedFeeRows: FeeSearchRow[]
}): string {
  if (input.selectionPending) return '费用还在读取，请等待完成。'
  if (input.selectionIncomplete) return '费用查询未完成，请返回步骤 2 重试或重新查询。'
  if (!input.selectedCount) return '步骤 2 还没有勾选费用。请先在费用查询表格中勾选要请款的费用行。'
  if (!input.ready) return '请先确认 EASY 登录会话。'
  if (!input.syncKeyMatches) return '请款范围已变化，请返回步骤 2 重新查询。'
  return input.isMideaPct ? pctSelectionProblem(input.selectedFeeRows) : ''
}

export function buildMideaPctDefaultExclusion(isMideaPct: boolean): ((row: FeeSearchRow) => string) | undefined {
  if (!isMideaPct) return undefined
  return (row: FeeSearchRow) => {
    if (!row.customerName.trim()) return '客户名称缺失'
    if (!isMideaPctCustomer(row.customerName)) return '不属于美的客户'
    return pctFeeProblem(row)
  }
}

export function isValidBillingTemplateId(id: string): id is BillingTemplateId {
  return BILLING_TEMPLATES.some(item => item.id === id)
}

export function validateBillingExportPreconditions(
  command: ExportBillingCommand,
): { ok: true } | { ok: false; needsRateRefresh?: boolean; reason: string } {
  const issue = command.fileSelectionIssue || command.feeSelectionIssue
  if (issue) return { ok: false, reason: issue }
  if (command.reconciliationRequestedCount && !command.confirmExistingFees) {
    return { ok: false, reason: '请确认已立单或状态待核对的费用后再导出。' }
  }
  if (command.pctExportExceptionsCount && !command.confirmPctExceptions) {
    return { ok: false, reason: '请先核对本客户待处理的 PCT 费用。' }
  }
  const todayText = formatLocalDate(command.today)
  if (command.needsForeignRates && command.ratesCheckedOn !== todayText) {
    return {
      ok: false,
      needsRateRefresh: true,
      reason: '已开始刷新汇率，请等待完成后再导出。',
    }
  }
  if (command.ratesLoading) {
    return { ok: false, reason: '' }
  }
  if (command.missingRateCodes.length) {
    return {
      ok: false,
      reason: `缺少以下币种的汇率：${command.missingRateCodes.join('、')}，请重试或手工填写。`,
    }
  }
  if (command.usesManualRate && (!command.manualRateDate || command.manualRateDate > todayText)) {
    return { ok: false, reason: '请填写有效的手工汇率基准日期。' }
  }
  return { ok: true }
}
