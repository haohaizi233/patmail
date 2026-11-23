<script setup lang="ts">
import { computed } from 'vue'
import ThemeSelect from '../../../shell/components/ThemeSelect.vue'
import { NOTICE_TABLE_COLUMNS, noticeRowKey } from '../../../api/notice-params'
import type { NoticeRow, NoticeTabId } from '../../../api/notice-types'

const props = withDefaults(defineProps<{
  tab: NoticeTabId
  rows: NoticeRow[]
  total: number
  pageIndex: number
  pageSize: number
  selectedKeys: string[]
  loading: boolean
  needCpcLogin?: boolean
  loginMessage?: string
}>(), {
  needCpcLogin: false,
  loginMessage: ''
})

const emit = defineEmits<{
  'update:selectedKeys': [keys: string[]]
  'page-change': [pageIndex: number]
  'size-change': [pageSize: number]
  inspect: [row: NoticeRow]
  openEasy: []
}>()

const PAGE_SIZE_OPTIONS = [
  { value: 20, label: '20 条/页' },
  { value: 50, label: '50 条/页' },
  { value: 100, label: '100 条/页' },
  { value: 200, label: '200 条/页' }
]

const columns = computed(() => NOTICE_TABLE_COLUMNS[props.tab])
const totalPages = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))))
const selectedSet = computed(() => new Set(props.selectedKeys))
const pageKeys = computed(() => props.rows.map(row => noticeRowKey(props.tab, row)).filter(Boolean))
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
  const raw = row[key]
  if (key === 'is_handle') {
    if (raw === true || raw === 1 || raw === '1') return '已处理'
    if (raw === false || raw === 0 || raw === '0') return '未处理'
  }
  if (props.tab === 'download' && key === 'status') {
    const val = String(raw ?? '')
    if (val === 'processing') return '处理中…'
    if (val === 'fail') return String(row.remark || '解析失败')
    if (val === 'finish' || val === 'process') return '解析完成'
    if (val === 'unprocess' || val === '') return '待下载'
    return val
  }
  if (props.tab === 'cert' && key === 'status') {
    const val = String(raw ?? '')
    if (val === '1') return '待下载'
    if (val === '2') return '已下载'
    if (val === 'finish') return '解析完成'
    return val || String(row.remark || '状态异常')
  }
  if (props.tab === 'replay' && key === 'status') {
    const val = String(raw ?? '')
    if (val === 'fail') return String(row.remark || '分析失败')
    if (val === 'finish' || val === 'success') return '分析成功'
    return val || '未处理'
  }
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'boolean') return raw ? '是' : '否'
  return String(raw)
}

function isRedCaseName(row: NoticeRow, key: string): boolean {
  return props.tab === 'import' && key === 'case_name' && row.is_checkname === false
}

function statusClass(row: NoticeRow, key: string): string {
  if (key !== 'status' && key !== 'oa_error_msg' && key !== 'is_handle') return ''
  const val = String(row[key] ?? '')
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
    <div v-if="needCpcLogin" class="notice-cpc-banner">
      <p>{{ loginMessage || '当前 CPC 账号需要扫码登录后才能拉取记录。' }}</p>
      <button type="button" class="solid tiny" @click="emit('openEasy')">前往原站扫码登录</button>
    </div>

    <div class="fit-table limit-cols">
      <table class="grid">
        <thead>
          <tr>
            <th class="check">
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
              :style="col.width ? { width: col.width } : undefined"
            >
              {{ col.label }}
            </th>
            <th style="width: 72px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && rows.length === 0">
            <td :colspan="columns.length + 2" class="limit-empty">正在查询来文数据…</td>
          </tr>
          <tr v-else-if="rows.length === 0">
            <td :colspan="columns.length + 2" class="limit-empty">当前条件下暂无数据</td>
          </tr>
          <tr
            v-for="(row, idx) in rows"
            :key="noticeRowKey(tab, row) || idx"
            :class="{ 'notice-row-multi': Boolean(row.is_multi_case) }"
          >
            <td class="check">
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
              :class="{ 'volume-corrected': isRedCaseName(row, col.key) }"
            >
              <button
                v-if="col.clickable && canInspectRow(row)"
                type="button"
                class="go clip"
                v-hint="formatCell(row, col.key)"
                @click="emit('inspect', row)"
              >
                {{ formatCell(row, col.key) || '查看' }}
              </button>
              <span
                v-else
                class="clip"
                :class="statusClass(row, col.key)"
                v-hint="formatCell(row, col.key)"
              >
                {{ formatCell(row, col.key) }}
              </span>
            </td>
            <td>
              <button type="button" class="go" @click="emit('inspect', row)">详情</button>
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
