<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageHead from '../../shell/components/PageHead.vue'
import { bg } from '../../shell/assets'
import FileSearchPanel from '../../floating/FileSearchPanel.vue'
import FeeSearchQuery from '../components/FeeSearchQuery.vue'
import type { FeeSearchRow } from '../../api/fee-search-types'
import { useBillingWorkflow } from '../composables/useBillingWorkflow'
import { confirmDialog } from '../dialog'

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

const {
  billingTemplates: BILLING_TEMPLATES,
  pbcIndexUrl: PBC_INDEX_URL,
  formatLocalDate,
  confirmedScope,
  billingScope,
  billingOwner,
  billingFileSurface,
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
  recoveryNotice
} = useBillingWorkflow({ isActive: () => props.isActive })

const VOLUME_PREVIEW_LIMIT = 40
const VOLUME_EXPAND_STEP = 100
const volumeDisplayLimit = ref(VOLUME_PREVIEW_LIMIT)
const visibleVolumes = computed(() =>
  activeVolumes.value.length <= volumeDisplayLimit.value
    ? activeVolumes.value
    : activeVolumes.value.slice(0, volumeDisplayLimit.value),
)
const remainingVolumeCount = computed(() =>
  Math.max(0, activeVolumes.value.length - visibleVolumes.value.length),
)
watch(
  () => activeVolumes.value.length,
  len => {
    if (len <= VOLUME_PREVIEW_LIMIT && volumeDisplayLimit.value !== VOLUME_PREVIEW_LIMIT) {
      volumeDisplayLimit.value = VOLUME_PREVIEW_LIMIT
    }
  },
)
function expandMoreVolumes(): void {
  volumeDisplayLimit.value = Math.min(
    activeVolumes.value.length,
    volumeDisplayLimit.value + VOLUME_EXPAND_STEP,
  )
}
function collapseVolumes(): void {
  volumeDisplayLimit.value = VOLUME_PREVIEW_LIMIT
}

const volumeDetailMap = computed(() => {
  const cache = new Map<string, string>()
  for (const [vol, matched] of filesByVolume.value) {
    const names = matched.slice(0, 5).map(item => item.fileName).filter(Boolean)
    const extra = matched.length > 5 ? `\n…等共 ${matched.length} 个文件` : ''
    cache.set(vol, `我方文号：${vol}\n已选账单：${matched.length} 个\n${names.join('\n')}${extra}`)
  }
  return cache
})

function volumeDetail(vol: string): string {
  return volumeDetailMap.value.get(vol) ?? `我方文号：${vol}\n来源：手工添加`
}

const pctExceptionDetailCache = new WeakMap<FeeSearchRow, { reason: string; text: string }>()
function pctExceptionDetail(row: FeeSearchRow, reason: string): string {
  const cached = pctExceptionDetailCache.get(row)
  if (cached && cached.reason === reason) return cached.text
  const text = [
    `待核对原因：${reason}`,
    row.customerName ? `客户名称：${row.customerName}` : '',
    row.caseVolume ? `我方文号：${row.caseVolume}` : '',
    row.caseVolumeCustomer ? `客户文号：${row.caseVolumeCustomer}` : '',
    row.caseName ? `案件名称：${row.caseName}` : '',
    row.feeType ? `费用名称：${row.feeType}` : '',
    `金额：${row.amount} ${row.currency}`,
    row.ctrlProc ? `处理事项：${row.ctrlProc}` : '',
    row.requestStatus ? `请款状态：${row.requestStatus}` : ''
  ].filter(Boolean).join('\n')
  pctExceptionDetailCache.set(row, { reason, text })
  return text
}

const step3SectionRef = ref<HTMLElement | null>(null)

const hasPendingConfirmCheck = computed(
  () =>
    (pctExportExceptions.value.length > 0 && !confirmPctExceptions.value) ||
    (reconciliationInfo.value.requestedCount > 0 && !confirmExistingFees.value),
)

const exportButtonLabel = computed(() => {
  if (exporting.value) {
    if (!exportProgress.value) return '正在生成 Excel…'
    const downloaded = exportProgress.value.downloadedDone ?? exportProgress.value.done
    const generated = exportProgress.value.generatedDone ?? exportProgress.value.done
    if (exportProgress.value.phase === 'generating' && downloaded === 0) {
      return `正在并发生成 ${generated}/${exportProgress.value.total}…`
    }
    return `正在按客户批量导出 ${downloaded}/${exportProgress.value.total}…`
  }
  if (!allowMixedCustomers.value && selectedCustomerGroups.value.length > 1) {
    return `批量导出 ${selectedCustomerGroups.value.length} 份 Excel 请款表`
  }
  return '导出 Excel 请款表'
})

function scrollToExportConfirm(): void {
  const target = step3SectionRef.value?.querySelector<HTMLElement>('.reconcile-warn')
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function handleExportClick(): Promise<void> {
  if (exportDisabled.value || exporting.value) return
  if (pctExportExceptions.value.length > 0) {
    const confirmed = await confirmDialog({
      title: `有 ${pctExportExceptions.value.length} 笔未请款 PCT 费用未纳入本次导出`,
      message: '以下未请款费用因模板无对应 PCT 官费列或客户待核对，本次不会纳入导出，需要另行处理。确认继续导出其余可归类费用吗？',
      warn: true,
      table: {
        headers: ['客户名称', '我方文号', '费用名称', '金额', '原因'],
        rows: pctExportExceptions.value.map(({ row, reason }) => [
          row.customerName || '客户待核对',
          row.caseVolume || '-',
          row.feeType || row.feeId,
          `${row.amount} ${row.currency}`,
          reason,
        ]),
      },
      confirmLabel: '确认继续导出',
      cancelLabel: '取消',
    })
    if (!confirmed || exportDisabled.value || exporting.value) return
  }
  await doExportExcel()
}

function batchItemStatusLabel(status: string): string {
  switch (status) {
    case 'download_completed':
      return '已确认下载完成'
    case 'download_started':
      return '已触发下载（待确认落盘）'
    case 'generated':
      return '已生成工作簿'
    case 'download_interrupted':
      return '下载已中断'
    case 'unknown':
      return '状态待核对'
    default:
      return '导出失败'
  }
}
</script>

<template>
  <div class="billing-workflow-page" :inert="restoring">
    <PageHead
      v-if="!embedded"
      title="请款工作流"
      desc="按模板带入查询条件，核对账单和费用后导出 Excel。"
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
    <nav ref="stepNavigation" class="flow-steps-bar card" aria-label="请款流程导航">
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
          :disabled="!canAdvanceFromFees"
          @click="setStep(3)"
        >
          进入请款单导出 (已选 {{ selectedFeeRows.length }} 笔费用) →
        </button>
        <template v-else>
          <button type="button" class="ghost back-btn" @click="setStep(2)">← 返回费用查询调整</button>
          <div class="top-customer-mode-switch" role="group" aria-label="客户分表或合表导出">
            <span class="mode-thumb" :class="{ merged: allowMixedCustomers }" aria-hidden="true"></span>
            <button
              type="button"
              class="mode-opt"
              :class="{ active: !allowMixedCustomers }"
              :aria-pressed="!allowMixedCustomers"
              :disabled="exporting"
              v-hint="'默认：多客户按客户分表批量并发导出（文件名自动带客户名）'"
              @click="allowMixedCustomers = false"
            >
              按客户分表
            </button>
            <button
              type="button"
              class="mode-opt"
              :class="{ active: allowMixedCustomers }"
              :aria-pressed="allowMixedCustomers"
              :disabled="exporting"
              v-hint="'允许不同客户合并进入同一张请款表导出'"
              @click="allowMixedCustomers = true"
            >
              合并单表
            </button>
          </div>
          <button
            type="button"
            class="solid next-btn export-step-btn"
            :disabled="exportDisabled"
            v-hint="exportDisabledReason"
            @click="handleExportClick"
          >
            {{ exportButtonLabel }}
          </button>
        </template>
      </div>
    </nav>

    <div
      v-if="currentStep === 1 && filePanelRef?.hasRecoveredQuery"
      class="step-notice-alert recovered-bill-notice"
      :class="{ 'is-busy': Boolean(filePanelRef.refreshing) }"
    >
      <span role="status">
        {{
          filePanelRef.refreshing
            ? '正在刷新验证已恢复的账单查询，请稍候…'
            : filePanelRef.searchError
              ? `刷新验证失败：${filePanelRef.searchError}`
              : '已恢复账单查询，刷新验证后可继续。'
        }}
      </span>
      <button
        type="button"
        class="solid"
        :disabled="!confirmedScope || !filePanelRef.canRefresh"
        :aria-busy="Boolean(filePanelRef.refreshing)"
        @click="stepNotice = ''; filePanelRef?.refresh(false)"
      >
        {{ filePanelRef.refreshing ? '正在刷新验证…' : '刷新验证账单' }}
      </button>
    </div>
    <p v-else-if="stepNotice && !noticeInResults" class="step-notice-alert" role="alert">
      {{ stepNotice }}
      <button
        v-if="currentStep !== 1 && filePanelRef?.hasRecoveredQuery && stepNotice.includes('刷新验证')"
        type="button"
        class="text-button"
        @click="setStep(1)"
      >去步骤 1 刷新验证</button>
    </p>
    <p v-if="recoveryNotice" class="step-notice-alert" role="status">{{ recoveryNotice }}</p>
    <p v-else-if="billingScope && !confirmedScope" class="step-notice-alert" role="status">请款进度已保留，恢复同一 EASY 账号连接后可继续。</p>

    <!-- ============================================================== 步骤 1 -->
    <section
      class="step-section step-1-section"
      :class="{ 'is-hidden-pane': currentStep !== 1 }"
      :inert="currentStep !== 1"
      :aria-hidden="currentStep !== 1 ? 'true' : undefined"
    >
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
          <button
            v-if="volumeDisplayLimit > VOLUME_PREVIEW_LIMIT && activeVolumes.length > VOLUME_PREVIEW_LIMIT"
            type="button"
            class="text-button"
            @click="collapseVolumes"
          >
            收起至前 {{ VOLUME_PREVIEW_LIMIT }} 个
          </button>
          <button
            v-if="remainingVolumeCount > 0"
            type="button"
            class="text-button"
            @click="expandMoreVolumes"
          >
            再展开 {{ Math.min(VOLUME_EXPAND_STEP, remainingVolumeCount) }} 个（共 {{ activeVolumes.length }} 个）
          </button>
        </div>
        <div class="volume-tags-flow">
          <span
            v-for="vol in visibleVolumes"
            :key="vol"
            v-memo="[vol, volumeDetail(vol)]"
            class="volume-tag"
            v-hint="volumeDetail(vol)"
          >
            {{ vol }}
            <button
              type="button"
              class="tag-del"
              v-hint="'从本次请款文号清单中移除'"
              aria-label="从本次请款文号清单中移除"
              @click="removeVolume(vol)"
            >×</button>
          </span>
          <button
            v-if="remainingVolumeCount > 0"
            type="button"
            class="volume-expand-chip"
            @click="expandMoreVolumes"
          >
            还有 {{ remainingVolumeCount }} 个文号，点击展开 {{ Math.min(VOLUME_EXPAND_STEP, remainingVolumeCount) }} 个
          </button>
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
        :key="billingTenantKey"
        ref="filePanelRef"
        v-model:selected="fileSelection"
        :page-origin="billingOwner.origin"
        :workspace-user-id="billingOwner.userId"
        :show-session="false"
        :recovery-surface="billingFileSurface"
        :auto-select-bills="true"
        :seed="fileSeed"
        :seed-token="fileSeedToken"
        @searched="onFileSearch"
      >
        <template #result-actions>
          <span v-if="stepNotice && noticeInResults && currentStep === 1" class="step-notice-alert" role="alert">{{ stepNotice }}</span>
          <button type="button" class="solid billing-result-action" @click="advanceFromResults(2)">
            {{ activeVolumes.length ? `带入 ${activeVolumes.length} 个文号并进入费用查询 →` : '进入费用查询 →' }}
          </button>
        </template>
      </FileSearchPanel>
    </section>

    <!-- ============================================================== 步骤 2 -->
    <section
      class="step-section step-2-section"
      :class="{ 'is-hidden-pane': currentStep !== 2 }"
      :inert="currentStep !== 2"
      :aria-hidden="currentStep !== 2 ? 'true' : undefined"
    >
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
          <template v-if="isMideaPct">请优先用「客户名称」和「处理事项完成日」限定范围。默认勾选美的客户可归类的未请款费用；支持一次勾选多个事业部，步骤 3 默认按客户分表批量并发导出，也可按需合并为一张表。</template>
          请在下方点击「查询」，然后在表格中<b>勾选</b>要纳入请款单的费用记录（翻页已选记录会自动保留）。
        </p>
        <div class="selection-status-strip">
          <span>当前已勾选：<b>{{ selectedFeeRows.length }}</b> 笔费用记录</span>
          <button type="button" class="text-button" @click="syncFeeQueryIfNeeded(true)">
            重新同步模板条件与步骤 1 文号
          </button>
        </div>
      </div>

      <!-- 嵌入费用查询组件 -->
      <FeeSearchQuery
        :key="billingTenantKey"
        ref="feeQueryRef"
        :user-id="billingOwner.userId"
        :can-search="ready"
        :initial-values="feeInitialValues"
        :initial-token="feeInitialToken"
        :default-selection-exclusion="defaultSelectionExclusion"
        :include-translation-word-counts="selectedTemplateId !== 'midea-pct'"
        @searched="onFeeSearch"
        @selection-change="onFeeSelectionChange"
      >
        <template #result-actions>
          <span v-if="stepNotice && noticeInResults && currentStep === 2" class="step-notice-alert" role="alert">
            {{ stepNotice }}
            <button
              v-if="filePanelRef?.hasRecoveredQuery && stepNotice.includes('刷新验证')"
              type="button"
              class="text-button"
              @click="setStep(1)"
            >去步骤 1 刷新验证</button>
          </span>
          <button type="button" class="solid billing-result-action" :disabled="!canAdvanceFromFees" @click="advanceFromResults(3)">
            进入请款单导出 →
          </button>
        </template>
        <template #result-review>
          <div v-if="pctCandidates.size > 1 || (pctCandidates.size && feeSelectionIssue && selectedFeeRows.length)" class="pct-customer-actions">
            <span>按客户选取可导出的未请款费用</span>
            <button v-for="[name, rows] in pctCandidates" :key="name" type="button" class="text-button"
              :disabled="feeQueryRef?.selectionPending || feeQueryRef?.selectionIncomplete" @click="selectPctCustomer(rows)">
              只选 {{ name }}（{{ rows.length }} 笔）
            </button>
          </div>
          <details v-if="pctExceptions.length" class="reconcile-warn">
            <summary>PCT 待核对费用（{{ pctExceptions.length }} 笔）</summary>
            <ul>
              <li
                v-for="{ row, reason } in pctExceptions"
                :key="row.feeId"
                v-memo="[row, reason]"
                v-hint="pctExceptionDetail(row, reason)"
              >
                {{ row.customerName || '客户待核对' }} · {{ row.caseVolume }} · {{ row.feeType || row.feeId }} · {{ row.amount }} {{ row.currency }}（{{ reason }}）
              </li>
            </ul>
          </details>
        </template>
      </FeeSearchQuery>
    </section>

    <!-- ============================================================== 步骤 3 -->
    <section
      ref="step3SectionRef"
      class="step-section step-3-section"
      :class="{ 'is-hidden-pane': currentStep !== 3 }"
      :inert="currentStep !== 3"
      :aria-hidden="currentStep !== 3 ? 'true' : undefined"
    >
      <details v-if="pctExportExceptions.length" class="reconcile-warn" open>
        <summary>有 {{ pctExportExceptions.length }} 笔未请款费用待处理</summary>
        <ul>
          <li
            v-for="{ row, reason } in pctExportExceptions"
            :key="row.feeId"
            v-memo="[row, reason]"
            v-hint="pctExceptionDetail(row, reason)"
          >
            {{ row.customerName || '客户待核对' }} · {{ row.caseVolume }} · {{ row.feeType || row.feeId }} · {{ row.amount }} {{ row.currency }}（{{ reason }}）
          </li>
        </ul>
        <label><input v-model="confirmPctExceptions" type="checkbox" /> 我已核对，以上费用另行处理，本次仅导出可归类的费用</label>
      </details>
      <label v-if="reconciliationInfo.requestedCount > 0" class="reconcile-warn requested-warn">
        <input v-model="confirmExistingFees" type="checkbox" />
        已核对并确认导出 {{ reconciliationInfo.requestedCount }} 笔已立单或状态待核对的费用
      </label>
      <p v-if="exportResultNotice" class="export-notice-text" role="status">{{ exportResultNotice }}</p>
      <!-- 央行汇率卡片 -->
      <div class="pbc-rates-card card">
        <div class="card-title-row">
          <strong>中国人民银行官网 · 汇率中间价</strong>
          <div class="actions">
            <span v-if="ratesLoading" class="hint">正在连接央行读取…</span>
            <span v-if="ratesDate" class="date-badge">公布日期：{{ ratesDate }}</span>
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
        <p v-if="ratesDate && ratesDate < formatLocalDate()" class="rates-source-hint">
          当前使用上一期公告，导出前会重新检查。
        </p>
        <p class="rates-source-hint">
          来源：<a :href="ratesSourceUrl || PBC_INDEX_URL" target="_blank" rel="noopener noreferrer">中国人民银行外汇市场公布表</a>。
          可直接在下方表格修改汇率数值进行微调，将按最终数值自动计算折算人民币金额。
        </p>

        <label v-if="usesManualRate">
          手工汇率基准日期
          <input v-model="manualRateDate" type="date" :max="formatLocalDate()" />
        </label>
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
                <td>{{ pbcPerCny[cur] ? `¥ ${pbcPerCny[cur]}` : '未获取 / 需手动填写' }}</td>
                <td>
                  <input
                    type="number"
                    step="any"
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

        <div class="customer-export-mode">
          <label class="mixed-customer-toggle" v-hint="'默认不勾选：多客户时按客户分表并发导出（文件名自动带客户名）；勾选后：所有选中客户的费用合并进入同一张表导出。'">
            <input v-model="allowMixedCustomers" type="checkbox" />
            <span>允许不同客户合并进入同一张表（默认按客户分表批量并发导出）</span>
          </label>
          <div v-if="selectedCustomerGroups.length > 1" class="customer-batch-preview">
            <span class="batch-preview-title">
              {{ allowMixedCustomers
                ? `已启用合表导出：将把 ${selectedCustomerGroups.length} 个客户合并为 1 份请款表`
                : `将按客户分表流水线并发导出 ${selectedCustomerGroups.length} 份请款表：` }}
            </span>
            <span
              v-for="group in selectedCustomerGroups"
              :key="group.customer"
              v-memo="[group.customer, group.rows.length]"
              class="customer-batch-chip"
              v-hint="`${group.customer}：共 ${group.rows.length} 笔费用`"
            >
              {{ group.customer }}（{{ group.rows.length }} 笔）
            </span>
          </div>
        </div>
      </div>

      <!-- 最终导出操作卡片 -->
      <div class="export-execute-card card">
        <div class="summary-line">
          <span>待填入费用：<b>{{ selectedFeeRows.length }}</b> 笔（未请款 <b>{{ reconciliationInfo.unrequestedCount }}</b>，已立单或状态待核对 <b>{{ reconciliationInfo.requestedCount }}</b>）</span>
          <span>涉及案卷：<b>{{ reconciliationInfo.totalCases }}</b> 个（{{ selectedTemplateId === 'midea-foreign' ? '确认账单日' : '有账单文件' }} <b>{{ reconciliationInfo.matchedCasesCount }}</b>，{{ selectedTemplateId === 'midea-foreign' ? '账单日待核对' : '无账单文件' }} <b>{{ reconciliationInfo.unmatchedCases.length }}</b>）</span>
          <span>目标模板：<b>{{ currentTemplate.label }}</b></span>
          <span>涉及客户：<b>{{ selectedCustomerGroups.length }}</b> 个（{{ !allowMixedCustomers && selectedCustomerGroups.length > 1 ? `分表 ${selectedCustomerGroups.length} 份` : '单表导出' }}）</span>
          <span v-if="pctSelectedCustomer">EASY 客户：<b>{{ pctSelectedCustomer }}</b></span>
        </div>

        <p v-if="reconciliationInfo.unmatchedCases.length > 0 && selectedTemplateId === 'midea-foreign'" class="reconcile-warn bill-missing-warn">
          ℹ️ 提示：有 <b>{{ reconciliationInfo.unmatchedCases.length }}</b> 个案卷有事项未能确认海外账单日（{{ reconciliationInfo.unmatchedCases.slice(0, 4).join('、') }}{{ reconciliationInfo.unmatchedCases.length > 4 ? ' 等' : '' }}），导出时对应事项的账单日将留空。
        </p>

        <p v-if="exportDisabledReason && !exporting" class="export-disabled-hint" role="note">
          <span>{{ exportDisabledReason }}</span>
          <button
            v-if="hasPendingConfirmCheck"
            type="button"
            class="text-button scroll-confirm-btn"
            @click="scrollToExportConfirm"
          >
            去勾选确认 ↑
          </button>
        </p>

        <div class="button-row">
          <button
            type="button"
            class="solid export-btn"
            :disabled="exportDisabled"
            v-hint="exportDisabledReason"
            @click="handleExportClick"
          >
            {{ exportButtonLabel }}
          </button>
        </div>

        <p v-if="exportResultNotice" class="export-notice-text" :class="{ error: exportResultNotice.includes('失败') || exportResultNotice.includes('缺少') }">
          {{ exportResultNotice }}
        </p>

        <ul v-if="exportBatchItems.length" class="batch-results-list" aria-label="分表导出明细">
          <li
            v-for="item in exportBatchItems"
            :key="item.customer"
            v-memo="[item.customer, item.status, item.savedFileName, item.fileName, item.reason]"
            class="batch-result-item"
            :class="{
              pending: item.status === 'download_started' || item.status === 'generated' || item.status === 'unknown',
              failed: item.status === 'failed' || item.status === 'download_interrupted',
            }"
          >
            <span class="batch-item-customer">{{ item.customer }}</span>
            <span class="batch-item-status">{{ batchItemStatusLabel(item.status) }}</span>
            <span class="batch-item-file">{{ item.savedFileName || item.fileName || '未生成文件' }}</span>
            <span v-if="item.reason" class="batch-item-reason">{{ item.reason }}</span>
          </li>
        </ul>

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
  position: relative;
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
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.billing-result-action {
  margin-inline-start: auto;
  padding: 8px 14px;
  white-space: nowrap;
}

.flow-steps-bar .step-quick-actions .next-btn {
  padding: 8px 16px;
  font-weight: 600;
}

.flow-steps-bar .step-quick-actions .export-step-btn {
  min-width: 204px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
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

.recovered-bill-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.recovered-bill-notice.is-busy {
  background: #fff8fb;
  border-left-color: var(--brand, #ff5d98);
  color: #9b3060;
}

.recovered-bill-notice .solid:disabled {
  opacity: 0.65;
  cursor: wait;
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
  flex-wrap: wrap;
  gap: 14px;
  padding-top: 8px;
  border-top: 1px dashed #e2e8f0;
  font-size: 14px;
}

.extracted-volumes-card {
  contain: layout style;
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

.extracted-volumes-card .volume-tags-flow .volume-expand-chip {
  padding: 4px 10px;
  border: 1px dashed #c8dff6;
  border-radius: 6px;
  background: #f5faff;
  color: #2b6cb0;
  font-size: 12px;
  cursor: pointer;
}

.extracted-volumes-card .volume-tags-flow .volume-expand-chip:hover {
  background: #ebf8ff;
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
.pct-customer-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}
.reconcile-warn.requested-warn {
  display: block;
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
  min-width: 228px;
  padding: 12px 28px;
  font-size: 15px;
  font-weight: 700;
}

.step-3-section > .export-notice-text,
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

.customer-export-mode {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #f3d4e3;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mixed-customer-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #5b3b63;
  font-weight: 600;
  cursor: pointer;
}

.customer-batch-preview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fff8fb;
  border: 1px solid #f6d5e6;
  font-size: 12px;
  color: #7c5684;
}

.batch-preview-title {
  font-weight: 600;
  color: #9e4577;
}

.customer-batch-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #f3c1da;
  color: #4f3659;
}

.export-disabled-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: #fff5f5;
  border-left: 3px solid #e53e3e;
  color: #c53030;
  font-size: 13px;
}

.scroll-confirm-btn {
  font-weight: 600;
  color: #b83280;
}

.batch-results-list {
  margin: 10px 0 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.batch-result-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #f0fff4;
  border: 1px solid #c6f6d5;
  font-size: 12px;
  color: #276749;
}

.batch-result-item.pending {
  background: #fffaf0;
  border-color: #fbd38d;
  color: #9c4221;
}

.batch-result-item.failed {
  background: #fff5f5;
  border-color: #fed7d7;
  color: #c53030;
}

.batch-item-customer {
  font-weight: 600;
}

.batch-item-status {
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  font-weight: 600;
}

.batch-item-file {
  color: #4a5568;
}

.batch-item-reason {
  color: #c53030;
}

.top-customer-mode-switch {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  height: 36px;
  padding: 3px;
  border-radius: 999px;
  background: #fff8fb;
  border: 1px solid #f3c1da;
  flex: none;
  isolation: isolate;
}

.top-customer-mode-switch:has(.mode-opt:focus-visible) {
  outline: 2px solid var(--focus, #9b3060);
  outline-offset: 2px;
}

.top-customer-mode-switch .mode-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc(50% - 3px);
  border-radius: 999px;
  background: linear-gradient(180deg, #ff78ae, #ff4f93);
  box-shadow: 0 2px 6px rgba(255, 79, 147, 0.28);
  transform: translateX(0);
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
  z-index: 0;
}

.top-customer-mode-switch .mode-thumb.merged {
  transform: translateX(100%);
}

.top-customer-mode-switch .mode-opt {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-width: 78px;
  border: none;
  background: transparent;
  color: #6b4c72;
  font-size: 12px;
  font-weight: 600;
  padding: 0 10px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.18s ease;
}

.top-customer-mode-switch .mode-opt:focus-visible {
  outline: none;
}

.top-customer-mode-switch .mode-opt.active {
  color: #ffffff;
}

.top-customer-mode-switch .mode-opt:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .top-customer-mode-switch .mode-thumb,
  .top-customer-mode-switch .mode-opt {
    transition: none;
  }
}
</style>
