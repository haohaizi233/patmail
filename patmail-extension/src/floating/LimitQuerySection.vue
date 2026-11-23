<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ThemeSelect from '../shell/components/ThemeSelect.vue'
import TreeOptionSelect from '../shell/components/TreeOptionSelect.vue'
import WDatePicker from '../shell/components/WDatePicker.vue'
import { isMultiPickerKey } from '../shared/picker-modes'
import type { HistoryQueryOption } from '../api/query-history'
import { CURRENT_ENVIRONMENT } from '../api/config'
import { LIMIT_BLOCKS, LIMIT_OPTION_KEYS, LIMIT_SELECTS, buildLimitQueryXml, limitColumnLabels, limitDateDefaults, readLimitQueryXml } from '../api/limit-form'
import { pageSelectOptions } from '../query/form-page'
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 存量豁免：保留解构占位与接口形态
import { activateOptionFallback, hasSavedChoices, hydrateOptionFallback, optionFallbackEpoch, rememberChoices, rememberDictionaries, savedChoices, scopeSavedChoices, subscribeOptionFallback } from '../query/option-fallback'
import { describeOptionPull } from '../query/option-pull-notes'
import type { NormalizedDictionary } from '../api/dictionaries'
import { choicesFromDictionary, LIMIT_PICKER_FIELDS } from '../api/dictionaries/picker-catalog'
import { hasOptionTree } from '../query/option-tree'
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 存量豁免：保留解构占位与接口形态
import { fileSearchTimeoutMs, type FileSearchTimeoutMs } from '../api/file-search-params'
import { readLimitTimeout, writeLimitTimeout } from '../api/query-timeout'
import { isLimitMonitorInputField, splitCtrlProcIds, type LimitMonitorQuery } from '../api/limit-monitor-params'
import { looksLikeInternalIds } from '../schema'
import { isQueryGuid } from '../query/query-validator'
import { joinCaseVolumes, splitCaseVolumes } from '../customer/volume-list'
import { TemplateLoadCoordinator } from '../query/load-coordinator'
import { historyLabels } from '../query/history-labels'
import { confirmDialog } from '../app/dialog'
import { downloadTemplateJson, readTemplateJson, templateJsonFileName, templateJsonText } from '../query/template-json'
import { MessageType, type MessageBridge } from '../shared/message'

const props = defineProps<{ bridge?: MessageBridge; userId: string; canSearch: boolean; seed?: Record<string, string> | null; seedToken?: number }>()
const emit = defineEmits<{
  search: [query: Omit<LimitMonitorQuery, 'pageIndex' | 'pageSize'> & { reset?: boolean; templateId?: string; templateName?: string }]
  draft: [fields: Record<string, string>]
}>()

const queryTimeoutMs = ref<FileSearchTimeoutMs>(60_000)
const timeoutOptions = [
  { value: 60_000, label: '1 分钟' },
  { value: 120_000, label: '2 分钟' },
  { value: 300_000, label: '5 分钟' },
  { value: 600_000, label: '10 分钟' }
]
let timeoutDirty = false
onMounted(() => {
  void readLimitTimeout().then(value => {
    if (!timeoutDirty) queryTimeoutMs.value = value
  })
})
watch(queryTimeoutMs, value => {
  timeoutDirty = true
  writeLimitTimeout(value)
}, { flush: 'sync' })

const values = ref<Record<string, string>>({ ...limitDateDefaults() })
/** 标记哪些值是用户手打进来的文本，只有这些才原样回显在输入框里。 */
const typedKeys = ref<Record<string, boolean>>({})
const displayValues = ref<Record<string, string>>({})
const unknownFields = ref<Record<string, string>>({})
const loadedValues = ref<Record<string, string>>({})
const templates = ref<HistoryQueryOption[]>([])
const selectedId = ref('')
const showMore = ref(false)
const loading = ref(false)
const message = ref('')
const saveName = ref('')
const saveNameDirty = ref(false)
const templateJsonInput = ref<HTMLInputElement | null>(null)
const saving = ref(false)
const deleting = ref(false)
const checking = ref(false)
const checkMessage = ref('')
const pickers = ref<Record<string, NormalizedDictionary>>({})
const pickersReady = ref(false)
const pickerFailed = ref(false)
let pickerGeneration = 0
const fallbackTick = ref(0)
const stopFallbackWatch = subscribeOptionFallback(() => { fallbackTick.value = optionFallbackEpoch() })
const loads = new TemplateLoadCoordinator()
let filterTimer = 0
let applyingTemplate = false
/** 自定义栏位 1-5 的标题按 GetFieldColumn 换成当前租户的名字，例如「签约主体」「月结 特批单号」。 */
const columnLabels = ref<Record<string, string>>({})
const blocks = computed(() => LIMIT_BLOCKS
  .filter(block => showMore.value || !block.more)
  .map(block => ({
    ...block,
    cells: block.cells.map(cell => {
      if (!('key' in cell)) return cell
      const label = columnLabels.value[cell.key]
      return label ? { ...cell, label } : cell
    })
  })))
const canRead = computed(() => Boolean(props.bridge) && Boolean(props.userId))
const templateLabels = computed(() => historyLabels(templates.value))
function templateLabel(item: { id: string; name: string }): string {
  return templateLabels.value.get(item.id) ?? item.name
}

onBeforeUnmount(() => {
  loads.dispose()
  window.clearTimeout(filterTimer)
  stopFallbackWatch()
})

function valueOf(key: string): string {
  return values.value[key] ?? ''
}
function setValue(key: string, value: string, fromText = false): void {
  values.value = { ...values.value, [key]: value }
  // 只有手打的文本才原样回显；勾选出来的是内部 ID，要换成人名再显示。
  typedKeys.value = { ...typedKeys.value, [key]: fromText }
}
function draftFields(): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(values.value)) {
    if (isLimitMonitorInputField(key) && value.trim()) fields[key] = value.trim()
  }
  return fields
}
watch(values, () => emit('draft', draftFields()))
function onText(key: string, event: Event): void {
  setValue(key, (event.target as HTMLInputElement).value, true)
}
function checked(key: string): boolean {
  const value = valueOf(key).trim().toLowerCase()
  return value === 'true' || value === 'on' || value === '1'
}
function onCheck(key: string, event: Event): void {
  const on = (event.target as HTMLInputElement).checked
  setValue(key, on ? (key.endsWith('isnull') ? 'on' : 'true') : '')
}
/** 申请日(月日) 在原站是 `WdatePicker({ dateFmt: 'MM-dd' })`，其余日期格都是 `yyyy-MM-dd`。 */
function dateFormatOf(cell: { start: string }): 'yyyy-MM-dd' | 'MM-dd' {
  return cell.start === 'month_day_from' ? 'MM-dd' : 'yyyy-MM-dd'
}
/** 没选案件类型时按当前环境默认的专利收窄选项：原站下拉框默认选中专利，查询提交空案件类型也按默认案件类型查。 */
function caseTypeFor(): string {
  return valueOf('case_type') || CURRENT_ENVIRONMENT.caseTypeId
}
function ledgerChoices(key: string): { value: string; label: string; parent?: string }[] | null {
  const rawStored = props.userId ? savedChoices(props.userId, key) : null
  return rawStored ? scopeSavedChoices(key, rawStored, caseTypeFor()) : null
}
function liveRows(key: string): { value: string; label: string; parent?: string }[] | null {
  const source = LIMIT_PICKER_FIELDS[key]
  const dictionary = source ? pickers.value[source] : undefined
  if (!dictionary || dictionary.status === 'invalid') return null
  return choicesFromDictionary(dictionary, caseTypeFor(), valueOf('country'))
}
/** 静默校对：接口回了非空就换上；空结果和读取失败都继续用账本上的选项，界面不跟着抖。 */
function mergedRows(key: string): { value: string; label: string; parent?: string }[] {
  const source = LIMIT_PICKER_FIELDS[key]
  const dictionary = source ? pickers.value[source] : undefined
  const live = liveRows(key)
  if (dictionary && (dictionary.status === 'ready' || dictionary.status === 'partial')) return live ?? []
  const stored = ledgerChoices(key)
  return stored?.length ? stored : (live ?? [])
}
function choices(key: string): { value: string; label: string; parent?: string }[] {
  fallbackTick.value
  const source = LIMIT_PICKER_FIELDS[key]
  const options = source ? mergedRows(key) : [...(ledgerChoices(key) ?? pageSelectOptions(LIMIT_OPTION_KEYS[key] ?? key) ?? LIMIT_SELECTS[key] ?? [])]
  return options.filter(item => item.value)
}
function treeChoices(key: string): { value: string; label: string; parent?: string }[] {
  const options = choices(key)
  return hasOptionTree(options) ? options : []
}
/** 树形字段给整棵树；平铺的多选字段直接给完整选项列表，同样走树形框的勾选。 */
function pickerOptions(key: string): { value: string; label: string; parent?: string }[] {
  const tree = treeChoices(key)
  return tree.length ? tree : choices(key)
}
/** 原站 TreeUser 的字段（多选或层级树）都换成树形框；平铺单选仍用原生下拉。 */
function showPicker(key: string): boolean {
  return Boolean(LIMIT_PICKER_FIELDS[key]) || isMultiPickerKey(key) || treeChoices(key).length > 0
}
/** 只要有任一字段存过非空选项，这轮拉取就整个界面走静默：不挡界面、非空才更新、拉不到用账本兜底。 */
const ledgerPresent = computed(() => {
  fallbackTick.value
  return Boolean(props.userId) && Object.keys(LIMIT_PICKER_FIELDS).some(key => hasSavedChoices(props.userId, key))
})
function optionStatus(key: string): 'loading' | 'ready' | 'empty' | 'partial' | 'invalid' {
  if (!LIMIT_PICKER_FIELDS[key]) return 'ready'
  // 账号有账本就整个界面走静默校对：拉取期间所有字段照常可选，拉不到也用账本兜底，不进 loading/失败态。
  if (ledgerPresent.value) return choices(key).length ? 'ready' : 'empty'
  if (checking.value || (!pickersReady.value && !pickerFailed.value)) return 'loading'
  if (pickerFailed.value) return 'invalid'
  return pickers.value[LIMIT_PICKER_FIELDS[key] ?? '']?.status ?? 'invalid'
}
const LIMIT_CELL_LABELS: Record<string, string> = Object.fromEntries(LIMIT_BLOCKS.flatMap(block => block.cells.flatMap(cell => {
  const keys: string[] = cell.kind === 'dates'
    ? [cell.start, cell.end, cell.empty].filter((key): key is string => Boolean(key))
    : [cell.key]
  return keys.map(key => [key, cell.label] as [string, string])
})))
function optionLabelOf(key: string): string {
  return columnLabels.value[key] ?? LIMIT_CELL_LABELS[key] ?? key
}
const unavailableFields = computed(() => Object.keys(LIMIT_PICKER_FIELDS).filter(key => {
  const ids = valueOf(key).split(',').map(id => id.trim()).filter(Boolean)
  return ids.length > 0 && (!['ready', 'partial'].includes(optionStatus(key)) || ids.some(id => !choices(key).some(option => option.value === id)))
}))
function optionsFor(key: string): { value: string; label: string; parent?: string }[] {
  return [{ value: '', label: '不限' }, ...choices(key)]
}
function namedLabel(key: string): string {
  const ids = key === 'ctrl_proc' ? splitCtrlProcIds(valueOf(key)) : []
  if (ids.length < 2) return ''
  const labels = ids.map(id => choices(key).find(item => item.value === id)?.label ?? '')
  return labels.every(Boolean) ? labels.join('、') : `已选 ${ids.length} 项`
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 存量豁免：保留解构占位与接口形态
function namedShown(key: string): string {
  const value = valueOf(key)
  if (!value) return ''
  if (typedKeys.value[key]) return value
  const history = displayValues.value[key]?.trim() ?? ''
  if (history && !looksLikeInternalIds(history)) return history
  const ids = value.split(',').map(item => item.trim()).filter(Boolean)
  if (ids.length > 0 && ids.every(part => isQueryGuid(part))) return ids.length > 1 ? `已选 ${ids.length} 项` : '已选择'
  if (looksLikeInternalIds(value)) return `已选 ${ids.length || 1} 项`
  return value
}
function fieldLabel(key: string, value: string): string {
  const ids = key === 'ctrl_proc' ? splitCtrlProcIds(value) : []
  if (ids.length > 1) {
    const remembered = (displayValues.value[key] ?? '').split(/[,，]/).map(item => item.trim())
    const labels = ids.map((id, index) => {
      const option = choices(key).find(item => item.value === id)
      const label = option?.label && option.label !== '已选择' ? option.label : remembered[index]
      return label || ''
    })
    if (labels.every(Boolean)) return labels.join(',')
  }
  const option = choices(key).find(item => item.value === value)
  if (option?.label && option.label !== '已选择' && option.label !== '不限') return option.label
  if ((loadedValues.value[key] ?? '') === value) return displayValues.value[key]?.trim() ?? ''
  return ''
}
function filledDisplay(): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const [key, value] of Object.entries(values.value)) {
    if (!value.trim()) continue
    const label = fieldLabel(key, value.trim())
    if (label && label !== value.trim()) labels[key] = label
  }
  return labels
}
function titleToSave(): string {
  const typed = saveName.value.trim()
  const selected = templates.value.find(item => item.id === selectedId.value)
  if (!selected) return typed
  return typed === templateLabel(selected) ? selected.name : typed
}
async function loadTemplates(force: boolean): Promise<void> {
  if (!canRead.value || !props.bridge) {
    message.value = '请先确认 EASY 已登录。'
    return
  }
  const ticket = loads.begin()
  loading.value = true
  message.value = ''
  try {
    const response = await props.bridge.request({ type: MessageType.ListHistoryQueries, payload: { force, surface: 'limit' } }, ticket.signal)
    if (!loads.isCurrent(ticket.id)) return
    if (response.type !== MessageType.HistoryQueriesResult || !response.payload.ok) {
      templates.value = []
      message.value = response.type === MessageType.Error
        ? response.payload.message
        : response.type === MessageType.HistoryQueriesResult && !response.payload.ok
          ? response.payload.error.message
          : '期限模板没有读到。'
      return
    }
    templates.value = response.payload.data
    if (response.payload.data.length === 0) message.value = '当前账号还没有期限监控模板。'
  } catch {
    if (loads.isCurrent(ticket.id)) message.value = '读取期限模板失败。'
  } finally {
    if (loads.isCurrent(ticket.id)) loading.value = false
  }
}

async function applyTemplate(id: string): Promise<void> {
  selectedId.value = id
  saveNameDirty.value = false
  if (!id || !props.bridge) {
    values.value = { ...limitDateDefaults() }
    typedKeys.value = {}
    displayValues.value = {}
    unknownFields.value = {}
    loadedValues.value = {}
    return
  }
  const ticket = loads.begin()
  message.value = ''
  const response = await props.bridge.request({ type: MessageType.GetHistoryQuery, payload: { queryId: id, surface: 'limit' } }, ticket.signal)
  if (!loads.isCurrent(ticket.id)) return
  if (response.type !== MessageType.HistoryQueryResult || !response.payload.ok) {
    message.value = response.type === MessageType.HistoryQueryResult && !response.payload.ok ? response.payload.error.message : '这个期限模板没有打开。'
    return
  }
  const parsed = readLimitQueryXml(response.payload.data.queryXml)
  if (!parsed.ok) {
    message.value = parsed.error.message
    return
  }
  applyingTemplate = true
  values.value = { ...limitDateDefaults(), ...parsed.data.fields }
  typedKeys.value = {}
  displayValues.value = parsed.data.displayValues
  unknownFields.value = parsed.data.unknownFields
  loadedValues.value = { ...parsed.data.fields }
  void nextTick(() => { applyingTemplate = false })
  const named = templates.value.find(item => item.id === id)
  if (named && !saveNameDirty.value) saveName.value = named.name
}

async function saveTemplate(): Promise<void> {
  if (!props.bridge || saving.value) return
  const title = titleToSave()
  if (!title) {
    message.value = '先写模板名称。'
    return
  }
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(values.value)) {
    if (isLimitMonitorInputField(key) && value.trim()) fields[key] = value.trim()
  }
  const labels = filledDisplay()
  const unknown = { ...unknownFields.value }
  if (!Object.keys(fields).length && !Object.keys(unknown).length) {
    message.value = '先填写至少一项查询条件，再保存。'
    return
  }
  const selected = templates.value.find(item => item.id === selectedId.value)
  const queryId = selected && isQueryGuid(selected.id) ? selected.id : ''
  const before = new Set(templates.value.map(item => item.id))
  saving.value = true
  message.value = '正在写入原网站的期限模板…'
  try {
    const response = await props.bridge.request({
      type: MessageType.SaveHistoryQuery,
      payload: { title, queryId, queryXml: buildLimitQueryXml(fields, labels, unknown), surface: 'limit' }
    })
    if (response.type !== MessageType.HistoryQuerySaved || !response.payload.ok) {
      message.value = response.type === MessageType.HistoryQuerySaved && !response.payload.ok
        ? response.payload.error.message
        : response.type === MessageType.Error ? response.payload.message : '原网站没有保存这份期限模板。'
      return
    }
    await loadTemplates(true)
    // 原站带 query_id 保存也是另存一份新的，不是覆盖。优先选中新存出来的那份。
    const created = templates.value.find(item => !before.has(item.id) && item.name === title)
    const saved = created ?? (queryId ? templates.value.find(item => item.id === queryId) : undefined)
    if (saved) {
      selectedId.value = saved.id
      saveName.value = saved.name
      saveNameDirty.value = false
      displayValues.value = labels
      loadedValues.value = { ...fields }
    }
    message.value = created
      ? '已在原网站另存了这份新的期限模板。'
      : queryId ? '已更新原网站上的这份期限模板。' : '已在原网站新建这份期限模板。'
  } catch {
    message.value = '保存期限模板失败。'
  } finally {
    saving.value = false
  }
}

async function deleteTemplate(): Promise<void> {
  if (!props.bridge || deleting.value || saving.value) return
  const current = templates.value.find(item => item.id === selectedId.value)
  if (!current || !isQueryGuid(current.id)) {
    message.value = '先选中原网站上的期限模板，再删除。'
    return
  }
  const agreed = await confirmDialog({
    title: '删除原网站模板',
    message: `会从原网站删掉「${templateLabel(current)}」。`,
    confirmLabel: '删除'
  })
  if (!agreed) return
  deleting.value = true
  message.value = '正在从原网站删除…'
  try {
    const response = await props.bridge.request({
      type: MessageType.DeleteHistoryQuery,
      payload: { queryId: current.id, surface: 'limit' }
    })
    if (response.type !== MessageType.HistoryQueryDeleted || !response.payload.ok) {
      message.value = response.type === MessageType.HistoryQueryDeleted && !response.payload.ok
        ? response.payload.error.message
        : response.type === MessageType.Error ? response.payload.message : '原网站没有删除这份期限模板。'
      return
    }
    selectedId.value = ''
    await loadTemplates(true)
    message.value = '已从原网站删除这份期限模板。'
  } catch {
    message.value = '删除期限模板失败。'
  } finally {
    deleting.value = false
  }
}

/** 「更多条件」里藏着的字段键。导入的条件落在这些键上时自动展开，方便接着改。 */
function hiddenLimitKeys(): Set<string> {
  return new Set(LIMIT_BLOCKS.filter(block => block.more).flatMap(block => block.cells.flatMap(cell => {
    if (cell.kind === 'dates') return [cell.start, cell.end, cell.empty].filter((item): item is string => Boolean(item))
    return [cell.key]
  })))
}

/** 导出文件名里的模板名：先用「模板名称」框里的名字（选中模板会自动填进来，改过名按新名字走），框空了再退回选中模板的名字。 */
function exportSourceName(): string {
  const selected = templates.value.find(item => item.id === selectedId.value)
  return saveName.value.trim() || (selected ? selected.name.trim() : '')
}

/** 导出 JSON：导出表单当前的查询条件。文件名带源模板名和时间戳，文件内容不含模板名。 */
function exportTemplateJson(): void {
  const fields = draftFields()
  const extras = Object.entries(unknownFields.value).filter(([, value]) => value.trim()).length
  if (!Object.keys(fields).length && !extras) {
    message.value = '先填写至少一项查询条件，再导出。'
    return
  }
  const from = exportSourceName()
  downloadTemplateJson(
    templateJsonText('LimitMonitor', { fields, displayValues: filledDisplay(), unknownFields: unknownFields.value }),
    templateJsonFileName('LimitMonitor', from)
  )
  message.value = `已导出当前条件的 JSON。${from ? `文件名带模板名「${from}」和时间戳` : '文件名只带查询面和时间戳；在「模板名称」里填上名字再导出，文件名就会带上'}，文件内容不含模板名，导入后自己命名保存。`
}

/** 导入 JSON：只导入查询字段，模板名不带。填进表单后自己追加、修改、命名，最后自己保存。 */
async function importTemplateJson(event: Event): Promise<void> {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  let text = ''
  try {
    text = await file.text()
  } catch {
    message.value = '这份 JSON 文件没有读开。'
    return
  }
  const read = readTemplateJson(text, 'LimitMonitor')
  if (!read.ok) {
    message.value = read.message
    return
  }
  const fields = read.conditions.fields
  // 和套用模板一样：条件整套换上，选中的模板和名称都清掉，名称由自己再填。
  applyingTemplate = true
  values.value = { ...limitDateDefaults(), ...fields }
  typedKeys.value = {}
  displayValues.value = { ...read.conditions.displayValues }
  unknownFields.value = { ...read.conditions.unknownFields }
  loadedValues.value = { ...fields }
  void nextTick(() => { applyingTemplate = false })
  const hidden = hiddenLimitKeys()
  if (Object.entries(fields).some(([key, value]) => hidden.has(key) && value.trim())) showMore.value = true
  selectedId.value = ''
  saveName.value = ''
  const count = Object.values(fields).filter(value => value.trim()).length
  message.value = `已导入 ${count} 个查询条件。可以继续追加或修改条件，最后自己填模板名称保存。`
}

function search(): void {
  if (!props.canSearch) return
  if (unavailableFields.value.length) { message.value = '原选项当前不可用，请重新读取选项或显式清除后查询。'; return }
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(values.value)) {
    if (isLimitMonitorInputField(key)) fields[key] = value
  }
  const volumes = splitCaseVolumes(fields.case_volume ?? '')
  fields.case_volume = joinCaseVolumes(volumes)
  const ctrl = fields.ctrl_proc?.trim() ?? ''
  const ctrlIds = ctrl.split(',').map(item => item.trim()).filter(Boolean)
  const ctrlReady = ctrlIds.length > 0 && ctrlIds.every(item => isQueryGuid(item))
  if (ctrl && !ctrlReady) {
    message.value = '处理事项要先从列表里选中，再查询。'
    return
  }
  if (ctrlReady) fields.ctrl_proc = ctrlIds.join(',')
  const currentTemplate = templates.value.find(item => item.id === selectedId.value)
  const templateName = saveName.value.trim() || currentTemplate?.name?.trim() || ''
  emit('search', {
    type: 'all',
    caseVolume: fields.case_volume,
    applicationNo: fields.app_no ?? '',
    customerName: fields.customer_name ?? '',
    ...(ctrlReady ? { ctrlProcId: ctrlIds.join(',') } : {}),
    fields,
    ...(selectedId.value ? { templateId: selectedId.value } : {}),
    ...(templateName ? { templateName } : {})
  })
}

function reset(): void {
  values.value = { ...limitDateDefaults() }
  typedKeys.value = {}
  displayValues.value = {}
  unknownFields.value = {}
  loadedValues.value = {}
  selectedId.value = ''
  saveName.value = ''
  saveNameDirty.value = false
  emit('search', { type: 'all', caseVolume: '', applicationNo: '', customerName: '', reset: true })
}

async function loadPickers(force: boolean, manual = false): Promise<void> {
  if (!props.bridge || !props.userId) {
    checkMessage.value = '请先确认 EASY 已登录。'
    return
  }
  const generation = ++pickerGeneration
  const userId = props.userId
  const current = () => generation === pickerGeneration && userId === props.userId
  checking.value = true
  pickerFailed.value = false
  // 静默拉取不放进度文案：字段照常可选，完成后只在有更新或拉不到时说话。
  checkMessage.value = (force || !pickersReady.value) && !ledgerPresent.value ? '正在向原网站读取期限下拉…' : ''
  const caseType = valueOf('case_type')
  const country = valueOf('country').split(',').map(item => item.trim()).filter(item => /^[A-Za-z0-9_-]{1,40}$/.test(item)).join(',')
  const procType = valueOf('proc_type')
  try {
    const previousLabels = JSON.stringify(columnLabels.value)
    const columnResponse = await props.bridge.request({ type: MessageType.LoadDictionary, payload: { kind: 'fieldColumn', force } })
    if (!current()) return
    if (columnResponse.type === MessageType.DictionaryResult && columnResponse.payload.ok && columnResponse.payload.data.kind === 'fieldColumn') {
      columnLabels.value = limitColumnLabels(columnResponse.payload.data.columns)
    }
    const renamed = JSON.stringify(columnLabels.value) !== previousLabels ? Object.values(columnLabels.value) : []
    const response = await props.bridge.request({
      type: MessageType.LoadDictionary,
      payload: {
        kind: 'picker',
        force,
        ...(isQueryGuid(caseType) ? { caseTypeId: caseType } : {}),
        ...(country ? { country } : {}),
        ...(isQueryGuid(procType) ? { procType } : {})
      }
    })
    if (!current()) return
    if (response.type !== MessageType.DictionaryResult || !response.payload.ok || response.payload.data.kind !== 'picker') {
      pickerFailed.value = true
      checkMessage.value = describeOptionPull({
        updatedLabels: [],
        failures: [response.type === MessageType.Error
          ? response.payload.message
          : response.type === MessageType.DictionaryResult && !response.payload.ok
            ? response.payload.error.message
            : '期限下拉没有读到。'],
        manual,
        hasLedger: ledgerPresent.value
      })
      return
    }
    pickers.value = response.payload.data.dictionaries
    pickersReady.value = true
    // 非空才更新：静默校对时空结果不覆盖账本上已有的选项。
    let changed: string[] = []
    if (props.userId) {
      const fields = { ...LIMIT_PICKER_FIELDS }
      delete fields.case_status_id
      changed = [
        ...rememberDictionaries(props.userId, fields, response.payload.data.dictionaries, true),
        ...rememberDictionaries(props.userId, { case_status_id: 'limitCaseStatus' }, response.payload.data.dictionaries, true)
      ]
    }
    checkMessage.value = describeOptionPull({
      updatedLabels: [...new Set(changed)].map(optionLabelOf),
      failures: [],
      manual,
      hasLedger: ledgerPresent.value,
      extra: renamed.length ? [`自定义栏位标题已按 GetFieldColumn 对齐：${renamed.join('、')}。`] : []
    })
  } catch {
    if (!current()) return
    pickerFailed.value = true
    checkMessage.value = describeOptionPull({ updatedLabels: [], failures: ['读取期限下拉失败。'], manual, hasLedger: ledgerPresent.value })
  } finally {
    if (current()) checking.value = false
  }
}

function applySeed(): void {
  if (!props.seed) return
  values.value = { ...limitDateDefaults(), ...props.seed }
  typedKeys.value = {}
  selectedId.value = ''
  const hidden = hiddenLimitKeys()
  if (Object.entries(props.seed).some(([key, value]) => hidden.has(key) && value.trim())) showMore.value = true
  message.value = '已载入绑定的查询条件。可以再改，改完重新查询。'
}

watch(() => props.seedToken, () => {
  if (!props.seed) {
    if (!props.seedToken) return
    values.value = { ...limitDateDefaults() }
    selectedId.value = ''
    showMore.value = false
    message.value = ''
    return
  }
  applySeed()
}, { immediate: true })
watch(() => props.userId, () => {
  pickerGeneration += 1
  checking.value = false
  templates.value = []
  selectedId.value = ''
  pickers.value = {}
  pickersReady.value = false
  pickerFailed.value = false
  checkMessage.value = ''
  applySeed()
  if (props.userId) {
    activateOptionFallback(props.userId)
    void hydrateOptionFallback(props.userId)
    void loadTemplates(false)
    void loadPickers(false)
  }
}, { immediate: true })
watch(() => [valueOf('case_type'), valueOf('proc_type'), valueOf('country')].join('|'), (next, previous) => {
  if (applyingTemplate || !pickersReady.value || next === previous) return
  window.clearTimeout(filterTimer)
  filterTimer = window.setTimeout(() => { void loadPickers(true) }, 400)
})
</script>

<template>
  <section class="card query-template limit-form" aria-label="期限监控条件">
    <div class="section-heading">
      <strong>当前账号的期限模板</strong>
      <button type="button" class="text-button" :disabled="!canRead || loading" @click="loadTemplates(true)">重新读取</button>
    </div>
    <p v-if="loading" class="hint">正在读取当前账号的期限模板…</p>
    <p v-if="message" class="hint">{{ message }}</p>
    <ul v-if="templates.length" class="template-picks">
      <li v-for="item in templates" :key="item.id">
        <button type="button" :class="{ on: selectedId === item.id }" @click="applyTemplate(item.id)">
          <b v-hint.clip="templateLabel(item)">{{ templateLabel(item) }}</b>
        </button>
      </li>
    </ul>
    <label>选用模板
      <ThemeSelect :model-value="selectedId" placeholder="请选择" empty-text="当前账号还没有期限监控模板。" :options="templates.map(item => ({ value: item.id, label: templateLabel(item) }))" @update:model-value="applyTemplate(String($event))" />
    </label>
    <div class="query-conditions">
      <div class="section-heading">
        <strong>查询条件</strong>
        <span class="inline-actions">
          <label class="query-timeout">超时时间
            <ThemeSelect v-model="queryTimeoutMs" :options="timeoutOptions" />
          </label>
          <button type="button" class="text-button" :disabled="!canRead || checking" @click="loadPickers(true, true)">校对最新字段</button>
          <button type="button" class="text-button" @click="showMore = !showMore">{{ showMore ? '收起更多条件' : '更多条件' }}</button>
        </span>
      </div>
      <p v-if="checking && !pickersReady && !ledgerPresent" class="hint">正在读取下拉选项…</p>
      <p v-if="checkMessage" class="hint">{{ checkMessage }}</p>
      <section v-for="block in blocks" :key="block.title" class="query-block">
        <strong>{{ block.title }}</strong>
        <div class="query-grid">
          <template v-for="(cell, index) in block.cells" :key="block.title + index">
            <label v-if="cell.kind === 'text'" class="query-cell" :class="{ 'span-all': cell.key === 'case_volume' }">
              <span>{{ cell.label }}</span>
              <span class="limit-input">
                <textarea v-if="cell.key === 'case_volume'" :value="valueOf(cell.key)" rows="3" placeholder="一个文号，或多个文号用分号、空格、换行隔开" @input="onText(cell.key, $event)" />
                <input v-else :value="valueOf(cell.key)" type="text" @input="onText(cell.key, $event)" />
                <label v-for="item in cell.checks ?? []" :key="item.key" class="empty-check"><input :checked="checked(item.key)" type="checkbox" @change="onCheck(item.key, $event)" />{{ item.label }}</label>
              </span>
            </label>
            <label v-else-if="cell.kind === 'named' && cell.key === 'ctrl_proc'" class="query-cell">
              <span>{{ cell.label }}</span>
              <TreeOptionSelect v-if="showPicker(cell.key)" :model-value="valueOf(cell.key)" :multiple="isMultiPickerKey(cell.key)" :options="pickerOptions(cell.key)" :status="optionStatus(cell.key)" :empty-text="`当前账号未配置${cell.label}`" @retry="loadPickers(true, true)" @update:model-value="setValue(cell.key, String($event))" />
              <ThemeSelect v-else-if="choices(cell.key).length" :model-value="valueOf(cell.key)" :value-label="namedLabel(cell.key)" :options="optionsFor(cell.key)" @update:model-value="setValue(cell.key, String($event))" />
              <span v-else class="hint">先校对字段，再选择处理事项</span>
              <span v-if="splitCtrlProcIds(valueOf(cell.key)).length > 1" class="hint proc-note">选中的事项会一起放进同一次查询。一行只会命中其中一项。</span>
            </label>
            <label v-else-if="cell.kind === 'named'" class="query-cell">
              <span>{{ cell.label }}</span>
              <TreeOptionSelect v-if="showPicker(cell.key)" :model-value="valueOf(cell.key)" :multiple="isMultiPickerKey(cell.key)" :options="pickerOptions(cell.key)" :status="optionStatus(cell.key)" :empty-text="`当前账号未配置${cell.label}`" @retry="loadPickers(true, true)" @update:model-value="setValue(cell.key, String($event))" />
              <ThemeSelect v-else :model-value="valueOf(cell.key)" :value-label="fieldLabel(cell.key, valueOf(cell.key))" :options="optionsFor(cell.key)" @update:model-value="setValue(cell.key, String($event))" />
            </label>
            <label v-else-if="cell.kind === 'select'" class="query-cell">
              <span>{{ cell.label }}</span>
              <TreeOptionSelect v-if="showPicker(cell.key)" :model-value="valueOf(cell.key)" :multiple="isMultiPickerKey(cell.key)" :options="pickerOptions(cell.key)" :status="optionStatus(cell.key)" :empty-text="`当前账号未配置${cell.label}`" @retry="loadPickers(true, true)" @update:model-value="setValue(cell.key, String($event))" />
              <ThemeSelect v-else :model-value="valueOf(cell.key)" :value-label="fieldLabel(cell.key, valueOf(cell.key))" :options="optionsFor(cell.key)" @update:model-value="setValue(cell.key, String($event))" />
            </label>
            <div v-else class="query-cell">
              <span>{{ cell.label }}</span>
              <span class="date-pair">
                <WDatePicker :id="cell.start" :model-value="valueOf(cell.start)" :format="dateFormatOf(cell)" :max="valueOf(cell.end)" placeholder="起" @update:model-value="setValue(cell.start, String($event))" />
                <em>到</em>
                <WDatePicker :id="cell.end" :model-value="valueOf(cell.end)" :format="dateFormatOf(cell)" :min="valueOf(cell.start)" default-today placeholder="止" @update:model-value="setValue(cell.end, String($event))" />
                <label v-if="cell.empty" class="empty-check"><input :checked="checked(cell.empty)" type="checkbox" @change="onCheck(cell.empty, $event)" />为空</label>
              </span>
            </div>
          </template>
        </div>
      </section>
    </div>
    <div class="form-actions">
      <label class="limit-save">模板名称<input v-model="saveName" type="text" maxlength="80" @input="saveNameDirty = true" /></label>
      <button class="ghost" type="button" :disabled="!canRead || saving" @click="saveTemplate">{{ saving ? '正在保存…' : '保存到网站' }}</button>
      <button class="ghost" type="button" :disabled="!canRead || deleting || !selectedId" @click="deleteTemplate">{{ deleting ? '正在删除…' : '删除原网站模板' }}</button>
      <button class="ghost" type="button" @click="exportTemplateJson">导出 JSON</button>
      <button class="ghost" type="button" @click="templateJsonInput?.click()">导入 JSON</button>
      <input ref="templateJsonInput" type="file" accept=".json,application/json" hidden aria-label="导入期限模板 JSON" @change="importTemplateJson" />
      <button class="ghost" type="button" @click="reset">重置</button>
      <button v-if="canSearch" class="solid" type="button" @click="search">查询</button>
    </div>
  </section>
</template>
