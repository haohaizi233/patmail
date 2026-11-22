import { computed, ref, type Ref } from 'vue'
import {
  buildFeeQueryXml,
  FEE_CHECK_KEYS,
  isFeeSearchInputField,
  parseFeeCustomerRefs,
  readFeeQueryXml,
  sanitizeFeeFieldValue,
} from '../../api/fee-form'
import type { HistoryQueryOption } from '../../api/query-history'
import { historyLabels } from '../../query/history-labels'
import { TemplateLoadCoordinator } from '../../query/load-coordinator'
import { isQueryGuid } from '../../query/query-validator'
import {
  downloadTemplateJson,
  readTemplateJson,
  templateJsonFileName,
  templateJsonText,
} from '../../query/template-json'
import { MessageType, type MessageBridge } from '../../shared/message'
import { confirmDialog } from '../dialog'

export interface SelectedCustomerRef {
  id: string
  name: string
}

export interface UseFeeQueryTemplatesOptions {
  defaultValues: Record<string, string>
  values: Ref<Record<string, string>>
  checkedBoxes: Ref<Record<string, boolean>>
  selectedCustomers: Ref<SelectedCustomerRef[]>
  selectedRuleOutCustomers: Ref<SelectedCustomerRef[]>
  canRead: Ref<boolean>
  activeBridge: () => MessageBridge | undefined
  collectDisplayValues: () => Record<string, string>
  maybeExpandAdvanced: (fields: Record<string, string>, checks: Record<string, boolean>) => void
  onCustomersLoaded: (customerIds: string) => void
  onRefreshCtrlProc: () => void
}

export function useFeeQueryTemplates(options: UseFeeQueryTemplatesOptions) {
  const templateLoads = new TemplateLoadCoordinator()
  const templates = ref<HistoryQueryOption[]>([])
  const selectedTemplateId = ref('')
  const saveName = ref('')
  const saveNameDirty = ref(false)
  const loadingTemplates = ref(false)
  const savingTemplate = ref(false)
  const deletingTemplate = ref(false)
  const templateMessage = ref('')
  const unknownTemplateFields = ref<Record<string, string>>({})
  const templateJsonInput = ref<HTMLInputElement | null>(null)

  const templateLabelMap = computed(() => historyLabels(templates.value))
  function templateLabel(item: HistoryQueryOption): string {
    return templateLabelMap.value.get(item.id) ?? item.name
  }

  function collectDraftFields(): Record<string, string> {
    const fields: Record<string, string> = {}
    for (const [k, v] of Object.entries(options.values.value)) {
      if (isFeeSearchInputField(k) && v.trim()) fields[k] = v.trim()
    }
    for (const [k, checked] of Object.entries(options.checkedBoxes.value)) {
      if (FEE_CHECK_KEYS.has(k) && checked) fields[k] = 'on'
    }
    return fields
  }

  async function loadTemplates(force: boolean): Promise<void> {
    const b = options.activeBridge()
    if (!options.canRead.value || !b) {
      templateMessage.value = '请先确认 EASY 已登录。'
      return
    }
    const ticket = templateLoads.begin()
    loadingTemplates.value = true
    templateMessage.value = ''
    try {
      const resp = await b.request(
        { type: MessageType.ListHistoryQueries, payload: { force, surface: 'fee' } },
        ticket.signal,
      )
      if (!templateLoads.isCurrent(ticket.id)) return
      if (resp.type !== MessageType.HistoryQueriesResult || !resp.payload.ok) {
        templates.value = []
        templateMessage.value =
          resp.type === MessageType.Error
            ? resp.payload.message
            : resp.type === MessageType.HistoryQueriesResult && !resp.payload.ok
              ? resp.payload.error.message
              : '费用模板没有读到。'
        return
      }
      templates.value = resp.payload.data
      if (resp.payload.data.length === 0) {
        templateMessage.value = '当前账号还没有费用查询模板。'
      }
    } catch {
      if (templateLoads.isCurrent(ticket.id)) templateMessage.value = '读取费用模板失败。'
    } finally {
      if (templateLoads.isCurrent(ticket.id)) loadingTemplates.value = false
    }
  }

  async function applyTemplate(id: string): Promise<void> {
    selectedTemplateId.value = id
    saveNameDirty.value = false
    if (!id) {
      options.values.value = { ...options.defaultValues }
      options.checkedBoxes.value = {}
      options.selectedCustomers.value = []
      options.selectedRuleOutCustomers.value = []
      options.onCustomersLoaded('')
      unknownTemplateFields.value = {}
      saveName.value = ''
      templateMessage.value = ''
      return
    }
    const b = options.activeBridge()
    if (!b) return
    const ticket = templateLoads.begin()
    templateMessage.value = ''
    try {
      const resp = await b.request(
        { type: MessageType.GetHistoryQuery, payload: { queryId: id, surface: 'fee' } },
        ticket.signal,
      )
      if (!templateLoads.isCurrent(ticket.id)) return
      if (resp.type !== MessageType.HistoryQueryResult || !resp.payload.ok) {
        templateMessage.value =
          resp.type === MessageType.HistoryQueryResult && !resp.payload.ok
            ? resp.payload.error.message
            : '这个费用模板没有打开。'
        return
      }
      const parsed = readFeeQueryXml(resp.payload.data.queryXml)
      if (!parsed.ok) {
        templateMessage.value = parsed.error.message
        return
      }
      options.values.value = { ...options.defaultValues, ...parsed.data.fields }
      options.checkedBoxes.value = { ...parsed.data.checks }
      options.selectedCustomers.value = parsed.data.customers
      options.selectedRuleOutCustomers.value = parsed.data.ruleOutCustomers
      unknownTemplateFields.value = { ...parsed.data.unknownFields }
      options.maybeExpandAdvanced(parsed.data.fields, parsed.data.checks)
      options.onCustomersLoaded(parsed.data.customers.map(c => c.id).join(';'))
      if (parsed.data.fields.case_type || parsed.data.fields.country) {
        options.onRefreshCtrlProc()
      }
      const named = templates.value.find(item => item.id === id)
      if (named && !saveNameDirty.value) saveName.value = named.name
    } catch {
      if (templateLoads.isCurrent(ticket.id)) templateMessage.value = '载入费用模板失败。'
    }
  }

  async function saveTemplate(): Promise<void> {
    const b = options.activeBridge()
    if (!b || savingTemplate.value) return
    const selected = templates.value.find(item => item.id === selectedTemplateId.value)
    const title = saveName.value.trim() || (selected ? selected.name.trim() : '')
    if (!title) {
      templateMessage.value = '先填写模板名称。'
      return
    }
    const nonEmptyFields: Record<string, string> = {}
    for (const [k, v] of Object.entries(options.values.value)) {
      if (isFeeSearchInputField(k) && v.trim()) nonEmptyFields[k] = v.trim()
    }
    const activeChecks: Record<string, boolean> = {}
    for (const [k, checked] of Object.entries(options.checkedBoxes.value)) {
      if (FEE_CHECK_KEYS.has(k) && checked) activeChecks[k] = true
    }
    if (
      !Object.keys(nonEmptyFields).length &&
      !Object.keys(activeChecks).length &&
      !options.selectedCustomers.value.length &&
      !options.selectedRuleOutCustomers.value.length &&
      !Object.keys(unknownTemplateFields.value).length
    ) {
      templateMessage.value = '先填写至少一项查询条件，再保存。'
      return
    }
    const queryId = selected && isQueryGuid(selected.id) ? selected.id : ''
    const before = new Set(templates.value.map(item => item.id))
    const queryXml = buildFeeQueryXml({
      fields: nonEmptyFields,
      checks: activeChecks,
      displayValues: options.collectDisplayValues(),
      customers: options.selectedCustomers.value,
      ruleOutCustomers: options.selectedRuleOutCustomers.value,
      unknownFields: unknownTemplateFields.value,
    })
    savingTemplate.value = true
    templateMessage.value = '正在写入原网站的费用模板…'
    try {
      const resp = await b.request({
        type: MessageType.SaveHistoryQuery,
        payload: { title, queryId, queryXml, surface: 'fee' },
      })
      if (resp.type !== MessageType.HistoryQuerySaved || !resp.payload.ok) {
        templateMessage.value =
          resp.type === MessageType.HistoryQuerySaved && !resp.payload.ok
            ? resp.payload.error.message
            : resp.type === MessageType.Error
              ? resp.payload.message
              : '原网站没有保存这份费用模板。'
        return
      }
      await loadTemplates(true)
      const created = templates.value.find(item => !before.has(item.id) && item.name === title)
      const saved = created ?? (queryId ? templates.value.find(item => item.id === queryId) : undefined)
      if (saved) {
        selectedTemplateId.value = saved.id
        saveName.value = saved.name
        saveNameDirty.value = false
      }
      templateMessage.value = created
        ? '已在原网站另存了这份新的费用模板。'
        : queryId
          ? '已更新原网站上的这份费用模板。'
          : '已在原网站新建这份费用模板。'
    } catch {
      templateMessage.value = '保存费用模板失败。'
    } finally {
      savingTemplate.value = false
    }
  }

  async function deleteTemplate(): Promise<void> {
    const b = options.activeBridge()
    if (!b || deletingTemplate.value || savingTemplate.value) return
    const current = templates.value.find(item => item.id === selectedTemplateId.value)
    if (!current || !isQueryGuid(current.id)) {
      templateMessage.value = '先选中原网站上的费用模板，再删除。'
      return
    }
    const agreed = await confirmDialog({
      title: '删除原网站模板',
      message: `会从原网站删掉「${templateLabel(current)}」。`,
      confirmLabel: '删除',
      warn: true,
    })
    if (!agreed) return
    deletingTemplate.value = true
    templateMessage.value = '正在从原网站删除…'
    try {
      const resp = await b.request({
        type: MessageType.DeleteHistoryQuery,
        payload: { queryId: current.id, surface: 'fee' },
      })
      if (resp.type !== MessageType.HistoryQueryDeleted || !resp.payload.ok) {
        templateMessage.value =
          resp.type === MessageType.HistoryQueryDeleted && !resp.payload.ok
            ? resp.payload.error.message
            : resp.type === MessageType.Error
              ? resp.payload.message
              : '原网站没有删除这份费用模板。'
        return
      }
      selectedTemplateId.value = ''
      saveName.value = ''
      saveNameDirty.value = false
      await loadTemplates(true)
      templateMessage.value = '已从原网站删除这份费用模板。'
    } catch {
      templateMessage.value = '删除费用模板失败。'
    } finally {
      deletingTemplate.value = false
    }
  }

  function exportTemplateJson(): void {
    const fields = collectDraftFields()
    const extras = Object.entries(unknownTemplateFields.value).filter(([, v]) => v.trim()).length
    if (!Object.keys(fields).length && !extras) {
      templateMessage.value = '先填写至少一项查询条件，再导出。'
      return
    }
    const selected = templates.value.find(item => item.id === selectedTemplateId.value)
    const from = saveName.value.trim() || (selected ? selected.name.trim() : '')
    downloadTemplateJson(
      templateJsonText('FeeSearch', {
        fields,
        displayValues: options.collectDisplayValues(),
        unknownFields: unknownTemplateFields.value,
      }),
      templateJsonFileName('FeeSearch', from),
    )
    templateMessage.value = `已导出当前条件的 JSON。${from ? `文件名带模板名「${from}」和时间戳` : '文件名只带查询面和时间戳；在「模板名称」里填上名字再导出，文件名就会带上'}，文件内容不含模板名，导入后自己命名保存。`
  }

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
      templateMessage.value = '这份 JSON 文件没有读开。'
      return
    }
    const read = readTemplateJson(text, 'FeeSearch')
    if (!read.ok) {
      templateMessage.value = read.message
      return
    }
    const nextValues: Record<string, string> = { ...options.defaultValues }
    const nextChecks: Record<string, boolean> = {}
    let count = 0
    for (const [k, v] of Object.entries(read.conditions.fields)) {
      const cleaned = sanitizeFeeFieldValue(k, v)
      if (!cleaned) continue
      if (FEE_CHECK_KEYS.has(k)) {
        const lower = cleaned.toLowerCase()
        if (lower === 'on' || lower === 'true' || lower === '1') {
          nextChecks[k] = true
          count += 1
        }
      } else {
        nextValues[k] = cleaned
        count += 1
      }
    }
    options.selectedCustomers.value = parseFeeCustomerRefs(
      nextValues.customer_id ?? '',
      read.conditions.displayValues.customer_id ?? '',
    )
    options.selectedRuleOutCustomers.value = parseFeeCustomerRefs(
      nextValues.ruleOutcustomer_id ?? '',
      read.conditions.displayValues.ruleOutcustomer_id ?? '',
    )
    if (options.selectedCustomers.value.length) {
      nextValues.customer_id = options.selectedCustomers.value.map(c => c.id).join(';')
    } else {
      delete nextValues.customer_id
    }
    if (options.selectedRuleOutCustomers.value.length) {
      nextValues.ruleOutcustomer_id = options.selectedRuleOutCustomers.value.map(c => c.id).join(';')
    } else {
      delete nextValues.ruleOutcustomer_id
    }
    options.values.value = nextValues
    options.checkedBoxes.value = nextChecks
    unknownTemplateFields.value = { ...read.conditions.unknownFields }
    options.onCustomersLoaded(options.selectedCustomers.value.map(c => c.id).join(';'))
    if (nextValues.case_type || nextValues.country) {
      options.onRefreshCtrlProc()
    }
    options.maybeExpandAdvanced(nextValues, nextChecks)
    selectedTemplateId.value = ''
    saveName.value = ''
    saveNameDirty.value = false
    templateMessage.value = `已导入 ${count} 个查询条件。可以继续追加或修改条件，最后自己填模板名称保存。`
  }

  function resetTemplatesForUser(): void {
    templates.value = []
    selectedTemplateId.value = ''
    saveName.value = ''
    saveNameDirty.value = false
    templateMessage.value = ''
  }

  function disposeTemplates(): void {
    templateLoads.dispose()
  }

  return {
    templates,
    selectedTemplateId,
    saveName,
    saveNameDirty,
    loadingTemplates,
    savingTemplate,
    deletingTemplate,
    templateMessage,
    unknownTemplateFields,
    templateJsonInput,
    templateLabelMap,
    templateLabel,
    collectDraftFields,
    loadTemplates,
    applyTemplate,
    saveTemplate,
    deleteTemplate,
    exportTemplateJson,
    importTemplateJson,
    resetTemplatesForUser,
    disposeTemplates,
  }
}
