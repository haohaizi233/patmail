export type WorkflowFlowView = 'steps' | 'guide' | 'use'

export interface WorkflowDeskState<T> {
  screen: 'sea' | 'ocean' | 'flow' | 'jihua' | 'hague' | 'billing'
  hagueView: 'guide' | 'use'
  jihuaView: 'guide' | 'use'
  billingView: 'guide' | 'use'
  flowView?: WorkflowFlowView
  draft: T | null
  selectedId: string
  dirty: boolean
  picked: string[]
  newName: string
}

export function sanitizeWorkflowDeskState<T>(value: unknown, isValidDraft: (draft: unknown) => draft is T): WorkflowDeskState<T> | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<WorkflowDeskState<T>>
  const screens = ['sea', 'ocean', 'flow', 'jihua', 'hague', 'billing']
  if (!screens.includes(String(state.screen))) return null
  const draft = isValidDraft(state.draft) ? state.draft : null
  const screen = state.screen === 'flow' && !draft ? 'sea' : state.screen as WorkflowDeskState<T>['screen']
  const flowView: WorkflowFlowView | undefined = state.flowView === 'steps' || state.flowView === 'guide' || state.flowView === 'use' ? state.flowView : undefined
  return {
    screen,
    hagueView: state.hagueView === 'guide' ? 'guide' : 'use',
    jihuaView: state.jihuaView === 'guide' ? 'guide' : 'use',
    billingView: state.billingView === 'guide' ? 'guide' : 'use',
    ...(flowView ? { flowView } : {}),
    draft,
    selectedId: typeof state.selectedId === 'string' ? state.selectedId : '',
    dirty: state.dirty === true,
    picked: Array.isArray(state.picked) ? state.picked.filter((id): id is string => typeof id === 'string') : [],
    newName: typeof state.newName === 'string' ? state.newName.slice(0, 40) : ''
  }
}
