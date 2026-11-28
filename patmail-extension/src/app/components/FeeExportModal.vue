<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  belongKeyForMode,
  buildFeeExportGroups,
  exportTitleForMode,
  type FeeExportColumn,
  type FeeExportMode,
  type FeeExportTemplate
} from '../../api/fee-export'
import { buildPatentExportGroups } from '../../api/patent-export'
import type { PatentSearchQuery } from '../../api/patent-search-types'
import type { FeeSearchQuery } from '../../api/fee-search-params'
import { MessageType, type MessageBridge } from '../../shared/message'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import { confirmDialog, infoDialog } from '../dialog'

interface SelectedExportColumn {
  value: string
  text: string
}

const props = defineProps<{
  open: boolean
  mode: FeeExportMode
  bridge?: MessageBridge
  query?: FeeSearchQuery
  feeIds?: string[]
  caseType?: string
  fieldColumns?: Record<string, string>
  patentQuery?: PatentSearchQuery
  patentHistoryColumns?: string[]
  timeoutMs: number
}>()

const emit = defineEmits<{
  close: []
  exported: [message: string]
}>()

const groups = computed(() =>
  (props.patentQuery
    ? buildPatentExportGroups(Boolean(props.patentQuery.is_proc))
    : buildFeeExportGroups(props.mode, { caseType: props.caseType, fieldColumns: props.fieldColumns }))
    .map(group => ({
      ...group,
      columns: group.columns.map((column, index) => ({
        ...column, key: props.patentQuery ? `${group.id}-${index}` : column.value
      }))
    }))
)

const modalTitle = computed(() => exportTitleForMode(props.mode))
const belongKey = computed(() => props.patentQuery ? 'ICSearch' : belongKeyForMode(props.mode))
type ExportColumnChoice = FeeExportColumn & { key: string }
type SelectedColumn = SelectedExportColumn & { key: string }
const availableColumns = computed(() => groups.value.flatMap(group => group.columns))

const modal = ref<HTMLElement>()
const collapsedGroups = ref<Record<string, boolean>>({})
const filterKeyword = ref('')
const selectedColumns = ref<SelectedColumn[]>([])
const activeColumnValue = ref('')

// Template management state (synced with EASY Common.ashx GetQueryOutConfig / UpdateQueryOutConfig*)
const templates = ref<FeeExportTemplate[]>([])
const selectedTemplateId = ref('')
const templateName = ref('')
const loadingTemplates = ref(false)
const busyTemplate = ref(false)
const exporting = ref(false)
const statusText = ref('')
const errorText = ref('')

const templateOptions = computed(() => [
  { value: '', label: '请选择模板' },
  ...templates.value.map(t => ({ value: t.typeId, label: t.typeText }))
])

const selectedSet = computed(() => new Set(selectedColumns.value.map(item => item.key)))

const filteredGroups = computed(() => {
  const kw = filterKeyword.value.trim().toLowerCase()
  if (!kw) return groups.value
  return groups.value
    .map(group => ({
      ...group,
      columns: group.columns.filter(
        col => col.text.toLowerCase().includes(kw) || col.value.toLowerCase().includes(kw)
      )
    }))
    .filter(group => group.columns.length > 0)
})

function resetToDefaultColumns(): void {
  const defaults: SelectedColumn[] = []
  const seen = new Set<string>()
  const history = props.patentHistoryColumns
  for (const col of availableColumns.value) {
    const checked = history?.length ? history.includes(col.value) : col.defaultChecked !== false
    if (checked && !seen.has(col.key)) {
      seen.add(col.key)
      defaults.push({ key: col.key, value: col.value, text: col.text })
    }
  }
  selectedColumns.value = defaults
  activeColumnValue.value = ''
}

let templateGeneration = 0
let detailGeneration = 0

async function fetchTemplates(selectFirst = false): Promise<void> {
  if (!props.bridge) return
  const currentGen = ++templateGeneration
  loadingTemplates.value = true
  errorText.value = ''
  try {
    const resp = await props.bridge.request({
      type: MessageType.FeeExportConfig,
      payload: {
        action: 'list',
        belongKey: belongKey.value
      }
    })
    if (currentGen !== templateGeneration || !props.open) return
    if (resp.type === MessageType.FeeExportConfigResult && resp.payload.ok) {
      templates.value = resp.payload.data.templates ?? []
      if (selectFirst && templates.value.length) {
        selectedTemplateId.value = templates.value[0].typeId
        templateName.value = templates.value[0].typeText
      }
    } else if (resp.type === MessageType.FeeExportConfigResult && !resp.payload.ok) {
      errorText.value = resp.payload.error.message || '读取原站导出模板失败'
    } else if (resp.type === MessageType.Error) {
      errorText.value = resp.payload.message || '读取原站导出模板失败'
    }
  } catch (e) {
    if (currentGen !== templateGeneration || !props.open) return
    errorText.value = e instanceof Error ? e.message : '读取原站导出模板失败'
  } finally {
    if (currentGen === templateGeneration) {
      loadingTemplates.value = false
    }
  }
}

watch(
  () => [props.open, props.mode] as const,
  ([opened]) => {
    if (!opened) return
    templateGeneration++
    detailGeneration++
    filterKeyword.value = ''
    collapsedGroups.value = {}
    selectedTemplateId.value = ''
    templateName.value = ''
    statusText.value = ''
    errorText.value = ''
    resetToDefaultColumns()
    void fetchTemplates(false)
    if (props.patentQuery) void nextTick(() => modal.value?.focus())
  },
  { immediate: true }
)

async function onSelectTemplate(nextId: string): Promise<void> {
  const currentGen = ++detailGeneration
  selectedTemplateId.value = nextId
  const found = templates.value.find(item => item.typeId === nextId)
  templateName.value = found ? found.typeText : ''
  statusText.value = ''
  errorText.value = ''
  if (!nextId || !props.bridge) return

  loadingTemplates.value = true
  try {
    const resp = await props.bridge.request({
      type: MessageType.FeeExportConfig,
      payload: {
        action: 'detail',
        belongKey: belongKey.value,
        typeId: nextId
      }
    })
    if (currentGen !== detailGeneration || !props.open) return
    if (resp.type === MessageType.FeeExportConfigResult && resp.payload.ok) {
      const cols = resp.payload.data.columns ?? []
      const used = new Set<string>()
      selectedColumns.value = cols.map((column, index) => {
        const available = availableColumns.value.filter(c => c.value === column.value && !used.has(c.key))
        const match = available.find(c => c.text === column.text) ?? available[0]
        const key = props.patentQuery ? match?.key ?? `template-${index}` : column.value
        used.add(key)
        return { key, value: column.value, text: column.text }
      })
      activeColumnValue.value = ''
      statusText.value = `已载入模板「${templateName.value}」（${cols.length} 个栏位）`
    } else if (resp.type === MessageType.FeeExportConfigResult && !resp.payload.ok) {
      errorText.value = resp.payload.error.message || '读取模板栏位失败'
    } else if (resp.type === MessageType.Error) {
      errorText.value = resp.payload.message || '读取模板栏位失败'
    }
  } catch (e) {
    if (currentGen !== detailGeneration || !props.open) return
    errorText.value = e instanceof Error ? e.message : '读取模板栏位失败'
  } finally {
    if (currentGen === detailGeneration) {
      loadingTemplates.value = false
    }
  }
}

function toggleGroupCollapse(id: string): void {
  collapsedGroups.value[id] = !collapsedGroups.value[id]
}

function toggleColumn(col: ExportColumnChoice, checked: boolean): void {
  if (checked) {
    if (!selectedSet.value.has(col.key)) {
      selectedColumns.value = [...selectedColumns.value, { key: col.key, value: col.value, text: col.text }]
    }
  } else {
    selectedColumns.value = selectedColumns.value.filter(item => item.key !== col.key)
    if (activeColumnValue.value === col.key) activeColumnValue.value = ''
  }
}

function toggleGroupColumns(cols: ExportColumnChoice[], selectAll: boolean): void {
  if (selectAll) {
    const next = [...selectedColumns.value]
    const existing = new Set(next.map(item => item.key))
    for (const col of cols) {
      if (!existing.has(col.key)) {
        existing.add(col.key)
        next.push({ key: col.key, value: col.value, text: col.text })
      }
    }
    selectedColumns.value = next
  } else {
    const drop = new Set(cols.map(col => col.key))
    selectedColumns.value = selectedColumns.value.filter(item => !drop.has(item.key))
    if (drop.has(activeColumnValue.value)) activeColumnValue.value = ''
  }
}

function selectAllColumns(): void {
  const all: SelectedColumn[] = []
  const seen = new Set<string>()
  for (const group of groups.value) {
    for (const col of group.columns) {
      if (!seen.has(col.key)) {
        seen.add(col.key)
        all.push({ key: col.key, value: col.value, text: col.text })
      }
    }
  }
  selectedColumns.value = all
  selectedTemplateId.value = ''
  templateName.value = ''
  activeColumnValue.value = ''
}

function clearAllColumns(): void {
  selectedColumns.value = []
  selectedTemplateId.value = ''
  templateName.value = ''
  activeColumnValue.value = ''
}

function removeSelectedColumn(value: string): void {
  selectedColumns.value = selectedColumns.value.filter(item => item.key !== value)
  if (activeColumnValue.value === value) activeColumnValue.value = ''
  if (selectedColumns.value.length === 0) {
    selectedTemplateId.value = ''
    templateName.value = ''
  }
}

function moveActiveColumn(delta: -1 | 1): void {
  const idx = selectedColumns.value.findIndex(item => item.key === activeColumnValue.value)
  if (idx < 0) return
  const target = idx + delta
  if (target < 0 || target >= selectedColumns.value.length) return
  const next = [...selectedColumns.value]
  const [moved] = next.splice(idx, 1)
  next.splice(target, 0, moved)
  selectedColumns.value = next
}

function requestColumns(forExport = false): SelectedExportColumn[] {
  const columns = props.patentQuery && forExport
    ? selectedColumns.value.filter(column => availableColumns.value.some(choice => choice.key === column.key))
    : selectedColumns.value
  return columns.map(({ value, text }) => ({ value, text }))
}

async function saveTemplate(): Promise<void> {
  if (!selectedColumns.value.length) {
    await infoDialog({ title: '提示', message: '请至少选择一个导出栏位！' })
    return
  }
  const name = templateName.value.trim()
  if (!name) {
    await infoDialog({ title: '提示', message: '请输入模板名称！' })
    return
  }
  if (!props.bridge) return

  busyTemplate.value = true
  errorText.value = ''
  statusText.value = ''
  try {
    const resp = await props.bridge.request({
      type: MessageType.FeeExportConfig,
      payload: {
        action: 'add',
        belongKey: belongKey.value,
        modelName: name,
        columns: requestColumns()
      }
    })
    if (resp.type === MessageType.FeeExportConfigResult && resp.payload.ok) {
      templates.value = resp.payload.data.templates ?? templates.value
      if (templates.value.length) {
        selectedTemplateId.value = templates.value[0].typeId
        templateName.value = templates.value[0].typeText
      }
      statusText.value = '模板已保存到原站。'
    } else if (resp.type === MessageType.FeeExportConfigResult && !resp.payload.ok) {
      errorText.value = resp.payload.error.message || '保存模板失败'
    } else if (resp.type === MessageType.Error) {
      errorText.value = resp.payload.message || '保存模板失败'
    }
  } finally {
    busyTemplate.value = false
  }
}

async function updateTemplate(): Promise<void> {
  if (!selectedColumns.value.length) {
    await infoDialog({ title: '提示', message: '请至少选择一个导出栏位！' })
    return
  }
  if (!selectedTemplateId.value) {
    await infoDialog({ title: '提示', message: '请先在「模板选择」中选中一个模板！' })
    return
  }
  const name = templateName.value.trim()
  if (!name) {
    await infoDialog({ title: '提示', message: '请输入模板名称！' })
    return
  }
  if (!props.bridge) return

  busyTemplate.value = true
  errorText.value = ''
  statusText.value = ''
  try {
    const resp = await props.bridge.request({
      type: MessageType.FeeExportConfig,
      payload: {
        action: 'up',
        belongKey: belongKey.value,
        typeId: selectedTemplateId.value,
        modelName: name,
        columns: requestColumns()
      }
    })
    if (resp.type === MessageType.FeeExportConfigResult && resp.payload.ok) {
      templates.value = resp.payload.data.templates ?? templates.value
      if (templates.value.length) {
        selectedTemplateId.value = templates.value[0].typeId
        templateName.value = templates.value[0].typeText
      }
      statusText.value = '模板已在原站更新。'
    } else if (resp.type === MessageType.FeeExportConfigResult && !resp.payload.ok) {
      errorText.value = resp.payload.error.message || '更新模板失败'
    } else if (resp.type === MessageType.Error) {
      errorText.value = resp.payload.message || '更新模板失败'
    }
  } finally {
    busyTemplate.value = false
  }
}

async function deleteTemplate(): Promise<void> {
  if (!selectedTemplateId.value) {
    await infoDialog({ title: '提示', message: '请先选择要删除的模板！' })
    return
  }
  const confirmed = await confirmDialog({
    title: '删除导出模板',
    message: `确定要删除原站导出模板「${templateName.value || '当前模板'}」吗？删除后无法恢复。`,
    confirmLabel: '确定删除',
    cancelLabel: '取消',
    warn: true
  })
  if (!confirmed || !props.bridge) return

  busyTemplate.value = true
  errorText.value = ''
  statusText.value = ''
  try {
    const resp = await props.bridge.request({
      type: MessageType.FeeExportConfig,
      payload: {
        action: 'del',
        belongKey: belongKey.value,
        typeId: selectedTemplateId.value
      }
    })
    if (resp.type === MessageType.FeeExportConfigResult && resp.payload.ok) {
      templates.value = resp.payload.data.templates ?? []
      selectedTemplateId.value = ''
      templateName.value = ''
      selectedColumns.value = []
      statusText.value = '原站导出模板已删除。'
    } else if (resp.type === MessageType.FeeExportConfigResult && !resp.payload.ok) {
      errorText.value = resp.payload.error.message || '删除模板失败'
    } else if (resp.type === MessageType.Error) {
      errorText.value = resp.payload.message || '删除模板失败'
    }
  } finally {
    busyTemplate.value = false
  }
}

async function submitExport(): Promise<void> {
  const columns = requestColumns(true)
  if (!columns.length) {
    await infoDialog({ title: '提示', message: '请至少选择一个导出栏位！' })
    return
  }
  if (!props.bridge) {
    errorText.value = '尚未连接 EASY，无法执行导出。'
    return
  }
  if (exporting.value) return

  exporting.value = true
  errorText.value = ''
  statusText.value = '正在向原站请求生成 Excel 清单…'
  try {
    const resp = await props.bridge.request({
      type: MessageType.ExportFee,
      payload: {
        ...(props.patentQuery
          ? { mode: 'patent' as const, query: props.patentQuery }
          : { mode: props.mode, ...(props.mode === 'checked' ? { feeIds: props.feeIds } : { query: props.query }) }),
        columns,
        timeoutMs: props.timeoutMs
      }
    })
    if (resp.type === MessageType.ExportFeeResult && resp.payload.ok) {
      const data = resp.payload.data
      emit('exported', data.message)
      emit('close')
      if (data.status === 'server_queued' || data.async) {
        await infoDialog({
          title: '已转入原站异步导出',
          message: data.message
        })
      } else if (data.status === 'unknown') {
        await infoDialog({
          title: '下载状态待确认',
          message: data.message
        })
      } else if (data.status === 'downloading' || data.status === 'download_started') {
        await infoDialog({
          title: '浏览器正在下载',
          message: data.message
        })
      }
    } else if (resp.type === MessageType.ExportFeeResult && !resp.payload.ok) {
      errorText.value = resp.payload.error.message || '导出失败'
      statusText.value = ''
    } else if (resp.type === MessageType.Error) {
      errorText.value = resp.payload.message || '导出失败'
      statusText.value = ''
    }
  } catch (e) {
    errorText.value = e instanceof Error ? e.message : '导出异常中断'
    statusText.value = ''
  } finally {
    exporting.value = false
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && !exporting.value && !busyTemplate.value) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fee-export-backdrop" role="presentation" @click.self="!exporting && !busyTemplate && emit('close')" @keydown="onKeydown">
      <div ref="modal" class="fee-export-modal" role="dialog" tabindex="-1" aria-modal="true" :aria-label="modalTitle">
        <header class="export-head">
          <div class="export-head-title">
            <h3>{{ modalTitle }}</h3>
            <span class="export-mode-pill">
              {{ mode === 'checked' ? `已勾选 ${(feeIds?.length ?? 0)} 条费用` : mode === 'count' ? '按查询条件汇总导出' : '按查询条件导出全部' }}
            </span>
          </div>
          <button type="button" class="export-close" aria-label="关闭" :disabled="exporting || busyTemplate" @click="emit('close')">×</button>
        </header>

        <div class="export-body">
          <!-- Left: Column Groups Checkboxes -->
          <div class="export-left">
            <div class="left-toolbar">
              <input
                v-model="filterKeyword"
                type="text"
                class="filter-input"
                placeholder="筛选栏位名称"
              />
              <div class="quick-btns">
                <button type="button" class="ghost tiny" @click="selectAllColumns">全选</button>
                <button type="button" class="ghost tiny" @click="clearAllColumns">全不选</button>
                <button type="button" class="ghost tiny" @click="resetToDefaultColumns">恢复默认</button>
              </div>
            </div>

            <div class="groups-scroll">
              <div v-for="group in filteredGroups" :key="group.id" class="col-group">
                <div class="group-bar">
                  <button type="button" class="group-toggle" @click="toggleGroupCollapse(group.id)">
                    <span class="group-caret">{{ collapsedGroups[group.id] ? '▸' : '▾' }}</span>
                    <strong>{{ group.title }}</strong>
                    <span class="group-count">
                      {{ group.columns.filter(c => selectedSet.has(c.key)).length }} / {{ group.columns.length }}
                    </span>
                  </button>
                  <span class="group-actions">
                    <button type="button" class="mini-link" @click="toggleGroupColumns(group.columns, true)">本组全选</button>
                    <button type="button" class="mini-link" @click="toggleGroupColumns(group.columns, false)">取消</button>
                  </span>
                </div>
                <div v-show="!collapsedGroups[group.id]" class="group-grid">
                  <label v-for="col in group.columns" :key="col.key" class="col-check">
                    <input
                      type="checkbox"
                      :checked="selectedSet.has(col.key)"
                      @change="toggleColumn(col, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="col-text" v-hint.clip="col.text">{{ col.text }}</span>
                  </label>
                </div>
              </div>
              <p v-if="!filteredGroups.length" class="empty-tip">没有匹配的导出栏位</p>
            </div>
          </div>

          <!-- Right: Template Management + Ordered Selected Columns -->
          <aside class="export-right">
            <div class="tpl-card">
              <div class="tpl-row">
                <span class="tpl-label">模板选择</span>
                <ThemeSelect
                  :model-value="selectedTemplateId"
                  :options="templateOptions"
                  :disabled="loadingTemplates || busyTemplate"
                  @update:model-value="onSelectTemplate(String($event))"
                />
              </div>
              <div class="tpl-row">
                <span class="tpl-label">模板名称</span>
                <input
                  v-model="templateName"
                  type="text"
                  class="tpl-input"
                  placeholder="输入模板名称"
                  :disabled="busyTemplate"
                />
              </div>
              <div class="tpl-actions">
                <button type="button" class="ghost tiny" :disabled="busyTemplate || exporting" @click="saveTemplate">保存</button>
                <button type="button" class="ghost tiny" :disabled="busyTemplate || exporting || !selectedTemplateId" @click="updateTemplate">更新</button>
                <button type="button" class="ghost tiny danger-btn" :disabled="busyTemplate || exporting || !selectedTemplateId" @click="deleteTemplate">删除</button>
              </div>
            </div>

            <div class="picked-card">
              <div class="picked-head">
                <strong>已选栏位（{{ selectedColumns.length }}）</strong>
                <span class="picked-hint">双击可移除</span>
              </div>
              <div class="picked-wrap">
                <ul class="picked-list">
                  <li v-if="!selectedColumns.length" class="empty-tip">尚未选择导出栏位</li>
                  <li
                    v-for="(item, idx) in selectedColumns"
                    :key="item.key"
                    :class="{ active: activeColumnValue === item.key }"
                    @click="activeColumnValue = item.key"
                    @dblclick="removeSelectedColumn(item.key)"
                  >
                    <span class="picked-seq">{{ idx + 1 }}</span>
                    <span class="picked-name" v-hint.clip="item.text">{{ item.text }}</span>
                    <button
                      type="button"
                      class="picked-remove"
                      v-hint="'移除该栏位'"
                      aria-label="移除"
                      @click.stop="removeSelectedColumn(item.key)"
                    >
                      ×
                    </button>
                  </li>
                </ul>
                <div class="sort-controls">
                  <button
                    type="button"
                    class="sort-btn"
                    v-hint="'向上移动'"
                    aria-label="向上"
                    :disabled="!activeColumnValue"
                    @click="moveActiveColumn(-1)"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class="sort-btn"
                    v-hint="'向下移动'"
                    aria-label="向下"
                    :disabled="!activeColumnValue"
                    @click="moveActiveColumn(1)"
                  >
                    ↓
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <footer class="export-foot">
          <div class="foot-status">
            <span v-if="errorText" class="foot-error" role="alert">{{ errorText }}</span>
            <span v-else-if="statusText" class="foot-ok">{{ statusText }}</span>
            <span v-else class="foot-hint">导出将直连原站生成真实 Excel 文件，并自动同步当前原站账号下的导出模板。</span>
          </div>
          <div class="foot-actions">
            <button type="button" class="ghost" :disabled="exporting || busyTemplate" @click="emit('close')">取消</button>
            <button type="button" class="solid" :disabled="exporting || busyTemplate || loadingTemplates || (!patentQuery && !selectedColumns.length)" @click="submitExport">
              {{ exporting ? '正在生成 Excel…' : '导出 Excel' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fee-export-backdrop {
  position: fixed;
  inset: 0;
  /* 低于 .theme-select-menu (70) 与 .mask.app-dialog (120)，确保模板下拉菜单和卡哇伊确认/提示弹窗永远浮在最上层 */
  z-index: 60;
  background: rgba(54, 34, 58, 0.36);
  backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  padding: 18px;
}

.fee-export-modal {
  width: min(1060px, 96vw);
  height: min(740px, 90vh);
  background: #fff;
  border: 1px solid #f4d7e6;
  border-radius: 18px;
  box-shadow: 0 22px 54px rgba(155, 62, 108, 0.22);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #463a4f;
}

.fee-export-modal input[type="checkbox"] {
  accent-color: var(--pink, #ff4f93);
  width: 15px;
  height: 15px;
  min-width: 15px;
  min-height: 15px;
  margin: 0;
  cursor: pointer;
}

.export-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 20px;
  border-bottom: 1px solid #f5e2ec;
  background: linear-gradient(180deg, #fff8fb 0%, #fff 100%);
}
.export-head-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.export-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #3d2e46;
}
.export-mode-pill {
  padding: 2px 9px;
  border-radius: 999px;
  background: #fff0f6;
  border: 1px solid #f8cde0;
  color: #d94684;
  font-size: 11px;
  font-weight: 600;
}
.export-close {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: #fff0f6;
  color: #c44b7e;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.export-close:hover:not(:disabled) {
  background: #ffe0ee;
  color: #e11d48;
}

.export-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 14px;
  padding: 14px 18px;
  overflow: hidden;
}

.export-left {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 10px;
}

.left-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.filter-input {
  flex: 1 1 200px;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #ead7e6;
  border-radius: 9px;
  font-size: 12px;
  color: #463a4f;
  background: #fff;
}
.filter-input:focus-visible {
  outline: 2px solid #ffc0da;
  outline-offset: 1px;
}
.quick-btns {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.groups-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 6px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.col-group {
  flex: 0 0 auto;
  border: 1px solid #f1dfeb;
  border-radius: 12px;
  background: #fffcfe;
}
.group-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  border-radius: 11px 11px 0 0;
  background: #fff5fa;
  border-bottom: 1px solid #f3e0ec;
}
.group-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  padding: 0;
  color: #9e3d6d;
  font-size: 13px;
  cursor: pointer;
}
.group-caret {
  font-size: 11px;
  width: 12px;
}
.group-count {
  font-size: 11px;
  font-weight: 500;
  color: #9d85a6;
}
.group-actions {
  display: inline-flex;
  gap: 8px;
}
.mini-link {
  border: 0;
  background: transparent;
  color: #c44b7e;
  font-size: 11px;
  padding: 2px 4px;
  cursor: pointer;
}
.mini-link:hover {
  color: #e44586;
  text-decoration: underline;
}

.group-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px 10px;
  padding: 10px 12px;
}
.col-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: #53455c;
  cursor: pointer;
  user-select: none;
}
.col-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Right Column: Templates + Ordered Selected List */
.export-right {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 10px;
}

.tpl-card {
  border: 1px solid #f1dfeb;
  border-radius: 12px;
  background: #fff9fc;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tpl-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.tpl-label {
  font-size: 12px;
  color: #8a7290;
  text-align: right;
}
.tpl-row :deep(.theme-select-trigger) {
  height: 30px;
  font-size: 12px;
  border-radius: 8px;
}
.tpl-input {
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid #ead7e6;
  border-radius: 8px;
  background: #fff;
  color: #463a4f;
  font-size: 12px;
}
.tpl-input:focus-visible {
  outline: 2px solid #ffc0da;
  outline-offset: 1px;
}
.tpl-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.danger-btn:hover:not(:disabled) {
  color: #e11d48;
  border-color: #fda4af;
  background: #fff1f2;
}

.picked-card {
  flex: 1;
  min-height: 0;
  border: 1px solid #f1dfeb;
  border-radius: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.picked-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #fff5fa;
  border-bottom: 1px solid #f3e0ec;
  font-size: 12px;
  color: #9e3d6d;
}
.picked-hint {
  font-size: 11px;
  color: #a188aa;
}
.picked-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 6px;
  padding: 6px;
}
.picked-list {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}
.picked-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 7px;
  font-size: 12px;
  color: #4e4056;
  cursor: pointer;
}
.picked-list li:hover:not(.empty-tip) {
  background: #fff4f9;
}
.picked-list li.active {
  background: #ffe5f1;
  color: #c22e6f;
  font-weight: 600;
}
.picked-seq {
  width: 20px;
  font-size: 11px;
  color: #a68eae;
  text-align: right;
  flex: none;
}
.picked-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picked-remove {
  flex: none;
  border: 0;
  background: transparent;
  color: #c08ca8;
  font-size: 14px;
  line-height: 1;
  padding: 0 3px;
  cursor: pointer;
}
.picked-remove:hover {
  color: #e11d48;
}

.sort-controls {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  flex: none;
}
.sort-btn {
  width: 26px;
  height: 28px;
  border: 1px solid #efd9e8;
  border-radius: 8px;
  background: #fff8fc;
  color: #c44b7e;
  font-size: 13px;
  cursor: pointer;
}
.sort-btn:hover:not(:disabled) {
  background: #ffe3f0;
  border-color: #f4a5c7;
}
.sort-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.empty-tip {
  text-align: center;
  padding: 20px 10px;
  font-size: 12px;
  color: #a38ca5;
  cursor: default !important;
}

.export-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid #f5e2ec;
  background: #fffbfd;
}
.foot-status {
  flex: 1;
  min-width: 0;
  font-size: 12px;
}
.foot-error { color: #d92d57; font-weight: 500; }
.foot-ok { color: #b93d74; font-weight: 500; }
.foot-hint { color: #9a83a2; }
.foot-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

@media (max-width: 820px) {
  .export-body { grid-template-columns: 1fr; }
  .group-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
