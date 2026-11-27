<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import { createWorkflowBridge } from '../services/full-page-bridge'
import { confirmDialog, infoDialog } from '../dialog'
import { taskCheckSnapshot, type TaskCheckStatus } from '../check-progress'
import { useTopProgress, type TopProgress } from '../composables/useTopProgress'
import { useWriteSwitch } from '../../settings/use-write-switch'
import { readXlsxRows } from '../../customer/xlsx-table'
import { MessageType } from '../../shared/message'
import { accountScopeMatches, sameOperatorId, scopeFromConnection, type ExpectedAccountScope } from '../../shared/connection'
import { useWorkspace } from '../composables/useWorkspace'
import type {
  FeeReduceCaseInspectItem,
  FeeReduceReviewerOption,
  FeeReduceReviewerStrategy,
  FeeReduceSubmitRequest
} from '../../api/fee-reduce-types'
import {
  extractCaseVolumesFromSheet,
  parseCaseVolumeText,
  pickFeeReduceReviewer
} from '../../workflow/fee-reduce-input'

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

interface FeeReduceRowState {
  item: FeeReduceCaseInspectItem
  checked: boolean
  overrideReviewerId: string
  execStatus: 'idle' | 'running' | 'submitted' | 'failed' | 'unconfirmed'
  execMessage: string
  account: ExpectedAccountScope
  filingId: string
  warnings: string[]
}

const bridge = createWorkflowBridge('fee-reduce')
const { connection } = useWorkspace()

const volumeInput = ref('')
const sheetName = ref('')
const sheetRows = ref<string[][]>([])
const sheetHeaders = ref<string[]>([])
const sheetColumnIndex = ref(0)

const inspecting = ref(false)
const loadingReviewers = ref(false)
const executing = ref(false)
const statusNotice = ref('')
const errorNotice = ref('')
const progress = ref<TopProgress>({ visible: false, done: 0, total: 0, percent: 0, eta: '', status: 'idle', label: '', summary: '', detail: '' })
useTopProgress(computed(() => progress.value), computed(() => props.isActive))
const { open: writeOpen, setOpen: setWriteOpen } = useWriteSwitch()

const reviewers = ref<FeeReduceReviewerOption[]>([])
const reviewerAccount = ref<ExpectedAccountScope | null>(null)
const reviewerNodeName = ref('流程人员初核')
const reviewerStrategy = ref<FeeReduceReviewerStrategy>('first')
const defaultReviewerId = ref('')
const remark = ref('同意')
const oaName = ref('')
const concurrency = ref('6')

const rows = reactive<FeeReduceRowState[]>([])
const pausedBatch = ref<{ account: ExpectedAccountScope; rows: FeeReduceRowState[] } | null>(null)
const canRecheckPaused = computed(() => {
  const current = scopeFromConnection(connection.value)
  const previous = pausedBatch.value?.account
  return current && previous && current.easyOrigin === previous.easyOrigin && sameOperatorId(current.operatorId, previous.operatorId)
})
const resultPageSize = 20
const resultPage = ref(1)
const resultPageCount = computed(() => Math.max(1, Math.ceil(rows.length / resultPageSize)))
const visibleRows = computed(() => {
  const start = (resultPage.value - 1) * resultPageSize
  return rows.slice(start, start + resultPageSize)
})

const concurrencyOptions = [
  { value: '6', label: '6 路并发（默认）' },
  { value: '4', label: '4 路并发' },
  { value: '2', label: '2 路并发' },
  { value: '1', label: '1 路串行' }
]

const strategyOptions = [
  { value: 'first', label: '默认首位候选人' },
  { value: 'least_busy', label: '待办件数最少' },
  { value: 'specific', label: '指定初核人' }
]

const reviewerOptions = computed(() =>
  reviewers.value.map(r => ({
    value: r.userId,
    label: r.count === null ? r.name : `${r.name} (${r.count})`
  }))
)

const sheetColumnOptions = computed(() =>
  sheetHeaders.value.map((label, idx) => ({
    value: String(idx),
    label
  }))
)

const parsedVolumes = computed(() => parseCaseVolumeText(volumeInput.value))

const counts = computed(() => {
  let completed = 0
  let ready = 0
  let other = 0
  let submitted = 0
  for (const r of rows) {
    if (r.item.state === 'completed') completed += 1
    else if (r.item.state === 'ready') ready += 1
    else other += 1
    if (r.execStatus === 'submitted') submitted += 1
  }
  return { total: rows.length, completed, ready, other, submitted }
})

const selectedRows = computed(() => rows.filter(r => r.checked && r.item.state === 'ready' &&
  r.execStatus !== 'submitted' && r.execStatus !== 'unconfirmed'))

const resolvedDefaultReviewer = computed(() =>
  pickFeeReduceReviewer(reviewers.value, reviewerStrategy.value, defaultReviewerId.value)
)

function effectiveReviewerLabel(row: FeeReduceRowState): string {
  const picked = pickFeeReduceReviewer(
    reviewers.value,
    reviewerStrategy.value,
    defaultReviewerId.value,
    row.overrideReviewerId || undefined
  )
  if (!picked) return row.overrideReviewerId || reviewerStrategy.value === 'specific' ? '指定初核人不可用' : '未读取'
  return picked.count === null ? picked.name : `${picked.name} (${picked.count})`
}

function stateBadgeText(row: FeeReduceRowState): string {
  if (row.execStatus === 'running') return '递交中…'
  if (row.execStatus === 'submitted') return '已提交初核'
  if (row.execStatus === 'unconfirmed') return '待核对'
  if (row.execStatus === 'failed') return '递交失败'
  switch (row.item.state) {
    case 'completed':
      return `已完成（${row.item.procStatus}）`
    case 'ready':
      return '待递交（撰写中）'
    case 'not_found':
      return '未查到案件'
    case 'missing_proc':
      return '无费减事项'
    case 'other_status':
      return `跳过（${row.item.procStatus || '空状态'}）`
    default:
      return '查询异常'
  }
}

function stateBadgeClass(row: FeeReduceRowState): string {
  if (row.execStatus === 'submitted' || row.item.state === 'completed') return 'badge-done'
  if (row.execStatus === 'failed' || row.execStatus === 'unconfirmed' || row.item.state === 'error' || row.item.state === 'not_found') return 'badge-warn'
  if (row.execStatus === 'running' || row.item.state === 'ready') return 'badge-ready'
  return 'badge-muted'
}

async function loadReviewers(): Promise<void> {
  const account = scopeFromConnection(connection.value)
  if (!account) return
  if (reviewerAccount.value && !accountScopeMatches(connection.value, reviewerAccount.value)) {
    reviewers.value = []
    defaultReviewerId.value = ''
    reviewerAccount.value = null
  }
  loadingReviewers.value = true
  try {
    const res = await bridge.request({ type: MessageType.ReadFeeReduceReviewers })
    if (!accountScopeMatches(connection.value, account)) return
    if (res.type === MessageType.ReadFeeReduceReviewersResult && res.payload.ok) {
      reviewerAccount.value = account
      reviewers.value = res.payload.data.reviewers
      reviewerNodeName.value = res.payload.data.nodeName || '流程人员初核'
      if (!defaultReviewerId.value && reviewers.value.length) {
        defaultReviewerId.value = reviewers.value[0].userId
      }
      if (!statusNotice.value) statusNotice.value = res.payload.data.message
    } else if (res.type === MessageType.ReadFeeReduceReviewersResult && !res.payload.ok) {
      errorNotice.value = res.payload.error.message
    } else if (res.type === MessageType.Error) {
      errorNotice.value = res.payload.message
    }
  } finally {
    loadingReviewers.value = false
  }
}

async function onUploadSheet(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  errorNotice.value = ''
  try {
    const buffer = await file.arrayBuffer()
    const parsed = await readXlsxRows(buffer)
    if (!parsed.length) {
      errorNotice.value = '表格中没有读到有效行。'
      return
    }
    sheetName.value = file.name
    sheetRows.value = parsed
    const extracted = extractCaseVolumesFromSheet(parsed)
    sheetHeaders.value = extracted.headers
    sheetColumnIndex.value = extracted.detectedColumn
    volumeInput.value = extracted.volumes.join('\n')
    statusNotice.value = `已从「${file.name}」第 ${extracted.detectedColumn + 1} 列提取 ${extracted.volumes.length} 个我方文号。`
  } catch (err) {
    errorNotice.value = err instanceof Error ? err.message : '读取 Excel 失败。'
  }
}

function onChangeSheetColumn(value: string): void {
  const idx = Number(value)
  if (!Number.isInteger(idx) || idx < 0 || !sheetRows.value.length) return
  sheetColumnIndex.value = idx
  const extracted = extractCaseVolumesFromSheet(sheetRows.value, idx)
  volumeInput.value = extracted.volumes.join('\n')
  statusNotice.value = `已切换至第 ${idx + 1} 列，提取 ${extracted.volumes.length} 个我方文号。`
}

function startProgress(label: string, total: number, detail: string) {
  const startedAt = Date.now()
  const update = (done: number, status: TaskCheckStatus, message = detail) => {
    const snapshot = taskCheckSnapshot(done, total, startedAt, Date.now(), status)
    progress.value = { ...snapshot, visible: true, status, label, summary: `${label} ${snapshot.done}/${snapshot.total} 件`, detail: message }
  }
  update(0, 'run')
  return update
}

async function inspectAll(recheckPaused = false): Promise<void> {
  if (inspecting.value || executing.value) return
  if (recheckPaused && !canRecheckPaused.value) return
  errorNotice.value = ''
  statusNotice.value = ''
  const priorRows = recheckPaused ? pausedBatch.value?.rows : undefined
  const overrides = new Map(priorRows?.map(row => [row.item.caseVolume.toUpperCase(), row.overrideReviewerId]))
  const uncertain = new Set(priorRows?.filter(row => row.execStatus === 'unconfirmed').map(row => row.item.caseVolume.toUpperCase()))
  const volumes = priorRows ? priorRows.map(row => row.item.caseVolume) : parsedVolumes.value
  if (!volumes.length) {
    errorNotice.value = '请先输入或导入至少一个我方文号。'
    return
  }
  const account = scopeFromConnection(connection.value)
  if (!account) {
    errorNotice.value = '请先连接已登录的 EASY 账号。'
    return
  }
  inspecting.value = true
  resultPage.value = 1
  rows.splice(0, rows.length)
  const updateProgress = startProgress('费减检索', volumes.length, '正在检索案件与处理状态')
  let done = 0
  try {
    if (!reviewers.value.length || !reviewerAccount.value || !accountScopeMatches(connection.value, reviewerAccount.value)) {
      await loadReviewers()
    }
    const chunkSize = 48
    for (let i = 0; i < volumes.length; i += chunkSize) {
      if (!accountScopeMatches(connection.value, account)) throw new Error('EASY 账号已切换，请重新检索。')
      const chunk = volumes.slice(i, i + chunkSize)
      const res = await bridge.request({
        type: MessageType.InspectFeeReduceCases,
        payload: { caseVolumes: chunk, expectedScope: account }
      })
      if (!accountScopeMatches(connection.value, account)) throw new Error('EASY 账号已切换，请重新检索。')
      if (res.type === MessageType.InspectFeeReduceCasesResult && res.payload.ok) {
        rows.push(
          ...res.payload.data.items.map((item): FeeReduceRowState => {
            const key = item.caseVolume.toUpperCase()
            const needsReview = item.state !== 'completed' && uncertain.has(key)
            return {
              item,
              checked: item.state === 'ready' && !needsReview,
              overrideReviewerId: overrides.get(key) ?? '',
              execStatus: needsReview ? 'unconfirmed' : 'idle',
              execMessage: needsReview ? '上次递交回执未确认，请先到 EASY 核对。' : '',
              account,
              filingId: '',
              warnings: []
            }
          })
        )
        done += chunk.length
        updateProgress(done, 'run')
      } else if (res.type === MessageType.InspectFeeReduceCasesResult && !res.payload.ok) {
        throw new Error(res.payload.error.message)
      } else if (res.type === MessageType.Error) {
        throw new Error(res.payload.message)
      } else {
        throw new Error('检索未返回有效结果。')
      }
    }
    pausedBatch.value = null
    statusNotice.value = `检索完成：共 ${counts.value.total} 件，已完成 ${counts.value.completed} 件，待递交（撰写中）${counts.value.ready} 件。`
    updateProgress(done, 'done', `已完成 ${counts.value.completed} 件，待递交 ${counts.value.ready} 件`)
  } catch (err) {
    errorNotice.value = err instanceof Error ? err.message : '检索失败。'
    updateProgress(done, 'fail', errorNotice.value)
  } finally {
    inspecting.value = false
  }
}

function submitRequest(row: FeeReduceRowState): FeeReduceSubmitRequest {
  return {
    caseVolume: row.item.caseVolume,
    caseId: row.item.caseId,
    procId: row.item.procId,
    oaName: oaName.value.trim(),
    remark: remark.value.trim() || '同意',
    reviewerStrategy: reviewerStrategy.value,
    defaultReviewerId: defaultReviewerId.value || undefined,
    overrideReviewerId: row.overrideReviewerId || undefined,
    expectedScope: row.account
  }
}

async function runSingleRow(row: FeeReduceRowState, payload: FeeReduceSubmitRequest): Promise<'submitted' | 'skipped' | 'failed' | 'not_sent' | 'verify'> {
  if (!accountScopeMatches(connection.value, row.account)) {
    row.execMessage = '原 EASY 账号连接已变化，本件未派发。'
    return 'not_sent'
  }
  row.execStatus = 'running'
  row.execMessage = '正在执行校验、XML 转档与流程提交…'
  row.warnings = []
  const res = await bridge.request({
    type: MessageType.SubmitFeeReduceFiling,
    payload
  }).catch((err: unknown) => ({
    type: MessageType.Error,
    payload: { message: err instanceof Error ? err.message : '提交未返回有效结果。', feeBatchPause: 'verify' }
  } as const))
  if (res.type === MessageType.SubmitFeeReduceFilingResult && res.payload.ok) {
    const { data } = res.payload
    row.execMessage = data.message
    row.checked = false
    if (data.outcome === 'already_completed') {
      row.item = { ...row.item, state: 'completed', procStatus: data.procStatus }
      row.execStatus = 'idle'
      return 'skipped'
    }
    row.execStatus = 'submitted'
    row.filingId = data.filingId
    row.warnings = data.warnings
    return 'submitted'
  }
  if (res.type === MessageType.SubmitFeeReduceFilingResult && !res.payload.ok) {
    row.execMessage = res.payload.error.message
  } else if (res.type === MessageType.Error) {
    row.execMessage = res.payload.message === 'STALE_CONTEXT' ? 'EASY 账号已切换，请重新检索。' : res.payload.message
  } else {
    row.execMessage = '提交未返回有效结果。'
  }
  const errorCode = res.type === MessageType.SubmitFeeReduceFilingResult && !res.payload.ok ? res.payload.error.code : undefined
  const pause = res.type === MessageType.Error ? res.payload.feeBatchPause
    : errorCode === 'SESSION_EXPIRED' || errorCode === 'FLOW_STATUS_UNVERIFIED' ? 'verify' : undefined
  if (pause) {
    row.execStatus = pause === 'verify' ? 'unconfirmed' : 'idle'
    if (pause === 'verify') row.checked = false
    return pause
  }
  row.execStatus = 'failed'
  return 'failed'
}

async function executeSelected(): Promise<void> {
  if (pausedBatch.value) return
  if (!writeOpen.value) {
    await infoDialog({
      title: '写开关未开启',
      message: '请先打开写开关，再执行费用减缓递交与流程提交。'
    })
    return
  }
  const targets = selectedRows.value.map(row => ({ row, payload: submitRequest(row) }))
  if (!targets.length) {
    errorNotice.value = '没有勾选待递交（撰写中）的案件。'
    return
  }
  if (targets.some(({ row }) => !accountScopeMatches(connection.value, row.account))) {
    errorNotice.value = 'EASY 账号已切换，请重新检索。'
    return
  }
  if (targets.some(({ payload }) => payload.reviewerStrategy === 'specific' &&
      !payload.defaultReviewerId && !payload.overrideReviewerId)) {
    errorNotice.value = '请为使用「指定初核人」的案件选择审核人。'
    return
  }
  const workerCount = Math.max(1, Math.min(Number(concurrency.value) || 6, targets.length))
  const defaultLabel = resolvedDefaultReviewer.value
    ? `${resolvedDefaultReviewer.value.name}${resolvedDefaultReviewer.value.count === null ? '' : `(${resolvedDefaultReviewer.value.count})`}`
    : '候选首位'
  const confirmed = await confirmDialog({
    title: '确认批量递交请求费用减缓',
    message: `将对已勾选的 ${targets.length} 件「撰写中」案件按 ${workerCount} 路并发执行：校验 → 创建费用减缴请求递交单 → XML 转档 → 提交至「${reviewerNodeName.value}」（默认：${defaultLabel}）。确认继续？`,
    confirmLabel: '开始递交'
  })
  if (!confirmed || inspecting.value || executing.value) return
  if (targets.some(({ row }) => !rows.includes(row) || !accountScopeMatches(connection.value, row.account))) {
    errorNotice.value = '案件列表或 EASY 账号已变化，请重新确认。'
    return
  }

  executing.value = true
  errorNotice.value = ''
  const updateProgress = startProgress('费减递交', targets.length, '正在校验、XML 转档与流程提交')
  let okCount = 0
  let skippedCount = 0
  let failCount = 0
  let verifyCount = 0
  let pauseReason = ''
  let nextIndex = 0
  const unfinished = new Set(targets.map(({ row }) => row))
  try {
    async function runWorker(): Promise<void> {
      while (!pauseReason && nextIndex < targets.length) {
        if (!writeOpen.value || !accountScopeMatches(connection.value, targets[0].row.account)) {
          pauseReason = 'EASY 连接或写开关已变化。'
          return
        }
        const idx = nextIndex
        nextIndex += 1
        const { row, payload } = targets[idx]
        const outcome = await runSingleRow(row, payload)
        if (outcome === 'submitted' || outcome === 'skipped' || outcome === 'failed') unfinished.delete(row)
        if (outcome === 'submitted') okCount += 1
        else if (outcome === 'skipped') skippedCount += 1
        else if (outcome === 'failed') failCount += 1
        else {
          if (outcome === 'verify') verifyCount += 1
          pauseReason ||= row.execMessage || 'EASY 连接已中断。'
        }
        updateProgress(okCount + skippedCount + failCount + verifyCount, pauseReason ? 'hold' : 'run',
          pauseReason || `已成功 ${okCount} 件${skippedCount ? `，跳过 ${skippedCount} 件` : ''}，失败 ${failCount} 件`)
      }
    }
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
    if (pauseReason) {
      const completed = okCount + skippedCount + failCount + verifyCount
      if (unfinished.size) pausedBatch.value = { account: targets[0].row.account, rows: [...unfinished] }
      statusNotice.value = `批次已暂停。已提交 ${okCount} 件，跳过 ${skippedCount} 件，失败 ${failCount} 件，待核对 ${verifyCount} 件，未派发 ${targets.length - completed} 件。${pauseReason}`
      updateProgress(completed, 'hold', statusNotice.value)
      return
    }
    statusNotice.value = `执行结束：成功 ${okCount} 件${skippedCount ? `，跳过 ${skippedCount} 件` : ''}${failCount ? `，失败 ${failCount} 件，请查看各行结果` : ''}。`
    updateProgress(okCount + skippedCount + failCount, failCount ? 'fail' : 'done', statusNotice.value)
  } finally {
    executing.value = false
  }
}

async function retryRow(row: FeeReduceRowState): Promise<void> {
  if (!writeOpen.value) {
    await infoDialog({
      title: '写开关未开启',
      message: '请先打开写开关后再重试。'
    })
    return
  }
  if (inspecting.value || executing.value) return
  executing.value = true
  const updateProgress = startProgress('费减重试', 1, '正在重新执行流程提交')
  try {
    const outcome = await runSingleRow(row, submitRequest(row))
    if (outcome === 'verify' || outcome === 'not_sent') {
      pausedBatch.value = { account: row.account, rows: [row] }
      statusNotice.value = `重试已暂停。${row.execMessage}`
      updateProgress(outcome === 'verify' ? 1 : 0, 'hold', statusNotice.value)
      return
    }
    updateProgress(1, outcome === 'failed' ? 'fail' : 'done', row.execMessage)
  } finally {
    executing.value = false
  }
}

function toggleAllReady(checked: boolean): void {
  for (const row of rows) {
    if (row.item.state === 'ready' && row.execStatus !== 'submitted' && row.execStatus !== 'unconfirmed') {
      row.checked = checked
    }
  }
}

onMounted(() => {
  void loadReviewers()
})
</script>

<template>
  <section class="card fee-reduce-page">
    <div v-if="!props.embedded" class="card-head">
      <button type="button" class="workflow-back-btn" @click="$emit('back')">回到工作流</button>
      <h2>请求费用减缓</h2>
    </div>

    <div class="fr-banner">
      <div class="fr-switch-row">
        <strong>写开关状态：</strong>
        <span :class="writeOpen ? 'badge-done' : 'badge-warn'" class="fr-pill">
          {{ writeOpen ? '已开启（可执行递交）' : '已关闭（仅可检索）' }}
        </span>
        <button type="button" class="ghost" :disabled="executing" @click="setWriteOpen(!writeOpen)">
          {{ writeOpen ? '关闭写开关' : '打开写开关' }}
        </button>
      </div>
      <div class="fr-meta">
        <span>递交类型：手续办理 → 费用减缴请求 (100008)</span>
        <span>下一节点：{{ reviewerNodeName }}</span>
      </div>
    </div>

    <div class="fr-grid">
      <div class="fr-input-box">
        <div class="fr-label-row">
          <label for="fr-volumes">我方文号（支持换行、分号、逗号分隔，当前 {{ parsedVolumes.length }} 个）</label>
          <label class="fr-upload-btn">
            <input type="file" accept=".xlsx" @change="onUploadSheet" />
            <span>导入 Excel</span>
          </label>
        </div>
        <textarea
          id="fr-volumes"
          v-model="volumeInput"
          rows="5"
          placeholder="例如：&#10;PE26115584CND&#10;PE26115585CND"
        />
        <div v-if="sheetHeaders.length > 1" class="fr-sheet-bar">
          <span>已导入：{{ sheetName }}</span>
          <label>
            文号所在列
            <ThemeSelect
              :model-value="String(sheetColumnIndex)"
              :options="sheetColumnOptions"
              @update:model-value="onChangeSheetColumn(String($event))"
            />
          </label>
        </div>
      </div>

      <div class="fr-config-box">
        <div class="fr-field">
          <label>初核人选择策略</label>
          <ThemeSelect v-model="reviewerStrategy" :options="strategyOptions" />
        </div>
        <div class="fr-field">
          <label>默认初核人（{{ reviewerNodeName }}）</label>
          <div class="fr-inline">
            <ThemeSelect
              v-model="defaultReviewerId"
              :options="reviewerOptions"
              placeholder="选择默认初核人"
              empty-text="请先登录 EASY 并刷新"
            />
            <button type="button" class="ghost" :disabled="loadingReviewers" @click="loadReviewers">
              {{ loadingReviewers ? '读取中…' : '刷新' }}
            </button>
          </div>
        </div>
        <div class="fr-field">
          <label>办理意见</label>
          <input v-model="remark" type="text" maxlength="200" placeholder="同意" />
        </div>
        <div class="fr-field">
          <label>申请人或专利权人（可选，留空默认第一申请人）</label>
          <input v-model="oaName" type="text" maxlength="200" placeholder="不填时默认为第一申请人" />
        </div>
        <div class="fr-field">
          <label>执行并发数</label>
          <ThemeSelect v-model="concurrency" :options="concurrencyOptions" />
        </div>
      </div>
    </div>

    <div class="fr-actions">
      <button v-if="pausedBatch" type="button" class="solid" :disabled="!canRecheckPaused || inspecting || executing" @click="inspectAll(true)">
        重新检索本批未完成（{{ pausedBatch.rows.length }}）
      </button>
      <button type="button" class="solid" :disabled="inspecting || executing" @click="inspectAll()">
        {{ inspecting ? '检索中…' : '检索案件与处理状态' }}
      </button>
      <button
        type="button"
        class="solid"
        :disabled="executing || inspecting || !!pausedBatch || selectedRows.length === 0"
        @click="executeSelected"
      >
        {{ executing ? '批量递交中…' : `递交已勾选（${selectedRows.length}）` }}
      </button>
      <button type="button" class="ghost" :disabled="executing || !counts.ready" @click="toggleAllReady(true)">
        全选撰写中
      </button>
      <button type="button" class="ghost" :disabled="executing || !counts.ready" @click="toggleAllReady(false)">
        取消全选
      </button>
    </div>
    <p v-if="pausedBatch && !canRecheckPaused" class="fr-notice">
      请重新连接本批次原来的 EASY 系统和账号，再检索未完成案件。
    </p>

    <p v-if="statusNotice" class="hint">{{ statusNotice }}</p>
    <p v-if="errorNotice" class="fr-error">{{ errorNotice }}</p>

    <div v-if="rows.length" class="fr-summary">
      <span>总计：<b>{{ counts.total }}</b></span>
      <span>已完成（递交中/完成）：<b class="text-done">{{ counts.completed }}</b></span>
      <span>待递交（撰写中）：<b class="text-ready">{{ counts.ready }}</b></span>
      <span>已提交初核：<b class="text-done">{{ counts.submitted }}</b></span>
      <span>其他/未找到：<b>{{ counts.other }}</b></span>
    </div>

    <nav v-if="resultPageCount > 1" class="fr-pagination" aria-label="费减结果分页">
      <button type="button" class="ghost" :disabled="resultPage <= 1" @click="resultPage--">上一页</button>
      <span>第 {{ resultPage }} / {{ resultPageCount }} 页 · 每页 {{ resultPageSize }} 件</span>
      <button type="button" class="ghost" :disabled="resultPage >= resultPageCount" @click="resultPage++">下一页</button>
    </nav>

    <div v-if="rows.length" class="fr-table-wrap">
      <table class="fr-table">
        <thead>
          <tr>
            <th style="width: 44px;">选</th>
            <th>我方文号</th>
            <th>案件名称 / 申请号</th>
            <th>处理状态</th>
            <th>初核人</th>
            <th>执行结果</th>
            <th style="width: 90px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visibleRows" :key="row.item.caseVolume">
            <td>
              <input
                v-model="row.checked"
                type="checkbox"
                :disabled="row.item.state !== 'ready' || row.execStatus === 'submitted' || row.execStatus === 'unconfirmed' || executing"
              />
            </td>
            <td class="mono">{{ row.item.caseVolume }}</td>
            <td>
              <div>{{ row.item.caseName || '—' }}</div>
              <small v-if="row.item.appNo" class="muted">{{ row.item.appNo }}</small>
            </td>
            <td>
              <span class="fr-pill" :class="stateBadgeClass(row)">{{ stateBadgeText(row) }}</span>
            </td>
            <td>
              <ThemeSelect
                v-if="row.item.state === 'ready' && row.execStatus !== 'submitted'"
                v-model="row.overrideReviewerId"
                :options="[{ value: '', label: `跟随默认 (${effectiveReviewerLabel(row)})` }, ...reviewerOptions]"
              />
              <span v-else class="muted">—</span>
            </td>
            <td>
              <div>{{ row.execMessage || row.item.reason }}</div>
              <small v-if="row.filingId" class="muted mono">filing_id: {{ row.filingId }}</small>
              <div v-for="(warn, idx) in row.warnings" :key="idx" class="fr-warn-line">提示：{{ warn }}</div>
            </td>
            <td>
              <button
                v-if="row.execStatus === 'failed'"
                type="button"
                class="ghost"
                :disabled="inspecting || executing || !!pausedBatch"
                @click="retryRow(row)"
              >
                重试
              </button>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.fee-reduce-page { display: flex; flex-direction: column; gap: 14px; }
.fr-banner { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: var(--panel-soft, rgba(127,127,127,0.08)); font-size: 13px; }
.fr-switch-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fr-meta { display: flex; gap: 16px; flex-wrap: wrap; opacity: 0.85; }
.fr-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; }
@media (max-width: 900px) { .fr-grid { grid-template-columns: 1fr; } }
.fr-input-box, .fr-config-box { display: flex; flex-direction: column; gap: 10px; }
.fr-label-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
.fr-input-box textarea { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border, #d0d7de); font-family: monospace; font-size: 13px; resize: vertical; }
.fr-upload-btn { position: relative; overflow: hidden; display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border, #d0d7de); cursor: pointer; font-size: 12px; font-weight: 500; }
.fr-upload-btn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.fr-sheet-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; }
.fr-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.fr-field input { padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border, #d0d7de); }
.fr-inline { display: flex; gap: 8px; align-items: center; }
.fr-inline > :first-child { flex: 1; }
.fr-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.fr-summary { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; }
.fr-error { color: #cf222e; font-size: 13px; margin: 0; }
.fr-warn-line { color: #9a6700; font-size: 12px; margin-top: 2px; }
.fr-table-wrap { overflow-x: auto; }
.fr-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; font-size: 13px; }
.fr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.fr-table th, .fr-table td { padding: 8px 10px; border-bottom: 1px solid var(--border, #e5e7eb); text-align: left; vertical-align: top; }
.fr-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badge-done { background: rgba(26, 127, 55, 0.12); color: #1a7f37; }
.badge-ready { background: rgba(9, 105, 218, 0.12); color: #0969da; }
.badge-warn { background: rgba(207, 34, 46, 0.12); color: #cf222e; }
.badge-muted { background: rgba(127, 127, 127, 0.12); color: #57606a; }
.text-done { color: #1a7f37; }
.text-ready { color: #0969da; }
.mono { font-family: monospace; }
.muted { opacity: 0.72; }
</style>
