<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ThemeSelect from '../../../shell/components/ThemeSelect.vue'
import {
  NOTICE_IMPORT_COMPLETED_COLUMNS,
  NOTICE_TABLE_COLUMNS,
  formatCertProcessStatus,
  formatDownloadProcessStatus,
  noticeCellRaw,
  noticeRowKey
} from '../../../api/notice-params'
import type { NoticeRow, NoticeTabId } from '../../../api/notice-types'
import { noticeLoadingHint, noticeLoadingTitle } from './notice-loading'

const props = withDefaults(defineProps<{
  tab: NoticeTabId
  importStatus?: '0' | '1'
  rows: NoticeRow[]
  total: number
  pageIndex: number
  pageSize: number
  selectedKeys: string[]
  flaggedKeys?: string[]
  loading: boolean
  loadingLabel?: string
  loadedOnce?: boolean
  errorMessage?: string
  needCpcLogin?: boolean
  loginMessage?: string
}>(), {
  importStatus: '0',
  flaggedKeys: () => [],
  loadingLabel: '',
  loadedOnce: true,
  errorMessage: '',
  needCpcLogin: false,
  loginMessage: ''
})

const emit = defineEmits<{
  'update:selectedKeys': [keys: string[]]
  'page-change': [pageIndex: number]
  'size-change': [pageSize: number]
  inspect: [row: NoticeRow]
  'inspect-app-no': [row: NoticeRow]
  openEasy: []
  retry: []
}>()

const PAGE_SIZE_OPTIONS = [
  { value: 20, label: '20 条/页' },
  { value: 50, label: '50 条/页' },
  { value: 100, label: '100 条/页' },
  { value: 200, label: '200 条/页' }
]

const loadingElapsedSec = ref(0)
let loadingTimer: ReturnType<typeof setInterval> | null = null

function clearLoadingTimer(): void {
  if (loadingTimer !== null) {
    clearInterval(loadingTimer)
    loadingTimer = null
  }
}

watch(
  () => props.loading,
  isLoading => {
    clearLoadingTimer()
    loadingElapsedSec.value = 0
    if (isLoading) {
      const startedAt = Date.now()
      loadingTimer = setInterval(() => {
        loadingElapsedSec.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      }, 1000)
    }
  },
  { immediate: true }
)

onBeforeUnmount(clearLoadingTimer)

const loadingTitle = computed(() => noticeLoadingTitle(props.tab, props.loadingLabel))
const loadingHint = computed(() =>
  noticeLoadingHint(loadingElapsedSec.value, Boolean(props.loadingLabel.trim()))
)

const columns = computed(() =>
  props.tab === 'import' && props.importStatus === '1'
    ? NOTICE_IMPORT_COMPLETED_COLUMNS
    : NOTICE_TABLE_COLUMNS[props.tab]
)
const CHECK_COL_WEIGHT = 28
const ACTION_COL_WEIGHT = 48
const showActionCol = computed(() => props.tab !== 'cert' && props.tab !== 'replay' && props.tab !== 'handExcel')

function colWeight(width?: string): number {
  return Number.parseInt(width ?? '', 10) || 150
}

const totalColWeight = computed(() =>
  columns.value.reduce((sum, col) => sum + colWeight(col.width), CHECK_COL_WEIGHT + (showActionCol.value ? ACTION_COL_WEIGHT : 0))
)

function colWidthPercent(weight: number): string {
  return `${((weight / totalColWeight.value) * 100).toFixed(2)}%`
}
const hasClickableAppNo = computed(() => columns.value.some(c => Boolean(c.clickableAppNo)))
const totalPages = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))))
const selectedSet = computed(() => new Set(props.selectedKeys))
const flaggedSet = computed(() => new Set(props.flaggedKeys))
const pageKeys = computed(() => props.rows.map(row => noticeRowKey(props.tab, row)).filter(Boolean))

function isRowFlagged(row: NoticeRow): boolean {
  const key = noticeRowKey(props.tab, row)
  if (!key) return false
  if (flaggedSet.value.has(key)) return true
  return (
    props.tab === 'import' &&
    props.importStatus === '0' &&
    selectedSet.value.has(key) &&
    !String(row.case_volume ?? '').trim()
  )
}
const allChecked = computed(() => pageKeys.value.length > 0 && pageKeys.value.every(k => selectedSet.value.has(k)))

function toggleAll(checked: boolean): void {
  if (checked) {
    const merged = new Set([...props.selectedKeys, ...pageKeys.value])
    emit('update:selectedKeys', [...merged])
  } else {
    const drop = new Set(pageKeys.value)
    emit('update:selectedKeys', props.selectedKeys.filter(k => !drop.has(k)))
  }
}

function toggleOne(row: NoticeRow, checked: boolean): void {
  const key = noticeRowKey(props.tab, row)
  if (!key) return
  if (checked) {
    if (!selectedSet.value.has(key)) emit('update:selectedKeys', [...props.selectedKeys, key])
  } else {
    emit('update:selectedKeys', props.selectedKeys.filter(k => k !== key))
  }
}

function formatCell(row: NoticeRow, key: string): string {
  const raw = noticeCellRaw(props.tab, row, key)
  if (key === 'is_handle') {
    if (raw === true || raw === 1 || raw === '1') return '已处理'
    if (raw === false || raw === 0 || raw === '0') return '未处理'
  }
  if (props.tab === 'download' && key === 'status') {
    return formatDownloadProcessStatus(raw, row.remark).text
  }
  if (props.tab === 'cert' && key === 'status') {
    return formatCertProcessStatus(raw, row.remark).text
  }
  if (props.tab === 'replay' && key === 'status') {
    const val = typeof raw === 'string' ? raw.trim() : ''
    if (val === 'fail') return typeof row.remark === 'string' && row.remark ? row.remark : '分析失败'
    if (val === 'finish' || val === 'success') return '分析成功'
    return val || '未处理'
  }
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'boolean') return raw ? '是' : '否'
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw)
  return ''
}

function isRedCaseName(row: NoticeRow, key: string): boolean {
  if (props.tab !== 'import' || key !== 'case_name') return false
  return row.is_checkname === false || row.is_checkname === 0 || row.is_checkname === '0'
}

function isMultiCaseCell(row: NoticeRow, key: string): boolean {
  return props.tab === 'import' && key === 'case_name' && Boolean(row.is_multi_case)
}

function isRedErrorCell(row: NoticeRow, key: string): boolean {
  return key === 'oa_error_msg' && typeof row.oa_error_msg === 'string' && row.oa_error_msg.trim().length > 0
}

function statusClass(row: NoticeRow, key: string): string {
  if (props.tab === 'download' && key === 'status') {
    const tone = formatDownloadProcessStatus(row.status, row.remark).tone
    return tone === 'ok' ? 'status 已完成' : tone === 'warn' ? 'status 执行中' : tone === 'fail' ? 'status 失败' : ''
  }
  if (props.tab === 'cert' && key === 'status') {
    const tone = formatCertProcessStatus(row.status, row.remark).tone
    return tone === 'ok' ? 'status 已完成' : tone === 'warn' ? 'status 执行中' : tone === 'fail' ? 'status 失败' : ''
  }
  if (key !== 'status' && key !== 'oa_error_msg' && key !== 'is_handle') return ''
  const val = typeof row[key] === 'string' || typeof row[key] === 'number' ? String(row[key]) : ''
  if (val === 'fail' || (key === 'oa_error_msg' && val.trim().length > 0)) return 'status 失败'
  if (val === 'finish' || val === 'process' || val === 'success' || val === '2' || row[key] === true) return 'status 已完成'
  if (val === 'processing' || val === '1') return 'status 执行中'
  return ''
}

function canInspectRow(row: NoticeRow): boolean {
  return typeof row.oa_id === 'string' && row.oa_id.trim().length > 0
}
</script>

<template>
  <section class="card notice-table-card">
    <div v-if="loading" class="notice-loading-bar" aria-hidden="true" />
    <div v-if="needCpcLogin" class="notice-cpc-banner">
      <p>{{ loginMessage || '当前 CPC 账号需要扫码登录后才能拉取记录。' }}</p>
      <button type="button" class="solid tiny" @click="emit('openEasy')">前往原站扫码登录</button>
    </div>

    <div v-if="loading && rows.length > 0" class="notice-refresh-banner" role="status" aria-live="polite">
      <span class="notice-spinner" aria-hidden="true" />
      <strong>{{ loadingTitle }}</strong>
      <span class="notice-elapsed-pill">已等待 {{ loadingElapsedSec }}s</span>
      <span class="notice-loading-sub">{{ loadingHint }}</span>
    </div>

    <div class="fit-table limit-cols">
      <table class="grid">
        <thead>
          <tr>
            <th class="check" :style="{ width: colWidthPercent(CHECK_COL_WEIGHT) }">
              <input
                type="checkbox"
                aria-label="全选本页"
                :checked="allChecked"
                :disabled="rows.length === 0"
                @change="toggleAll(($event.target as HTMLInputElement).checked)"
              />
            </th>
            <th
              v-for="col in columns"
              :key="col.key"
              :style="{ width: colWidthPercent(colWeight(col.width)) }"
            >
              {{ col.label }}
            </th>
            <th v-if="showActionCol" :style="{ width: colWidthPercent(ACTION_COL_WEIGHT) }">操作</th>
          </tr>
        </thead>
        <tbody :class="{ 'is-refreshing': loading && rows.length > 0 }">
          <template v-if="loading && rows.length === 0">
            <tr class="notice-loading-row">
              <td :colspan="columns.length + (showActionCol ? 2 : 1)" class="notice-loading-cell">
                <div class="notice-loading-panel" role="status" aria-live="polite">
                  <span class="notice-spinner is-lg" aria-hidden="true" />
                  <div class="notice-loading-copy">
                    <div class="notice-loading-head">
                      <strong>{{ loadingTitle }}</strong>
                      <span class="notice-elapsed-pill">已等待 {{ loadingElapsedSec }}s</span>
                    </div>
                    <p>{{ loadingHint }}</p>
                  </div>
                </div>
              </td>
            </tr>
            <tr v-for="n in 4" :key="'skeleton-' + n" class="notice-skeleton-row" aria-hidden="true">
              <td class="check"><span class="notice-skeleton is-box" /></td>
              <td v-for="col in columns" :key="col.key">
                <span class="notice-skeleton" :style="{ width: n % 2 === 0 ? '72%' : '58%' }" />
              </td>
              <td v-if="showActionCol"><span class="notice-skeleton is-short" /></td>
            </tr>
          </template>
          <tr v-else-if="rows.length === 0 && errorMessage">
            <td :colspan="columns.length + (showActionCol ? 2 : 1)" class="limit-empty is-error notice-empty-padded">
              <span>查询未完成：{{ errorMessage }}（尚未获取到列表数据）</span>
              <button type="button" class="go notice-empty-btn" @click="emit('retry')">重新查询</button>
            </td>
          </tr>
          <tr v-else-if="rows.length === 0 && needCpcLogin">
            <td :colspan="columns.length + (showActionCol ? 2 : 1)" class="limit-empty notice-empty-padded">
              当前 CPC 账号需要扫码登录后才能查询数据
            </td>
          </tr>
          <tr v-else-if="rows.length === 0 && !loadedOnce">
            <td :colspan="columns.length + (showActionCol ? 2 : 1)" class="limit-empty notice-empty-padded">
              <span>尚未获取列表数据，请点击「查询」加载</span>
              <button type="button" class="go notice-empty-btn" @click="emit('retry')">立即查询</button>
            </td>
          </tr>
          <tr v-else-if="rows.length === 0">
            <td :colspan="columns.length + (showActionCol ? 2 : 1)" class="limit-empty notice-empty-padded">
              当前条件下暂无数据
            </td>
          </tr>
          <tr
            v-for="(row, idx) in rows"
            :key="noticeRowKey(tab, row) || idx"
            :class="{ 'notice-row-multi': Boolean(row.is_multi_case) }"
          >
            <td class="check" :class="{ 'notice-check-flagged': isRowFlagged(row) }">
              <input
                type="checkbox"
                aria-label="选择当前行"
                :checked="selectedSet.has(noticeRowKey(tab, row))"
                @change="toggleOne(row, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td
              v-for="col in columns"
              :key="col.key"
              :class="{
                'volume-corrected': isRedCaseName(row, col.key) || isRedErrorCell(row, col.key),
                'is-multi-case': isMultiCaseCell(row, col.key)
              }"
            >
              <button
                v-if="col.clickable && canInspectRow(row)"
                type="button"
                class="go clip"
                v-hint.clip="formatCell(row, col.key)"
                @click="emit('inspect', row)"
              >
                {{ formatCell(row, col.key) || '查看' }}
              </button>
              <button
                v-else-if="col.clickableAppNo && formatCell(row, col.key)"
                type="button"
                class="go clip"
                v-hint="'查看案件已有官文列表'"
                @click="emit('inspect-app-no', row)"
              >
                {{ formatCell(row, col.key) }}
              </button>
              <span
                v-else
                class="clip"
                :class="statusClass(row, col.key)"
                v-hint.clip="formatCell(row, col.key)"
              >
                {{ formatCell(row, col.key) }}
              </span>
            </td>
            <td v-if="showActionCol">
              <button
                v-if="canInspectRow(row)"
                type="button"
                class="go"
                @click="emit('inspect', row)"
              >
                {{ tab === 'import' && importStatus === '0' ? '编辑' : '详情' }}
              </button>
              <button
                v-else-if="hasClickableAppNo && (row.ShenQingH || row.zhuanlisqh)"
                type="button"
                class="go"
                @click="emit('inspect-app-no', row)"
              >
                查看
              </button>
              <span v-else class="notice-muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pager">
      <span>共 {{ total }} 条（本页 {{ rows.length }} 条）</span>
      <div class="notice-pager-controls">
        <ThemeSelect
          :model-value="pageSize"
          :options="PAGE_SIZE_OPTIONS"
          aria-label="每页显示条数"
          @update:model-value="emit('size-change', Number($event))"
        />
        <button type="button" :disabled="pageIndex <= 1 || loading" @click="emit('page-change', 1)">首页</button>
        <button type="button" :disabled="pageIndex <= 1 || loading" @click="emit('page-change', pageIndex - 1)">上一页</button>
        <span>第 {{ pageIndex }} / {{ totalPages }} 页</span>
        <button type="button" :disabled="pageIndex >= totalPages || loading" @click="emit('page-change', pageIndex + 1)">下一页</button>
        <button type="button" :disabled="pageIndex >= totalPages || loading" @click="emit('page-change', totalPages)">末页</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.notice-table-card {
  position: relative;
}

.notice-table-card .fit-table.limit-cols {
  overflow-x: hidden;
}

.notice-loading-bar {
  position: absolute;
  top: 0;
  left: 12px;
  right: 12px;
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 79, 147, 0.15) 0%, #ff4f93 45%, #ff8cb8 65%, rgba(255, 79, 147, 0.15) 100%);
  background-size: 200% 100%;
  animation: notice-shimmer 1.3s linear infinite;
}

.notice-refresh-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px 12px;
  border: 1px solid #f7c8db;
  border-radius: 12px;
  background: linear-gradient(90deg, #fff5f9 0%, #ffffff 100%);
  font-size: 12.5px;
  color: #7c2d50;
}

.notice-refresh-banner .notice-loading-sub {
  color: var(--sub);
}

.notice-table-card table.grid tbody.is-refreshing {
  opacity: 0.52;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.notice-table-card table.grid td.notice-loading-cell {
  height: auto;
  padding: 20px 14px 12px;
  background: #fffafc;
}

.notice-loading-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: left;
}

.notice-loading-copy {
  display: grid;
  gap: 4px;
}

.notice-loading-copy p {
  margin: 0;
  font-size: 12px;
  color: var(--sub);
}

.notice-loading-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}

.notice-elapsed-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid #f6c5d8;
  background: #fff0f6;
  color: #b42362;
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.notice-spinner {
  width: 14px;
  height: 14px;
  flex: none;
  border: 2px solid #ffd4e5;
  border-top-color: var(--pink);
  border-radius: 50%;
  animation: notice-spin 0.75s linear infinite;
}

.notice-spinner.is-lg {
  width: 22px;
  height: 22px;
  border-width: 2.5px;
}

.notice-skeleton {
  display: inline-block;
  height: 12px;
  width: 68%;
  border-radius: 999px;
  background: linear-gradient(90deg, #fcebf2 25%, #fff6fa 50%, #fcebf2 75%);
  background-size: 200% 100%;
  animation: notice-shimmer 1.4s ease-in-out infinite;
  vertical-align: middle;
}

.notice-skeleton.is-box {
  width: 14px;
  height: 14px;
  border-radius: 4px;
}

.notice-skeleton.is-short {
  width: 34px;
}

.notice-table-card table.grid td.notice-empty-padded {
  height: auto;
  padding: 28px 16px;
}

.notice-empty-btn {
  margin-left: 8px;
}

.notice-table-card table.grid {
  font-size: 12.5px;
}

.notice-table-card table.grid button.go.clip {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-table-card table.grid th,
.notice-table-card table.grid td {
  padding: 0 5px;
}

.notice-table-card table.grid td {
  height: 40px;
}

.notice-table-card table.grid th.check,
.notice-table-card table.grid td.check {
  padding-left: 4px;
  padding-right: 2px;
  text-align: center;
}

.notice-table-card .limit-empty.is-error {
  color: #b91c1c;
}

@keyframes notice-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes notice-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notice-loading-bar,
  .notice-spinner,
  .notice-skeleton {
    animation: none;
  }
}
</style>
