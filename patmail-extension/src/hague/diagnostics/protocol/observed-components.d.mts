export interface ObservedComponent {
  componentId: string
  namingContainer?: string
  formId?: string
  widgetType?: string
  componentRole: string
  candidateRoleHint?: string
  sourceEvidence: string
  canAuthorizeWrite: boolean
  authoritativeReceipt: boolean
  generation: number
  confidence: 'exact' | 'probable' | 'unresolved'
}

export interface ObservedComponentInput {
  componentId: string
  namingContainer?: string
  formId?: string
  widgetType?: string
  componentRole?: string
  sourceEvidence?: string
  domEvidence?: string
  astEvidence?: string
  requestEvidence?: string
  confidence?: 'exact' | 'probable' | 'unresolved'
}

export interface ObservedComponentRegistry {
  registerComponent(input: ObservedComponentInput): ObservedComponent
  getComponent(componentId: string): ObservedComponent | undefined
  clear(): void
  size(): number
}

export function createObservedComponentRegistry(options?: { maxComponents?: number }): ObservedComponentRegistry
