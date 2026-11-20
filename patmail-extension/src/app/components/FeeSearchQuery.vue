<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { fileSearchTimeoutMs, type FileSearchTimeoutMs } from '../../api/file-search-params'
import type { NormalizedDictionary } from '../../api/dictionaries'
import { choicesFromDictionary } from '../../api/dictionaries/picker-catalog'
import { isUnrequestedFee } from '../../billing/fee-model'
import type { FeeSearchQuery } from '../../api/fee-search-params'
import type { FeeApplicantItem, FeeInitData, FeeOptionItem, FeeSearchResult, FeeSearchRow } from '../../api/fee-search-types'
import { sortFeeRows } from '../../billing/fee-model'
import { runPagedFetch } from '../page-pool'
import { paintTaskCheckProgress, resetTaskCheckProgress, type TaskCheckStatus, taskCheckProgress } from '../check-progress'
import type { HistoryQueryOption } from '../../api/query-history'
import {
  FEE_COMMON_CELLS,
  FEE_QUICK_CELLS,
  FEE_ADVANCED_BLOCKS,
  FEE_SELECTS,
  FEE_STATIC_TREES,
  FEE_OPTION_KEYS,
  FEE_ADVANCED_KEYS,
  FEE_CHECK_KEYS,
  buildFeeQueryXml,
  feeCellKey,
  isFeeSearchInputField,
  parseFeeCustomerRefs,
  readFeeQueryXml,
  sanitizeFeeFieldValue,
  type FeeCell
} from '../../api/fee-form'
import { readFilingTimeout, writeFilingTimeout } from '../../api/query-timeout'
import { isQueryGuid } from '../../query/query-validator'
import { TemplateLoadCoordinator } from '../../query/load-coordinator'
import { historyLabels } from '../../query/history-labels'
import { downloadTemplateJson, readTemplateJson, templateJsonFileName, templateJsonText } from '../../query/template-json'
import { MessageType, type MessageBridge } from '../../shared/message'
import { confirmDialog, infoDialog } from '../dialog'
import { useWorkspace } from '../composables/useWorkspace'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import TreeOptionSelect from '../../shell/components/TreeOptionSelect.vue'
import WDatePicker from '../../shell/components/WDatePicker.vue'
import type { FeeExportMode } from '../../api/fee-export'
import FeeCustomerPickerModal, { type SelectedCustomerEntry } from './FeeCustomerPickerModal.vue'
import FeeExportModal from './FeeExportModal.vue'

const props = defineProps<{
  bridge?: MessageBridge
  userId: string
  canSearch: boolean
  manage?: boolean
  initialValues?: Record<string, string>
  initialToken?: number
  defaultSelectionExclusion?: (row: FeeSearchRow) => string
  includeTranslationWordCounts?: boolean
}>()

const emit = defineEmits<{
  searched: [query: FeeSearchQuery]
  export: [rows: FeeSearchRow[]]
  'selection-change': [rows: FeeSearchRow[]]
}>()

const injectedBridge = inject<MessageBridge>('bridge')

function activeBridge(): MessageBridge | undefined {
  return props.bridge ?? injectedBridge
}

const canRead = computed(() => Boolean(activeBridge() && props.userId))

useWorkspace()

// Timeout
const queryTimeoutMs = ref<FileSearchTimeoutMs>(60_000)
const timeoutOptions = [
  { value: 60_000, label: '1 分钟' },
  { value: 120_000, label: '2 分钟' },
  { value: 300_000, label: '5 分钟' },
  { value: 600_000, label: '10 分钟' }
]

onMounted(() => {
  void readFilingTimeout().then(value => {
    queryTimeoutMs.value = value
  })
})

watch(queryTimeoutMs, value => {
  void writeFilingTimeout(value)
}, { flush: 'sync' })

// Form Values (all default empty matching live FeeSearch.aspx)
const values = ref<Record<string, string>>({
  case_type: '',
  pay_status: '',
  is_close: '',
  is_ahead_pub: '',
  hearing_the_case: '',
  sourcetype: '',
  contact_type: '',
  notice_status: '',
  receive_account_id: '',
  business_coop: '',
  exists_invoice_no: '',
  bill_no: '',
  case_agency_precorditem: '',
  case_agency: ''
})

// Checkboxes: ALL default unchecked (checked: false, verified via CDP on FeeSearch.aspx)
const checkedBoxes = ref<Record<string, boolean>>({})

// Secondary modal customer selections (ShowIhgSelect -> customer_id / ruleOutcustomer_id)
const selectedCustomers = ref<SelectedCustomerEntry[]>([])
const selectedRuleOutCustomers = ref<SelectedCustomerEntry[]>([])
const customerModalOpen = ref(false)
const customerModalTarget = ref<'customer_id' | 'ruleOutcustomer_id'>('customer_id')

// Applicant tree loaded dynamically via Report.ashx?Call=GetTreeApplicant
const applicantOptions = ref<FeeApplicantItem[]>([])
const loadingApplicants = ref(false)

function valueOf(key: string): string {
  return values.value[key] ?? ''
}

function setValue(key: string, val: string): void {
  values.value[key] = val

  // 联动逻辑严格对齐 FeeSearch.js
  if (key === 'case_type') {
    values.value['apply_type'] = ''
    values.value['fee_type'] = ''
    values.value['ctrl_proc'] = ''
    values.value['case_status'] = ''
    values.value['customer_status'] = ''
    values.value['review_stage'] = ''
    values.value['business_type'] = ''
    void refreshCtrlProc()
  } else if (key === 'country') {
    values.value['fee_type'] = ''
    values.value['ctrl_proc'] = ''
    void refreshCtrlProc()
  } else if (key === 'fee_class' || key === 'apply_type') {
    values.value['fee_type'] = ''
  } else if (key === 'applicant_id') {
    if (!val.trim()) {
      checkedBoxes.value['first_applicant'] = false
    }
  }
}

function isChecked(key: string): boolean {
  return Boolean(checkedBoxes.value[key])
}

function toggleCheck(key: string, checked: boolean): void {
  checkedBoxes.value[key] = checked

  // 日期“为空”(_isnull)联动：勾选时清空对应日期起止并禁用输入框（FeeSearch.js L752-762）
  if (key.endsWith('_isnull')) {
    const baseKey = key.replace('_isnull', '')
    if (checked) {
      values.value[`${baseKey}_from`] = ''
      values.value[`${baseKey}_to`] = ''
    }
  }
}

function onTextInput(key: string, e: Event): void {
  setValue(key, (e.target as HTMLInputElement | HTMLTextAreaElement).value)
}

// Secondary modal handlers (客户名称 / 排除客户名称)
function openCustomerModal(target: 'customer_id' | 'ruleOutcustomer_id'): void {
  customerModalTarget.value = target
  customerModalOpen.value = true
}

function customerDisplayText(key: 'customer_id' | 'ruleOutcustomer_id'): string {
  const list = key === 'customer_id' ? selectedCustomers.value : selectedRuleOutCustomers.value
  if (!list.length) return ''
  return list.map(item => item.name).join(';') + ';'
}

function clearCustomerField(key: 'customer_id' | 'ruleOutcustomer_id'): void {
  if (key === 'customer_id') {
    selectedCustomers.value = []
    values.value['customer_id'] = ''
    void loadApplicantsForCustomers('')
  } else {
    selectedRuleOutCustomers.value = []
    values.value['ruleOutcustomer_id'] = ''
  }
}

function onConfirmCustomers(items: SelectedCustomerEntry[]): void {
  customerModalOpen.value = false
  const ids = items.map(item => item.id).join(';')
  if (customerModalTarget.value === 'customer_id') {
    selectedCustomers.value = items
    values.value['customer_id'] = ids
    void loadApplicantsForCustomers(ids)
  } else {
    selectedRuleOutCustomers.value = items
    values.value['ruleOutcustomer_id'] = ids
  }
}

async function loadApplicantsForCustomers(customerIds: string, preserveSelected = false): Promise<void> {
  // 对齐 FeeSearch.LoadTreeApplicant (L1188-1203)
  if (!preserveSelected) {
    values.value['applicant_id'] = ''
    checkedBoxes.value['first_applicant'] = false
  }
  applicantOptions.value = []
  if (!customerIds.trim()) return
  const b = activeBridge()
  if (!b) return
  loadingApplicants.value = true
  try {
    const resp = await b.request({
      type: MessageType.LoadFeeApplicants,
      payload: { customerIds }
    })
    if (resp.type === MessageType.LoadFeeApplicantsResult && resp.payload.ok) {
      applicantOptions.value = resp.payload.data
    }
  } finally {
    loadingApplicants.value = false
  }
}

// Show/hide advanced search & individual advanced section collapse
const showAdvanced = ref(false)
const collapsedBlocks = ref<Record<string, boolean>>({})

function toggleBlock(id: string): void {
  collapsedBlocks.value[id] = !collapsedBlocks.value[id]
}

// Result display & selection radios (对齐 FeeSearch.js L637-671)
const showTypeMode = ref<'all' | 'selected'>('all')
const quickFeeSelectMode = ref<'' | 'O' | 'A'>('')

// Pickers, Dictionaries & FeeSearchInit Data
const loadingPickers = ref(false)
const pickersReady = ref(false)
const pickerMessage = ref('')
const dictionaries = ref<Record<string, NormalizedDictionary>>({})
const feeInit = ref<FeeInitData | null>(null)

function buildPickerPayload(force: boolean): { kind: 'picker'; force: boolean; caseTypeId?: string; country?: string } {
  const caseTypeId = valueOf('case_type').trim()
  const country = valueOf('country').trim()
  return {
    kind: 'picker',
    force: Boolean(force),
    ...(caseTypeId ? { caseTypeId } : {}),
    ...(country ? { country } : {})
  }
}

async function loadPickers(force = false): Promise<void> {
  const b = activeBridge()
  if (!b) return
  loadingPickers.value = true
  pickerMessage.value = '正在向原网站读取费用查询字典…'
  try {
    const [dictResp, initResp] = await Promise.all([
      b.request({
        type: MessageType.LoadDictionary,
        payload: buildPickerPayload(force)
      }),
      b.request({
        type: MessageType.LoadFeeInit
      })
    ])
    const errors: string[] = []
    if (dictResp.type === MessageType.DictionaryResult && dictResp.payload.ok && dictResp.payload.data.kind === 'picker') {
      dictionaries.value = dictResp.payload.data.dictionaries
      pickersReady.value = true
    } else if (dictResp.type === MessageType.Error) {
      errors.push(dictResp.payload.message)
    } else if (dictResp.type === MessageType.DictionaryResult && !dictResp.payload.ok) {
      errors.push(dictResp.payload.error.message)
    }
    if (initResp.type === MessageType.LoadFeeInitResult && initResp.payload.ok) {
      feeInit.value = initResp.payload.data
      pickersReady.value = true
    } else if (initResp.type === MessageType.Error) {
      errors.push(initResp.payload.message)
    } else if (initResp.type === MessageType.LoadFeeInitResult && !initResp.payload.ok) {
      errors.push(initResp.payload.error.message)
    }
    pickerMessage.value = errors.length
      ? `字典读取未完全成功：${errors[0]}`
      : ''
  } catch (e: unknown) {
    pickerMessage.value = e instanceof Error ? e.message : '读取下拉字典失败'
  } finally {
    loadingPickers.value = false
  }
}

async function refreshCtrlProc(): Promise<void> {
  const b = activeBridge()
  if (!b) return
  try {
    const resp = await b.request({
      type: MessageType.LoadDictionary,
      payload: buildPickerPayload(false)
    })
    if (resp.type === MessageType.DictionaryResult && resp.payload.ok && resp.payload.data.kind === 'picker') {
      dictionaries.value = resp.payload.data.dictionaries
    }
  } catch {
    // Non-fatal refresh
  }
}

onMounted(() => {
  void loadPickers()
})

watch(() => props.canSearch, ready => {
  if (ready && !pickersReady.value && !loadingPickers.value) {
    void loadPickers()
  }
})

// Dynamic label for custom columns (column_1..5 from GetFieldColumn)
function labelOf(cell: FeeCell): string {
  if (cell.kind === 'spacer') return ''
  if (cell.kind === 'text' && cell.key.startsWith('column_') && feeInit.value?.fieldColumns[cell.key]) {
    return feeInit.value.fieldColumns[cell.key]
  }
  return cell.label
}

// Select options (live FeeSearchInit + fallback)
function selectOptions(key: string): Array<{ value: string; label: string }> {
  const init = feeInit.value
  if (key === 'case_type' && init?.caseTypes.length) {
    return [{ value: '', label: 'ALL' }, ...init.caseTypes.map(i => ({ value: i.value, label: i.label }))]
  }
  if (key === 'sourcetype' && init?.sourceTypes.length) {
    return [{ value: '', label: '--请选择--' }, ...init.sourceTypes.map(i => ({ value: i.value, label: i.label }))]
  }
  if (key === 'contact_type' && init?.contactTypes.length) {
    return [{ value: '', label: '--请选择--' }, ...init.contactTypes.map(i => ({ value: i.value, label: i.label }))]
  }
  if (key === 'receive_account_id' && init?.bankList.length) {
    return [{ value: '', label: '--请选择--' }, ...init.bankList.map(i => ({ value: i.value, label: i.label }))]
  }
  if (key === 'business_coop') {
    const dict = dictionaries.value['filingContract']
    const live = choicesFromDictionary(dict)
    if (live.length) return [{ value: '', label: '--请选择--' }, ...live.map(i => ({ value: i.value, label: i.label }))]
  }
  if ((key === 'case_agency_precorditem' || key === 'case_agency') && init?.agencies.length) {
    return [{ value: '', label: 'ALL' }, ...init.agencies.map(i => ({ value: i.value, label: i.label }))]
  }
  return FEE_SELECTS[key] ?? []
}

// FeeType cascading & duplicate disambiguation (exact port of FeeSearch.js L1305-1393)
function computeFeeTypeChoices(): FeeOptionItem[] {
  const init = feeInit.value
  if (!init?.feeTypes.length) return []
  const caseType = valueOf('case_type')
  const country = valueOf('country')
  const applyType = valueOf('apply_type')
  const feeClass = valueOf('fee_class')

  const filtered = init.feeTypes
    .filter(row => {
      if (feeClass && !feeClass.split(',').includes(row.feeClass)) return false
      const matchCase = !caseType || row.caseTypeId === caseType || row.caseTypeId === 'ALL'
      const matchCountry = !country || country.split(',').includes(row.countryId) || row.countryId === 'ALL'
      const matchApply = !applyType || applyType.split(',').includes(row.applyTypeId) || row.applyTypeId === 'ALL'
      return matchCase && matchCountry && matchApply
    })
    .map(row => ({
      id: row.id,
      name: row.name,
      countryName: row.countryName,
      applyTypeName: row.applyTypeName,
      caseTypeName: row.caseTypeName,
      feeClassName: row.feeClass === 'O' ? '官费' : row.feeClass === 'A' ? '代理费' : row.feeClass === 'T' ? '第三方费用' : '',
      currencyName: row.currencyName
    }))

  for (let i = 0; i < filtered.length; i++) {
    for (let j = i + 1; j < filtered.length; j++) {
      if (filtered[i].name === filtered[j].name) {
        if (filtered[i].countryName !== filtered[j].countryName) {
          if (filtered[i].countryName) filtered[i].name += `(${filtered[i].countryName})`
          if (filtered[j].countryName) filtered[j].name += `(${filtered[j].countryName})`
        }
        if (filtered[i].applyTypeName !== filtered[j].applyTypeName) {
          if (filtered[i].applyTypeName) filtered[i].name += `(${filtered[i].applyTypeName})`
          if (filtered[j].applyTypeName) filtered[j].name += `(${filtered[j].applyTypeName})`
        }
        if (filtered[i].caseTypeName !== filtered[j].caseTypeName) {
          if (filtered[i].caseTypeName) filtered[i].name += `(${filtered[i].caseTypeName})`
          if (filtered[j].caseTypeName) filtered[j].name += `(${filtered[j].caseTypeName})`
        }
        if (filtered[i].feeClassName !== filtered[j].feeClassName) {
          if (filtered[i].feeClassName) filtered[i].name += `(${filtered[i].feeClassName})`
          if (filtered[j].feeClassName) filtered[j].name += `(${filtered[j].feeClassName})`
        }
        if (filtered[i].currencyName !== filtered[j].currencyName) {
          if (filtered[i].currencyName) filtered[i].name += `(${filtered[i].currencyName})`
          if (filtered[j].currencyName) filtered[j].name += `(${filtered[j].currencyName})`
        }
      }
    }
  }
  return filtered.map(item => ({ value: item.id, label: item.name }))
}

// TreeOptionSelect choices for all named fields (exact alignment with FeeSearch.js)
function treeChoices(key: string): FeeOptionItem[] {
  const init = feeInit.value
  const caseType = valueOf('case_type')
  const country = valueOf('country')

  if (key === 'Case_direction') {
    return init?.directions.length ? init.directions : FEE_STATIC_TREES.Case_direction
  }
  if (key === 'fee_class') {
    return FEE_STATIC_TREES.fee_class
  }
  if (key === 'request_status') {
    return FEE_STATIC_TREES.request_status
  }
  if (key === 'receive_status') {
    return init?.receiveStatuses.length ? init.receiveStatuses : FEE_STATIC_TREES.receive_status
  }
  if (key === 'pay_type') {
    return init?.payTypes.length ? init.payTypes : FEE_STATIC_TREES.pay_type
  }
  if (key === 'app_date_month') {
    return FEE_STATIC_TREES.app_date_month
  }
  if (key === 'case_agency_precorditem' || key === 'case_agency') {
    return init?.agencies ?? []
  }
  if (key === 'fee_type') {
    if (!caseType) return []
    return computeFeeTypeChoices()
  }
  if (key === 'apply_type') {
    if (!caseType) return []
    if (init?.applyTypes.length) {
      return init.applyTypes.filter(i => !i.caseTypeId || i.caseTypeId === 'ALL' || i.caseTypeId === caseType)
    }
    return choicesFromDictionary(dictionaries.value['limitApplyType'], caseType, country)
  }
  if (key === 'case_status') {
    if (!caseType) return []
    if (init?.caseStatuses.length) {
      return init.caseStatuses.filter(i => i.caseTypeId === caseType)
    }
    return choicesFromDictionary(dictionaries.value['limitCaseStatus'], caseType, country)
  }
  if (key === 'customer_status') {
    if (!caseType) return []
    if (init?.customerStatuses.length) {
      return init.customerStatuses.filter(i => i.caseTypeId === caseType)
    }
    return choicesFromDictionary(dictionaries.value['limitCustomerStatus'], caseType, country)
  }
  if (key === 'review_stage') {
    const targetCaseType = caseType || '31D1A147-2931-43B5-94AE-B72B1525BA8A'
    if (init?.reviewStages.length) {
      return init.reviewStages.filter(i => !i.caseTypeId || i.caseTypeId === targetCaseType)
    }
    return []
  }
  if (key === 'business_type') {
    if (init?.bussTypes.length) {
      return caseType
        ? init.bussTypes.filter(i => !i.caseTypeId || i.caseTypeId === caseType)
        : init.bussTypes
    }
    return choicesFromDictionary(dictionaries.value['limitBussType'], caseType, country)
  }
  if (key === 'currency_id') {
    return init?.currencies ?? []
  }
  if (key === 'product_name') {
    return init?.products ?? []
  }
  if (key === 'technical_field') {
    return init?.technicals ?? []
  }

  const dictKey = FEE_OPTION_KEYS[key]
  if (!dictKey) return []
  return choicesFromDictionary(dictionaries.value[dictKey], caseType, country)
}

function needsCaseType(cell: Extract<FeeCell, { kind: 'named' }>): boolean {
  return Boolean((cell.requiresCaseType || cell.key === 'case_status' || cell.key === 'customer_status') && !valueOf('case_type'))
}

function emptyTextOf(cell: Extract<FeeCell, { kind: 'named' }>): string {
  if (needsCaseType(cell)) {
    return '请先选择案件类型'
  }
  return `暂无${cell.label}可选项`
}

function onNamedTriggerClick(cell: Extract<FeeCell, { kind: 'named' }>): void {
  if (needsCaseType(cell)) {
    void infoDialog({
      title: '请先选择案件类型',
      message: `请先选择「案件类型」，再选择「${cell.label}」。`
    })
  }
}

function onApplicantGuardClick(): void {
  void infoDialog({
    title: '请先选择客户',
    message: '请先在左侧「客户名称」中通过弹窗选择客户，再选择「申请人」。'
  })
}

// Search State & Pagination
const searchState = ref<'idle' | 'loading' | 'error' | 'empty' | 'success'>('idle')
const searchMessage = ref('')
const result = ref<FeeSearchResult | null>(null)
const pageIndex = ref(1)
const pageSize = ref(10)
const pageSizeOptions = [
  { value: 10, label: '10 条/页' },
  { value: 15, label: '15 条/页' },
  { value: 20, label: '20 条/页' },
  { value: 30, label: '30 条/页' },
  { value: 50, label: '50 条/页' },
  { value: 100, label: '100 条/页' }
]

// Row Selection
const selectedIds = ref<Record<string, boolean>>({})
const selectedCount = computed(() => Object.values(selectedIds.value).filter(Boolean).length)
const selectedFeeIds = computed(() =>
  Object.entries(selectedIds.value)
    .filter(([, checked]) => checked)
    .map(([id]) => id)
)
const allKnownRows = ref<Map<string, FeeSearchRow>>(new Map())

const selectedRowsList = computed(() => {
  const list = selectedFeeIds.value.map(id => allKnownRows.value.get(id)).filter((r): r is FeeSearchRow => Boolean(r))
  return sortFeeRows(list)
})

watch(selectedRowsList, rows => {
  emit('selection-change', rows)
}, { deep: true })

const currentSearchGeneration = ref(0)
const selectingAll = ref(false)
const failedPages = ref<number[]>([])
const selectionNotice = ref('')
const lastQuery = ref<FeeSearchQuery | null>(null)
const cachedPages = reactive(new Map<number, Set<string>>())
let searchController = new AbortController()
let unrequestedOnlyBatch = false
const selectionPending = computed(() => selectingAll.value || searchState.value === 'loading')
const selectionIncomplete = computed(() => failedPages.value.length > 0 || searchState.value === 'error')

const paging = { startedAt: 0, total: 0, done: 0 }
function paintPaging(status: TaskCheckStatus): void {
  paintTaskCheckProgress(paging.done, paging.total, paging.startedAt, status, '翻页')
}
function tickPage(): void {
  paging.done += 1
  paintPaging(paging.done >= paging.total ? 'done' : 'run')
}

const pagingHint = computed(() => {
  if (!selectingAll.value) return ''
  return taskCheckProgress.eta ? `（全选所有中，预计 ${taskCheckProgress.eta} 完成）` : '（全选所有中…）'
})

function applyValuesPatch(patch: Record<string, string>): void {
  const prevCaseType = values.value.case_type
  const prevCountry = values.value.country
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) values.value[k] = v
  }
  if (values.value.case_type !== prevCaseType || values.value.country !== prevCountry) {
    void refreshCtrlProc()
  }
}

function applyInitialValues(): void {
  if (!props.initialValues) return
  applyValuesPatch(props.initialValues)
}
applyInitialValues()
watch(() => props.initialToken, () => {
  invalidateSearch()
  applyInitialValues()
})

function isRowSelected(row: FeeSearchRow): boolean {
  return Boolean(selectedIds.value[row.feeId])
}

function toggleRow(row: FeeSearchRow, checked: boolean): void {
  selectedIds.value[row.feeId] = checked
}

function selectCurrentPage(select: boolean): void {
  if (!result.value) return
  for (const row of result.value.rows) {
    selectedIds.value[row.feeId] = select
  }
}

function clearAllSelected(): void {
  selectedIds.value = {}
  quickFeeSelectMode.value = ''
  selectionNotice.value = ''
}

function deselectAllPages(): void {
  clearAllSelected()
}

function selectBulkRow(row: FeeSearchRow, unrequestedOnly: boolean): void {
  selectedIds.value[row.feeId] = !unrequestedOnly || (isUnrequestedFee(row) && !props.defaultSelectionExclusion?.(row))
}

async function selectAllPages(unrequestedOnly = false): Promise<void> {
  const res = result.value
  if (!res?.total || selectionPending.value) return
  unrequestedOnlyBatch = unrequestedOnly
  for (const row of allKnownRows.value.values()) selectBulkRow(row, unrequestedOnly)
  const pages = Array.from({ length: totalPages.value }, (_, i) => i + 1)
    .filter(page => !cachedPages.has(page))
  await readSelectionPages(pages)
}

async function retryFailedPages(): Promise<void> {
  await readSelectionPages(failedPages.value)
}

async function readSelectionPages(pages: number[]): Promise<void> {
  const b = activeBridge()
  const query = lastQuery.value
  const total = result.value?.total
  if (!b || !query || selectionPending.value) return

  const gen = currentSearchGeneration.value
  const signal = searchController.signal
  const unrequestedOnly = unrequestedOnlyBatch
  const announce = (missed: number[]) => {
    failedPages.value = missed
    paintPaging(missed.length ? 'fail' : 'done')
    const exclusions: string[] = []
    if (unrequestedOnly) {
      const rows = [...allKnownRows.value.values()]
      const unrequested = rows.filter(isUnrequestedFee)
      const statusExcluded = rows.length - unrequested.length
      if (statusExcluded) exclusions.push(`${statusExcluded} 项有请款单号或状态并非明确未请款`)
      const perReason = new Map<string, number>()
      for (const row of unrequested) {
        const reason = props.defaultSelectionExclusion?.(row)
        if (reason) perReason.set(reason, (perReason.get(reason) ?? 0) + 1)
      }
      for (const [reason, count] of perReason) exclusions.push(`${count} 项${reason}`)
    }
    selectionNotice.value = missed.length
      ? `有 ${missed.length} 页没读到（第 ${missed.slice(0, 5).join('、')} 页）。点击「重试没读到的页」补齐。`
      : exclusions.length
        ? `默认勾选 ${selectedCount.value} 项未请款费用。已排除 ${exclusions.join('、')}。`
        : ''
  }
  paging.startedAt = Date.now()
  paging.total = pages.length || 1
  paging.done = pages.length ? 0 : 1
  if (!pages.length) {
    announce([])
    return
  }

  selectingAll.value = true
  selectionNotice.value = ''
  paintPaging('run')
  const fetchedIds = new Set(allKnownRows.value.keys())
  try {
    const missed = await runPagedFetch<FeeSearchRow>(pages, async page => {
      try {
        const resp = await b.request({
          type: MessageType.SearchFee,
          payload: {
            query: { ...query, pageIndex: page },
            timeoutMs: fileSearchTimeoutMs(queryTimeoutMs.value),
            batch: true
          }
        }, signal)
        if (!signal.aborted && resp.type === MessageType.SearchFeeResult && resp.payload.ok && resp.payload.data.total === total) {
          const { rows } = resp.payload.data
          if (rows.length && rows.every(row => !fetchedIds.has(row.feeId))) {
            for (const row of rows) fetchedIds.add(row.feeId)
            return { ok: true, rows }
          }
        }
        const message = resp.type === MessageType.SearchFeeResult && !resp.payload.ok
          ? resp.payload.error.message
          : resp.type === MessageType.Error ? resp.payload.message : ''
        return { ok: false, session: /登录|会话已变化|尚未确认|尚未连接|标签页已失效/.test(message) }
      } catch {
        return { ok: false, session: false }
      }
    }, {
      concurrency: 6,
      signal,
      onPage: (page, rows) => {
        if (gen !== currentSearchGeneration.value) return
        cachedPages.set(page, new Set(rows.map(row => row.feeId)))
        for (const row of rows) {
          allKnownRows.value.set(row.feeId, row)
          selectBulkRow(row, unrequestedOnly)
        }
        tickPage()
      }
    })

    if (gen === currentSearchGeneration.value) announce(missed)
  } finally {
    if (gen === currentSearchGeneration.value) selectingAll.value = false
  }
}

// 对齐 FeeSearch.js L653-671: "只选官费" / "只选代理费" 按当前页 fee_class_name 批量勾选
function applyQuickFeeSelect(mode: 'O' | 'A'): void {
  quickFeeSelectMode.value = mode
  if (!result.value) return
  const targetLabel = mode === 'O' ? '官费' : '代理费'
  for (const row of result.value.rows) {
    const matched = row.feeClass === mode || row.feeClassName === targetLabel
    selectedIds.value[row.feeId] = matched
  }
}

// Amount totals
const totalAmountInfo = ref<{
  originalAgentFee: number
  discountAgentFee: number
  officialFee: number
  thirdPartyFee: number
}>({
  originalAgentFee: 0,
  discountAgentFee: 0,
  officialFee: 0,
  thirdPartyFee: 0
})

// Build Query Object
function buildCurrentQuery(page = pageIndex.value, size = pageSize.value): FeeSearchQuery {
  const q: FeeSearchQuery = {
    pageIndex: page,
    pageSize: size,
    ...(props.includeTranslationWordCounts ? { includeTranslationWordCounts: true } : {}),
    fields: { ...values.value }
  }

  for (const [k, v] of Object.entries(values.value)) {
    if (v) (q as unknown as Record<string, unknown>)[k] = v
  }
  for (const [k, v] of Object.entries(checkedBoxes.value)) {
    (q as unknown as Record<string, unknown>)[k] = v
  }
  return q
}

function invalidateSearch(): void {
  currentSearchGeneration.value += 1
  searchController.abort()
  searchController = new AbortController()
  if (selectingAll.value) resetTaskCheckProgress()
  selectingAll.value = false
  failedPages.value = []
  lastQuery.value = null
  result.value = null
  allKnownRows.value.clear()
  cachedPages.clear()
  clearAllSelected()
  pageIndex.value = 1
  searchState.value = 'idle'
  searchMessage.value = ''
  totalAmountInfo.value = { originalAgentFee: 0, discountAgentFee: 0, officialFee: 0, thirdPartyFee: 0 }
}

// Perform Search
async function doSearch(page = 1, newSearch = true): Promise<void> {
  const b = activeBridge()
  if (!b) {
    searchState.value = 'error'
    searchMessage.value = '尚未连接 EASY'
    return
  }

  if (newSearch) invalidateSearch()
  if (!newSearch && selectionPending.value) return
  const q = newSearch ? buildCurrentQuery(page, pageSize.value) : lastQuery.value && { ...lastQuery.value, pageIndex: page }
  if (!q) return
  const gen = currentSearchGeneration.value
  const signal = searchController.signal
  searchState.value = 'loading'
  searchMessage.value = ''

  try {
    const resp = await b.request({
      type: MessageType.SearchFee,
      payload: {
        query: q,
        timeoutMs: queryTimeoutMs.value
      }
    }, signal)

    if (gen !== currentSearchGeneration.value) return

    if (resp.type === MessageType.Error) {
      searchState.value = 'error'
      searchMessage.value = resp.payload.message || '查询失败'
      return
    }

    if (resp.type === MessageType.SearchFeeResult) {
      if (!resp.payload.ok) {
        searchState.value = 'error'
        searchMessage.value = resp.payload.error.message || '查询接口返回错误'
        return
      }

      const data = resp.payload.data
      const previousIds = cachedPages.get(page)
      const changed = previousIds
        ? data.rows.length !== previousIds.size || data.rows.some(row => !previousIds.has(row.feeId))
        : data.rows.some(row => allKnownRows.value.has(row.feeId))
      if (!newSearch && (changed || data.total !== result.value?.total)) {
        invalidateSearch()
        searchState.value = 'error'
        searchMessage.value = '费用查询的结果已变化，请重新查询后再勾选。'
        return
      }
      pageIndex.value = page
      if (newSearch) lastQuery.value = q
      result.value = data
      for (const row of data.rows) {
        allKnownRows.value.set(row.feeId, row)
      }
      cachedPages.set(page, new Set(data.rows.map(row => row.feeId)))
      if (data.total === 0 || data.rows.length === 0) {
        searchState.value = 'empty'
        clearAllSelected()
      } else {
        searchState.value = 'success'
        if (newSearch) {
          void selectAllPages(true)
        } else if (failedPages.value.includes(page)) {
          for (const row of data.rows) selectBulkRow(row, unrequestedOnlyBatch)
          failedPages.value = failedPages.value.filter(failed => failed !== page)
          if (!failedPages.value.length) selectionNotice.value = ''
        }
      }

      emit('searched', q)
      if (newSearch) void fetchTotalAmounts(q, gen, signal)
    } else {
      searchState.value = 'error'
      searchMessage.value = '费用查询返回了意外结果，请重新查询。'
    }
  } catch (e: unknown) {
    if (gen !== currentSearchGeneration.value) return
    searchState.value = 'error'
    searchMessage.value = e instanceof Error ? e.message : '查询异常中断'
  }
}

async function fetchTotalAmounts(q: FeeSearchQuery, gen: number, signal: AbortSignal): Promise<void> {
  const b = activeBridge()
  if (!b) return
  try {
    const resp = await b.request({
      type: MessageType.SearchFeeAmount,
      payload: {
        query: q,
        timeoutMs: queryTimeoutMs.value
      }
    }, signal)
    if (gen !== currentSearchGeneration.value) return
    if (resp.type === MessageType.SearchFeeAmountResult && resp.payload.ok) {
      const data = resp.payload.data as Record<string, unknown>
      if (Array.isArray(data.FeeList)) {
        let origA = 0
        let discA = 0
        let offO = 0
        let thirdT = 0
        for (const item of data.FeeList as Array<Record<string, unknown>>) {
          const fc = String(item.fee_class || '').toUpperCase()
          const amt = Number(item.amount) || 0
          if (fc === 'A') {
            origA += amt
            discA += amt
          } else if (fc === 'O') {
            offO += amt
          } else if (fc === 'T') {
            thirdT += amt
          }
        }
        totalAmountInfo.value = {
          originalAgentFee: origA,
          discountAgentFee: discA,
          officialFee: offO,
          thirdPartyFee: thirdT
        }
      }
    }
  } catch {
    // Non-fatal
  }
}

function resetForm(): void {
  values.value = {
    case_type: '',
    pay_status: '',
    is_close: '',
    is_ahead_pub: '',
    hearing_the_case: '',
    sourcetype: '',
    contact_type: '',
    notice_status: '',
    receive_account_id: '',
    business_coop: '',
    exists_invoice_no: '',
    bill_no: '',
    case_agency_precorditem: '',
    case_agency: ''
  }
  checkedBoxes.value = {}
  selectedCustomers.value = []
  selectedRuleOutCustomers.value = []
  applicantOptions.value = []
  selectedTemplateId.value = ''
  saveName.value = ''
  saveNameDirty.value = false
  unknownTemplateFields.value = {}
  templateMessage.value = ''
  exportNotice.value = ''
  showTypeMode.value = 'all'
  invalidateSearch()
}

function changePage(delta: number): void {
  const nextPage = pageIndex.value + delta
  if (nextPage >= 1 && nextPage <= totalPages.value) {
    void doSearch(nextPage, false)
  }
}

function onPageSizeChange(): void {
  void doSearch(1)
}

const columns = [
  { key: 'caseVolume', label: '我方文号' },
  { key: 'caseVolumeCustomer', label: '客户文号' },
  { key: 'caseStatus', label: '案件状态' },
  { key: 'applyType', label: '申请类型' },
  { key: 'businessType', label: '业务类型' },
  { key: 'noticeStatus', label: '通知状态' },
  { key: 'requestStatus', label: '请款状态' },
  { key: 'receiveStatus', label: '收款状态' },
  { key: 'payStatus', label: '缴费状态' },
  { key: 'amount', label: '金额' },
  { key: 'currency', label: '币别' },
  { key: 'rate', label: '汇率' },
  { key: 'targetAmount', label: '结算折合金额' },
  { key: 'targetCurrency', label: '结算折合币别' },
  { key: 'feeType', label: '费用名称' },
  { key: 'appNo', label: '申请号' },
  { key: 'requestNo', label: '请款单号' },
  { key: 'billNo', label: '缴费单号' },
  { key: 'ctrlProc', label: '处理事项' },
  { key: 'customerName', label: '客户名称' },
  { key: 'applicant', label: '申请人' }
]

// 原站高级导出弹窗（1:1 对齐 IhgAdvExport.aspx：导出清单 / 导出勾选费用 / 导出汇总数据）
const exportModalOpen = ref(false)
const exportModalMode = ref<FeeExportMode>('cond')
const exportNotice = ref('')

async function openExportModal(mode: FeeExportMode): Promise<void> {
  if (!props.canSearch) {
    await infoDialog({
      title: '尚未连接 EASY',
      message: '请先在 EASY 原网站保持登录并连接后，再使用原站模板导出。'
    })
    return
  }
  if (mode === 'checked' && selectedFeeIds.value.length === 0) {
    await infoDialog({
      title: '请选择要处理的费用',
      message: '请先在下方查询结果中勾选至少一条费用记录，再点击「导出勾选费用」。'
    })
    return
  }
  exportNotice.value = ''
  exportModalMode.value = mode
  exportModalOpen.value = true
}

function onFeeExported(message: string): void {
  exportNotice.value = message
}

// 历史查询条件（查询模板，与文件管理 / 期限监控同口径直连原站 SearchQueryHisList / Save / Delete）
const templateLoads = new TemplateLoadCoordinator()
const templates = ref<HistoryQueryOption[]>([])
const selectedTemplateId = ref('')
const saveName = ref('')
const saveNameDirty = ref(false)
const loadingTemplates = ref(false)
const savingTemplate = ref(false)
const deletingTemplate = ref(false)
const templateMessage = ref('')
const unknownTemplateFields = ref<Record<string, string>>({})
const templateJsonInput = ref<HTMLInputElement | null>(null)

const templateLabelMap = computed(() => historyLabels(templates.value))
function templateLabel(item: HistoryQueryOption): string {
  return templateLabelMap.value.get(item.id) ?? item.name
}

const DEFAULT_FEE_VALUES: Record<string, string> = {
  case_type: '',
  pay_status: '',
  is_close: '',
  is_ahead_pub: '',
  hearing_the_case: '',
  sourcetype: '',
  contact_type: '',
  notice_status: '',
  receive_account_id: '',
  business_coop: '',
  exists_invoice_no: '',
  bill_no: '',
  case_agency_precorditem: '',
  case_agency: ''
}

function collectDisplayValues(): Record<string, string> {
  const labels: Record<string, string> = {}
  if (selectedCustomers.value.length) {
    labels.customer_id = customerDisplayText('customer_id')
  }
  if (selectedRuleOutCustomers.value.length) {
    labels.ruleOutcustomer_id = customerDisplayText('ruleOutcustomer_id')
  }
  const allCells: FeeCell[] = [
    ...FEE_COMMON_CELLS,
    ...FEE_ADVANCED_BLOCKS.flatMap(b => b.cells)
  ]
  for (const cell of allCells) {
    if (cell.kind === 'named') {
      const raw = valueOf(cell.key).trim()
      if (!raw) continue
      const opts = treeChoices(cell.key)
      const byVal = new Map(opts.map(o => [o.value, o.label]))
      const names = raw.split(',').map(id => byVal.get(id.trim()) ?? '').filter(Boolean)
      if (names.length) labels[cell.key] = names.join(',')
    } else if (cell.kind === 'applicant-tree') {
      const raw = valueOf(cell.key).trim()
      if (!raw) continue
      const byVal = new Map(applicantOptions.value.map(o => [o.value, o.label]))
      const names = raw.split(/[,;]/).map(id => byVal.get(id.trim()) ?? '').filter(Boolean)
      if (names.length) labels[cell.key] = names.join(',')
    } else if (cell.kind === 'select') {
      const raw = valueOf(cell.key).trim()
      if (!raw) continue
      const opts = cell.searchable ? treeChoices(cell.key) : selectOptions(cell.key)
      const hit = opts.find(o => o.value === raw)
      if (hit?.label) labels[cell.key] = hit.label
    }
  }
  return labels
}

function collectDraftFields(): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const [k, v] of Object.entries(values.value)) {
    if (isFeeSearchInputField(k) && v.trim()) fields[k] = v.trim()
  }
  for (const [k, checked] of Object.entries(checkedBoxes.value)) {
    if (FEE_CHECK_KEYS.has(k) && checked) fields[k] = 'on'
  }
  return fields
}

function maybeExpandAdvanced(fields: Record<string, string>, checks: Record<string, boolean>): void {
  const hasAdv = Object.entries(fields).some(([k, v]) => FEE_ADVANCED_KEYS.has(k) && v.trim())
    || Object.entries(checks).some(([k, v]) => FEE_ADVANCED_KEYS.has(k) && v)
  if (hasAdv) showAdvanced.value = true
}

async function loadTemplates(force: boolean): Promise<void> {
  const b = activeBridge()
  if (!canRead.value || !b) {
    templateMessage.value = '请先确认 EASY 已登录。'
    return
  }
  const ticket = templateLoads.begin()
  loadingTemplates.value = true
  templateMessage.value = ''
  try {
    const resp = await b.request({ type: MessageType.ListHistoryQueries, payload: { force, surface: 'fee' } }, ticket.signal)
    if (!templateLoads.isCurrent(ticket.id)) return
    if (resp.type !== MessageType.HistoryQueriesResult || !resp.payload.ok) {
      templates.value = []
      templateMessage.value = resp.type === MessageType.Error
        ? resp.payload.message
        : resp.type === MessageType.HistoryQueriesResult && !resp.payload.ok
          ? resp.payload.error.message
          : '费用模板没有读到。'
      return
    }
    templates.value = resp.payload.data
    if (resp.payload.data.length === 0) {
      templateMessage.value = '当前账号还没有费用查询模板。'
    }
  } catch {
    if (templateLoads.isCurrent(ticket.id)) templateMessage.value = '读取费用模板失败。'
  } finally {
    if (templateLoads.isCurrent(ticket.id)) loadingTemplates.value = false
  }
}

async function applyTemplate(id: string): Promise<void> {
  selectedTemplateId.value = id
  saveNameDirty.value = false
  if (!id) {
    values.value = { ...DEFAULT_FEE_VALUES }
    checkedBoxes.value = {}
    selectedCustomers.value = []
    selectedRuleOutCustomers.value = []
    applicantOptions.value = []
    unknownTemplateFields.value = {}
    saveName.value = ''
    templateMessage.value = ''
    return
  }
  const b = activeBridge()
  if (!b) return
  const ticket = templateLoads.begin()
  templateMessage.value = ''
  try {
    const resp = await b.request({ type: MessageType.GetHistoryQuery, payload: { queryId: id, surface: 'fee' } }, ticket.signal)
    if (!templateLoads.isCurrent(ticket.id)) return
    if (resp.type !== MessageType.HistoryQueryResult || !resp.payload.ok) {
      templateMessage.value = resp.type === MessageType.HistoryQueryResult && !resp.payload.ok
        ? resp.payload.error.message
        : '这个费用模板没有打开。'
      return
    }
    const parsed = readFeeQueryXml(resp.payload.data.queryXml)
    if (!parsed.ok) {
      templateMessage.value = parsed.error.message
      return
    }
    values.value = { ...DEFAULT_FEE_VALUES, ...parsed.data.fields }
    checkedBoxes.value = { ...parsed.data.checks }
    selectedCustomers.value = parsed.data.customers
    selectedRuleOutCustomers.value = parsed.data.ruleOutCustomers
    unknownTemplateFields.value = { ...parsed.data.unknownFields }
    maybeExpandAdvanced(parsed.data.fields, parsed.data.checks)
    if (parsed.data.customers.length) {
      void loadApplicantsForCustomers(parsed.data.customers.map(c => c.id).join(';'), true)
    } else {
      applicantOptions.value = []
    }
    if (parsed.data.fields.case_type || parsed.data.fields.country) {
      void refreshCtrlProc()
    }
    const named = templates.value.find(item => item.id === id)
    if (named && !saveNameDirty.value) saveName.value = named.name
  } catch {
    if (templateLoads.isCurrent(ticket.id)) templateMessage.value = '载入费用模板失败。'
  }
}

async function saveTemplate(): Promise<void> {
  const b = activeBridge()
  if (!b || savingTemplate.value) return
  const selected = templates.value.find(item => item.id === selectedTemplateId.value)
  const title = saveName.value.trim() || (selected ? selected.name.trim() : '')
  if (!title) {
    templateMessage.value = '先填写模板名称。'
    return
  }
  const nonEmptyFields: Record<string, string> = {}
  for (const [k, v] of Object.entries(values.value)) {
    if (isFeeSearchInputField(k) && v.trim()) nonEmptyFields[k] = v.trim()
  }
  const activeChecks: Record<string, boolean> = {}
  for (const [k, checked] of Object.entries(checkedBoxes.value)) {
    if (FEE_CHECK_KEYS.has(k) && checked) activeChecks[k] = true
  }
  if (!Object.keys(nonEmptyFields).length && !Object.keys(activeChecks).length && !selectedCustomers.value.length && !selectedRuleOutCustomers.value.length && !Object.keys(unknownTemplateFields.value).length) {
    templateMessage.value = '先填写至少一项查询条件，再保存。'
    return
  }
  const queryId = selected && isQueryGuid(selected.id) ? selected.id : ''
  const before = new Set(templates.value.map(item => item.id))
  const queryXml = buildFeeQueryXml({
    fields: nonEmptyFields,
    checks: activeChecks,
    displayValues: collectDisplayValues(),
    customers: selectedCustomers.value,
    ruleOutCustomers: selectedRuleOutCustomers.value,
    unknownFields: unknownTemplateFields.value
  })
  savingTemplate.value = true
  templateMessage.value = '正在写入原网站的费用模板…'
  try {
    const resp = await b.request({
      type: MessageType.SaveHistoryQuery,
      payload: { title, queryId, queryXml, surface: 'fee' }
    })
    if (resp.type !== MessageType.HistoryQuerySaved || !resp.payload.ok) {
      templateMessage.value = resp.type === MessageType.HistoryQuerySaved && !resp.payload.ok
        ? resp.payload.error.message
        : resp.type === MessageType.Error ? resp.payload.message : '原网站没有保存这份费用模板。'
      return
    }
    await loadTemplates(true)
    const created = templates.value.find(item => !before.has(item.id) && item.name === title)
    const saved = created ?? (queryId ? templates.value.find(item => item.id === queryId) : undefined)
    if (saved) {
      selectedTemplateId.value = saved.id
      saveName.value = saved.name
      saveNameDirty.value = false
    }
    templateMessage.value = created
      ? '已在原网站另存了这份新的费用模板。'
      : queryId ? '已更新原网站上的这份费用模板。' : '已在原网站新建这份费用模板。'
  } catch {
    templateMessage.value = '保存费用模板失败。'
  } finally {
    savingTemplate.value = false
  }
}

async function deleteTemplate(): Promise<void> {
  const b = activeBridge()
  if (!b || deletingTemplate.value || savingTemplate.value) return
  const current = templates.value.find(item => item.id === selectedTemplateId.value)
  if (!current || !isQueryGuid(current.id)) {
    templateMessage.value = '先选中原网站上的费用模板，再删除。'
    return
  }
  const agreed = await confirmDialog({
    title: '删除原网站模板',
    message: `会从原网站删掉「${templateLabel(current)}」。`,
    confirmLabel: '删除',
    warn: true
  })
  if (!agreed) return
  deletingTemplate.value = true
  templateMessage.value = '正在从原网站删除…'
  try {
    const resp = await b.request({
      type: MessageType.DeleteHistoryQuery,
      payload: { queryId: current.id, surface: 'fee' }
    })
    if (resp.type !== MessageType.HistoryQueryDeleted || !resp.payload.ok) {
      templateMessage.value = resp.type === MessageType.HistoryQueryDeleted && !resp.payload.ok
        ? resp.payload.error.message
        : resp.type === MessageType.Error ? resp.payload.message : '原网站没有删除这份费用模板。'
      return
    }
    selectedTemplateId.value = ''
    saveName.value = ''
    saveNameDirty.value = false
    await loadTemplates(true)
    templateMessage.value = '已从原网站删除这份费用模板。'
  } catch {
    templateMessage.value = '删除费用模板失败。'
  } finally {
    deletingTemplate.value = false
  }
}

function exportTemplateJson(): void {
  const fields = collectDraftFields()
  const extras = Object.entries(unknownTemplateFields.value).filter(([, v]) => v.trim()).length
  if (!Object.keys(fields).length && !extras) {
    templateMessage.value = '先填写至少一项查询条件，再导出。'
    return
  }
  const selected = templates.value.find(item => item.id === selectedTemplateId.value)
  const from = saveName.value.trim() || (selected ? selected.name.trim() : '')
  downloadTemplateJson(
    templateJsonText('FeeSearch', {
      fields,
      displayValues: collectDisplayValues(),
      unknownFields: unknownTemplateFields.value
    }),
    templateJsonFileName('FeeSearch', from)
  )
  templateMessage.value = `已导出当前条件的 JSON。${from ? `文件名带模板名「${from}」和时间戳` : '文件名只带查询面和时间戳；在「模板名称」里填上名字再导出，文件名就会带上'}，文件内容不含模板名，导入后自己命名保存。`
}

async function importTemplateJson(event: Event): Promise<void> {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  let text = ''
  try {
    text = await file.text()
  } catch {
    templateMessage.value = '这份 JSON 文件没有读开。'
    return
  }
  const read = readTemplateJson(text, 'FeeSearch')
  if (!read.ok) {
    templateMessage.value = read.message
    return
  }
  const nextValues: Record<string, string> = { ...DEFAULT_FEE_VALUES }
  const nextChecks: Record<string, boolean> = {}
  let count = 0
  for (const [k, v] of Object.entries(read.conditions.fields)) {
    const cleaned = sanitizeFeeFieldValue(k, v)
    if (!cleaned) continue
    if (FEE_CHECK_KEYS.has(k)) {
      const lower = cleaned.toLowerCase()
      if (lower === 'on' || lower === 'true' || lower === '1') {
        nextChecks[k] = true
        count += 1
      }
    } else {
      nextValues[k] = cleaned
      count += 1
    }
  }
  selectedCustomers.value = parseFeeCustomerRefs(nextValues.customer_id ?? '', read.conditions.displayValues.customer_id ?? '')
  selectedRuleOutCustomers.value = parseFeeCustomerRefs(nextValues.ruleOutcustomer_id ?? '', read.conditions.displayValues.ruleOutcustomer_id ?? '')
  if (selectedCustomers.value.length) {
    nextValues.customer_id = selectedCustomers.value.map(c => c.id).join(';')
  } else {
    delete nextValues.customer_id
  }
  if (selectedRuleOutCustomers.value.length) {
    nextValues.ruleOutcustomer_id = selectedRuleOutCustomers.value.map(c => c.id).join(';')
  } else {
    delete nextValues.ruleOutcustomer_id
  }
  values.value = nextValues
  checkedBoxes.value = nextChecks
  unknownTemplateFields.value = { ...read.conditions.unknownFields }
  if (selectedCustomers.value.length) {
    void loadApplicantsForCustomers(selectedCustomers.value.map(c => c.id).join(';'), true)
  } else {
    applicantOptions.value = []
  }
  if (nextValues.case_type || nextValues.country) {
    void refreshCtrlProc()
  }
  maybeExpandAdvanced(nextValues, nextChecks)
  selectedTemplateId.value = ''
  saveName.value = ''
  saveNameDirty.value = false
  templateMessage.value = `已导入 ${count} 个查询条件。可以继续追加或修改条件，最后自己填模板名称保存。`
}

watch(
  () => props.userId,
  nextUser => {
    invalidateSearch()
    templates.value = []
    selectedTemplateId.value = ''
    saveName.value = ''
    saveNameDirty.value = false
    templateMessage.value = ''
    if (nextUser) {
      void loadTemplates(false)
      if (!pickersReady.value && !loadingPickers.value) void loadPickers(false)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  templateLoads.dispose()
  searchController.abort()
  resetTaskCheckProgress()
})

// 对齐 FeeSearch.js L637-650: 显示全部 vs 仅显示选中项
const displayRows = computed(() => {
  if (!result.value) return []
  if (showTypeMode.value === 'selected') {
    return result.value.rows.filter(isRowSelected)
  }
  return result.value.rows
})

const totalPages = computed(() => {
  if (!result.value || result.value.total === 0) return 1
  return Math.ceil(result.value.total / (lastQuery.value?.pageSize ?? pageSize.value))
})

function billingSnapshot() {
  const cleanRow = (row: FeeSearchRow): FeeSearchRow => {
    const raw = Object.fromEntries(['word_count', 'fee_desc', 'out_bill_date', 'agency_name_cn', 'country', 'law_fee_date'].flatMap(key => {
      const value = row.raw[key]
      return typeof value === 'string' || typeof value === 'number' ? [[key, value]] : []
    }))
    return { ...row, raw }
  }
  return {
    values: values.value, checks: checkedBoxes.value,
    customers: selectedCustomers.value, excludedCustomers: selectedRuleOutCustomers.value,
    pageIndex: pageIndex.value, pageSize: pageSize.value, query: lastQuery.value,
    result: result.value && { ...result.value, rows: result.value.rows.map(cleanRow) },
    rows: [...allKnownRows.value.values()].map(cleanRow), selectedIds: selectedFeeIds.value,
    pages: [...cachedPages].map(([page, ids]) => [page, [...ids]] as const),
    failed: failedPages.value, unrequestedOnly: unrequestedOnlyBatch, pending: selectionPending.value,
    incomplete: selectionIncomplete.value, totals: totalAmountInfo.value
  }
}

function restoreBillingSnapshot(state: ReturnType<typeof billingSnapshot>): void {
  invalidateSearch()
  values.value = state.values
  checkedBoxes.value = state.checks
  selectedCustomers.value = state.customers
  selectedRuleOutCustomers.value = state.excludedCustomers
  pageSize.value = state.pageSize
  pageIndex.value = state.pageIndex
  lastQuery.value = state.query
  result.value = state.result
  unrequestedOnlyBatch = state.unrequestedOnly
  totalAmountInfo.value = state.totals
  for (const row of state.rows) allKnownRows.value.set(row.feeId, row)
  selectedIds.value = Object.fromEntries(state.selectedIds.filter(id => allKnownRows.value.has(id)).map(id => [id, true]))
  for (const [page, ids] of state.pages) cachedPages.set(page, new Set(ids))
  failedPages.value = state.failed
  if (state.pending && state.result && state.query) {
    failedPages.value = Array.from({ length: totalPages.value }, (_, i) => i + 1).filter(page => !cachedPages.has(page))
  }
  if (failedPages.value.length) selectionNotice.value = '已恢复已读费用。请重试未读完的页。'
  searchState.value = (state.pending || state.incomplete) && !failedPages.value.length
    ? 'error' : state.result ? (state.result.total ? 'success' : 'empty') : 'idle'
  if (searchState.value === 'error') searchMessage.value = '上次费用查询未完成，请重新查询。'
}

defineExpose({
  billingSnapshot,
  restoreBillingSnapshot,
  getSelectedRows: () => selectedRowsList.value,
  getKnownRows: () => allKnownRows.value.values(),
  replaceBillingSelection(rows: FeeSearchRow[]) {
    if (selectionPending.value || selectionIncomplete.value) return
    selectedIds.value = Object.fromEntries(rows.filter(row => allKnownRows.value.has(row.feeId)).map(row => [row.feeId, true]))
    selectionNotice.value = ''
  },
  setValues(patch: Record<string, string>) {
    applyValuesPatch(patch)
  },
  doSearch,
  selectAllPages,
  deselectAllPages,
  selectionPending,
  selectionIncomplete,
  selectingAll,
  selectedCount,
  selectedFeeIds,
  selectedRowsList
})
</script>

<template>
  <div class="fee-search-query">
    <!-- Query Conditions + History Templates Card -->
    <section class="card query-template query-conditions" aria-label="费用查询条件">
      <!-- 历史查询条件（当前账号的费用模板，与文件管理 / 期限监控同样式） -->
      <div class="section-heading">
        <strong>当前账号的费用模板</strong>
        <button type="button" class="text-button" :disabled="!canRead || loadingTemplates" @click="loadTemplates(true)">
          重新读取
        </button>
      </div>
      <p v-if="loadingTemplates" class="hint">正在读取当前账号的费用模板…</p>
      <p v-if="templateMessage" class="hint">{{ templateMessage }}</p>
      <ul v-if="templates.length" class="template-picks">
        <li v-for="item in templates" :key="item.id">
          <button type="button" :class="{ on: selectedTemplateId === item.id }" @click="applyTemplate(item.id)">
            <b v-hint.clip="templateLabel(item)">{{ templateLabel(item) }}</b>
          </button>
        </li>
      </ul>
      <label class="template-select-label">选用模板
        <ThemeSelect
          :model-value="selectedTemplateId"
          placeholder="请选择"
          empty-text="当前账号还没有费用查询模板。"
          :options="templates.map(item => ({ value: item.id, label: templateLabel(item) }))"
          @update:model-value="applyTemplate(String($event))"
        />
      </label>

      <div class="section-heading query-section-head">
        <strong>查询条件</strong>
        <span class="inline-actions">
          <label class="query-timeout">超时时间
            <ThemeSelect v-model="queryTimeoutMs" :options="timeoutOptions" />
          </label>
          <button type="button" class="text-button" :disabled="!canRead || loadingPickers" @click="loadPickers(true)">
            校对最新字典
          </button>
        </span>
      </div>

      <p v-if="loadingPickers && !pickersReady" class="hint">正在向原网站读取下拉字典…</p>
      <p v-else-if="pickerMessage" class="hint">{{ pickerMessage }}</p>

      <!-- Row 0: Quick Textarea Row (我方文号, 申请号, PCT申请号) -->
      <div class="query-grid fee-form-grid quick-row">
        <div v-for="cell in FEE_QUICK_CELLS" :key="cell.key" class="query-cell quick-cell">
          <span class="cell-title">{{ cell.label }}</span>
          <div class="cell-stack">
            <textarea
              :id="cell.key"
              :value="valueOf(cell.key)"
              rows="2"
              :placeholder="cell.placeholder"
              @input="onTextInput(cell.key, $event)"
            />
            <div v-if="cell.checks?.length" class="check-row">
              <label v-for="chk in cell.checks" :key="chk.key" class="empty-check">
                <input
                  type="checkbox"
                  :checked="isChecked(chk.key)"
                  @change="toggleCheck(chk.key, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ chk.label }}</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Rows 1–7: Main Common Form Grid (exact 3 columns × 7 rows from FeeSearch.aspx) -->
      <div class="query-grid fee-form-grid">
        <template v-for="cell in FEE_COMMON_CELLS" :key="feeCellKey(cell)">
          <!-- Text Cell -->
          <div v-if="cell.kind === 'text'" class="query-cell">
            <span class="cell-title">{{ labelOf(cell) }}</span>
            <div class="cell-body">
              <input
                :value="valueOf(cell.key)"
                type="text"
                :placeholder="cell.placeholder || `请输入${labelOf(cell)}`"
                @input="onTextInput(cell.key, $event)"
              />
              <label v-for="chk in cell.checks ?? []" :key="chk.key" class="empty-check">
                <input
                  type="checkbox"
                  :checked="isChecked(chk.key)"
                  @change="toggleCheck(chk.key, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ chk.label }}</span>
              </label>
            </div>
          </div>

          <!-- Secondary Customer Modal Cell (客户名称 -> ShowIhgSelect 二级弹窗) -->
          <div v-else-if="cell.kind === 'customer-modal'" class="query-cell">
            <span class="cell-title">{{ cell.label }}</span>
            <div class="cell-body">
              <button
                type="button"
                class="modal-picker-trigger"
                :class="{ 'is-empty': !customerDisplayText(cell.key) }"
                @click="openCustomerModal(cell.key)"
              >
                <span class="modal-picker-text" v-hint.clip="customerDisplayText(cell.key)">{{ customerDisplayText(cell.key) || cell.placeholder || '选择客户' }}</span>
                <span class="modal-picker-badge">弹窗选择</span>
              </button>
              <button
                v-if="customerDisplayText(cell.key)"
                type="button"
                class="modal-clear-btn"
                v-hint="'清空已选客户'"
                @click="clearCustomerField(cell.key)"
              >
                ×
              </button>
            </div>
          </div>

          <!-- Applicant Linked Tree Cell (申请人 -> 客户联动多选树 + 限第一申请人) -->
          <div v-else-if="cell.kind === 'applicant-tree'" class="query-cell">
            <span class="cell-title">{{ cell.label }}</span>
            <div class="cell-body">
              <button
                v-if="!selectedCustomers.length"
                type="button"
                class="theme-select-trigger guard-trigger"
                @click="onApplicantGuardClick"
              >
                <span class="theme-select-value is-placeholder">{{ cell.placeholder || '选择申请人' }}</span>
                <svg class="theme-select-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.2 6 8l4-3.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <TreeOptionSelect
                v-else
                :model-value="valueOf(cell.key)"
                :options="applicantOptions"
                :multiple="true"
                :status="loadingApplicants ? 'loading' : applicantOptions.length ? 'ready' : 'empty'"
                empty-text="所选客户下暂无申请人"
                @update:model-value="setValue(cell.key, String($event))"
              />
              <label
                v-for="chk in cell.checks ?? []"
                :key="chk.key"
                class="empty-check"
                :class="{ 'is-disabled': chk.key === 'first_applicant' && !valueOf('applicant_id').trim() }"
              >
                <input
                  type="checkbox"
                  :checked="isChecked(chk.key)"
                  :disabled="chk.key === 'first_applicant' && !valueOf('applicant_id').trim()"
                  @change="toggleCheck(chk.key, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ chk.label }}</span>
              </label>
            </div>
          </div>

          <!-- Named Tree Cell (TreeUser) -->
          <div v-else-if="cell.kind === 'named'" class="query-cell">
            <span class="cell-title">{{ cell.label }}</span>
            <button
              v-if="needsCaseType(cell)"
              type="button"
              class="theme-select-trigger guard-trigger"
              @click="onNamedTriggerClick(cell)"
            >
              <span class="theme-select-value is-placeholder">{{ cell.placeholder || `选择${cell.label}` }}</span>
              <svg class="theme-select-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.2 6 8l4-3.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <TreeOptionSelect
              v-else
              :model-value="valueOf(cell.key)"
              :options="treeChoices(cell.key)"
              :multiple="cell.multiple !== false"
              :empty-text="emptyTextOf(cell)"
              @update:model-value="setValue(cell.key, String($event))"
            />
          </div>

          <!-- Select Cell -->
          <div v-else-if="cell.kind === 'select'" class="query-cell">
            <span class="cell-title">{{ cell.label }}</span>
            <div class="cell-body">
              <ThemeSelect
                :model-value="valueOf(cell.key)"
                :options="selectOptions(cell.key)"
                @update:model-value="setValue(cell.key, String($event))"
              />
              <label v-for="chk in cell.checks ?? []" :key="chk.key" class="empty-check">
                <input
                  type="checkbox"
                  :checked="isChecked(chk.key)"
                  @change="toggleCheck(chk.key, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ chk.label }}</span>
              </label>
            </div>
          </div>

          <!-- Dates Cell -->
          <div v-else-if="cell.kind === 'dates'" class="query-cell">
            <span class="cell-title">{{ cell.label }}</span>
            <div class="cell-stack">
              <span class="date-pair">
                <WDatePicker
                  :id="cell.start"
                  :model-value="valueOf(cell.start)"
                  :max="valueOf(cell.end)"
                  :disabled="Boolean(cell.empty && isChecked(cell.empty))"
                  placeholder="起"
                  @update:model-value="setValue(cell.start, String($event))"
                />
                <em>到</em>
                <WDatePicker
                  :id="cell.end"
                  :model-value="valueOf(cell.end)"
                  :min="valueOf(cell.start)"
                  :disabled="Boolean(cell.empty && isChecked(cell.empty))"
                  placeholder="止"
                  @update:model-value="setValue(cell.end, String($event))"
                />
                <label v-if="cell.empty" class="empty-check">
                  <input
                    type="checkbox"
                    :checked="isChecked(cell.empty)"
                    @change="toggleCheck(cell.empty, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>为空</span>
                </label>
                <label
                  v-for="chk in (cell.checks ?? []).filter(c => c.label.length <= 6)"
                  :key="chk.key"
                  class="empty-check"
                >
                  <input
                    type="checkbox"
                    :checked="isChecked(chk.key)"
                    @change="toggleCheck(chk.key, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ chk.label }}</span>
                </label>
              </span>
              <div v-if="(cell.checks ?? []).some(c => c.label.length > 6)" class="check-row">
                <label
                  v-for="chk in (cell.checks ?? []).filter(c => c.label.length > 6)"
                  :key="chk.key"
                  class="empty-check"
                >
                  <input
                    type="checkbox"
                    :checked="isChecked(chk.key)"
                    @change="toggleCheck(chk.key, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ chk.label }}</span>
                </label>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Advanced Search Expand / Collapse -->
      <div class="advanced-toggle-row">
        <button type="button" class="text-button toggle-btn" :aria-expanded="showAdvanced" @click="showAdvanced = !showAdvanced">
          {{ showAdvanced ? '隐藏高级查询 ▲' : '显示高级查询 ▼' }}
        </button>
      </div>

      <!-- Advanced 7 Sections -->
      <div v-if="showAdvanced" class="advanced-sections">
        <section v-for="block in FEE_ADVANCED_BLOCKS" :key="block.id" class="advanced-block">
          <div class="block-head">
            <h4 class="block-title">{{ block.title }}</h4>
            <button type="button" class="text-button" @click="toggleBlock(block.id)">
              {{ collapsedBlocks[block.id] ? '展开' : '收起' }}
            </button>
          </div>
          <div v-show="!collapsedBlocks[block.id]" class="query-grid fee-form-grid">
            <template v-for="cell in block.cells" :key="feeCellKey(cell)">
              <!-- Spacer Cell (keeps exact 3-column row alignment with EASY #tbCommon) -->
              <div v-if="cell.kind === 'spacer'" class="query-spacer" aria-hidden="true" />

              <!-- Textarea Cell (e.g., 注册号) -->
              <div v-else-if="cell.kind === 'textarea'" class="query-cell" :class="{ 'span-all': cell.spanAll }">
                <span class="cell-title">{{ cell.label }}</span>
                <div class="cell-stack">
                  <textarea
                    :id="cell.key"
                    :value="valueOf(cell.key)"
                    rows="2"
                    :placeholder="cell.placeholder"
                    @input="onTextInput(cell.key, $event)"
                  />
                  <div v-if="cell.checks?.length" class="check-row">
                    <label v-for="chk in cell.checks" :key="chk.key" class="empty-check">
                      <input
                        type="checkbox"
                        :checked="isChecked(chk.key)"
                        @change="toggleCheck(chk.key, ($event.target as HTMLInputElement).checked)"
                      />
                      <span>{{ chk.label }}</span>
                    </label>
                  </div>
                </div>
              </div>

              <!-- Text Cell -->
              <div v-else-if="cell.kind === 'text'" class="query-cell">
                <span class="cell-title">
                  {{ labelOf(cell) }}
                  <span v-if="cell.help" class="help-badge" tabindex="0" v-hint="cell.help" :aria-label="cell.help">?</span>
                </span>
                <div class="cell-body">
                  <input
                    :value="valueOf(cell.key)"
                    type="text"
                    :placeholder="cell.placeholder || `请输入${labelOf(cell)}`"
                    @input="onTextInput(cell.key, $event)"
                  />
                  <label v-for="chk in cell.checks ?? []" :key="chk.key" class="empty-check">
                    <input
                      type="checkbox"
                      :checked="isChecked(chk.key)"
                      @change="toggleCheck(chk.key, ($event.target as HTMLInputElement).checked)"
                    />
                    <span>{{ chk.label }}</span>
                  </label>
                </div>
              </div>

              <!-- Secondary Customer Modal Cell (排除客户名称) -->
              <div v-else-if="cell.kind === 'customer-modal'" class="query-cell">
                <span class="cell-title">
                  {{ cell.label }}
                  <span v-if="cell.help" class="help-badge" tabindex="0" v-hint="cell.help" :aria-label="cell.help">?</span>
                </span>
                <div class="cell-body">
                  <button
                    type="button"
                    class="modal-picker-trigger"
                    :class="{ 'is-empty': !customerDisplayText(cell.key) }"
                    @click="openCustomerModal(cell.key)"
                  >
                    <span class="modal-picker-text" v-hint.clip="customerDisplayText(cell.key)">{{ customerDisplayText(cell.key) || cell.placeholder || '选择客户' }}</span>
                    <span class="modal-picker-badge">弹窗选择</span>
                  </button>
                  <button
                    v-if="customerDisplayText(cell.key)"
                    type="button"
                    class="modal-clear-btn"
                    v-hint="'清空已选客户'"
                    @click="clearCustomerField(cell.key)"
                  >
                    ×
                  </button>
                </div>
              </div>

              <!-- Named Tree Cell -->
              <div v-else-if="cell.kind === 'named'" class="query-cell">
                <span class="cell-title">
                  {{ cell.label }}
                  <span v-if="cell.help" class="help-badge" tabindex="0" v-hint="cell.help" :aria-label="cell.help">?</span>
                </span>
                <button
                  v-if="needsCaseType(cell)"
                  type="button"
                  class="theme-select-trigger guard-trigger"
                  @click="onNamedTriggerClick(cell)"
                >
                  <span class="theme-select-value is-placeholder">{{ cell.placeholder || `选择${cell.label}` }}</span>
                  <svg class="theme-select-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.2 6 8l4-3.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <TreeOptionSelect
                  v-else
                  :model-value="valueOf(cell.key)"
                  :options="treeChoices(cell.key)"
                  :multiple="cell.multiple !== false"
                  :empty-text="emptyTextOf(cell)"
                  @update:model-value="setValue(cell.key, String($event))"
                />
              </div>

              <!-- Select Cell (searchable uses TreeOptionSelect single-select to match EASY select2) -->
              <div v-else-if="cell.kind === 'select'" class="query-cell">
                <span class="cell-title">
                  {{ cell.label }}
                  <span v-if="cell.help" class="help-badge" tabindex="0" v-hint="cell.help" :aria-label="cell.help">?</span>
                </span>
                <TreeOptionSelect
                  v-if="cell.searchable"
                  :model-value="valueOf(cell.key)"
                  :options="treeChoices(cell.key)"
                  :multiple="false"
                  :empty-text="`暂无${cell.label}可选项`"
                  @update:model-value="setValue(cell.key, String($event))"
                />
                <ThemeSelect
                  v-else
                  :model-value="valueOf(cell.key)"
                  :options="selectOptions(cell.key)"
                  @update:model-value="setValue(cell.key, String($event))"
                />
              </div>

              <!-- Dates Cell -->
              <div v-else-if="cell.kind === 'dates'" class="query-cell">
                <span class="cell-title">
                  {{ cell.label }}
                  <span v-if="cell.help" class="help-badge" tabindex="0" v-hint="cell.help" :aria-label="cell.help">?</span>
                </span>
                <span class="date-pair">
                  <WDatePicker
                    :id="cell.start"
                    :model-value="valueOf(cell.start)"
                    :max="valueOf(cell.end)"
                    :disabled="Boolean(cell.empty && isChecked(cell.empty))"
                    placeholder="起"
                    @update:model-value="setValue(cell.start, String($event))"
                  />
                  <em>到</em>
                  <WDatePicker
                    :id="cell.end"
                    :model-value="valueOf(cell.end)"
                    :min="valueOf(cell.start)"
                    :disabled="Boolean(cell.empty && isChecked(cell.empty))"
                    placeholder="止"
                    @update:model-value="setValue(cell.end, String($event))"
                  />
                  <label v-if="cell.empty" class="empty-check">
                    <input
                      type="checkbox"
                      :checked="isChecked(cell.empty)"
                      @change="toggleCheck(cell.empty, ($event.target as HTMLInputElement).checked)"
                    />
                    <span>为空</span>
                  </label>
                </span>
              </div>
            </template>
          </div>
        </section>
      </div>

      <!-- Template & Action Buttons Row -->
      <div class="form-actions fee-actions">
        <label class="fee-template-save">
          模板名称
          <input v-model="saveName" type="text" maxlength="80" placeholder="输入模板名称" @input="saveNameDirty = true" />
        </label>
        <button class="ghost" type="button" :disabled="!canRead || savingTemplate" @click="saveTemplate">
          {{ savingTemplate ? '正在保存…' : '保存到网站' }}
        </button>
        <button class="ghost" type="button" :disabled="!canRead || deletingTemplate || !selectedTemplateId" @click="deleteTemplate">
          {{ deletingTemplate ? '正在删除…' : '删除原网站模板' }}
        </button>
        <button class="ghost" type="button" @click="exportTemplateJson">导出 JSON</button>
        <button class="ghost" type="button" @click="templateJsonInput?.click()">导入 JSON</button>
        <input ref="templateJsonInput" type="file" accept=".json,application/json" hidden aria-label="导入费用模板 JSON" @change="importTemplateJson" />
        <button class="ghost" type="button" @click="resetForm">重置</button>
        <template v-if="!manage">
          <button
            class="ghost"
            type="button"
            :disabled="!canSearch"
            v-hint="'按当前查询条件导出全部费用 Excel（支持原站模板与栏位排序）'"
            @click="openExportModal('cond')"
          >
            导出清单
          </button>
          <button
            class="ghost"
            type="button"
            :disabled="!canSearch"
            v-hint="'导出下方已勾选费用记录的 Excel（支持原站模板）'"
            @click="openExportModal('checked')"
          >
            导出勾选费用
          </button>
          <button
            class="ghost"
            type="button"
            :disabled="!canSearch"
            v-hint="'按案件汇总官费/代理费/第三方费并导出 Excel（支持原站模板）'"
            @click="openExportModal('count')"
          >
            导出汇总数据
          </button>
          <button class="solid primary-search" type="button" :disabled="!canSearch || searchState === 'loading'" @click="doSearch(1)">
            {{ searchState === 'loading' ? '正在查询…' : '查询' }}
          </button>
        </template>
      </div>
      <p v-if="exportNotice" class="hint export-notice-line">{{ exportNotice }}</p>
    </section>

    <!-- Results Section -->
    <section v-if="!manage" class="card fee-results-section" aria-label="费用查询结果">
      <div class="section-heading">
        <strong>查询结果</strong>
        <slot name="result-actions" />
      </div>
      <slot name="result-review" />
      <!-- Filter Radios Bar (exact alignment with FeeSearch.aspx: 显示全部 / 仅显示选中项 / 只选官费 / 只选代理费) -->
      <div class="filter-radios-bar">
        <label class="empty-check">
          <input v-model="showTypeMode" type="radio" name="fee_show_type" value="all" />
          <span>显示全部</span>
        </label>
        <label class="empty-check">
          <input v-model="showTypeMode" type="radio" name="fee_show_type" value="selected" />
          <span>仅显示选中项</span>
        </label>
        <label class="empty-check">
          <input
            type="radio"
            name="fee_show_fee"
            value="O"
            :checked="quickFeeSelectMode === 'O'"
            @change="applyQuickFeeSelect('O')"
          />
          <span>只选官费</span>
        </label>
        <label class="empty-check">
          <input
            type="radio"
            name="fee_show_fee"
            value="A"
            :checked="quickFeeSelectMode === 'A'"
            @change="applyQuickFeeSelect('A')"
          />
          <span>只选代理费</span>
        </label>
      </div>

      <!-- Amount Stats Summary -->
      <div v-if="result" class="amount-summary-box">
        <div class="summary-line">
          <strong>当前页总额：</strong>
          <span class="stat-item">折后代理费: <em>{{ result.summary.pageAgentFee.toLocaleString() }} CNY</em></span>
          <span class="stat-item">官费: <em>{{ result.summary.pageOfficialFee.toLocaleString() }} CNY</em></span>
          <span class="stat-item">第三方费: <em>{{ result.summary.pageThirdPartyFee.toLocaleString() }} CNY</em></span>
        </div>
        <div class="summary-line total-line">
          <strong>查询条件总额：</strong>
          <span class="stat-item">原始代理费: <em>{{ totalAmountInfo.originalAgentFee.toLocaleString() }} CNY</em></span>
          <span class="stat-item">折后代理费: <em>{{ totalAmountInfo.discountAgentFee.toLocaleString() }} CNY</em></span>
          <span class="stat-item">官费: <em>{{ totalAmountInfo.officialFee.toLocaleString() }} CNY</em></span>
          <span class="stat-item">第三方费: <em>{{ totalAmountInfo.thirdPartyFee.toLocaleString() }} CNY</em></span>
        </div>
      </div>

      <!-- Results Toolbar -->
      <div class="section-heading fee-results-toolbar">
        <span class="sheet-count">共 {{ result?.total ?? 0 }} 条费用记录</span>
        <div class="table-actions">
          <button type="button" class="ghost tiny" :disabled="!result || selectingAll" @click="selectAllPages()">
            {{ selectingAll ? (pagingHint || '正在全选…') : '全选所有' }}
          </button>
          <button type="button" class="ghost tiny" :disabled="!result || selectedCount === 0 || selectingAll" @click="deselectAllPages">取消全选所有</button>
          <button type="button" class="ghost tiny" :disabled="!result || selectingAll" @click="selectCurrentPage(true)">全选本页</button>
          <button type="button" class="ghost tiny" :disabled="!result || selectingAll" @click="selectCurrentPage(false)">取消本页</button>
          <button type="button" class="ghost tiny" :disabled="selectedCount === 0 || selectingAll" @click="clearAllSelected">清空选择</button>
          <button v-if="failedPages.length > 0 && !selectingAll" type="button" class="ghost tiny warn-btn" @click="retryFailedPages">重试没读到的页</button>
          <span v-if="selectedCount > 0" class="hint">已勾选 {{ selectedCount }} 项</span>
        </div>
        <div class="page-size-selector">
          每页条数
          <ThemeSelect v-model="pageSize" aria-label="每页条数" :options="pageSizeOptions" @update:model-value="onPageSizeChange" />
        </div>
      </div>
      <p v-if="selectionNotice" class="hint warn-hint selection-notice" role="status">{{ selectionNotice }}</p>

      <p v-if="searchState === 'idle'" class="hint">请输入查询条件并点击「查询」。</p>
      <p v-else-if="searchState === 'loading'" class="hint" role="status">正在向原网站检索费用明细…</p>
      <p v-else-if="searchState === 'error'" class="error" role="alert">{{ searchMessage }}</p>
      <p v-else-if="searchState === 'empty'" class="hint" role="status">未查到符合条件的费用记录。</p>

      <!-- Data Table -->
      <div v-else-if="result && displayRows.length" class="fit-table fee-table-container">
        <table class="grid fee-data-table">
          <thead>
            <tr>
              <th class="check-col">
                <input
                  type="checkbox"
                  aria-label="全选本页"
                  :disabled="selectingAll"
                  :checked="displayRows.length > 0 && displayRows.every(isRowSelected)"
                  @change="selectCurrentPage(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th class="seq-col">序号</th>
              <th class="op-col">操作</th>
              <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in displayRows" :key="row.feeId || idx">
              <td class="check-col">
                <input
                  type="checkbox"
                  :disabled="selectingAll"
                  :checked="isRowSelected(row)"
                  @change="toggleRow(row, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td class="seq-col">{{ row.sn }}</td>
              <td class="op-col">
                <span class="op-icons" v-hint="'查看 / 编辑'">📄 ✏️</span>
              </td>
              <td v-for="col in columns" :key="col.key">
                <span class="cell-text" v-hint.clip="String((row as unknown as Record<string, unknown>)[col.key] || '')">
                  {{ (row as unknown as Record<string, unknown>)[col.key] ?? '-' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination Bar -->
        <nav class="pagination" aria-label="费用查询分页">
          <button type="button" :disabled="pageIndex <= 1 || selectionPending" @click="changePage(-1)">上一页</button>
          <span>第 {{ pageIndex }} / {{ totalPages }} 页</span>
          <button type="button" :disabled="pageIndex >= totalPages || selectionPending" @click="changePage(1)">下一页</button>
        </nav>
      </div>
    </section>

    <!-- Secondary Modal: 选择客户 / 排除客户名称（1:1 复刻原站 ShowIhgSelect） -->
    <FeeCustomerPickerModal
      :open="customerModalOpen"
      :title="customerModalTarget === 'customer_id' ? '请选择客户' : '请选择排除客户'"
      :bridge="activeBridge()"
      :selected="customerModalTarget === 'customer_id' ? selectedCustomers : selectedRuleOutCustomers"
      @close="customerModalOpen = false"
      @confirm="onConfirmCustomers"
    />

    <!-- Secondary Modal: 导出清单 / 导出勾选费用 / 导出汇总数据（1:1 复刻原站 IhgAdvExport.aspx） -->
    <FeeExportModal
      :open="exportModalOpen"
      :mode="exportModalMode"
      :bridge="activeBridge()"
      :query="buildCurrentQuery()"
      :fee-ids="selectedFeeIds"
      :case-type="valueOf('case_type')"
      :field-columns="feeInit?.fieldColumns ?? {}"
      :timeout-ms="queryTimeoutMs"
      @close="exportModalOpen = false"
      @exported="onFeeExported"
    />
  </div>
</template>

<style scoped>
.fee-search-query { display: grid; gap: 12px; min-width: 0; }
.guard-trigger {
  flex: 1 1 auto;
  min-width: 0;
  height: 31px;
  border-radius: 8px;
  font-size: 12px;
}

/* 严格复用 PatMail 全局原生粉色 checkbox / radio（与 LimitQuerySection / QueryTemplateSection / TreeOptionSelect 保持 100% 一致） */
.fee-search-query input[type="checkbox"],
.fee-search-query input[type="radio"] {
  accent-color: var(--pink, #ff4f93);
  width: 15px;
  height: 15px;
  min-width: 15px;
  min-height: 15px;
  margin: 0;
  padding: 0;
  flex: none;
  cursor: pointer;
}
.fee-search-query input[type="checkbox"]:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.empty-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  font-size: 12px;
  color: #65536d;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
.empty-check.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 3 列主表单网格（与原站 #tbCommon 3 列排布 1:1 对齐） */
.fee-form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 16px;
}
.quick-row {
  margin: 10px 0 12px;
  padding-bottom: 12px;
  border-bottom: 1px dashed #f0e1eb;
}

.query-cell {
  display: grid;
  grid-template-columns: 7.4em minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-width: 0;
}
.query-cell.quick-cell {
  align-items: start;
}
.query-cell.quick-cell .cell-title {
  padding-top: 6px;
}
.query-cell.span-all {
  grid-column: 1 / -1;
}
.query-spacer {
  min-width: 0;
}

.cell-title {
  color: #8a7290;
  font-size: 12px;
  text-align: right;
  line-height: 1.35;
  word-break: keep-all;
}
.help-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  margin-left: 3px;
  border: 1px solid #f6c5d8;
  border-radius: 50%;
  background: #fff0f6;
  color: #e44586;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  vertical-align: middle;
  cursor: help;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}
.help-badge:hover,
.help-badge:focus-visible {
  background: var(--pink, #ff4f93);
  border-color: var(--pink, #ff4f93);
  color: #fff;
  outline: none;
}

.cell-stack {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.cell-stack textarea {
  width: 100%;
  min-width: 0;
  min-height: 52px;
  padding: 5px 8px;
  border: 1px solid #e9d9e9;
  border-radius: 8px;
  background: #fff;
  color: #4e4056;
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
  resize: vertical;
}
.cell-stack textarea:focus-visible {
  outline: 2px solid #ffc0da;
  outline-offset: 1px;
}

.check-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
}

.cell-body {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.cell-body input:not([type="checkbox"]) {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 31px;
  padding: 5px 8px;
  border: 1px solid #e9d9e9;
  border-radius: 8px;
  background: #fff;
  color: #4e4056;
  font: inherit;
  font-size: 12px;
}
.cell-body :deep(.theme-select),
.query-cell :deep(.theme-select) {
  flex: 1 1 auto;
  min-width: 0;
}
.cell-body :deep(.theme-select-trigger),
.query-cell :deep(.theme-select-trigger) {
  height: 31px;
  min-width: 0;
  border-radius: 8px;
  font-size: 12px;
}

/* 二级弹窗触发器（客户名称 / 排除客户名称） */
.modal-picker-trigger {
  flex: 1 1 auto;
  min-width: 0;
  height: 31px;
  padding: 0 8px;
  border: 1px solid #eadff0;
  border-radius: 8px;
  background: #fff;
  color: #4e4056;
  font: inherit;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  text-align: left;
  cursor: pointer;
}
.modal-picker-trigger:hover {
  border-color: #ffb3d0;
}
.modal-picker-trigger.is-empty .modal-picker-text {
  color: var(--sub, #8d97b0);
}
.modal-picker-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.modal-picker-badge {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  background: #fff0f6;
  color: #e44586;
  font-size: 11px;
  font-weight: 600;
}
.modal-clear-btn {
  flex: none;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 50%;
  background: #fff0f6;
  color: #c44b7e;
  font-size: 14px;
  line-height: 1;
  padding: 0;
}
.modal-clear-btn:hover {
  background: #ffe0ee;
  color: #e11d48;
}

.date-pair {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.date-pair :deep(.w-date-picker) {
  flex: 1 1 70px;
  min-width: 68px;
}
.date-pair em {
  font-style: normal;
  color: #a38ca5;
  font-size: 12px;
  flex-shrink: 0;
}

.advanced-toggle-row { display: flex; justify-content: flex-end; margin: 12px 0 4px; }
.text-button { border: 0; background: transparent; color: #ba6284; font: inherit; font-size: 12px; padding: 4px 8px; cursor: pointer; }
.text-button:hover:not(:disabled) { color: #e24b84; background: #fff0f6; border-radius: 6px; }
.text-button:disabled { opacity: .5; cursor: default; }

.advanced-sections { margin-top: 10px; border-top: 1px dashed #ecdce8; padding-top: 12px; }
.advanced-block + .advanced-block { margin-top: 16px; }
.block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.block-title { font-size: 13px; font-weight: 650; color: #c44b7e; margin: 0; padding-left: 8px; border-left: 3px solid #f5a9ca; }

.fee-actions { flex-wrap: wrap; align-items: center; gap: 8px; justify-content: flex-end; margin-top: 16px; }
.fee-template-save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: auto;
  font-size: 12px;
  color: #8a7290;
}
.fee-template-save input {
  width: 170px;
  min-height: 31px;
  padding: 5px 8px;
  border: 1px solid #e9d9e9;
  border-radius: 8px;
  background: #fff;
  color: #4e4056;
  font: inherit;
  font-size: 12px;
}
.template-select-label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: #8a7290;
  margin-bottom: 12px;
}
.query-section-head {
  padding-top: 12px;
  border-top: 1px dashed #f0e1eb;
}
.export-notice-line {
  margin: 8px 0 0;
  color: #b93d74;
  text-align: right;
}
.primary-search { min-width: 76px; }

.fee-results-section { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; min-width: 0; }
.filter-radios-bar { display: flex; flex-wrap: wrap; gap: 10px 18px; padding-bottom: 12px; border-bottom: 1px solid #f0e1eb; }

.amount-summary-box { background: #fff6fa; border: 1px solid #f3d7e5; border-radius: 12px; padding: 12px 14px; font-size: 12px; }
.summary-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; color: #75657d; }
.summary-line.total-line { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #edcfdf; }
.stat-item em { font-style: normal; font-weight: 650; color: #d9578c; margin-left: 4px; }

.fee-results-section > .section-heading, .table-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.fee-results-toolbar .table-actions { flex: 1 1 360px; min-width: 0; }
.page-size-selector { display: flex; align-items: center; gap: 6px; margin-inline-start: auto; white-space: nowrap; font-size: 12px; color: #8a7290; }
.page-size-selector :deep(.theme-select) { flex: 0 0 92px; }
.page-size-selector :deep(.theme-select-trigger) { min-width: 0; }
.page-size-selector :deep(.theme-select), .query-timeout :deep(.theme-select) { width: 92px; }
.selection-notice { margin: 0; overflow-wrap: anywhere; }
.warn-hint { color: #c95276; font-size: 12px; }
.warn-btn { border-color: #f3c2d4; color: #b8436e; }

.fee-table-container { overflow-x: auto; min-width: 0; }
.fee-data-table { width: 100%; white-space: nowrap; }
.fee-data-table .check-col { width: 32px; text-align: center; }
.fee-data-table .seq-col { width: 44px; text-align: center; }
.fee-data-table .op-col { width: 60px; text-align: center; }
.op-icons { font-size: 13px; letter-spacing: 4px; }
.cell-text { display: inline-block; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 1100px) {
  .fee-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .query-spacer { display: none; }
}
@media (max-width: 700px) {
  .fee-form-grid { grid-template-columns: minmax(0, 1fr); }
  .fee-results-toolbar .table-actions { order: 1; flex-basis: 100%; }
}
</style>
