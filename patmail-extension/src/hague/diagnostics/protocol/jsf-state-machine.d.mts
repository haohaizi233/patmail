export interface ViewStateScope {
  sessionId?: string
  targetId?: string
  frameId?: string
  loaderId?: string
  formId?: string
  generation?: number
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

export interface ViewStateStateMachineOptions {
  maxContexts?: number
  maxInFlight?: number
  maxInFlightPerDoc?: number
  ttlMs?: number
}

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
  getDiagnosticsSnapshot(scope?: ViewStateScope): {
    hasActiveKey: boolean
    status: ViewStateLifecycleState
    inFlightCount: number
    contextsCount: number
    generation: number
  }
  invalidateDocument(scope: ViewStateScope): void
  invalidateSession(sessionId: string): void
  forgetRequest(scope: ViewStateScope, requestId: string): void
  prune(now?: number): void
  clear(): void
}

export function createViewStateStateMachine(options?: ViewStateStateMachineOptions): ViewStateStateMachine
