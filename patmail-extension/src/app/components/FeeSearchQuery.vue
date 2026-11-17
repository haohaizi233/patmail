<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue'
import type { FileSearchTimeoutMs } from '../../api/file-search-params'
import type { NormalizedDictionary } from '../../api/dictionaries'
import { choicesFromDictionary } from '../../api/dictionaries/picker-catalog'
import type { FeeSearchQuery } from '../../api/fee-search-params'
import type { FeeSearchResult, FeeSearchRow } from '../../api/fee-search-types'
import {
  FEE_COMMON_CELLS,
  FEE_QUICK_CELLS,
  FEE_ADVANCED_BLOCKS,
  FEE_SELECTS,
  FEE_OPTION_KEYS
} from '../../api/fee-form'
import { readFilingTimeout, writeFilingTimeout } from '../../api/query-timeout'
import { hasOptionTree } from '../../query/option-tree'
import { isMultiPickerKey } from '../../shared/picker-modes'
import { MessageType, type MessageBridge } from '../../shared/message'
import { useWorkspace } from '../composables/useWorkspace'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import TreeOptionSelect from '../../shell/components/TreeOptionSelect.vue'
import WDatePicker from '../../shell/components/WDatePicker.vue'

const props = defineProps<{
  bridge?: MessageBridge
  userId: string
  canSearch: boolean
}>()

const emit = defineEmits<{
  searched: [query: FeeSearchQuery]
  export: [rows: FeeSearchRow[]]
}>()

const injectedBridge = inject<MessageBridge>('bridge')

function activeBridge(): MessageBridge | undefined {
  return props.bridge ?? injectedBridge
}

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

// Form Values
const values = ref<Record<string, string>>({
  case_type: '',
  notice_status: '',
  pay_status: '',
  fee_class: '',
  pay_type: '',
  request_status: '',
  receive_status: ''
})

const checkedBoxes = ref<Record<string, boolean>>({
  is_fuzzy_query_case_volume: true,
  is_fuzzy_query_app_no: true,
  is_fuzzy_query_pct_app_no: true
})

function valueOf(key: string): string {
  return values.value[key] ?? ''
}

function setValue(key: string, val: string): void {
  values.value[key] = val
}

function isChecked(key: string): boolean {
  return Boolean(checkedBoxes.value[key])
}

function toggleCheck(key: string, checked: boolean): void {
  checkedBoxes.value[key] = checked
}

function onTextInput(key: string, e: Event): void {
  values.value[key] = (e.target as HTMLInputElement | HTMLTextAreaElement).value
}

// Show/hide advanced search
const showAdvanced = ref(false)

// Radio filter (ALL, 仅显示客户付, 仅显示官费, 仅收代理费)
const feeFilterMode = ref<'all' | 'customer' | 'official' | 'agent'>('all')

// Pickers & Dictionaries
const loadingPickers = ref(false)
const pickersReady = ref(false)
const pickerMessage = ref('')
const dictionaries = ref<Record<string, NormalizedDictionary>>({})

async function loadPickers(force = false): Promise<void> {
  const b = activeBridge()
  if (!b) return
  loadingPickers.value = true
  pickerMessage.value = '正在加载下拉选项...'
  try {
    const resp = await b.request({
      type: MessageType.LoadDictionary,
      payload: {
        kind: 'picker',
        force: Boolean(force)
      }
    })
    if (resp.type === MessageType.DictionaryResult && resp.payload.ok && resp.payload.data.kind === 'picker') {
      dictionaries.value = resp.payload.data.dictionaries
      pickersReady.value = true
      pickerMessage.value = ''
    } else {
      pickerMessage.value = '读取下拉字典失败'
    }
  } catch (e: any) {
    pickerMessage.value = e?.message || '读取下拉字典失败'
  } finally {
    loadingPickers.value = false
  }
}

onMounted(() => {
  void loadPickers()
})

function choices(key: string): Array<{ value: string; label: string; parent?: string }> {
  const dictKey = FEE_OPTION_KEYS[key]
  if (!dictKey) return []
  const dict = dictionaries.value[dictKey]
  return choicesFromDictionary(dict)
}

function hasTree(key: string): boolean {
  const options = choices(key)
  return hasOptionTree(options)
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

// Selection
const selectedIds = ref<Record<string, boolean>>({})
const selectedCount = computed(() => Object.values(selectedIds.value).filter(Boolean).length)

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
    fields: { ...values.value }
  }

  // Assign known fields
  for (const [k, v] of Object.entries(values.value)) {
    if (v) (q as any)[k] = v
  }
  for (const [k, v] of Object.entries(checkedBoxes.value)) {
    (q as any)[k] = v
  }

  // Filter mode adjustments
  if (feeFilterMode.value === 'official') {
    q.fee_class = 'O'
  } else if (feeFilterMode.value === 'agent') {
    q.fee_class = 'A'
  }

  return q
}

// Perform Search
async function doSearch(page = 1): Promise<void> {
  const b = activeBridge()
  if (!b) {
    searchState.value = 'error'
    searchMessage.value = '尚未连接 EASY'
    return
  }

  pageIndex.value = page
  searchState.value = 'loading'
  searchMessage.value = ''

  const q = buildCurrentQuery(page, pageSize.value)

  try {
    const resp = await b.request({
      type: MessageType.SearchFee,
      payload: {
        query: q,
        timeoutMs: queryTimeoutMs.value
      }
    })

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
      result.value = data
      if (data.total === 0 || data.rows.length === 0) {
        searchState.value = 'empty'
      } else {
        searchState.value = 'success'
      }

      emit('searched', q)

      // Also fetch total condition amounts asynchronously
      void fetchTotalAmounts(q)
    }
  } catch (e: any) {
    searchState.value = 'error'
    searchMessage.value = e?.message || '查询异常中断'
  }
}

async function fetchTotalAmounts(q: FeeSearchQuery): Promise<void> {
  const b = activeBridge()
  if (!b) return
  try {
    const resp = await b.request({
      type: MessageType.SearchFeeAmount,
      payload: {
        query: q,
        timeoutMs: queryTimeoutMs.value
      }
    })
    if (resp.type === MessageType.SearchFeeAmountResult && resp.payload.ok) {
      const data = resp.payload.data as any
      if (Array.isArray(data.FeeList)) {
        let origA = 0
        let discA = 0
        let offO = 0
        let thirdT = 0
        for (const item of data.FeeList) {
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
    // Total amount fetch failure is non-fatal
  }
}

function resetForm(): void {
  values.value = {
    case_type: '',
    notice_status: '',
    pay_status: '',
    fee_class: '',
    pay_type: '',
    request_status: '',
    receive_status: ''
  }
  checkedBoxes.value = {
    is_fuzzy_query_case_volume: true,
    is_fuzzy_query_app_no: true,
    is_fuzzy_query_pct_app_no: true
  }
  feeFilterMode.value = 'all'
  result.value = null
  selectedIds.value = {}
  searchState.value = 'idle'
}

function changePage(delta: number): void {
  const totalPages = result.value ? Math.ceil(result.value.total / pageSize.value) : 1
  const nextPage = pageIndex.value + delta
  if (nextPage >= 1 && nextPage <= totalPages) {
    void doSearch(nextPage)
  }
}

function onPageSizeChange(): void {
  void doSearch(1)
}

// Columns definition for the results table
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

// Export Excel/CSV
function exportCurrentRows(): void {
  if (!result.value || !result.value.rows.length) return
  const rowsToExport = result.value.rows.filter(r => selectedCount.value === 0 || isRowSelected(r))
  if (!rowsToExport.length) return

  // Build CSV content with BOM
  const headers = ['序号', ...columns.map(c => c.label)]
  const lines = [headers.join(',')]
  rowsToExport.forEach((row, idx) => {
    const vals = [
      String(idx + 1),
      ...columns.map(c => {
        const raw = (row as any)[c.key] ?? ''
        const escaped = String(raw).replace(/"/g, '""')
        return `"${escaped}"`
      })
    ]
    lines.push(vals.join(','))
  })

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `费用查询_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Filtered rows
const displayRows = computed(() => {
  if (!result.value) return []
  if (feeFilterMode.value === 'all') return result.value.rows
  if (feeFilterMode.value === 'official') return result.value.rows.filter(r => r.feeClass === 'O')
  if (feeFilterMode.value === 'agent') return result.value.rows.filter(r => r.feeClass === 'A')
  if (feeFilterMode.value === 'customer') return result.value.rows.filter(r => r.feeClass === 'T' || r.feeClass === 'A')
  return result.value.rows
})

const totalPages = computed(() => {
  if (!result.value || result.value.total === 0) return 1
  return Math.ceil(result.value.total / pageSize.value)
})
</script>

<template>
  <div class="fee-search-query">
    <!-- Top Action Badges / Bar (Matching original site) -->
    <div class="action-badges-bar">
      <span class="badge-btn">+ 新增通知客户</span>
      <span class="badge-btn">+ 新增请款单</span>
      <span class="badge-btn">+ 新增付款单</span>
      <span class="badge-btn">+ 新增官费缴纳</span>
      <span class="badge-btn">+ 修改费用核查</span>
      <span class="badge-btn">+ 修改通知客户状态</span>
      <span class="badge-btn">+ 修改请款状态</span>
      <span class="badge-btn">+ 修改收款状态</span>
      <span class="badge-btn">+ 修改缴费状态</span>
      <span class="badge-btn">+ 修改费用</span>
      <span class="badge-btn">+ 修改缴费类型</span>
      <span class="badge-btn ghost">导出付款单</span>
    </div>

    <!-- Query Conditions Card -->
    <section class="card query-conditions" aria-label="费用查询条件">
      <div class="section-heading">
        <strong>查询条件</strong>
        <span class="inline-actions">
          <label class="query-timeout">超时时间
            <ThemeSelect v-model="queryTimeoutMs" :options="timeoutOptions" />
          </label>
          <button type="button" class="text-button" :disabled="!canSearch || loadingPickers" @click="loadPickers(true)">
            校对最新字典
          </button>
        </span>
      </div>

      <p v-if="loadingPickers && !pickersReady" class="hint">正在向原网站读取下拉字典...</p>
      <p v-else-if="pickerMessage" class="hint">{{ pickerMessage }}</p>

      <!-- Quick Textarea Row (我方文号, 申请号, PCT申请号) -->
      <div class="quick-inputs-grid">
        <div v-for="cell in FEE_QUICK_CELLS" :key="cell.key" class="quick-cell">
          <div class="cell-label-row">
            <span>{{ cell.label }}：</span>
            <div v-if="cell.checks" class="checks-row">
              <label v-for="chk in cell.checks" :key="chk.key" class="check-item">
                <input
                  type="checkbox"
                  :checked="isChecked(chk.key)"
                  @change="toggleCheck(chk.key, ($event.target as HTMLInputElement).checked)"
                />
                {{ chk.label }}
              </label>
            </div>
          </div>
          <input
            v-if="cell.kind === 'text'"
            :value="valueOf(cell.key)"
            type="text"
            :placeholder="cell.placeholder"
            class="text-input"
            @input="onTextInput(cell.key, $event)"
          />
        </div>
      </div>

      <!-- Main 7 Rows Form Grid (3 columns each) -->
      <div class="query-grid fee-form-grid">
        <template v-for="cell in FEE_COMMON_CELLS" :key="cell.label">
          <!-- Text Cell -->
          <label v-if="cell.kind === 'text'" class="query-cell">
            <span class="cell-title">
              {{ cell.label }}
              <template v-if="cell.checks">
                <label v-for="chk in cell.checks" :key="chk.key" class="check-inline">
                  <input
                    type="checkbox"
                    :checked="isChecked(chk.key)"
                    @change="toggleCheck(chk.key, ($event.target as HTMLInputElement).checked)"
                  />
                  {{ chk.label }}
                </label>
              </template>
            </span>
            <span class="cell-body">
              <input
                :value="valueOf(cell.key)"
                type="text"
                :placeholder="cell.placeholder || `请输入${cell.label}`"
                @input="onTextInput(cell.key, $event)"
              />
            </span>
          </label>

          <!-- Named Tree Cell -->
          <label v-else-if="cell.kind === 'named'" class="query-cell">
            <span class="cell-title">{{ cell.label }}</span>
            <TreeOptionSelect
              v-if="hasTree(cell.key) || choices(cell.key).length"
              :model-value="valueOf(cell.key)"
              :options="choices(cell.key)"
              :multiple="isMultiPickerKey(cell.key)"
              :empty-text="`暂未配置${cell.label}`"
              @update:model-value="setValue(cell.key, String($event))"
            />
            <input
              v-else
              :value="valueOf(cell.key)"
              type="text"
              :placeholder="`选择${cell.label}`"
              @input="onTextInput(cell.key, $event)"
            />
          </label>

          <!-- Select Cell -->
          <label v-else-if="cell.kind === 'select'" class="query-cell">
            <span class="cell-title">
              {{ cell.label }}
              <template v-if="cell.checks">
                <label v-for="chk in cell.checks" :key="chk.key" class="check-inline">
                  <input
                    type="checkbox"
                    :checked="isChecked(chk.key)"
                    @change="toggleCheck(chk.key, ($event.target as HTMLInputElement).checked)"
                  />
                  {{ chk.label }}
                </label>
              </template>
            </span>
            <ThemeSelect
              :model-value="valueOf(cell.key)"
              :options="FEE_SELECTS[cell.key] || []"
              @update:model-value="setValue(cell.key, String($event))"
            />
          </label>

          <!-- Dates Cell -->
          <div v-else-if="cell.kind === 'dates'" class="query-cell">
            <span class="cell-title">
              {{ cell.label }}
              <label v-if="cell.empty" class="check-inline">
                <input
                  type="checkbox"
                  :checked="isChecked(cell.empty)"
                  @change="toggleCheck(cell.empty, ($event.target as HTMLInputElement).checked)"
                />
                为空
              </label>
              <template v-if="cell.checks">
                <label v-for="chk in cell.checks" :key="chk.key" class="check-inline">
                  <input
                    type="checkbox"
                    :checked="isChecked(chk.key)"
                    @change="toggleCheck(chk.key, ($event.target as HTMLInputElement).checked)"
                  />
                  {{ chk.label }}
                </label>
              </template>
            </span>
            <span class="date-pair">
              <WDatePicker
                :id="cell.start"
                :model-value="valueOf(cell.start)"
                :max="valueOf(cell.end)"
                placeholder="起"
                @update:model-value="setValue(cell.start, String($event))"
              />
              <em>到</em>
              <WDatePicker
                :id="cell.end"
                :model-value="valueOf(cell.end)"
                :min="valueOf(cell.start)"
                placeholder="止"
                @update:model-value="setValue(cell.end, String($event))"
              />
            </span>
          </div>
        </template>
      </div>

      <!-- Advanced Search Expand / Collapse -->
      <div class="advanced-toggle-row">
        <button type="button" class="text-button toggle-btn" @click="showAdvanced = !showAdvanced">
          {{ showAdvanced ? '收起高级查询 ▲' : '显示高级查询 ▼' }}
        </button>
      </div>

      <!-- Advanced Sections -->
      <div v-if="showAdvanced" class="advanced-sections">
        <section v-for="block in FEE_ADVANCED_BLOCKS" :key="block.title" class="advanced-block">
          <h4 class="block-title">{{ block.title }}</h4>
          <div class="query-grid fee-form-grid">
            <template v-for="cell in block.cells" :key="cell.label">
              <label v-if="cell.kind === 'text'" class="query-cell">
                <span class="cell-title">
                  {{ cell.label }}
                  <template v-if="cell.checks">
                    <label v-for="chk in cell.checks" :key="chk.key" class="check-inline">
                      <input
                        type="checkbox"
                        :checked="isChecked(chk.key)"
                        @change="toggleCheck(chk.key, ($event.target as HTMLInputElement).checked)"
                      />
                      {{ chk.label }}
                    </label>
                  </template>
                </span>
                <input
                  :value="valueOf(cell.key)"
                  type="text"
                  :placeholder="`请输入${cell.label}`"
                  @input="onTextInput(cell.key, $event)"
                />
              </label>

              <label v-else-if="cell.kind === 'named'" class="query-cell">
                <span class="cell-title">{{ cell.label }}</span>
                <TreeOptionSelect
                  v-if="hasTree(cell.key) || choices(cell.key).length"
                  :model-value="valueOf(cell.key)"
                  :options="choices(cell.key)"
                  :multiple="isMultiPickerKey(cell.key)"
                  :empty-text="`暂未配置${cell.label}`"
                  @update:model-value="setValue(cell.key, String($event))"
                />
                <input
                  v-else
                  :value="valueOf(cell.key)"
                  type="text"
                  :placeholder="`选择${cell.label}`"
                  @input="onTextInput(cell.key, $event)"
                />
              </label>

              <label v-else-if="cell.kind === 'select'" class="query-cell">
                <span class="cell-title">{{ cell.label }}</span>
                <ThemeSelect
                  :model-value="valueOf(cell.key)"
                  :options="FEE_SELECTS[cell.key] || []"
                  @update:model-value="setValue(cell.key, String($event))"
                />
              </label>

              <div v-else-if="cell.kind === 'dates'" class="query-cell">
                <span class="cell-title">
                  {{ cell.label }}
                  <label v-if="cell.empty" class="check-inline">
                    <input
                      type="checkbox"
                      :checked="isChecked(cell.empty)"
                      @change="toggleCheck(cell.empty, ($event.target as HTMLInputElement).checked)"
                    />
                    为空
                  </label>
                </span>
                <span class="date-pair">
                  <WDatePicker
                    :id="cell.start"
                    :model-value="valueOf(cell.start)"
                    :max="valueOf(cell.end)"
                    placeholder="起"
                    @update:model-value="setValue(cell.start, String($event))"
                  />
                  <em>到</em>
                  <WDatePicker
                    :id="cell.end"
                    :model-value="valueOf(cell.end)"
                    :min="valueOf(cell.start)"
                    placeholder="止"
                    @update:model-value="setValue(cell.end, String($event))"
                  />
                </span>
              </div>
            </template>
          </div>
        </section>
      </div>

      <!-- Action Buttons Row -->
      <div class="form-actions fee-actions">
        <button class="solid primary-search" type="button" :disabled="!canSearch || searchState === 'loading'" @click="doSearch(1)">
          {{ searchState === 'loading' ? '正在查询...' : '查询' }}
        </button>
        <button class="ghost" type="button" @click="resetForm">重置</button>
        <button class="ghost" type="button" :disabled="!result || !result.rows.length" @click="exportCurrentRows">
          导出信息
        </button>
      </div>
    </section>

    <!-- Results Section -->
    <section class="card fee-results-section" aria-label="费用查询结果">
      <!-- Filter Radios Bar -->
      <div class="filter-radios-bar">
        <label class="radio-label">
          <input v-model="feeFilterMode" type="radio" value="all" />
          显示全部
        </label>
        <label class="radio-label">
          <input v-model="feeFilterMode" type="radio" value="customer" />
          仅显示客户付
        </label>
        <label class="radio-label">
          <input v-model="feeFilterMode" type="radio" value="official" />
          仅显示官费
        </label>
        <label class="radio-label">
          <input v-model="feeFilterMode" type="radio" value="agent" />
          仅收代理费
        </label>
      </div>

      <!-- Amount Stats Summary (Exact match with original site) -->
      <div v-if="result" class="amount-summary-box">
        <div class="summary-line">
          <strong>当前页金额：</strong>
          <span class="stat-item">折后代理费: <em>{{ result.summary.pageAgentFee.toLocaleString() }} CNY</em></span>
          <span class="stat-item">官费: <em>{{ result.summary.pageOfficialFee.toLocaleString() }} CNY</em></span>
          <span class="stat-item">第三方费: <em>{{ result.summary.pageThirdPartyFee.toLocaleString() }} CNY</em></span>
        </div>
        <div class="summary-line total-line">
          <strong>查询条件总金额：</strong>
          <span class="stat-item">原始代理费: <em>{{ totalAmountInfo.originalAgentFee.toLocaleString() }} CNY</em></span>
          <span class="stat-item">折后代理费: <em>{{ totalAmountInfo.discountAgentFee.toLocaleString() }} CNY</em></span>
          <span class="stat-item">官费: <em>{{ totalAmountInfo.officialFee.toLocaleString() }} CNY</em></span>
          <span class="stat-item">第三方费: <em>{{ totalAmountInfo.thirdPartyFee.toLocaleString() }} CNY</em></span>
        </div>
      </div>

      <!-- Results Toolbar -->
      <div class="section-heading">
        <span class="sheet-count">共 {{ result?.total ?? 0 }} 条费用记录</span>
        <div class="table-actions">
          <button type="button" class="ghost tiny" :disabled="!result" @click="selectCurrentPage(true)">全选本页</button>
          <button type="button" class="ghost tiny" :disabled="!result" @click="selectCurrentPage(false)">取消本页</button>
          <button type="button" class="ghost tiny" :disabled="selectedCount === 0" @click="clearAllSelected">清空选择</button>
          <span v-if="selectedCount > 0" class="hint">已勾选 {{ selectedCount }} 项</span>
          <label class="page-size-selector">
            每页条数
            <ThemeSelect v-model="pageSize" :options="pageSizeOptions" @update:model-value="onPageSizeChange" />
          </label>
        </div>
      </div>

      <p v-if="searchState === 'idle'" class="hint">请输入查询条件并点击「查询」。</p>
      <p v-else-if="searchState === 'loading'" class="hint" role="status">正在向原网站检索费用明细...</p>
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
                  :checked="isRowSelected(row)"
                  @change="toggleRow(row, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td class="seq-col">{{ row.sn }}</td>
              <td class="op-col">
                <span class="op-icons" title="查看 / 编辑">
                  📄 ✏️
                </span>
              </td>
              <td v-for="col in columns" :key="col.key">
                <span class="cell-text" :title="String((row as any)[col.key] || '')">
                  {{ (row as any)[col.key] ?? '-' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination Bar -->
        <nav class="pagination" aria-label="费用查询分页">
          <button type="button" :disabled="pageIndex <= 1" @click="changePage(-1)">上一页</button>
          <span>第 {{ pageIndex }} / {{ totalPages }} 页</span>
          <button type="button" :disabled="pageIndex >= totalPages" @click="changePage(1)">下一页</button>
        </nav>
      </div>
    </section>
  </div>
</template>

<style scoped>
.fee-search-query {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.action-badges-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.badge-btn {
  padding: 4px 10px;
  font-size: 12px;
  background: var(--bg-card, #f4f7fb);
  border: 1px solid var(--border-color, #d2dcf0);
  border-radius: 4px;
  color: var(--text-color, #234);
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
}

.badge-btn:hover {
  background: var(--primary-light, #e8f0fe);
  border-color: var(--primary, #1976d2);
}

.badge-btn.ghost {
  background: transparent;
}

.quick-inputs-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-hover, #f8faff);
  border-radius: 6px;
  border: 1px solid var(--border-color, #e0e8f5);
}

.quick-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cell-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #333);
}

.checks-row, .check-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: normal;
  color: var(--text-muted, #666);
  cursor: pointer;
}

.check-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: normal;
  color: var(--text-muted, #666);
  margin-left: 8px;
  cursor: pointer;
}

.text-input {
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 4px;
  background: var(--bg-input, #fff);
  color: var(--text-color, #111);
  box-sizing: border-box;
}

.fee-form-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px 18px;
}

.query-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cell-title {
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color, #333);
}

.date-pair {
  display: flex;
  align-items: center;
  gap: 6px;
}

.date-pair em {
  font-style: normal;
  color: var(--text-muted, #888);
}

.advanced-toggle-row {
  display: flex;
  justify-content: flex-end;
  margin: 12px 0;
}

.toggle-btn {
  font-size: 13px;
  color: var(--primary, #1976d2);
  cursor: pointer;
  padding: 4px 8px;
}

.advanced-sections {
  margin-top: 12px;
  border-top: 1px dashed var(--border-color, #cbd5e1);
  padding-top: 16px;
}

.advanced-block {
  margin-bottom: 20px;
}

.block-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-heading, #1f2937);
  margin: 0 0 12px 0;
  padding-left: 8px;
  border-left: 3px solid var(--primary, #1976d2);
}

.fee-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-start;
  margin-top: 20px;
}

.primary-search {
  min-width: 100px;
}

.filter-radios-bar {
  display: flex;
  gap: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  margin-bottom: 12px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}

.amount-summary-box {
  background: var(--bg-stat, #f0f7ff);
  border: 1px solid var(--border-stat, #c2dcfc);
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 14px;
  font-size: 13px;
}

.summary-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  color: var(--text-color, #1e293b);
  margin-bottom: 6px;
}

.summary-line.total-line {
  margin-bottom: 0;
  padding-top: 6px;
  border-top: 1px dashed #c2dcfc;
}

.stat-item em {
  font-style: normal;
  font-weight: 600;
  color: #0284c7;
  margin-left: 4px;
}

.fee-results-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.table-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-size-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.fee-table-container {
  overflow-x: auto;
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 6px;
}

.fee-data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  white-space: nowrap;
}

.fee-data-table th,
.fee-data-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  text-align: left;
}

.fee-data-table th {
  background: var(--bg-th, #f8fafc);
  font-weight: 600;
  color: var(--text-th, #475569);
  position: sticky;
  top: 0;
}

.fee-data-table tbody tr:hover {
  background: var(--bg-tr-hover, #f1f5f9);
}

.check-col {
  width: 32px;
  text-align: center;
}

.seq-col {
  width: 44px;
  text-align: center;
}

.op-col {
  width: 60px;
  text-align: center;
}

.op-icons {
  font-size: 13px;
  cursor: pointer;
  letter-spacing: 4px;
}

.cell-text {
  display: inline-block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
