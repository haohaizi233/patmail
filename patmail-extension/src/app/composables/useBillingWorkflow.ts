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
  const legacyFileSurfaceOwner = ref<BillingTemplateId | ''>('')
  const legacyBillingFileSurface = computed(() =>
    legacyFileSurfaceOwner.value && selectedTemplateId.value === legacyFileSurfaceOwner.value
      ? 'billing-files'
      : '',
  )
  const billingTenantKey = computed(() => (billingScope.value ? `${billingScope.value}:${selectedTemplateId.value}` : ''))
  const currentTenantScope = computed(() =>
    billingScope.value
      ? templateDraftScope(billingOwner.value.origin, billingOwner.value.userId, selectedTemplateId.value)
      : '',
  )
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

  interface TemplateExportState {
    exporting: boolean
    progress: BatchExportProgress | null
    resultNotice: string
    warnings: string[]
    batchItems: BatchExportItemOutcome[]
  }

  const EMPTY_EXPORT_STATE: TemplateExportState = {
    exporting: false,
    progress: null,
    resultNotice: '',
    warnings: [],
    batchItems: [],
  }

  const exportScopeKey = computed(() => currentTenantScope.value || `__unbound__:${selectedTemplateId.value}`)
  const exportStates = shallowRef<Record<string, TemplateExportState>>({})

  function getExportState(scopeKey: string): TemplateExportState {
    return exportStates.value[scopeKey] ?? EMPTY_EXPORT_STATE
  }

  function patchExportState(scopeKey: string, patch: Partial<TemplateExportState>): void {
    const current = getExportState(scopeKey)
    exportStates.value = {
      ...exportStates.value,
      [scopeKey]: { ...current, ...patch },
    }
  }

  const exporting = computed<boolean>({
    get: () => getExportState(exportScopeKey.value).exporting,
    set: value => patchExportState(exportScopeKey.value, { exporting: value }),
  })
  const exportProgress = computed<BatchExportProgress | null>({
    get: () => getExportState(exportScopeKey.value).progress,
    set: value => patchExportState(exportScopeKey.value, { progress: value }),
  })
  const exportResultNotice = computed<string>({
    get: () => getExportState(exportScopeKey.value).resultNotice,
    set: value => patchExportState(exportScopeKey.value, { resultNotice: value }),
  })
  const exportWarnings = computed<string[]>({
    get: () => getExportState(exportScopeKey.value).warnings,
    set: value => patchExportState(exportScopeKey.value, { warnings: value }),
  })
  const exportBatchItems = computed<BatchExportItemOutcome[]>({
    get: () => getExportState(exportScopeKey.value).batchItems,
    set: value => patchExportState(exportScopeKey.value, { batchItems: value }),
  })
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
  watch(
    selectedFeeRows,
    () => {
      confirmExistingFees.value = false
      if (restoring.value) return
      patchExportState(exportScopeKey.value, {
        resultNotice: '',
        warnings: [],
        batchItems: [],
      })
    },
    { flush: 'sync' },
  )
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
    const jobTemplateId = selectedTemplateId.value
    const jobScope = exportScopeKey.value
    if (getExportState(jobScope).exporting) return
    if (needsForeignRates.value && ratesLoading.value) return
    const initialAccount = connection.value.operatorId
    const initialOrigin = connection.value.easyOrigin
    const initialBillingScope = billingScope.value
    patchExportState(jobScope, { exporting: true })
    try {
      if (canAutoRevalidateRecoveredBills.value || revalidatingBillsTask) {
        patchExportState(jobScope, { resultNotice: '正在自动验证已恢复的账单查询…' })
        await revalidateRecoveredBills()
      }
      if (
        selectedTemplateId.value !== jobTemplateId ||
        connection.value.operatorId !== initialAccount ||
        connection.value.easyOrigin !== initialOrigin ||
        billingScope.value !== initialBillingScope
      ) {
        patchExportState(jobScope, { resultNotice: '请款范围已变化，请核对后重新导出。' })
        return
      }
      const templateId = jobTemplateId
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
        patchExportState(jobScope, { resultNotice: selectionIssue })
        return
      }
      const accountOrScopeChanged = () =>
        connection.value.operatorId !== account ||
        connection.value.easyOrigin !== origin ||
        billingScope.value !== scope
      const preStartSelectionChanged = () =>
        selectedTemplateId.value !== templateId ||
        selectedFeeRows.value !== rows ||
        accountOrScopeChanged() ||
        billMap.value !== bills ||
        Boolean(billingExportSelectionIssue(selection()))
      const activeJobSelectionChanged = () =>
        accountOrScopeChanged() ||
        (selectedTemplateId.value === templateId &&
          !restoring.value &&
          (selectedFeeRows.value !== rows ||
            billMap.value !== bills ||
            Boolean(billingExportSelectionIssue(selection()))))

      if (needsForeignRates.value) await loadPbcRates()
      if (preStartSelectionChanged()) {
        patchExportState(jobScope, { resultNotice: '请款范围已变化，请核对后重新导出。' })
        return
      }
      const parameters = exportParameters.value
      const parametersJson = JSON.stringify(parameters)
      let lastProgressPhase = ''
      let latestProgress: BatchExportProgress | null = null
      let latestProgressNotice = ''
      const exportProgressCoalescer = createLeadingFrameCoalescer(() => {
        if (!latestProgress) return
        patchExportState(jobScope, {
          progress: latestProgress,
          resultNotice: latestProgressNotice,
        })
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
        isStale: () =>
          activeJobSelectionChanged() ||
          (selectedTemplateId.value === templateId &&
            !restoring.value &&
            JSON.stringify(exportParameters.value) !== parametersJson),
      }
      const precheck = validateBillingExportPreconditions(exportCommand)
      if (!precheck.ok) {
        patchExportState(jobScope, {
          resultNotice: precheck.needsRateRefresh && ratesError.value ? ratesError.value : precheck.reason,
        })
        return
      }
      const splitCount = !parameters.allowMixedCustomers && selectedCustomerGroups.value.length > 1
        ? selectedCustomerGroups.value.length
        : 0
      patchExportState(jobScope, {
        progress: null,
        resultNotice: splitCount
          ? `正在按客户流水线并发导出 ${splitCount} 份 Excel 请款表…`
          : '正在生成 Excel 请款表…',
        warnings: [],
        batchItems: [],
      })
      try {
        const { outcome } = await service.exportBilling(exportCommand)
        const outcomePatch: Partial<TemplateExportState> = {
          resultNotice: formatExportOutcomeNotice(outcome),
        }
        if (
          outcome.status === 'download_started' ||
          outcome.status === 'download_completed' ||
          outcome.status === 'generated' ||
          outcome.status === 'batch_completed'
        ) {
          outcomePatch.warnings = outcome.warnings
        }
        if (outcome.status === 'batch_completed') {
          outcomePatch.batchItems = outcome.items
        }
        patchExportState(jobScope, outcomePatch)
      } finally {
        exportProgressCoalescer.cancel()
      }
    } catch (err) {
      patchExportState(jobScope, {
        resultNotice: err instanceof Error ? err.message : '请款表生成失败',
      })
    } finally {
      patchExportState(jobScope, {
        progress: null,
        exporting: false,
      })
    }
  }

  watch(shouldWatchRates, active => { if (active) checkRatesWhileVisible() }, { immediate: true })

  interface PendingBillingDraft {
    accountScope: string
    templateId: BillingTemplateId
    snapshot: BillingDeskSnapshot
    failed: boolean
    conflict: boolean
  }

  type LegacyDraftLookup =
    | { ok: true; draft: BillingDeskSnapshot | null }
    | { ok: false; draft: null }

  function isRecoveryConflictError(err: unknown): boolean {
    return err instanceof Error && err.message.includes('RECOVERY_CONFLICT')
  }

  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let persistIdleId: number | undefined
  let draftRevision = 0
  let lastFlushedRevision = 0
  let disposed = false
  let restoreGeneration = 0
  let legacyDraftScopeChecked = ''
  let cachedLegacyDraft: BillingDeskSnapshot | null = null
  const pendingDrafts = new Map<string, PendingBillingDraft>()
  const recoveryNoticeByScope = ref<Record<string, string>>({})
  const draftConflictByScope = ref<Record<string, boolean>>({})
  const resolvingDraftConflict = ref(false)

  function setRecoveryNotice(scopeKey: string, message: string): void {
    if (!scopeKey) return
    const next = { ...recoveryNoticeByScope.value }
    if (message) next[scopeKey] = message
    else delete next[scopeKey]
    recoveryNoticeByScope.value = next
  }

  function setDraftConflict(scopeKey: string, conflicted: boolean): void {
    if (!scopeKey) return
    const next = { ...draftConflictByScope.value }
    if (conflicted) next[scopeKey] = true
    else delete next[scopeKey]
    draftConflictByScope.value = next
  }

  const recoveryNotice = computed<string>({
    get: () => (currentTenantScope.value ? (recoveryNoticeByScope.value[currentTenantScope.value] ?? '') : ''),
    set: value => {
      if (!currentTenantScope.value) return
      setRecoveryNotice(currentTenantScope.value, value)
    },
  })

  const hasDraftConflict = computed(() =>
    Boolean(currentTenantScope.value && draftConflictByScope.value[currentTenantScope.value]),
  )

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

  const draftSeqByScope = new Map<string, number>()
  function getDraftSeq(scopeKey: string): number {
    return draftSeqByScope.get(scopeKey) ?? 0
  }
  function bumpDraftSeq(scopeKey: string): number {
    const next = getDraftSeq(scopeKey) + 1
    draftSeqByScope.set(scopeKey, next)
    return next
  }

  function persistDraftSnapshot(
    targetScope: string,
    accountScope: string,
    templateId: BillingTemplateId,
    snapshot: BillingDeskSnapshot,
    flushedRev?: number,
  ): void {
    const seq = bumpDraftSeq(targetScope)
    pendingDrafts.set(targetScope, { accountScope, templateId, snapshot, failed: false, conflict: false })
    setRecoveryNotice(targetScope, '')
    setDraftConflict(targetScope, false)
    void service
      .saveDraft(targetScope, snapshot)
      .then(() => {
        if (getDraftSeq(targetScope) !== seq) return
        const current = pendingDrafts.get(targetScope)
        if (current && current.snapshot === snapshot) {
          pendingDrafts.delete(targetScope)
          setRecoveryNotice(targetScope, '')
          setDraftConflict(targetScope, false)
        }
      })
      .catch(err => {
        if (getDraftSeq(targetScope) !== seq) return
        const conflict = isRecoveryConflictError(err)
        const current = pendingDrafts.get(targetScope)
        if (current && current.snapshot === snapshot) {
          current.failed = true
          current.conflict = conflict
          setDraftConflict(targetScope, conflict)
          setRecoveryNotice(
            targetScope,
            conflict
              ? '草稿已在其他标签页更新，当前页未保存。可选择「以当前页覆盖保存」或「载入最新草稿」。'
              : '请款草稿未能保存，刷新前请保留当前页面。',
          )
        }
        if (
          !conflict &&
          flushedRev !== undefined &&
          billingScope.value === accountScope &&
          selectedTemplateId.value === templateId &&
          lastFlushedRevision === flushedRev
        ) {
          lastFlushedRevision = -1
        }
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
    persistDraftSnapshot(targetScope, scope, targetTemplateId, snapshot, flushedRev)
  }

  function retryPendingDrafts(accountScope: string = billingScope.value): void {
    if (!accountScope || disposed) return
    for (const [targetScope, entry] of [...pendingDrafts.entries()]) {
      if (!entry.failed || entry.conflict || entry.accountScope !== accountScope) continue
      persistDraftSnapshot(targetScope, entry.accountScope, entry.templateId, entry.snapshot)
    }
  }

  async function overwriteConflictedDraft(): Promise<boolean> {
    const accountScope = billingScope.value
    const targetScope = currentTenantScope.value
    const templateId = selectedTemplateId.value
    if (!accountScope || !targetScope || resolvingDraftConflict.value) return false
    const snapshot = feeQueryRef.value ? billingSnapshot(templateId) : pendingDrafts.get(targetScope)?.snapshot
    if (!snapshot) return false
    cancelPendingPersist()
    resolvingDraftConflict.value = true
    const mySeq = bumpDraftSeq(targetScope)
    pendingDrafts.set(targetScope, { accountScope, templateId, snapshot, failed: false, conflict: false })
    setDraftConflict(targetScope, false)
    setRecoveryNotice(targetScope, '')
    try {
      await service.loadDraft(targetScope)
      if (getDraftSeq(targetScope) !== mySeq) {
        return true
      }
      cancelPendingPersist()
      const snapshotToSave =
        selectedTemplateId.value === templateId &&
        billingScope.value === accountScope &&
        feeQueryRef.value
          ? billingSnapshot(templateId)
          : snapshot
      const flushedRev = draftRevision
      pendingDrafts.set(targetScope, {
        accountScope,
        templateId,
        snapshot: snapshotToSave,
        failed: false,
        conflict: false,
      })
      await service.saveDraft(targetScope, snapshotToSave)
      if (getDraftSeq(targetScope) !== mySeq) {
        return true
      }
      const current = pendingDrafts.get(targetScope)
      if (current && current.snapshot === snapshotToSave) {
        pendingDrafts.delete(targetScope)
      }
      setDraftConflict(targetScope, false)
      setRecoveryNotice(targetScope, '')
      if (
        billingScope.value === accountScope &&
        selectedTemplateId.value === templateId
      ) {
        lastFlushedRevision = flushedRev
        if (draftRevision !== flushedRev) {
          scheduleBillingPersist(50)
        }
      }
      return true
    } catch (err) {
      if (getDraftSeq(targetScope) !== mySeq) {
        return true
      }
      const conflict = isRecoveryConflictError(err)
      const current = pendingDrafts.get(targetScope)
      if (current) {
        current.failed = true
        current.conflict = conflict
      }
      setDraftConflict(targetScope, conflict)
      setRecoveryNotice(
        targetScope,
        conflict
          ? '草稿仍在其他标签页发生更新，请再次点击「以当前页覆盖保存」或「载入最新草稿」。'
          : '请款草稿未能保存，刷新前请保留当前页面。',
      )
      return false
    } finally {
      resolvingDraftConflict.value = false
    }
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

  async function readLegacyDraftIfNeeded(accountScope: string): Promise<LegacyDraftLookup> {
    if (legacyDraftScopeChecked === accountScope) {
      return { ok: true, draft: cachedLegacyDraft }
    }
    try {
      const legacy = await service.loadDraft(accountScope)
      legacyDraftScopeChecked = accountScope
      cachedLegacyDraft = legacy?.version === 1 && isValidBillingTemplateId(legacy.template) ? legacy : null
      return { ok: true, draft: cachedLegacyDraft }
    } catch {
      return { ok: false, draft: null }
    }
  }

  async function reloadLatestDraft(): Promise<boolean> {
    const accountScope = billingScope.value
    const targetScope = currentTenantScope.value
    const templateId = selectedTemplateId.value
    if (!accountScope || !targetScope || resolvingDraftConflict.value) return false
    resolvingDraftConflict.value = true
    const mySeq = bumpDraftSeq(targetScope)
    const generation = ++restoreGeneration
    const stillCurrent = () => !disposed && generation === restoreGeneration
    restoring.value = true
    cancelPendingPersist()
    try {
      const latest = await service.loadDraft(targetScope)
      if (!stillCurrent() || getDraftSeq(targetScope) !== mySeq) return false
      pendingDrafts.delete(targetScope)
      setDraftConflict(targetScope, false)
      setRecoveryNotice(targetScope, '')
      if (latest?.version === 1 && latest.template === templateId) {
        await applyRestoredDraft(latest, stillCurrent)
        if (!stillCurrent()) return false
      } else {
        applyTemplateDefaults(templateId, 1)
      }
      draftRevision = 0
      lastFlushedRevision = 0
      return true
    } catch (err) {
      if (stillCurrent() && getDraftSeq(targetScope) === mySeq) {
        setRecoveryNotice(
          targetScope,
          err instanceof Error ? `载入最新草稿失败：${err.message}` : '载入最新草稿失败，请稍后重试。',
        )
      }
      return false
    } finally {
      if (stillCurrent()) restoring.value = false
      resolvingDraftConflict.value = false
    }
  }

  watch(
    confirmedScope,
    async scope => {
      if (!scope) {
        legacyFileSurfaceOwner.value = ''
        return
      }
      if (scope === billingScope.value) {
        if (!legacyFileSurfaceOwner.value) {
          const legacyLookup = await readLegacyDraftIfNeeded(scope)
          if (!disposed && confirmedScope.value === scope && legacyLookup.ok) {
            legacyFileSurfaceOwner.value = legacyLookup.draft?.template ?? 'general-foreign'
          }
        }
        return
      }
      const generation = ++restoreGeneration
      const stillCurrent = () => !disposed && generation === restoreGeneration
      flushBilling()
      restoring.value = true
      billingScope.value = scope
      billingOwner.value = { origin: connection.value.easyOrigin, userId: connection.value.operatorId }
      legacyDraftScopeChecked = ''
      cachedLegacyDraft = null
      legacyFileSurfaceOwner.value = ''
      draftRevision = 0
      lastFlushedRevision = 0
      const preferredTemplate = readSavedActiveTemplate(scope)
      const initialTemplate: BillingTemplateId = preferredTemplate ?? 'general-foreign'
      const initialTargetScope = templateDraftScope(
        connection.value.easyOrigin,
        connection.value.operatorId,
        initialTemplate,
      )
      const initialPending = pendingDrafts.get(initialTargetScope)
      if (!initialPending?.failed) {
        setRecoveryNotice(initialTargetScope, '')
        setDraftConflict(initialTargetScope, false)
      }
      selectedTemplateId.value = initialTemplate
      applyTemplateDefaults(initialTemplate, 1)
      let state: BillingDeskSnapshot | null = initialPending?.snapshot ?? null
      let activePending = initialPending
      if (!initialPending) {
        state = await service
          .loadDraft(initialTargetScope)
          .catch(() => {
            if (stillCurrent()) setRecoveryNotice(initialTargetScope, '请款草稿暂时无法读取。')
            return null
          })
        if (!stillCurrent()) return
      }
      const legacyLookup = await readLegacyDraftIfNeeded(scope)
      if (!stillCurrent()) return
      if (legacyLookup.ok) {
        legacyFileSurfaceOwner.value = legacyLookup.draft?.template ?? 'general-foreign'
        const legacy = legacyLookup.draft
        if (!state && legacy && (!preferredTemplate || legacy.template === initialTemplate)) {
          state = legacy
          writeSavedActiveTemplate(scope, legacy.template)
          if (legacy.template !== initialTemplate) {
            const switchedScope = templateDraftScope(
              connection.value.easyOrigin,
              connection.value.operatorId,
              legacy.template,
            )
            activePending = pendingDrafts.get(switchedScope)
            if (activePending) state = activePending.snapshot
            selectedTemplateId.value = legacy.template
            applyTemplateDefaults(legacy.template, 1)
          }
        }
      }
      if (state?.version === 1 && isValidBillingTemplateId(state.template)) {
        const finalScopeKey = templateDraftScope(
          billingOwner.value.origin,
          billingOwner.value.userId,
          state.template,
        )
        activePending = pendingDrafts.get(finalScopeKey) ?? activePending
        await applyRestoredDraft(state, stillCurrent)
      }
      if (!stillCurrent()) return
      draftRevision = activePending?.failed && !activePending.conflict ? 1 : 0
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
    const nextTargetScope = accountScope ? templateDraftScope(ownerOrigin, ownerUserId, nextId) : ''
    const pending = nextTargetScope ? pendingDrafts.get(nextTargetScope) : undefined
    if (nextTargetScope && !pending?.failed) {
      setRecoveryNotice(nextTargetScope, '')
      setDraftConflict(nextTargetScope, false)
    }
    applyTemplateDefaults(nextId, fallbackStep)
    if (!accountScope) {
      restoring.value = false
      return
    }
    let state: BillingDeskSnapshot | null = pending?.snapshot ?? null
    if (!pending) {
      state = await service.loadDraft(nextTargetScope).catch(() => {
        if (stillCurrent()) setRecoveryNotice(nextTargetScope, '请款草稿暂时无法读取。')
        return null
      })
      if (!stillCurrent()) return
    }
    if (!state || !legacyFileSurfaceOwner.value) {
      const legacyLookup = await readLegacyDraftIfNeeded(accountScope)
      if (!stillCurrent()) return
      if (legacyLookup.ok) {
        legacyFileSurfaceOwner.value = legacyLookup.draft?.template ?? 'general-foreign'
        if (!state && legacyLookup.draft?.template === nextId) {
          state = legacyLookup.draft
        }
      }
    }
    if (state?.version === 1 && state.template === nextId) {
      await applyRestoredDraft(state, stillCurrent)
      if (!stillCurrent()) return
    }
    const finalPending = pendingDrafts.get(nextTargetScope)
    draftRevision = finalPending?.failed && !finalPending.conflict ? 1 : 0
    lastFlushedRevision = 0
    restoring.value = false
  }, { flush: 'sync' })

  function onBillingVisibility(): void {
    if (document.visibilityState === 'hidden') {
      flushBilling()
      retryPendingDrafts()
    } else {
      checkRatesWhileVisible()
    }
  }
  function onBillingPageHide(): void {
    flushBilling()
    retryPendingDrafts()
  }
  document.addEventListener('visibilitychange', onBillingVisibility)
  window.addEventListener('focus', checkRatesWhileVisible)
  window.addEventListener('pagehide', onBillingPageHide)
  onBeforeUnmount(() => {
    flushBilling()
    retryPendingDrafts()
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
    legacyBillingFileSurface,
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
    hasDraftConflict,
    resolvingDraftConflict,
    overwriteConflictedDraft,
    reloadLatestDraft,
  }
}
