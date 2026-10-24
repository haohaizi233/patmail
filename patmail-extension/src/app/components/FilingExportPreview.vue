<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ApiResult } from '../../api/types'
import { apiError } from '../../api/types'
import type { FilingSearchRow } from '../../api/filing-search-types'
import { FILING_EXPORT_HEADERS, filingExportCells, type FilingExportRow } from '../../api/filing-export'
import { collectFilingExport, filingExportSheet } from '../../workflow/filing-export'
import { downloadXlsxSheets } from '../../customer/xlsx-table'
import { paintTaskCheckProgress } from '../check-progress'
import { MessageType, type MessageBridge } from '../../shared/message'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'

/** 导出预览：上表勾选的递交在这里逐件出导出行，行级刷新，取完数按需导出带冻结首行的 xlsx。 */
const props = defineProps<{ bridge?: MessageBridge; rows: FilingSearchRow[]; token: number; downloadToken?: number }>()

const problems = ref<string[]>([])
const running = ref(false)
const collectedToken = ref(-1)
let downloadPending = false
const doneCount = ref(0)
const pageIndex = ref(1)
const pageSize = ref(50)
const pageSizeOptions = [
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' }
]

/**
 * 每件的导出行按勾选顺序放普通数组，不进响应式；几万件时每件完成都整表重算会把界面卡死，
 * 这里只按节拍（约 250ms）刷一次预览，取完数再立刻刷一次。
 */
let slots: FilingExportRow[][] = []
const previewTick = ref(0)
let tickPending = false
function schedulePreview(): void {
  if (tickPending) return
  tickPending = true
  setTimeout(() => {
    tickPending = false
    previewTick.value += 1
  }, 250)
}

const allLines = computed(() => {
  void previewTick.value
  return slots.flat()
})
const displayLines = computed(() => {
  void previewTick.value
  const out: Array<{ key: string; cells: string[] }> = []
  slots.forEach((group, index) => {
    group.forEach((line, order) => out.push({ key: `${index}-${order}`, cells: filingExportCells(line) }))
  })
  return out
})
const totalPages = computed(() => Math.max(Math.ceil(displayLines.value.length / pageSize.value), 1))
const pageLines = computed(() => displayLines.value.slice((pageIndex.value - 1) * pageSize.value, pageIndex.value * pageSize.value))

function failed(message: string): ApiResult<never> {
  return apiError('NETWORK_ERROR', message)
}

let generation = 0

async function run(): Promise<void> {
  const current = ++generation
  slots = props.rows.map(() => [])
  previewTick.value += 1
  collectedToken.value = -1
  problems.value = []
  pageIndex.value = 1
  doneCount.value = 0
  if (!props.bridge || !props.rows.length) {
    running.value = false
    return
  }
  running.value = true
  const startedAt = Date.now()
  paintTaskCheckProgress(0, props.rows.length, startedAt, 'run')
  try {
    const result = await collectFilingExport(props.rows, {
      readFlow: async filingId => {
        const response = await props.bridge!.request({ type: MessageType.ReadFilingFlow, payload: { filingId } })
        return response.type === MessageType.ReadFilingFlowResult ? response.payload : failed('流程历史没有回传。')
      },
      readUser: async userId => {
        const response = await props.bridge!.request({ type: MessageType.ReadUserInfo, payload: { userId } })
        return response.type === MessageType.ReadUserInfoResult ? response.payload : failed('人员信息没有回传。')
      }
    }, {
      onFiling: (index, lines) => {
        if (current !== generation) return
        slots[index] = lines
        schedulePreview()
      },
      onProgress: (done, total) => {
        if (current !== generation) return
        doneCount.value = done
        paintTaskCheckProgress(done, total, startedAt, done >= total ? 'done' : 'run')
      }
    })
    if (current !== generation) return
    problems.value = result.problems
    paintTaskCheckProgress(props.rows.length, props.rows.length, startedAt, 'done')
    // 取完数先刷一次预览；点过「导出 Excel」就直接给文件，不用再点一次。
    previewTick.value += 1
    collectedToken.value = props.token
    if (downloadPending) {
      downloadPending = false
      if (allLines.value.length) exportXlsx()
    }
  } catch {
    if (current === generation) paintTaskCheckProgress(doneCount.value, props.rows.length, startedAt, 'fail')
  } finally {
    if (current === generation) running.value = false
  }
}

watch(() => props.token, () => { void run() }, { immediate: true })

/** 点「导出 Excel」：取好的立刻下文件；没取好的记下来，取完自动下，不用再点一次。 */
watch(() => props.downloadToken ?? 0, value => {
  if (!value) return
  if (!running.value && collectedToken.value === props.token && allLines.value.length) {
    exportXlsx()
    return
  }
  downloadPending = true
}, { immediate: true })

function exportXlsx(): void {
  if (!allLines.value.length) return
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  downloadXlsxSheets([filingExportSheet(allLines.value)], `递交管理-已完成导出-${stamp}.xlsx`)
}

function page(delta: number): void {
  const next = pageIndex.value + delta
  if (next < 1 || next > totalPages.value) return
  pageIndex.value = next
}
</script>

<template>
  <section class="card filing-export" aria-label="导出预览">
    <div class="section-heading">
      <strong>导出预览</strong>
      <span class="inline-actions">
        <span class="hint">{{ running ? `正在取数 ${doneCount}/${rows.length} 件…` : rows.length ? `已选 ${rows.length} 件，导出行 ${allLines.length} 行` : '还没有要导出的递交记录' }}</span>
        <button type="button" class="solid tiny" :disabled="!allLines.length" @click="exportXlsx">重新导出</button>
      </span>
    </div>
    <p class="hint">八列口径：我方文号、申请日（没有申请日用申请事项的完成日）、案件流向、流程专员（退回者）、代理师（接受者）、代理师所属部门、退回的原因、案件状态。一次退回一行，同一份的第二行起我方文号留空；xlsx 自动冻结首行。</p>
    <p v-if="problems.length" class="error" role="alert">{{ problems.length }} 件没读全：{{ problems.slice(0, 3).join('；') }}</p>
    <p v-if="!displayLines.length && !running" class="hint">在上面的查询结果里勾选递交记录，这里会逐件出预览行。全选所有会自动先取数；点「导出 Excel」出文件，取好的立刻下，没取好的取完自动下。</p>
    <template v-else>
      <div class="table-scroll">
        <table class="grid">
          <thead>
            <tr>
              <th class="seq">序号</th>
              <th v-for="head in FILING_EXPORT_HEADERS" :key="head">{{ head }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(line, index) in pageLines" :key="line.key" v-memo="[line.cells.join('|')]">
              <td class="seq">{{ (pageIndex - 1) * pageSize + index + 1 }}</td>
              <td v-for="(cell, cellIndex) in line.cells" :key="cellIndex">
                <span class="clip" v-hint.clip="cell">{{ cell }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav class="pagination" aria-label="导出预览分页">
        <button type="button" :disabled="pageIndex <= 1" @click="page(-1)">上一页</button>
        <span>第 {{ pageIndex }} / {{ totalPages }} 页</span>
        <button type="button" :disabled="pageIndex >= totalPages" @click="page(1)">下一页</button>
        <label class="page-size">每页数量
          <ThemeSelect v-model="pageSize" :options="pageSizeOptions" @change="pageIndex = 1" />
        </label>
      </nav>
    </template>
  </section>
</template>
