<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CURRENT_ENVIRONMENT } from '../../api/config'
import { fileSearchTimeoutMs, type FileSearchTimeoutMs } from '../../api/file-search-params'
import type { NormalizedDictionary } from '../../api/dictionaries'
import { choicesFromDictionary, FILING_PICKER_FIELDS } from '../../api/dictionaries/picker-catalog'
import { FILING_OPTION_KEYS, FILING_SELECTS, FILING_BLOCKS, filingCellKeys, filingDateDefaults, filingDraftFields, filingFieldLabel, type FilingCell } from '../../api/filing-form'
import type { FilingSearchQuery } from '../../api/filing-search-params'
import type { FilingSearchResult, FilingSearchRow } from '../../api/filing-search-types'
import { readFilingTimeout, writeFilingTimeout } from '../../api/query-timeout'
import { filingTemplateValues, filingTemplatesOf, applyFilingBuiltin, FILING_BUILTIN_TEMPLATES, FILING_TEMPLATE_TYPE, type FilingBuiltinTemplate } from '../../query/filing-templates'
import type { QueryTemplate } from '../../query/query-types'
import { hasOptionTree } from '../../query/option-tree'
import { activateOptionFallback, hasSavedChoices, hydrateOptionFallback, optionFallbackEpoch, rememberChoices, rememberDictionaries, rememberFormFields, savedChoices, subscribeOptionFallback } from '../../query/option-fallback'
import { describeOptionPull } from '../../query/option-pull-notes'
import { fitColumnWidths, type ColumnFit } from '../../shell/column-fit'
import { createTextRuler } from '../../shell/text-width'
import { isMultiPickerKey } from '../../shared/picker-modes'
import { scopeFromConnection, type ExpectedAccountScope } from '../../shared/connection'
import { MessageType, type FileSearchFormField, type MessageBridge } from '../../shared/message'
import { confirmDialog } from '../dialog'
import { useWorkspace } from '../composables/useWorkspace'
import { paintTaskCheckProgress, taskCheckProgress } from '../check-progress'
import { runFilingPages, type FilingPageResult } from '../filing-pages'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import TreeOptionSelect from '../../shell/components/TreeOptionSelect.vue'
import WDatePicker from '../../shell/components/WDatePicker.vue'

const props = defineProps<{ bridge?: MessageBridge; userId: string; canSearch: boolean; manage?: boolean }>()
const emit = defineEmits<{
  searched: [query: FilingSearchQuery]
  export: [rows: FilingSearchRow[]]
}>()

/** 通道优先用外层传进来的，缺了再用注入的。两处都没有时查询要报错，不能一声不吭不响应。 */
const injectedBridge = inject<MessageBridge>('bridge')

function activeBridge(): MessageBridge | undefined {
  return props.bridge ?? injectedBridge
}

/** 打开页面时结束日先填今天，想查别的区间自己改或清掉。 */
const values = ref<Record<string, string>>({ ...filingDateDefaults() })

/**
 * 递交查询模板只存本机：原站的递交列表没有模板功能，保存和删除都不写原网站。
 * 模板走和文件查询同一套本地配置包（saveQueryTemplate / deleteQueryTemplate），只是 queryType 记 FilingSearch。
 */
const workspace = useWorkspace()
const templates = ref<QueryTemplate[]>([])
const selectedTemplateId = ref('')
const saveName = ref('')
const saveNameDirty = ref(false)
const templateMessage = ref('')
const savingTemplate = ref(false)
const deletingTemplate = ref(false)

const selectedTemplate = computed(() => templates.value.find(item => item.id === selectedTemplateId.value) ?? null)
/** 内置模板排在前面：随扩展带来，谁登录都能点，不能改也不能删。 */
const selectedBuiltin = computed(() => FILING_BUILTIN_TEMPLATES.find(item => item.id === selectedTemplateId.value) ?? null)
const templateCards = computed(() => [
  ...FILING_BUILTIN_TEMPLATES.map(item => ({ id: item.id, name: item.name, builtin: true })),
  ...templates.value.map(item => ({ id: item.id, name: item.name, builtin: false }))
])

function liveScope(): ExpectedAccountScope | null {
  const scope = scopeFromConnection(workspace.connection.value)
  if (!scope || scope.operatorId !== props.userId) {
    templateMessage.value = '当前页面账号与已绑定会话不一致，未保存。'
    return null
  }
  return scope
}

async function reloadTemplates(): Promise<void> {
  const payload = await workspace.call({ action: 'load' })
  if (!payload || payload.connection.operatorId !== props.userId) {
    templates.value = []
    return
  }
  templates.value = filingTemplatesOf(payload.templates)
}

/** 内置模板只覆盖它自己那几项条件，其余条件（含结束日的默认值）留在表单上。 */
function applyBuiltin(template: FilingBuiltinTemplate): void {
  const resolved = applyFilingBuiltin(template, key => selectOptions(key), values.value)
  if (resolved.missing.length) {
    const names = resolved.missing.map(item => `${filingFieldLabel(item.key)}「${item.label}」`).join('、')
    templateMessage.value = `内置模板「${template.name}」里这些条件还没对上下拉：${names}。等下拉读完或点「校对最新字段」再套用。`
    return
  }
  values.value = resolved.values
  templateMessage.value = `已套用内置模板「${template.name}」。内置模板不能改，改完条件点「保存到本地」存成自己的。`
}

function applyTemplate(id: string): void {
  const builtin = selectedBuiltin.value && selectedBuiltin.value.id === id
    ? selectedBuiltin.value
    : FILING_BUILTIN_TEMPLATES.find(item => item.id === id) ?? null
  if (builtin) {
    selectedTemplateId.value = id
    applyBuiltin(builtin)
    return
  }
  const template = templates.value.find(item => item.id === id)
  selectedTemplateId.value = id
  if (!template) {
    templateMessage.value = ''
    return
  }
  values.value = filingTemplateValues(template)
  templateMessage.value = `已套用模板「${template.name}」。改完条件可以更新回去。`
}

/** 点卡片直接套用，再点一下取消选中：条件留在表单上，可以继续改或另存。 */
function toggleTemplate(id: string): void {
  if (selectedTemplateId.value === id) {
    selectedTemplateId.value = ''
    templateMessage.value = ''
    return
  }
  applyTemplate(id)
}

async function saveTemplate(): Promise<void> {
  if (savingTemplate.value) return
  const name = saveName.value.trim()
  if (!name) {
    templateMessage.value = '请填写模板名称。'
    return
  }
  const draft = filingDraftFields(values.value)
  if (!Object.keys(draft.fields).length) {
    templateMessage.value = '先填写至少一项查询条件，再保存。'
    return
  }
  const scope = liveScope()
  if (!scope) return
  const current = selectedTemplate.value
  const now = new Date().toISOString()
  const template: QueryTemplate = current ? {
    ...current,
    name,
    fields: draft.fields,
    displayValues: draft.displayValues,
    updatedAt: now
  } : {
    id: `local-${crypto.randomUUID()}`,
    name,
    source: 'local',
    queryType: FILING_TEMPLATE_TYPE,
    fields: draft.fields,
    displayValues: draft.displayValues,
    version: 1,
    createdAt: now,
    updatedAt: now
  }
  savingTemplate.value = true
  templateMessage.value = '正在保存…'
  try {
    const result = await workspace.call({
      action: 'saveQueryTemplate',
      template,
      expectedScope: scope,
      expectedVersion: current ? current.version : null
    })
    if (!result?.ok) {
      templateMessage.value = result?.message || '模板没有保存。'
      return
    }
    templateMessage.value = current ? `模板「${name}」已更新。` : `模板「${name}」已保存在本机。`
    await reloadTemplates()
    selectedTemplateId.value = template.id
  } finally {
    savingTemplate.value = false
  }
}

async function deleteTemplate(): Promise<void> {
  const current = selectedTemplate.value
  if (!current || deletingTemplate.value) return
  const scope = liveScope()
  if (!scope) return
  const agreed = await confirmDialog({
    title: '删除递交查询模板',
    message: `会从本机删掉「${current.name}」。原网站没有模板功能，不受影响。`,
    confirmLabel: '删除'
  })
  if (!agreed) return
  deletingTemplate.value = true
  templateMessage.value = '正在删除…'
  try {
    const result = await workspace.call({ action: 'deleteQueryTemplate', id: current.id, expectedScope: scope })
    if (!result?.ok) {
      templateMessage.value = result?.message || '模板没有删除。'
      return
    }
    selectedTemplateId.value = ''
    saveName.value = ''
    saveNameDirty.value = false
    templateMessage.value = `模板「${current.name}」已从本机删除。`
    await reloadTemplates()
  } finally {
    deletingTemplate.value = false
  }
}
const pickers = ref<Record<string, NormalizedDictionary>>({})
const pickersReady = ref(false)
const pickerFailed = ref(false)
let pickerGeneration = 0
const pageFields = ref<FileSearchFormField[]>([])
const loadingPickers = ref(false)
const pickerMessage = ref('')
const searchState = ref<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle')
const searchMessage = ref('')
const result = ref<FilingSearchResult | null>(null)
const lastQuery = ref<FilingSearchQuery | null>(null)
const pageIndex = ref(1)
const pageSize = ref(20)
const pageSizeOptions = [
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' }
]
const resultsSection = ref<HTMLElement | null>(null)
let generation = 0

/** 查询超时和期限监控、文件查询一样自己设，随请求带给原网站。 */
const queryTimeoutMs = ref<FileSearchTimeoutMs>(60_000)
const timeoutOptions = [
  { value: 60_000, label: '1 分钟' },
  { value: 120_000, label: '2 分钟' },
  { value: 300_000, label: '5 分钟' },
  { value: 600_000, label: '10 分钟' }
]
let timeoutDirty = false
watch(queryTimeoutMs, value => {
  timeoutDirty = true
  writeFilingTimeout(value)
}, { flush: 'sync' })

/** 页面扫描出来的 select 字段（案件流向、是否需要纸质通知书、办理类型）。 */
const SELECT_KEYS = FILING_BLOCKS.flatMap(cell => (cell.kind === 'select' ? [cell.key] : []))
/** 下拉缓存兜底，和期限监控、文件查询同一套：读到非空选项就更新缓存，读不到时先用上次的缓存。 */
const fallbackTick = ref(0)
const stopFallbackWatch = subscribeOptionFallback(() => { fallbackTick.value = optionFallbackEpoch() })

type ResultColumnKey = 'caseVolume' | 'caseName' | 'customerName' | 'customerCode' | 'applyType' | 'ctrlProc'
  | 'intDueDate' | 'filingDate' | 'caseType' | 'branchDept' | 'createUser' | 'createTime' | 'flowStatus'
type ResultColumn = { key: ResultColumnKey; label: string; mode?: 'lock' | 'grow' }

/** 列顺序对齐原站 FilingList.js 的显示列。列宽由 column-fit 按文字测量后写到 col 上。 */
const resultColumns: ResultColumn[] = [
  { key: 'caseVolume', label: '我方文号' },
  { key: 'caseName', label: '案件名称', mode: 'grow' },
  { key: 'customerName', label: '客户名称', mode: 'grow' },
  { key: 'customerCode', label: '客户代码' },
  { key: 'applyType', label: '申请类型' },
  { key: 'ctrlProc', label: '处理事项' },
  { key: 'intDueDate', label: '内部/客户期限', mode: 'lock' },
  { key: 'filingDate', label: '完成时间', mode: 'lock' },
  { key: 'caseType', label: '案件类型' },
  { key: 'branchDept', label: '案件所属分部' },
  { key: 'createUser', label: '创建人' },
  { key: 'createTime', label: '创建时间', mode: 'lock' },
  { key: 'flowStatus', label: '当前审核状态', mode: 'lock' }
]

const filledCount = computed(() => Object.values(values.value).filter(value => value.trim()).length)

function valueOf(key: string): string {
  return values.value[key] ?? ''
}
function setValue(key: string, value: string): void {
  values.value = { ...values.value, [key]: value }
}

/** 原站 TreeUser 的单选 / 多选口径集中在 shared/picker-modes：多选值逗号拼 GUID，显示文本另存 `{字段}_text`。 */
function isMulti(key: string): boolean {
  return isMultiPickerKey(key)
}

function setNamed(key: string, value: string): void {
  const ids = value.split(',').map(item => item.trim()).filter(Boolean)
  const labels = ids.map(id => choices(key).find(item => item.value === id)?.label ?? '').filter(Boolean)
  values.value = {
    ...values.value,
    [key]: ids.join(','),
    [`${key}_text`]: labels.join('，')
  }
}

function onText(key: string, event: Event): void {
  setValue(key, (event.target as HTMLInputElement).value)
}

/** 申请类型的选项按案件类型收窄，缓存也按案件类型分开存，回退时不会混进别的案件类型的选项。 */
function optionCacheKey(key: string): string {
  if (key !== 'apply_type') return key
  const caseTypeId = valueOf('case_type') || CURRENT_ENVIRONMENT.caseTypeId
  return caseTypeId ? `${key}:${caseTypeId}` : key
}

function ledgerChoices(key: string): { value: string; label: string; parent?: string }[] | null {
  return props.userId ? savedChoices(props.userId, optionCacheKey(key)) : null
}
function liveRows(key: string): { value: string; label: string; parent?: string }[] | null {
  const source = FILING_OPTION_KEYS[key]
  const dictionary = source ? pickers.value[source] : undefined
  if (!dictionary || dictionary.status === 'invalid') return null
  // 原站 ChangeForApplyType 按当前案件类型收申请类型；没选案件类型时按本环境默认的专利收。
  return choicesFromDictionary(dictionary, valueOf('case_type') || CURRENT_ENVIRONMENT.caseTypeId)
}
/** 静默校对：接口回了非空就换上；空结果和读取失败都继续用账本上的选项，界面不跟着抖。 */
function mergedRows(key: string): { value: string; label: string; parent?: string }[] {
  const source = FILING_OPTION_KEYS[key]
  const dictionary = source ? pickers.value[source] : undefined
  const live = liveRows(key)
  if (dictionary && (dictionary.status === 'ready' || dictionary.status === 'partial')) return live ?? []
  const stored = ledgerChoices(key)
  return stored?.length ? stored : (live ?? [])
}
function choices(key: string): { value: string; label: string; parent?: string }[] {
  fallbackTick.value
  return (FILING_OPTION_KEYS[key] ? mergedRows(key) : (ledgerChoices(key) ?? [])).filter(item => item.value)
}

/** select 的选项：原站页面实时扫（ScanFilingForm）优先，其次接口字典/缓存，最后用抓包快照兜底。原站这几个 select 没有接口，页面没打开时只剩兜底。 */
function selectOptions(key: string): { value: string; label: string }[] {
  fallbackTick.value
  const field = pageFields.value.find(item => item.id === key && item.control === 'select')
  const scanned = (field?.options ?? []).filter(item => item.value)
  const fromDictionary = choices(key).filter(item => item.value)
  const builtin = (FILING_SELECTS[key] ?? []).filter(item => item.value)
  const rows = FILING_OPTION_KEYS[key] ? fromDictionary : scanned.length ? scanned : fromDictionary.length ? fromDictionary : builtin
  return [{ value: '', label: '不限' }, ...rows.map(item => ({ value: item.value, label: item.label }))]
}

/** 这个账号已经存下非空选项的字段。 */
function cachedOptionKeys(): string[] {
  if (!props.userId) return []
  const keys = new Set([...Object.keys(FILING_OPTION_KEYS), ...SELECT_KEYS])
  return [...keys].filter(key => savedChoices(props.userId, optionCacheKey(key)))
}
/** 只要有任一字段存过非空选项，这轮拉取就整体走静默：不挡界面、拉不到用账本兜底。 */
const ledgerPresent = computed(() => {
  fallbackTick.value
  return Boolean(props.userId) && Object.keys(FILING_OPTION_KEYS).some(key => hasSavedChoices(props.userId, optionCacheKey(key)))
})
const FILING_CELL_LABELS: Record<string, string> = Object.fromEntries(FILING_BLOCKS.flatMap(cell => filingCellKeys(cell).map(key => [key, cell.label] as [string, string])))
function filingFieldLabel(key: string): string {
  const base = key.split(':')[0]!
  return FILING_CELL_LABELS[key] ?? FILING_CELL_LABELS[base] ?? key
}
function treeChoices(key: string): { value: string; label: string; parent?: string }[] {
  const options = choices(key)
  return hasOptionTree(options) ? options : []
}
function optionsFor(key: string): { value: string; label: string; parent?: string }[] {
  return [{ value: '', label: '不限' }, ...choices(key)]
}
function optionLabel(key: string, value: string): string {
  const option = choices(key).find(item => item.value === value)
  return option?.label ?? ''
}

function optionStatus(key: string): 'loading' | 'ready' | 'empty' | 'partial' | 'invalid' {
  // 有账本的字段走静默校对：拉取期间照常可选，拉不到也用账本兜底，不进 loading/失败态。
  if (props.userId && hasSavedChoices(props.userId, optionCacheKey(key))) return choices(key).length ? 'ready' : 'empty'
  if (loadingPickers.value || (!pickersReady.value && !pickerFailed.value)) return 'loading'
  if (pickerFailed.value) return 'invalid'
  return pickers.value[FILING_OPTION_KEYS[key] ?? '']?.status ?? 'invalid'
}
function unavailableOptions(fields: Record<string, string>): string[] {
  return Object.keys(FILING_OPTION_KEYS).filter(key => {
    if (key === 'business_coop') return false // 原站明确允许手填签约单位。
    const ids = (fields[key] ?? '').split(',').map(id => id.trim()).filter(Boolean)
    return ids.length > 0 && (!['ready', 'partial'].includes(optionStatus(key)) || ids.some(id => !choices(key).some(option => option.value === id)))
  })
}
const unavailableFields = computed(() => unavailableOptions(values.value))
async function loadPickers(force: boolean, manual = false): Promise<void> {
  const bridge = activeBridge()
  if (!bridge || (!props.canSearch && !props.manage) || loadingPickers.value) return
  if (!force && pickersReady.value) return
  const pickerTicket = ++pickerGeneration
  const userId = props.userId
  const current = () => pickerTicket === pickerGeneration && userId === props.userId
  loadingPickers.value = true
  pickerFailed.value = false
  // 静默拉取不放进度文案：字段照常可选，完成后只在有更新或拉不到时说话。
  pickerMessage.value = ''
  try {
    const [dict, form] = await Promise.all([
      bridge.request({ type: MessageType.LoadDictionary, payload: { kind: 'picker', force } }),
      bridge.request({ type: MessageType.ScanFilingForm })
    ])
    if (!current()) return
    let changed: string[] = []
    const failures: string[] = []
    if (dict.type === MessageType.DictionaryResult && dict.payload.ok && dict.payload.data.kind === 'picker') {
      pickers.value = dict.payload.data.dictionaries
      pickersReady.value = true
      if (props.userId) {
        // 申请类型按案件类型收窄后单独缓存；其余下拉按表单键存进回退。非空才更新：空结果不覆盖账本上已有的选项。
        const fields = { ...FILING_OPTION_KEYS }
        delete fields.apply_type
        changed = [
          ...rememberDictionaries(props.userId, fields, dict.payload.data.dictionaries, true),
          ...rememberDictionaries(props.userId, { [optionCacheKey('apply_type')]: FILING_OPTION_KEYS.apply_type! }, dict.payload.data.dictionaries, true)
        ]
      }
      failures.push(dict.type === MessageType.DictionaryResult && !dict.payload.ok
        ? dict.payload.error.message
        : cachedOptionKeys().length ? '接口下拉没有读到，先用上次读到的选项。' : '接口下拉没有读到，文本条件仍可查询。')
    }
    if (form.type === MessageType.FilingFormResult) {
      // 空扫描结果不覆盖上一次读到的下拉；只有扫到非空选项才更新缓存。
      const scanned = form.payload.fields
      if (scanned.length) {
        pageFields.value = scanned
        if (props.userId) changed.push(...rememberFormFields(props.userId, scanned))
      }
    }
    pickerMessage.value = describeOptionPull({
      updatedLabels: [...new Set(changed)].map(filingFieldLabel),
      failures,
      manual,
      hasLedger: ledgerPresent.value
    })
  } catch {
    if (!current()) return
    pickerFailed.value = true
    pickerMessage.value = describeOptionPull({ updatedLabels: [], failures: ['下拉选项没有读到，文本条件仍可查询。'], manual, hasLedger: ledgerPresent.value })
  } finally {
    if (current()) loadingPickers.value = false
  }
}

function messageForError(code: string, message: string): string {
  if (code === 'SESSION_EXPIRED') return 'EASY 登录已失效，请在原网站重新登录后检测。'
  if (code === 'AUTH_UNKNOWN') return '无法确认当前登录状态，请重试。'
  if (code === 'REQUEST_TIMEOUT') return `原网站查询太慢，没有在 ${queryTimeoutMs.value / 60_000} 分钟内返回。可以把超时时间调长，或把条件写具体一点再查。`
  if (code === 'NETWORK_ERROR') return '网络异常，请检查 EASY 网站连接。'
  return message || '请求失败，请稍后重试。'
}

async function showResults(): Promise<void> {
  const section = resultsSection.value
  const viewport = section?.closest<HTMLElement>('.body')
  if (section && viewport) {
    viewport.scrollTop += section.getBoundingClientRect().top - viewport.getBoundingClientRect().top
  }
}

async function executeSearch(query: FilingSearchQuery): Promise<void> {
  if (unavailableOptions(query.fields ?? {}).length) {
    pickerMessage.value = '原选项当前不可用，请重新读取选项或显式清除后查询。'
    return
  }
  const bridge = activeBridge()
  if (!bridge) {
    searchState.value = 'error'
    searchMessage.value = '页面通信不可用，查询没有发出。请重新打开这一页再试。'
    void showResults()
    return
  }
  if (!props.canSearch) return
  const current = ++generation
  lastQuery.value = query
  emit('searched', query)
  searchState.value = 'loading'
  searchMessage.value = ''
  result.value = null
  try {
    const response = await bridge.request({
      type: MessageType.SearchFiling,
      payload: { query, timeoutMs: fileSearchTimeoutMs(queryTimeoutMs.value) }
    })
    if (current !== generation) return
    if (response.type !== MessageType.SearchFilingResult) {
      searchState.value = 'error'
      searchMessage.value = response.type === MessageType.Error ? response.payload.message : '递交查询返回了意外结果。'
      return
    }
    if (!response.payload.ok) {
      searchState.value = 'error'
      searchMessage.value = messageForError(response.payload.error.code, response.payload.error.message)
      return
    }
    const data = response.payload.data
    result.value = data
    searchState.value = data.total === 0 ? 'empty' : 'success'
    await showResults()
  } catch {
    if (current !== generation) return
    searchState.value = 'error'
    searchMessage.value = '递交查询通信失败，请重试。'
  }
}

function search(): void {
  if (unavailableFields.value.length) { pickerMessage.value = '原选项当前不可用，请重新读取选项或显式清除后查询。'; return }
  const draft = filingDraftFields(values.value)
  if (!Object.keys(draft.fields).length) {
    searchState.value = 'error'
    searchMessage.value = '请输入查询条件。'
    result.value = null
    lastQuery.value = null
    void showResults()
    return
  }
  clearSelected()
  failedPages.value = []
  selectionNotice.value = ''
  void executeSearch({ ...draft, pageIndex: 1, pageSize: pageSize.value })
}
function refresh(): void {
  if (lastQuery.value) void executeSearch({ ...lastQuery.value, pageIndex: pageIndex.value })
}
function changePageSize(): void {
  if (!lastQuery.value || !props.canSearch || ![20, 50, 100].includes(pageSize.value)) return
  pageIndex.value = 1
  void executeSearch({ ...lastQuery.value, pageIndex: 1, pageSize: pageSize.value })
}
function page(delta: number): void {
  if (!lastQuery.value || !result.value || searchState.value === 'loading') return
  const next = pageIndex.value + delta
  if (next < 1 || next > result.value.totalPages) return
  pageIndex.value = next
  void executeSearch({ ...lastQuery.value, pageIndex: next })
}
function reset(): void {
  generation += 1
  values.value = { ...filingDateDefaults() }
  result.value = null
  lastQuery.value = null
  pageIndex.value = 1
  searchState.value = 'idle'
  searchMessage.value = ''
  clearSelected()
  failedPages.value = []
  selectionNotice.value = ''
  selectedTemplateId.value = ''
  saveName.value = ''
  saveNameDirty.value = false
  templateMessage.value = ''
}
function rowNo(index: number): number {
  return (pageIndex.value - 1) * pageSize.value + index + 1
}
function cellText(row: FilingSearchRow, key: ResultColumnKey): string {
  return row[key]?.trim() ?? ''
}

const resultsTableHost = ref<HTMLElement | null>(null)

/**
 * 已勾选的递交。几万行不进响应式：存普通 Map，只靠一个版本号驱动重绘；
 * 勾选也不整体拷贝，选中几万条时单行点一下照样轻快。
 */
const selectedMap = new Map<string, FilingSearchRow>()
const selectedVersion = ref(0)
const selectingAll = ref(false)
const selectedCount = computed(() => {
  void selectedVersion.value
  return selectedMap.size
})

function rowKey(row: FilingSearchRow): string {
  return row.filingId || `${row.caseVolume}|${row.procId}|${row.createTime}`
}
function isSelected(row: FilingSearchRow): boolean {
  void selectedVersion.value
  return selectedMap.has(rowKey(row))
}
function toggleRow(row: FilingSearchRow, on: boolean): void {
  const key = rowKey(row)
  if (on) selectedMap.set(key, row)
  else selectedMap.delete(key)
  selectedVersion.value += 1
}
function selectPage(on: boolean): void {
  for (const row of result.value?.items ?? []) {
    const key = rowKey(row)
    if (on) selectedMap.set(key, row)
    else selectedMap.delete(key)
  }
  selectedVersion.value += 1
}
function clearSelected(): void {
  selectedMap.clear()
  selectedVersion.value += 1
}

/** 查询结果特别大时先劝一句再继续，避免不加条件就全选导致取数和导出拖很久。 */
async function confirmHuge(count: number): Promise<boolean> {
  if (count <= 1000) return true
  return confirmDialog({
    title: '查询结果超过 1000 条',
    message: `这次有 ${count} 条递交记录，超过 1000 条。建议加查询条件缩小范围后再全选和导出；也可以继续，但取数会很久。`,
    confirmLabel: '继续'
  })
}

const failedPages = ref<number[]>([])
const selectionNotice = ref('')

type PageFetch = FilingPageResult

/** 一页只调一次；重试、并行、漏页统计都在 runFilingPages 里。 */
async function fetchPage(bridge: MessageBridge, query: FilingSearchQuery, page: number, size: number): Promise<PageFetch> {
  try {
    const response = await bridge.request({
      type: MessageType.SearchFiling,
      // batch：批量拉页不占「新查询取消旧查询」的槽，并行几页才不会互相 abort。
      payload: { query: { ...query, pageIndex: page, pageSize: size }, timeoutMs: fileSearchTimeoutMs(queryTimeoutMs.value), batch: true as const }
    })
    if (response.type === MessageType.SearchFilingResult && response.payload.ok) {
      return { ok: true, rows: response.payload.data.items }
    }
    const message = response.type === MessageType.SearchFilingResult && !response.payload.ok
      ? response.payload.error.message
      : response.type === MessageType.Error ? response.payload.message : '这一页没有返回结果。'
    return { ok: false, session: /登录|会话已变化|尚未确认|尚未连接|标签页已失效/.test(message) }
  } catch {
    return { ok: false, session: false }
  }
}

function describeMissed(pages: number[]): string {
  return `第 ${pages.slice(0, 8).join('、')}${pages.length > 8 ? ' 等' : ''} 页`
}

/** 全选所有翻页的进度：和取数同一根彩虹条，动词换成「翻页」。 */
const paging = { startedAt: 0, total: 0, done: 0 }

/** 全选所有进行中把「预计几点完成」也写在按钮旁，翻页快时彩虹条一闪而过也看得到。 */
const pagingHint = computed(() => {
  if (!selectingAll.value) return ''
  return taskCheckProgress.eta ? `（全选所有进行中，预计 ${taskCheckProgress.eta} 完成）` : '（全选所有进行中…）'
})

function paintPaging(status: 'run' | 'done'): void {
  paintTaskCheckProgress(paging.done, paging.total, paging.startedAt, status, '翻页')
}

function tickPage(): void {
  paging.done += 1
  paintPaging(paging.done >= paging.total ? 'done' : 'run')
}

function collectPages(bridge: MessageBridge, query: FilingSearchQuery, pages: number[], size: number, onEach?: () => void): Promise<number[]> {
  return runFilingPages(pages, page => fetchPage(bridge, query, page, size), {
    onPage: (_page, rows) => {
      for (const row of rows) selectedMap.set(rowKey(row), row)
      selectedVersion.value += 1
      onEach?.()
    }
  })
}

/** 全选所有页：只按上次的条件把每一页的列表行拉回来（翻页），边拉边计数、彩虹条报进度；
 * 有漏的自动兜一轮，再不行留按钮补。导出取数不在这里打，点「导出 Excel」才开始。 */
async function selectAllPages(): Promise<void> {
  const total = result.value?.total ?? 0
  const bridge = activeBridge()
  const query = lastQuery.value
  if (!bridge || !props.canSearch || selectingAll.value || !query || !total) return
  if (!(await confirmHuge(total))) return
  selectingAll.value = true
  selectionNotice.value = ''
  failedPages.value = []
  try {
    const size = 100
    const all = Array.from({ length: Math.ceil(total / size) }, (_, index) => index + 1)
    paging.startedAt = Date.now()
    paging.total = all.length
    paging.done = 0
    paintPaging('run')
    let missed = await collectPages(bridge, query, all, size, tickPage)
    if (missed.length) missed = await collectPages(bridge, query, missed, size, tickPage)
    failedPages.value = missed
    paintPaging('done')
    if (missed.length) {
      selectionNotice.value = `全选所有有 ${missed.length} 页没读到（${describeMissed(missed)}）。已选的不受影响，点「重试没读到的页」补齐。`
    }
  } finally {
    selectingAll.value = false
  }
}

/** 容灾补齐：只重拉没读到的页，已选的不动。 */
async function retryFailedPages(): Promise<void> {
  const bridge = activeBridge()
  const query = lastQuery.value
  const pages = failedPages.value
  if (!bridge || !query || selectingAll.value || !pages.length) return
  selectingAll.value = true
  try {
    // 重试这一轮自己的件数和起点，不然接在上一轮 100% 后面就再也算不出预计完成时间。
    paging.startedAt = Date.now()
    paging.total = pages.length
    paging.done = 0
    paintPaging('run')
    let missed = await collectPages(bridge, query, pages, 100, tickPage)
    if (missed.length) missed = await collectPages(bridge, query, missed, 100, tickPage)
    failedPages.value = missed
    paintPaging('done')
    selectionNotice.value = missed.length
      ? `还有 ${missed.length} 页没读到（${describeMissed(missed)}），可以再点一次重试。`
      : '没读到的页都补齐了。'
  } finally {
    selectingAll.value = false
  }
}

async function exportSelected(): Promise<void> {
  const rows = [...selectedMap.values()]
  if (!rows.length) return
  if (!(await confirmHuge(rows.length))) return
  emit('export', rows)
}
const colWidths = ref<number[]>([])
const tableStyle = computed(() => {
  const total = colWidths.value.reduce((sum, width) => sum + width, 0)
  return { width: `${total}px`, minWidth: '100%' }
})
let ruler = createTextRuler()
let observer: ResizeObserver | undefined

function textWidth(text: string, source: Element | null): number {
  return ruler.width(text, source)
}

/** 和期限表同一套：按文字量出每列下限和内容宽，交给 column-fit 分配。 */
function columnSpecs(header: Element | null, body: Element | null): ColumnFit[] {
  const rows = result.value?.items ?? []
  const specs: ColumnFit[] = []
  const add = (title: string, values: string[], mode?: 'lock' | 'grow'): void => {
    const min = textWidth(title, header) + 16
    let content = min
    for (const value of values) content = Math.max(content, textWidth(value, body) + 16)
    specs.push({ min, content, lock: mode === 'lock', grow: mode === 'grow' })
  }
  // 勾选列固定一格宽，不参与文字测量。
  specs.push({ min: 36, content: 36, lock: true })
  add('序号', rows.map((_, index) => String(rowNo(index))), 'lock')
  for (const column of resultColumns) {
    add(column.label, rows.map(row => cellText(row, column.key)), column.mode)
  }
  return specs
}

function layoutColumns(): void {
  const root = resultsTableHost.value
  const table = root?.querySelector('table')
  if (!root || !table) return
  if (!result.value?.items.length) {
    colWidths.value = []
    return
  }
  const container = root.clientWidth
  if (container <= 0) return
  const header = table.querySelector('thead th') || table
  const cell = table.querySelector('tbody td') || header
  colWidths.value = fitColumnWidths(columnSpecs(header, cell), container)
}

const measureKey = computed(() => {
  const rows = result.value?.items ?? []
  return [searchState.value, pageIndex.value, pageSize.value,
    ...rows.map(row => resultColumns.map(column => cellText(row, column.key)).join('|'))].join('~')
})
watch(measureKey, () => layoutColumns(), { flush: 'post' })

watch(() => props.userId, () => {
  pickerGeneration += 1
  pickers.value = {}
  pickersReady.value = false
  pickerFailed.value = false
  pageFields.value = []
  pickerMessage.value = ''
  loadingPickers.value = false
  templates.value = []
  selectedTemplateId.value = ''
  saveName.value = ''
  saveNameDirty.value = false
  templateMessage.value = ''
  if (!props.userId) return
  activateOptionFallback(props.userId)
  void hydrateOptionFallback(props.userId)
  void loadPickers(false)
  void reloadTemplates()
}, { immediate: true })

watch(selectedTemplateId, () => {
  saveNameDirty.value = false
  saveName.value = selectedTemplate.value?.name ?? selectedBuiltin.value?.name ?? ''
})

onMounted(() => {
  void readFilingTimeout().then(value => {
    if (!timeoutDirty) queryTimeoutMs.value = value
  })
  layoutColumns()
  observer = new ResizeObserver(() => layoutColumns())
  if (resultsTableHost.value) observer.observe(resultsTableHost.value)
})

onBeforeUnmount(() => {
  generation += 1
  stopFallbackWatch()
  observer?.disconnect()
  ruler.dispose()
})
</script>

<template>
  <div class="filing-search-query">
    <section class="card query-conditions" aria-label="递交查询条件">
      <div class="section-heading">
        <strong>查询条件</strong>
        <span class="inline-actions">
          <label class="query-timeout">超时时间
            <ThemeSelect v-model="queryTimeoutMs" :options="timeoutOptions" />
          </label>
          <button type="button" class="text-button" :disabled="(!canSearch && !manage) || loadingPickers" @click="loadPickers(true, true)">校对最新字段</button>
        </span>
      </div>
      <ul v-if="templateCards.length" class="template-picks" aria-label="递交查询模板">
        <li v-for="item in templateCards" :key="item.id">
          <button type="button" :class="{ on: selectedTemplateId === item.id }" :title="item.name" @click="toggleTemplate(item.id)">
            <b v-hint.clip="item.name">{{ item.name }}</b>
            <small>{{ item.builtin ? '内置' : '本地' }}</small>
          </button>
        </li>
      </ul>
      <div class="template-save-row" aria-label="递交模板操作">
        <label>模板名称<input v-model="saveName" type="text" maxlength="80" @input="saveNameDirty = true" /></label>
        <button type="button" class="text-button" :disabled="savingTemplate" @click="saveTemplate">{{ savingTemplate ? '正在保存…' : selectedTemplate ? '更新模板' : '保存到本地' }}</button>
        <button type="button" class="text-button" :disabled="!selectedTemplate || deletingTemplate" @click="deleteTemplate">{{ deletingTemplate ? '正在删除…' : '删除模板' }}</button>
      </div>
      <p v-if="templateMessage" class="hint">{{ templateMessage }}</p>
      <p class="hint">递交查询模板只存在本机：原站没有模板功能，保存和删除都不会写原网站。</p>
      <p v-if="loadingPickers && !pickersReady && !ledgerPresent" class="hint">正在向原网站读取递交查询下拉…</p>
      <p v-else-if="pickerMessage" class="hint">{{ pickerMessage }}</p>
      <div class="query-grid">
        <template v-for="cell in FILING_BLOCKS" :key="filingCellKeys(cell).join('-')">
          <label v-if="cell.kind === 'text'" class="query-cell">
            <span>{{ cell.label }}</span>
            <span class="limit-input">
              <input :value="valueOf(cell.key)" type="text" :placeholder="cell.hint ?? ''" @input="onText(cell.key, $event)" />
            </span>
          </label>
          <label v-else-if="cell.kind === 'named'" class="query-cell">
            <span>{{ cell.label }}</span>
            <TreeOptionSelect v-if="cell.key !== 'business_coop' || choices(cell.key).length" :model-value="valueOf(cell.key)" :multiple="isMulti(cell.key)" :options="choices(cell.key)" :status="optionStatus(cell.key)" :empty-text="`当前账号未配置${cell.label}`" @retry="loadPickers(true, true)" @update:model-value="setNamed(cell.key, String($event))" />
            <ThemeSelect v-else-if="choices(cell.key).length || cell.key !== 'business_coop'" :model-value="valueOf(cell.key)" :value-label="optionLabel(cell.key, valueOf(cell.key))" :options="optionsFor(cell.key)" @open="loadPickers(false)" @update:model-value="setNamed(cell.key, String($event))" />
            <input v-else :value="valueOf(cell.key)" type="text" placeholder="签约单位下拉未读到，可直接填值" @input="onText(cell.key, $event)" />
          </label>
          <label v-else-if="cell.kind === 'select'" class="query-cell">
            <span>{{ cell.label }}</span>
            <TreeOptionSelect v-if="FILING_OPTION_KEYS[cell.key]" :model-value="valueOf(cell.key)" :options="choices(cell.key)" :multiple="false" :status="optionStatus(cell.key)" :empty-text="`当前账号未配置${cell.label}`" @retry="loadPickers(true, true)" @update:model-value="setValue(cell.key, String($event))" />
            <ThemeSelect v-else :model-value="valueOf(cell.key)" :options="selectOptions(cell.key)" @update:model-value="setValue(cell.key, String($event))" />
          </label>
          <div v-else-if="cell.kind === 'dates'" class="query-cell">
            <span>{{ cell.label }}</span>
            <span class="date-pair">
              <WDatePicker :id="cell.start" :model-value="valueOf(cell.start)" :max="valueOf(cell.end)" placeholder="开始" @update:model-value="setValue(cell.start, String($event))" />
              <em>到</em>
              <WDatePicker :id="cell.end" :model-value="valueOf(cell.end)" :min="valueOf(cell.start)" placeholder="结束" @update:model-value="setValue(cell.end, String($event))" />
            </span>
          </div>
        </template>
      </div>
      <div class="form-actions">
        <span class="hint">已填 {{ filledCount }} 项条件。处理事项可多选时一次只带一项。</span>
        <button class="ghost" type="button" @click="reset">重置</button>
        <button v-if="!manage" class="solid" type="button" :disabled="!canSearch || searchState === 'loading'" @click="search">查询</button>
      </div>
    </section>

    <section v-if="!manage" ref="resultsSection" class="card filing-results" aria-label="递交查询结果">
      <div class="section-heading">
        <strong>查询结果</strong>
        <label class="page-size">每页数量
          <ThemeSelect v-model="pageSize" :disabled="!canSearch || searchState === 'loading'" :options="pageSizeOptions" @change="changePageSize" />
        </label>
        <button type="button" class="text-button" :disabled="!canSearch || !lastQuery || searchState === 'loading'" @click="refresh">刷新</button>
      </div>
      <div v-if="result" class="toolbar limit-bar">
        <span class="sheet-count">共 {{ result.total }} 条递交记录</span>
        <button type="button" class="ghost" :disabled="searchState === 'loading'" @click="selectPage(true)">全选本页</button>
        <button type="button" class="ghost" :disabled="searchState === 'loading'" @click="selectPage(false)">取消本页</button>
        <button type="button" class="ghost" :disabled="searchState === 'loading' || selectingAll" @click="selectAllPages">{{ selectingAll ? '正在全选…' : '全选所有' }}</button>
        <button type="button" class="ghost" :disabled="searchState === 'loading' || selectedCount === 0" @click="clearSelected">取消所有</button>
        <span class="hint">已选 {{ selectedCount }} 件{{ pagingHint }}</span>
        <button v-if="failedPages.length" type="button" class="ghost" :disabled="selectingAll" @click="retryFailedPages">重试没读到的 {{ failedPages.length }} 页</button>
        <button type="button" class="solid tiny" :disabled="selectedCount === 0 || selectingAll" @click="exportSelected">导出 Excel</button>
      </div>
      <p v-if="selectionNotice" class="error" role="alert">{{ selectionNotice }}</p>
      <p v-if="searchState === 'idle'" class="hint">输入条件后查询递交记录。</p>
      <p v-else-if="searchState === 'loading'" class="hint" role="status">正在查询…</p>
      <p v-else-if="searchState === 'error'" class="error" role="alert">{{ searchMessage }}</p>
      <p v-else-if="searchState === 'empty'" class="hint" role="status">没有符合条件的递交记录。</p>
      <template v-else-if="result">
        <div ref="resultsTableHost" class="fit-table filing-cols">
          <table class="grid" :style="tableStyle">
            <colgroup>
              <col v-for="(width, index) in colWidths" :key="index" :style="{ width: width + 'px' }" />
            </colgroup>
            <thead>
              <tr>
                <th class="check">
                  <input type="checkbox" aria-label="全选本页" :checked="result.items.length > 0 && result.items.every(isSelected)" @change="selectPage(($event.target as HTMLInputElement).checked)" />
                </th>
                <th class="seq">序号</th>
                <th v-for="column in resultColumns" :key="column.key">{{ column.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in result.items" :key="row.filingId || `${row.caseVolume}-${index}`">
                <td class="check">
                  <input type="checkbox" :aria-label="row.caseVolume || row.caseName" :checked="isSelected(row)" @change="toggleRow(row, ($event.target as HTMLInputElement).checked)" />
                </td>
                <td class="seq">{{ rowNo(index) }}</td>
                <td v-for="column in resultColumns" :key="column.key">
                  <span class="clip" v-hint.clip="cellText(row, column.key)">{{ cellText(row, column.key) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <nav class="pagination" aria-label="递交分页">
          <button type="button" :disabled="pageIndex <= 1" @click="page(-1)">上一页</button>
          <span>第 {{ pageIndex }} / {{ Math.max(result.totalPages, 1) }} 页</span>
          <button type="button" :disabled="pageIndex >= result.totalPages" @click="page(1)">下一页</button>
        </nav>
      </template>
    </section>
  </div>
</template>
