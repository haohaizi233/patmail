import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { FeeSearchRow } from '../../api/fee-search-types'
import type { BillingDeskSnapshot } from '../../application/billing/billing-contracts'
import {
  BillingApplicationService,
  formatExportOutcomeNotice,
} from '../../application/billing/billing-service'
import {
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
  validateBillingFeeSelection,
} from '../../application/billing/billing-validation'
import type { BillInfo } from '../../billing/fee-model'
import { normalizeCurrency, PBC_INDEX_URL } from '../../billing/pbc-rates'
import {
  BILLING_TEMPLATES,
  defaultHeaders,
  formatLocalDate,
  type BillingOptions,
  type BillingTemplateId,
} from '../../billing/templates'
import { createDefaultBillingService } from '../../infrastructure/billing/billing-adapters'
import type { SelectedPatentFile } from '../../mail/types'
import { useWorkspace } from './useWorkspace'

export interface FileSearchPanelHandle {
  selectAllPages: (billsOnly?: boolean) => Promise<void> | undefined
  getBillingSelectionIssue: () => string
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
  const fileSelectionIssue = computed(() => filePanelRef.value?.getBillingSelectionIssue() ?? '')

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
  const pctSelectedCustomer = computed(() =>
    isMideaPct.value ? (selectedFeeRows.value[0]?.customerName.trim() ?? '') : '',
  )
  const pctExceptions = computed(() =>
    isMideaPct.value ? collectPctExceptions(Array.from(feeQueryRef.value?.getKnownRows() ?? [])) : [],
  )
  const pctExportExceptions = computed(() =>
    filterPctExportExceptions(pctExceptions.value, pctSelectedCustomer.value),
  )
  const confirmPctExceptions = ref(false)
  watch([selectedFeeRows, pctExportExceptions], () => {
    confirmPctExceptions.value = false
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

  function formatRate(val: number): string {
    return val < 0.1 ? val.toFixed(6) : val.toFixed(4)
  }

  async function loadPbcRates(): Promise<void> {
    if (ratesLoading.value) return
    ratesLoading.value = true
    ratesCheckedOn = formatLocalDate()
    ratesError.value = ''
    ratesDate.value = ''
    ratesSourceUrl.value = ''
    pbcPerCny.value = {}
    try {
      const data = await service.fetchRates()
      ratesDate.value = data.date
      ratesSourceUrl.value = data.sourceUrl
      pbcPerCny.value = { ...data.perCny }
    } catch (err) {
      ratesError.value = `${err instanceof Error ? err.message : '中国人民银行汇率获取失败'}（不会使用离线估算值，请点击重试或在下方手工填写准确汇率）`
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

  function initStep3(): void {
    if (needsForeignRates.value && ratesCheckedOn !== formatLocalDate()) {
      void loadPbcRates()
    }
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
    } else if (target === 3) {
      initStep3()
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
  watch(selectedFeeRows, () => {
    confirmExistingFees.value = false
    exportResultNotice.value = ''
    exportWarnings.value = []
  })
  const exportParameters = computed(() => ({
    headers: { ...headerValues.value },
    options: { ...billingOptions.value },
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
    const parameters = exportParameters.value
    const account = connection.value.operatorId
    const origin = connection.value.easyOrigin

    const isStale = () =>
      selectedTemplateId.value !== templateId ||
      selectedFeeRows.value !== rows ||
      connection.value.operatorId !== account ||
      connection.value.easyOrigin !== origin ||
      billMap.value !== bills ||
      parameters !== exportParameters.value ||
      Boolean(fileSelectionIssue.value || feeSelectionIssue.value) ||
      (reconciliationInfo.value.requestedCount > 0 && !confirmExistingFees.value) ||
      (pctExportExceptions.value.length > 0 && !confirmPctExceptions.value)

    exporting.value = true
    exportResultNotice.value = '正在生成 Excel 请款表…'
    exportWarnings.value = []

    try {
      const { outcome, needsRateRefresh } = await service.exportBilling({
        templateId,
        rows,
        bills,
        parameters,
        fileSelectionIssue: fileSelectionIssue.value,
        feeSelectionIssue: feeSelectionIssue.value,
        reconciliationRequestedCount: reconciliationInfo.value.requestedCount,
        confirmExistingFees: confirmExistingFees.value,
        pctExportExceptionsCount: pctExportExceptions.value.length,
        confirmPctExceptions: confirmPctExceptions.value,
        needsForeignRates: needsForeignRates.value,
        ratesCheckedOn,
        ratesLoading: ratesLoading.value,
        missingRateCodes: missingRateCodes.value,
        usesManualRate: usesManualRate.value,
        manualRateDate: manualRateDate.value,
        isStale,
      })

      if (needsRateRefresh) {
        void loadPbcRates()
      }
      if (outcome.status === 'download_started' || outcome.status === 'download_completed' || outcome.status === 'generated') {
        exportWarnings.value = outcome.warnings
      }
      exportResultNotice.value = formatExportOutcomeNotice(outcome)
    } catch (err) {
      exportResultNotice.value = err instanceof Error ? err.message : '请款表生成失败'
    } finally {
      exporting.value = false
    }
  }

  if (options.isActive) {
    watch(options.isActive, active => {
      if (active && currentStep.value === 3) initStep3()
    })
  }

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
        if (currentStep.value === 3) initStep3()
        await nextTick()
      }
      if (!stillCurrent()) return
      restoring.value = false
    },
    { immediate: true },
  )

  function onBillingVisibility(): void {
    if (document.visibilityState === 'hidden') flushBilling()
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
    formatRate,
    loadPbcRates,
    updateRate,
    resetRate,
    reconciliationInfo,
    exporting,
    exportResultNotice,
    exportWarnings,
    confirmExistingFees,
    canAdvanceFromFees,
    exportDisabled,
    doExportExcel,
    recoveryNotice,
  }
}
