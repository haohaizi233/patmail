export interface ObservedComponent {
  componentId: string
  namingContainer?: string
  formId?: string
  widgetType?: string
  componentRole: string
  sourceEvidence: string
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
  confidence?: 'exact' | 'probable' | 'unresolved'
}

export interface ObservedComponentRegistry {
  registerComponent(input: ObservedComponentInput): ObservedComponent
  getComponent(componentId: string): ObservedComponent | undefined
  clear(): void
  size(): number
}

export function createObservedComponentRegistry(options?: { maxComponents?: number }): ObservedComponentRegistry
