<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Bunny from '../../shell/components/Bunny.vue'
import MailTypeTreeSelect from '../../shell/components/MailTypeTreeSelect.vue'
import PageHead from '../../shell/components/PageHead.vue'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import { bg } from '../../shell/assets'
import JihuaUploadPage from './JihuaUploadPage.vue'
import HaguePage from './HaguePage.vue'
import BillingWorkflowPage from './BillingWorkflowPage.vue'
import PctNoticeWorkflowPage from './PctNoticeWorkflowPage.vue'
import FeeReduceWorkflowPage from './FeeReduceWorkflowPage.vue'
import WorkflowWorkspace from '../components/WorkflowWorkspace.vue'
import WorkflowMailEntry from '../components/WorkflowMailEntry.vue'
import hagueGuide from '../../../docs/workflows/海牙新申请.md?raw'
import jihuaGuide from '../../../docs/workflows/季华实验室-文件导入.md?raw'
import billingGuide from '../../../docs/workflows/请款.md?raw'
import pctNoticeGuide from '../../../docs/workflows/pct官文下载上传.md?raw'
import feeReduceGuide from '../../../docs/workflows/请求费用减缓.md?raw'
import pctGuide from '../../../docs/workflows/PCT提醒.md?raw'
import pengchengGuide from '../../../docs/workflows/PCT鹏城专案.md?raw'
import fileManageGuide from '../../../docs/workflows/文件管理.md?raw'
import filingExportGuide from '../../../docs/workflows/递交管理-已完成导出.md?raw'
import {
  cloneCatalog,
  cloneWorkflow,
  defaultWorkflowCatalog,
  duplicateWorkflow,
  FILE_MANAGE_ID,
  FILING_EXPORT_ID,
  isBuiltinStep,
  isExtraParam,
  isRunnableWorkflow,
  isSystemWorkflow,
  nextExtraId,
  paramWarning,
  pctRuntimeFrom,
  workflowFromSkills,
  type WorkflowCatalog,
  type WorkflowDefinition,
  type WorkflowParam,
  type WorkflowStep
} from '../../workflow/catalog'
import { loadWorkflowCatalog, saveWorkflowCatalog } from '../../workflow/catalog-store'
import {
  isStyleLabelParam,
  mailStyleChoiceOptions,
  mailTypeTreeOptions,
  procTreeOptions,
  selectedStyleValue,
  senderChoiceOptions,
  styleLabelFor,
  styleValueParamId,
  type ChoiceOption
} from '../../workflow/choices'
import { matchPctMailTypes } from '../../customer/mail-flow'
import { fetchMailSenders } from '../../customer/mailset-load'
import type { MailSender } from '../../customer/mailset'
import type { MailSignatureItem } from '../../mail/easy/signature-read'
import { fetchMailboxSignature } from '../../mail/signature-load'
import { defaultSignatureChoice, signatureChoices } from '../../mail/signature-catalog'
import type { MessageBridge } from '../../shared/message'
import type { TreeOption } from '../../query/option-tree'
import { workflowPreview } from '../../workflow/preview-chart'
import { SKILLS, skillTint, stepCaption } from '../../workflow/skills'
import { useWorkspace } from '../composables/useWorkspace'
import { useWorkflowChoices } from '../composables/useWorkflowChoices'
import { useQuerySurfaces } from '../composables/useQuerySurfaces'
import { confirmDialog } from '../dialog'
import { createRecoveryClient } from '../../recovery/client'
import { systemScope } from '../../recovery/wal-ledger'
import { useWorkflowViewMemory } from '../composables/useWorkflowViewMemory'
import { resolveWorkflowView, sanitizeWorkflowDeskState, type WorkflowViewTab } from './workflow-desk-state'

type Screen = 'sea' | 'ocean' | 'flow' | 'jihua' | 'hague' | 'billing' | 'pctNotice' | 'feeReduce'

const FLOW_GUIDES: Record<string, string> = {
  'pct-reminder': pctGuide,
  'pct-pengcheng': pengchengGuide,
  [FILE_MANAGE_ID]: fileManageGuide,
  [FILING_EXPORT_ID]: filingExportGuide,
}

const TOOL_DEFAULT_VIEWS: Record<'hague' | 'jihua' | 'billing' | 'pctNotice' | 'feeReduce', 'guide' | 'use'> = {
  hague: 'use',
  jihua: 'guide',
  billing: 'use',
  pctNotice: 'use',
  feeReduce: 'use',
}

const FLOW_CARD_BADGE: Record<string, string> = {
  'pct-reminder': '自动发文',
  'pct-pengcheng': '自动发文',
  [FILE_MANAGE_ID]: '自动发文',
  [FILING_EXPORT_ID]: '数据导出',
}

const FLOW_CARD_META: Record<string, string> = {
  'pct-reminder': '9 步 · 表格解析 · 合并发文',
  'pct-pengcheng': '9 步 · 技术负责人主送 · 抄送 IPR',
  [FILE_MANAGE_ID]: '8 步 · 客户配置联动 · 映射匹配',
  [FILING_EXPORT_ID]: '5 步 · 退回脉络追溯 · Top10 图表',
}

function flowCardBadge(flow: WorkflowDefinition): string {
  return FLOW_CARD_BADGE[flow.id] ?? (isSystemWorkflow(flow) ? '系统流程' : '自定义')
}

function flowCardMeta(flow: WorkflowDefinition): string {
  return FLOW_CARD_META[flow.id] ?? `${flow.steps.length} 步 · 自定义流程`
}

const {
  rememberedViews,
  rememberedSteps,
  rememberView,
  rememberStep,
  forgetWorkflow,
  resolveView,
  resolveStep,
  mergeFromDesk,
} = useWorkflowViewMemory()

const screen = ref<Screen>('sea')
const hagueView = ref<WorkflowViewTab>('use')
const jihuaView = ref<WorkflowViewTab>('guide')
const billingView = ref<WorkflowViewTab>('use')
const pctNoticeView = ref<WorkflowViewTab>('use')
const feeReduceView = ref<WorkflowViewTab>('use')
const flowView = ref<WorkflowViewTab>('steps')
const billingMounted = ref(false)
const pctNoticeMounted = ref(false)
const feeReduceMounted = ref(false)
watch(screen, next => {
  if (next === 'billing') billingMounted.value = true
  if (next === 'pctNotice') pctNoticeMounted.value = true
  if (next === 'feeReduce') feeReduceMounted.value = true
}, { immediate: true })
const mainScreenHidden = computed(() => screen.value === 'jihua' || screen.value === 'hague' || screen.value === 'billing' || screen.value === 'pctNotice' || screen.value === 'feeReduce')
const catalog = ref<WorkflowCatalog>(defaultWorkflowCatalog())
const draft = ref<WorkflowDefinition | null>(null)
const selectedId = ref('')
const dirty = ref(false)
const saving = ref(false)
const notice = ref('')
const oceanNotice = ref('')
const newName = ref('')
const picked = ref<string[]>([])
const creating = ref(false)
const bridge = inject<MessageBridge | undefined>('bridge', undefined)
const workspace = useWorkspace()
const workspaceCustomers = computed(() => workspace.customers?.value ?? [])
const workspaceOperatorId = computed(() => workspace.connection.value.operatorId ?? '')
const workspaceReady = computed(() => workspace.connection.value.sessionStatus === 'authenticated')
const { rules, mailTypes, senders, procs, notice: choiceNotice, load: loadChoices } = useWorkflowChoices()
const { surfaces: querySurfaces } = useQuerySurfaces()
const entrySenders = ref<MailSender[]>([])
const mailSenders = computed<MailSender[]>(() => entrySenders.value.length > 0
  ? entrySenders.value
  : senders.value.map(item => ({ id: item.id, name: item.label, email: '', label: item.label, isDefault: false, isPublic: false, signature: '' }))
)
const siteSignatures = ref<MailSignatureItem[]>([])
const siteReservedId = ref('')
let useAssetsLoaded = false
const signatureList = computed(() => signatureChoices(siteSignatures.value, rules.value?.signatures ?? [], workspaceOperatorId.value))
const signatureDefaultKey = computed(() => defaultSignatureChoice(signatureList.value, rules.value?.defaultSignatureId ?? null, siteReservedId.value || null)?.key ?? '')
const signatureName = computed(() => signatureList.value.find(item => item.key === signatureDefaultKey.value)?.name ?? '')
const signatureText = computed(() => signatureList.value.find(item => item.key === signatureDefaultKey.value)?.content.trim() ?? '')

async function loadUseAssets(): Promise<void> {
  if (!bridge || !workspaceReady.value || useAssetsLoaded) return
  useAssetsLoaded = true
  try {
    const [loadedSenders, loadedSignatures] = await Promise.all([
      fetchMailSenders(bridge, false),
      fetchMailboxSignature(bridge, false)
    ])
    entrySenders.value = loadedSenders.items
    siteSignatures.value = loadedSignatures.data?.items ?? []
    siteReservedId.value = loadedSignatures.data?.reserved?.id ?? ''
  } catch {
    useAssetsLoaded = false
  }
}

function flowGuideFor(flow: { id?: string } | null | undefined): string {
  return flow?.id ? (FLOW_GUIDES[flow.id] ?? '') : ''
}

function canUseFlow(flow: WorkflowDefinition | null | undefined): boolean {
  return Boolean(flow && (isRunnableWorkflow(flow) || flow.id === FILE_MANAGE_ID || flow.id === FILING_EXPORT_ID))
}

function availableFlowViews(flow: WorkflowDefinition | null | undefined): WorkflowViewTab[] {
  const views: WorkflowViewTab[] = ['steps']
  if (flowGuideFor(flow)) views.push('guide')
  if (canUseFlow(flow)) views.push('use')
  return views
}

const WORD_PARAMS = new Set(['type_keyword', 'customer_keyword', 'our_keyword', 'city_keyword', 'other_city_keyword'])
const LISTED_CHOICES = new Set(['sender_mailset', 'surface_label'])
let silence = false
const recovery = createRecoveryClient()
const recoveryScope = systemScope(location.origin, 'workflow')
let hydrated = false
let persistTimer: ReturnType<typeof setTimeout> | undefined
function validDraft(value: unknown): value is WorkflowDefinition {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<WorkflowDefinition>
  return typeof candidate.id === 'string' && typeof candidate.label === 'string' && typeof candidate.summary === 'string' && Array.isArray(candidate.steps) && candidate.steps.every(step => !!step && typeof step.id === 'string' && typeof step.title === 'string' && typeof step.detail === 'string' && Array.isArray(step.params) && step.params.every(param => !!param && typeof param.id === 'string' && typeof param.label === 'string' && typeof param.value === 'string' && typeof param.help === 'string'))
}

function deskState() {
  return {
    screen: screen.value,
    hagueView: hagueView.value === 'guide' ? 'guide' as const : 'use' as const,
    jihuaView: jihuaView.value === 'guide' ? 'guide' as const : 'use' as const,
    billingView: billingView.value === 'guide' ? 'guide' as const : 'use' as const,
    pctNoticeView: pctNoticeView.value === 'guide' ? 'guide' as const : 'use' as const,
    feeReduceView: feeReduceView.value === 'guide' ? 'guide' as const : 'use' as const,
    flowView: flowView.value,
    workflowViews: { ...rememberedViews.value },
    selectedSteps: { ...rememberedSteps.value },
    draft: draft.value,
    selectedId: selectedId.value,
    dirty: dirty.value,
    picked: picked.value,
    newName: newName.value,
  }
}

function flushDeskState(): void {
  if (!hydrated) return
  clearTimeout(persistTimer)
  persistTimer = undefined
  const snapshot = JSON.parse(JSON.stringify(deskState())) as ReturnType<typeof deskState>
  void recovery.put('workflow-desk', recoveryScope, snapshot).catch(() => undefined)
}

function handlePageHide(): void { flushDeskState() }
window.addEventListener('pagehide', handlePageHide)
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', handlePageHide)
  flushDeskState()
})

watch([screen, hagueView, jihuaView, billingView, pctNoticeView, feeReduceView, flowView, rememberedViews, rememberedSteps, draft, selectedId, dirty, picked, newName], () => {
  if (!hydrated) return
  clearTimeout(persistTimer)
  persistTimer = setTimeout(flushDeskState, 120)
}, { deep: true })

watch(selectedId, next => {
  if (screen.value === 'flow' && draft.value?.id && next) {
    rememberStep(draft.value.id, next)
  }
})

const ID_CHOICES = new Set(['customer_type_id', 'our_type_id', 'sender_mailset'])

watch(draft, () => {
  if (!silence && screen.value === 'flow') dirty.value = true
}, { deep: true, flush: 'sync' })

function replaceDraft(next: WorkflowDefinition | null, markDirty: boolean): void {
  silence = true
  draft.value = next
  dirty.value = markDirty
  silence = false
}

onMounted(async () => {
  catalog.value = await loadWorkflowCatalog()
  const restored = sanitizeWorkflowDeskState<WorkflowDefinition>(await recovery.get('workflow-desk', recoveryScope).catch(() => null), validDraft)
  if (restored) {
    mergeFromDesk(restored)
    screen.value = restored.screen
    hagueView.value = restored.hagueView
    jihuaView.value = restored.jihuaView
    billingView.value = restored.billingView
    pctNoticeView.value = restored.pctNoticeView ?? 'use'
    feeReduceView.value = restored.feeReduceView ?? 'use'
    replaceDraft(restored.draft, restored.dirty)
    flowView.value = restored.draft
      ? resolveWorkflowView({
          workflowId: restored.draft.id,
          requested: restored.flowView,
          remembered: rememberedViews.value,
          available: availableFlowViews(restored.draft),
          fallback: 'steps'
        })
      : 'steps'
    selectedId.value = restored.selectedId
    picked.value = restored.picked
    newName.value = restored.newName
  }
  hydrated = true
})

watch([screen, flowView, workspaceReady], ([nextScreen, nextView, ready]) => {
  if (nextScreen === 'flow') {
    void loadChoices(false)
    if (nextView === 'use' && ready) void loadUseAssets()
  }
  if (!ready) {
    useAssetsLoaded = false
    entrySenders.value = []
    siteSignatures.value = []
    siteReservedId.value = ''
  }
}, { immediate: true })

const locked = computed(() => isSystemWorkflow(draft.value))
const previewOpen = ref(true)
const selected = computed(() => draft.value?.steps.find(step => step.id === selectedId.value) ?? null)
const visibleParams = computed(() => selected.value?.params.filter(param => !param.hidden && !WORD_PARAMS.has(param.id)) ?? [])
const matchedMail = computed(() => matchPctMailTypes(mailTypes.value, draft.value ? pctRuntimeFrom(draft.value) : undefined))
const previewPieces = computed(() => draft.value ? workflowPreview(draft.value, {
  customerType: matchedMail.value.customerVolume?.name,
  ourType: matchedMail.value.ourVolumeShenzhen?.name
}) : [])
const stepHasChoice = computed(() => visibleParams.value.some(param => isIdChoice(param.id) || param.id === 'proc_label' || param.id === 'review_label'))

const LEGACY_STYLE_LABELS: Record<string, string> = {
  '合成一封': '同客户合并发文',
  '一件一封': '单个来文发文',
  '按第一联系人合成': '同客户第一联系人合并发文'
}
const STYLE_FIELD_LABEL = '发文方式'
const STYLE_NAME_LABELS = new Set([
  '同客户合并发文',
  '单个来文发文',
  '同客户第一联系人合并发文',
  ...Object.keys(LEGACY_STYLE_LABELS)
])
const LEGACY_STYLE_DETAILS = new Set([
  '具体用哪一种，在客户里选。这里改的是你看到的名字。',
  '客户里选的就是下面这几种。每一种的名字直接写出来。'
])
const PCT_STYLE_DETAIL = '这一条用同客户合并发文。同一客户的几件合成一封。'

function spellStyleNames(flow: WorkflowDefinition): boolean {
  let changed = false
  for (const step of flow.steps) {
    if ((step.skillId === 'send-style' || step.id === 'mail-style') && LEGACY_STYLE_DETAILS.has(step.detail.trim())) {
      step.detail = PCT_STYLE_DETAIL
      changed = true
    }
    for (const param of step.params) {
      if (!isStyleLabelParam(param.id)) continue
      if (!param.hidden && STYLE_NAME_LABELS.has(param.label.trim()) && param.label !== STYLE_FIELD_LABEL) {
        param.label = STYLE_FIELD_LABEL
        changed = true
      }
      if (!param.hidden && param.help.trim() === '客户看到这个名字。') {
        param.help = '从名单里点一种。'
        changed = true
      }
      const stored = step.params.find(item => item.id === styleValueParamId(param.id))?.value ?? ''
      const official = styleLabelFor(selectedStyleValue(param.value, stored))
      if (official && param.value !== official) {
        param.value = official
        changed = true
      }
    }
  }
  return changed
}

function openFlow(flow: WorkflowDefinition, view?: WorkflowViewTab): void {
  const next = cloneWorkflow(flow)
  const changed = isSystemWorkflow(next) ? false : spellStyleNames(next)
  replaceDraft(next, changed)
  const target = resolveView(next.id, {
    requested: view,
    available: availableFlowViews(next),
    fallback: 'steps'
  })
  selectedId.value = resolveStep(next.id, next.steps.map(step => step.id))
  notice.value = ''
  flowView.value = target
  rememberView(next.id, target)
  if (selectedId.value) rememberStep(next.id, selectedId.value)
  screen.value = 'flow'
}

function openToolWorkspace(target: 'hague' | 'jihua' | 'billing' | 'pctNotice' | 'feeReduce', view?: 'guide' | 'use'): void {
  const nextView = resolveView(target, {
    requested: view,
    available: ['guide', 'use'],
    fallback: TOOL_DEFAULT_VIEWS[target]
  })
  if (target === 'hague') hagueView.value = nextView
  else if (target === 'jihua') jihuaView.value = nextView
  else if (target === 'billing') billingView.value = nextView
  else if (target === 'pctNotice') pctNoticeView.value = nextView
  else feeReduceView.value = nextView
  rememberView(target, nextView)
  screen.value = target
}

async function backToSea(): Promise<void> {
  if (dirty.value) {
    const ok = await confirmDialog({
      title: '先不保存？',
      message: '这一条还有没保存的修改。回到工作流后，这些修改就丢掉了。',
      confirmLabel: '回到工作流'
    })
    if (!ok) return
  }
  replaceDraft(null, false)
  screen.value = 'sea'
}

function openOcean(): void {
  picked.value = []
  newName.value = ''
  oceanNotice.value = ''
  screen.value = 'ocean'
}

function toggleSkill(id: string): void {
  const index = picked.value.indexOf(id)
  picked.value = index >= 0 ? picked.value.filter(item => item !== id) : [...picked.value, id]
}

async function createFromOcean(): Promise<void> {
  if (creating.value) return
  if (!picked.value.length) {
    oceanNotice.value = '先从海洋里挑至少一件事。'
    return
  }
  creating.value = true
  try {
    const created = workflowFromSkills(newName.value, picked.value, catalog.value.workflows.map(item => item.id))
    const saved = await saveWorkflowCatalog({ workflows: [...catalog.value.workflows, created] })
    catalog.value = saved
    const next = saved.workflows.find(item => item.id === created.id) ?? created
    openFlow(next)
  } finally {
    creating.value = false
  }
}

async function save(): Promise<void> {
  if (!draft.value || saving.value || isSystemWorkflow(draft.value)) return
  saving.value = true
  notice.value = ''
  const savedId = draft.value.id
  try {
    const current = cloneCatalog(catalog.value)
    const index = current.workflows.findIndex(item => item.id === savedId)
    if (index >= 0) current.workflows[index] = draft.value
    else current.workflows.push(draft.value)
    const saved = await saveWorkflowCatalog(current)
    catalog.value = saved
    const next = saved.workflows.find(item => item.id === savedId) ?? null
    if (next && screen.value === 'flow') {
      const keep = selectedId.value
      replaceDraft(cloneWorkflow(next), false)
      selectedId.value = next.steps.some(step => step.id === keep) ? keep : (next.steps[0]?.id ?? '')
    }
    notice.value = savedId === 'pct-reminder'
      ? '已保存。读表格和对信的种类，会按这里的写法走。'
      : '已保存。这条先记在这里，客户里现在自动用的仍是 PCT提醒。'
  } finally {
    saving.value = false
  }
}

async function copyFlow(flow: WorkflowDefinition): Promise<void> {
  const created = duplicateWorkflow(
    flow,
    catalog.value.workflows.map(item => item.id),
    catalog.value.workflows.map(item => item.label)
  )
  const ok = await confirmDialog({
    title: '创建副本',
    message: `按「${flow.label}」创建「${created.label}」？创建后会出现在知识海洋里。`,
    confirmLabel: '创建'
  })
  if (!ok) return
  const saved = await saveWorkflowCatalog({ workflows: [...catalog.value.workflows, created] })
  catalog.value = saved
  replaceDraft(null, false)
  screen.value = 'sea'
}

async function removeFlow(flow: WorkflowDefinition): Promise<void> {
  if (isSystemWorkflow(flow)) return
  const ok = await confirmDialog({
    title: '拿掉这条',
    message: `拿掉「${flow.label}」？`,
    confirmLabel: '拿掉'
  })
  if (!ok) return
  const saved = await saveWorkflowCatalog({
    workflows: catalog.value.workflows.filter(item => item.id !== flow.id)
  })
  catalog.value = saved
  forgetWorkflow(flow.id)
}

async function removeStep(id: string): Promise<void> {
  if (!draft.value || isBuiltinStep(id)) return
  const step = draft.value.steps.find(item => item.id === id)
  const ok = await confirmDialog({
    title: '拿掉这一步',
    message: `拿掉「${step?.title || '这一步'}」？保存之后才会写上。`,
    confirmLabel: '拿掉'
  })
  if (!ok || !draft.value) return
  draft.value.steps = draft.value.steps.filter(item => item.id !== id)
  if (selectedId.value === id) selectedId.value = draft.value.steps[0]?.id ?? ''
}

function addSkillStep(skillId: string): void {
  if (!draft.value || isSystemWorkflow(draft.value)) return
  const step = workflowFromSkills('临时', [skillId], []).steps[0]
  if (!step) return
  step.id = nextExtraId(draft.value.steps.map(item => item.id), 'step')
  draft.value.steps.push(step)
  selectedId.value = step.id
}

function moveStep(id: string, direction: -1 | 1): void {
  if (!draft.value || isSystemWorkflow(draft.value)) return
  const index = draft.value.steps.findIndex(step => step.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= draft.value.steps.length) return
  const steps = [...draft.value.steps]
  const [item] = steps.splice(index, 1)
  if (!item) return
  steps.splice(target, 0, item)
  draft.value.steps = steps
}

function addNote(step: WorkflowStep): void {
  if (isSystemWorkflow(draft.value)) return
  step.params.push({
    id: nextExtraId(step.params.map(item => item.id), 'param'),
    label: '再记一笔',
    value: '',
    help: ''
  })
}

function removeNote(step: WorkflowStep, id: string): void {
  step.params = step.params.filter(item => item.id !== id)
}

function skillTitle(step: WorkflowStep): string {
  return stepCaption(step)
}

function isIdChoice(id: string): boolean {
  return ID_CHOICES.has(id)
}

function isMailTypeParam(id: string): boolean {
  return id === 'customer_type_id' || id === 'our_type_id'
}

function isListedChoice(id: string): boolean {
  return LISTED_CHOICES.has(id)
}

function showsText(id: string): boolean {
  return !isIdChoice(id) && !isListedChoice(id) && id !== 'review_label' && id !== 'proc_label' && !isStyleLabelParam(id)
}

function shownTypeId(param: WorkflowParam): string {
  if (param.value.trim()) return param.value
  if (param.id === 'customer_type_id') return matchedMail.value.customerVolume?.id ?? ''
  if (param.id === 'our_type_id') return matchedMail.value.ourVolumeShenzhen?.id ?? ''
  return ''
}

function surfaceOptions(current: string): ChoiceOption[] {
  const options = querySurfaces.value.map(item => ({ value: item.label, label: item.label }))
  const saved = current.trim()
  if (saved && !options.some(item => item.value === saved)) options.unshift({ value: saved, label: saved })
  return options
}

function hiddenName(id: string): string {
  const key = id === 'customer_type_id' ? 'customer_type_name' : id === 'our_type_id' ? 'our_type_name' : 'sender_mailset_label'
  return selected.value?.params.find(item => item.id === key)?.value ?? ''
}

function treeOptionsFor(param: WorkflowParam): TreeOption[] {
  return mailTypeTreeOptions({
    nodes: mailTypes.value,
    currentId: param.value,
    currentName: hiddenName(param.id)
  })
}

function procTreeFor(param: WorkflowParam): { options: TreeOption[]; selectedId: string } {
  return procTreeOptions(procs.value, param.value)
}

function hiddenStyle(labelId: string): string {
  const key = styleValueParamId(labelId)
  return selected.value?.params.find(item => item.id === key)?.value ?? ''
}

function shownStyle(param: WorkflowParam): string {
  return selectedStyleValue(param.value, hiddenStyle(param.id))
}

function styleOptionsFor(param: WorkflowParam): ChoiceOption[] {
  const options = mailStyleChoiceOptions()
  const current = shownStyle(param)
  if (current && !options.some(item => item.value === current)) {
    options.unshift({ value: current, label: param.value.trim() || styleLabelFor(current) || current })
  }
  return options
}

function chooseStyle(param: WorkflowParam, code: string): void {
  const label = styleLabelFor(code) || styleOptionsFor(param).find(item => item.value === code)?.label || ''
  if (!label || !selected.value) return
  param.value = label
  const hidden = selected.value.params.find(item => item.id === styleValueParamId(param.id))
  if (hidden) hidden.value = code
}

function optionsFor(param: WorkflowParam): ChoiceOption[] {
  if (isMailTypeParam(param.id) || param.id === 'proc_label' || isStyleLabelParam(param.id) || param.id === 'review_label') return []
  if (param.id === 'surface_label') return surfaceOptions(param.value)
  if (param.id === 'sender_mailset') {
    const remembered = rules.value?.defaultSender
    return senderChoiceOptions({
      senders: senders.value,
      remembered: remembered ? { id: remembered.mailsetId, label: remembered.label } : null,
      currentId: param.value,
      currentName: hiddenName(param.id)
    })
  }
  return []
}

function chooseChoice(param: WorkflowParam, value: string): void {
  param.value = value
  const key = param.id === 'customer_type_id'
    ? 'customer_type_name'
    : param.id === 'our_type_id'
      ? 'our_type_name'
      : param.id === 'sender_mailset'
        ? 'sender_mailset_label'
        : ''
  if (!key || !selected.value) return
  const hidden = selected.value.params.find(item => item.id === key)
  if (!hidden) return
  if (!value) {
    hidden.value = ''
    return
  }
  if (param.id === 'sender_mailset') {
    hidden.value = senders.value.find(item => item.id === value)?.label
      || (rules.value?.defaultSender?.mailsetId === value ? rules.value.defaultSender.label : '')
      || hidden.value
    return
  }
  hidden.value = mailTypes.value.find(item => item.id === value)?.name
    || rules.value?.mappings.find(item => item.mailTypeId === value)?.mailTypeName
    || hidden.value
}

function chooseProc(param: WorkflowParam, id: string): void {
  if (!id || id.startsWith('saved:')) return
  const node = procs.value.find(item => item.id === id)
  if (!node) return
  const parents = new Set(procs.value.map(item => item.parentId).filter((item): item is string => Boolean(item)))
  if (parents.has(node.id)) return
  param.value = node.label
}

</script>

<template>
  <div class="workflow-page-root">
  <div
    class="workflow-main"
    :class="{ 'is-hidden-pane': mainScreenHidden }"
    :inert="mainScreenHidden"
    :aria-hidden="mainScreenHidden ? 'true' : undefined"
  >
    <PageHead
      v-if="screen !== 'flow' || !draft"
      title="工作流"
      :desc="screen === 'ocean' ? '从知识海洋里挑几件会做的事，串成一条你自己的。' : '先挑一条，点开再看每一步。'"
      :art="bg('专注每一次发文，让知识更有力量.png')"
    />

    <section v-if="screen === 'sea'" class="sea">
      <article v-for="flow in catalog.workflows" :key="flow.id" class="sea-card">
        <button type="button" class="sea-open" @click="openFlow(flow)">
          <div class="sea-head">
            <b>{{ flow.label }}</b>
            <span class="sea-badge">{{ flowCardBadge(flow) }}</span>
          </div>
          <small>{{ flow.summary }}</small>
          <em>{{ flowCardMeta(flow) }}</em>
        </button>
        <div class="sea-actions">
          <button v-if="canUseFlow(flow)" type="button" class="sea-action-primary" @click="openFlow(flow, 'use')">开始使用</button>
          <button v-if="flowGuideFor(flow)" type="button" class="sea-remove" @click="openFlow(flow, 'guide')">流程说明</button>
          <button type="button" class="sea-remove" @click="copyFlow(flow)">复制副本</button>
          <button v-if="!isSystemWorkflow(flow)" type="button" class="sea-remove" @click="removeFlow(flow)">拿掉</button>
        </div>
      </article>
      <article class="sea-card">
        <button type="button" class="sea-open" @click="openToolWorkspace('hague')">
          <div class="sea-head">
            <b>海牙新申请</b>
            <span class="sea-badge">批量申报</span>
          </div>
          <small>批量校验申请材料与著录信息，多路并行填写草稿，并导出汇总表。</small>
          <em>材料核对 · 6 路并行 · Summary 导出</em>
        </button>
        <div class="sea-actions">
          <button type="button" class="sea-action-primary" @click="openToolWorkspace('hague', 'use')">开始使用</button>
          <button type="button" class="sea-remove" @click="openToolWorkspace('hague', 'guide')">流程说明</button>
        </div>
      </article>
      <article class="sea-card jihua-upload-card">
        <button type="button" class="sea-open" @click="openToolWorkspace('jihua')">
          <div class="sea-head">
            <b>季华实验室-文件导入</b>
            <span class="sea-badge">文件上传</span>
          </div>
          <small>按申请号自动归类文件，直连已登录的季华平台核对案件并批量上传。</small>
          <em>自动归类 · 6 路上传 · 逐行回执</em>
        </button>
        <div class="sea-actions">
          <button type="button" class="sea-action-primary" @click="openToolWorkspace('jihua', 'use')">开始使用</button>
          <button type="button" class="sea-remove" @click="openToolWorkspace('jihua', 'guide')">流程说明</button>
        </div>
      </article>
      <article class="sea-card billing-workflow-card">
        <button type="button" class="sea-open" @click="openToolWorkspace('billing')">
          <div class="sea-head">
            <b>请款</b>
            <span class="sea-badge">费用请款</span>
          </div>
          <small>支持涉外与 PCT 请款：自动抓取账单联动查费，带人行汇率原式导出。</small>
          <em>账单抓取 · 费用联动 · 原式导出</em>
        </button>
        <div class="sea-actions">
          <button type="button" class="sea-action-primary" @click="openToolWorkspace('billing', 'use')">开始使用</button>
          <button type="button" class="sea-remove" @click="openToolWorkspace('billing', 'guide')">流程说明</button>
        </div>
      </article>
      <article class="sea-card pct-notice-workflow-card">
        <button type="button" class="sea-open" @click="openToolWorkspace('pctNotice')">
          <div class="sea-head">
            <b>pct官文下载上传</b>
            <span class="sea-badge">官文同步</span>
          </div>
          <small>大小客户双系统并行：比对未导入官文，自动清理前缀并完成两轮回传。</small>
          <em>双系统并行 · 增量比对 · 自动回传</em>
        </button>
        <div class="sea-actions">
          <button type="button" class="sea-action-primary" @click="openToolWorkspace('pctNotice', 'use')">开始使用</button>
          <button type="button" class="sea-remove" @click="openToolWorkspace('pctNotice', 'guide')">流程说明</button>
        </div>
      </article>
      <article class="sea-card fee-reduce-workflow-card">
        <button type="button" class="sea-open" @click="openToolWorkspace('feeReduce')">
          <div class="sea-head">
            <b>请求费用减缓</b>
            <span class="sea-badge">费减办理</span>
          </div>
          <small>按我方文号识别处理状态，撰写中案件自动创建费减递交、转档并提初核。</small>
          <em>状态筛选 · XML 转档 · 提交初核</em>
        </button>
        <div class="sea-actions">
          <button type="button" class="sea-action-primary" @click="openToolWorkspace('feeReduce', 'use')">开始使用</button>
          <button type="button" class="sea-remove" @click="openToolWorkspace('feeReduce', 'guide')">流程说明</button>
        </div>
      </article>
      <button type="button" class="sea-card sea-add" @click="openOcean">
        <span class="sea-add-icon" aria-hidden="true">+</span>
        <b>从知识海洋加一条</b>
        <small>自由挑选常用步骤，按业务顺序编排你的专属工作流。</small>
      </button>
    </section>

    <section v-else-if="screen === 'ocean'" class="card ocean">
      <button type="button" class="workflow-back-btn" @click="screen = 'sea'">回到工作流</button>
      <p class="hint">现在会自己跑起来的，是 PCT提醒、PCT鹏城专案和文件管理。新加的会按你排的步骤保存下来。</p>
      <div class="skill-sea">
        <button
          v-for="skill in SKILLS"
          :key="skill.id"
          type="button"
          class="skill-bubble"
          :class="[skill.tint, { on: picked.includes(skill.id) }]"
          @click="toggleSkill(skill.id)"
        >
          <i v-if="picked.includes(skill.id)">{{ picked.indexOf(skill.id) + 1 }}</i>
          <b>{{ skill.title }}</b>
          <small>{{ skill.blurb }}</small>
        </button>
      </div>
      <label class="ocean-name">给这条起个名字
        <input v-model="newName" type="text" maxlength="40" placeholder="我的工作流" />
      </label>
      <div class="flow-actions">
        <button type="button" class="solid" :disabled="creating" @click="createFromOcean">{{ creating ? '正在放进去…' : '放进我的工作流' }}</button>
      </div>
      <p v-if="oceanNotice" class="hint">{{ oceanNotice }}</p>
    </section>

    <WorkflowWorkspace
      v-else-if="screen === 'flow' && draft"
      :workflow-id="draft.id"
      :active="screen === 'flow'"
      v-model:view="flowView"
      :title="draft.label"
      :guide="flowGuideFor(draft)"
      :show-steps="true"
      :show-guide="Boolean(flowGuideFor(draft))"
      :show-use="canUseFlow(draft)"
      :lazy-use="true"
      tabs-class="flow-view-tabs"
      @back="backToSea"
    >
      <template #header>
        <header class="page-head flow-head">
          <Bunny />
          <div class="flow-head-fields">
            <button type="button" class="workflow-back-btn" @click="backToSea">回到工作流</button>
            <label>名字
              <input v-model="draft.label" type="text" maxlength="40" :disabled="locked" />
            </label>
            <label>这句话怎么介绍
              <input v-model="draft.summary" type="text" maxlength="400" :disabled="locked" />
            </label>
          </div>
          <img class="page-art" :src="bg('专注每一次发文，让知识更有力量.png')" alt="" />
        </header>
      </template>
      <template #steps>
    <section class="card flow-preview">
      <div class="section-heading">
        <strong>全局预览</strong>
        <button type="button" class="text-button" @click="previewOpen = !previewOpen">{{ previewOpen ? '收起' : '展开' }}</button>
      </div>
      <div v-show="previewOpen" class="flow-preview-host">
        <template v-for="(piece, index) in previewPieces" :key="piece.stepId">
          <span v-if="index" class="flow-preview-arrow" aria-hidden="true">→</span>
          <div v-if="piece.arms" class="flow-preview-fork">
            <button type="button" class="flow-preview-node" :class="{ on: selectedId === piece.stepId }" @click="selectedId = piece.stepId">
              <b>{{ piece.lines[0] }}</b>
            </button>
            <span class="flow-preview-arrow" aria-hidden="true">→</span>
            <div class="flow-preview-arms">
              <span v-for="arm in piece.arms" :key="arm[0]" class="flow-preview-node arm">
                <b>{{ arm[0] }}</b>
                <small>{{ arm[1] }}</small>
              </span>
            </div>
          </div>
          <button v-else type="button" class="flow-preview-node" :class="{ on: selectedId === piece.stepId }" @click="selectedId = piece.stepId">
            <b>{{ piece.lines[0] }}</b>
            <small v-for="line in piece.lines.slice(1)" :key="line">{{ line }}</small>
          </button>
        </template>
      </div>
    </section>
    <div class="flow-board">
      <div class="flow-steps">
        <template v-for="(step, index) in draft.steps" :key="step.id">
          <button type="button" class="flow-node" :class="[skillTint(step.skillId), { on: step.id === selectedId }]" @click="selectedId = step.id">
            <span>{{ index + 1 }}</span>
            <b>{{ step.title }}</b>
            <small>{{ skillTitle(step) }}</small>
          </button>
          <div v-if="index < draft.steps.length - 1" class="flow-link" aria-hidden="true">♥</div>
        </template>
        <p v-if="draft.steps.length === 0" class="hint">还没有步骤。在右边挑一件事加上。</p>
      </div>
      <section class="card flow-editor">
        <template v-if="selected">
          <h2>{{ selected.title }}</h2>
          <p v-if="locked" class="hint">系统自带的不能改。要调整，先复制一份副本。</p>
          <label>这一步叫什么 <input v-model="selected.title" type="text" maxlength="40" :disabled="locked" /></label>
          <label>它做什么 <textarea v-model="selected.detail" maxlength="800" :disabled="locked" /></label>
          <p v-if="stepHasChoice && choiceNotice" class="hint">{{ choiceNotice }}</p>
          <button v-if="stepHasChoice" type="button" class="flow-text" @click="loadChoices(true)">重新读取名单</button>
          <div v-for="param in visibleParams" :key="param.id" class="flow-param">
            <input v-model="param.label" type="text" maxlength="40" aria-label="叫什么" placeholder="叫什么" :disabled="locked" />
            <div class="flow-value">
              <template v-if="isMailTypeParam(param.id)">
                <MailTypeTreeSelect
                  :model-value="shownTypeId(param)"
                  :options="treeOptionsFor(param)"
                  :disabled="locked || mailTypes.length === 0"
                  placeholder="点一种发文类型"
                  @update:model-value="chooseChoice(param, String($event))"
                />
              </template>
              <MailTypeTreeSelect
                v-else-if="param.id === 'proc_label'"
                :model-value="procTreeFor(param).selectedId"
                :options="procTreeFor(param).options"
                :disabled="locked || procs.length === 0"
                leaves-only
                placeholder="从事项里点一个具体的"
                empty-text="没有匹配的事项。"
                search-label="搜索事项"
                @update:model-value="chooseProc(param, String($event))"
              />
              <ThemeSelect
                v-else-if="isStyleLabelParam(param.id)"
                :model-value="shownStyle(param)"
                :options="styleOptionsFor(param)"
                :disabled="locked"
                placeholder="点一种发文方式"
                empty-text="发文方式还没读到。"
                @update:model-value="chooseStyle(param, String($event))"
              />
              <input
                v-else-if="param.id === 'review_label'"
                :value="rules?.defaultReviewer?.name ? '发文映射默认审核人：' + rules.defaultReviewer.name : '请先在发文映射中配置默认审核人'"
                readonly
                aria-label="默认审核人来源"
              />
              <ThemeSelect
                v-else-if="isListedChoice(param.id)"
                :model-value="param.value"
                :options="optionsFor(param)"
                :disabled="locked"
                placeholder="点一个"
                empty-text="还没有可点的项。"
                @update:model-value="param.id === 'surface_label' ? param.value = String($event) : chooseChoice(param, String($event))"
              />
              <input v-if="showsText(param.id)" v-model="param.value" type="text" maxlength="200" aria-label="写成" placeholder="写成" :disabled="locked" />
              <button v-if="isExtraParam(param.id) && !locked" type="button" class="flow-text" @click="removeNote(selected, param.id)">拿掉</button>
            </div>
            <input v-model="param.help" class="help" type="text" maxlength="400" aria-label="说明" placeholder="给看的人一句说明" :disabled="locked" />
            <p v-if="paramWarning(param)" class="hint warn">{{ paramWarning(param) }}</p>
          </div>
          <div v-if="!locked" class="flow-actions">
            <button type="button" class="ghost" :disabled="draft.steps[0]?.id === selected.id" @click="moveStep(selected.id, -1)">上移</button>
            <button type="button" class="ghost" :disabled="draft.steps[draft.steps.length - 1]?.id === selected.id" @click="moveStep(selected.id, 1)">下移</button>
            <button v-if="!isBuiltinStep(selected.id)" type="button" class="ghost" @click="removeStep(selected.id)">拿掉这一步</button>
            <button type="button" class="flow-text" @click="addNote(selected)">再记一笔</button>
          </div>
        </template>
        <template v-if="!locked">
          <h3>再加一件会做的事</h3>
          <div class="skill-sea slim">
            <button v-for="skill in SKILLS" :key="skill.id" type="button" class="skill-bubble" :class="skill.tint" @click="addSkillStep(skill.id)">
              <b>{{ skill.title }}</b>
              <small>{{ skill.blurb }}</small>
            </button>
          </div>
        </template>
        <div class="flow-actions">
          <button type="button" class="ghost" @click="copyFlow(draft)">复制副本</button>
          <button v-if="!locked" type="button" class="solid" :disabled="saving" @click="save">{{ saving ? '正在保存…' : '保存' }}</button>
          <span v-if="dirty" class="hint">还有没保存的修改。</span>
        </div>
        <p v-if="notice" class="hint">{{ notice }}</p>
      </section>
    </div>
      </template>
      <WorkflowMailEntry
        :key="draft.id"
        :locked-workflow-id="draft.id"
        :customers="workspaceCustomers"
        :rules="rules"
        :operator-id="workspaceOperatorId"
        :mail-types="mailTypes"
        :senders="mailSenders"
        :signature-name="signatureName"
        :signature-text="signatureText"
        :catalog="catalog"
      />
    </WorkflowWorkspace>
  </div>
  <div v-if="screen === 'hague'" class="workflow-hague">
    <WorkflowWorkspace
      workflow-id="hague"
      :active="screen === 'hague'"
      v-model:view="hagueView" title="海牙新申请"
      description="选择总文件夹核对材料与信息，默认 6 路填写草稿并导出 Summary。"
      :guide="hagueGuide" :art="bg('让重复工作变简单.png')" @back="screen = 'sea'"
    >
      <HaguePage embedded :is-active="screen === 'hague' && hagueView === 'use'" />
    </WorkflowWorkspace>
  </div>
  <div
    class="workflow-jihua"
    :class="{ 'is-hidden-pane': screen !== 'jihua' }"
    :inert="screen !== 'jihua'"
    :aria-hidden="screen !== 'jihua' ? 'true' : undefined"
  >
    <WorkflowWorkspace
      workflow-id="jihua"
      :active="screen === 'jihua'"
      v-model:view="jihuaView" title="季华实验室-文件导入"
      description="先看流程与材料规则，或直接使用工作台整理并上传文件。"
      :guide="jihuaGuide" :art="bg('让重复工作变简单.png')" @back="screen = 'sea'"
    >
      <JihuaUploadPage embedded @back="screen = 'sea'" />
    </WorkflowWorkspace>
  </div>
  <div
    v-if="billingMounted"
    class="workflow-billing"
    :class="{ 'is-hidden-pane': screen !== 'billing' }"
    :inert="screen !== 'billing'"
    :aria-hidden="screen !== 'billing' ? 'true' : undefined"
  >
    <WorkflowWorkspace
      workflow-id="billing"
      :active="screen === 'billing'"
      v-model:view="billingView" title="请款"
      description="先选请款模板智能预填查询条件：涉外自动抓账单查第三方费用，PCT 查官费与我方代理费，保留 Excel 原式导出。"
      :guide="billingGuide" :art="bg('让重复工作变简单.png')" @back="screen = 'sea'"
    >
      <BillingWorkflowPage embedded :is-active="screen === 'billing' && billingView === 'use'" @back="screen = 'sea'" />
    </WorkflowWorkspace>
  </div>
  <div
    v-if="pctNoticeMounted"
    class="workflow-pct-notice"
    :class="{ 'is-hidden-pane': screen !== 'pctNotice' }"
    :inert="screen !== 'pctNotice'"
    :aria-hidden="screen !== 'pctNotice' ? 'true' : undefined"
  >
    <WorkflowWorkspace
      workflow-id="pctNotice"
      :active="screen === 'pctNotice'"
      v-model:view="pctNoticeView" title="pct官文下载上传"
      description="大小客户双系统同时在线：导出未导入并集清单，并并行完成删除 PCT/、全量二次分析与两轮导入系统。"
      :guide="pctNoticeGuide" :art="bg('让重复工作变简单.png')" @back="screen = 'sea'"
    >
      <PctNoticeWorkflowPage embedded :is-active="screen === 'pctNotice' && pctNoticeView === 'use'" @back="screen = 'sea'" />
    </WorkflowWorkspace>
  </div>
  <div
    v-if="feeReduceMounted"
    class="workflow-fee-reduce"
    :class="{ 'is-hidden-pane': screen !== 'feeReduce' }"
    :inert="screen !== 'feeReduce'"
    :aria-hidden="screen !== 'feeReduce' ? 'true' : undefined"
  >
    <WorkflowWorkspace
      workflow-id="feeReduce"
      :active="screen === 'feeReduce'"
      v-model:view="feeReduceView" title="请求费用减缓"
      description="按我方文号检索「请求费用减缓」处理事项：递交中/完成自动跳过，撰写中自动转档并提交流程人员初核。"
      :guide="feeReduceGuide" :art="bg('让重复工作变简单.png')" @back="screen = 'sea'"
    >
      <FeeReduceWorkflowPage embedded :is-active="screen === 'feeReduce' && feeReduceView === 'use'" @back="screen = 'sea'" />
    </WorkflowWorkspace>
  </div>
  </div>
</template>
