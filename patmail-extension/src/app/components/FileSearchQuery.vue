<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, ref, watch, computed } from 'vue'
import type { FileSearchQuery } from '../../api/file-search-params'
import { fileSearchTimeoutMs, type FileSearchTimeoutMs } from '../../api/file-search-params'
import { assessQueryScope, fileSearchValueLimit, isFileSearchBusinessField } from '../../api/file-search-params'
import { coerceFileSearchQuery } from '../../api/message-guards'
import type { FileSearchResult, PatentFile } from '../../api/file-search-types'
import { selectPage, toSelectedFile, toggleSelected, type SelectedPatentFile } from '../../mail'
import { fieldLabel } from '../../query/field-registry'
import { paintTaskCheckProgress, resetTaskCheckProgress, taskCheckProgress } from '../check-progress'
import { runPagedFetch, type PageFetchResult } from '../page-pool'
import QueryTemplateSection from '../../floating/QueryTemplateSection.vue'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import { MessageType, type MessageBridge } from '../../shared/message'
import type { FileDownloadSelection } from '../../mail/download-name'
import { downloadNameText } from '../../mail/download-name'

const props = withDefaults(defineProps<{
  userId: string
  origin: string
  canSearch: boolean
  seed?: Record<string, string> | null
  seedToken?: number
  selectable?: boolean
  epoch?: number
}>(), { seed: null, seedToken: 0, selectable: false, epoch: 0 })

const selected = defineModel<Record<string, SelectedPatentFile>>('selected', { default: () => ({}) })

const emit = defineEmits<{
  searched: [query: FileSearchQuery]
  'download-name': [selection: FileDownloadSelection | null]
  plan: []
  review: []
}>()

const bridge = inject<MessageBridge>('bridge')
const queryForm = ref<InstanceType<typeof QueryTemplateSection> | null>(null)
const downloadSelection = ref<FileDownloadSelection | null>(null)
const stripAppNoDot = ref(true)
const downloading = ref(false)
const toolbarNotice = ref('')
/** 按钮悬浮提示：下载用的名称是点的一刻读表单当前值，查询之后改也不用重新查。 */
const downloadTitle = computed(() => {
  const name = downloadNameText(downloadSelection.value)
  return name ? `按「${name}」生成文件名；下载时读取表单当前值` : '用查询结果里的附件原名打包下载'
})
const searchTimeoutMs = ref<FileSearchTimeoutMs>(60_000)
const pageSize = ref(20)
const pageSizeOptions = [
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' }
]
const resultColumns = [
  { key: 'fileName', label: '附件名称', width: '15%' },
  { key: 'fileStatus', label: '处理状态', width: '6%' },
  { key: 'caseVolume', label: '我方文号', width: '10%' },
  { key: 'customerVolume', label: '客户文号', width: '10%' },
  { key: 'caseName', label: '案件名称', width: '11%' },
  { key: 'officialPostDate', label: '官方发文日', width: '8%' },
  { key: 'fileDescription', label: '文件描述', width: '10%' },
  { key: 'ctrlProc', label: '处理事项', width: '6%' },
  { key: 'applicationType', label: '申请类型', width: '5%' },
  { key: 'fileType', label: '文件类型', width: '5%' },
  { key: 'uploadTime', label: '上传时间', width: '7%' }
] as const
const querySessionId = ref('')
const sourceNotice = ref('')
const searchState = ref<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle')
const searchMessage = ref('')
const result = ref<FileSearchResult | null>(null)
const pageAllSelected = computed(() => {
  const items = result.value?.items ?? []
  return items.length > 0 && items.every(file => Boolean(selected.value[file.fileId]))
})
const resultsSection = ref<HTMLElement | null>(null)
const lastQuery = ref<FileSearchQuery | null>(null)
let generation = 0

function messageForError(code: string, message: string): string {
  if (code === 'SESSION_EXPIRED') return 'EASY 登录已失效，请在原网站重新登录后检测。'
  if (code === 'AUTH_UNKNOWN') return '无法确认当前登录状态，请重试。'
  if (code === 'REQUEST_TIMEOUT') return `原网站查询太慢，没有在 ${searchTimeoutMs.value / 60_000} 分钟内返回。可以把超时时间调长，或把我方文号、申请号写具体一点再查。`
  if (code === 'NETWORK_ERROR') return '网络异常，请检查 EASY 网站连接。'
  return message || '请求失败，请稍后重试。'
}

/** 超长条件不能悄悄丢：丢掉后查询会退化成全库，宁可这次不查。 */
function fieldsFor(query: FileSearchQuery): { fields: Record<string, string>; oversized: string[] } {
  const fields: Record<string, string> = {}
  const oversized: string[] = []
  for (const [key, value] of Object.entries(query.resolvedFields ?? {})) {
    if (!isFileSearchBusinessField(key) || typeof value !== 'string') continue
    if (value.length > fileSearchValueLimit(key)) {
      oversized.push(fieldLabel(key))
      continue
    }
    fields[key] = value
  }
  if (query.caseVolume?.trim()) fields.case_volume = query.caseVolume.trim()
  if (fields.is_close !== undefined) {
    fields.is_close = fields.is_close.trim() === '1' || fields.is_close.trim() === '否' ? '1' : ''
  }
  return { fields, oversized }
}

function reloadExtension(): void {
  const runtime = (globalThis as { chrome?: { runtime?: { reload?: () => void } } }).chrome?.runtime
  if (typeof runtime?.reload === 'function') {
    runtime.reload()
    return
  }
  searchMessage.value = '当前页面不能直接重载扩展。请到扩展管理页重新加载 PatMail。'
}

async function showResults(): Promise<void> {
  await nextTick()
  const section = resultsSection.value
  const viewport = section?.closest<HTMLElement>('.body')
  if (section && viewport) {
    viewport.scrollTop += section.getBoundingClientRect().top - viewport.getBoundingClientRect().top
  }
}

async function executeSearch(query: FileSearchQuery, run: 'start' | 'continue' = 'start', timeoutMs?: FileSearchTimeoutMs): Promise<void> {
  if (timeoutMs !== undefined) searchTimeoutMs.value = fileSearchTimeoutMs(timeoutMs)
  if (!bridge || !props.canSearch) return
  const { fields, oversized } = fieldsFor(query)
  if (oversized.length) {
    searchState.value = 'error'
    searchMessage.value = `${oversized.join('、')}太长，这次没有查询：条件被丢掉会退化成全库查询。把编号列表拆短一点再查。`
    result.value = null
    lastQuery.value = null
    void showResults()
    return
  }
  const resolvedEnough = assessQueryScope(fields).sufficient
  if (!resolvedEnough && ![query.caseVolume, query.applicationNo, query.customerName, query.fileName, query.fileDescriptionId].some(value => value?.trim())) {
    searchState.value = 'error'
    searchMessage.value = '请输入查询条件。'
    result.value = null
    lastQuery.value = null
    void showResults()
    return
  }
  const current = ++generation
  const next = coerceFileSearchQuery({ ...query, resolvedFields: fields, pageIndex: query.pageIndex || 1, pageSize: query.pageSize || pageSize.value }) ?? {
    resolvedFields: fields, pageIndex: 1, pageSize: pageSize.value
  }
  lastQuery.value = next
  emit('searched', next)
  searchState.value = 'loading'
  searchMessage.value = ''
  toolbarNotice.value = ''
  result.value = null
  try {
    const continuation = run === 'continue' && querySessionId.value ? { querySessionId: querySessionId.value } : undefined
    const response = await bridge.request({ type: MessageType.SearchFiles, payload: continuation ? { query: next, continuation, timeoutMs: searchTimeoutMs.value } : { query: next, timeoutMs: searchTimeoutMs.value } })
    if (current !== generation) return
    if (response.type !== MessageType.SearchFilesResult) {
      searchState.value = 'error'
      searchMessage.value = response.type === MessageType.Error ? response.payload.message : '文件查询返回了意外结果。'
      void showResults()
      return
    }
    if (!response.payload.ok) {
      searchState.value = 'error'
      searchMessage.value = messageForError(response.payload.error.code, response.payload.error.message)
      void showResults()
      return
    }
    result.value = response.payload.data
    sourceNotice.value = response.payload.data.sourceMessage ?? ''
    if (response.payload.data.sourceCode === 'QUERY_SESSION_INVALID' || response.payload.data.sourceCode === 'QUERY_LAYOUT_CHANGED') querySessionId.value = ''
    else if (response.payload.data.querySessionId) querySessionId.value = response.payload.data.querySessionId
    if (run === 'start') selected.value = {}
    searchState.value = result.value.total === 0 ? 'empty' : 'success'
    void showResults()
  } catch {
    if (current !== generation) return
    searchState.value = 'error'
    searchMessage.value = '文件查询通信失败，请重试。'
    void showResults()
  }
}

function rowNo(index: number): number {
  const page = result.value?.pageIndex ?? 1
  const size = result.value?.pageSize ?? pageSize.value
  return (page - 1) * size + index + 1
}
function cellText(file: PatentFile, key: typeof resultColumns[number]['key']): string {
  return file[key]?.trim() ?? ''
}
function togglePage(event: Event): void {
  const items = result.value?.items ?? []
  const on = (event.target as HTMLInputElement).checked
  selected.value = selectPage(selected.value, items.map(file => toSelectedFile(file, selected.value[file.fileId]?.customerProfileId, querySessionId.value)), on)
}
function refresh(): void {
  if (lastQuery.value) void executeSearch({ ...lastQuery.value }, 'continue')
}
function changePageSize(): void {
  if (!lastQuery.value || !props.canSearch || ![20, 50, 100].includes(pageSize.value)) return
  void executeSearch({ ...lastQuery.value, pageIndex: 1, pageSize: pageSize.value }, 'start')
}
function page(delta: number): void {
  if (!lastQuery.value || !result.value || searchState.value === 'loading') return
  const next = lastQuery.value.pageIndex + delta
  if (next < 1 || next > result.value.totalPages) return
  void executeSearch({ ...lastQuery.value, pageIndex: next }, 'continue')
}
function clearView(): void {
  generation += 1
  result.value = null
  lastQuery.value = null
  querySessionId.value = ''
  sourceNotice.value = ''
  toolbarNotice.value = ''
  searchState.value = 'idle'
  searchMessage.value = ''
  selected.value = {}
}

function onDownloadName(selection: FileDownloadSelection | null): void {
  downloadSelection.value = selection
  emit('download-name', selection)
}

/** 勾选的文件按下载名称打包下载；包里文件名的申请号校验点已去掉。 */
async function downloadSelected(): Promise<void> {
  const files = Object.values(selected.value)
  if (!bridge || !files.length || downloading.value) return
  if (files.some(file => !file.fileNo?.trim())) {
    toolbarNotice.value = '有文件缺文件编号，没有打包下载。换个查询条件重新查一次再选。'
    return
  }
  downloading.value = true
  toolbarNotice.value = '正在打包下载…'
  // 下载名称不进查询：点下载的一刻再取一次表单当前值，查询之后改模板或固定字符都按新的来。
  const selection = queryForm.value?.currentDownloadSelection() ?? downloadSelection.value
  try {
    const response = await bridge.request({
      type: MessageType.DownloadFiles,
      payload: {
        items: files.map(file => ({ fileId: file.fileId, fileNo: file.fileNo?.trim() ?? '', fileName: file.fileName })),
        selection,
        stripAppNoDot: stripAppNoDot.value
      }
    })
    if (response.type !== MessageType.DownloadFilesResult) {
      toolbarNotice.value = response.type === MessageType.Error ? response.payload.message : '下载返回了意外结果。'
      return
    }
    if (!response.payload.ok) {
      toolbarNotice.value = messageForError(response.payload.error.code, response.payload.error.message)
      return
    }
    const data = response.payload.data
    toolbarNotice.value = `已下载 ${data.fileName}（${data.fileCount} 个文件${stripAppNoDot.value ? '，文件名里申请号已去掉校验点' : ''}）。${data.notice}`
  } catch {
    toolbarNotice.value = '下载通信失败，请重试。'
  } finally {
    downloading.value = false
  }
}

/** 全选本页 / 取消全选本页：只动当前页的行，其他页已选的不受影响。 */
function selectCurrentPage(on: boolean): void {
  const items = result.value?.items ?? []
  if (!items.length) return
  selected.value = selectPage(selected.value, items.map(file => toSelectedFile(file, selected.value[file.fileId]?.customerProfileId, querySessionId.value)), on)
}

/** 全选所有进行中把「预计几点完成」也写在按钮旁，翻页快时彩虹条一闪而过也看得到。 */
const pagingHint = computed(() => selectingAll.value
  ? (taskCheckProgress.eta ? `（全选所有进行中，预计 ${taskCheckProgress.eta} 完成）` : '（全选所有进行中…）')
  : '')

/** 全选所有翻页的进度：彩虹条动词换成「翻页」。并发拉页时哪页先回不一定，按读回的页数计。 */
const paging = { startedAt: 0, total: 0, done: 0 }

function paintPaging(status: 'run' | 'done' | 'fail'): void {
  paintTaskCheckProgress(paging.done, paging.total, paging.startedAt, status, '翻页')
}

function tickPage(): void {
  paging.done += 1
  paintPaging(paging.done >= paging.total ? 'done' : 'run')
}

function describeMissed(pages: number[]): string {
  return `第 ${pages.slice(0, 8).join('、')}${pages.length > 8 ? ' 等' : ''} 页`
}

/** 一页只调一次；重试、并发、漏页统计都在 runPagedFetch 里。batch：批量拉页不占「新查询取消旧查询」的槽，并发几页才不会互相 abort。 */
async function fetchPage(page: number, size: number): Promise<PageFetchResult<SelectedPatentFile>> {
  const query = lastQuery.value
  if (!bridge || !query) return { ok: false, session: true }
  try {
    const response = await bridge.request({
      type: MessageType.SearchFiles,
      payload: {
        query: { ...query, pageIndex: page, pageSize: size },
        ...(querySessionId.value ? { continuation: { querySessionId: querySessionId.value } } : {}),
        timeoutMs: searchTimeoutMs.value,
        batch: true as const
      }
    })
    if (response.type === MessageType.SearchFilesResult && response.payload.ok) {
      // 查询运行失效（重新查询过、页布局变了）时这批行带的来源 ID 已经死了，再拉也没法下载，停手比重试省时间。
      if (response.payload.data.sourceCode === 'QUERY_SESSION_INVALID' || response.payload.data.sourceCode === 'QUERY_LAYOUT_CHANGED') {
        return { ok: false, session: true }
      }
      return { ok: true, rows: response.payload.data.items.map(file => toSelectedFile(file, undefined, querySessionId.value)) }
    }
    const message = response.type === MessageType.SearchFilesResult && !response.payload.ok
      ? messageForError(response.payload.error.code, response.payload.error.message)
      : response.type === MessageType.Error ? response.payload.message : '这一页没有返回结果。'
    return { ok: false, session: /登录|会话已变化|尚未确认|尚未连接|标签页已失效/.test(message) }
  } catch {
    return { ok: false, session: false }
  }
}

function collectPages(pages: number[], size: number): Promise<number[]> {
  return runPagedFetch(pages, page => fetchPage(page, size), {
    // 边拉边勾上，已选数字跟着涨；selectPage 会保留已经绑好的客户。
    onPage: (_page, rows) => {
      selected.value = selectPage(selected.value, rows, true)
      tickPage()
    }
  })
}

/** 全选所有：并发把每一页的行拉回来勾上（6 路把请求打满），翻页时顶栏有进度条；下载数量不设上限。
 * 有漏的自动兜一轮，再不行留按钮补。 */
const selectingAll = ref(false)
const failedPages = ref<number[]>([])
async function selectAllPages(): Promise<void> {
  const summary = result.value
  if (!bridge || !lastQuery.value || !summary || selectingAll.value) return
  const totalPages = Math.max(1, summary.totalPages)
  selectingAll.value = true
  failedPages.value = []
  toolbarNotice.value = ''
  try {
    const all = Array.from({ length: totalPages }, (_, index) => index + 1)
    paging.startedAt = Date.now()
    paging.total = all.length
    paging.done = 0
    paintPaging('run')
    let missed = await collectPages(all, summary.pageSize)
    if (missed.length) missed = await collectPages(missed, summary.pageSize)
    failedPages.value = missed
    paintPaging('done')
    toolbarNotice.value = missed.length
      ? `全选所有有 ${missed.length} 页没读到（${describeMissed(missed)}）。已勾上的不受影响，点「重试没读到的页」补齐。`
      : `已全选 ${Object.keys(selected).length} 个文件。`
  } catch {
    paintPaging('fail')
    toolbarNotice.value = '翻页取行失败，没有全选。'
  } finally {
    selectingAll.value = false
    setTimeout(() => {
      if (taskCheckProgress.label === '翻页') resetTaskCheckProgress()
    }, 2_000)
  }
}

/** 容灾补齐：只重拉没读到的页，已勾上的不动。 */
async function retryFailedPages(): Promise<void> {
  const summary = result.value
  const pages = failedPages.value
  if (!bridge || !summary || selectingAll.value || !pages.length) return
  selectingAll.value = true
  try {
    // 重试这一轮自己的页数和起点，不然接在上一轮 100% 后面就再也算不出预计完成时间。
    paging.startedAt = Date.now()
    paging.total = pages.length
    paging.done = 0
    paintPaging('run')
    let missed = await collectPages(pages, summary.pageSize)
    if (missed.length) missed = await collectPages(missed, summary.pageSize)
    failedPages.value = missed
    paintPaging('done')
    toolbarNotice.value = missed.length
      ? `还有 ${missed.length} 页没读到（${describeMissed(missed)}）。已勾上的不受影响，可以再试。`
      : '没读到的页都补齐了。'
  } catch {
    paintPaging('fail')
    toolbarNotice.value = '翻页取行失败。'
  } finally {
    selectingAll.value = false
    setTimeout(() => {
      if (taskCheckProgress.label === '翻页') resetTaskCheckProgress()
    }, 2_000)
  }
}

watch(() => props.epoch, () => { clearView() })
watch(() => props.seedToken, () => {
  if (!props.seedToken || !props.seed) return
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(props.seed)) {
    const text = value.trim()
    if (!text || text.length > fileSearchValueLimit(key)) continue
    if (key === 'is_close') {
      if (text === '1' || text === '否') fields.is_close = '1'
      continue
    }
    fields[key] = text
  }
  void executeSearch({ resolvedFields: fields, pageIndex: 1, pageSize: pageSize.value }, 'start', searchTimeoutMs.value)
})

onBeforeUnmount(() => {
  generation += 1
  if (bridge) void bridge.request({ type: MessageType.CancelFileSearch })
})
</script>

<template>
  <div class="file-search-query">
    <p class="hint">结案默认包含在结果里。更多案件条件里的「是否包含结案」选「否」，结案文件才不会出现。不要把那种空结果当成库里没有。</p>
    <QueryTemplateSection
      ref="queryForm"
      :bridge="bridge"
      :can-search="canSearch"
      :user-id="userId"
      :origin="origin"
      mode="history"
      :manage="false"
      :page-size="pageSize"
      :seed="seed"
      :seed-token="seedToken"
      @search="(query, timeoutMs) => executeSearch(query, 'start', timeoutMs)"
      @download-name="onDownloadName"
    />
    <slot />
    <section ref="resultsSection" class="card file-results" aria-label="查询结果">
      <div class="section-heading">
        <strong>查询结果</strong>
        <label class="page-size">每页数量
          <ThemeSelect v-model="pageSize" :disabled="!canSearch || searchState === 'loading'" :options="pageSizeOptions" @change="changePageSize" />
        </label>
        <button type="button" class="text-button" :disabled="!canSearch || !lastQuery || searchState === 'loading'" @click="refresh">刷新</button>
      </div>
      <div v-if="result" class="result-toolbar">
        <span>共 {{ result.total }} 个文件</span>
      </div>
      <p v-if="searchState === 'idle'" class="hint">输入条件后查询文件。</p>
      <p v-else-if="searchState === 'loading'" class="hint" role="status">正在查询…</p>
      <p v-else-if="searchState === 'error'" class="error" role="alert">{{ searchMessage }}</p>
      <button v-if="searchState === 'error' && searchMessage.includes('没有接住')" type="button" class="solid tiny" @click="reloadExtension">重新加载扩展</button>
      <p v-else-if="searchState === 'empty'" class="hint" role="status">没有符合条件的文件。结案仍会查到；若把「是否包含结案」选成了「否」，结案文件不会出现。</p>
      <template v-else-if="result">
        <p v-if="sourceNotice" class="hint" role="status">{{ sourceNotice }}</p>
        <div v-if="selectable" class="result-toolbar">
          <button type="button" class="ghost" :disabled="!result || searchState === 'loading'" @click="selectCurrentPage(true)">全选本页</button>
          <button type="button" class="ghost" :disabled="!result || Object.keys(selected).length === 0" @click="selectCurrentPage(false)">取消全选本页</button>
          <button type="button" class="ghost" :disabled="!result || selectingAll" @click="selectAllPages">{{ selectingAll ? '正在全选…' : '全选所有' }}</button>
          <button type="button" class="ghost" :disabled="Object.keys(selected).length === 0" @click="selected = {}">取消全选所有</button>
          <button v-if="failedPages.length" type="button" class="ghost" :disabled="selectingAll" @click="retryFailedPages">重试没读到的 {{ failedPages.length }} 页</button>
          <span class="hint">已选 {{ Object.keys(selected).length }} 个文件{{ pagingHint }}</span>
          <label class="download-opt" title="勾上后文件名里的申请号去掉校验点：202610026334.9 变 2026100263349，扩展名不动"><input v-model="stripAppNoDot" type="checkbox" />申请号去点</label>
          <button type="button" class="solid tiny" :disabled="Object.keys(selected).length === 0 || downloading" :title="downloadTitle" @click="downloadSelected">{{ downloading ? '正在打包下载…' : '下载已选' }}</button>
        </div>
        <p v-if="toolbarNotice" class="hint" role="status">{{ toolbarNotice }}</p>
        <div class="table-scroll">
          <table class="grid">
            <colgroup>
              <col v-if="selectable" class="check" />
              <col class="seq" />
              <col v-for="column in resultColumns" :key="column.key" :style="{ width: column.width }" />
            </colgroup>
            <thead>
              <tr>
                <th v-if="selectable" class="check">
                  <input type="checkbox" aria-label="当前页全选" :checked="pageAllSelected" @change="togglePage" />
                </th>
                <th class="seq">序号</th>
                <th v-for="column in resultColumns" :key="column.key">{{ column.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(file, index) in result.items" :key="file.fileId" :class="{ 'is-selected': Boolean(selected[file.fileId]) }">
                <td v-if="selectable" class="check">
                  <input type="checkbox" :aria-label="file.fileName" :checked="Boolean(selected[file.fileId])" @change="selected = toggleSelected(selected, toSelectedFile(file, selected[file.fileId]?.customerProfileId, querySessionId))" />
                </td>
                <td class="seq">{{ rowNo(index) }}</td>
                <td v-for="column in resultColumns" :key="column.key">
                  <span class="clip" v-hint.clip="cellText(file, column.key)">{{ cellText(file, column.key) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <nav class="pagination" aria-label="文件分页">
          <button type="button" :disabled="result.pageIndex <= 1" @click="page(-1)">上一页</button>
          <span>第 {{ result.pageIndex }} / {{ result.totalPages }} 页</span>
          <button type="button" :disabled="result.pageIndex >= result.totalPages" @click="page(1)">下一页</button>
        </nav>
      </template>
    </section>
  </div>
</template>
