export type WorkflowViewTab = 'steps' | 'guide' | 'use'
export type WorkflowFlowView = WorkflowViewTab

const MAX_MEMORY_ENTRIES = 100
const MAX_KEY_LENGTH = 80

export interface WorkflowDeskState<T> {
  screen: 'sea' | 'ocean' | 'flow' | 'jihua' | 'hague' | 'billing' | 'pctNotice' | 'feeReduce'
  hagueView: 'guide' | 'use'
  jihuaView: 'guide' | 'use'
  billingView: 'guide' | 'use'
  pctNoticeView?: 'guide' | 'use'
  feeReduceView?: 'guide' | 'use'
  flowView?: WorkflowViewTab
  workflowViews?: Record<string, WorkflowViewTab>
  selectedSteps?: Record<string, string>
  draft: T | null
  selectedId: string
  dirty: boolean
  picked: string[]
  newName: string
}

export function isWorkflowViewTab(value: unknown): value is WorkflowViewTab {
  return value === 'steps' || value === 'guide' || value === 'use'
}

function isSafeRecordKey(key: string): boolean {
  return Boolean(key) && key.length <= MAX_KEY_LENGTH && key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
}

export function sanitizeWorkflowViews(value: unknown): Record<string, WorkflowViewTab> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, WorkflowViewTab> = {}
  let count = 0
  for (const [rawKey, rawVal] of Object.entries(value as Record<string, unknown>)) {
    if (count >= MAX_MEMORY_ENTRIES) break
    const key = rawKey.trim()
    if (!isSafeRecordKey(key) || !isWorkflowViewTab(rawVal)) continue
    result[key] = rawVal
    count += 1
  }
  return result
}

export function sanitizeSelectedSteps(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, string> = {}
  let count = 0
  for (const [rawKey, rawVal] of Object.entries(value as Record<string, unknown>)) {
    if (count >= MAX_MEMORY_ENTRIES) break
    const key = rawKey.trim()
    const stepId = typeof rawVal === 'string' ? rawVal.trim() : ''
    if (!isSafeRecordKey(key) || !stepId || stepId.length > MAX_KEY_LENGTH) continue
    result[key] = stepId
    count += 1
  }
  return result
}

export function resolveWorkflowView(input: {
  workflowId: string
  requested?: WorkflowViewTab
  remembered?: Readonly<Record<string, WorkflowViewTab>>
  available: readonly WorkflowViewTab[]
  fallback: WorkflowViewTab
}): WorkflowViewTab {
  if (input.requested && input.available.includes(input.requested)) return input.requested
  const id = input.workflowId.trim()
  if (id && input.remembered && Object.prototype.hasOwnProperty.call(input.remembered, id)) {
    const saved = input.remembered[id]
    if (saved && input.available.includes(saved)) return saved
  }
  if (input.available.includes(input.fallback)) return input.fallback
  return input.available[0] ?? 'steps'
}

export function sanitizeWorkflowDeskState<T>(value: unknown, isValidDraft: (draft: unknown) => draft is T): WorkflowDeskState<T> | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<WorkflowDeskState<T>>
  const screens = ['sea', 'ocean', 'flow', 'jihua', 'hague', 'billing', 'pctNotice', 'feeReduce']
  if (!screens.includes(String(state.screen))) return null
  const draft = isValidDraft(state.draft) ? state.draft : null
  const screen = state.screen === 'flow' && !draft ? 'sea' : state.screen as WorkflowDeskState<T>['screen']
  const flowView: WorkflowViewTab | undefined = isWorkflowViewTab(state.flowView) ? state.flowView : undefined
  const workflowViews = sanitizeWorkflowViews(state.workflowViews)
  const selectedSteps = sanitizeSelectedSteps(state.selectedSteps)
  return {
    screen,
    hagueView: state.hagueView === 'guide' ? 'guide' : 'use',
    jihuaView: state.jihuaView === 'guide' ? 'guide' : 'use',
    billingView: state.billingView === 'guide' ? 'guide' : 'use',
    ...(state.pctNoticeView === 'guide' || state.pctNoticeView === 'use' ? { pctNoticeView: state.pctNoticeView } : {}),
    ...(state.feeReduceView === 'guide' || state.feeReduceView === 'use' ? { feeReduceView: state.feeReduceView } : {}),
    ...(flowView ? { flowView } : {}),
    ...(Object.keys(workflowViews).length ? { workflowViews } : {}),
    ...(Object.keys(selectedSteps).length ? { selectedSteps } : {}),
    draft,
    selectedId: typeof state.selectedId === 'string' ? state.selectedId : '',
    dirty: state.dirty === true,
    picked: Array.isArray(state.picked) ? state.picked.filter((id): id is string => typeof id === 'string') : [],
    newName: typeof state.newName === 'string' ? state.newName.slice(0, 40) : ''
  }
}
