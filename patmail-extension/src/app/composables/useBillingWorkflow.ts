import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
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
  canRefresh: boolean
  refresh: (scrollOnSuccess?: boolean) => void
}

export interface FeeSearchQueryHandle {
  selectionPending: boolean
  selectionIncomplete: boolean
  getKnownRows: () => Iterable<FeeSearchRow>
  replaceBillingSelection: (rows: FeeSearchRow[]) => void
  billingSnapshot: () => unknown
  restoreBillingSnapshot: (snapshot: unknown) => void
}

export type BillingWorkflowStep = 1 | 2 | 3

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
  const fileSelection = ref<Record<string, SelectedPatentFile>>({})
  const recoveredBills = ref<Record<string, BillInfo[]>>({})
  const fileSelectionIssue = computed(() =>
    currentTemplate.value.queryPreset.fileStepOptional
      ? ''
      : (filePanelRef.value?.getBillingSelectionIssue() ?? ''),
  )

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
    for (const p of parts) {
      excludedVolumes.value = excludedVolumes.value.filter(v => v !== p)
      if (!extraVolumes.value.includes(p)) extraVolumes.value.push(p)
    }
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
  const selectedFeeRows = ref<FeeSearchRow[]>([])
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
  const usesManualRate = computed(() =>
    selectedFeeRows.value.some(row => Boolean(customRates.value[normalizeCurrency(row.currency)])),
  )
  const missingRateCodes = computed(() => findMissingRates(selectedFeeRows.value, effectiveRates.value))
  const involvedCurrencies = computed(() => collectInvolvedCurrencies(selectedFeeRows.value))
  const needsForeignRates = computed(() => hasForeignCurrencyRows(selectedFeeRows.value))


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

  const shouldWatchRates = computed(() => currentStep.value === 3 && needsForeignRates.value && (options.isActive?.() ?? true))
  function checkRatesWhileVisible(): void {
    if (exporting.value || !shouldWatchRates.value || document.visibilityState === 'hidden') return
    const today = formatLocalDate()
    if (ratesCheckedOn !== today || ratesDate.value < today || ratesError.value) void loadPbcRates()
  }

  function setStep(target: BillingWorkflowStep, fromResults = false): void {
    noticeInResults.value = fromResults
    const issue =
      target === 1 || (target === 2 && currentStep.value === 3)
        ? ''
        : fileSelectionIssue.value || (target === 3 ? feeSelectionIssue.value : '')
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
    setStep(target, true)
    if (currentStep.value !== target) return
    await nextTick()
    stepNavigation.value?.scrollIntoView({ block: 'start' })
  }

  watch(selectedTemplateId, nextId => {
    if (restoring.value) return
    const tpl = BILLING_TEMPLATES.find(t => t.id === nextId) ?? BILLING_TEMPLATES[0]
    headerValues.value = defaultHeaders(nextId)
    billingOptions.value = { ...tpl.queryPreset.defaultOptions }
    fileSeed.value = { ...tpl.queryPreset.fileFields }
    fileSeedToken.value += 1
    syncFeeQueryIfNeeded(true)
    if (currentStep.value === 3) currentStep.value = 2
  })

  watch(activeVolumes, () => {
    if (!restoring.value && currentStep.value !== 1) syncFeeQueryIfNeeded(false)
  })

  watch(fileSelection, files => {
    if (Object.keys(files).length) recoveredBills.value = {}
  })

  function onFileSearch(): void {
    if (!restoring.value && !Object.keys(fileSelection.value).length) recoveredBills.value = {}
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
      ratesLoading.value ||
      Boolean(fileSelectionIssue.value || feeSelectionIssue.value) ||
      (reconciliationInfo.value.requestedCount > 0 && !confirmExistingFees.value) ||
      (pctExportExceptions.value.length > 0 && !confirmPctExceptions.value),
  )
  const exportDisabledReason = computed((): string => {
    if (exporting.value) return '正在导出请款表，请稍候…'
    if (ratesLoading.value) return '正在获取央行汇率，请稍候…'
    if (fileSelectionIssue.value) return fileSelectionIssue.value
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
  const exportParameters = computed(() => ({
    headers: { ...headerValues.value },
    options: { ...billingOptions.value },
    allowMixedCustomers: allowMixedCustomers.value,
    rates: { ...effectiveRates.value },
    rateSourceUrl: ratesSourceUrl.value,
    rateDate: usesManualRate.value
      ? `手工 ${manualRateDate.value}${ratesDate.value ? ` / 央行 ${ratesDate.value}` : ''}`
      : ratesDate.value || formatLocalDate(),
  }))

  async function doExportExcel(): Promise<void> {
    if (exporting.value) return
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
    if (ratesLoading.value) return
    const selectionChanged = () =>
      selectedTemplateId.value !== templateId ||
      selectedFeeRows.value !== rows ||
      connection.value.operatorId !== account ||
      connection.value.easyOrigin !== origin ||
      billingScope.value !== scope ||
      billMap.value !== bills ||
      Boolean(billingExportSelectionIssue(selection()))

    exporting.value = true
    try {
      if (needsForeignRates.value) await loadPbcRates()
      if (selectionChanged()) {
        exportResultNotice.value = '请款范围已变化，请核对后重新导出。'
        return
      }
      const parameters = exportParameters.value
      const exportCommand = {
        templateId, rows, bills, parameters, ...selection(),
        needsForeignRates: needsForeignRates.value,
        ratesCheckedOn, ratesLoading: ratesLoading.value,
        missingRateCodes: missingRateCodes.value,
        usesManualRate: usesManualRate.value,
        manualRateDate: manualRateDate.value,
        downloadScope: scope,
        onProgress: (progress: BatchExportProgress) => {
          exportProgress.value = progress
          const generated = progress.generatedDone ?? progress.done
          const downloaded = progress.downloadedDone ?? progress.done
          exportResultNotice.value =
            progress.phase === 'generating'
              ? `正在并发生成工作簿 ${generated}/${progress.total}（已提交下载 ${downloaded}/${progress.total}，当前：${progress.currentCustomer}）…`
              : `正在顺序触发下载 ${downloaded}/${progress.total}（已生成 ${generated}/${progress.total}，当前：${progress.currentCustomer}）…`
        },
        isStale: () => selectionChanged() || parameters !== exportParameters.value,
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
    } catch (err) {
      exportResultNotice.value = err instanceof Error ? err.message : '请款表生成失败'
    } finally {
      exportProgress.value = null
      exporting.value = false
    }
  }

  watch(shouldWatchRates, active => { if (active) checkRatesWhileVisible() })

  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let lastSnapshot = ''
  let disposed = false
  let restoreGeneration = 0
  const recoveryNotice = ref('')

  function billingSnapshot(): BillingDeskSnapshot {
    return {
      version: 1,
      template: selectedTemplateId.value,
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
    }
  }

  function flushBilling(): void {
    clearTimeout(persistTimer)
    const scope = billingScope.value
    if (!scope || restoring.value || !feeQueryRef.value) return
    const serialized = JSON.stringify(billingSnapshot())
    if (serialized === lastSnapshot) return
    lastSnapshot = serialized
    void service
      .saveDraft(scope, JSON.parse(serialized) as BillingDeskSnapshot)
      .catch(() => {
        if (billingScope.value !== scope) return
        if (lastSnapshot === serialized) lastSnapshot = ''
        recoveryNotice.value = '请款草稿未能保存，刷新前请保留当前页面。'
      })
  }

  watch(
    billingSnapshot,
    () => {
      if (!billingScope.value || restoring.value) return
      clearTimeout(persistTimer)
      persistTimer = setTimeout(flushBilling, 120)
    },
    { deep: true },
  )

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
      lastSnapshot = ''
      recoveryNotice.value = ''
      currentStep.value = 1
      selectedTemplateId.value = 'general-foreign'
      headerValues.value = defaultHeaders('general-foreign')
      billingOptions.value = { ...BILLING_TEMPLATES[0].queryPreset.defaultOptions }
      allowMixedCustomers.value = false
      fileSeed.value = { ...BILLING_TEMPLATES[0].queryPreset.fileFields }
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
      syncFeeQueryIfNeeded(true)
      const state = await service.loadDraft(scope).catch(() => {
        if (stillCurrent()) recoveryNotice.value = '请款草稿暂时无法读取。'
        return null
      })
      if (!stillCurrent()) return
      if (state?.version === 1 && isValidBillingTemplateId(state.template)) {
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
      if (!stillCurrent()) return
      restoring.value = false
    },
    { immediate: true },
  )

  function onBillingVisibility(): void {
    if (document.visibilityState === 'hidden') flushBilling()
    else checkRatesWhileVisible()
  }
  document.addEventListener('visibilitychange', onBillingVisibility)
  window.addEventListener('pagehide', flushBilling)
  onBeforeUnmount(() => {
    flushBilling()
    disposed = true
    document.removeEventListener('visibilitychange', onBillingVisibility)
    window.removeEventListener('pagehide', flushBilling)
  })

  return {
    billingTemplates: BILLING_TEMPLATES,
    pbcIndexUrl: PBC_INDEX_URL,
    formatLocalDate,
    confirmedScope,
    billingScope,
    billingOwner,
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
