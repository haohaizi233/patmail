<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ApiResult } from '../../api/types'
import { apiError } from '../../api/types'
import type { FilingSearchRow } from '../../api/filing-search-types'
import { FILING_EXPORT_HEADERS, filingExportCells, filingRowsCurrent, type FilingExportRow } from '../../api/filing-export'
import { collectFilingExport, filingExportSheet } from '../../workflow/filing-export'
import { FilingRowsLedger, filingRowsBatchKey } from '../../workflow/filing-rows'
import { downloadXlsxSheets } from '../../customer/xlsx-table'
import { paintTaskCheckProgress } from '../check-progress'
import { fitColumnWidths, type ColumnFit } from '../../shell/column-fit'
import { createTextRuler } from '../../shell/text-width'
import { MessageType, type MessageBridge } from '../../shared/message'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'

/** 导出预览：上表勾选的递交在这里逐件出导出行，行级刷新，取完数按需导出带冻结首行的 xlsx。 */
const props = defineProps<{ bridge?: MessageBridge; rows: FilingSearchRow[]; token: number; downloadToken?: number }>()

const problems = ref<string[]>([])
const running = ref(false)
const collectedToken = ref(-1)
let downloadPending = false
const pageIndex = ref(1)
const pageSize = ref(50)
const pageSizeOptions = [
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' }
]

/**
 * 几万件的导出行不进响应式、也不整摊平：按件记进行档（内存一份 + 恢复账本一份），
 * 翻页才把那一页的行拿出来算格子。没翻到的页不算不渲染，几万件照样轻快；
 * 取数中断了账本里还有，同一批件再导时装回来接着取。
 */
let ledger = new FilingRowsLedger(filingRowsBatchKey([]), [])
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

/** 进度也走背压：一件一报会把响应式刷爆，攒 250ms 一把刷，收尾那笔不等节拍。 */
const doneCount = ref(0)
let paintPending = false
let paintDone = 0
function schedulePaint(): void {
  if (paintPending) return
  paintPending = true
  setTimeout(() => {
    paintPending = false
    doneCount.value = paintDone
  }, 250)
}

const lineCount = computed(() => {
  void previewTick.value
  return ledger.lineCount
})
const totalPages = computed(() => Math.max(Math.ceil(lineCount.value / pageSize.value), 1))
/** 翻页才取行：只把当前页那几十行拿出来算格子，没翻到的页一个字都不算。 */
const pageLines = computed(() => {
  void previewTick.value
  const from = (pageIndex.value - 1) * pageSize.value
  return ledger.page(from, pageSize.value).map(({ key, row }) => ({ key, cells: filingExportCells(row) }))
})

/** 一次退回一行，每行都写全九列（我方文号照常写）；九列加序号的列宽和上表、期限表同一套 column-fit，不出横向滚动条。 */
const exportColumnMode = (head: string): 'lock' | 'grow' | undefined => {
  if (head === '申请日' || head === '案件状态') return 'lock'
  if (head === '退回的原因' || head === '我方文号') return 'grow'
  return undefined
}

const colWidths = ref<number[]>([])
const tableStyle = computed(() => {
  const total = colWidths.value.reduce((sum, width) => sum + width, 0)
  return { width: `${total}px`, minWidth: '100%' }
})
const exportTableHost = ref<HTMLElement | null>(null)
const ruler = createTextRuler()
let observer: ResizeObserver | undefined

/** 和上表、期限表同一套：按文字量出每列下限和内容宽，交给 column-fit 分配；容器窄就压进去，不出横向滚动条。 */
function columnSpecs(header: Element | null, body: Element | null): ColumnFit[] {
  const specs: ColumnFit[] = []
  const add = (title: string, values: string[], mode?: 'lock' | 'grow'): void => {
    const min = ruler.width(title, header) + 16
    let content = min
    for (const value of values) content = Math.max(content, ruler.width(value, body) + 16)
    specs.push({ min, content, lock: mode === 'lock', grow: mode === 'grow' })
  }
  const lines = pageLines.value
  add('序号', lines.map((_, index) => String((pageIndex.value - 1) * pageSize.value + index + 1)), 'lock')
  FILING_EXPORT_HEADERS.forEach((head, cellIndex) => {
    add(head, lines.map(line => line.cells[cellIndex] ?? ''), exportColumnMode(head))
  })
  return specs
}

function layoutColumns(): void {
  const root = exportTableHost.value
  const table = root?.querySelector('table')
  if (!root || !table) return
  if (!pageLines.value.length) {
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
  const lines = pageLines.value
  return [pageIndex.value, pageSize.value,
    ...lines.map(line => line.cells.join('|'))].join('~')
})
watch(measureKey, () => layoutColumns(), { flush: 'post' })

/** 彩虹条同样攒刷：每件都刷一次进度条就是每件一次重绘，几万件直接把界面刷死。 */
let barPending = false
let barLive = false
let barDone = 0
let barTotal = 0
let barStartedAt = 0
function paintTaskCheckProgressThrottled(done: number, total: number, startedAt: number): void {
  barDone = done
  barTotal = total
  barStartedAt = startedAt
  barLive = true
  if (barPending) return
  barPending = true
  setTimeout(() => {
    barPending = false
    // 收尾那笔已经刷过就不再倒回去刷「进行中」。
    if (!barLive) return
    paintTaskCheckProgress(barDone, barTotal, barStartedAt, barDone >= barTotal ? 'done' : 'run')
  }, 250)
}

function failed(message: string): ApiResult<never> {
  return apiError('NETWORK_ERROR', message)
}

let generation = 0

async function run(): Promise<void> {
  const current = ++generation
  ledger = new FilingRowsLedger(filingRowsBatchKey(props.rows), props.rows)
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
  // 同一批件的旧档先装回来：取过的件不再打接口，断点从没取到的那件接着往下走。
  const carried = await ledger.restore()
  if (current !== generation) return
  if (carried) previewTick.value += 1
  // 进度从 0 起数：行档里装回的件也按件报，进度条一路只涨不跌。
  paintDone = 0
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
      known: index => {
        const carried = ledger.filled(index)
        // 旧版行档的行没有 returned 这一位（重复退回的文号是空的），这批件重新取，不装旧行。
        return carried && filingRowsCurrent(carried) ? carried : undefined
      },
      onFiling: (index, lines) => {
        if (current !== generation) return
        ledger.put(index, lines)
        schedulePreview()
      },
      onProgress: (done, total) => {
        if (current !== generation) return
        // 装回的件也在 done 里逐件报（行档里有的件直接过），进度条一路只涨不跌。
        // 进度显示走节拍攒刷，不跟着每件重绘；结束那笔直接刷到位。
        paintDone = done
        if (done >= total) {
          barLive = false
          doneCount.value = done
          paintTaskCheckProgress(done, total, startedAt, 'done')
          return
        }
        schedulePaint()
        paintTaskCheckProgressThrottled(done, total, startedAt)
      }
    })
    if (current !== generation) return
    problems.value = result.problems
    barLive = false
    paintTaskCheckProgress(props.rows.length, props.rows.length, startedAt, 'done')
    // 取完数先刷一次预览；点过「导出 Excel」就直接给文件，不用再点一次。
    previewTick.value += 1
    collectedToken.value = props.token
    void ledger.flush()
    if (downloadPending) {
      downloadPending = false
      if (lineCount.value) exportXlsx()
    }
  } catch {
    if (current === generation) {
      barLive = false
      paintTaskCheckProgress(paintDone, props.rows.length, startedAt, 'fail')
    }
    void ledger.flush()
  } finally {
    if (current === generation) running.value = false
  }
}

watch(() => props.token, () => { void run() }, { immediate: true })

/** 点「导出 Excel」：取好的立刻下文件；没取好的记下来，取完自动下，不用再点一次。 */
watch(() => props.downloadToken ?? 0, value => {
  if (!value) return
  if (!running.value && collectedToken.value === props.token && lineCount.value) {
    exportXlsx()
    return
  }
  downloadPending = true
}, { immediate: true })

function exportXlsx(): void {
  // 全量只在导出这一刻摊平一次，渲染循环里不碰。
  const lines = ledger.all()
  if (!lines.length) return
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  downloadXlsxSheets([filingExportSheet(lines)], `递交管理-已完成导出-${stamp}.xlsx`)
}

function page(delta: number): void {
  const next = pageIndex.value + delta
  if (next < 1 || next > totalPages.value) return
  pageIndex.value = next
}

onMounted(() => {
  layoutColumns()
  observer = new ResizeObserver(() => layoutColumns())
  if (exportTableHost.value) observer.observe(exportTableHost.value)
})

onBeforeUnmount(() => {
  generation += 1
  observer?.disconnect()
  // 关页前把没落账本的行补上，下次同一批件接着取。
  void ledger.flush()
  ruler.dispose()
})
</script>

<template>
  <section class="card filing-export" aria-label="导出预览">
    <div class="section-heading">
      <strong>导出预览</strong>
      <span class="inline-actions">
        <span class="hint">{{ running ? `正在取数 ${doneCount}/${rows.length} 件…` : rows.length ? `已选 ${rows.length} 件，导出行 ${lineCount} 行` : '还没有要导出的递交记录' }}</span>
        <button type="button" class="solid tiny" :disabled="!lineCount" @click="exportXlsx">重新导出</button>
      </span>
    </div>
    <p class="hint">九列口径：我方文号、申请日（没有申请日用申请事项的完成日）、案件流向、处理事项、流程专员（退回者）、代理师（接受者）、代理师所属部门、退回的原因、案件状态。一次退回一行，每行都写我方文号；xlsx 自动冻结首行，表格下方顺延一张前10大退回横向柱状图（按我方文号数退回次数）。</p>
    <p v-if="problems.length" class="error" role="alert">{{ problems.length }} 件没读全：{{ problems.slice(0, 3).join('；') }}</p>
    <p v-if="!lineCount && !running" class="hint">在上面的查询结果里勾选递交记录（全选所有只翻页拉行），点「导出 Excel」才开始取数，取完自动下载。</p>
    <template v-else>
      <div ref="exportTableHost" class="fit-table filing-cols">
        <table class="grid" :style="tableStyle">
          <colgroup>
            <col v-for="(width, index) in colWidths" :key="index" :style="{ width: width + 'px' }" />
          </colgroup>
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
