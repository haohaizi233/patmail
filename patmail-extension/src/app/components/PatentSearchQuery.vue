<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue'
import {
  PATENT_CASE_OTHER_PROPS,
  PATENT_CASE_TYPE_ID,
  PATENT_COLUMNS,
  PATENT_OBJECT_FIELDS,
  PATENT_SELECTS,
  buildColselString,
  defaultPatentVisibleColumns,
  isPatentFieldKey
} from '../../api/patent-form'
import type { PatentInitData, PatentOptionItem, PatentSearchQuery, PatentSearchRow } from '../../api/patent-search-types'
import type { HistoryQueryOption } from '../../api/query-history'
import { readFilingTimeout, writeFilingTimeout } from '../../api/query-timeout'
import type { FileSearchTimeoutMs } from '../../api/file-search-params'
import type { TreeOption } from '../../query/option-tree'
import { MessageType, type MessageBridge } from '../../shared/message'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import TreeOptionSelect from '../../shell/components/TreeOptionSelect.vue'
import { PATENT_EXPORT_WORKFLOW_ID } from '../../api/fee-export'
import FeeExportModal from './FeeExportModal.vue'
import { createWorkflowBridge } from '../services/full-page-bridge'
import { infoDialog } from '../dialog'
import WDatePicker from '../../shell/components/WDatePicker.vue'

const props = defineProps<{
  bridge?: MessageBridge
  userId: string
  canSearch: boolean
}>()

const patentExportBridge = createWorkflowBridge(PATENT_EXPORT_WORKFLOW_ID)
const patentExportQuery = ref<PatentSearchQuery>()
const exportMessage = ref('')
const historyExportColumns = ref<string[]>([])

function openPatentExport(): void {
  exportMessage.value = ''
  const query = buildQuery()
  if (!query.is_first) {
    void infoDialog({ title: '提示', message: '请至少输入一个查询条件！' })
    return
  }
  patentExportQuery.value = query
}

const injectedBridge = inject<MessageBridge>('bridge')
function activeBridge(): MessageBridge | undefined {
  return props.bridge ?? injectedBridge
}

// 初始化字典
const initLoading = ref(false)
const initError = ref('')
const initData = ref<PatentInitData | null>(null)
const ctrlProcOptions = ref<TreeOption[]>([])

// 超时时间
const queryTimeoutMs = ref<FileSearchTimeoutMs>(60_000)
const timeoutOptions = [
  { value: 60_000, label: '1 分钟' },
  { value: 120_000, label: '2 分钟' },
  { value: 300_000, label: '5 分钟' },
  { value: 600_000, label: '10 分钟' }
]
watch(queryTimeoutMs, value => {
  void writeFilingTimeout(value)
}, { flush: 'sync' })

// 表单状态
const fields = ref<Record<string, string>>({
  case_type: PATENT_CASE_TYPE_ID
})
const checks = ref<Record<string, boolean>>({})
const showMore = ref(false)
const collapsedBlocks = ref<Record<string, boolean>>({})
const isProc = ref(false)
const isFuzzyCaseVolume = ref(false)
const isFuzzyAppNo = ref(false)
const isFuzzyPctAppNo = ref(false)
const isPointAppNo = ref(false)
const isRemoveSymbol = ref(false)
const selectAnd = ref(false)

// 历史模板
const historyOptions = ref<HistoryQueryOption[]>([])
const loadingHistory = ref(false)
const selectedHistoryId = ref('')
const saveTitle = ref('')
const historyBusy = ref(false)
const historyMessage = ref('')

// 分页与列设置
const pageIndex = ref(1)
const pageSize = ref(20)
const showColPanel = ref(false)
const visibleCols = ref<string[]>(defaultPatentVisibleColumns(false))
const hasCustomColEdit = ref(false)

// 查询结果
const searching = ref(false)
const searchError = ref('')
const rows = ref<PatentSearchRow[]>([])
const total = ref(0)
const totalPages = ref(0)
const hasSearched = ref(false)
const copyNotice = ref('')

const pageSizeOptions = [
  { value: 10, label: '10 条/页' },
  { value: 20, label: '20 条/页' },
  { value: 50, label: '50 条/页' },
  { value: 100, label: '100 条/页' }
]

const activeColumns = computed(() => {
  const chosen = new Set(visibleCols.value)
  return PATENT_COLUMNS.filter(col => chosen.has(col.field))
})

const customerFromOptions = computed<PatentOptionItem[]>(() =>
  initData.value?.customerFroms.length ? initData.value.customerFroms : PATENT_SELECTS.customer_from
)
const caseCoefficientOptions = computed<PatentOptionItem[]>(() => [
  { value: '', label: '请选择' },
  ...(initData.value?.caseCoefficients ?? [])
])
const generationStatusOptions = computed<PatentOptionItem[]>(() => [
  { value: '', label: '请选择' },
  ...(initData.value?.generationStatuses ?? [])
])
const zlLanguageOptions = computed<PatentOptionItem[]>(() => [
  { value: '', label: '请选择' },
  ...(initData.value?.zlLanguages ?? [])
])
const protectionCenterOptions = computed<PatentOptionItem[]>(() => [
  { value: '', label: '请选择' },
  ...(initData.value?.protectionCenters ?? [])
])
const applicantTypeOptions = computed<PatentOptionItem[]>(() =>
  initData.value?.applicantTypes.length
    ? [{ value: '', label: '请选择' }, ...initData.value.applicantTypes]
    : PATENT_SELECTS.first_applicant_type
)
const sourceTypeOptions = computed<PatentOptionItem[]>(() =>
  initData.value?.sourceTypes.length
    ? [{ value: '', label: '请选择' }, ...initData.value.sourceTypes]
    : PATENT_SELECTS.sourcetype
)
const businessCoopOptions = computed<PatentOptionItem[]>(() =>
  initData.value?.businessCoops.length
    ? [{ value: '', label: '全部' }, ...initData.value.businessCoops]
    : PATENT_SELECTS.business_coop
)
const customerClassOptions = computed<PatentOptionItem[]>(() =>
  initData.value?.customerClasses.length
    ? [{ value: '', label: '请选择' }, ...initData.value.customerClasses]
    : PATENT_SELECTS.customer_class
)

function customLabel(key: string, fallback: string): string {
  return initData.value?.fieldColumns[key] || fallback
}

function fieldVal(key: string): string {
  return fields.value[key] ?? ''
}

function setFieldVal(key: string, val: string): void {
  fields.value[key] = val
}

function isChecked(key: string): boolean {
  return Boolean(checks.value[key])
}

function toggleBlock(id: string): void {
  collapsedBlocks.value[id] = !collapsedBlocks.value[id]
}

function toggleNullCheck(baseKey: string, checked: boolean, pairDate = true, nullKeyOverride?: string): void {
  const nullKey = nullKeyOverride ?? `${baseKey}_isnull`
  checks.value[nullKey] = checked
  if (checked) {
    if (pairDate) {
      fields.value[`${baseKey}_start`] = ''
      fields.value[`${baseKey}_end`] = ''
    } else {
      fields.value[baseKey] = ''
    }
  }
}

function onFormKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  const target = event.target as HTMLElement | null
  if (target?.tagName === 'TEXTAREA') return
  event.preventDefault()
  if (props.canSearch && !searching.value) {
    void runSearch(1)
  }
}

function treeLabelMap(options: TreeOption[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const item of options) map.set(item.value, item.label)
  return map
}

function resolveDisplayValues(): Record<string, string> {
  const data = initData.value
  const mapByField: Record<string, TreeOption[]> = {
    apply_type: data?.applyTypes ?? [],
    branch_dept_id: data?.branchDepts ?? [],
    branch_dept_id_cus: data?.branchDepts ?? [],
    agency: data?.agencies ?? [],
    charge_dept_id: data?.depts ?? [],
    sale_dept_id: data?.depts ?? [],
    case_pic_user: data?.users ?? [],
    user_assistant: data?.users ?? [],
    case_foreign_pic_user: data?.users ?? [],
    p_case_info_flow_user_id: data?.users ?? [],
    sales: data?.users ?? [],
    sales_help: data?.users ?? [],
    case_agent_user: data?.users ?? [],
    apply_create_user_id: data?.users ?? [],
    import_apply_user: data?.users ?? [],
    apply_user: data?.users ?? [],
    pic_user: data?.users ?? [],
    proc_creater: data?.users ?? [],
    proc_updater: data?.users ?? [],
    revise_user_id: data?.users ?? [],
    foreign_pic: data?.users ?? [],
    mentor: data?.users ?? [],
    translate: data?.users ?? [],
    proofread: data?.users ?? [],
    country: data?.countries ?? [],
    retrieval_unit: data?.countries ?? [],
    from_country_id: data?.countries ?? [],
    first_applicant_country: data?.countries ?? [],
    priority_country: data?.countries ?? [],
    customer_country: data?.countries ?? [],
    Hague_country: data?.countries ?? [],
    p_case_info__from_stage: data?.fromStages ?? [],
    business_type: data?.bussTypes ?? [],
    case_status: data?.caseStatuses ?? [],
    flow_direction: data?.caseDirections ?? [],
    apply_tags_id: data?.applyTags ?? [],
    customer_status: data?.customerStatuses ?? [],
    product_name: data?.products ?? [],
    technical_field: data?.technicals ?? [],
    i_ctrl_proc: ctrlProcOptions.value,
    review_stage: data?.reviewStages ?? [],
    proc_status: data?.procStatuses ?? [],
    related_type: data?.relateTypes ?? [],
    proc_user_assistant: data?.users ?? []
  }
  const out: Record<string, string> = {}
  for (const [key, opts] of Object.entries(mapByField)) {
    const raw = fields.value[key] ?? ''
    if (!raw) continue
    const lookup = treeLabelMap(opts)
    out[key] = raw
      .split(',')
      .map(id => lookup.get(id.trim()) ?? id.trim())
      .filter(Boolean)
      .join(',')
  }
  return out
}

function buildQuery(): PatentSearchQuery {
  const mergedChecks: Record<string, boolean> = { ...checks.value }
  if (isProc.value) mergedChecks.is_proc = true
  if (isFuzzyCaseVolume.value) mergedChecks.is_fuzzy_query_case_volume = true
  if (isFuzzyAppNo.value) mergedChecks.is_fuzzy_query_app_no = true
  if (isFuzzyPctAppNo.value) mergedChecks.is_fuzzy_query_pct_app_no = true
  if (isPointAppNo.value) mergedChecks.is_point_app_no = true
  if (isRemoveSymbol.value) mergedChecks.is_remove_symbol = true
  const hasAnyField = Object.entries(fields.value).some(([k, v]) => k !== 'case_type' && Boolean(v.trim())) ||
    Object.values(mergedChecks).some(Boolean)
  return {
    pageIndex: pageIndex.value,
    pageSize: pageSize.value,
    is_proc: isProc.value,
    is_fuzzy_query_case_volume: isFuzzyCaseVolume.value,
    is_fuzzy_query_app_no: isFuzzyAppNo.value,
    is_fuzzy_query_pct_app_no: isFuzzyPctAppNo.value,
    is_point_app_no: isPointAppNo.value,
    is_remove_symbol: isRemoveSymbol.value,
    select_and: selectAnd.value,
    is_first: hasAnyField,
    colsel: buildColselString(visibleCols.value),
    fields: { ...fields.value, case_type: fields.value.case_type || PATENT_CASE_TYPE_ID },
    displayValues: resolveDisplayValues(),
    checks: mergedChecks
  }
}

async function loadInit(): Promise<void> {
  const b = activeBridge()
  if (!b || !props.userId) return
  initLoading.value = true
  initError.value = ''
  try {
    const res = await b.request({ type: MessageType.LoadPatentInit })
    if (res.type === MessageType.LoadPatentInitResult && res.payload.ok) {
      initData.value = res.payload.data
      ctrlProcOptions.value = res.payload.data.ctrlProcs
      if (res.payload.data.caseTypeId) {
        fields.value.case_type = res.payload.data.caseTypeId
      }
      if (!hasCustomColEdit.value && res.payload.data.savedColumns.length) {
        const validSet = new Set(PATENT_COLUMNS.map(c => c.field))
        const filtered = res.payload.data.savedColumns.filter(col => validSet.has(col))
        if (filtered.length) visibleCols.value = filtered
      }
      if (res.payload.data.warnings.length) {
        initError.value = res.payload.data.warnings.join('；')
      }
    } else if (res.type === MessageType.LoadPatentInitResult && !res.payload.ok) {
      initError.value = res.payload.error.message
    } else if (res.type === MessageType.Error) {
      initError.value = res.payload.message
    }
  } finally {
    initLoading.value = false
  }
}

async function loadHistoryList(force = false): Promise<void> {
  const b = activeBridge()
  if (!b || !props.userId) return
  loadingHistory.value = true
  try {
    const res = await b.request({
      type: MessageType.ListHistoryQueries,
      payload: { force, surface: 'patent' }
    })
    if (res.type === MessageType.HistoryQueriesResult && res.payload.ok) {
      historyOptions.value = res.payload.data
    }
  } finally {
    loadingHistory.value = false
  }
}

function applyHistoryXml(queryXml: string): void {
  if (!queryXml || /<!DOCTYPE|<!ENTITY/i.test(queryXml)) return
  const doc = new DOMParser().parseFromString(queryXml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return
  const root = doc.documentElement
  if (!root || root.nodeName !== 'xmlRoot') return
  let nodes = Array.from(root.children)
  while (nodes.length === 1 && nodes[0].nodeName === 'xmlRoot') {
    nodes = Array.from(nodes[0].children)
  }

  resetForm(false)
  for (const node of nodes) {
    const name = node.nodeName
    if (name.endsWith('_text') || !isPatentFieldKey(name)) continue
    const val = (node.textContent ?? '').trim()
    if (name === 'is_proc') {
      isProc.value = val === 'on' || val === 'true' || val === '1'
    } else if (name === 'is_fuzzy_query_case_volume') {
      isFuzzyCaseVolume.value = val === 'on' || val === 'true' || val === '1'
    } else if (name === 'is_fuzzy_query_app_no') {
      isFuzzyAppNo.value = val === 'on' || val === 'true' || val === '1'
    } else if (name === 'is_fuzzy_query_pct_app_no') {
      isFuzzyPctAppNo.value = val === 'on' || val === 'true' || val === '1'
    } else if (name === 'is_point_app_no') {
      isPointAppNo.value = val === 'on' || val === 'true' || val === '1'
    } else if (name === 'is_remove_symbol') {
      isRemoveSymbol.value = val === 'on' || val === 'true' || val === '1'
    } else if (
      name.endsWith('_isnull') ||
      name === 'is_remove_space' ||
      name === 'applicant_zhunque' ||
      name === 'inventor_zhunque' ||
      name === 'pic_no_user' ||
      PATENT_CASE_OTHER_PROPS.some(p => p.key === name)
    ) {
      checks.value[name] = val === 'on' || val === 'true' || val === '1'
    } else {
      fields.value[name] = val === 'null' ? '' : val
    }
  }
  showMore.value = true
}

async function onSelectHistory(queryId: string): Promise<void> {
  selectedHistoryId.value = queryId
  historyExportColumns.value = []
  historyMessage.value = ''
  if (!queryId) return
  const b = activeBridge()
  if (!b) return
  historyBusy.value = true
  try {
    const res = await b.request({
      type: MessageType.GetHistoryQuery,
      payload: { queryId, surface: 'patent' }
    })
    if (selectedHistoryId.value !== queryId) return
    if (res.type === MessageType.HistoryQueryResult && res.payload.ok) {
      applyHistoryXml(res.payload.data.queryXml)
      const outXml = res.payload.data.outXml
      if (outXml && !/<!DOCTYPE|<!ENTITY/i.test(outXml)) {
        const root = new DOMParser().parseFromString(outXml, 'application/xml').documentElement
        if (root.nodeName === 'xmlRoot') historyExportColumns.value = Array.from(root.children, col => col.nodeName)
      }
      historyMessage.value = `已载入历史条件「${res.payload.data.name}」`
    } else if (res.type === MessageType.HistoryQueryResult && !res.payload.ok) {
      historyMessage.value = res.payload.error.message
    }
  } finally {
    historyBusy.value = false
  }
}

async function saveHistoryQuery(): Promise<void> {
  const title = saveTitle.value.trim()
  if (!title) {
    historyMessage.value = '请输入模板名称。'
    return
  }
  const b = activeBridge()
  if (!b) return
  historyBusy.value = true
  historyMessage.value = ''
  try {
    const q = buildQuery()
    const display = q.displayValues ?? {}
    const parts: string[] = []
    for (const [k, v] of Object.entries(q.fields)) {
      if (!v) continue
      const safe = v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      parts.push(`<${k}>${safe}</${k}>`)
      if (PATENT_OBJECT_FIELDS.has(k) && display[k]) {
        const safeText = display[k].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        parts.push(`<${k}_text>${safeText}</${k}_text>`)
      }
    }
    for (const [k, v] of Object.entries(q.checks ?? {})) {
      if (v) parts.push(`<${k}>${k === 'pic_no_user' ? '1' : 'on'}</${k}>`)
    }
    const queryXml = `<xmlRoot>${parts.join('')}</xmlRoot>`
    const res = await b.request({
      type: MessageType.SaveHistoryQuery,
      payload: { title, queryId: '', queryXml, surface: 'patent' }
    })
    if (res.type === MessageType.HistoryQuerySaved && res.payload.ok) {
      saveTitle.value = ''
      historyMessage.value = `已保存模板「${title}」`
      await loadHistoryList(true)
    } else if (res.type === MessageType.HistoryQuerySaved && !res.payload.ok) {
      historyMessage.value = res.payload.error.message
    } else if (res.type === MessageType.Error) {
      historyMessage.value = res.payload.message
    }
  } finally {
    historyBusy.value = false
  }
}

async function deleteHistoryQuery(): Promise<void> {
  if (!selectedHistoryId.value) return
  const b = activeBridge()
  if (!b) return
  historyBusy.value = true
  historyMessage.value = ''
  try {
    const res = await b.request({
      type: MessageType.DeleteHistoryQuery,
      payload: { queryId: selectedHistoryId.value, surface: 'patent' }
    })
    if (res.type === MessageType.HistoryQueryDeleted && res.payload.ok) {
      selectedHistoryId.value = ''
      historyMessage.value = '已删除模板'
      await loadHistoryList(true)
    } else if (res.type === MessageType.HistoryQueryDeleted && !res.payload.ok) {
      historyMessage.value = res.payload.error.message
    } else if (res.type === MessageType.Error) {
      historyMessage.value = res.payload.message
    }
  } finally {
    historyBusy.value = false
  }
}

watch(
  () => [fields.value.country ?? '', fields.value.proc_type ?? ''] as const,
  async ([countryIds, procType]) => {
    const b = activeBridge()
    if (!b || !initData.value) return
    if (!countryIds.trim() && !procType.trim()) {
      ctrlProcOptions.value = initData.value.ctrlProcs
      return
    }
    const res = await b.request({
      type: MessageType.LoadPatentCtrlProc,
      payload: { countryIds, procType }
    })
    if (res.type === MessageType.LoadPatentCtrlProcResult && res.payload.ok && res.payload.data.length) {
      ctrlProcOptions.value = res.payload.data
    }
  }
)

watch(isProc, next => {
  const procFields = new Set(PATENT_COLUMNS.filter(c => c.isProc && c.defaultVisible).map(c => c.field))
  if (next) {
    visibleCols.value = [...new Set([...visibleCols.value, ...procFields])]
  } else {
    visibleCols.value = visibleCols.value.filter(f => !procFields.has(f))
  }
})

async function runSearch(targetPage = 1): Promise<void> {
  const b = activeBridge()
  if (!b || !props.canSearch) return
  pageIndex.value = targetPage
  searching.value = true
  searchError.value = ''
  hasSearched.value = true
  try {
    const res = await b.request({
      type: MessageType.SearchPatent,
      payload: { query: buildQuery(), timeoutMs: queryTimeoutMs.value }
    })
    if (res.type === MessageType.SearchPatentResult && res.payload.ok) {
      rows.value = res.payload.data.rows
      total.value = res.payload.data.total
      totalPages.value = res.payload.data.totalPages
    } else if (res.type === MessageType.SearchPatentResult && !res.payload.ok) {
      searchError.value = res.payload.error.message
      rows.value = []
      total.value = 0
      totalPages.value = 0
    } else if (res.type === MessageType.Error) {
      searchError.value = res.payload.message
    }
  } finally {
    searching.value = false
  }
}

function resetForm(clearHistory = true): void {
  fields.value = { case_type: initData.value?.caseTypeId || PATENT_CASE_TYPE_ID }
  checks.value = {}
  isProc.value = false
  isFuzzyCaseVolume.value = false
  isFuzzyAppNo.value = false
  isFuzzyPctAppNo.value = false
  isPointAppNo.value = false
  isRemoveSymbol.value = false
  selectAnd.value = false
  if (clearHistory) {
    selectedHistoryId.value = ''
    historyMessage.value = ''
  }
}

function toggleColumn(field: string): void {
  hasCustomColEdit.value = true
  if (visibleCols.value.includes(field)) {
    if (visibleCols.value.length <= 1) return
    visibleCols.value = visibleCols.value.filter(f => f !== field)
  } else {
    visibleCols.value = [...visibleCols.value, field]
  }
}

function resetColumns(): void {
  hasCustomColEdit.value = false
  const validSet = new Set(PATENT_COLUMNS.map(c => c.field))
  const saved = (initData.value?.savedColumns ?? []).filter(col => validSet.has(col))
  visibleCols.value = saved.length ? saved : defaultPatentVisibleColumns(isProc.value)
}

function cellValue(row: PatentSearchRow, field: string): string {
  const direct: Record<string, string> = {
    case_volume: row.caseVolume,
    case_volume_customer: row.caseVolumeCustomer,
    case_name: row.caseName,
    apply_name: row.applyName,
    applicants: row.applicants,
    pic_case: row.picCase,
    foreign_pic_case: row.foreignPicCase,
    app_no: row.appNo,
    app_date: row.appDate,
    apply_type: row.applyType,
    case_status: row.caseStatus,
    ctrl_proc: row.ctrlProc,
    pic_proc: row.picProc,
    proc_status: row.procStatus,
    country_name: row.countryName,
    legal_due_date: row.legalDueDate,
    cus_due_date: row.cusDueDate,
    int_due_date: row.intDueDate,
    proc_note: row.procNote,
    state_into_date: row.stateIntoDate,
    pct_app_no: row.pctAppNo,
    pct_app_date: row.pctAppDate,
    mentor: row.mentor,
    translate: row.translate,
    proofread: row.proofread,
    back_inventor_date: row.backInventorDate,
    translate_count: row.translateCount
  }
  return direct[field] ?? row.raw[field] ?? ''
}

function exportCsv(): void {
  if (!rows.value.length) return
  const cols = activeColumns.value
  const escapeCsv = (val: string): string => `"${val.replace(/"/g, '""')}"`
  const header = cols.map(c => escapeCsv(c.title)).join(',')
  const body = rows.value.map(r => cols.map(c => escapeCsv(cellValue(r, c.field))).join(','))
  const csv = `\uFEFF${[header, ...body].join('\r\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `专利查询_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

async function copyVolume(text: string): Promise<void> {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copyNotice.value = `已复制：${text}`
    setTimeout(() => {
      if (copyNotice.value === `已复制：${text}`) copyNotice.value = ''
    }, 2000)
  } catch {
    /* ignore clipboard failure */
  }
}

onMounted(() => {
  void readFilingTimeout().then(value => {
    queryTimeoutMs.value = value
  })
  void loadInit()
  void loadHistoryList(false)
})
</script>

<template>
  <div class="patent-search-query" @keydown="onFormKeydown">
    <!-- 条件与历史模板卡片 -->
    <section class="card query-template query-conditions" aria-label="专利查询条件">
      <div class="section-heading template-head-bar">
        <strong>当前账号的专利模板</strong>
        <div class="template-head-right">
          <div class="template-inline-select">
            <ThemeSelect
              :model-value="selectedHistoryId"
              placeholder="选择历史查询条件"
              empty-text="当前账号还没有专利查询模板。"
              :options="historyOptions.map(item => ({ value: item.id, label: item.name }))"
              @update:model-value="v => void onSelectHistory(String(v))"
            />
          </div>
          <button type="button" class="text-button" :disabled="loadingHistory" @click="void loadHistoryList(true)">
            {{ loadingHistory ? '读取中…' : '重新读取' }}
          </button>
        </div>
      </div>
      <p v-if="historyMessage" class="hint">{{ historyMessage }}</p>
      <ul v-if="historyOptions.length" class="template-picks compact-picks">
        <li v-for="item in historyOptions" :key="item.id">
          <button type="button" :class="{ on: selectedHistoryId === item.id }" @click="void onSelectHistory(item.id)">
            <b v-hint.clip="item.name">{{ item.name }}</b>
          </button>
        </li>
      </ul>

      <div class="section-heading query-section-head">
        <strong>查询条件</strong>
        <span class="inline-actions">
          <label class="query-timeout">超时时间
            <ThemeSelect v-model="queryTimeoutMs" :options="timeoutOptions" />
          </label>
          <button type="button" class="text-button" :disabled="initLoading" @click="void loadInit()">
            {{ initLoading ? '读取字典中…' : '校对最新字典' }}
          </button>
        </span>
      </div>

      <p v-if="initLoading" class="hint">正在向原网站读取专利字典…</p>
      <p v-if="initError" class="hint warn-hint">{{ initError }}</p>

      <!-- Row 1: 快捷多行文本区 (与 ICSearch.aspx Row 1 对齐) -->
      <div class="query-grid patent-form-grid quick-row">
        <div class="query-cell quick-cell">
          <span class="cell-title">我方文号</span>
          <div class="cell-stack">
            <textarea
              :value="fieldVal('case_volume')"
              rows="2"
              placeholder="多个中间用分；空格或者换行隔开,默认小于10条模糊查询，大于10条精确查询"
              @input="setFieldVal('case_volume', ($event.target as HTMLTextAreaElement).value)"
            />
            <div class="check-row">
              <label class="empty-check">
                <input v-model="isFuzzyCaseVolume" type="checkbox" />
                <span>模糊查询</span>
              </label>
            </div>
          </div>
        </div>

        <div class="query-cell quick-cell">
          <span class="cell-title">申请号</span>
          <div class="cell-stack">
            <textarea
              :value="fieldVal('app_no')"
              rows="2"
              :disabled="isChecked('app_no_isnull')"
              placeholder="多个中间用分；空格或者换行隔开,默认小于10条模糊查询，大于10条精确查询"
              @input="setFieldVal('app_no', ($event.target as HTMLTextAreaElement).value)"
            />
            <div class="check-row">
              <label class="empty-check"><input v-model="isFuzzyAppNo" type="checkbox" /><span>模糊查询</span></label>
              <label class="empty-check"><input v-model="isPointAppNo" type="checkbox" /><span>去点查询</span></label>
              <label class="empty-check">
                <input
                  type="checkbox"
                  :checked="isChecked('app_no_isnull')"
                  @change="toggleNullCheck('app_no', ($event.target as HTMLInputElement).checked, false)"
                />
                <span>为空</span>
              </label>
            </div>
          </div>
        </div>

        <div class="query-cell quick-cell">
          <span class="cell-title">PCT申请号</span>
          <div class="cell-stack">
            <textarea
              :value="fieldVal('pct_app_no')"
              rows="2"
              placeholder="多个中间用分；空格或者换行隔开"
              @input="setFieldVal('pct_app_no', ($event.target as HTMLTextAreaElement).value)"
            />
            <div class="check-row">
              <label class="empty-check">
                <input v-model="isFuzzyPctAppNo" type="checkbox" />
                <span>模糊查询</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Row 2 ~ Row 5: 默认可见 3 列 × 4 行 (严格对齐 ICSearch.aspx .searchinfo) -->
      <div class="query-grid patent-form-grid">
        <!-- Row 2 -->
        <div class="query-cell">
          <span class="cell-title">客户文号</span>
          <div class="cell-body">
            <input
              :value="fieldVal('case_volume_customer')"
              type="text"
              placeholder="多个中间用分；空格或者换行隔开"
              @input="setFieldVal('case_volume_customer', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
        <div class="query-cell">
          <span class="cell-title">客户名称</span>
          <div class="cell-body">
            <input
              :value="fieldVal('customer')"
              type="text"
              placeholder="多个中间用分；空格或者换行隔开"
              @input="setFieldVal('customer', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
        <div class="query-cell">
          <span class="cell-title">客户状态</span>
          <div class="cell-body">
            <TreeOptionSelect
              :model-value="fieldVal('customer_status')"
              :options="initData?.customerStatuses ?? []"
              :disabled="isChecked('customer_status_isnull')"
              @update:model-value="v => setFieldVal('customer_status', v)"
            />
            <label class="empty-check">
              <input
                type="checkbox"
                :checked="isChecked('customer_status_isnull')"
                @change="toggleNullCheck('customer_status', ($event.target as HTMLInputElement).checked, false)"
              />
              <span>为空</span>
            </label>
          </div>
        </div>

        <!-- Row 3 -->
        <div class="query-cell">
          <span class="cell-title">申请人</span>
          <div class="cell-body">
            <input
              :value="fieldVal('applicant')"
              type="text"
              placeholder="多个中间用分；空格或者换行隔开"
              @input="setFieldVal('applicant', ($event.target as HTMLInputElement).value)"
            />
            <label class="empty-check"><input v-model="checks.is_remove_space" type="checkbox" /><span>分隔空格</span></label>
            <label class="empty-check"><input v-model="checks.applicant_zhunque" type="checkbox" /><span>精准查询</span></label>
          </div>
        </div>
        <div class="query-cell">
          <span class="cell-title">申请日</span>
          <div class="cell-stack">
            <span class="date-pair">
              <WDatePicker
                :model-value="fieldVal('app_date_start')"
                :max="fieldVal('app_date_end')"
                :disabled="isChecked('app_date_isnull')"
                placeholder="起"
                @update:model-value="v => setFieldVal('app_date_start', v)"
              />
              <em>到</em>
              <WDatePicker
                :model-value="fieldVal('app_date_end')"
                :min="fieldVal('app_date_start')"
                :disabled="isChecked('app_date_isnull')"
                placeholder="止"
                @update:model-value="v => setFieldVal('app_date_end', v)"
              />
              <label class="empty-check">
                <input
                  type="checkbox"
                  :checked="isChecked('app_date_isnull')"
                  @change="toggleNullCheck('app_date', ($event.target as HTMLInputElement).checked)"
                />
                <span>为空</span>
              </label>
            </span>
          </div>
        </div>
        <div class="query-cell">
          <span class="cell-title">新申请递交日</span>
          <div class="cell-stack">
            <span class="date-pair">
              <WDatePicker
                :model-value="fieldVal('divisional_date_start')"
                :max="fieldVal('divisional_date_end')"
                :disabled="isChecked('divisional_date_isnull')"
                placeholder="起"
                @update:model-value="v => setFieldVal('divisional_date_start', v)"
              />
              <em>到</em>
              <WDatePicker
                :model-value="fieldVal('divisional_date_end')"
                :min="fieldVal('divisional_date_start')"
                :disabled="isChecked('divisional_date_isnull')"
                placeholder="止"
                @update:model-value="v => setFieldVal('divisional_date_end', v)"
              />
              <label class="empty-check">
                <input
                  type="checkbox"
                  :checked="isChecked('divisional_date_isnull')"
                  @change="toggleNullCheck('divisional_date', ($event.target as HTMLInputElement).checked)"
                />
                <span>为空</span>
              </label>
            </span>
          </div>
        </div>

        <!-- Row 4 -->
        <div class="query-cell">
          <span class="cell-title">案件状态</span>
          <div class="cell-body">
            <TreeOptionSelect
              :model-value="fieldVal('case_status')"
              :options="initData?.caseStatuses ?? []"
              :disabled="isChecked('case_status_isnull')"
              @update:model-value="v => setFieldVal('case_status', v)"
            />
            <label class="empty-check">
              <input
                type="checkbox"
                :checked="isChecked('case_status_isnull')"
                @change="toggleNullCheck('case_status', ($event.target as HTMLInputElement).checked, false)"
              />
              <span>为空</span>
            </label>
          </div>
        </div>
        <div class="query-cell">
          <span class="cell-title">案件流向</span>
          <div class="cell-body">
            <TreeOptionSelect
              :model-value="fieldVal('flow_direction')"
              :options="initData?.caseDirections ?? []"
              :disabled="isChecked('flow_direction_isnull')"
              @update:model-value="v => setFieldVal('flow_direction', v)"
            />
            <label class="empty-check">
              <input
                type="checkbox"
                :checked="isChecked('flow_direction_isnull')"
                @change="toggleNullCheck('flow_direction', ($event.target as HTMLInputElement).checked, false)"
              />
              <span>为空</span>
            </label>
          </div>
        </div>
        <div class="query-cell">
          <span class="cell-title">申请国家(地区)</span>
          <div class="cell-body">
            <TreeOptionSelect
              :model-value="fieldVal('country')"
              :options="initData?.countries ?? []"
              :disabled="isChecked('country_isnull')"
              @update:model-value="v => setFieldVal('country', v)"
            />
            <label class="empty-check">
              <input
                type="checkbox"
                :checked="isChecked('country_isnull')"
                @change="toggleNullCheck('country', ($event.target as HTMLInputElement).checked, false)"
              />
              <span>为空</span>
            </label>
          </div>
        </div>

        <!-- Row 5 -->
        <div class="query-cell">
          <span class="cell-title">案件名称</span>
          <div class="cell-body">
            <input
              :value="fieldVal('case_name')"
              type="text"
              placeholder="请输入案件名称"
              @input="setFieldVal('case_name', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
        <div class="query-cell">
          <span class="cell-title">申请类型</span>
          <div class="cell-body">
            <TreeOptionSelect
              :model-value="fieldVal('apply_type')"
              :options="initData?.applyTypes ?? []"
              :disabled="isChecked('apply_type_isnull')"
              @update:model-value="v => setFieldVal('apply_type', v)"
            />
            <label class="empty-check">
              <input
                type="checkbox"
                :checked="isChecked('apply_type_isnull')"
                @change="toggleNullCheck('apply_type', ($event.target as HTMLInputElement).checked, false)"
              />
              <span>为空</span>
            </label>
          </div>
        </div>
        <div class="query-cell">
          <span class="cell-title">委案日</span>
          <div class="cell-stack">
            <span class="date-pair">
              <WDatePicker
                :model-value="fieldVal('charge_date_start')"
                :max="fieldVal('charge_date_end')"
                :disabled="isChecked('charge_date_isnull')"
                placeholder="起"
                @update:model-value="v => setFieldVal('charge_date_start', v)"
              />
              <em>到</em>
              <WDatePicker
                :model-value="fieldVal('charge_date_end')"
                :min="fieldVal('charge_date_start')"
                :disabled="isChecked('charge_date_isnull')"
                placeholder="止"
                @update:model-value="v => setFieldVal('charge_date_end', v)"
              />
              <label class="empty-check">
                <input
                  type="checkbox"
                  :checked="isChecked('charge_date_isnull')"
                  @change="toggleNullCheck('charge_date', ($event.target as HTMLInputElement).checked)"
                />
                <span>为空</span>
              </label>
            </span>
          </div>
        </div>
      </div>

      <!-- 进阶查询展开/收起（紧接 Row 5 下方，对齐 ICSearch.aspx） -->
      <div class="advanced-toggle-row">
        <button type="button" class="text-button toggle-btn" :aria-expanded="showMore" @click="showMore = !showMore">
          {{ showMore ? '隐藏进阶查询 ▲' : '进阶查询 ▼' }}
        </button>
      </div>

      <!-- 5 大原站官方分组 (#tr_base, #tr_adv, #tr_agent, #tr_cust, #tr_other) -->
      <div v-if="showMore" class="advanced-sections">
        <!-- 1. 基本信息条件 (#tr_base) -->
        <section class="advanced-block">
          <div class="block-head">
            <h4 class="block-title">基本信息条件</h4>
            <button type="button" class="text-button" @click="toggleBlock('base')">
              {{ collapsedBlocks.base ? '展开' : '收起' }}
            </button>
          </div>
          <div v-show="!collapsedBlocks.base" class="query-grid patent-form-grid">
            <!-- R7 -->
            <div class="query-cell">
              <span class="cell-title">提案号</span>
              <div class="cell-body"><input :value="fieldVal('apply_no')" type="text" @input="setFieldVal('apply_no', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">案件备注</span>
              <div class="cell-body"><input :value="fieldVal('case_remark')" type="text" @input="setFieldVal('case_remark', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">案件英文名称</span>
              <div class="cell-body"><input :value="fieldVal('case_name_en')" type="text" @input="setFieldVal('case_name_en', ($event.target as HTMLInputElement).value)" /></div>
            </div>

            <!-- R8 -->
            <div class="query-cell">
              <span class="cell-title">案件类型</span>
              <ThemeSelect :model-value="fieldVal('case_type')" :options="[{ value: initData?.caseTypeId || PATENT_CASE_TYPE_ID, label: '专利' }]" :disabled="true" />
            </div>
            <div class="query-cell">
              <span class="cell-title">提案名称</span>
              <div class="cell-body"><input :value="fieldVal('apply_name')" type="text" @input="setFieldVal('apply_name', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">业务类型</span>
              <TreeOptionSelect :model-value="fieldVal('business_type')" :options="initData?.bussTypes ?? []" @update:model-value="v => setFieldVal('business_type', v)" />
            </div>

            <!-- R9 -->
            <div class="query-cell">
              <span class="cell-title">承办部门</span>
              <TreeOptionSelect :model-value="fieldVal('charge_dept_id')" :options="initData?.depts ?? []" @update:model-value="v => setFieldVal('charge_dept_id', v)" />
            </div>
            <div class="query-cell">
              <span class="cell-title">申请日(月日)</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('month_day_from')" format="MM-dd" placeholder="起" @update:model-value="v => setFieldVal('month_day_from', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('month_day_to')" format="MM-dd" placeholder="止" @update:model-value="v => setFieldVal('month_day_to', v)" />
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">案源国(地区)</span>
              <TreeOptionSelect :model-value="fieldVal('from_country_id')" :options="initData?.countries ?? []" @update:model-value="v => setFieldVal('from_country_id', v)" />
            </div>

            <!-- R10 -->
            <div class="query-cell">
              <span class="cell-title">案件所属分部</span>
              <div class="cell-body">
                <TreeOptionSelect :model-value="fieldVal('branch_dept_id')" :options="initData?.branchDepts ?? []" :disabled="isChecked('branch_dept_id_isnull')" @update:model-value="v => setFieldVal('branch_dept_id', v)" />
                <label class="empty-check"><input type="checkbox" :checked="isChecked('branch_dept_id_isnull')" @change="toggleNullCheck('branch_dept_id', ($event.target as HTMLInputElement).checked, false)" /><span>为空</span></label>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">开卷日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('create_time_start')" :max="fieldVal('create_time_end')" :disabled="isChecked('create_time_isnull')" placeholder="起" @update:model-value="v => setFieldVal('create_time_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('create_time_end')" :min="fieldVal('create_time_start')" :disabled="isChecked('create_time_isnull')" placeholder="止" @update:model-value="v => setFieldVal('create_time_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('create_time_isnull')" @change="toggleNullCheck('create_time', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">公开号</span>
              <div class="cell-body"><input :value="fieldVal('pub_no')" type="text" @input="setFieldVal('pub_no', ($event.target as HTMLInputElement).value)" /></div>
            </div>

            <!-- R11 -->
            <div class="query-cell">
              <span class="cell-title">案件状态进入日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('case_status_entry_date_from')" :max="fieldVal('case_status_entry_date_to')" placeholder="起" @update:model-value="v => setFieldVal('case_status_entry_date_from', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('case_status_entry_date_to')" :min="fieldVal('case_status_entry_date_from')" placeholder="止" @update:model-value="v => setFieldVal('case_status_entry_date_to', v)" />
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">起始阶段</span>
              <div class="cell-body">
                <TreeOptionSelect :model-value="fieldVal('p_case_info__from_stage')" :options="initData?.fromStages ?? []" :disabled="isChecked('p_case_info__from_stage_isnull')" @update:model-value="v => setFieldVal('p_case_info__from_stage', v)" />
                <label class="empty-check"><input type="checkbox" :checked="isChecked('p_case_info__from_stage_isnull')" @change="toggleNullCheck('p_case_info__from_stage', ($event.target as HTMLInputElement).checked, false)" /><span>为空</span></label>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">公开日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('pub_date_start')" :max="fieldVal('pub_date_end')" :disabled="isChecked('pub_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('pub_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('pub_date_end')" :min="fieldVal('pub_date_start')" :disabled="isChecked('pub_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('pub_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('pub_date_isnull')" @change="toggleNullCheck('pub_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>

            <!-- R12 -->
            <div class="query-cell">
              <span class="cell-title">进入实审日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('examime_date_start')" :max="fieldVal('examime_date_end')" :disabled="isChecked('examime_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('examime_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('examime_date_end')" :min="fieldVal('examime_date_start')" :disabled="isChecked('examime_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('examime_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('examime_date_isnull')" @change="toggleNullCheck('examime_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">一带二申请</span>
              <ThemeSelect :model-value="fieldVal('one_with_second')" :options="PATENT_SELECTS.one_with_second" @update:model-value="v => setFieldVal('one_with_second', String(v))" />
            </div>
            <div class="query-cell">
              <span class="cell-title">公告号</span>
              <div class="cell-body"><input :value="fieldVal('issue_no')" type="text" @input="setFieldVal('issue_no', ($event.target as HTMLInputElement).value)" /></div>
            </div>

            <!-- R13 -->
            <div class="query-cell">
              <span class="cell-title">是否监控年费</span>
              <ThemeSelect :model-value="fieldVal('is_feemonitor')" :options="PATENT_SELECTS.is_feemonitor" @update:model-value="v => setFieldVal('is_feemonitor', String(v))" />
            </div>
            <div class="query-cell other-props-cell">
              <span class="cell-title">其它属性</span>
              <div class="check-row">
                <label v-for="prop in PATENT_CASE_OTHER_PROPS" :key="prop.key" class="empty-check">
                  <input v-model="checks[prop.key]" type="checkbox" />
                  <span>{{ prop.label }}</span>
                </label>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">公告日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('issue_date_start')" :max="fieldVal('issue_date_end')" :disabled="isChecked('issue_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('issue_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('issue_date_end')" :min="fieldVal('issue_date_start')" :disabled="isChecked('issue_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('issue_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('issue_date_isnull')" @change="toggleNullCheck('issue_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>

            <!-- R14 -->
            <div class="query-cell">
              <span class="cell-title">业务人员</span>
              <div class="cell-body">
                <TreeOptionSelect :model-value="fieldVal('sales')" :options="initData?.users ?? []" :disabled="isChecked('sales_isnull')" @update:model-value="v => setFieldVal('sales', v)" />
                <label class="empty-check"><input type="checkbox" :checked="isChecked('sales_isnull')" @change="toggleNullCheck('sales', ($event.target as HTMLInputElement).checked, false)" /><span>为空</span></label>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">证书号</span>
              <div class="cell-body"><input :value="fieldVal('certificate_no')" type="text" @input="setFieldVal('certificate_no', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">提案创建人</span>
              <TreeOptionSelect :model-value="fieldVal('apply_create_user_id')" :options="initData?.users ?? []" :multiple="false" @update:model-value="v => setFieldVal('apply_create_user_id', v)" />
            </div>

            <!-- R15 -->
            <div class="query-cell">
              <span class="cell-title">业务人员部门</span>
              <TreeOptionSelect :model-value="fieldVal('sale_dept_id')" :options="initData?.depts ?? []" @update:model-value="v => setFieldVal('sale_dept_id', v)" />
            </div>
            <div class="query-cell">
              <span class="cell-title">届满日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('expire_date_start')" :max="fieldVal('expire_date_end')" :disabled="isChecked('expire_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('expire_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('expire_date_end')" :min="fieldVal('expire_date_start')" :disabled="isChecked('expire_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('expire_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('expire_date_isnull')" @change="toggleNullCheck('expire_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">流程人员</span>
              <div class="cell-body">
                <TreeOptionSelect :model-value="fieldVal('p_case_info_flow_user_id')" :options="initData?.users ?? []" :disabled="isChecked('p_case_info_flow_user_id_isnull')" @update:model-value="v => setFieldVal('p_case_info_flow_user_id', v)" />
                <label class="empty-check"><input type="checkbox" :checked="isChecked('p_case_info_flow_user_id_isnull')" @change="toggleNullCheck('p_case_info_flow_user_id', ($event.target as HTMLInputElement).checked, false)" /><span>为空</span></label>
              </div>
            </div>

            <!-- R16 -->
            <div class="query-cell">
              <span class="cell-title">业务助理</span>
              <TreeOptionSelect :model-value="fieldVal('sales_help')" :options="initData?.users ?? []" @update:model-value="v => setFieldVal('sales_help', v)" />
            </div>
            <div class="query-cell">
              <span class="cell-title">申请方式</span>
              <ThemeSelect :model-value="fieldVal('filing_type')" :options="PATENT_SELECTS.filing_type" @update:model-value="v => setFieldVal('filing_type', String(v))" />
            </div>
            <div class="query-cell">
              <span class="cell-title">宽限期</span>
              <ThemeSelect :model-value="fieldVal('p_case_info__grace_day')" :options="PATENT_SELECTS.p_case_info__grace_day" @update:model-value="v => setFieldVal('p_case_info__grace_day', String(v))" />
            </div>

            <!-- R17 -->
            <div class="query-cell">
              <span class="cell-title">外代状态</span>
              <ThemeSelect :model-value="fieldVal('generation_status')" :options="generationStatusOptions" @update:model-value="v => setFieldVal('generation_status', String(v))" />
            </div>
            <div class="query-cell">
              <span class="cell-title">外代状态进入日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('generation_status_date_start')" :max="fieldVal('generation_status_date_end')" :disabled="isChecked('generation_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('generation_status_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('generation_status_date_end')" :min="fieldVal('generation_status_date_start')" :disabled="isChecked('generation_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('generation_status_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('generation_date_isnull')" @change="toggleNullCheck('generation_status_date', ($event.target as HTMLInputElement).checked, true, 'generation_date_isnull')" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">客户状态进入日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('customer_status_date_start')" :max="fieldVal('customer_status_date_end')" :disabled="isChecked('customer_status_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('customer_status_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('customer_status_date_end')" :min="fieldVal('customer_status_date_start')" :disabled="isChecked('customer_status_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('customer_status_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('customer_status_date_isnull')" @change="toggleNullCheck('customer_status_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>

            <!-- R18 (ICSearch.aspx 语种 / 字数 / 国际检索单位) -->
            <div class="query-cell">
              <span class="cell-title">语种</span>
              <ThemeSelect :model-value="fieldVal('zl_language')" :options="zlLanguageOptions" @update:model-value="v => setFieldVal('zl_language', String(v))" />
            </div>
            <div class="query-cell">
              <span class="cell-title">字数</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <input :value="fieldVal('zl_word_count_start')" type="text" placeholder="起" @input="setFieldVal('zl_word_count_start', ($event.target as HTMLInputElement).value)" />
                  <em>到</em>
                  <input :value="fieldVal('zl_word_count_end')" type="text" placeholder="止" @input="setFieldVal('zl_word_count_end', ($event.target as HTMLInputElement).value)" />
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">国际检索单位</span>
              <TreeOptionSelect :model-value="fieldVal('retrieval_unit')" :options="initData?.countries ?? []" @update:model-value="v => setFieldVal('retrieval_unit', v)" />
            </div>
          </div>
        </section>

        <!-- 2. 扩展信息条件 (#tr_adv) -->
        <section class="advanced-block">
          <div class="block-head">
            <h4 class="block-title">扩展信息条件</h4>
            <button type="button" class="text-button" @click="toggleBlock('adv')">
              {{ collapsedBlocks.adv ? '展开' : '收起' }}
            </button>
          </div>
          <div v-show="!collapsedBlocks.adv" class="query-grid patent-form-grid">
            <div class="query-cell">
              <span class="cell-title">原案申请号</span>
              <div class="cell-body"><input :value="fieldVal('original_app_no')" type="text" @input="setFieldVal('original_app_no', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">PCT申请日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('pct_app_date_start')" :max="fieldVal('pct_app_date_end')" :disabled="isChecked('pct_app_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('pct_app_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('pct_app_date_end')" :min="fieldVal('pct_app_date_start')" :disabled="isChecked('pct_app_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('pct_app_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('pct_app_date_isnull')" @change="toggleNullCheck('pct_app_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">DAS接入码</span>
              <div class="cell-body"><input :value="fieldVal('das_code')" type="text" @input="setFieldVal('das_code', ($event.target as HTMLInputElement).value)" /></div>
            </div>

            <div class="query-cell">
              <span class="cell-title">原案申请日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('original_app_date_start')" :max="fieldVal('original_app_date_end')" :disabled="isChecked('original_app_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('original_app_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('original_app_date_end')" :min="fieldVal('original_app_date_start')" :disabled="isChecked('original_app_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('original_app_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('original_app_date_isnull')" @change="toggleNullCheck('original_app_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">PCT公布号</span>
              <div class="cell-body"><input :value="fieldVal('pct_pub_no')" type="text" @input="setFieldVal('pct_pub_no', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">协办所</span>
              <div class="cell-body"><input :value="fieldVal('asst_office')" type="text" @input="setFieldVal('asst_office', ($event.target as HTMLInputElement).value)" /></div>
            </div>

            <div class="query-cell">
              <span class="cell-title">复审无效编号</span>
              <div class="cell-body">
                <input :value="fieldVal('review_no')" type="text" :disabled="isChecked('review_no_isnull')" @input="setFieldVal('review_no', ($event.target as HTMLInputElement).value)" />
                <label class="empty-check"><input type="checkbox" :checked="isChecked('review_no_isnull')" @change="toggleNullCheck('review_no', ($event.target as HTMLInputElement).checked, false)" /><span>为空</span></label>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">PCT公布日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('pct_pub_date_start')" :max="fieldVal('pct_pub_date_end')" :disabled="isChecked('pct_pub_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('pct_pub_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('pct_pub_date_end')" :min="fieldVal('pct_pub_date_start')" :disabled="isChecked('pct_pub_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('pct_pub_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('pct_pub_date_isnull')" @change="toggleNullCheck('pct_pub_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">协办所案号</span>
              <div class="cell-body"><input :value="fieldVal('asst_office_case_no')" type="text" @input="setFieldVal('asst_office_case_no', ($event.target as HTMLInputElement).value)" /></div>
            </div>

            <div class="query-cell">
              <span class="cell-title">国际检索完成日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('intercheck_date_start')" :max="fieldVal('intercheck_date_end')" :disabled="isChecked('intercheck_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('intercheck_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('intercheck_date_end')" :min="fieldVal('intercheck_date_start')" :disabled="isChecked('intercheck_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('intercheck_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('intercheck_date_isnull')" @change="toggleNullCheck('intercheck_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">是否首次申请</span>
              <ThemeSelect :model-value="fieldVal('is_first_apply')" :options="PATENT_SELECTS.is_first_apply" @update:model-value="v => setFieldVal('is_first_apply', String(v))" />
            </div>
            <div class="query-cell">
              <span class="cell-title">授权发文日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('authorize_date_start')" :max="fieldVal('authorize_date_end')" :disabled="isChecked('authorize_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('authorize_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('authorize_date_end')" :min="fieldVal('authorize_date_start')" :disabled="isChecked('authorize_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('authorize_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('authorize_date_isnull')" @change="toggleNullCheck('authorize_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>

            <div class="query-cell">
              <span class="cell-title">进入国家阶段日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('nation_date_start')" :max="fieldVal('nation_date_end')" :disabled="isChecked('nation_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('nation_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('nation_date_end')" :min="fieldVal('nation_date_start')" :disabled="isChecked('nation_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('nation_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('nation_date_isnull')" @change="toggleNullCheck('nation_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">案件系数</span>
              <ThemeSelect :model-value="fieldVal('case_coefficient_id')" :options="caseCoefficientOptions" @update:model-value="v => setFieldVal('case_coefficient_id', String(v))" />
            </div>
            <div class="query-cell">
              <span class="cell-title">外部案源人</span>
              <div class="cell-body"><input :value="fieldVal('introducer')" type="text" @input="setFieldVal('introducer', ($event.target as HTMLInputElement).value)" /></div>
            </div>

            <div class="query-cell">
              <span class="cell-title">授权日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('case_authorize_date_start')" :max="fieldVal('case_authorize_date_end')" :disabled="isChecked('case_authorize_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('case_authorize_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('case_authorize_date_end')" :min="fieldVal('case_authorize_date_start')" :disabled="isChecked('case_authorize_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('case_authorize_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('case_authorize_date_isnull')" @change="toggleNullCheck('case_authorize_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">技术领域</span>
              <TreeOptionSelect :model-value="fieldVal('technical_field')" :options="initData?.technicals ?? []" @update:model-value="v => setFieldVal('technical_field', v)" />
            </div>
            <div class="query-cell">
              <span class="cell-title">专利标签</span>
              <TreeOptionSelect :model-value="fieldVal('apply_tags_id')" :options="initData?.applyTags ?? []" @update:model-value="v => setFieldVal('apply_tags_id', v)" />
            </div>

            <!-- R27 -->
            <div class="query-cell">
              <span class="cell-title">原案公开号</span>
              <div class="cell-body"><input :value="fieldVal('original_pub_no')" type="text" @input="setFieldVal('original_pub_no', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">原案公告号</span>
              <div class="cell-body"><input :value="fieldVal('original_issue_no')" type="text" @input="setFieldVal('original_issue_no', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell cell-spacer" aria-hidden="true" />

            <!-- R28 -->
            <div class="query-cell">
              <span class="cell-title">原案公开日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('original_pub_date_start')" :max="fieldVal('original_pub_date_end')" :disabled="isChecked('original_pub_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('original_pub_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('original_pub_date_end')" :min="fieldVal('original_pub_date_start')" :disabled="isChecked('original_pub_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('original_pub_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('original_pub_date_isnull')" @change="toggleNullCheck('original_pub_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">原案公告日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('original_issue_date_start')" :max="fieldVal('original_issue_date_end')" :disabled="isChecked('original_issue_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('original_issue_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('original_issue_date_end')" :min="fieldVal('original_issue_date_start')" :disabled="isChecked('original_issue_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('original_issue_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('original_issue_date_isnull')" @change="toggleNullCheck('original_issue_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">预计返稿日期</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('expected_date_start')" :max="fieldVal('expected_date_end')" :disabled="isChecked('expected_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('expected_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('expected_date_end')" :min="fieldVal('expected_date_start')" :disabled="isChecked('expected_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('expected_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('expected_date_isnull')" @change="toggleNullCheck('expected_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>

            <!-- R31 -->
            <div class="query-cell">
              <span class="cell-title">指定缔约方(海牙)</span>
              <TreeOptionSelect :model-value="fieldVal('Hague_country')" :options="initData?.countries ?? []" :multiple="false" @update:model-value="v => setFieldVal('Hague_country', v)" />
            </div>
            <div class="query-cell">
              <span class="cell-title">保护中心</span>
              <div class="cell-body">
                <ThemeSelect :model-value="fieldVal('protection_center')" :options="protectionCenterOptions" :disabled="isChecked('protection_center_isnull')" @update:model-value="v => setFieldVal('protection_center', String(v))" />
                <label class="empty-check"><input type="checkbox" :checked="isChecked('protection_center_isnull')" @change="toggleNullCheck('protection_center', ($event.target as HTMLInputElement).checked, false)" /><span>为空</span></label>
              </div>
            </div>
          </div>
        </section>

        <!-- 3. 著录项目信息条件 (#tr_agent) -->
        <section class="advanced-block">
          <div class="block-head">
            <h4 class="block-title">著录项目信息条件</h4>
            <button type="button" class="text-button" @click="toggleBlock('agent')">
              {{ collapsedBlocks.agent ? '展开' : '收起' }}
            </button>
          </div>
          <div v-show="!collapsedBlocks.agent" class="query-grid patent-form-grid">
            <div class="query-cell">
              <span class="cell-title">第一申请人地址</span>
              <div class="cell-body"><input :value="fieldVal('applicant_adds')" type="text" @input="setFieldVal('applicant_adds', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">第一申请人区划</span>
              <div class="cell-body"><input :value="fieldVal('applicant_area')" type="text" @input="setFieldVal('applicant_area', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">发明人</span>
              <div class="cell-body">
                <input :value="fieldVal('inventor')" type="text" @input="setFieldVal('inventor', ($event.target as HTMLInputElement).value)" />
                <label class="empty-check"><input v-model="checks.inventor_zhunque" type="checkbox" /><span>精准查询</span></label>
              </div>
            </div>

            <div class="query-cell">
              <span class="cell-title">优先权号</span>
              <div class="cell-body"><input :value="fieldVal('priority_no')" type="text" @input="setFieldVal('priority_no', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">优先权日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('priority_date_start')" :max="fieldVal('priority_date_end')" :disabled="isChecked('priority_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('priority_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('priority_date_end')" :min="fieldVal('priority_date_start')" :disabled="isChecked('priority_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('priority_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('priority_date_isnull')" @change="toggleNullCheck('priority_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">代理机构</span>
              <div class="cell-body">
                <TreeOptionSelect :model-value="fieldVal('agency')" :options="initData?.agencies ?? []" :disabled="isChecked('agency_isnull')" @update:model-value="v => setFieldVal('agency', v)" />
                <label class="empty-check"><input type="checkbox" :checked="isChecked('agency_isnull')" @change="toggleNullCheck('agency', ($event.target as HTMLInputElement).checked, false)" /><span>为空</span></label>
              </div>
            </div>

            <div class="query-cell">
              <span class="cell-title">代理人</span>
              <div class="cell-body">
                <TreeOptionSelect :model-value="fieldVal('case_agent_user')" :options="initData?.users ?? []" :disabled="isChecked('case_agent_user_isnull')" @update:model-value="v => setFieldVal('case_agent_user', v)" />
                <label class="empty-check"><input type="checkbox" :checked="isChecked('case_agent_user_isnull')" @change="toggleNullCheck('case_agent_user', ($event.target as HTMLInputElement).checked, false)" /><span>为空</span></label>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">代理机构案号</span>
              <div class="cell-body">
                <input :value="fieldVal('case_volume_agency')" type="text" :disabled="isChecked('case_volume_agency_isnull')" @input="setFieldVal('case_volume_agency', ($event.target as HTMLInputElement).value)" />
                <label class="empty-check"><input type="checkbox" :checked="isChecked('case_volume_agency_isnull')" @change="toggleNullCheck('case_volume_agency', ($event.target as HTMLInputElement).checked, false)" /><span>为空</span></label>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">案件处理人</span>
              <TreeOptionSelect :model-value="fieldVal('case_pic_user')" :options="initData?.users ?? []" @update:model-value="v => setFieldVal('case_pic_user', v)" />
            </div>

            <!-- R48 -->
            <div class="query-cell">
              <span class="cell-title">第一申请人国家(地区)</span>
              <TreeOptionSelect :model-value="fieldVal('first_applicant_country')" :options="initData?.countries ?? []" @update:model-value="v => setFieldVal('first_applicant_country', v)" />
            </div>
            <div class="query-cell">
              <span class="cell-title">申请人编号</span>
              <div class="cell-body"><input :value="fieldVal('applicant_code')" type="text" @input="setFieldVal('applicant_code', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">第一申请人类型</span>
              <ThemeSelect :model-value="fieldVal('first_applicant_type')" :options="applicantTypeOptions" @update:model-value="v => setFieldVal('first_applicant_type', String(v))" />
            </div>

            <!-- R49 -->
            <div class="query-cell">
              <span class="cell-title">外所联系人姓名</span>
              <div class="cell-body"><input :value="fieldVal('agency_contact_name')" type="text" @input="setFieldVal('agency_contact_name', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">外所联系人邮箱</span>
              <div class="cell-body"><input :value="fieldVal('agency_contact_email')" type="text" @input="setFieldVal('agency_contact_email', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">外所联系人电话</span>
              <div class="cell-body"><input :value="fieldVal('agency_contact_tel')" type="text" @input="setFieldVal('agency_contact_tel', ($event.target as HTMLInputElement).value)" /></div>
            </div>

            <!-- R50 -->
            <div class="query-cell">
              <span class="cell-title">案件对外处理人</span>
              <TreeOptionSelect :model-value="fieldVal('case_foreign_pic_user')" :options="initData?.users ?? []" @update:model-value="v => setFieldVal('case_foreign_pic_user', v)" />
            </div>
            <div class="query-cell">
              <span class="cell-title">最早优先权日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('min_priority_date_start')" :max="fieldVal('min_priority_date_end')" placeholder="起" @update:model-value="v => setFieldVal('min_priority_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('min_priority_date_end')" :min="fieldVal('min_priority_date_start')" placeholder="止" @update:model-value="v => setFieldVal('min_priority_date_end', v)" />
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">优先权国家(地区)</span>
              <TreeOptionSelect :model-value="fieldVal('priority_country')" :options="initData?.countries ?? []" @update:model-value="v => setFieldVal('priority_country', v)" />
            </div>

            <!-- R51 -->
            <div class="query-cell">
              <span class="cell-title">代理机构代码</span>
              <div class="cell-body"><input :value="fieldVal('agency_code')" type="text" @input="setFieldVal('agency_code', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">发明人身份证号码</span>
              <div class="cell-body"><input :value="fieldVal('inventor_id_number')" type="text" @input="setFieldVal('inventor_id_number', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">第一发明人</span>
              <div class="cell-body"><input :value="fieldVal('first_inventor')" type="text" @input="setFieldVal('first_inventor', ($event.target as HTMLInputElement).value)" /></div>
            </div>
          </div>
        </section>

        <!-- 4. 客户信息条件 (#tr_cust) -->
        <section class="advanced-block">
          <div class="block-head">
            <h4 class="block-title">客户信息条件</h4>
            <button type="button" class="text-button" @click="toggleBlock('cust')">
              {{ collapsedBlocks.cust ? '展开' : '收起' }}
            </button>
          </div>
          <div v-show="!collapsedBlocks.cust" class="query-grid patent-form-grid">
            <!-- R55 -->
            <div class="query-cell">
              <span class="cell-title">客户名称(精确)</span>
              <div class="cell-body"><input :value="fieldVal('customer_id')" type="text" @input="setFieldVal('customer_id', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">客户代码</span>
              <div class="cell-body"><input :value="fieldVal('customer_code')" type="text" @input="setFieldVal('customer_code', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">客户编号</span>
              <div class="cell-body"><input :value="fieldVal('customer_no')" type="text" @input="setFieldVal('customer_no', ($event.target as HTMLInputElement).value)" /></div>
            </div>

            <!-- R56 -->
            <div class="query-cell">
              <span class="cell-title">客户所属分部</span>
              <TreeOptionSelect :model-value="fieldVal('branch_dept_id_cus')" :options="initData?.branchDepts ?? []" @update:model-value="v => setFieldVal('branch_dept_id_cus', v)" />
            </div>
            <div class="query-cell">
              <span class="cell-title">客户地址</span>
              <div class="cell-body"><input :value="fieldVal('contactaddressid')" type="text" @input="setFieldVal('contactaddressid', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">客户联系人</span>
              <div class="cell-body"><input :value="fieldVal('contact')" type="text" @input="setFieldVal('contact', ($event.target as HTMLInputElement).value)" /></div>
            </div>

            <!-- R57 -->
            <div class="query-cell">
              <span class="cell-title">客户来源</span>
              <ThemeSelect :model-value="fieldVal('customer_from')" :options="customerFromOptions" @update:model-value="v => setFieldVal('customer_from', String(v))" />
            </div>
            <div class="query-cell">
              <span class="cell-title">案源类型</span>
              <ThemeSelect :model-value="fieldVal('sourcetype')" :options="sourceTypeOptions" @update:model-value="v => setFieldVal('sourcetype', String(v))" />
            </div>
            <div class="query-cell">
              <span class="cell-title">签约单位</span>
              <ThemeSelect :model-value="fieldVal('business_coop')" :options="businessCoopOptions" @update:model-value="v => setFieldVal('business_coop', String(v))" />
            </div>

            <!-- R58 -->
            <div class="query-cell">
              <span class="cell-title">合同有效时间</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('contract_date_from')" :max="fieldVal('contract_date_to')" placeholder="起" @update:model-value="v => setFieldVal('contract_date_from', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('contract_date_to')" :min="fieldVal('contract_date_from')" placeholder="止" @update:model-value="v => setFieldVal('contract_date_to', v)" />
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">客户国家(地区)</span>
              <TreeOptionSelect :model-value="fieldVal('customer_country')" :options="initData?.countries ?? []" @update:model-value="v => setFieldVal('customer_country', v)" />
            </div>
            <div class="query-cell">
              <span class="cell-title">客户类别</span>
              <ThemeSelect :model-value="fieldVal('customer_class')" :options="customerClassOptions" @update:model-value="v => setFieldVal('customer_class', String(v))" />
            </div>
          </div>
        </section>

        <!-- 5. 其它信息条件 (#tr_other) -->
        <section class="advanced-block">
          <div class="block-head">
            <h4 class="block-title">其它信息条件</h4>
            <button type="button" class="text-button" @click="toggleBlock('other')">
              {{ collapsedBlocks.other ? '展开' : '收起' }}
            </button>
          </div>
          <div v-show="!collapsedBlocks.other" class="query-grid patent-form-grid">
            <!-- R61 -->
            <div class="query-cell">
              <span class="cell-title">内部案源人</span>
              <div class="cell-body"><input :value="fieldVal('inside_introducer')" type="text" @input="setFieldVal('inside_introducer', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">申请人文号</span>
              <div class="cell-body"><input :value="fieldVal('app_volume')" type="text" @input="setFieldVal('app_volume', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">产品类别</span>
              <TreeOptionSelect :model-value="fieldVal('product_name')" :options="initData?.products ?? []" @update:model-value="v => setFieldVal('product_name', v)" />
            </div>

            <!-- R62 -->
            <div class="query-cell">
              <span class="cell-title">相关类型</span>
              <TreeOptionSelect :model-value="fieldVal('related_type')" :options="initData?.relateTypes ?? []" @update:model-value="v => setFieldVal('related_type', v)" />
            </div>
            <div class="query-cell cell-spacer" aria-hidden="true" />
            <div class="query-cell cell-spacer" aria-hidden="true" />

            <!-- R65 -->
            <div class="query-cell">
              <span class="cell-title">{{ customLabel('column_1', '自定义栏位1') }}</span>
              <div class="cell-body"><input :value="fieldVal('column_1')" type="text" @input="setFieldVal('column_1', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">{{ customLabel('column_2', '特批编号') }}</span>
              <div class="cell-body"><input :value="fieldVal('column_2')" type="text" @input="setFieldVal('column_2', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">{{ customLabel('column_3', '回款日期') }}</span>
              <div class="cell-body"><input :value="fieldVal('column_3')" type="text" @input="setFieldVal('column_3', ($event.target as HTMLInputElement).value)" /></div>
            </div>

            <!-- R66 -->
            <div class="query-cell">
              <span class="cell-title">{{ customLabel('column_4', '业务立案编号') }}</span>
              <div class="cell-body"><input :value="fieldVal('column_4')" type="text" @input="setFieldVal('column_4', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">{{ customLabel('column_5', '所属部门') }}</span>
              <div class="cell-body"><input :value="fieldVal('column_5')" type="text" @input="setFieldVal('column_5', ($event.target as HTMLInputElement).value)" /></div>
            </div>
            <div class="query-cell">
              <span class="cell-title">自定义栏位</span>
              <div class="cell-body"><input :value="fieldVal('custom_field')" type="text" @input="setFieldVal('custom_field', ($event.target as HTMLInputElement).value)" /></div>
            </div>
          </div>
        </section>
      </div>

      <!-- 处理事项条件开关栏（紧接进阶查询下方，对齐 ICSearch.aspx #tr_proc） -->
      <div class="proc-toggle-bar">
        <label class="empty-check proc-switch">
          <input v-model="isProc" type="checkbox" />
          <strong>处理事项条件：查询处理事项</strong>
        </label>
      </div>

      <div v-if="isProc" class="advanced-sections proc-section">
        <section class="advanced-block">
          <div class="block-head">
            <h4 class="block-title">处理事项条件</h4>
          </div>
          <div class="query-grid patent-form-grid">
            <!-- R70 -->
            <div class="query-cell">
              <span class="cell-title">处理事项</span>
              <div class="cell-body proc-combo">
                <ThemeSelect :model-value="fieldVal('proc_type')" :options="PATENT_SELECTS.proc_type" @update:model-value="v => setFieldVal('proc_type', String(v))" />
                <TreeOptionSelect :model-value="fieldVal('i_ctrl_proc')" :options="ctrlProcOptions" @update:model-value="v => setFieldVal('i_ctrl_proc', v)" />
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">处理事项状态</span>
              <div class="cell-body">
                <TreeOptionSelect :model-value="fieldVal('proc_status')" :options="initData?.procStatuses ?? []" :disabled="isChecked('proc_status_isnull')" @update:model-value="v => setFieldVal('proc_status', v)" />
                <label class="empty-check">
                  <input type="checkbox" :checked="isChecked('proc_status_isnull')" @change="toggleNullCheck('proc_status', ($event.target as HTMLInputElement).checked, false)" />
                  <span>为空</span>
                </label>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">案件阶段</span>
              <TreeOptionSelect :model-value="fieldVal('review_stage')" :options="initData?.reviewStages ?? []" @update:model-value="v => setFieldVal('review_stage', v)" />
            </div>

            <!-- R71 -->
            <div class="query-cell">
              <span class="cell-title">内部期限</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('int_due_date_start')" :max="fieldVal('int_due_date_end')" :disabled="isChecked('int_due_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('int_due_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('int_due_date_end')" :min="fieldVal('int_due_date_start')" :disabled="isChecked('int_due_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('int_due_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('int_due_date_isnull')" @change="toggleNullCheck('int_due_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">客户期限</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('cus_due_date_start')" :max="fieldVal('cus_due_date_end')" :disabled="isChecked('cus_due_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('cus_due_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('cus_due_date_end')" :min="fieldVal('cus_due_date_start')" :disabled="isChecked('cus_due_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('cus_due_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('cus_due_date_isnull')" @change="toggleNullCheck('cus_due_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">官方期限</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('legal_due_date_start')" :max="fieldVal('legal_due_date_end')" :disabled="isChecked('legal_due_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('legal_due_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('legal_due_date_end')" :min="fieldVal('legal_due_date_start')" :disabled="isChecked('legal_due_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('legal_due_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('legal_due_date_isnull')" @change="toggleNullCheck('legal_due_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>

            <!-- R72 -->
            <div class="query-cell">
              <span class="cell-title">处理人</span>
              <div class="cell-body">
                <TreeOptionSelect :model-value="fieldVal('pic_user')" :options="initData?.users ?? []" :disabled="isChecked('pic_no_user')" @update:model-value="v => setFieldVal('pic_user', v)" />
                <label class="empty-check">
                  <input type="checkbox" :checked="isChecked('pic_no_user')" @change="toggleNullCheck('pic_user', ($event.target as HTMLInputElement).checked, false, 'pic_no_user')" />
                  <span>为空</span>
                </label>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">核稿人</span>
              <TreeOptionSelect :model-value="fieldVal('revise_user_id')" :options="initData?.users ?? []" @update:model-value="v => setFieldVal('revise_user_id', v)" />
            </div>
            <div class="query-cell">
              <span class="cell-title">配案日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('allocate_date_start')" :max="fieldVal('allocate_date_end')" :disabled="isChecked('allocate_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('allocate_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('allocate_date_end')" :min="fieldVal('allocate_date_start')" :disabled="isChecked('allocate_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('allocate_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('allocate_date_isnull')" @change="toggleNullCheck('allocate_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>

            <!-- R73 -->
            <div class="query-cell">
              <span class="cell-title">初稿日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('first_doc_date_start')" :max="fieldVal('first_doc_date_end')" :disabled="isChecked('first_doc_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('first_doc_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('first_doc_date_end')" :min="fieldVal('first_doc_date_start')" :disabled="isChecked('first_doc_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('first_doc_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('first_doc_date_isnull')" @change="toggleNullCheck('first_doc_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">内部定稿日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('int_doc_date_start')" :max="fieldVal('int_doc_date_end')" :disabled="isChecked('int_doc_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('int_doc_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('int_doc_date_end')" :min="fieldVal('int_doc_date_start')" :disabled="isChecked('int_doc_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('int_doc_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('int_doc_date_isnull')" @change="toggleNullCheck('int_doc_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">返发明人日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('back_inventor_date_start')" :max="fieldVal('back_inventor_date_end')" :disabled="isChecked('back_inventor_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('back_inventor_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('back_inventor_date_end')" :min="fieldVal('back_inventor_date_start')" :disabled="isChecked('back_inventor_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('back_inventor_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('back_inventor_date_isnull')" @change="toggleNullCheck('back_inventor_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>

            <!-- R74 -->
            <div class="query-cell">
              <span class="cell-title">返稿日（IPR）</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('back_date_start')" :max="fieldVal('back_date_end')" :disabled="isChecked('back_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('back_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('back_date_end')" :min="fieldVal('back_date_start')" :disabled="isChecked('back_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('back_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('back_date_isnull')" @change="toggleNullCheck('back_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">定稿日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('finish_doc_date_start')" :max="fieldVal('finish_doc_date_end')" :disabled="isChecked('finish_doc_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('finish_doc_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('finish_doc_date_end')" :min="fieldVal('finish_doc_date_start')" :disabled="isChecked('finish_doc_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('finish_doc_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('finish_doc_date_isnull')" @change="toggleNullCheck('finish_doc_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">完成日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('finish_date_start')" :max="fieldVal('finish_date_end')" :disabled="isChecked('finish_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('finish_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('finish_date_end')" :min="fieldVal('finish_date_start')" :disabled="isChecked('finish_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('finish_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('finish_date_isnull')" @change="toggleNullCheck('finish_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>

            <!-- R75 -->
            <div class="query-cell">
              <span class="cell-title">送合作所日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('case_mail_date_start')" :max="fieldVal('case_mail_date_end')" :disabled="isChecked('case_mail_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('case_mail_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('case_mail_date_end')" :min="fieldVal('case_mail_date_start')" :disabled="isChecked('case_mail_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('case_mail_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('case_mail_date_isnull')" @change="toggleNullCheck('case_mail_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">第二处理事项完成日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('second_proc_finish_date_start')" :max="fieldVal('second_proc_finish_date_end')" :disabled="isChecked('second_proc_finish_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('second_proc_finish_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('second_proc_finish_date_end')" :min="fieldVal('second_proc_finish_date_start')" :disabled="isChecked('second_proc_finish_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('second_proc_finish_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('second_proc_finish_date_isnull')" @change="toggleNullCheck('second_proc_finish_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">是否完成</span>
              <ThemeSelect :model-value="fieldVal('proc_finish')" :options="PATENT_SELECTS.proc_finish" @update:model-value="v => setFieldVal('proc_finish', String(v))" />
            </div>

            <!-- R76 -->
            <div class="query-cell">
              <span class="cell-title">创建者</span>
              <TreeOptionSelect :model-value="fieldVal('proc_creater')" :options="initData?.users ?? []" :multiple="false" @update:model-value="v => setFieldVal('proc_creater', v)" />
            </div>
            <div class="query-cell">
              <span class="cell-title">创建日期</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('proc_create_time_start')" :max="fieldVal('proc_create_time_end')" placeholder="起" @update:model-value="v => setFieldVal('proc_create_time_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('proc_create_time_end')" :min="fieldVal('proc_create_time_start')" placeholder="止" @update:model-value="v => setFieldVal('proc_create_time_end', v)" />
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">修改者</span>
              <TreeOptionSelect :model-value="fieldVal('proc_updater')" :options="initData?.users ?? []" :multiple="false" @update:model-value="v => setFieldVal('proc_updater', v)" />
            </div>

            <!-- R77 -->
            <div class="query-cell">
              <span class="cell-title">修改日期</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('proc_update_time_start')" :max="fieldVal('proc_update_time_end')" placeholder="起" @update:model-value="v => setFieldVal('proc_update_time_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('proc_update_time_end')" :min="fieldVal('proc_update_time_start')" placeholder="止" @update:model-value="v => setFieldVal('proc_update_time_end', v)" />
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">备注</span>
              <div class="cell-body">
                <input :value="fieldVal('proc_note')" type="text" placeholder="请输入处理事项备注" @input="setFieldVal('proc_note', ($event.target as HTMLInputElement).value)" />
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">合同编号</span>
              <div class="cell-body">
                <input :value="fieldVal('contract_code')" type="text" placeholder="请输入合同编号" @input="setFieldVal('contract_code', ($event.target as HTMLInputElement).value)" />
              </div>
            </div>

            <!-- R78 -->
            <div class="query-cell">
              <span class="cell-title">官方来文发文日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('doc_date_start')" :max="fieldVal('doc_date_end')" :disabled="isChecked('doc_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('doc_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('doc_date_end')" :min="fieldVal('doc_date_start')" :disabled="isChecked('doc_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('doc_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('doc_date_isnull')" @change="toggleNullCheck('doc_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">来文的审查员</span>
              <div class="cell-body">
                <input :value="fieldVal('doc_examiner')" type="text" placeholder="请输入审查员" @input="setFieldVal('doc_examiner', ($event.target as HTMLInputElement).value)" />
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">发文序列号</span>
              <div class="cell-body">
                <input :value="fieldVal('doc_no')" type="text" placeholder="请输入发文序列号" @input="setFieldVal('doc_no', ($event.target as HTMLInputElement).value)" />
              </div>
            </div>

            <!-- R79 -->
            <div class="query-cell">
              <span class="cell-title">来文名称</span>
              <div class="cell-body">
                <input :value="fieldVal('doc_name')" type="text" placeholder="请输入来文名称" @input="setFieldVal('doc_name', ($event.target as HTMLInputElement).value)" />
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">来文部门</span>
              <div class="cell-body">
                <input :value="fieldVal('doc_office')" type="text" placeholder="请输入来文部门" @input="setFieldVal('doc_office', ($event.target as HTMLInputElement).value)" />
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">翻译方向</span>
              <ThemeSelect :model-value="fieldVal('translate_orient')" :options="PATENT_SELECTS.translate_orient" @update:model-value="v => setFieldVal('translate_orient', String(v))" />
            </div>

            <!-- R80 -->
            <div class="query-cell">
              <span class="cell-title">翻译字数</span>
              <div class="cell-body">
                <input :value="fieldVal('translate_count_start')" type="text" placeholder="起" @input="setFieldVal('translate_count_start', ($event.target as HTMLInputElement).value)" />
                <span>~</span>
                <input :value="fieldVal('translate_count_end')" type="text" placeholder="止" @input="setFieldVal('translate_count_end', ($event.target as HTMLInputElement).value)" />
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">翻译语种</span>
              <ThemeSelect :model-value="fieldVal('translate_language')" :options="PATENT_SELECTS.translate_language" @update:model-value="v => setFieldVal('translate_language', String(v))" />
            </div>
            <div class="query-cell">
              <span class="cell-title">处理状态进入日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('state_into_date_start')" :max="fieldVal('state_into_date_end')" placeholder="起" @update:model-value="v => setFieldVal('state_into_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('state_into_date_end')" :min="fieldVal('state_into_date_start')" placeholder="止" @update:model-value="v => setFieldVal('state_into_date_end', v)" />
                </span>
              </div>
            </div>

            <!-- R103 -->
            <div class="query-cell">
              <span class="cell-title">优先级</span>
              <ThemeSelect :model-value="fieldVal('priority')" :options="PATENT_SELECTS.priority" @update:model-value="v => setFieldVal('priority', String(v))" />
            </div>
            <div class="query-cell">
              <span class="cell-title">绝限日</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('deli_deadline_start')" :max="fieldVal('deli_deadline_end')" :disabled="isChecked('deli_deadline_isnull')" placeholder="起" @update:model-value="v => setFieldVal('deli_deadline_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('deli_deadline_end')" :min="fieldVal('deli_deadline_start')" :disabled="isChecked('deli_deadline_isnull')" placeholder="止" @update:model-value="v => setFieldVal('deli_deadline_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('deli_deadline_isnull')" @change="toggleNullCheck('deli_deadline', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell cell-spacer" aria-hidden="true" />

            <!-- R104 -->
            <div class="query-cell">
              <span class="cell-title">事项处理人助理</span>
              <TreeOptionSelect :model-value="fieldVal('proc_user_assistant')" :options="initData?.users ?? []" @update:model-value="v => setFieldVal('proc_user_assistant', v)" />
            </div>
            <div class="query-cell cell-spacer" aria-hidden="true" />
            <div class="query-cell cell-spacer" aria-hidden="true" />

            <!-- R105 (ICSearch.aspx 看稿次数 / 发客户日期 / 客户回复日期) -->
            <div class="query-cell">
              <span class="cell-title">看稿次数</span>
              <ThemeSelect :model-value="fieldVal('wsbdz_revise_title')" :options="PATENT_SELECTS.wsbdz_revise_title" @update:model-value="v => setFieldVal('wsbdz_revise_title', String(v))" />
            </div>
            <div class="query-cell">
              <span class="cell-title">发客户日期</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('wsbdz_finish_doc_date_start')" :max="fieldVal('wsbdz_finish_doc_date_end')" :disabled="isChecked('wsbdz_finish_doc_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('wsbdz_finish_doc_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('wsbdz_finish_doc_date_end')" :min="fieldVal('wsbdz_finish_doc_date_start')" :disabled="isChecked('wsbdz_finish_doc_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('wsbdz_finish_doc_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('wsbdz_finish_doc_date_isnull')" @change="toggleNullCheck('wsbdz_finish_doc_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
            <div class="query-cell">
              <span class="cell-title">客户回复日期</span>
              <div class="cell-stack">
                <span class="date-pair">
                  <WDatePicker :model-value="fieldVal('wsbdz_finish_revise_date_start')" :max="fieldVal('wsbdz_finish_revise_date_end')" :disabled="isChecked('wsbdz_finish_revise_date_isnull')" placeholder="起" @update:model-value="v => setFieldVal('wsbdz_finish_revise_date_start', v)" />
                  <em>到</em>
                  <WDatePicker :model-value="fieldVal('wsbdz_finish_revise_date_end')" :min="fieldVal('wsbdz_finish_revise_date_start')" :disabled="isChecked('wsbdz_finish_revise_date_isnull')" placeholder="止" @update:model-value="v => setFieldVal('wsbdz_finish_revise_date_end', v)" />
                  <label class="empty-check"><input type="checkbox" :checked="isChecked('wsbdz_finish_revise_date_isnull')" @change="toggleNullCheck('wsbdz_finish_revise_date', ($event.target as HTMLInputElement).checked)" /><span>为空</span></label>
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- 底部操作栏 -->
      <div class="patent-actions">
        <div class="patent-template-save">
          <input
            v-model="saveTitle"
            type="text"
            placeholder="输入模板名称保存到原站"
            maxlength="80"
          />
          <button type="button" class="ghost" :disabled="historyBusy" @click="void saveHistoryQuery()">
            保存模板
          </button>
          <button
            v-if="selectedHistoryId"
            type="button"
            class="ghost warn-btn"
            :disabled="historyBusy"
            @click="void deleteHistoryQuery()"
          >
            删除模板
          </button>
        </div>
        <button type="button" class="ghost" @click="resetForm(true)">重置</button>
        <button type="button" class="ghost" :disabled="!canSearch" @click="openPatentExport">导出清单</button>
        <button type="button" class="ghost" :disabled="!rows.length" @click="exportCsv">导出当前页 CSV</button>
        <button
          type="button"
          class="solid primary-search"
          :disabled="searching || !canSearch"
          @click="void runSearch(1)"
        >
          {{ searching ? '正在查询…' : '查询' }}
        </button>
      </div>
    </section>

    <p v-if="exportMessage" class="hint" role="status">{{ exportMessage }}</p>
    <FeeExportModal
      v-if="patentExportQuery"
      :open="true"
      mode="cond"
      :bridge="patentExportBridge"
      :patent-query="patentExportQuery"
      :patent-history-columns="selectedHistoryId ? historyExportColumns : undefined"
      :timeout-ms="queryTimeoutMs"
      @exported="exportMessage = $event"
      @close="patentExportQuery = undefined"
    />

    <!-- 查询结果卡片 -->
    <section class="card patent-results-section" aria-label="专利查询结果">
      <div class="section-heading patent-results-toolbar">
        <span class="sheet-count">
          共 {{ total }} 条专利记录
          <em v-if="copyNotice" class="copy-tip">{{ copyNotice }}</em>
        </span>
        <div class="table-actions">
          <button type="button" class="ghost tiny" @click="showColPanel = !showColPanel">
            {{ showColPanel ? '收起显示列' : `自定义显示列 (${activeColumns.length})` }}
          </button>
          <button type="button" class="ghost tiny" :disabled="!rows.length" @click="exportCsv">
            导出当前页 CSV
          </button>
        </div>
        <nav v-if="totalPages > 1" class="pagination toolbar-pagination" aria-label="专利查询顶部分页">
          <button type="button" class="ghost tiny" :disabled="searching || pageIndex <= 1" @click="void runSearch(pageIndex - 1)">上一页</button>
          <span>第 {{ pageIndex }} / {{ totalPages }} 页</span>
          <button type="button" class="ghost tiny" :disabled="searching || pageIndex >= totalPages" @click="void runSearch(pageIndex + 1)">下一页</button>
        </nav>
        <label class="page-size-selector">
          <span>每页</span>
          <ThemeSelect
            :model-value="pageSize"
            :options="pageSizeOptions"
            aria-label="每页条数"
            @update:model-value="v => { pageSize = Number(v); if (hasSearched) void runSearch(1) }"
          />
        </label>
      </div>

      <div v-if="showColPanel" class="col-panel">
        <div class="col-panel-head">
          <strong>勾选要显示的列（实时同步查询参数 colsel）</strong>
          <button type="button" class="text-button" @click="resetColumns">恢复默认列</button>
        </div>
        <div class="col-panel-grid">
          <label v-for="col in PATENT_COLUMNS" :key="col.field" class="empty-check">
            <input
              type="checkbox"
              :checked="visibleCols.includes(col.field)"
              @change="toggleColumn(col.field)"
            />
            <span>{{ col.title }}</span>
          </label>
        </div>
      </div>

      <p v-if="searchError" class="hint warn-hint">{{ searchError }}</p>
      <p v-else-if="!hasSearched" class="empty">输入查询条件后点击「查询」，或直接点「查询」浏览专利列表。</p>
      <p v-else-if="!searching && !rows.length" class="empty">当前条件下没有匹配的专利记录。</p>

      <div v-if="rows.length" class="patent-table-container">
        <table class="patent-data-table">
          <thead>
            <tr>
              <th class="seq-col">#</th>
              <th
                v-for="col in activeColumns"
                :key="col.field"
                :style="{ minWidth: `${col.minWidth ?? 100}px` }"
              >
                {{ col.title }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in rows" :key="`${row.caseId}-${row.procId}-${idx}`">
              <td class="seq-col">{{ (pageIndex - 1) * pageSize + idx + 1 }}</td>
              <td
                v-for="col in activeColumns"
                :key="col.field"
                v-hint.clip="cellValue(row, col.field)"
              >
                <button
                  v-if="col.field === 'case_volume' && row.caseVolume"
                  type="button"
                  class="text-button volume-link"
                  @click="void copyVolume(row.caseVolume)"
                >
                  {{ row.caseVolume }}
                </button>
                <span v-else class="cell-text">{{ cellValue(row, col.field) || '—' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <nav v-if="totalPages > 1" class="pagination" aria-label="专利查询分页">
        <button type="button" :disabled="searching || pageIndex <= 1" @click="void runSearch(pageIndex - 1)">上一页</button>
        <span>第 {{ pageIndex }} / {{ totalPages }} 页</span>
        <button type="button" :disabled="searching || pageIndex >= totalPages" @click="void runSearch(pageIndex + 1)">下一页</button>
      </nav>
    </section>
  </div>
</template>

<style scoped>
.patent-search-query { display: grid; gap: 12px; min-width: 0; }

.patent-search-query input[type="checkbox"] {
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

.patent-form-grid {
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
.query-cell.quick-cell { align-items: start; }
.query-cell.quick-cell .cell-title { padding-top: 6px; }
.query-cell.span-all { grid-column: 1 / -1; }

.cell-title {
  color: #8a7290;
  font-size: 12px;
  text-align: right;
  line-height: 1.35;
  word-break: keep-all;
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

.proc-toggle-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #fff8fb;
  border: 1px dashed #f0dce6;
}
.proc-switch strong {
  color: #7d617e;
  font-size: 12px;
  font-weight: 600;
}
.proc-section {
  margin-top: 10px;
  border-top: 0;
  padding-top: 4px;
}
.cell-body.proc-combo {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cell-body.proc-combo > :first-child {
  flex: 0 0 42%;
  min-width: 0;
}
.cell-body.proc-combo > :last-child {
  flex: 1 1 0;
  min-width: 0;
}
.other-props-cell .check-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.cell-spacer {
  visibility: hidden;
  pointer-events: none;
}

.template-head-bar {
  margin-bottom: 6px;
}
.template-head-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.template-inline-select {
  width: 220px;
}
.template-inline-select :deep(.theme-select-trigger) {
  height: 29px;
  min-width: 0;
  border-radius: 8px;
  font-size: 12px;
}
.compact-picks {
  margin-bottom: 8px;
}

.advanced-toggle-row { display: flex; justify-content: flex-end; margin: 6px 0 2px; }
.text-button { border: 0; background: transparent; color: #ba6284; font: inherit; font-size: 12px; padding: 4px 8px; cursor: pointer; }
.text-button:hover:not(:disabled) { color: #e24b84; background: #fff0f6; border-radius: 6px; }
.text-button:disabled { opacity: .5; cursor: default; }

.advanced-sections { margin-top: 10px; border-top: 1px dashed #ecdce8; padding-top: 12px; }
.advanced-block + .advanced-block { margin-top: 16px; }
.block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.block-title { font-size: 13px; font-weight: 650; color: #c44b7e; margin: 0; padding-left: 8px; border-left: 3px solid #f5a9ca; }

.patent-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed #f0e1eb;
}
.patent-actions button {
  width: auto;
  height: 32px;
  padding: 0 14px;
  white-space: nowrap;
  flex-shrink: 0;
}
.patent-template-save {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  margin-right: auto;
  font-size: 12px;
  color: #8a7290;
}
.patent-template-save input {
  width: 180px;
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
.primary-search { min-width: 76px; }

.patent-results-section { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; min-width: 0; contain: layout style; }
.patent-results-section > .section-heading, .table-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.patent-results-toolbar .table-actions { flex: 1 1 260px; min-width: 0; }
.toolbar-pagination { margin: 0; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0; font-size: 12px; color: #8a7290; }
.page-size-selector { display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 12px; color: #8a7290; }
.page-size-selector :deep(.theme-select) { flex: 0 0 96px; width: 96px; }
.page-size-selector :deep(.theme-select-trigger) { min-width: 0; }
.query-timeout :deep(.theme-select) { width: 92px; }

.warn-hint { color: #c95276; font-size: 12px; }
.warn-btn { border-color: #f3c2d4; color: #b8436e; }
.copy-tip { font-style: normal; font-size: 12px; color: #2f7d4d; margin-left: 8px; }

.col-panel {
  background: #fff6fa;
  border: 1px solid #f3d7e5;
  border-radius: 12px;
  padding: 12px 14px;
  display: grid;
  gap: 10px;
}
.col-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #75657d;
}
.col-panel-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.patent-table-container { overflow-x: auto; min-width: 0; }
.patent-data-table { width: 100%; white-space: nowrap; }
.patent-data-table .seq-col { width: 44px; text-align: center; }
.cell-text { display: block; width: 100%; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.volume-link { padding: 0; font-weight: 600; color: #c44b7e; }

@media (max-width: 1100px) {
  .patent-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .patent-form-grid { grid-template-columns: minmax(0, 1fr); }
  .patent-results-toolbar .table-actions { order: 1; flex-basis: 100%; }
}
</style>
