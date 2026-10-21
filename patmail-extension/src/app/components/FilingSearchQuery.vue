<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import type { NormalizedDictionary } from '../../api/dictionaries'
import { choicesFromDictionary, describePickerReceipt, FILING_PICKER_FIELDS } from '../../api/dictionaries/picker-catalog'
import { FILING_OPTION_KEYS, FILING_BLOCKS, FILING_SELECTS, filingCellKeys, filingDraftFields, type FilingCell } from '../../api/filing-form'
import { splitFilingCtrlProcIds, type FilingSearchQuery } from '../../api/filing-search-params'
import type { FilingSearchResult, FilingSearchRow } from '../../api/filing-search-types'
import { hasOptionTree } from '../../query/option-tree'
import { MessageType, type MessageBridge } from '../../shared/message'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import TreeOptionSelect from '../../shell/components/TreeOptionSelect.vue'
import WDatePicker from '../../shell/components/WDatePicker.vue'

const props = defineProps<{ bridge?: MessageBridge; userId: string; canSearch: boolean }>()
const emit = defineEmits<{ searched: [query: FilingSearchQuery] }>()

const bridge = inject<MessageBridge>('bridge')

const values = ref<Record<string, string>>({})
const pickers = ref<Record<string, NormalizedDictionary>>({})
const pickersReady = ref(false)
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

const resultColumns = [
  { key: 'caseVolume', label: '我方文号', width: '11%' },
  { key: 'caseName', label: '案件名称', width: '16%' },
  { key: 'customerName', label: '客户名称', width: '11%' },
  { key: 'customerCode', label: '客户代码', width: '9%' },
  { key: 'applyType', label: '申请类型', width: '6%' },
  { key: 'ctrlProc', label: '处理事项', width: '7%' },
  { key: 'intDueDate', label: '内部/客户期限', width: '9%' },
  { key: 'filingDate', label: '完成时间', width: '9%' },
  { key: 'caseType', label: '案件类型', width: '6%' },
  { key: 'branchDept', label: '案件所属分部', width: '8%' },
  { key: 'createUser', label: '创建人', width: '6%' },
  { key: 'createTime', label: '创建时间', width: '8%' }
] as const

const filledCount = computed(() => Object.values(values.value).filter(value => value.trim()).length)

function valueOf(key: string): string {
  return values.value[key] ?? ''
}
function setValue(key: string, value: string): void {
  values.value = { ...values.value, [key]: value }
}
function onText(key: string, event: Event): void {
  setValue(key, (event.target as HTMLInputElement).value)
}

function choices(key: string): { value: string; label: string; parent?: string }[] {
  const source = FILING_OPTION_KEYS[key]
  const dictionary = source ? pickers.value[source] : undefined
  const live = dictionary && dictionary.options.length > 0
    ? choicesFromDictionary(dictionary, valueOf('case_type'))
    : null
  const saved = FILING_SELECTS[key] ?? []
  return (live ?? saved).filter(item => item.value)
}

/** 页面写死的下拉，选项照抄原站 option，空项就是原站的「请选择 / ALL」。 */
function selectOptions(key: string): { value: string; label: string }[] {
  return FILING_SELECTS[key] ?? []
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
    const response = await props.bridge.request({
      type: MessageType.LoadDictionary, payload: { kind: 'picker', force }
    })
    if (response.type !== MessageType.DictionaryResult || !response.payload.ok || response.payload.data.kind !== 'picker') {
      pickerMessage.value = response.type === MessageType.DictionaryResult && !response.payload.ok
        ? response.payload.error.message
        : response.type === MessageType.Error ? response.payload.message : '下拉选项没有读到，文本条件仍可查询。'
      return
    }
    pickers.value = response.payload.data.dictionaries
    pickersReady.value = true
    pickerMessage.value = describePickerReceipt(response.payload.data.dictionaries, response.payload.data.warnings)
  } catch {
    pickerMessage.value = '下拉选项没有读到，文本条件仍可查询。'
  } finally {
    loadingPickers.value = false
  }
}

function messageForError(code: string, message: string): string {
  if (code === 'SESSION_EXPIRED') return 'EASY 登录已失效，请在原网站重新登录后检测。'
  if (code === 'AUTH_UNKNOWN') return '无法确认当前登录状态，请重试。'
  if (code === 'REQUEST_TIMEOUT') return '原网站查询太慢，没有在限时内返回。可以把条件写具体一点再查。'
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
    const response = await bridge.request({ type: MessageType.SearchFiling, payload: { query } })
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
function cellText(row: FilingSearchRow, key: typeof resultColumns[number]['key']): string {
  return row[key]?.trim() ?? ''
}

onMounted(() => {
  void loadPickers(false)
})
onBeforeUnmount(() => {
  generation += 1
})
</script>

<template>
  <div class="filing-search-query">
    <section class="card query-conditions" aria-label="递交查询条件">
      <div class="section-heading">
        <strong>查询条件</strong>
        <span class="inline-actions">
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
            <TreeOptionSelect v-if="treeChoices(cell.key).length" :model-value="valueOf(cell.key)" :options="treeChoices(cell.key)" @update:model-value="setValue(cell.key, String($event))" />
            <ThemeSelect v-else-if="choices(cell.key).length" :model-value="valueOf(cell.key)" :value-label="optionLabel(cell.key, valueOf(cell.key))" :options="optionsFor(cell.key)" @open="loadPickers(false)" @update:model-value="setValue(cell.key, String($event))" />
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
        <div class="table-scroll">
          <table class="grid">
            <colgroup>
              <col class="seq" />
              <col v-for="column in resultColumns" :key="column.key" :style="{ width: column.width }" />
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
