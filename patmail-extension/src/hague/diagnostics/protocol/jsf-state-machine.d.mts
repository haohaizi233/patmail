export interface ViewStateScope {
  sessionId?: string
  frameId?: string
  loaderId?: string
  formId?: string
}

export type ViewStateLifecycleState =
  | 'UNKNOWN'
  | 'INITIAL_OBSERVED'
  | 'REQUEST_IN_FLIGHT'
  | 'STATE_CHANGED'
  | 'STATE_UNCHANGED'
  | 'STATE_MISSING'
  | 'DOCUMENT_CHANGED'
  | 'STATE_CONFLICT'
  | 'OUT_OF_ORDER'
  | 'STATE_UNVERIFIABLE'

export interface ViewStateStateMachine {
  getState(scope: ViewStateScope): ViewStateLifecycleState
  recordInitialViewState(scope: ViewStateScope, initialToken: string): Promise<{ status: ViewStateLifecycleState }>
  beginRequest(scope: ViewStateScope, requestId?: string): { status: ViewStateLifecycleState }
  recordResponseViewState(
    scope: ViewStateScope,
    requestId: string | undefined,
    newViewState: string | null | undefined
  ): Promise<{
    status: ViewStateLifecycleState
    transition: ViewStateLifecycleState
  }>
  getDiagnosticsSnapshot(scope: ViewStateScope): {
    hasActiveKey: boolean
    status: ViewStateLifecycleState
    inFlightCount: number
    contextsCount: number
    generation: number
  }
  clear(): void
}

export function createViewStateStateMachine(): ViewStateStateMachine
