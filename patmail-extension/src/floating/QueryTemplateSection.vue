<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fileSearchValueLimit, fileSearchTimeoutMs, hasExplicitFileSearchFilter, isFileSearchBusinessField, FILE_SEARCH_REQUEST_FIELDS, FILE_SEARCH_SYSTEM_FIELDS, type FileSearchQuery, type FileSearchTimeoutMs } from '../api/file-search-params'
import { newUuid } from '../utils/uuid'
import type { NormalizedDictionary } from '../api/dictionaries'
import type { HistoryQueryOption } from '../api/query-history'
import type { CustomerQueryProfile } from '../customer/types'
import { fieldGroup, fieldLabel, parseQueryXml, resolveQueryTemplate } from '../query'
import { PAGE_OPTIONS, cellKeys, queryBlocks, type QueryCell, type QuerySection } from '../query/form-layout'
import { cellsFromLiveFields } from '../query/live-fields'
import { buildQueryXml } from '../query/query-xml'
import { fallbackFields, formCheckDiff, formFieldKey, hiddenFormFields, mergeFormFields, overlayFieldOptions, pageSelectOptions } from '../query/form-page'
import { activateOptionFallback, FILE_BASIC_OPTION_FIELDS, FILE_FLOW_OPTION_FIELDS, hasSavedChoices, hydrateOptionFallback, optionFallbackEpoch, rememberDictionaries, rememberFormFields, savedChoices, scopeSavedChoices, subscribeOptionFallback } from '../query/option-fallback'
import { describeOptionPull, describeOptionUpdate, OPTION_PULL_FALLBACK, OPTION_PULL_UNCHANGED } from '../query/option-pull-notes'
import FileTypePicker from './FileTypePicker.vue'
import EmptyGuide from '../app/components/EmptyGuide.vue'
import { peekHistoryList, readHistoryList, saveHistoryList } from '../query/history-list-cache'
import { historyLabels } from '../query/history-labels'
import { confirmDialog } from '../app/dialog'
import { TemplateLoadCoordinator } from '../query/load-coordinator'
import { optionsForCaseType, looksLikeInternalIds, normalizeFileDescriptionValue, previewFileDescription, resolveFileDescriptionDisplay, resolveInternalIdDisplay, resolveMultiLabel } from '../schema'
import type { FileTypeNode } from '../api/dictionaries'
import type { QueryTemplate } from '../query/query-types'
import { isQueryGuid } from '../query/query-validator'
import { scopeFromConnection, type ExpectedAccountScope } from '../shared/connection'
import { MessageType, type FileSearchFormField, type MessageBridge } from '../shared/message'
import { useWorkspace } from '../app/composables/useWorkspace'
import { hasOptionTree } from '../query/option-tree'
import { FILE_PICKER_FIELDS } from '../api/dictionaries/picker-catalog'
import { downloadNameParts, downloadNameControlFields, isDownloadNameControl, selectionFromNameParts, selectionFromControls, type DownloadNamePart, type FileDownloadSelection } from '../mail/download-name'
import ThemeSelect from '../shell/components/ThemeSelect.vue'
import { sameOptionValue } from '../shell/components/theme-select'
import TreeOptionSelect from '../shell/components/TreeOptionSelect.vue'
import WDatePicker from '../shell/components/WDatePicker.vue'
import { isMultiPickerKey } from '../shared/picker-modes'
import { CURRENT_ENVIRONMENT } from '../api/config'

const props = withDefaults(defineProps<{
  bridge?: MessageBridge
  canSearch: boolean
  userId: string
  mode: 'history' | 'customer'
  pageSize: number
  origin?: string
  /** 模板页负责新建和修改。文件管理只选用模板并查询。 */
  manage?: boolean
  seed?: Record<string, string> | null
  seedToken?: number
}>(), { manage: true, seed: null, seedToken: 0 })
const emit = defineEmits<{
  search: [query: FileSearchQuery, timeoutMs: FileSearchTimeoutMs]
  'download-name': [selection: FileDownloadSelection | null, problem: string]
  'recovery-change': []
}>()

const TIMEOUT_KEY = 'patmail.fileSearch.timeoutMs'
const queryTimeoutMs = ref<FileSearchTimeoutMs>(60_000)
const timeoutOptions = [
  { value: 60_000, label: '1 分钟' },
  { value: 120_000, label: '2 分钟' },
  { value: 300_000, label: '5 分钟' },
  { value: 600_000, label: '10 分钟' }
]
onMounted(() => {
  if (!globalThis.chrome?.storage?.local) return
  void chrome.storage.local.get(TIMEOUT_KEY).then(stored => {
    queryTimeoutMs.value = fileSearchTimeoutMs(stored[TIMEOUT_KEY])
  }).catch(() => { /* 读不到就用 1 分钟 */ })
})
watch(queryTimeoutMs, value => {
  if (!globalThis.chrome?.storage?.local) return
  void chrome.storage.local.set({ [TIMEOUT_KEY]: fileSearchTimeoutMs(value) })
})

const historyOptions = ref<HistoryQueryOption[]>([])
const localTemplates = ref<QueryTemplate[]>([])
const customers = ref<CustomerQueryProfile[]>([])
const historyMessage = ref('')
const storageMessage = ref('')
const selectedBaseId = ref('')
const selectedCustomerId = ref('')
const baseFields = ref<Record<string, string>>({})
const displayValues = ref<Record<string, string>>({})
const unknownFields = ref<Record<string, string>>({})
const parseWarnings = ref<string[]>([])
const baseMissing = ref(false)
const baseName = ref('')
const temporary = ref<Record<string, string>>({})
const temporaryActive = ref<Record<string, boolean>>({})
/** 标记哪些临时值是用户手打进来的文本，只有这些才原样回显在输入框里。 */
const typedKeys = ref<Record<string, boolean>>({})
function defaultOpenExtra(): Record<string, boolean> {
  return { 案件条件: true, 文件条件: true }
}
const openExtra = ref<Record<string, boolean>>(defaultOpenExtra())
const collapsedByUser = ref<Record<string, boolean>>({})
const pageFields = ref<FileSearchFormField[] | undefined>(undefined)
const hotExtra = ref<{ case: QueryCell[]; file: QueryCell[] } | null>(null)
const hotLoaded = ref(false)
const hotLoading = ref(false)
const hotNote = ref('')
const hotSentinel = ref<HTMLElement | null>(null)
const saveName = ref('')
const saveNameDirty = ref(false)
const savingTemplate = ref(false)
const deletingSite = ref(false)
let hotObserver: IntersectionObserver | null = null
let hotFlight: Promise<void> | null = null
let hotAbort: AbortController | null = null
const fallbackTick = ref(0)
const stopFallbackWatch = subscribeOptionFallback(() => { fallbackTick.value = optionFallbackEpoch() })
const pageHidden = computed(() => hiddenFormFields(pageFields.value))
const checkMessage = ref('')
const dictionaryNote = ref('')
const downloadHint = ref('')
const checkingForm = ref(false)
const showFileTree = ref(false)
const fileTypeRoots = ref<string[]>([])
const editingTemplate = ref(false)
const editingCustomer = ref(false)
const draftName = ref('')
const draftFields = ref<Array<{ key: string; value: string }>>([])
const draftBaseId = ref('')
const draftEnabled = ref(true)
const draftEasyId = ref('')
const draftCustomerId = ref('')
const editingTemplateId = ref('')
const draftCustomerRevision = ref(1)
const draftTemplateVersion = ref<number | null>(null)
const openedScope = ref<ExpectedAccountScope | null>(null)
const loadingHistory = ref(false)
const fileTypeNodes = ref<FileTypeNode[]>([])
const basicDictionaries = ref<Record<string, NormalizedDictionary>>({})
const flowDictionaries = ref<Record<string, NormalizedDictionary>>({})
const pickers = ref<Record<string, NormalizedDictionary>>({})
const pickerWarnings = ref<string[]>([])
const dictionaryLoading = ref(false)
const dictionariesRead = ref(false)
const failedDictionaryKinds = ref<string[]>([])
const loads = new TemplateLoadCoordinator()
const workspace = useWorkspace()
onBeforeUnmount(() => {
  loads.dispose()
  stopFallbackWatch()
  hotObserver?.disconnect()
  hotAbort?.abort()
})
watch(hotSentinel, node => {
  hotObserver?.disconnect()
  hotObserver = null
  if (!node || typeof IntersectionObserver === 'undefined') return
  hotObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) void ensureHotFields(false)
  }, { rootMargin: '160px' })
  hotObserver.observe(node)
})
watch(baseName, name => {
  if (!saveNameDirty.value) saveName.value = name
})
watch(selectedBaseId, () => { saveNameDirty.value = false })

const businessFields = FILE_SEARCH_REQUEST_FIELDS.filter(field => !FILE_SEARCH_SYSTEM_FIELDS.has(field))
const formSections = computed(() => queryBlocks(pageHidden.value).map(block => {
  const live = block.title === '案件条件' ? hotExtra.value?.case : hotExtra.value?.file
  if (!live?.length) return block
  const known = new Set([...block.cells, ...block.extra].flatMap(cellKeys))
  const added = live.filter(cell => cellKeys(cell).every(key => !known.has(key)))
  return added.length ? { ...block, extra: [...block.extra, ...added] } : block
}))
function shownCells(block: QuerySection): QueryCell[] {
  return openExtra.value[block.title] ? [...block.cells, ...block.extra] : block.cells
}
function openAllExtra(): void {
  const copy = { ...openExtra.value }
  for (const block of formSections.value) {
    if (!block.extra.length || collapsedByUser.value[block.title]) continue
    copy[block.title] = true
  }
  openExtra.value = copy
}
function toggleExtra(title: string): void {
  const opening = !openExtra.value[title]
  if (opening) {
    const kept = { ...collapsedByUser.value }
    delete kept[title]
    collapsedByUser.value = kept
  } else {
    collapsedByUser.value = { ...collapsedByUser.value, [title]: true }
  }
  openExtra.value = { ...openExtra.value, [title]: opening }
  if (opening) void ensureHotFields(false)
}
function extraFilled(block: QuerySection, fields: Record<string, string>): boolean {
  return block.extra.some(cell => {
    if (cell.kind === 'download-name') return Boolean(fields.filetemp || fields.selfilename1)
    if (cell.kind === 'dates') return [cell.start, cell.end, cell.empty].some(key => key && fields[key])
    if (cell.kind === 'checks') return cell.items.some(item => fields[item.key])
    return Boolean(fields[cell.key])
  })
}
const fieldGroupOrder = ['客户', '案件', '文件', '处理事项', '人员', '日期', '其它', '自定义']
const fieldOptions = [...businessFields].sort((left, right) => {
  const groupDelta = fieldGroupOrder.indexOf(fieldGroup(left)) - fieldGroupOrder.indexOf(fieldGroup(right))
  return groupDelta || fieldLabel(left).localeCompare(fieldLabel(right), 'zh')
}).map(field => ({ value: field, label: fieldLabel(field), group: fieldGroup(field) }))
const scopedUser = computed(() => Boolean(props.userId))
const canRead = computed(() => Boolean(props.bridge) && scopedUser.value)
const easyLabels = computed(() => historyLabels(historyOptions.value))
function easyLabel(item: { id: string; name: string }): string {
  return easyLabels.value.get(item.id) ?? item.name
}
const accountTemplates = computed(() => [
  ...historyOptions.value.map(item => ({ id: item.id, name: easyLabel(item), source: 'easy' as const })),
  ...localTemplates.value.map(item => ({ id: item.id, name: item.name, source: 'local' as const }))
])
const canSubmit = computed(() => props.canSearch && !baseMissing.value &&
  (props.mode !== 'customer' || Boolean(selectedCustomer.value?.enabled)) &&
  hasExplicitFileSearchFilter(resolved.value.fields) && unavailableFields.value.length === 0)

/** 查询按钮点不动时，把缺什么直接说清楚，不再只靠按钮变色。 */
const submitHint = computed(() => {
  if (!props.canSearch) return ''
  if (unavailableFields.value.length) return '原选项当前不可用，请重新读取选项或显式清除后查询。'
  if (baseMissing.value) return '基础模板不存在或无法解析，换一个模板再查询。'
  if (props.mode === 'customer' && !selectedCustomer.value?.enabled) return '这位客户的发文配置还没启用，先到客户管理里启用再查。'
  return '还缺一项能定位的查询条件：我方文号、申请号、客户名称、文件描述、附件名称或日期起止，任填一项才能查询。'
})

const baseChoices = computed(() => [
  ...historyOptions.value.map(item => ({ id: item.id, name: easyLabel(item), source: 'easy' as const })),
  ...localTemplates.value.map(item => ({ id: item.id, name: item.name, source: 'local' as const }))
])
const selectedCustomer = computed(() => customers.value.find(item => sameOptionValue(item.id, selectedCustomerId.value)) ?? null)
const selectedLocal = computed(() => localTemplates.value.find(item => item.id === selectedBaseId.value) ?? null)
const selectedEasy = computed(() => historyOptions.value.find(item => item.id === selectedBaseId.value) ?? null)
const unknownCount = computed(() => Object.keys(unknownFields.value).length)
const visibleWarnings = computed(() => parseWarnings.value.filter(item => !item.includes('含有未注册字段')))

const temporaryFields = computed(() => {
  const fields: Record<string, string> = {}
  for (const [key, active] of Object.entries(temporaryActive.value)) {
    if (active) fields[key] = temporary.value[key] ?? ''
  }
  return fields
})
const resolved = computed(() => resolveQueryTemplate(
  baseMissing.value ? {} : baseFields.value,
  props.mode === 'customer' ? selectedCustomer.value?.overrides : {},
  temporaryFields.value
))

function formValue(key: string): string {
  if (temporaryActive.value[key]) return temporary.value[key] ?? ''
  // 这些控件被查询参数解析器隔离到 unknownFields；仍须用于回显和下载，
  // 不能再从已经过滤它们的 resolved.fields 读取。
  if (isDownloadNameControl(key)) {
    const overrides = props.mode === 'customer' ? selectedCustomer.value?.overrides : undefined
    if (overrides && Object.hasOwn(overrides, key)) return overrides[key] ?? ''
    return baseMissing.value ? '' : baseFields.value[key] ?? unknownFields.value[key] ?? ''
  }
  return resolved.value.fields[key] ?? ''
}
function downloadChoices(key: string): { value: string; label: string }[] {
  return optionsFor(key).filter(item => item.label.replace(/[\s\-—_]/g, '') !== '请选择')
}
function storedDownloadSelection(): FileDownloadSelection | null {
  const templateId = formValue('filetemp').trim()
  const column = formValue('selfilename1').trim()
  const fixedText = formValue('txtfilename1').trim()
  const templates = dictionaryFor('filetemp')?.dictionary.options ?? []
  const picked = templates.find(item => item.value === templateId)
  const columnLabel = downloadChoices('selfilename1').find(item => item.value === column)?.label ?? ''
  const recipe = picked?.metadata?.newFilename && picked.metadata.fileNameType
    ? { newFilename: picked.metadata.newFilename, fileNameType: picked.metadata.fileNameType }
    : null
  return selectionFromControls({
    templateId,
    column,
    fixedText,
    label: picked?.label || columnLabel,
    template: recipe
  })
}
function storedDownloadParts(): DownloadNamePart[] {
  const selection = storedDownloadSelection()
  if (selection?.templateId) return downloadNameParts(selection)
  const parts = Array.from({ length: 31 }, (_, index) => ({
    column: formValue(`selfilename${index + 1}`).trim(), fixedText: formValue(`txtfilename${index + 1}`)
  })).filter(part => part.column)
  return parts.length ? parts : downloadNameParts(selection)
}
const nameParts = ref<DownloadNamePart[]>([{ column: '', fixedText: '' }])
const namePartsEdited = ref(false)
const downloadSource = computed(() => ({
  templateId: formValue('filetemp'), column: formValue('selfilename1'), fixedText: formValue('txtfilename1'),
  parts: storedDownloadParts(), selection: storedDownloadSelection()
}))
watch(downloadSource, (next, previous) => {
  const switched = !previous || next.templateId !== previous.templateId || next.column !== previous.column || next.fixedText !== previous.fixedText
  // 元数据异步到达时补齐配方；同一模板的字典刷新不能覆盖用户正在编辑的内容。
  if (switched || !namePartsEdited.value) {
    nameParts.value = next.parts
    namePartsEdited.value = false
  }
}, { immediate: true })
function currentDownloadSelection(): FileDownloadSelection | null {
  const selection = storedDownloadSelection()
  return namePartsEdited.value || !selection?.templateId
    ? selectionFromNameParts(nameParts.value, namePartsEdited.value ? selection?.label : '')
    : selection
}
const downloadNameProblem = computed(() => {
  try { currentDownloadSelection(); return '' } catch (error) { return error instanceof Error ? error.message : '下载名称无效。' }
})
watch(() => [downloadSource.value, nameParts.value, namePartsEdited.value], () => {
  emit('download-name', downloadNameProblem.value ? null : currentDownloadSelection(), downloadNameProblem.value)
}, { deep: true })
function chooseDownloadTemplate(templateId: string): void {
  setOverride('filetemp', templateId)
  if (!templateId) {
    // 显式清空模板也清空保存模板带来的全部名称段。
    const cleared = Object.fromEntries(Array.from({ length: 31 }, (_, index) =>
      [[`selfilename${index + 1}`, ''], [`txtfilename${index + 1}`, '']]).flat())
    temporaryActive.value = { ...temporaryActive.value, ...Object.fromEntries(Object.keys(cleared).map(key => [key, true])) }
    temporary.value = { ...temporary.value, ...cleared }
  }
  // 用户明确重选同一项也要还原；字典后台刷新仍走上面的保留编辑逻辑。
  namePartsEdited.value = false
  nameParts.value = storedDownloadParts()
}
function editNamePart(index: number, patch: Partial<DownloadNamePart>): void {
  namePartsEdited.value = true
  nameParts.value = nameParts.value.map((part, at) => at === index ? { ...part, ...patch } : part)
}
function addNamePart(): void {
  if (nameParts.value.length >= 31) return
  namePartsEdited.value = true
  nameParts.value = [...nameParts.value, { column: '', fixedText: '' }]
}
function removeNamePart(index: number): void {
  namePartsEdited.value = true
  nameParts.value = nameParts.value.filter((_, at) => at !== index)
}
function namePartChoices(column: string): { value: string; label: string }[] {
  const options = downloadChoices('selfilename1').map(item => item.value ? item : { ...item, label: '请选择名称字段' })
  if (!options.some(item => item.value === 'fixtxt')) options.push({ value: 'fixtxt', label: '固定字符' })
  if (column && !options.some(item => item.value === column)) options.push({ value: column, label: column })
  return options
}
/** 下载是查询之后才点的：点的一刻再取一次当前值，查询后改模板/固定字符都按新的来。 */
let recoveredForm = false
let restoringForm = false
const recoveryRefs = { selectedBaseId, selectedCustomerId, baseFields, displayValues, unknownFields, baseMissing, baseName, temporary, temporaryActive, typedKeys, nameParts, namePartsEdited }
function recoveryState(): unknown {
  return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(recoveryRefs).map(([key, value]) => [key, value.value]))))
}
function restoreRecoveryState(state: unknown): void {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return
  const saved = state as Record<string, unknown>
  recoveredForm = true
  restoringForm = true
  for (const [key, field] of Object.entries(recoveryRefs)) {
    const value = saved[key]
    if (value === undefined || typeof value !== typeof field.value || Array.isArray(value) !== Array.isArray(field.value)) continue
    // Snapshot values are local evidence only; query submission revalidates dictionary IDs and scope.
    ;(field as { value: unknown }).value = JSON.parse(JSON.stringify(value))
  }
  restoringForm = false
}
watch(() => Object.values(recoveryRefs).map(field => field.value), () => emit('recovery-change'), { deep: true })
defineExpose({ currentDownloadSelection, currentSearchTemplateName: () => baseMissing.value ? '' : baseName.value, recoveryState, restoreRecoveryState })
function setOverride(key: string, value: string, fromText = false): void {
  temporaryActive.value = { ...temporaryActive.value, [key]: true }
  temporary.value = { ...temporary.value, [key]: value }
  // 只有用户手打的文本才原样回显；勾选/下拉选出来的是内部 ID，要换成人名再显示。
  typedKeys.value = { ...typedKeys.value, [key]: fromText }
}
function checked(key: string): boolean {
  const value = formValue(key).trim().toLowerCase()
  return value === 'on' || value === 'true' || value === '1' || value === '是'
}
/** 显示文案不再自己截断：一行摆得下就完整显示，放不下由 CSS 省略号或悬浮提示兜底。 */
/** 原站文件查询页的案件类型下拉默认选中专利，查询提交空案件类型时也按默认案件类型查。案件状态下拉这类按案件类型收窄的选项同口径：没选案件类型就按当前环境默认的专利收。 */
function effectiveCaseType(): string {
  return formValue('case_type') || CURRENT_ENVIRONMENT.caseTypeId
}
function storedLabel(key: string, value: string): string {
  const page = PAGE_OPTIONS[key]?.find(item => item.value === value)
  if (page) return page.label
  const dictionary = dictionaryFor(key)
  if (dictionary) {
    const options = dictionary.dictionary.options[0]?.metadata?.caseTypeId
      ? optionsForCaseType(dictionary.name, dictionary.dictionary.options, effectiveCaseType())
      : dictionary.dictionary.options
    const display = resolveInternalIdDisplay(value, options, key === 'filetype')
    if (!display.unresolved) return display.text
  }
  if (key === 'filetype') {
    return resolveFileDescriptionDisplay({
      savedIds: value,
      descriptions: fileTypeNodes.value,
      historyText: displayValues.value.filetype
    }).text
  }
  if (displayValues.value[key] && !looksLikeInternalIds(displayValues.value[key])) return displayValues.value[key]
  const ids = value.split(',').map(item => item.trim()).filter(Boolean)
  if (ids.length > 0 && ids.every(part => isQueryGuid(part))) return ids.length > 1 ? `已选 ${ids.length} 项` : '已选择'
  if (looksLikeInternalIds(value)) return `已选 ${ids.length || 1} 项`
  return value
}
function namedShown(key: string): string {
  // 勾选出来的内部 ID 永远换成人名显示，不能把 GUID 串摆在输入框里。
  if (temporaryActive.value[key] && typedKeys.value[key]) return temporary.value[key] ?? ''
  const value = formValue(key)
  return value ? storedLabel(key, value) : ''
}
/** 文件描述摘要。刚勾完还没落模板的值也要换成人名，不能把 GUID 串直接摆出来。 */
function fileDisplay(key: string): string {
  const value = formValue(key)
  if (!value) return ''
  return resolveFileDescriptionDisplay({
    savedIds: value,
    descriptions: fileTypeNodes.value,
    historyText: displayValues.value.filetype
  }).text
}
function fileSummary(key: string): string {
  const value = formValue(key)
  if (!value) return '未选择'
  const display = resolveFileDescriptionDisplay({
    savedIds: value,
    descriptions: fileTypeNodes.value,
    historyText: displayValues.value.filetype
  })
  const preview = previewFileDescription(display)
  if (!preview.short || preview.short === '未设置') return '未选择'
  return fileExpanded.value[key] ? display.text : preview.short
}
function fileTruncated(key: string): boolean {
  const value = formValue(key)
  if (!value) return false
  return previewFileDescription(resolveFileDescriptionDisplay({
    savedIds: value,
    descriptions: fileTypeNodes.value,
    historyText: displayValues.value.filetype
  })).truncated
}
function toggleFileExpand(key: string): void {
  fileExpanded.value = { ...fileExpanded.value, [key]: !fileExpanded.value[key] }
}
/** 模板和手填的文件描述可能混进名字、空段或中文逗号：查询前换回内部 ID，换不了的点名提示，不再整条拒绝。 */
function cleanFileDescription(fields: Record<string, string>): void {
  const value = fields.filetype?.trim() ?? ''
  if (!value || !fileTypeNodes.value.length) return
  const { value: ids, dropped } = normalizeFileDescriptionValue(value, fileTypeNodes.value)
  fileDropNote.value = dropped.length
    ? `文件描述有 ${dropped.length} 项没对上文件描述树，没有进查询：${dropped.slice(0, 3).join('、')}${dropped.length > 3 ? '…' : ''}`
    : ''
  fields.filetype = ids
}
function dictionaryOptions(key: string): { value: string; label: string; parent?: string }[] | null {
  if (key === 'filetype' && fileTypeNodes.value.length) {
    return fileTypeNodes.value.map(node => ({
      value: node.id,
      label: node.name,
      ...(node.parentId ? { parent: node.parentId } : {})
    }))
  }
  const dictionary = dictionaryFor(key)
  if (!dictionary || dictionary.dictionary.options.length === 0) return null
  return liveChoices(dictionary)
}
function liveChoices(dictionary: { name: string; dictionary: NormalizedDictionary }): { value: string; label: string; parent?: string }[] {
  const rows = dictionary.dictionary.options.filter(item => !item.disabled)
  const scoped = rows.some(item => item.metadata?.caseTypeId)
  // 案件状态、申请类型、业务类型这些按案件类型收窄的选项，原站只渲染当前案件类型的那批。
  // 没选案件类型时不能整包倒出来：158 条里「未递交」会按案件类型重复四遍，还会混进年费类的 PROC 状态。
  const picked = scoped ? optionsForCaseType(dictionary.name, dictionary.dictionary.options, effectiveCaseType()) : rows
  return picked.map(item => ({
    value: item.value,
    label: item.label,
    ...(item.parentValue ? { parent: item.parentValue } : {})
  }))
}
function ledgerChoices(key: string): { value: string; label: string; parent?: string }[] | null {
  const rawStored = props.userId ? savedChoices(props.userId, key) : null
  return rawStored ? scopeSavedChoices(key, rawStored, effectiveCaseType()) : null
}
function liveRows(key: string): { value: string; label: string; parent?: string }[] | null {
  const dictionary = dictionaryFor(key)
  if (!dictionary || dictionary.dictionary.status === 'invalid') return null
  return liveChoices(dictionary)
}
/** 静默校对：接口回了非空就换上；空结果和读取失败都继续用账本上的选项，界面不跟着抖。 */
function mergedRows(key: string): { value: string; label: string; parent?: string }[] {
  const dictionary = dictionaryFor(key)
  const live = liveRows(key)
  if (dictionary && (dictionary.dictionary.status === 'ready' || dictionary.dictionary.status === 'partial')) return live ?? []
  const stored = ledgerChoices(key)
  return stored?.length ? stored : (live ?? [])
}
function optionsFor(key: string): { value: string; label: string; parent?: string }[] {
  fallbackTick.value
  const mapped = Boolean(FILE_BASIC_OPTION_FIELDS[key] || FILE_FLOW_OPTION_FIELDS[key] || FILE_PICKER_FIELDS[key])
  const options = mapped ? mergedRows(key) : [...(ledgerChoices(key) ?? pageSelectOptions(key, pageFields.value) ?? PAGE_OPTIONS[key] ?? [])]
  if (key === 'is_close') return [{ value: '', label: '是' }, { value: '1', label: '否' }]
  return [{ value: '', label: '不限' }, ...options]
}
function treeChoices(key: string): { value: string; label: string; parent?: string }[] {
  const options = optionsFor(key).filter(item => item.value)
  return hasOptionTree(options) ? options : []
}
/** 树形字段给整棵树；平铺的多选字段直接给完整选项列表，同样走树形框的勾选。 */
function pickerOptions(key: string): { value: string; label: string; parent?: string }[] {
  const tree = treeChoices(key)
  return tree.length ? tree : optionsFor(key)
}
/** 原站 TreeUser 的字段（多选或层级树）都换成树形框；平铺单选仍用原生下拉。 */
function showPicker(key: string): boolean {
  return Boolean(FILE_BASIC_OPTION_FIELDS[key] || FILE_FLOW_OPTION_FIELDS[key] || FILE_PICKER_FIELDS[key]) || isMultiPickerKey(key) || treeChoices(key).length > 0
}
/** 只要有任一字段存过非空选项，这轮拉取就整个界面走静默：不挡界面、非空才更新、拉不到用账本兜底。 */
const ledgerPresent = computed(() => {
  fallbackTick.value
  return Boolean(props.userId) && Object.keys({ ...FILE_BASIC_OPTION_FIELDS, ...FILE_FLOW_OPTION_FIELDS, ...FILE_PICKER_FIELDS })
    .some(key => hasSavedChoices(props.userId, key))
})
function optionStatus(key: string): 'loading' | 'ready' | 'empty' | 'partial' | 'invalid' {
  if (!(FILE_BASIC_OPTION_FIELDS[key] || FILE_FLOW_OPTION_FIELDS[key] || FILE_PICKER_FIELDS[key])) return 'ready'
  // 账号有账本就整个界面走静默校对：拉取期间所有字段照常可选，拉不到也用账本兜底，不进 loading/失败态。
  if (ledgerPresent.value) return mergedRows(key).length ? 'ready' : 'empty'
  if (dictionaryLoading.value || !dictionariesRead.value) return 'loading'
  const kind = FILE_BASIC_OPTION_FIELDS[key] ? 'basic' : FILE_FLOW_OPTION_FIELDS[key] ? 'flow' : 'picker'
  if (failedDictionaryKinds.value.includes(kind)) return 'invalid'
  return dictionaryFor(key)?.dictionary.status ?? 'invalid'
}
const cellLabels = computed(() => {
  const map: Record<string, string> = {}
  for (const block of formSections.value) {
    for (const cell of [...block.cells, ...block.extra]) {
      const label = 'label' in cell ? cell.label : ''
      if (!label) continue
      for (const key of cellKeys(cell)) map[key] = label
    }
  }
  return map
})
function optionLabelOf(key: string): string {
  return cellLabels.value[key] ?? fieldLabel(key)
}
const unavailableFields = computed(() => Object.keys({ ...FILE_BASIC_OPTION_FIELDS, ...FILE_FLOW_OPTION_FIELDS, ...FILE_PICKER_FIELDS }).filter(key => {
  const ids = formValue(key).split(',').map(id => id.trim()).filter(Boolean)
  return ids.length > 0 && (!['ready', 'partial'].includes(optionStatus(key)) || ids.some(id => !optionsFor(key).some(option => option.value === id)))
}))
function onText(key: string, event: Event): void {
  setOverride(key, (event.target as HTMLInputElement).value, true)
}
function onCheck(key: string, event: Event): void {
  const on = (event.target as HTMLInputElement).checked
  setOverride(key, on ? (key.endsWith('isnull') ? 'on' : 'true') : '')
}
function cellClass(cell: QueryCell): string {
  return cell.kind === 'files' || cell.kind === 'checks' || cell.kind === 'download-name' ? 'query-cell span-all' : 'query-cell'
}
function restoreTemplate(): void {
  temporaryActive.value = {}
  temporary.value = {}
  typedKeys.value = {}
  namePartsEdited.value = false
  nameParts.value = storedDownloadParts()
  showFileTree.value = false
}
function dictionaryFor(key: string): { name: string; dictionary: NormalizedDictionary } | undefined {
  const flowKey = key === 'file_status' ? 'fileStatus' : key === 'flow_direction' ? 'caseDirection' : key === 'proc_status' ? 'procStatus'
    : key === 'selfilename1' ? 'downloadFileName' : ''
  if (flowKey && flowDictionaries.value[flowKey]) return { name: flowKey, dictionary: flowDictionaries.value[flowKey] }
  const basicKey = key === 'case_type' ? 'caseType' : key === 'apply_type' ? 'applyType' : key === 'case_status' ? 'caseStatus'
    : key === 'business_type_id' ? 'bussType' : key === 'country' || key === 'customer_country' ? 'country'
      : key === 'customer_status_id' ? 'customerStatus' : key === 'i_ctrl_proc' ? 'ctrlProc' : key === 'branch_dept_id' ? 'caseBranchDept' : ''
  if (basicKey && basicDictionaries.value[basicKey]) return { name: basicKey, dictionary: basicDictionaries.value[basicKey] }
  const pickerName = FILE_PICKER_FIELDS[key]
  if (pickerName && pickers.value[pickerName]) return { name: pickerName, dictionary: pickers.value[pickerName] }
  return undefined
}
async function reloadLocal(): Promise<void> {
  const payload = await workspace.call({ action: 'load' })
  if (!payload || payload.connection.operatorId !== props.userId) {
    localTemplates.value = []
    customers.value = []
    if (payload?.connection.sessionStatus === 'authenticated') storageMessage.value = '账号已变化，已清除上一账号的模板和客户。'
    return
  }
  localTemplates.value = payload.templates.filter(item => item.source === 'local' && item.queryType === 'FileSearch')
  customers.value = payload.customers
  storageMessage.value = scopedUser.value ? '' : '当前没有稳定用户 ID。查询模板不会写入未分区空间。'
}

function liveScope(): ExpectedAccountScope | null {
  const scope = scopeFromConnection(workspace.connection.value)
  if (!scope || scope.operatorId !== props.userId) {
    storageMessage.value = '当前页面账号与已绑定会话不一致，未保存。'
    return null
  }
  return scope
}

const fileTypeMessage = ref('')
/** 模板里换不回内部 ID 的文件描述项，套用和查询时点名提示，不整条拒绝查询。 */
const fileDropNote = ref('')
const fileExpanded = ref<Record<string, boolean>>({})
let fileTypeSerial = 0
const selectedCaseTypeId = computed(() => formValue('case_type').trim())
async function loadFileTypes(caseTypeId: string): Promise<void> {
  const serial = ++fileTypeSerial
  fileTypeNodes.value = []
  fileTypeRoots.value = []
  fileTypeMessage.value = ''
  if (!/^[0-9a-f-]{36}$/i.test(caseTypeId)) return
  if (!props.bridge) {
    fileTypeMessage.value = '页面通信不可用。'
    return
  }
  const response = await props.bridge.request({
    type: MessageType.LoadDictionary, payload: { kind: 'fileType', force: false, caseTypeId }
  })
  if (serial !== fileTypeSerial) return
  if (response.type !== MessageType.DictionaryResult || !response.payload.ok) {
    fileTypeMessage.value = response.type === MessageType.DictionaryResult && !response.payload.ok
      ? response.payload.error.message : '文件描述没有读到。'
    return
  }
  if (response.payload.data.kind !== 'fileType') return
  fileTypeNodes.value = response.payload.data.nodes
  fileTypeRoots.value = response.payload.data.rootIds
  if (response.payload.data.rootIds.length === 0) fileTypeMessage.value = '这个案件类型下面没有文件描述。'
}
async function loadDictionaries(ticketId: number, signal: AbortSignal, force = false): Promise<{ changed: string[]; problems: string[] }> {
  const summary = { changed: [] as string[], problems: [] as string[] }
  if (!props.bridge) return summary
  dictionaryLoading.value = true
  failedDictionaryKinds.value = []
  const settled = await Promise.allSettled((['basic', 'flow', 'picker'] as const).map(kind => props.bridge!.request({
    type: MessageType.LoadDictionary, payload: { kind, force }
  }, signal)))
  if (!loads.isCurrent(ticketId)) return summary
  dictionaryLoading.value = false
  dictionariesRead.value = true
  dictionaryNote.value = ''
  const problems: string[] = []
  for (const [index, item] of settled.entries()) {
    const kind = ['basic', 'flow', 'picker'][index]!
    if (item.status !== 'fulfilled' || item.value.type !== MessageType.DictionaryResult || !item.value.payload.ok) failedDictionaryKinds.value.push(kind)
    if (item.status !== 'fulfilled') {
      problems.push('有一组下拉没有回传到页面。')
      continue
    }
    const response = item.value
    if (response.type === MessageType.Error) {
      problems.push(response.payload.message || '下拉没有回传到页面。')
      continue
    }
    if (response.type !== MessageType.DictionaryResult || !response.payload.ok) {
      problems.push(response.type === MessageType.DictionaryResult && !response.payload.ok ? response.payload.error.message : '下拉没有回传到页面。')
      continue
    }
    if (response.payload.data.kind === 'basic') basicDictionaries.value = response.payload.data.dictionaries
    if (response.payload.data.kind === 'flow') flowDictionaries.value = response.payload.data.dictionaries
    if (response.payload.data.kind === 'picker') {
      pickers.value = response.payload.data.dictionaries
      pickerWarnings.value = response.payload.data.warnings
    }
  }
  // 非空才更新：静默校对时空结果不覆盖账本上已有的选项。
  if (props.userId) {
    summary.changed.push(...rememberDictionaries(props.userId, FILE_FLOW_OPTION_FIELDS, flowDictionaries.value, true))
    summary.changed.push(...rememberDictionaries(props.userId, FILE_BASIC_OPTION_FIELDS, basicDictionaries.value, true))
    summary.changed.push(...rememberDictionaries(props.userId, FILE_PICKER_FIELDS, pickers.value, true))
  }
  summary.problems = problems
  return summary
}
function pickTemplate(id: string): void {
  recoveredForm = false
  selectedBaseId.value = id
  startApply(id)
}
function rememberHistory(options: HistoryQueryOption[]): void {
  historyOptions.value = options
  if (props.userId) saveHistoryList(props.userId, 'file', options)
  if (options.length > 0) historyMessage.value = ''
}
async function loadHistory(force: boolean): Promise<void> {
  if (!canRead.value || !props.bridge) {
    if (historyOptions.value.length === 0) historyMessage.value = '请先确认 EASY 已登录。'
    return
  }
  const ticket = loads.begin()
  loadingHistory.value = true
  if (historyOptions.value.length === 0) historyMessage.value = ''
  try {
    let response = await props.bridge.request({ type: MessageType.ListHistoryQueries, payload: { force } }, ticket.signal)
    if (loads.isCurrent(ticket.id) && response.type === MessageType.HistoryQueriesResult && !response.payload.ok && response.payload.error.code === 'SESSION_EXPIRED') {
      response = await props.bridge.request({ type: MessageType.ListHistoryQueries, payload: { force: true } }, ticket.signal)
    }
    const current = loads.isCurrent(ticket.id)
    if (response.type !== MessageType.HistoryQueriesResult) {
      if (current && historyOptions.value.length === 0) {
        historyMessage.value = response.type === MessageType.Error && response.payload.message
          ? response.payload.message
          : '历史模板返回了意外结果。'
      }
      return
    }
    if (!response.payload.ok) {
      if (!current || historyOptions.value.length > 0) return
      const stored = props.userId ? await readHistoryList(props.userId, 'file') : []
      if (!loads.isCurrent(ticket.id)) return
      if (stored.length > 0) {
        rememberHistory(stored)
        return
      }
      historyMessage.value = response.payload.error.message
      return
    }
    rememberHistory(response.payload.data)
    if (response.payload.data.length === 0 && localTemplates.value.length === 0 && props.mode === 'history' && current) historyMessage.value = '当前账号还没有查询模板。'
    if (!current) return
    const summary = await loadDictionaries(ticket.id, ticket.signal)
    if (!loads.isCurrent(ticket.id)) return
    dictionaryNote.value = describeOptionPull({
      updatedLabels: summary.changed.map(optionLabelOf),
      failures: summary.problems,
      manual: false,
      hasLedger: ledgerPresent.value
    })
    if (recoveredForm) return
    if (props.mode === 'customer' && selectedCustomer.value) await applyBase(selectedCustomer.value.baseTemplateId, ticket)
    else if (selectedBaseId.value) await applyBase(selectedBaseId.value, ticket)
  } catch {
    if (loads.isCurrent(ticket.id) && historyOptions.value.length === 0) historyMessage.value = '读取历史模板失败。'
  } finally {
    if (loads.isCurrent(ticket.id)) loadingHistory.value = false
  }
}

function resetBase(): void {
  baseMissing.value = false
  parseWarnings.value = []
  unknownFields.value = {}
  displayValues.value = {}
  baseFields.value = {}
  baseName.value = ''
  fileDropNote.value = ''
  fileExpanded.value = {}
  collapsedByUser.value = {}
  restoreTemplate()
}
function startApply(id: string): void {
  recoveredForm = false
  void applyBase(id, loads.begin())
}
async function applyBase(id: string, ticket: { id: number; signal: AbortSignal } = loads.begin()): Promise<void> {
  selectedBaseId.value = id
  resetBase()
  if (!loads.isCurrent(ticket.id) || !id) return
  const local = localTemplates.value.find(item => item.id === id)
  if (local) {
    baseFields.value = { ...local.fields }
    displayValues.value = { ...(local.displayValues ?? {}) }
    unknownFields.value = { ...(local.unknownFields ?? {}) }
    baseName.value = local.name
    await loadFileTypes(local.fields.case_type ?? '')
    cleanFileDescription(baseFields.value)
    return
  }
  const easy = historyOptions.value.find(item => item.id === id)
  if (!easy || !props.bridge) {
    baseMissing.value = true
    baseName.value = '基础模板不存在'
    return
  }
  const response = await props.bridge.request({ type: MessageType.GetHistoryQuery, payload: { queryId: id } }, ticket.signal)
  if (!loads.isCurrent(ticket.id)) return
  if (response.type !== MessageType.HistoryQueryResult || !response.payload.ok) {
    baseMissing.value = true
    historyMessage.value = response.type === MessageType.HistoryQueryResult && !response.payload.ok
      ? response.payload.error.message : '读取历史模板详情失败。'
    return
  }
  const parsed = parseQueryXml(response.payload.data.queryXml, response.payload.data.name)
  if (!loads.isCurrent(ticket.id)) return
  if (!parsed.ok) {
    baseMissing.value = true
    historyMessage.value = parsed.error.message
    return
  }
  baseFields.value = parsed.data.fields
  displayValues.value = parsed.data.displayValues
  unknownFields.value = parsed.data.unknownFields
  parseWarnings.value = parsed.data.warnings
  baseName.value = response.payload.data.name
  await loadFileTypes(parsed.data.fields.case_type ?? '')
  cleanFileDescription(baseFields.value)
}

function openTemplateEditor(template?: QueryTemplate): void {
  editingCustomer.value = false
  editingTemplate.value = true
  editingTemplateId.value = template?.id ?? ''
  draftTemplateVersion.value = template?.version ?? null
  openedScope.value = scopeFromConnection(workspace.connection.value)
  draftName.value = template?.name ?? ''
  draftFields.value = Object.entries(template?.fields ?? {}).map(([key, value]) => ({ key, value }))
  if (draftFields.value.length === 0) draftFields.value = [{ key: 'case_type', value: '' }, { key: 'filetype', value: '' }]
}
async function saveTemplate(): Promise<void> {
  const fields: Record<string, string> = {}
  for (const row of draftFields.value) {
    if (!isFileSearchBusinessField(row.key)) {
      storageMessage.value = '有条件对不上查询页面，没有保存。'
      return
    }
    fields[row.key] = row.value
  }
  const name = draftName.value.trim()
  if (!name) {
    storageMessage.value = '请填写模板名称。'
    return
  }
  const scope = openedScope.value
  if (!scope) {
    storageMessage.value = '请先连接 EASY 后再保存模板。'
    return
  }
  const now = new Date().toISOString()
  const current = localTemplates.value.find(item => item.id === editingTemplateId.value && item.source === 'local')
  const template: QueryTemplate = current ? {
    ...current,
    name,
    fields,
    updatedAt: now
  } : {
    id: `local-${newUuid()}`,
    name,
    source: 'local',
    queryType: 'FileSearch',
    fields,
    version: 1,
    createdAt: now,
    updatedAt: now
  }
  const result = await workspace.call({ action: 'saveQueryTemplate', template, expectedScope: scope, expectedVersion: current ? draftTemplateVersion.value : null })
  if (!result?.ok) {
    storageMessage.value = result?.message || '模板没有保存。'
    return
  }
  editingTemplate.value = false
  await reloadLocal()
  await applyBase(template.id)
}
async function importCurrent(): Promise<void> {
  if (!selectedBaseId.value || baseMissing.value) return
  const scope = liveScope()
  if (!scope) return
  const now = new Date().toISOString()
  const template: QueryTemplate = {
    id: `local-${newUuid()}`,
    name: `${baseName.value || '历史模板'} 的本地副本`.slice(0, 80),
    source: 'local',
    ...(historyOptions.value.some(item => item.id === selectedBaseId.value) && isQueryGuid(selectedBaseId.value) ? { sourceQueryId: selectedBaseId.value } : {}),
    queryType: 'FileSearch',
    fields: { ...baseFields.value },
    displayValues: { ...displayValues.value },
    unknownFields: { ...unknownFields.value },
    version: 1,
    createdAt: now,
    updatedAt: now
  }
  const result = await workspace.call({ action: 'saveQueryTemplate', template, expectedScope: scope, expectedVersion: null })
  if (!result?.ok) {
    storageMessage.value = result?.message || '模板没有导入。'
    return
  }
  await reloadLocal()
  storageMessage.value = '已导入为本地模板，刷新原网站模板不会覆盖这份副本。'
}
async function copySelected(): Promise<void> {
  if (!selectedBaseId.value || baseMissing.value) return
  const scope = liveScope()
  if (!scope) return
  const now = new Date().toISOString()
  const result = await workspace.call({
    action: 'saveQueryTemplate',
    expectedScope: scope,
    expectedVersion: null,
    template: {
      id: `local-${newUuid()}`,
      name: `${baseName.value || '模板'} 副本`.slice(0, 80),
      source: 'local',
      queryType: 'FileSearch',
      fields: { ...baseFields.value },
      displayValues: { ...displayValues.value },
      unknownFields: { ...unknownFields.value },
      version: 1,
      createdAt: now,
      updatedAt: now
    }
  })
  if (!result?.ok) {
    storageMessage.value = result?.message || '模板没有复制。'
    return
  }
  await reloadLocal()
}
async function deleteSelectedLocal(): Promise<void> {
  if (!selectedLocal.value) return
  const scope = liveScope()
  if (!scope) return
  const result = await workspace.call({ action: 'deleteQueryTemplate', id: selectedLocal.value.id, expectedScope: scope })
  if (!result?.ok) {
    storageMessage.value = result?.message || '模板没有删除。'
    return
  }
  selectedBaseId.value = ''
  baseFields.value = {}
  await reloadLocal()
}
async function deleteSelectedSite(): Promise<void> {
  if (deletingSite.value || !props.bridge) return
  const linked = selectedLocal.value?.sourceQueryId
  const queryId = selectedEasy.value?.id || (linked && isQueryGuid(linked) ? linked : '')
  if (!queryId) {
    storageMessage.value = '先选中原网站上的模板，再删除。'
    return
  }
  const named = historyOptions.value.find(item => item.id === queryId)
  const label = named ? easyLabel(named) : queryId
  const agreed = await confirmDialog({
    title: '删除原网站模板',
    message: `会从原网站删掉「${label}」。本机另外保存的副本还会留着。`,
    confirmLabel: '删除'
  })
  if (!agreed) return
  deletingSite.value = true
  storageMessage.value = '正在从原网站删除…'
  try {
    const response = await props.bridge.request({
      type: MessageType.DeleteHistoryQuery,
      payload: { queryId }
    })
    if (response.type !== MessageType.HistoryQueryDeleted || !response.payload.ok) {
      const reason = response.type === MessageType.HistoryQueryDeleted && !response.payload.ok
        ? response.payload.error.message
        : response.type === MessageType.Error ? response.payload.message : '原网站没有返回删除结果。'
      storageMessage.value = `原网站没有删除：${reason}`
      return
    }
    if (selectedBaseId.value === queryId) {
      selectedBaseId.value = ''
      baseFields.value = {}
      baseName.value = ''
    }
    const scope = liveScope()
    let unlinked = true
    if (scope) {
      for (const local of localTemplates.value.filter(item => item.sourceQueryId === queryId)) {
        const { sourceQueryId: _removed, ...rest } = local
        const saved = await workspace.call({
          action: 'saveQueryTemplate',
          expectedScope: scope,
          expectedVersion: local.version,
          template: { ...rest, updatedAt: new Date().toISOString() }
        })
        if (!saved?.ok) unlinked = false
      }
    }
    await loadHistory(true)
    await reloadLocal()
    storageMessage.value = unlinked
      ? '已从原网站删除这份模板。'
      : '原网站上的模板已删除。本机副本还记着它，请再打开一次本地模板后保存。'
  } catch {
    storageMessage.value = '删除原网站模板失败。'
  } finally {
    deletingSite.value = false
  }
}

function openCustomerEditor(profile?: CustomerQueryProfile): void {
  editingTemplate.value = false
  editingCustomer.value = true
  draftCustomerId.value = profile?.id ?? ''
  draftCustomerRevision.value = profile?.revision ?? 1
  openedScope.value = scopeFromConnection(workspace.connection.value)
  draftName.value = profile?.name ?? ''
  draftBaseId.value = profile?.baseTemplateId ?? selectedBaseId.value
  draftEnabled.value = profile?.enabled ?? true
  draftEasyId.value = profile?.easyCustomerId ?? ''
  draftFields.value = Object.entries(profile?.overrides ?? { customer_name_vague: '' }).map(([key, value]) => ({ key, value }))
}
async function saveCustomer(): Promise<void> {
  const overrides: Record<string, string> = {}
  for (const row of draftFields.value) {
    if (!isFileSearchBusinessField(row.key)) {
      storageMessage.value = '有条件对不上查询页面，没有保存。'
      return
    }
    overrides[row.key] = row.value
  }
  const scope = openedScope.value
  if (!scope) {
    storageMessage.value = '请先连接 EASY 后再保存客户。'
    return
  }
  if (!draftName.value.trim()) {
    storageMessage.value = '请填写客户名称。'
    return
  }
  if (!draftBaseId.value.trim()) {
    storageMessage.value = '请选择基础模板。'
    return
  }
  const existing = customers.value.find(item => item.id === draftCustomerId.value)
  const result = await workspace.call({
    action: 'saveCustomer',
    expectedScope: scope,
    ...(draftCustomerId.value ? { expectedRevision: draftCustomerRevision.value } : {}),
    profile: {
      ...(draftCustomerId.value ? { id: draftCustomerId.value, revision: draftCustomerRevision.value } : { id: `customer-${newUuid()}` }),
      name: draftName.value,
      ...(draftEasyId.value.trim() ? { easyCustomerId: draftEasyId.value.trim() } : {}),
      baseTemplateId: draftBaseId.value,
      overrides,
      enabled: draftEnabled.value,
      ...(existing?.fileDownloadName ? { fileDownloadName: existing.fileDownloadName } : {}),
      ...(existing?.boundQuery ? { boundQuery: existing.boundQuery } : {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  })
  if (!result?.ok) {
    storageMessage.value = result?.message || '保存客户配置失败。'
    return
  }
  const saved = result.customers.find(item => item.name === draftName.value.trim() || item.id === draftCustomerId.value)
  editingCustomer.value = false
  await reloadLocal()
  if (saved) {
    selectedCustomerId.value = saved.id
    await applyBase(saved.baseTemplateId)
  }
}
async function deleteCustomer(): Promise<void> {
  if (!selectedCustomer.value) return
  const scope = liveScope()
  if (!scope) return
  const result = await workspace.call({
    action: 'deleteCustomer',
    id: selectedCustomer.value.id,
    expectedScope: scope,
    expectedRevision: selectedCustomer.value.revision ?? 1
  })
  if (!result?.ok) {
    storageMessage.value = result?.message || '客户没有删除。'
    return
  }
  selectedCustomerId.value = ''
  await reloadLocal()
}

/** 模板里的 `{控件}_text`：多选值逐个换成人名再用逗号拼，和原站一致；换不出名字就不写这节。 */
function labelForSave(key: string, value: string): string {
  const options = key === 'filetype' && fileTypeNodes.value.length
    ? fileTypeNodes.value.map(node => ({ value: node.id, label: node.name }))
    : optionsFor(key)
  return resolveMultiLabel(value, options) || displayValues.value[key]?.trim() || ''
}
function filledDisplay(): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const [key, value] of Object.entries(resolved.value.fields)) {
    if (!value.trim()) continue
    const label = labelForSave(key, value.trim())
    if (label && label !== value.trim()) labels[key] = label
  }
  return labels
}
function siteQueryId(name: string): string {
  const linked = selectedLocal.value?.sourceQueryId
  if (linked && isQueryGuid(linked)) return linked
  const easy = historyOptions.value.find(item => item.id === selectedBaseId.value)
  return easy && easy.name === name && isQueryGuid(easy.id) ? easy.id : ''
}
async function ensureHotFields(openAfter: boolean): Promise<void> {
  if (hotLoaded.value) {
    if (openAfter) openAllExtra()
    return
  }
  if (hotFlight) return hotFlight
  hotFlight = runHotFields(openAfter).finally(() => { hotFlight = null })
  return hotFlight
}
async function runHotFields(openAfter: boolean): Promise<void> {
  if (!props.bridge) {
    hotLoaded.value = true
    hotNote.value = '没有连上原网站，下面仍用本地记录的查询字段。'
    if (openAfter) openAllExtra()
    return
  }
  hotAbort?.abort()
  const ticket = hotAbort = new AbortController()
  const loadId = loads.peek()
  hotLoading.value = true
  hotNote.value = '正在从原网站读取下面的查询字段…'
  try {
    const [response, summary] = await Promise.all([
      props.bridge.request({ type: MessageType.ScanFileSearchForm }, ticket.signal),
      loadDictionaries(loadId, ticket.signal, true)
    ])
    if (hotAbort !== ticket || !loads.isCurrent(loadId)) return
    dictionaryNote.value = describeOptionPull({
      updatedLabels: summary.changed.map(optionLabelOf),
      failures: summary.problems,
      manual: false,
      hasLedger: ledgerPresent.value
    })
    if (response.type !== MessageType.FileSearchFormResult) {
      hotNote.value = response.type === MessageType.Error ? response.payload.message : '没有读到原网站的查询字段。'
      return
    }
    const checked = overlayFieldOptions(response.payload.fields, dictionaryOptions)
    const fields = checked.length ? mergeFormFields(checked, fallbackFields()) : undefined
    if (fields) pageFields.value = fields
    if (props.userId) rememberFormFields(props.userId, checked.map(field => ({ ...field, id: formFieldKey(field.id) })))
    const live = cellsFromLiveFields(fields ?? checked)
    const count = live.case.length + live.file.length
    if (count) hotExtra.value = live
    hotLoaded.value = true
    hotNote.value = count
      ? `已从原网站载入 ${count} 个其余查询字段。`
      : '原网站没有更多可见的查询字段，下面仍用本地记录。'
    if (openAfter) openAllExtra()
  } catch {
    hotNote.value = '读取原网站查询字段失败，可以再往下滚一次。'
  } finally {
    hotLoading.value = false
  }
}
async function saveBoth(): Promise<void> {
  if (savingTemplate.value) return
  const name = saveName.value.trim()
  if (!name) {
    storageMessage.value = '请填写模板名称。'
    return
  }
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(resolved.value.fields)) {
    if (value.trim()) fields[key] = value
  }
  if (!hasExplicitFileSearchFilter(fields)) {
    storageMessage.value = '先填写至少一项查询条件，再保存。'
    return
  }
  const scope = liveScope()
  if (!scope) return
  const labels = filledDisplay()
  let downloadFields: Record<string, string>
  try { downloadFields = downloadNameControlFields(currentDownloadSelection()) }
  catch (error) {
    storageMessage.value = error instanceof Error ? error.message : '下载名称无效，没有保存模板。'
    return
  }
  const savedUnknownFields = {
    ...Object.fromEntries(Object.entries(unknownFields.value).filter(([key]) => !isDownloadNameControl(key))),
    ...downloadFields
  }
  const current = selectedLocal.value
  const now = new Date().toISOString()
  const template: QueryTemplate = current ? {
    ...current,
    name,
    fields,
    displayValues: labels,
    unknownFields: savedUnknownFields,
    updatedAt: now
  } : {
    id: `local-${newUuid()}`,
    name,
    source: 'local',
    queryType: 'FileSearch',
    fields,
    displayValues: labels,
    unknownFields: savedUnknownFields,
    version: 1,
    createdAt: now,
    updatedAt: now
  }
  savingTemplate.value = true
  storageMessage.value = '正在保存到本地…'
  try {
    const result = await workspace.call({
      action: 'saveQueryTemplate',
      template,
      expectedScope: scope,
      expectedVersion: current ? current.version : null
    })
    if (!result?.ok) {
      storageMessage.value = result?.message || '本地没有保存。'
      return
    }
    const stored = result.templates.find(item => item.id === template.id && item.source === 'local')
    if (!props.bridge) {
      storageMessage.value = '已保存在本地。当前没有连上原网站，网站上的模板没有写入。'
      await reloadLocal()
      if (stored) await applyBase(stored.id)
      return
    }
    storageMessage.value = '本地已保存，正在写入原网站…'
    const before = new Set(historyOptions.value.map(item => item.id))
    const queryId = siteQueryId(name)
    const response = await props.bridge.request({
      type: MessageType.SaveHistoryQuery,
      payload: {
        title: name,
        queryId,
        queryXml: buildQueryXml(fields, labels, template.unknownFields ?? {})
      }
    })
    if (response.type !== MessageType.HistoryQuerySaved || !response.payload.ok) {
      const reason = response.type === MessageType.HistoryQuerySaved && !response.payload.ok
        ? response.payload.error.message
        : response.type === MessageType.Error ? response.payload.message : '原网站没有返回保存结果。'
      storageMessage.value = `已保存在本地。原网站没有写入：${reason}`
      await reloadLocal()
      if (stored) await applyBase(stored.id)
      return
    }
    try { await loadHistory(true) } catch { /* 网站已写入，列表刷新失败时仍保留本地模板。 */ }
    // 原站带 query_id 保存也是另存一份新的，不是覆盖。本地模板改挂到新存出来的那份上。
    const created = historyOptions.value.find(item => !before.has(item.id) && item.name === name)
    const linkedId = created?.id || queryId || ''
    if (stored && linkedId && isQueryGuid(linkedId) && stored.sourceQueryId !== linkedId) {
      const again = liveScope()
      if (again) {
        await workspace.call({
          action: 'saveQueryTemplate',
          expectedScope: again,
          expectedVersion: stored.version,
          template: { ...stored, sourceQueryId: linkedId, updatedAt: new Date().toISOString() }
        })
      }
    }
    storageMessage.value = created
      ? '已保存在本地，并在原网站另存了一份新的查询模板。'
      : queryId ? '已更新本地模板，并写回原网站上的同名模板。' : '已保存在本地，并在原网站新建了这份查询模板。'
    await reloadLocal()
    const picked = localTemplates.value.find(item => item.id === template.id)
    if (picked) await applyBase(picked.id)
  } finally {
    savingTemplate.value = false
  }
}
async function checkAgainstPage(): Promise<void> {
  if (!props.bridge) {
    checkMessage.value = '先连接原网站，才能对照查询页。'
    return
  }
  checkingForm.value = true
  // 静默校对不放进度文案：字段照常可选，完成后只在有更新或拉不到时说话。
  checkMessage.value = ledgerPresent.value ? '' : '正在读取查询页上的字段，并向原网站要下拉…'
  try {
    const ticket = loads.begin()
    const caseTypeId = formValue('case_type').trim()
    const [response, summary] = await Promise.all([
      props.bridge.request({ type: MessageType.ScanFileSearchForm }, ticket.signal),
      loadDictionaries(ticket.id, ticket.signal, true),
      /^[0-9a-f-]{36}$/i.test(caseTypeId) ? loadFileTypes(caseTypeId) : Promise.resolve()
    ])
    if (!loads.isCurrent(ticket.id)) return
    if (response.type !== MessageType.FileSearchFormResult) {
      checkMessage.value = describeOptionPull({
        updatedLabels: summary.changed.map(optionLabelOf),
        failures: [...summary.problems, response.type === MessageType.Error ? response.payload.message : '没有读到原网站的查询表。'],
        manual: true,
        hasLedger: ledgerPresent.value
      })
      return
    }
    const previous = fallbackFields()
    const checked = overlayFieldOptions(response.payload.fields, dictionaryOptions)
    const fields = checked.length ? mergeFormFields(checked, previous) : undefined
    if (fields) pageFields.value = fields
    const formChanged = props.userId
      ? rememberFormFields(props.userId, checked.map(field => ({ ...field, id: formFieldKey(field.id) })))
      : []
    const diff = formCheckDiff(fields ?? checked, previous)
    const updatedLabels = [...new Set([...summary.changed, ...formChanged].map(optionLabelOf).concat(diff.optionsChanged))]
    const parts: string[] = []
    const updated = describeOptionUpdate(updatedLabels)
    if (updated) parts.push(updated)
    if (summary.problems.length) parts.push(ledgerPresent.value ? OPTION_PULL_FALLBACK : summary.problems[0]!)
    if (diff.hiddenNow.length) parts.push(`新藏起来的：${diff.hiddenNow.join('，')}。`)
    if (diff.shownNow.length) parts.push(`现在能看到的：${diff.shownNow.join('，')}。`)
    if (!parts.length) parts.push(OPTION_PULL_UNCHANGED)
    checkMessage.value = parts.join('')
  } catch {
    checkMessage.value = ledgerPresent.value ? OPTION_PULL_FALLBACK : '对照原网站查询页失败。'
  } finally {
    checkingForm.value = false
  }
}
function search(): void {
  if (!canSubmit.value) return
  if (unavailableFields.value.length) return
  const fields = { ...resolved.value.fields }
  cleanFileDescription(fields)
  if (fields.is_close !== undefined) fields.is_close = fields.is_close.trim() === '1' || fields.is_close.trim() === '否' ? '1' : ''
  const size = Number(props.pageSize)
  const pageSize = Number.isSafeInteger(size) && size >= 1 && size <= 100 ? size : 20
  emit('search', { resolvedFields: fields, pageIndex: 1, pageSize }, fileSearchTimeoutMs(queryTimeoutMs.value))
}

function applySeed(): void {
  const seed = props.seed
  if (!seed || !props.seedToken) return
  const nextActive = { ...temporaryActive.value }
  const next = { ...temporary.value }
  for (const [key, value] of Object.entries(seed)) {
    if (!isFileSearchBusinessField(key)) continue
    const text = value.trim()
    if (key === 'is_close') {
      if (text === '1' || text === '否') {
        nextActive[key] = true
        next[key] = '1'
      }
      continue
    }
    if (!text || text.length > fileSearchValueLimit(key)) continue
    nextActive[key] = true
    next[key] = text
  }
  temporaryActive.value = nextActive
  temporary.value = next
  const copy = { ...openExtra.value }
  for (const block of formSections.value) {
    if (extraFilled(block, next)) copy[block.title] = true
  }
  openExtra.value = copy
}

watch(() => [props.userId, props.mode, props.origin] as const, () => {
  dictionaryLoading.value = false
  dictionariesRead.value = false
  failedDictionaryKinds.value = []
  historyOptions.value = props.userId ? peekHistoryList(props.userId, 'file') : []
  historyMessage.value = ''
  basicDictionaries.value = {}
  flowDictionaries.value = {}
  pickers.value = {}
  pickerWarnings.value = []
  dictionaryNote.value = ''
  fileTypeNodes.value = []
  fileTypeRoots.value = []
  editingCustomer.value = false
  editingTemplate.value = false
  openedScope.value = null
  resetBase()
  selectedBaseId.value = ''
  openExtra.value = defaultOpenExtra()
  hotExtra.value = null
  hotLoaded.value = false
  hotNote.value = ''
  saveNameDirty.value = false
  hotAbort?.abort()
  void reloadLocal()
  applySeed()
  if (!props.userId) return
  activateOptionFallback(props.userId)
  void hydrateOptionFallback(props.userId)
  void readHistoryList(props.userId, 'file').then(stored => {
    if (historyOptions.value.length === 0 && stored.length > 0) historyOptions.value = stored
  })
  void loadHistory(false)
  void ensureHotFields(false)
}, { immediate: true })
watch(() => props.seedToken, () => { applySeed() })
watch(selectedCaseTypeId, id => { void loadFileTypes(id) }, { immediate: true })
watch(resolved, (next) => {
  const copy = { ...openExtra.value }
  let changed = false
  for (const block of formSections.value) {
    if (copy[block.title] || collapsedByUser.value[block.title] || !extraFilled(block, next.fields)) continue
    copy[block.title] = true
    changed = true
  }
  if (changed) openExtra.value = copy
})
watch(selectedCustomerId, () => {
  if (restoringForm) return
  recoveredForm = false
  const profile = selectedCustomer.value
  resetBase()
  if (!profile) return
  void applyBase(profile.baseTemplateId)
}, { flush: 'sync' })
</script>

<template>
  <section class="card query-template" aria-label="查询模板">
    <div class="section-heading">
      <strong>{{ manage ? (mode === 'customer' ? '当前账号的客户配置' : '当前账号的模板') : '按模板查询' }}</strong>
      <span class="inline-actions">
        <button v-if="mode === 'history' && (selectedEasy || (selectedLocal?.sourceQueryId && isQueryGuid(selectedLocal.sourceQueryId)))" type="button" class="text-button" :disabled="deletingSite" @click="deleteSelectedSite">{{ deletingSite ? '正在删除…' : '删除原网站模板' }}</button>
        <button type="button" class="text-button" :disabled="!canRead || loadingHistory" @click="loadHistory(true)">重新读取</button>
      </span>
    </div>
    <p v-if="loadingHistory && historyOptions.length === 0" class="hint">正在读取当前账号的查询模板…</p>
    <p v-if="historyMessage && historyOptions.length === 0" class="hint">{{ historyMessage }}</p>
    <p v-if="storageMessage" class="hint">{{ storageMessage }}</p>
    <ul v-if="mode === 'history' && accountTemplates.length" class="template-picks">
      <li v-for="item in accountTemplates" :key="item.source + item.id">
        <button type="button" :class="{ on: selectedBaseId === item.id }" @click="pickTemplate(item.id)">
          <b v-hint.clip="item.name">{{ item.name }}</b>
          <small>{{ item.source === 'easy' ? 'EASY' : '本地' }}</small>
        </button>
      </li>
    </ul>
    <ul v-else-if="mode === 'customer' && customers.length" class="template-picks">
      <li v-for="item in customers" :key="item.id">
        <button type="button" :class="{ on: selectedCustomerId === item.id }" @click="selectedCustomerId = item.id">
          <b v-hint.clip="item.name">{{ item.name }}</b>
          <small>{{ item.enabled ? '启用' : '停用' }}</small>
        </button>
      </li>
    </ul>
    <p v-else-if="!loadingHistory && mode === 'customer' && manage" class="empty">还没有客户。点下面的新增客户。</p>

    <EmptyGuide v-if="mode === 'history' && !manage && !loadingHistory && historyOptions.length === 0 && localTemplates.length === 0" text="还没有查询模板。去查询模板页新建一个，再回来选用。" action="去建模板" hash="/templates" />
    <label v-else-if="mode === 'history'">选用模板
      <ThemeSelect v-model="selectedBaseId" :disabled="loadingHistory && historyOptions.length === 0" :placeholder="loadingHistory && historyOptions.length === 0 ? '正在读取…' : '请选择'" empty-text="还没有模板。点下面的新建本地模板，或点上面的重新读取。" :options="[...historyOptions.map(item => ({ value: item.id, label: easyLabel(item), group: 'EASY' })), ...localTemplates.map(item => ({ value: item.id, label: item.name, group: '本地' }))]" @change="startApply(selectedBaseId)" />
    </label>
    <EmptyGuide v-else-if="!manage && customers.length === 0" text="还没有客户。去客户管理建一个，再回来选用。" action="去创建客户" hash="/customers" />
    <label v-else>客户
      <ThemeSelect v-model="selectedCustomerId" placeholder="请选择" empty-text="还没有客户。点下面的新增客户。" :options="customers.map(item => ({ value: item.id, label: item.name + (item.enabled ? '' : '（已停用）') }))" />
    </label>
    <p v-if="baseName" class="hint">基础模板：{{ baseName }}<span v-if="selectedLocal"> · 来源：本地</span><span v-else-if="selectedBaseId"> · 来源：EASY · 只读</span><span v-if="selectedLocal?.sourceQueryId"> · 已导入，刷新原网站模板不会覆盖</span></p>
    <p v-if="baseMissing" class="error" role="alert">基础模板不存在或无法解析，不会改用其他模板。</p>
    <p v-if="mode === 'customer' && selectedCustomer && !selectedCustomer.enabled" class="error" role="alert">该客户配置已停用。</p>
    <p v-if="unknownCount" class="hint">这个模板还带有 {{ unknownCount }} 个 EASY 页面上的显示字段，查询时不会使用。</p>
    <p v-for="warning in visibleWarnings" :key="warning" class="hint">{{ warning }}</p>

    <div v-if="manage" class="inline-actions" aria-label="模板操作">
      <button type="button" class="text-button" @click="openTemplateEditor()">新建本地模板</button>
      <button type="button" class="text-button" :disabled="!selectedBaseId || baseMissing" @click="importCurrent">从当前模板导入</button>
      <button type="button" class="text-button" :disabled="!selectedBaseId || baseMissing" @click="copySelected">复制</button>
      <button type="button" class="text-button" :disabled="!selectedLocal" @click="openTemplateEditor(selectedLocal ?? undefined)">编辑本地模板</button>
      <button type="button" class="text-button" :disabled="!selectedLocal" @click="deleteSelectedLocal">删除本地模板</button>
    </div>
    <div v-if="manage && mode === 'customer'" class="inline-actions" aria-label="客户操作">
      <button type="button" class="text-button" @click="openCustomerEditor()">新增客户</button>
      <button type="button" class="text-button" :disabled="!selectedCustomer" @click="openCustomerEditor(selectedCustomer ?? undefined)">编辑客户配置</button>
      <button type="button" class="text-button" :disabled="!selectedCustomer" @click="deleteCustomer">删除客户</button>
    </div>

    <form v-if="manage && editingTemplate" class="editor" @submit.prevent="saveTemplate">
      <strong>本地模板</strong>
      <label>名称<input v-model="draftName" type="text" maxlength="80" /></label>
      <div v-for="(row, index) in draftFields" :key="index" class="field-row">
        <ThemeSelect v-model="row.key" :options="fieldOptions" />
        <input v-model="row.value" type="text" />
        <button type="button" class="text-button" @click="draftFields.splice(index, 1)">移除</button>
      </div>
      <button type="button" class="text-button" @click="draftFields.push({ key: 'customer_name_vague', value: '' })">添加字段</button>
      <button type="submit" class="search-submit">保存本地模板</button>
    </form>

    <form v-if="manage && editingCustomer" class="editor" @submit.prevent="saveCustomer">
      <strong>客户配置</strong>
      <label>客户名称<input v-model="draftName" type="text" maxlength="80" /></label>
      <label>基础模板
        <ThemeSelect v-model="draftBaseId" placeholder="请选择" :options="baseChoices.map(item => ({ value: item.id, label: `${item.name}（${item.source === 'easy' ? 'EASY' : '本地'}）` }))" />
      </label>
      <label>客户编号（可不填）<input v-model="draftEasyId" type="text" autocomplete="off" /></label>
      <label class="check-line"><input v-model="draftEnabled" type="checkbox" />启用</label>
      <div v-for="(row, index) in draftFields" :key="index" class="field-row">
        <ThemeSelect v-model="row.key" :options="fieldOptions" />
        <input v-model="row.value" type="text" placeholder="留空会清空这项" />
        <button type="button" class="text-button" @click="draftFields.splice(index, 1)">移除</button>
      </div>
      <button type="button" class="text-button" @click="draftFields.push({ key: 'filetype', value: '' })">添加条件</button>
      <button type="submit" class="search-submit">保存客户</button>
    </form>

    <div class="query-conditions">
      <div class="section-heading">
        <strong>查询条件</strong>
        <span v-if="manage" class="template-save-row">
          <label>模板名称<input v-model="saveName" type="text" maxlength="80" @input="saveNameDirty = true" /></label>
          <button type="button" class="search-submit" :disabled="savingTemplate" @click="saveBoth">{{ savingTemplate ? '正在保存…' : '保存到本地和网站' }}</button>
        </span>
        <span class="inline-actions">
          <label class="query-timeout">超时时间
            <ThemeSelect v-model="queryTimeoutMs" :options="timeoutOptions" />
          </label>
          <button type="button" class="text-button" :disabled="checkingForm" @click="checkAgainstPage">校对最新字段</button>
          <button type="button" class="text-button" @click="restoreTemplate">恢复模板</button>
        </span>
      </div>
      <p class="hint">往下滚动会从原网站读取其余查询字段。保存会同时写入本机和原网站的查询模板。</p>
      <p v-if="dictionaryNote" class="hint">{{ dictionaryNote }}</p>
      <p v-if="mode === 'customer' && selectedCustomer" class="hint">当前客户：{{ selectedCustomer.name }}</p>
      <section v-for="block in formSections" :key="block.title" class="query-block">
        <div class="section-heading">
          <strong>{{ block.title }}</strong>
          <button v-if="block.extra.length" type="button" class="text-button" @click="toggleExtra(block.title)">{{ openExtra[block.title] ? '收起' : '展开' }}</button>
        </div>
        <div class="query-grid">
          <template v-for="(cell, index) in shownCells(block)" :key="block.title + index">
            <label v-if="cell.kind === 'text'" :class="cellClass(cell)">
              <span>{{ cell.label }}</span>
              <input :value="formValue(cell.key)" type="text" @input="onText(cell.key, $event)" />
            </label>
            <label v-else-if="cell.kind === 'named'" :class="cellClass(cell)">
              <span>{{ cell.label }}</span>
              <TreeOptionSelect v-if="showPicker(cell.key)" :model-value="formValue(cell.key)" :multiple="isMultiPickerKey(cell.key)" :options="pickerOptions(cell.key)" :status="optionStatus(cell.key)" :empty-text="`当前账号未配置${cell.label}`" @retry="checkAgainstPage" @update:model-value="setOverride(cell.key, String($event))" />
              <ThemeSelect v-else :model-value="formValue(cell.key)" :options="optionsFor(cell.key)" @update:model-value="setOverride(cell.key, String($event))" />
            </label>
            <label v-else-if="cell.kind === 'select'" :class="cellClass(cell)">
              <span>{{ cell.label }}</span>
              <TreeOptionSelect v-if="showPicker(cell.key)" :model-value="formValue(cell.key)" :multiple="isMultiPickerKey(cell.key)" :options="pickerOptions(cell.key)" :status="optionStatus(cell.key)" :empty-text="`当前账号未配置${cell.label}`" @retry="checkAgainstPage" @update:model-value="setOverride(cell.key, String($event))" />
              <ThemeSelect v-else :model-value="formValue(cell.key)" :options="optionsFor(cell.key)" @update:model-value="setOverride(cell.key, String($event))" />
            </label>
            <div v-else-if="cell.kind === 'dates'" :class="cellClass(cell)">
              <span>{{ cell.label }}</span>
              <span class="date-pair">
                <WDatePicker :id="cell.start" :model-value="formValue(cell.start)" :max="formValue(cell.end)" placeholder="起" @update:model-value="setOverride(cell.start, String($event))" />
                <em>到</em>
                <WDatePicker :id="cell.end" :model-value="formValue(cell.end)" :min="formValue(cell.start)" placeholder="止" @update:model-value="setOverride(cell.end, String($event))" />
                <label v-if="cell.empty" class="empty-check"><input :checked="checked(cell.empty)" type="checkbox" @change="onCheck(cell.empty, $event)" />为空</label>
              </span>
            </div>
            <div v-else-if="cell.kind === 'checks'" :class="cellClass(cell)">
              <span>{{ cell.label }}</span>
              <span class="check-group">
                <label v-for="item in cell.items" :key="item.key"><input :checked="checked(item.key)" type="checkbox" @change="onCheck(item.key, $event)" />{{ item.label }}</label>
              </span>
            </div>
            <div v-else-if="cell.kind === 'download-name'" :class="cellClass(cell)">
              <span>设置下载文件名称</span>
              <span class="download-name-row">
                <ThemeSelect class="download-template-select" aria-label="下载名称模板" :model-value="formValue('filetemp')" :options="downloadChoices('filetemp')" @update:model-value="chooseDownloadTemplate(String($event))" />
                <span class="download-name-parts">
                  <span v-for="(part, index) in nameParts" :key="index" class="download-name-part">
                    <span v-if="index" class="download-part-plus" aria-hidden="true">+</span>
                    <ThemeSelect :aria-label="`下载名称第${index + 1}段`" :model-value="part.column" :options="namePartChoices(part.column)" @update:model-value="editNamePart(index, { column: String($event) })" />
                    <input v-if="part.column === 'fixtxt'" class="download-part-text" :aria-label="`第${index + 1}段固定字符`" :value="part.fixedText" maxlength="80" type="text" placeholder="固定字符" @input="editNamePart(index, { fixedText: ($event.target as HTMLInputElement).value })" />
                    <button v-if="nameParts.length > 1" type="button" class="text-button download-part-remove" :aria-label="`删除第${index + 1}段`" @click="removeNamePart(index)">×</button>
                  </span>
                  <button type="button" class="text-button download-part-add" :disabled="nameParts.length >= 31" @click="addNamePart">添加名称段</button>
                </span>
                <input :value="formValue('tempName')" type="text" placeholder="模板名称" @input="onText('tempName', $event)" />
                <button type="button" class="download-save" @click="downloadHint = '下载名称的保存和删除写在原网站账号上，这里先接上选择，不从插件提交。'">保存下载名称</button>
              </span>
              <p class="download-note">此处可设置文件下载名称模板，填写模板名称保存后，可在第一个下拉中进行选择。模板为执行保存的用户专有，其他用户不共享。选中的名称会带到后面的发文，用来生成文件名，不作为查询条件。</p>
              <p v-if="downloadHint" class="hint">{{ downloadHint }}</p>
              <p v-if="downloadNameProblem" class="download-name-error" role="alert">{{ downloadNameProblem }}</p>
            </div>
            <div v-else :class="cellClass(cell)">
              <span>{{ cell.label }}</span>
              <span class="file-summary">
                <em v-hint.clip="fileDisplay(cell.key) || '未选择'">{{ fileSummary(cell.key) }}</em>
                <button type="button" class="text-button" @click="showFileTree = !showFileTree">{{ showFileTree ? '收起' : '修改' }}</button>
                <button v-if="formValue(cell.key)" type="button" class="text-button" @click="setOverride(cell.key, '')">清除</button>
                <button v-if="fileTruncated(cell.key)" type="button" class="text-button" @click="toggleFileExpand(cell.key)">{{ fileExpanded[cell.key] ? '收起全文' : '展开全部' }}</button>
              </span>
            </div>
            <div v-if="cell.kind === 'files' && showFileTree" class="query-cell span-all">
              <span></span>
              <FileTypePicker v-if="fileTypeRoots.length" :nodes="fileTypeNodes" :root-ids="fileTypeRoots" :model-value="formValue('filetype')" :history-text="displayValues.filetype" @update:model-value="setOverride('filetype', $event)" />
              <p v-else-if="!isQueryGuid(selectedCaseTypeId)" class="hint">先选定案件类型，才能挑选文件描述。</p>
              <p v-else-if="fileTypeMessage" class="hint">{{ fileTypeMessage }}</p>
              <p v-else class="hint">正在读取文件描述…</p>
            </div>
          </template>
        </div>
      </section>
      <p ref="hotSentinel" class="hint">{{ hotLoading ? '正在从原网站读取下面的查询字段…' : hotNote || '继续往下，读取原网站上其余的查询字段。' }}</p>
      <p v-if="fileDropNote" class="hint">{{ fileDropNote }}</p>
      <p v-if="checkMessage" class="hint">{{ checkMessage }}</p>
      <p v-if="resolved.warnings.length" class="hint">{{ resolved.warnings[0] }}</p>
    </div>
    <button v-if="canSearch" type="button" class="search-submit" :disabled="!canSubmit" :title="submitHint" @click="search">查询文件</button>
    <p v-if="canSearch && !canSubmit" class="hint" role="status">{{ submitHint }}</p>
  </section>
</template>
