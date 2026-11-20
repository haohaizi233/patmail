<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import PageHead from '../../shell/components/PageHead.vue'
import { bg } from '../../shell/assets'
import FileSearchPanel from '../../floating/FileSearchPanel.vue'
import FeeSearchQuery from '../components/FeeSearchQuery.vue'
import { useWorkspace } from '../composables/useWorkspace'
import type { SelectedPatentFile } from '../../mail/types'
import type { FeeSearchRow } from '../../api/fee-search-types'
import {
  billInfoFromFile,
  uniqueCaseVolumes,
  missingCurrencies,
  type BillInfo
} from '../../billing/fee-model'
import {
  PBC_INDEX_URL,
  fetchPbcRates,
  normalizeCurrency,
  type PbcRates
} from '../../billing/pbc-rates'
import {
  BILLING_TEMPLATES,
  defaultHeaders,
  fillBillingTemplate,
  formatLocalDate,
  type BillingOptions,
  type BillingTemplateId
} from '../../billing/templates'
import { loadBillingTemplate } from '../../billing/template-assets'

const props = withDefaults(
  defineProps<{
    embedded?: boolean
    isActive?: boolean
  }>(),
  { embedded: false, isActive: true }
)

defineEmits<{
  back: []
}>()

const { connection } = useWorkspace()
const ready = computed(() => connection.value.sessionStatus === 'authenticated')

// ---------------------------------------------------------------- 先选模板 → 智能预填查询条件
const selectedTemplateId = ref<BillingTemplateId>('general-foreign')
const currentTemplate = computed(() =>
  BILLING_TEMPLATES.find(t => t.id === selectedTemplateId.value) ?? BILLING_TEMPLATES[0]
)

const headerValues = ref<Record<string, string>>(defaultHeaders('general-foreign'))
const billingOptions = ref<BillingOptions>({ ...BILLING_TEMPLATES[0].queryPreset.defaultOptions })

// ---------------------------------------------------------------- 步骤控制
type Step = 1 | 2 | 3
const currentStep = ref<Step>(1)
const stepNotice = ref('')

function setStep(target: Step): void {
  if (target === 3 && selectedFeeRows.value.length === 0) {
    stepNotice.value = '步骤 2 还没有勾选费用。请先在费用查询表格中勾选要请款的费用行。'
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

// ---------------------------------------------------------------- 步骤 1：文件管理与账单识别
const filePanelRef = ref<InstanceType<typeof FileSearchPanel> | null>(null)
const fileSelection = ref<Record<string, SelectedPatentFile>>({})

// 按所选模板自动预填文件管理条件（文件描述在树加载后自动换算为当前站点实时 GUID）
const fileSeed = ref<Record<string, string>>({ ...BILLING_TEMPLATES[0].queryPreset.fileFields })
const fileSeedToken = ref(1)

const billMap = computed<Record<string, BillInfo[]>>(() => {
  const result: Record<string, BillInfo[]> = {}
  for (const file of Object.values(fileSelection.value)) {
    const bill = billInfoFromFile(file)
    if (!bill || !bill.caseVolume) continue
    if (!result[bill.caseVolume]) result[bill.caseVolume] = []
    result[bill.caseVolume].push(bill)
  }
  return result
})

const recognizedBillsCount = computed(() =>
  Object.values(billMap.value).reduce((sum, list) => sum + list.length, 0)
)

const autoExtractedVolumes = computed(() =>
  uniqueCaseVolumes(Object.values(fileSelection.value))
)

const customVolumeInput = ref('')
const extraVolumes = ref<string[]>([])
const excludedVolumes = ref<string[]>([])

const activeVolumes = computed<string[]>(() => {
  const excluded = new Set(excludedVolumes.value)
  const set = new Set<string>([...autoExtractedVolumes.value, ...extraVolumes.value])
  return [...set].filter(vol => Boolean(vol) && !excluded.has(vol))
})

function addCustomVolume(): void {
  const text = customVolumeInput.value.trim()
  if (!text) return
  const parts = text.split(/[\s,;\n\r]+/).map(s => s.trim()).filter(Boolean)
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

// ---------------------------------------------------------------- 步骤 2：费用查询联动
const feeQueryRef = ref<InstanceType<typeof FeeSearchQuery> | null>(null)
const feeInitialValues = ref<Record<string, string>>({
  case_volume: '',
  ...BILLING_TEMPLATES[0].queryPreset.feeFields
})
const feeInitialToken = ref(1)
const selectedFeeRows = ref<FeeSearchRow[]>([])
const lastAppliedFeeSyncKey = ref('')

function buildFeeSyncKey(): string {
  return `${selectedTemplateId.value}\u0001${activeVolumes.value.join('\n')}`
}

/**
 * 仅在模板切换或步骤 1 提取文号发生变化（或用户显式点击同步）时写入步骤 2 条件，
 * 避免从步骤 3 返回步骤 2 时覆盖用户手工调整的查询条件。
 */
function syncFeeQueryIfNeeded(force: boolean): void {
  const syncKey = buildFeeSyncKey()
  if (!force && syncKey === lastAppliedFeeSyncKey.value) return
  lastAppliedFeeSyncKey.value = syncKey
  const volumeText = activeVolumes.value.join('\n')
  const presetFields = currentTemplate.value.queryPreset.feeFields
  feeInitialValues.value = {
    ...presetFields,
    case_volume: volumeText
  }
  feeInitialToken.value += 1
}

function onFeeSelectionChange(rows: FeeSearchRow[]): void {
  selectedFeeRows.value = rows
}

// 切换模板时自动更新文件管理预填、费用查询预填、表头默认值及默认审核/银行费
watch(selectedTemplateId, nextId => {
  const tpl = BILLING_TEMPLATES.find(t => t.id === nextId) ?? BILLING_TEMPLATES[0]
  headerValues.value = defaultHeaders(nextId)
  billingOptions.value = { ...tpl.queryPreset.defaultOptions }
  fileSeed.value = { ...tpl.queryPreset.fileFields }
  fileSeedToken.value += 1
  // 立即把模板对应的费用查询条件（涉外=第三方费用；PCT=官费+我方代理费）同步到步骤 2
  const nextFeePatch: Record<string, string> = {
    ...tpl.queryPreset.feeFields,
    ...(activeVolumes.value.length ? { case_volume: activeVolumes.value.join('\n') } : {})
  }
  feeInitialValues.value = { ...feeInitialValues.value, ...nextFeePatch }
  feeInitialToken.value += 1
  lastAppliedFeeSyncKey.value = buildFeeSyncKey()
})

// ---------------------------------------------------------------- 步骤 3：请款单导出与央行汇率
const ratesLoading = ref(false)
const ratesDate = ref('')
const ratesSourceUrl = ref('')
const pbcPerCny = ref<Record<string, number>>({})
const customRates = ref<Record<string, number>>({})
const clearedRates = ref<Record<string, boolean>>({})
const ratesError = ref('')

const effectiveRates = computed<Record<string, number>>(() => {
  const out: Record<string, number> = { CNY: 1 }
  for (const [code, val] of Object.entries(pbcPerCny.value)) {
    if (!clearedRates.value[code] && Number.isFinite(val) && val > 0) out[code] = val
  }
  for (const [code, val] of Object.entries(customRates.value)) {
    if (!clearedRates.value[code] && Number.isFinite(val) && val > 0) out[code] = val
  }
  return out
})

const involvedCurrencies = computed(() => {
  const codes = new Set<string>()
  for (const row of selectedFeeRows.value) {
    const c = normalizeCurrency(row.currency)
    if (c) codes.add(c)
  }
  for (const c of ['USD', 'EUR', 'JPY', 'GBP', 'CHF', 'HKD']) codes.add(c)
  return [...codes].filter(c => c !== 'CNY')
})

function formatRate(val: number): string {
  return val < 0.1 ? val.toFixed(6) : val.toFixed(4)
}

async function loadPbcRates(): Promise<void> {
  ratesLoading.value = true
  ratesError.value = ''
  try {
    const data: PbcRates = await fetchPbcRates()
    ratesDate.value = data.date
    ratesSourceUrl.value = data.sourceUrl
    pbcPerCny.value = { ...data.perCny }
    // 新拉到央行基准后，保留用户手工填写值，只解除此前被清空但现已获取的标记
    clearedRates.value = {}
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
  if (!ratesDate.value && !ratesLoading.value) {
    void loadPbcRates()
  }
}

// 对账汇总信息
const reconciliationInfo = computed(() => {
  const caseSet = new Set<string>()
  let unrequestedCount = 0
  let requestedCount = 0
  for (const row of selectedFeeRows.value) {
    if (row.caseVolume) caseSet.add(row.caseVolume)
    const st = String(row.requestStatus || '')
    if (st.includes('已请款')) requestedCount++
    else unrequestedCount++
  }
  const allCases = [...caseSet]
  const matchedCases: string[] = []
  const unmatchedCases: string[] = []
  for (const vol of allCases) {
    if (billMap.value[vol] && billMap.value[vol].length > 0) {
      matchedCases.push(vol)
    } else {
      unmatchedCases.push(vol)
    }
  }
  return {
    totalRows: selectedFeeRows.value.length,
    totalCases: allCases.length,
    unrequestedCount,
    requestedCount,
    matchedCasesCount: matchedCases.length,
    unmatchedCases
  }
})

// 执行导出
const exporting = ref(false)
const exportResultNotice = ref('')
const exportWarnings = ref<string[]>([])

async function doExportExcel(): Promise<void> {
  if (selectedFeeRows.value.length === 0) {
    exportResultNotice.value = '没有勾选任何费用记录，无法导出。'
    return
  }
  const missing = missingCurrencies(selectedFeeRows.value, effectiveRates.value)
  if (missing.length > 0) {
    exportResultNotice.value = `缺少以下币种的汇率：${missing.join('、')}，请重新读取央行汇率或在上方汇率表中手工填写。`
    return
  }

  exporting.value = true
  exportResultNotice.value = '正在加载内置模板并生成 Excel（保留原有公式）…'
  exportWarnings.value = []

  try {
    const rawBytes = await loadBillingTemplate(selectedTemplateId.value)
    const result = await fillBillingTemplate(selectedTemplateId.value, rawBytes, {
      rows: selectedFeeRows.value,
      bills: billMap.value,
      rates: effectiveRates.value,
      rateDate: ratesDate.value || formatLocalDate(new Date()),
      headers: headerValues.value,
      options: billingOptions.value,
      today: new Date()
    })

    exportWarnings.value = result.warnings

    const blob = new Blob([result.bytes as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = result.fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)

    exportResultNotice.value = `请款单已成功导出并触发下载：${result.fileName}（共填入 ${result.blockCount} 个事项块/案卷）。`
  } catch (err) {
    exportResultNotice.value = err instanceof Error ? err.message : '请款表生成失败'
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  if (props.isActive) {
    void loadPbcRates()
  }
})
</script>

<template>
  <div class="billing-workflow-page">
    <PageHead
      v-if="!embedded"
      title="请款工作流"
      desc="先选请款模板智能预填查询条件，涉外抓账单查第三方费用、PCT 查官费与我方代理费，保留 Excel 原公式导出。"
      :art="bg('让重复工作变简单.png')"
    />

    <!-- 前置模板选择器：先选模板，再按模板智能预填文件管理与费用查询条件 -->
    <section class="template-preset-bar card" aria-label="选择请款单模板">
      <div class="preset-head">
        <strong>请款模板（先选模板，自动联动预填下方查询条件）</strong>
        <span class="preset-badge">
          费用查询自动预填：专利 · 内-外 · {{ currentTemplate.queryPreset.feeClassLabel }}
        </span>
      </div>
      <div class="template-selector-radios">
        <label
          v-for="tpl in BILLING_TEMPLATES"
          :key="tpl.id"
          class="template-radio-item"
          :class="{ selected: selectedTemplateId === tpl.id }"
        >
          <input
            v-model="selectedTemplateId"
            type="radio"
            name="billing_tpl_top"
            :value="tpl.id"
          />
          <div class="tpl-content">
            <div class="tpl-title-line">
              <b>{{ tpl.label }}</b>
              <span class="tpl-fee-tag">{{ tpl.queryPreset.feeClassLabel }}</span>
            </div>
            <small>{{ tpl.summary }}</small>
          </div>
        </label>
      </div>
    </section>

    <!-- Workflow Progress Bar -->
    <nav class="flow-steps-bar card" aria-label="请款流程导航">
      <div class="steps-wrapper">
        <button
          type="button"
          class="step-item"
          :class="{ active: currentStep === 1, done: currentStep > 1 }"
          @click="setStep(1)"
        >
          <span class="step-num">1</span>
          <div class="step-info">
            <b class="step-title">
              文件管理{{ currentTemplate.queryPreset.fileStepOptional ? '（可选）' : '（账单抓取）' }}
            </b>
            <span class="step-desc">
              {{ recognizedBillsCount ? `已识别 ${recognizedBillsCount} 份账单 · ${activeVolumes.length} 个文号` : '自动预填内到外与付款INVOICE' }}
            </span>
          </div>
        </button>

        <span class="step-divider" aria-hidden="true">→</span>

        <button
          type="button"
          class="step-item"
          :class="{ active: currentStep === 2, done: currentStep > 2 }"
          @click="setStep(2)"
        >
          <span class="step-num">2</span>
          <div class="step-info">
            <b class="step-title">费用查询（{{ currentTemplate.queryPreset.feeClassLabel }}）</b>
            <span class="step-desc">
              {{ selectedFeeRows.length ? `已勾选 ${selectedFeeRows.length} 笔费用` : '自动预填条件 · 人工检索勾选' }}
            </span>
          </div>
        </button>

        <span class="step-divider" aria-hidden="true">→</span>

        <button
          type="button"
          class="step-item"
          :class="{ active: currentStep === 3, done: false }"
          @click="setStep(3)"
        >
          <span class="step-num">3</span>
          <div class="step-info">
            <b class="step-title">请款单填表导出</b>
            <span class="step-desc">央行汇率中间价 · {{ currentTemplate.label }}</span>
          </div>
        </button>
      </div>

      <div class="step-quick-actions">
        <button
          v-if="currentStep === 1"
          type="button"
          class="solid next-btn"
          @click="setStep(2)"
        >
          {{
            activeVolumes.length > 0
              ? `进入费用查询 (带入 ${activeVolumes.length} 个文号) →`
              : currentTemplate.queryPreset.fileStepOptional
                ? '跳过文件管理，直接查 PCT 费用 →'
                : '直接进入费用查询 →'
          }}
        </button>
        <button
          v-else-if="currentStep === 2"
          type="button"
          class="solid next-btn"
          :disabled="selectedFeeRows.length === 0"
          @click="setStep(3)"
        >
          进入请款单导出 (已选 {{ selectedFeeRows.length }} 笔费用) →
        </button>
        <button
          v-else
          type="button"
          class="ghost back-btn"
          @click="setStep(2)"
        >
          ← 返回费用查询调整
        </button>
      </div>
    </nav>

    <p v-if="stepNotice" class="step-notice-alert" role="alert">{{ stepNotice }}</p>

    <!-- ============================================================== 步骤 1 -->
    <section v-show="currentStep === 1" class="step-section step-1-section">
      <div class="workflow-guide-banner card">
        <div class="guide-header">
          <strong>第一步：查询并抓取账单（提取我方文号）</strong>
          <span class="badge-pill">
            {{ currentTemplate.queryPreset.fileStepOptional ? 'PCT 模式可跳过' : '自动预填中' }}
          </span>
        </div>
        <p class="guide-text">
          <template v-if="currentTemplate.queryPreset.fileStepOptional">
            当前为 <b>{{ currentTemplate.label }}</b>（导出 <b>{{ currentTemplate.queryPreset.feeClassLabel }}</b>）。
            如无需先从文件管理提取文号，可直接点击右上角「跳过文件管理，直接查 PCT 费用」进入步骤 2 检索；如需按账单筛选文号，也可在此查询。
          </template>
          <template v-else>
            系统已自动为你预填了查询条件：<b>案件流向 = 从内到外</b>、<b>文件描述 = 付款INVOICE</b>。<br />
            确认查询日期范围后点击「查询」，查询完成将<b>自动执行「只选所有账单」</b>，并发扫描全部翻页、缓存账单元数据并自动提取我方文号。
          </template>
        </p>
        <div class="guide-actions">
          <button type="button" class="solid action-btn" @click="triggerSelectAllBills">
            重新执行只选所有账单
          </button>
          <button
            v-if="currentTemplate.queryPreset.fileStepOptional"
            type="button"
            class="ghost"
            @click="setStep(2)"
          >
            跳过此步，直接查 PCT 官费与我方代理费 →
          </button>
        </div>
      </div>

      <!-- 提取文号统计面板 -->
      <div v-if="activeVolumes.length > 0 || excludedVolumes.length > 0" class="extracted-volumes-card card">
        <div class="volumes-head">
          <span class="title">已提取的我方文号清单（共 {{ activeVolumes.length }} 个）</span>
          <span class="sub">将作为下一步费用查询的文号过滤条件，点击 × 可排除不需要请款的文号</span>
          <button
            v-if="excludedVolumes.length > 0"
            type="button"
            class="text-button"
            @click="restoreExcludedVolumes"
          >
            恢复已排除 ({{ excludedVolumes.length }})
          </button>
        </div>
        <div class="volume-tags-flow">
          <span v-for="vol in activeVolumes" :key="vol" class="volume-tag">
            {{ vol }}
            <button
              type="button"
              class="tag-del"
              title="从本次请款文号清单中移除"
              @click="removeVolume(vol)"
            >×</button>
          </span>
        </div>
        <div class="add-custom-volume-row">
          <input
            v-model="customVolumeInput"
            type="text"
            placeholder="如需补充文号，在此输入（空格或换行隔开）"
            @keydown.enter.prevent="addCustomVolume"
          />
          <button type="button" class="ghost" @click="addCustomVolume">添加文号</button>
        </div>
      </div>

      <!-- 嵌入文件管理查询面板 -->
      <FileSearchPanel
        ref="filePanelRef"
        v-model:selected="fileSelection"
        :page-origin="connection.easyOrigin"
        :show-session="false"
        recovery-surface="billing-files"
        :auto-select-bills="true"
        :seed="fileSeed"
        :seed-token="fileSeedToken"
      />
    </section>

    <!-- ============================================================== 步骤 2 -->
    <section v-show="currentStep === 2" class="step-section step-2-section">
      <div class="workflow-guide-banner card">
        <div class="guide-header">
          <strong>第二步：检索{{ currentTemplate.queryPreset.feeClassLabel }}并人工勾选</strong>
          <span class="badge-pill">{{ currentTemplate.label }}</span>
        </div>
        <p class="guide-text">
          已按「<b>{{ currentTemplate.label }}</b>」自动预填：
          <b>案件类型 = 专利</b>、<b>案件流向 = 内-外</b>、<b>费用类型 = {{ currentTemplate.queryPreset.feeClassLabel }}</b>
          <template v-if="activeVolumes.length > 0">
            ，并带入步骤 1 提取的 <b>{{ activeVolumes.length }} 个文号</b>
          </template>
          <template v-else>
            （未带入文号，请按客户/日期/文号等条件自行检索）
          </template>。<br />
          请在下方点击「查询」，然后在表格中<b>勾选</b>要纳入请款单的费用记录（翻页已选记录会自动保留）。
        </p>
        <div class="selection-status-strip">
          <div class="strip-left">
            <span>当前已勾选：<b>{{ selectedFeeRows.length }}</b> 笔费用记录</span>
            <button type="button" class="text-button" @click="syncFeeQueryIfNeeded(true)">
              重新同步模板条件与步骤 1 文号
            </button>
          </div>
          <button
            type="button"
            class="solid"
            :disabled="selectedFeeRows.length === 0"
            @click="setStep(3)"
          >
            确认并进入下一步导出请款单 →
          </button>
        </div>
      </div>

      <!-- 嵌入费用查询组件 -->
      <FeeSearchQuery
        ref="feeQueryRef"
        :user-id="connection.operatorId"
        :can-search="ready"
        :initial-values="feeInitialValues"
        :initial-token="feeInitialToken"
        @selection-change="onFeeSelectionChange"
      />
    </section>

    <!-- ============================================================== 步骤 3 -->
    <section v-show="currentStep === 3" class="step-section step-3-section">
      <!-- 央行汇率卡片 -->
      <div class="pbc-rates-card card">
        <div class="card-title-row">
          <strong>中国人民银行官网 · 汇率中间价</strong>
          <div class="actions">
            <span v-if="ratesLoading" class="hint">正在连接央行读取…</span>
            <span v-else-if="ratesDate" class="date-badge">公布日期：{{ ratesDate }}</span>
            <button
              type="button"
              class="refresh-rates-btn"
              :disabled="ratesLoading"
              @click="loadPbcRates"
            >
              {{ ratesLoading ? '正在抓取…' : '↻ 重新抓取最新汇率' }}
            </button>
          </div>
        </div>
        <p v-if="ratesError" class="error-line">{{ ratesError }}</p>
        <p class="rates-source-hint">
          来源：<a :href="ratesSourceUrl || PBC_INDEX_URL" target="_blank" rel="noopener noreferrer">中国人民银行外汇市场公布表</a>。
          可直接在下方表格修改汇率数值进行微调，将按最终数值自动计算折算人民币金额。
        </p>

        <div class="rates-table-wrapper">
          <table class="rates-table">
            <thead>
              <tr>
                <th>外币币种</th>
                <th>央行公布中间价 (1外币=?)</th>
                <th>当前使用汇率 (可修改)</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cur in involvedCurrencies" :key="cur">
                <td class="cur-code"><b>{{ cur }}</b></td>
                <td>{{ pbcPerCny[cur] ? `¥ ${formatRate(pbcPerCny[cur])}` : '未获取 / 需手动填写' }}</td>
                <td>
                  <input
                    type="number"
                    step="0.0001"
                    class="rate-input"
                    :value="effectiveRates[cur] ?? ''"
                    placeholder="请输入汇率"
                    @input="updateRate(cur, ($event.target as HTMLInputElement).value)"
                  />
                </td>
                <td>
                  <button
                    v-if="customRates[cur] !== undefined || clearedRates[cur]"
                    type="button"
                    class="text-button reset-btn"
                    :disabled="!pbcPerCny[cur]"
                    @click="resetRate(cur)"
                  >
                    恢复央行值
                  </button>
                  <span v-else-if="pbcPerCny[cur]" class="muted">央行基准</span>
                  <span v-else class="muted">待填写</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 模板表头参数与专项费用设置 -->
      <div class="template-choice-card card">
        <div class="card-title-row">
          <strong>当前模板参数 · {{ currentTemplate.label }}</strong>
          <span class="date-badge">{{ currentTemplate.queryPreset.feeClassLabel }}</span>
        </div>

        <div class="template-params-grid">
          <div v-for="hdr in currentTemplate.headers" :key="hdr.key" class="param-field">
            <label>{{ hdr.label }}</label>
            <input v-model="headerValues[hdr.key]" type="text" />
          </div>

          <!-- 美的涉外专属：审核费与银行费（默认对齐原模板：100 / 250） -->
          <template v-if="selectedTemplateId === 'midea-foreign'">
            <div class="param-field">
              <label>账单审核费（元/事项）</label>
              <input v-model.number="billingOptions.reviewFee" type="number" step="10" />
            </div>
            <div class="param-field">
              <label>银行费（元/事项）</label>
              <input v-model.number="billingOptions.bankFee" type="number" step="10" />
            </div>
          </template>
        </div>
      </div>

      <!-- 最终导出操作卡片 -->
      <div class="export-execute-card card">
        <div class="summary-line">
          <span>待填入费用：<b>{{ selectedFeeRows.length }}</b> 笔（未请款 <b>{{ reconciliationInfo.unrequestedCount }}</b>，已请款 <b>{{ reconciliationInfo.requestedCount }}</b>）</span>
          <span>涉及案卷：<b>{{ reconciliationInfo.totalCases }}</b> 个（匹配账单 <b>{{ reconciliationInfo.matchedCasesCount }}</b>，未匹配 <b>{{ reconciliationInfo.unmatchedCases.length }}</b>）</span>
          <span>目标模板：<b>{{ currentTemplate.label }}</b></span>
        </div>

        <p v-if="reconciliationInfo.requestedCount > 0" class="reconcile-warn requested-warn">
          ⚠️ 注意：当前勾选的数据中包含 <b>{{ reconciliationInfo.requestedCount }}</b> 笔「已请款」费用，导出前请核对是否确认重复请款。
        </p>
        <p v-if="reconciliationInfo.unmatchedCases.length > 0 && selectedTemplateId !== 'midea-pct'" class="reconcile-warn bill-missing-warn">
          ℹ️ 提示：有 <b>{{ reconciliationInfo.unmatchedCases.length }}</b> 个案卷未在步骤 1 匹配到账单（{{ reconciliationInfo.unmatchedCases.slice(0, 4).join('、') }}{{ reconciliationInfo.unmatchedCases.length > 4 ? ' 等' : '' }}），导出时其海外账单日将留空。
        </p>

        <div class="button-row">
          <button
            type="button"
            class="solid export-btn"
            :disabled="exporting || selectedFeeRows.length === 0"
            @click="doExportExcel"
          >
            {{ exporting ? '正在填表并生成 Excel…' : '导出 Excel 请款表 (100%保留公式)' }}
          </button>
        </div>

        <p v-if="exportResultNotice" class="export-notice-text" :class="{ error: exportResultNotice.includes('失败') || exportResultNotice.includes('缺少') }">
          {{ exportResultNotice }}
        </p>

        <div v-if="exportWarnings.length" class="warnings-box">
          <b>提示信息：</b>
          <ul>
            <li v-for="(warn, idx) in exportWarnings" :key="idx">{{ warn }}</li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.billing-workflow-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.template-preset-bar {
  padding: 14px 20px;
  background: var(--bg-card, #ffffff);
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.template-preset-bar .preset-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 14px;
}

.template-preset-bar .preset-badge {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--brand-soft, #fff5f8);
  color: var(--brand, #ff5d98);
  font-weight: 600;
}

.flow-steps-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 20px;
  background: var(--bg-card, #ffffff);
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.flow-steps-bar .steps-wrapper {
  display: flex;
  align-items: center;
  gap: 16px;
}

.flow-steps-bar .step-divider {
  color: var(--text-muted, #a0aec0);
  font-size: 16px;
}

.flow-steps-bar .step-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 6px 12px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.flow-steps-bar .step-item:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));
}

.flow-steps-bar .step-item .step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-tertiary, #edf2f7);
  color: var(--text-muted, #718096);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
}

.flow-steps-bar .step-item .step-info {
  display: flex;
  flex-direction: column;
}

.flow-steps-bar .step-item .step-info .step-title {
  font-size: 14px;
  color: var(--text-primary, #2d3748);
}

.flow-steps-bar .step-item .step-info .step-desc {
  font-size: 11px;
  color: var(--text-muted, #a0aec0);
}

.flow-steps-bar .step-item.active {
  background: var(--brand-soft, #fff5f8);
}

.flow-steps-bar .step-item.active .step-num {
  background: var(--brand, #ff5d98);
  color: #ffffff;
}

.flow-steps-bar .step-item.active .step-title {
  color: var(--brand, #ff5d98);
  font-weight: 700;
}

.flow-steps-bar .step-item.done .step-num {
  background: #3dce9a;
  color: #ffffff;
}

.flow-steps-bar .step-quick-actions {
  display: flex;
  gap: 10px;
}

.flow-steps-bar .step-quick-actions .next-btn {
  padding: 8px 16px;
  font-weight: 600;
}

.flow-steps-bar .step-quick-actions .back-btn {
  padding: 8px 14px;
}

.step-notice-alert {
  padding: 10px 14px;
  background: #fff5f5;
  border-left: 4px solid #e53e3e;
  color: #c53030;
  border-radius: 6px;
  font-size: 13px;
  margin: 0;
}

.workflow-guide-banner {
  padding: 16px 20px;
  border-left: 4px solid var(--brand, #ff5d98);
  background: #fafafa;
  margin-bottom: 14px;
}

.workflow-guide-banner .guide-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  margin-bottom: 6px;
}

.workflow-guide-banner .guide-header .badge-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #e2e8f0;
  color: #4a5568;
}

.workflow-guide-banner .guide-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary, #4a5568);
  margin: 0 0 10px 0;
}

.workflow-guide-banner .guide-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
}

.workflow-guide-banner .selection-status-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px dashed #e2e8f0;
  font-size: 14px;
}

.workflow-guide-banner .selection-status-strip .strip-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.extracted-volumes-card {
  padding: 14px 18px;
  margin-bottom: 14px;
  background: #fdfdfd;
}

.extracted-volumes-card .volumes-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 10px;
}

.extracted-volumes-card .volumes-head .title {
  font-weight: 700;
  font-size: 14px;
  color: #2d3748;
}

.extracted-volumes-card .volumes-head .sub {
  font-size: 12px;
  color: #718096;
}

.extracted-volumes-card .volume-tags-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.extracted-volumes-card .volume-tags-flow .volume-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  background: #ebf8ff;
  color: #2b6cb0;
  font-size: 12px;
  font-family: monospace;
  font-weight: 600;
}

.extracted-volumes-card .volume-tags-flow .volume-tag .tag-del {
  background: transparent;
  border: none;
  color: #e53e3e;
  font-weight: bold;
  cursor: pointer;
  padding: 0;
}

.extracted-volumes-card .add-custom-volume-row {
  display: flex;
  gap: 10px;
}

.extracted-volumes-card .add-custom-volume-row input {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
}

/* 步骤 3 样式 */
.pbc-rates-card,
.template-choice-card,
.export-execute-card {
  padding: 16px 20px;
  margin-bottom: 16px;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 15px;
}

.card-title-row .actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 12px;
}

.card-title-row .actions > * {
  white-space: nowrap;
  flex-shrink: 0;
  writing-mode: horizontal-tb;
}

.card-title-row .refresh-rates-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: max-content;
  padding: 5px 14px;
  border: 1px solid #f3c2d4;
  border-radius: 999px;
  background: #fff6fa;
  color: #d9578c;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
}

.card-title-row .refresh-rates-btn:hover:not(:disabled) {
  background: #ffe9f2;
}

.card-title-row .refresh-rates-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.card-title-row .date-badge {
  font-size: 12px;
  color: #4a5568;
  background: #edf2f7;
  padding: 3px 8px;
  border-radius: 6px;
}

.error-line {
  padding: 8px 12px;
  margin: 0 0 10px 0;
  border-radius: 6px;
  background: #fff5f5;
  border-left: 3px solid #e53e3e;
  color: #c53030;
  font-size: 12px;
}

.rates-source-hint {
  font-size: 12px;
  color: #718096;
  margin: 0 0 12px 0;
}

.rates-source-hint a {
  color: var(--brand, #ff5d98);
  text-decoration: underline;
}

.rates-table-wrapper {
  overflow-x: auto;
}

.rates-table-wrapper .rates-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.rates-table-wrapper .rates-table th,
.rates-table-wrapper .rates-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #edf2f7;
  text-align: left;
}

.rates-table-wrapper .rates-table th {
  background: #f7fafc;
  color: #4a5568;
  font-weight: 600;
}

.rates-table-wrapper .rates-table .cur-code {
  font-family: monospace;
  font-size: 14px;
}

.rates-table-wrapper .rates-table .rate-input {
  width: 120px;
  padding: 4px 8px;
  border: 1px solid #cbd5e0;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
}

.rates-table-wrapper .rates-table .reset-btn {
  color: var(--brand, #ff5d98);
}

.rates-table-wrapper .rates-table .muted {
  color: #a0aec0;
  font-size: 12px;
}

.template-selector-radios {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.template-selector-radios .template-radio-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.template-selector-radios .template-radio-item:hover {
  border-color: #cbd5e0;
  background: #fdfdfd;
}

.template-selector-radios .template-radio-item.selected {
  border-color: var(--brand, #ff5d98);
  background: #fffdfd;
}

.template-selector-radios .template-radio-item input {
  margin-top: 3px;
}

.template-selector-radios .template-radio-item .tpl-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.template-selector-radios .template-radio-item .tpl-content .tpl-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.template-selector-radios .template-radio-item .tpl-content b {
  font-size: 14px;
  color: #2d3748;
}

.template-selector-radios .template-radio-item .tpl-content .tpl-fee-tag {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #edf2f7;
  color: #4a5568;
  font-weight: 600;
}

.template-selector-radios .template-radio-item.selected .tpl-content .tpl-fee-tag {
  background: var(--brand-soft, #fff5f8);
  color: var(--brand, #ff5d98);
}

.template-selector-radios .template-radio-item .tpl-content small {
  font-size: 12px;
  color: #718096;
  line-height: 1.4;
}

.template-params-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  background: #f8fafc;
  padding: 14px;
  border-radius: 8px;
}

.template-params-grid .param-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.template-params-grid .param-field label {
  font-size: 12px;
  font-weight: 600;
  color: #4a5568;
}

.template-params-grid .param-field input {
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  background: #ffffff;
}

.export-execute-card .summary-line {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  font-size: 14px;
  margin-bottom: 16px;
  color: #4a5568;
}

.export-execute-card .summary-line b {
  color: #2d3748;
}

.reconcile-warn {
  margin: 0 0 10px 0;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.4;
}
.reconcile-warn.requested-warn {
  background: #fff5f5;
  color: #c53030;
  border-left: 3px solid #e53e3e;
}
.reconcile-warn.bill-missing-warn {
  background: #fffaf0;
  color: #c05621;
  border-left: 3px solid #dd6b20;
}

.export-execute-card .export-btn {
  padding: 12px 28px;
  font-size: 15px;
  font-weight: 700;
}

.export-execute-card .export-notice-text {
  margin-top: 14px;
  font-size: 14px;
  color: #276749;
  font-weight: 600;
}

.export-execute-card .export-notice-text.error {
  color: #c53030;
}

.export-execute-card .warnings-box {
  margin-top: 12px;
  padding: 10px 14px;
  background: #fffaf0;
  border-left: 3px solid #dd6b20;
  border-radius: 4px;
  font-size: 12px;
  color: #7b341e;
}

.export-execute-card .warnings-box ul {
  margin: 4px 0 0 16px;
  padding: 0;
}
</style>
