<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CURRENT_ENVIRONMENT } from '../../api/config'
import { fileSearchTimeoutMs, type FileSearchTimeoutMs } from '../../api/file-search-params'
import type { NormalizedDictionary } from '../../api/dictionaries'
import { choicesFromDictionary, describePickerReceipt, FILING_PICKER_FIELDS } from '../../api/dictionaries/picker-catalog'
import { FILING_OPTION_KEYS, FILING_SELECTS, FILING_BLOCKS, filingCellKeys, filingDraftFields, type FilingCell } from '../../api/filing-form'
import type { FilingSearchQuery } from '../../api/filing-search-params'
import type { FilingSearchResult, FilingSearchRow } from '../../api/filing-search-types'
import { readFilingTimeout, writeFilingTimeout } from '../../api/query-timeout'
import { hasOptionTree } from '../../query/option-tree'
import { activateOptionFallback, hydrateOptionFallback, optionFallbackEpoch, rememberChoices, rememberDictionaries, rememberFormFields, savedChoices, subscribeOptionFallback } from '../../query/option-fallback'
import { assignColumnWidths, type ColumnFit } from '../../shell/column-fit'
import { isMultiPickerKey } from '../../shared/picker-modes'
import { MessageType, type FileSearchFormField, type MessageBridge } from '../../shared/message'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import TreeOptionSelect from '../../shell/components/TreeOptionSelect.vue'
import WDatePicker from '../../shell/components/WDatePicker.vue'

const props = defineProps<{ bridge?: MessageBridge; userId: string; canSearch: boolean }>()
const emit = defineEmits<{ searched: [query: FilingSearchQuery] }>()

const bridge = inject<MessageBridge>('bridge')

const values = ref<Record<string, string>>({})
const pickers = ref<Record<string, NormalizedDictionary>>({})
const pickersReady = ref(false)
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

function choices(key: string): { value: string; label: string; parent?: string }[] {
  fallbackTick.value
  const source = FILING_OPTION_KEYS[key]
  const dictionary = source ? pickers.value[source] : undefined
  // 原站 ChangeForApplyType 按当前案件类型收申请类型；没选案件类型时按本环境默认的专利收。
  const caseTypeId = valueOf('case_type') || CURRENT_ENVIRONMENT.caseTypeId
  const live = dictionary && dictionary.options.length > 0 ? choicesFromDictionary(dictionary, caseTypeId) : null
  const stored = props.userId ? savedChoices(props.userId, optionCacheKey(key)) : null
  return (live ?? stored ?? []).filter(item => item.value)
}

/** select 的选项：原站页面实时扫（ScanFilingForm）优先，其次接口字典/缓存，最后用抓包快照兜底。原站这几个 select 没有接口，页面没打开时只剩兜底。 */
function selectOptions(key: string): { value: string; label: string }[] {
  fallbackTick.value
  const field = pageFields.value.find(item => item.id === key && item.control === 'select')
  const scanned = (field?.options ?? []).filter(item => item.value)
  const fromDictionary = choices(key).filter(item => item.value)
  const builtin = (FILING_SELECTS[key] ?? []).filter(item => item.value)
  const rows = scanned.length ? scanned : fromDictionary.length ? fromDictionary : builtin
  return [{ value: '', label: '不限' }, ...rows.map(item => ({ value: item.value, label: item.label }))]
}

/** 这个账号已经存下非空选项的字段。 */
function cachedOptionKeys(): string[] {
  if (!props.userId) return []
  const keys = new Set([...Object.keys(FILING_OPTION_KEYS), ...SELECT_KEYS])
  return [...keys].filter(key => savedChoices(props.userId, optionCacheKey(key)))
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

async function loadPickers(force: boolean): Promise<void> {
  if (!props.bridge || !props.canSearch || loadingPickers.value) return
  if (!force && pickersReady.value) return
  loadingPickers.value = true
  pickerMessage.value = force ? '' : '正在向原网站读取递交查询下拉…'
  try {
    const [dict, form] = await Promise.all([
      props.bridge.request({ type: MessageType.LoadDictionary, payload: { kind: 'picker', force } }),
      props.bridge.request({ type: MessageType.ScanFilingForm })
    ])
    const notes: string[] = []
    const cached = new Set(cachedOptionKeys())
    if (dict.type === MessageType.DictionaryResult && dict.payload.ok && dict.payload.data.kind === 'picker') {
      pickers.value = dict.payload.data.dictionaries
      pickersReady.value = true
      if (props.userId) {
        // 申请类型按案件类型收窄后单独缓存；其余下拉按表单键存进回退。空列表不会覆盖缓存。
        const fields = { ...FILING_OPTION_KEYS }
        delete fields.apply_type
        rememberDictionaries(props.userId, fields, dict.payload.data.dictionaries)
        rememberChoices(props.userId, optionCacheKey('apply_type'), choices('apply_type'))
      }
      notes.push(describePickerReceipt(dict.payload.data.dictionaries, dict.payload.data.warnings))
    } else {
      notes.push(dict.type === MessageType.DictionaryResult && !dict.payload.ok
        ? dict.payload.error.message
        : cached.size ? '接口下拉没有读到，先用上次读到的选项。' : '接口下拉没有读到，文本条件仍可查询。')
    }
    if (form.type === MessageType.FilingFormResult) {
      // 空扫描结果不覆盖上一次读到的下拉；只有扫到非空选项才更新缓存。
      const scanned = form.payload.fields
      if (scanned.length) {
        pageFields.value = scanned
        if (props.userId) rememberFormFields(props.userId, scanned)
      }
      const selects = scanned.filter(item => item.control === 'select' && item.options.length > 0)
      notes.push(selects.length > 0
        ? `原站页面下拉：${selects.map(item => `${item.label} ${item.options.length}`).join('、')}。`
        : '原站递交列表页的下拉没有扫到，先用缓存和内置选项。点「校对最新字段」会打开原站的递交查询页再读一次。')
    }
    pickerMessage.value = notes.filter(Boolean).join(' ')
  } catch {
    pickerMessage.value = '下拉选项没有读到，文本条件仍可查询。'
  } finally {
    loadingPickers.value = false
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
  if (!bridge || !props.canSearch) return
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
  const draft = filingDraftFields(values.value)
  if (!Object.keys(draft.fields).length) {
    searchState.value = 'error'
    searchMessage.value = '请输入查询条件。'
    result.value = null
    lastQuery.value = null
    void showResults()
    return
  }
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
  values.value = {}
  result.value = null
  lastQuery.value = null
  pageIndex.value = 1
  searchState.value = 'idle'
  searchMessage.value = ''
}
function rowNo(index: number): number {
  return (pageIndex.value - 1) * pageSize.value + index + 1
}
function cellText(row: FilingSearchRow, key: ResultColumnKey): string {
  return row[key]?.trim() ?? ''
}

const resultsTableHost = ref<HTMLElement | null>(null)
const colWidths = ref<number[]>([])
const tableStyle = computed(() => {
  const total = colWidths.value.reduce((sum, width) => sum + width, 0)
  return { width: `${total}px`, minWidth: '100%' }
})
let ruler: HTMLSpanElement | null = null
let observer: ResizeObserver | undefined

function textWidth(text: string, source: Element | null): number {
  if (!ruler || !source) return 0
  ruler.style.font = getComputedStyle(source).font
  ruler.textContent = String(text ?? '')
  return Math.ceil(ruler.offsetWidth) + 2
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
  add('序号', rows.map((_, index) => String(rowNo(index))), 'lock')
  for (const column of resultColumns) {
    add(column.label, rows.map(row => cellText(row, column.key)), column.mode)
  }
  return specs
}

function layoutColumns(): void {
  const root = resultsTableHost.value
  const table = root?.querySelector('table')
  if (!root || !table || !ruler) return
  if (!result.value?.items.length) {
    colWidths.value = []
    return
  }
  const container = root.clientWidth
  if (container <= 0) return
  const header = table.querySelector('thead th') || table
  const cell = table.querySelector('tbody td') || header
  colWidths.value = assignColumnWidths(columnSpecs(header, cell), container)
}

const measureKey = computed(() => {
  const rows = result.value?.items ?? []
  return [searchState.value, pageIndex.value, pageSize.value,
    ...rows.map(row => resultColumns.map(column => cellText(row, column.key)).join('|'))].join('~')
})
watch(measureKey, () => layoutColumns(), { flush: 'post' })

watch(() => props.userId, () => {
  pickers.value = {}
  pickersReady.value = false
  pageFields.value = []
  pickerMessage.value = ''
  loadingPickers.value = false
  if (!props.userId) return
  activateOptionFallback(props.userId)
  void hydrateOptionFallback(props.userId)
  void loadPickers(false)
}, { immediate: true })

onMounted(() => {
  void readFilingTimeout().then(value => {
    if (!timeoutDirty) queryTimeoutMs.value = value
  })
  ruler = document.createElement('span')
  ruler.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:nowrap;visibility:hidden;pointer-events:none;'
  document.body.appendChild(ruler)
  layoutColumns()
  observer = new ResizeObserver(() => layoutColumns())
  if (resultsTableHost.value) observer.observe(resultsTableHost.value)
})

onBeforeUnmount(() => {
  generation += 1
  stopFallbackWatch()
  observer?.disconnect()
  ruler?.remove()
  ruler = null
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
          <button type="button" class="text-button" :disabled="!canSearch || loadingPickers" @click="loadPickers(true)">校对最新字段</button>
        </span>
      </div>
      <p v-if="loadingPickers && !pickersReady" class="hint">正在向原网站读取递交查询下拉…</p>
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
            <TreeOptionSelect v-if="isMulti(cell.key) || treeChoices(cell.key).length" :model-value="valueOf(cell.key)" :multiple="isMulti(cell.key)" :options="choices(cell.key)" @update:model-value="setNamed(cell.key, String($event))" />
            <ThemeSelect v-else-if="choices(cell.key).length" :model-value="valueOf(cell.key)" :value-label="optionLabel(cell.key, valueOf(cell.key))" :options="optionsFor(cell.key)" @open="loadPickers(false)" @update:model-value="setNamed(cell.key, String($event))" />
            <input v-else :value="valueOf(cell.key)" type="text" :placeholder="cell.key === 'business_coop' ? '签约单位下拉未读到，可直接填值' : ''" @input="onText(cell.key, $event)" />
          </label>
          <label v-else-if="cell.kind === 'select'" class="query-cell">
            <span>{{ cell.label }}</span>
            <ThemeSelect :model-value="valueOf(cell.key)" :options="selectOptions(cell.key)" @update:model-value="setValue(cell.key, String($event))" />
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
        <button class="solid" type="button" :disabled="!canSearch || searchState === 'loading'" @click="search">查询</button>
      </div>
    </section>

    <section ref="resultsSection" class="card filing-results" aria-label="递交查询结果">
      <div class="section-heading">
        <strong>查询结果</strong>
        <label class="page-size">每页数量
          <ThemeSelect v-model="pageSize" :disabled="!canSearch || searchState === 'loading'" :options="pageSizeOptions" @change="changePageSize" />
        </label>
        <button type="button" class="text-button" :disabled="!canSearch || !lastQuery || searchState === 'loading'" @click="refresh">刷新</button>
      </div>
      <div v-if="result" class="result-toolbar">
        <span>共 {{ result.total }} 条递交记录</span>
      </div>
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
                <th class="seq">序号</th>
                <th v-for="column in resultColumns" :key="column.key">{{ column.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in result.items" :key="row.filingId || `${row.caseVolume}-${index}`">
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
