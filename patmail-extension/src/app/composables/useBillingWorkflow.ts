import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { createLeadingFrameCoalescer } from '../frame-coalesce'
import { toPlainCloneable } from '../plain-snapshot'
import type { FeeSearchRow } from '../../api/fee-search-types'
import type { BatchExportItemOutcome, BatchExportProgress, BillingDeskSnapshot } from '../../application/billing/billing-contracts'
import {
  BillingApplicationService,
  formatExportOutcomeNotice,
} from '../../application/billing/billing-service'
import {
  billingExportSelectionIssue,
  buildBillingSyncKey,
  buildMideaPctDefaultExclusion,
  collectInvolvedCurrencies,
  collectPctCandidates,
  collectPctExceptions,
  computeActiveCaseVolumes,
  computeBillingReconciliation,
  computeEffectiveExchangeRates,
  extractBillMapFromFiles,
  filterPctExportExceptions,
  findMissingRates,
  hasForeignCurrencyRows,
  isValidBillingTemplateId,
  validateBillingExportPreconditions,
  validateBillingFeeSelection,
} from '../../application/billing/billing-validation'
import type { BillInfo } from '../../billing/fee-model'
import { normalizeCurrency, PBC_INDEX_URL } from '../../billing/pbc-rates'
import {
  BILLING_TEMPLATES,
  defaultHeaders,
  formatLocalDate,
  groupBillingRowsByCustomer,
  type BillingOptions,
  type BillingTemplateId,
} from '../../billing/templates'
import { createDefaultBillingService } from '../../infrastructure/billing/billing-adapters'
import type { SelectedPatentFile } from '../../mail/types'
import { useWorkspace } from './useWorkspace'

export interface FileSearchPanelHandle {
  selectAllPages: (billsOnly?: boolean) => Promise<void> | undefined
  getBillingSelectionIssue: () => string
  hasRecoveredQuery: boolean
  refreshing?: boolean
  searchError?: string
  canRefresh: boolean
  refresh: (scrollOnSuccess?: boolean) => Promise<void> | void | undefined
}

export interface FeeSearchQueryHandle {
  selectionPending: boolean
  selectionIncomplete: boolean
  selectingAll?: boolean
  snapshotRevision?: number
  getKnownRows: () => Iterable<FeeSearchRow>
  replaceBillingSelection: (rows: FeeSearchRow[]) => void
  billingSnapshot: () => unknown
  restoreBillingSnapshot: (snapshot: unknown) => void
}

export type BillingWorkflowStep = 1 | 2 | 3

const ACTIVE_TEMPLATE_STORAGE_PREFIX = 'patmail:billing:active-template:'

function templateDraftScope(origin: string, userId: string, templateId: BillingTemplateId): string {
  return JSON.stringify([origin, userId, templateId])
}

function activeTemplateStorage(): Storage | undefined {
  try {
    const candidate = globalThis.localStorage
    if (candidate && typeof candidate.getItem === 'function' && typeof candidate.setItem === 'function') {
      return candidate
    }
  } catch {
    // 忽略受限存储上下文中的异常
  }
  return undefined
}

function readSavedActiveTemplate(accountScope: string): BillingTemplateId | null {
  try {
    const raw = activeTemplateStorage()?.getItem(`${ACTIVE_TEMPLATE_STORAGE_PREFIX}${accountScope}`)
    return raw && isValidBillingTemplateId(raw) ? raw : null
  } catch {
    return null
  }
}

function writeSavedActiveTemplate(accountScope: string, templateId: BillingTemplateId): void {
  try {
    activeTemplateStorage()?.setItem(`${ACTIVE_TEMPLATE_STORAGE_PREFIX}${accountScope}`, templateId)
  } catch {
    // 忽略受限存储上下文中的异常
  }
}

export function useBillingWorkflow(options: {
  service?: BillingApplicationService
  isActive?: () => boolean
} = {}) {
  const service = options.service ?? createDefaultBillingService()
  const { connection } = useWorkspace()

  const confirmedScope = computed(() => {
    const { easyOrigin, operatorId, sessionStatus } = connection.value
    return sessionStatus === 'authenticated' && easyOrigin && operatorId
      ? JSON.stringify([easyOrigin, operatorId])
      : ''
  })
  const billingScope = ref('')
  const billingOwner = ref({ origin: '', userId: '' })
  const restoring = ref(false)
  const ready = computed(
    () => !restoring.value && Boolean(billingScope.value && confirmedScope.value === billingScope.value),
  )

  const selectedTemplateId = ref<BillingTemplateId>('general-foreign')
  const billingFileSurface = computed(() => `billing-files:${selectedTemplateId.value}`)
  const billingTenantKey = computed(() => (billingScope.value ? `${billingScope.value}:${selectedTemplateId.value}` : ''))
  const currentTemplate = computed(
    () => BILLING_TEMPLATES.find(t => t.id === selectedTemplateId.value) ?? BILLING_TEMPLATES[0],
  )

  const headerValues = ref<Record<string, string>>(defaultHeaders('general-foreign'))
  const billingOptions = ref<BillingOptions>({ ...BILLING_TEMPLATES[0].queryPreset.defaultOptions })

  const currentStep = ref<BillingWorkflowStep>(1)
  const stepNotice = ref('')
  const noticeInResults = ref(false)
  const stepNavigation = ref<HTMLElement | null>(null)

  const filePanelRef = ref<FileSearchPanelHandle | null>(null)
  const fileSelection = shallowRef<Record<string, SelectedPatentFile>>({})
  const recoveredBills = shallowRef<Record<string, BillInfo[]>>({})
  const filesByVolume = computed(() => {
    const map = new Map<string, SelectedPatentFile[]>()
    for (const item of Object.values(fileSelection.value)) {
      const vol = item.caseVolume?.trim()
      if (!vol) continue
      let list = map.get(vol)
      if (!list) {
        list = []
        map.set(vol, list)
      }
      list.push(item)
    }
    return map
  })
  const RECOVERED_BILL_REVALIDATE_ISSUE = '请先刷新验证已恢复的账单查询。'
  const revalidatingRecoveredBills = ref(false)
  let revalidatingBillsTask: Promise<boolean> | null = null
  let revalidatingBillsGen = 0
  const fileSelectionIssue = computed(() =>
    currentTemplate.value.queryPreset.fileStepOptional
      ? ''
      : (filePanelRef.value?.getBillingSelectionIssue() ?? ''),
  )
  const canAutoRevalidateRecoveredBills = computed(
    () =>
      !currentTemplate.value.queryPreset.fileStepOptional &&
      Boolean(filePanelRef.value?.hasRecoveredQuery && filePanelRef.value?.canRefresh),
  )
  const blockingFileSelectionIssue = computed(() =>
    fileSelectionIssue.value === RECOVERED_BILL_REVALIDATE_ISSUE && canAutoRevalidateRecoveredBills.value
      ? ''
      : fileSelectionIssue.value,
  )

  async function revalidateRecoveredBills(): Promise<boolean> {
    if (revalidatingBillsTask) return revalidatingBillsTask
    const panel = filePanelRef.value
    if (!panel || currentTemplate.value.queryPreset.fileStepOptional || !panel.hasRecoveredQuery) {
      return !fileSelectionIssue.value
    }
    if (!panel.canRefresh) return false
    const taskGen = ++revalidatingBillsGen
    revalidatingRecoveredBills.value = true
    revalidatingBillsTask = Promise.resolve(panel.refresh(false))
      .then(() => !fileSelectionIssue.value)
      .finally(() => {
        if (revalidatingBillsGen === taskGen) {
          revalidatingRecoveredBills.value = false
          revalidatingBillsTask = null
        }
      })
    return revalidatingBillsTask
  }

  const fileSeed = ref<Record<string, string>>({ ...BILLING_TEMPLATES[0].queryPreset.fileFields })
  const fileSeedToken = ref(1)

  const billMap = computed<Record<string, BillInfo[]>>(() =>
    extractBillMapFromFiles(fileSelection.value, recoveredBills.value),
  )

  const recognizedBillsCount = computed(() =>
    Object.values(billMap.value).reduce((sum, list) => sum + list.length, 0),
  )

  const autoExtractedVolumes = computed(() => Object.keys(billMap.value))
  const customVolumeInput = ref('')
  const extraVolumes = ref<string[]>([])
  const excludedVolumes = ref<string[]>([])

  const activeVolumes = computed<string[]>(() =>
    computeActiveCaseVolumes(autoExtractedVolumes.value, extraVolumes.value, excludedVolumes.value),
  )

  function addCustomVolume(): void {
    const text = customVolumeInput.value.trim()
    if (!text) return
    const parts = text
      .split(/[\s,;\n\r]+/)
      .map(s => s.trim())
      .filter(Boolean)
    const excludedSet = new Set(excludedVolumes.value)
    const nextExtra = [...extraVolumes.value]
    for (const p of parts) {
      excludedSet.delete(p)
      if (!nextExtra.includes(p)) nextExtra.push(p)
    }
    excludedVolumes.value = [...excludedSet]
    extraVolumes.value = nextExtra
    customVolumeInput.value = ''
  }

  function removeVolume(volume: string): void {
    if (extraVolumes.value.includes(volume)) {
      extraVolumes.value = extraVolumes.value.filter(v => v !== volume)
    }
    if (autoExtractedVolumes.value.includes(volume) && !excludedVolumes.value.includes(volume)) {
      excludedVolumes.value = [...excludedVolumes.value, volume]
    }
  }

  function restoreExcludedVolumes(): void {
    excludedVolumes.value = []
  }

  function triggerSelectAllBills(): void {
    if (filePanelRef.value) {
      void filePanelRef.value.selectAllPages(true)
    }
  }

  const feeQueryRef = ref<FeeSearchQueryHandle | null>(null)
  const feeInitialValues = ref<Record<string, string>>({
    case_volume: '',
    ...BILLING_TEMPLATES[0].queryPreset.feeFields,
  })
  const feeInitialToken = ref(1)
  const selectedFeeRows = shallowRef<FeeSearchRow[]>([])
  const lastAppliedFeeSyncKey = ref('')
  const isMideaPct = computed(() => selectedTemplateId.value === 'midea-pct')
  const defaultSelectionExclusion = computed(() => buildMideaPctDefaultExclusion(isMideaPct.value))

  const pctCandidates = computed(() =>
    isMideaPct.value ? collectPctCandidates(Array.from(feeQueryRef.value?.getKnownRows() ?? [])) : new Map<string, FeeSearchRow[]>(),
  )
  const allowMixedCustomers = ref(false)
  const selectedCustomerGroups = computed(() => groupBillingRowsByCustomer(selectedFeeRows.value))
  const pctSelectedCustomers = computed(() =>
    isMideaPct.value
      ? [...new Set(selectedFeeRows.value.map(row => row.customerName.trim()).filter(Boolean))]
      : [],
  )
  const pctSelectedCustomer = computed(() => {
    const names = pctSelectedCustomers.value
    if (!names.length) return ''
    return names.length === 1 ? names[0] : `${names[0]} 等 ${names.length} 个客户`
  })
  const pctExceptions = computed(() =>
    isMideaPct.value ? collectPctExceptions(Array.from(feeQueryRef.value?.getKnownRows() ?? [])) : [],
  )
  const pctExportExceptions = computed(() =>
    filterPctExportExceptions(pctExceptions.value, pctSelectedCustomers.value),
  )
  const confirmPctExceptions = ref(true)
  watch([selectedFeeRows, pctExportExceptions], () => {
    confirmPctExceptions.value = true
  })

  function selectPctCustomer(rows: FeeSearchRow[]): void {
    feeQueryRef.value?.replaceBillingSelection(rows)
    stepNotice.value = ''
  }

  function buildFeeSyncKey(): string {
    return buildBillingSyncKey(selectedTemplateId.value, activeVolumes.value)
  }

  const feeSelectionIssue = computed(() =>
    validateBillingFeeSelection({
      selectionPending: Boolean(feeQueryRef.value?.selectionPending),
      selectionIncomplete: Boolean(feeQueryRef.value?.selectionIncomplete),
      selectedCount: selectedFeeRows.value.length,
      ready: ready.value,
      syncKeyMatches: lastAppliedFeeSyncKey.value === buildFeeSyncKey(),
      isMideaPct: isMideaPct.value,
      selectedFeeRows: selectedFeeRows.value,
    }),
  )

  function syncFeeQueryIfNeeded(force: boolean): void {
    const syncKey = buildFeeSyncKey()
    if (!force && syncKey === lastAppliedFeeSyncKey.value) return
    lastAppliedFeeSyncKey.value = syncKey
    const volumeText = activeVolumes.value.join('\n')
    const presetFields = currentTemplate.value.queryPreset.feeFields
    feeInitialValues.value = {
      ...presetFields,
      case_volume: volumeText,
    }
    selectedFeeRows.value = []
    feeInitialToken.value += 1
  }

  function onFeeSelectionChange(rows: FeeSearchRow[]): void {
    selectedFeeRows.value = rows
  }

  const ratesLoading = ref(false)
  const ratesDate = ref('')
  const ratesSourceUrl = ref('')
  const pbcPerCny = ref<Record<string, number>>({})
  const customRates = ref<Record<string, number>>({})
  const clearedRates = ref<Record<string, boolean>>({})
  const ratesError = ref('')
  let ratesCheckedOn = ''
  const manualRateDate = ref('')

  const effectiveRates = computed<Record<string, number>>(() =>
    computeEffectiveExchangeRates(pbcPerCny.value, customRates.value, clearedRates.value),
  )
  const manualOnlyRates = computed<Record<string, number>>(() =>
    computeEffectiveExchangeRates({}, customRates.value, clearedRates.value),
  )
  const usesManualRate = computed(() =>
    selectedFeeRows.value.some(row => Boolean(customRates.value[normalizeCurrency(row.currency)])),
  )
  const missingRateCodes = computed(() => findMissingRates(selectedFeeRows.value, effectiveRates.value))
  const involvedCurrencies = computed(() => collectInvolvedCurrencies(selectedFeeRows.value))
  const needsForeignRates = computed(() => hasForeignCurrencyRows(selectedFeeRows.value))
  const manualRatesComplete = computed(
    () => needsForeignRates.value && findMissingRates(selectedFeeRows.value, manualOnlyRates.value).length === 0,
  )


  async function loadPbcRates(): Promise<void> {
    if (ratesLoading.value) return
    ratesLoading.value = true
    const checkedOn = formatLocalDate()
    ratesError.value = ''
    try {
      const data = await service.fetchRates()
      ratesCheckedOn = checkedOn
      ratesDate.value = data.date
      ratesSourceUrl.value = data.sourceUrl
      pbcPerCny.value = { ...data.perCny }
    } catch (err) {
      if (!ratesDate.value) ratesCheckedOn = checkedOn
      ratesError.value = `${err instanceof Error ? err.message : '中国人民银行汇率获取失败'}（可重试或手工填写准确汇率）`
    } finally {
      ratesLoading.value = false
    }
  }

  function updateRate(code: string, value: string): void {
    const trimmed = value.trim()
    if (!trimmed) {
      delete customRates.value[code]
      clearedRates.value[code] = true
      return
    }
    const num = Number(trimmed)
    if (Number.isFinite(num) && num > 0) {
      delete clearedRates.value[code]
      customRates.value[code] = num
    } else {
      delete customRates.value[code]
      clearedRates.value[code] = true
    }
  }

  function resetRate(code: string): void {
    delete customRates.value[code]
    delete clearedRates.value[code]
  }

  const shouldWatchRates = computed(
    () => currentStep.value === 3 && !restoring.value && (options.isActive?.() ?? true),
  )
  function checkRatesWhileVisible(): void {
    if (exporting.value || !shouldWatchRates.value || document.visibilityState === 'hidden') return
    const today = formatLocalDate()
    const hasPbcRates = Object.keys(pbcPerCny.value).length > 0
    if (!hasPbcRates || ratesCheckedOn !== today || ratesDate.value < today || ratesError.value) {
      void loadPbcRates()
    }
  }

  let stepTransitionGen = 0

  async function setStep(target: BillingWorkflowStep, fromResults = false): Promise<void> {
    const gen = ++stepTransitionGen
    noticeInResults.value = fromResults
    if (target === 1 || (target === 2 && currentStep.value === 3)) {
      stepNotice.value = ''
      currentStep.value = target
      return
    }
    const needsAutoRevalidate =
      (fileSelectionIssue.value === RECOVERED_BILL_REVALIDATE_ISSUE && canAutoRevalidateRecoveredBills.value) ||
      (fileSelectionIssue.value === '账单还在读取，请等待完成。' && revalidatingBillsTask !== null)
    if (needsAutoRevalidate) {
      stepNotice.value = '正在自动验证已恢复的账单查询…'
      await revalidateRecoveredBills()
      if (gen !== stepTransitionGen || disposed) return
    }
    const issue = fileSelectionIssue.value || (target === 3 ? feeSelectionIssue.value : '')
    if (issue) {
      stepNotice.value = issue
      return
    }
    stepNotice.value = ''
    currentStep.value = target
    if (target === 2) {
      syncFeeQueryIfNeeded(false)
    }
  }

  async function advanceFromResults(target: 2 | 3): Promise<void> {
    await setStep(target, true)
    if (currentStep.value !== target) return
    await nextTick()
    stepNavigation.value?.scrollIntoView({ block: 'start' })
  }

  watch(activeVolumes, () => {
    if (!restoring.value && currentStep.value !== 1) syncFeeQueryIfNeeded(false)
  })

  watch(fileSelection, files => {
    if (Object.keys(files).length) recoveredBills.value = {}
  })

  function onFileSearch(): void {
    if (!restoring.value && !Object.keys(fileSelection.value).length) recoveredBills.value = {}
  }

  function onFeeSearch(): void {
    if (!restoring.value && canAutoRevalidateRecoveredBills.value) {
      void revalidateRecoveredBills()
    }
  }

  const reconciliationInfo = computed(() =>
    computeBillingReconciliation(selectedTemplateId.value, selectedFeeRows.value, billMap.value),
  )

  const exporting = ref(false)
  const exportResultNotice = ref('')
  const exportWarnings = ref<string[]>([])
  const exportBatchItems = ref<BatchExportItemOutcome[]>([])
  const confirmExistingFees = ref(false)
  const canAdvanceFromFees = computed(
    () =>
      selectedFeeRows.value.length > 0 &&
      !feeQueryRef.value?.selectionPending &&
      !feeQueryRef.value?.selectionIncomplete,
  )
  const exportDisabled = computed(
    () =>
      exporting.value ||
      revalidatingRecoveredBills.value ||
      (needsForeignRates.value && ratesLoading.value) ||
      Boolean(blockingFileSelectionIssue.value || feeSelectionIssue.value) ||
      (reconciliationInfo.value.requestedCount > 0 && !confirmExistingFees.value) ||
      (pctExportExceptions.value.length > 0 && !confirmPctExceptions.value),
  )
  const exportDisabledReason = computed((): string => {
    if (exporting.value) return '正在导出请款表，请稍候…'
    if (revalidatingRecoveredBills.value) return '正在自动验证已恢复的账单查询，请稍候…'
    if (needsForeignRates.value && ratesLoading.value) return '正在获取央行汇率，请稍候…'
    if (blockingFileSelectionIssue.value) return blockingFileSelectionIssue.value
    if (feeSelectionIssue.value) return feeSelectionIssue.value
    const confirmReasons: string[] = []
    if (pctExportExceptions.value.length > 0 && !confirmPctExceptions.value) {
      confirmReasons.push(`有 ${pctExportExceptions.value.length} 笔未请款异常费用待在上方勾选确认`)
    }
    if (reconciliationInfo.value.requestedCount > 0 && !confirmExistingFees.value) {
      confirmReasons.push(`有 ${reconciliationInfo.value.requestedCount} 笔已立单或状态待核对费用待在上方勾选确认`)
    }
    if (confirmReasons.length) return `请先完成确认：${confirmReasons.join('；')}。`
    return ''
  })
  watch(selectedFeeRows, () => {
    confirmExistingFees.value = false
    exportResultNotice.value = ''
    exportWarnings.value = []
    exportBatchItems.value = []
  })
  const exportProgress = ref<BatchExportProgress | null>(null)
  const exportParameters = computed(() => {
    const today = formatLocalDate()
    const foreign = needsForeignRates.value
    const usesPbcRates = foreign && !manualRatesComplete.value
    return {
      headers: { ...headerValues.value },
      options: { ...billingOptions.value },
      allowMixedCustomers: allowMixedCustomers.value,
      rates: foreign ? { ...effectiveRates.value } : { CNY: 1 },
      rateSourceUrl: !foreign
        ? ''
        : usesPbcRates
          ? (ratesCheckedOn === today ? ratesSourceUrl.value : '')
          : '手工填写',
      rateDate: !foreign
        ? today
        : usesManualRate.value
          ? `手工 ${manualRateDate.value}${usesPbcRates && ratesDate.value && ratesCheckedOn === today ? ` / 央行 ${ratesDate.value}` : ''}`
          : ratesDate.value || today,
    }
  })

  async function doExportExcel(): Promise<void> {
    if (exporting.value) return
    if (needsForeignRates.value && ratesLoading.value) return
    exporting.value = true
    try {
      if (canAutoRevalidateRecoveredBills.value || revalidatingBillsTask) {
        exportResultNotice.value = '正在自动验证已恢复的账单查询…'
        await revalidateRecoveredBills()
      }
      const templateId = selectedTemplateId.value
      const rows = selectedFeeRows.value
      const bills = billMap.value
      const account = connection.value.operatorId
      const origin = connection.value.easyOrigin
      const scope = billingScope.value
      const selection = () => ({
        fileSelectionIssue: fileSelectionIssue.value,
        feeSelectionIssue: feeSelectionIssue.value,
        reconciliationRequestedCount: reconciliationInfo.value.requestedCount,
        confirmExistingFees: confirmExistingFees.value,
        pctExportExceptionsCount: pctExportExceptions.value.length,
        confirmPctExceptions: confirmPctExceptions.value,
      })
      const selectionIssue = billingExportSelectionIssue(selection())
      if (selectionIssue) {
        exportResultNotice.value = selectionIssue
        return
      }
      const selectionChanged = () =>
        selectedTemplateId.value !== templateId ||
        selectedFeeRows.value !== rows ||
        connection.value.operatorId !== account ||
        connection.value.easyOrigin !== origin ||
        billingScope.value !== scope ||
        billMap.value !== bills ||
        Boolean(billingExportSelectionIssue(selection()))

      if (needsForeignRates.value) await loadPbcRates()
      if (selectionChanged()) {
        exportResultNotice.value = '请款范围已变化，请核对后重新导出。'
        return
      }
      const parameters = exportParameters.value
      const parametersJson = JSON.stringify(parameters)
      let lastProgressPhase = ''
      let latestProgress: BatchExportProgress | null = null
      let latestProgressNotice = ''
      const exportProgressCoalescer = createLeadingFrameCoalescer(() => {
        if (!latestProgress) return
        exportProgress.value = latestProgress
        exportResultNotice.value = latestProgressNotice
      })
      const exportCommand = {
        templateId, rows, bills, parameters, ...selection(),
        needsForeignRates: needsForeignRates.value,
        ratesCheckedOn, ratesLoading: ratesLoading.value,
        missingRateCodes: missingRateCodes.value,
        usesManualRate: usesManualRate.value,
        manualRatesComplete: manualRatesComplete.value,
        manualRateDate: manualRateDate.value,
        downloadScope: scope,
        onProgress: (progress: BatchExportProgress) => {
          const generated = progress.generatedDone ?? progress.done
          const downloaded = progress.downloadedDone ?? progress.done
          const nextPhase = progress.phase ?? 'downloading'
          const phaseChanged = nextPhase !== lastProgressPhase
          lastProgressPhase = nextPhase
          latestProgress = progress
          latestProgressNotice =
            progress.phase === 'generating'
              ? `正在并发生成工作簿 ${generated}/${progress.total}（已提交下载 ${downloaded}/${progress.total}，当前：${progress.currentCustomer}）…`
              : `正在顺序触发下载 ${downloaded}/${progress.total}（已生成 ${generated}/${progress.total}，当前：${progress.currentCustomer}）…`
          exportProgressCoalescer.trigger(phaseChanged)
        },
        isStale: () => selectionChanged() || JSON.stringify(exportParameters.value) !== parametersJson,
      }
      const precheck = validateBillingExportPreconditions(exportCommand)
      if (!precheck.ok) {
        exportResultNotice.value = precheck.needsRateRefresh && ratesError.value ? ratesError.value : precheck.reason
        return
      }
      exportProgress.value = null
      const splitCount = !parameters.allowMixedCustomers && selectedCustomerGroups.value.length > 1
        ? selectedCustomerGroups.value.length
        : 0
      exportResultNotice.value = splitCount
        ? `正在按客户流水线并发导出 ${splitCount} 份 Excel 请款表…`
        : '正在生成 Excel 请款表…'
      exportWarnings.value = []
      exportBatchItems.value = []
      try {
        const { outcome } = await service.exportBilling(exportCommand)
        if (
          outcome.status === 'download_started' ||
          outcome.status === 'download_completed' ||
          outcome.status === 'generated' ||
          outcome.status === 'batch_completed'
        ) {
          exportWarnings.value = outcome.warnings
        }
        if (outcome.status === 'batch_completed') {
          exportBatchItems.value = outcome.items
        }
        exportResultNotice.value = formatExportOutcomeNotice(outcome)
      } finally {
        exportProgressCoalescer.cancel()
      }
    } catch (err) {
      exportResultNotice.value = err instanceof Error ? err.message : '请款表生成失败'
    } finally {
      exportProgress.value = null
      exporting.value = false
    }
  }

  watch(shouldWatchRates, active => { if (active) checkRatesWhileVisible() }, { immediate: true })

  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let persistIdleId: number | undefined
  let draftRevision = 0
  let lastFlushedRevision = 0
  let disposed = false
  let restoreGeneration = 0
  let legacyDraftScopeChecked = ''
  let cachedLegacyDraft: BillingDeskSnapshot | null = null
  const recoveryNotice = ref('')

  function cancelPendingPersist(): void {
    clearTimeout(persistTimer)
    persistTimer = undefined
    if (persistIdleId !== undefined && typeof globalThis.cancelIdleCallback === 'function') {
      globalThis.cancelIdleCallback(persistIdleId)
      persistIdleId = undefined
    }
  }

  function billingSnapshot(templateId: BillingTemplateId = selectedTemplateId.value): BillingDeskSnapshot {
    return toPlainCloneable({
      version: 1,
      template: templateId,
      step: currentStep.value,
      headers: headerValues.value,
      options: billingOptions.value,
      allowMixedCustomers: allowMixedCustomers.value,
      extra: extraVolumes.value,
      excluded: excludedVolumes.value,
      volumeInput: customVolumeInput.value,
      bills: billMap.value,
      syncKey: lastAppliedFeeSyncKey.value,
      rates: customRates.value,
      clearedRates: clearedRates.value,
      rateDate: manualRateDate.value,
      fees: feeQueryRef.value?.billingSnapshot(),
    })
  }

  function flushBilling(targetTemplateId: BillingTemplateId = selectedTemplateId.value): void {
    cancelPendingPersist()
    const scope = billingScope.value
    if (!scope || restoring.value || !feeQueryRef.value) return
    if (draftRevision === lastFlushedRevision) return
    const flushedRev = draftRevision
    lastFlushedRevision = flushedRev
    const targetScope = templateDraftScope(billingOwner.value.origin, billingOwner.value.userId, targetTemplateId)
    const snapshot = billingSnapshot(targetTemplateId)
    void service
      .saveDraft(targetScope, snapshot)
      .catch(() => {
        if (billingScope.value !== scope) return
        if (lastFlushedRevision === flushedRev) lastFlushedRevision = -1
        recoveryNotice.value = '请款草稿未能保存，刷新前请保留当前页面。'
      })
  }

  function scheduleBillingPersist(delayMs = 300): void {
    if (!billingScope.value || restoring.value) return
    if (exporting.value || feeQueryRef.value?.selectingAll) return
    cancelPendingPersist()
    persistTimer = setTimeout(() => {
      persistTimer = undefined
      if (typeof globalThis.requestIdleCallback === 'function') {
        persistIdleId = globalThis.requestIdleCallback(() => {
          persistIdleId = undefined
          flushBilling()
        }, { timeout: 800 })
      } else {
        flushBilling()
      }
    }, delayMs)
  }

  watch(
    [
      currentStep,
      allowMixedCustomers,
      extraVolumes,
      excludedVolumes,
      customVolumeInput,
      billMap,
      lastAppliedFeeSyncKey,
      manualRateDate,
      () => feeQueryRef.value?.snapshotRevision,
    ],
    () => {
      if (restoring.value) return
      draftRevision += 1
      scheduleBillingPersist()
    },
  )

  watch(
    [headerValues, billingOptions, customRates, clearedRates],
    () => {
      if (restoring.value) return
      draftRevision += 1
      scheduleBillingPersist()
    },
    { deep: true },
  )

  watch(
    [exporting, () => feeQueryRef.value?.selectingAll],
    ([isExporting, isSelectingAll], [wasExporting, wasSelectingAll]) => {
      if (!isExporting && !isSelectingAll && (wasExporting || wasSelectingAll)) {
        scheduleBillingPersist(50)
      }
    },
  )

  function applyTemplateDefaults(templateId: BillingTemplateId, targetStep: BillingWorkflowStep): void {
    const tpl = BILLING_TEMPLATES.find(t => t.id === templateId) ?? BILLING_TEMPLATES[0]
    currentStep.value = targetStep
    headerValues.value = defaultHeaders(templateId)
    billingOptions.value = { ...tpl.queryPreset.defaultOptions }
    allowMixedCustomers.value = false
    fileSeed.value = { ...tpl.queryPreset.fileFields }
    fileSeedToken.value += 1
    fileSelection.value = {}
    recoveredBills.value = {}
    extraVolumes.value = []
    excludedVolumes.value = []
    customVolumeInput.value = ''
    customRates.value = {}
    clearedRates.value = {}
    manualRateDate.value = ''
    confirmExistingFees.value = false
    stepNotice.value = ''
    exportResultNotice.value = ''
    exportWarnings.value = []
    exportBatchItems.value = []
    syncFeeQueryIfNeeded(true)
  }

  async function applyRestoredDraft(state: BillingDeskSnapshot, stillCurrent: () => boolean): Promise<void> {
    selectedTemplateId.value = state.template
    headerValues.value = state.headers
    billingOptions.value = state.options
    allowMixedCustomers.value = Boolean(state.allowMixedCustomers)
    fileSeed.value = { ...currentTemplate.value.queryPreset.fileFields }
    fileSeedToken.value += 1
    extraVolumes.value = state.extra
    excludedVolumes.value = state.excluded
    customVolumeInput.value = state.volumeInput
    recoveredBills.value = state.bills
    customRates.value = state.rates
    clearedRates.value = state.clearedRates
    manualRateDate.value = state.rateDate
    syncFeeQueryIfNeeded(true)
    await nextTick()
    if (!stillCurrent()) return
    if (state.fees && state.syncKey === buildFeeSyncKey()) {
      feeQueryRef.value?.restoreBillingSnapshot(state.fees)
    }
    currentStep.value = state.step === 2 || state.step === 3 ? state.step : 1
    await nextTick()
  }

  async function readLegacyDraftIfNeeded(accountScope: string): Promise<BillingDeskSnapshot | null> {
    if (legacyDraftScopeChecked === accountScope) return cachedLegacyDraft
    const legacy = await service.loadDraft(accountScope).catch(() => null)
    legacyDraftScopeChecked = accountScope
    cachedLegacyDraft = legacy?.version === 1 && isValidBillingTemplateId(legacy.template) ? legacy : null
    return cachedLegacyDraft
  }

  watch(
    confirmedScope,
    async scope => {
      if (!scope || scope === billingScope.value) return
      const generation = ++restoreGeneration
      const stillCurrent = () => !disposed && generation === restoreGeneration
      flushBilling()
      restoring.value = true
      billingScope.value = scope
      billingOwner.value = { origin: connection.value.easyOrigin, userId: connection.value.operatorId }
      legacyDraftScopeChecked = ''
      cachedLegacyDraft = null
      draftRevision = 0
      lastFlushedRevision = 0
      recoveryNotice.value = ''
      const preferredTemplate = readSavedActiveTemplate(scope)
      const initialTemplate: BillingTemplateId = preferredTemplate ?? 'general-foreign'
      selectedTemplateId.value = initialTemplate
      applyTemplateDefaults(initialTemplate, 1)
      let state = await service
        .loadDraft(templateDraftScope(connection.value.easyOrigin, connection.value.operatorId, initialTemplate))
        .catch(() => {
          if (stillCurrent()) recoveryNotice.value = '请款草稿暂时无法读取。'
          return null
        })
      if (!stillCurrent()) return
      if (!state) {
        const legacy = await readLegacyDraftIfNeeded(scope)
        if (!stillCurrent()) return
        if (legacy && (!preferredTemplate || legacy.template === initialTemplate)) {
          state = legacy
          writeSavedActiveTemplate(scope, legacy.template)
          if (legacy.template !== initialTemplate) {
            selectedTemplateId.value = legacy.template
            applyTemplateDefaults(legacy.template, 1)
          }
        }
      }
      if (state?.version === 1 && isValidBillingTemplateId(state.template)) {
        await applyRestoredDraft(state, stillCurrent)
      }
      if (!stillCurrent()) return
      draftRevision = 0
      lastFlushedRevision = 0
      restoring.value = false
    },
    { immediate: true },
  )

  watch(selectedTemplateId, async (nextId, prevId) => {
    if (restoring.value || !nextId || nextId === prevId) return
    flushBilling(prevId)
    const generation = ++restoreGeneration
    const stillCurrent = () => !disposed && generation === restoreGeneration
    const accountScope = billingScope.value
    const ownerOrigin = billingOwner.value.origin
    const ownerUserId = billingOwner.value.userId
    if (accountScope) writeSavedActiveTemplate(accountScope, nextId)
    const fallbackStep: BillingWorkflowStep = currentStep.value === 3 ? 2 : currentStep.value
    restoring.value = true
    draftRevision = 0
    lastFlushedRevision = 0
    recoveryNotice.value = ''
    applyTemplateDefaults(nextId, fallbackStep)
    if (!accountScope) {
      restoring.value = false
      return
    }
    let state = await service.loadDraft(templateDraftScope(ownerOrigin, ownerUserId, nextId)).catch(() => {
      if (stillCurrent()) recoveryNotice.value = '请款草稿暂时无法读取。'
      return null
    })
    if (!stillCurrent()) return
    if (!state) {
      const legacy = await readLegacyDraftIfNeeded(accountScope)
      if (!stillCurrent()) return
      if (legacy?.template === nextId) state = legacy
    }
    if (state?.version === 1 && state.template === nextId) {
      await applyRestoredDraft(state, stillCurrent)
      if (!stillCurrent()) return
    }
    draftRevision = 0
    lastFlushedRevision = 0
    restoring.value = false
  }, { flush: 'sync' })

  function onBillingVisibility(): void {
    if (document.visibilityState === 'hidden') flushBilling()
    else checkRatesWhileVisible()
  }
  function onBillingPageHide(): void {
    flushBilling()
  }
  document.addEventListener('visibilitychange', onBillingVisibility)
  window.addEventListener('focus', checkRatesWhileVisible)
  window.addEventListener('pagehide', onBillingPageHide)
  onBeforeUnmount(() => {
    flushBilling()
    cancelPendingPersist()
    disposed = true
    document.removeEventListener('visibilitychange', onBillingVisibility)
    window.removeEventListener('focus', checkRatesWhileVisible)
    window.removeEventListener('pagehide', onBillingPageHide)
  })

  return {
    billingTemplates: BILLING_TEMPLATES,
    pbcIndexUrl: PBC_INDEX_URL,
    formatLocalDate,
    confirmedScope,
    billingScope,
    billingOwner,
    billingFileSurface,
    billingTenantKey,
    restoring,
    ready,
    selectedTemplateId,
    currentTemplate,
    headerValues,
    billingOptions,
    currentStep,
    stepNotice,
    noticeInResults,
    stepNavigation,
    advanceFromResults,
    setStep,
    filePanelRef,
    fileSelection,
    filesByVolume,
    fileSelectionIssue,
    fileSeed,
    fileSeedToken,
    recognizedBillsCount,
    customVolumeInput,
    excludedVolumes,
    activeVolumes,
    addCustomVolume,
    removeVolume,
    restoreExcludedVolumes,
    triggerSelectAllBills,
    onFileSearch,
    onFeeSearch,
    feeQueryRef,
    feeInitialValues,
    feeInitialToken,
    selectedFeeRows,
    isMideaPct,
    allowMixedCustomers,
    selectedCustomerGroups,
    defaultSelectionExclusion,
    pctCandidates,
    pctSelectedCustomer,
    pctExceptions,
    pctExportExceptions,
    confirmPctExceptions,
    selectPctCustomer,
    feeSelectionIssue,
    syncFeeQueryIfNeeded,
    onFeeSelectionChange,
    ratesLoading,
    ratesDate,
    ratesSourceUrl,
    pbcPerCny,
    customRates,
    clearedRates,
    ratesError,
    manualRateDate,
    usesManualRate,
    effectiveRates,
    involvedCurrencies,
    loadPbcRates,
    updateRate,
    resetRate,
    reconciliationInfo,
    exporting,
    exportProgress,
    exportResultNotice,
    exportWarnings,
    exportBatchItems,
    confirmExistingFees,
    canAdvanceFromFees,
    exportDisabled,
    exportDisabledReason,
    doExportExcel,
    recoveryNotice,
  }
}
