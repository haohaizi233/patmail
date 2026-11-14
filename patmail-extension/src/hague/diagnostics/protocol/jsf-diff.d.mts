export interface ProtocolFingerprintInput {
  httpMethod?: string
  urlPath?: string
  facesNamespace?: string
  sourceComponent?: string
  process?: string
  update?: string
  event?: string
  actionTypes?: string[]
  [key: string]: unknown
}

export interface ScenarioStepInput {
  step?: number
  action?: string
  stepLabel?: string
  operation?: string
  path?: string
  urlPath?: string
}

export interface ProtocolDriftChange {
  type: string
  action?: string
  from?: string
  to?: string
  details?: string
}

export interface ProtocolDriftReport {
  hasDrift: boolean
  severity: 'low' | 'medium' | 'high'
  changes: ProtocolDriftChange[]
  confidence: 'exact' | 'probable' | 'unresolved'
  unresolvedReasons: string[]
}

export function computeProtocolFingerprint(req?: ProtocolFingerprintInput): string
export function computeScenarioFingerprint(steps?: ScenarioStepInput[]): string
export function detectProtocolDrift(
  baseline: {
    scenarioId?: string
    urlPath?: string
    facesNamespace?: string
    sourceComponent?: string
    expectedActions?: string[]
    observedActions?: string[]
    viewStateBehavior?: string
  },
  observed: {
    scenarioId?: string
    urlPath?: string
    facesNamespace?: string
    sourceComponent?: string
    expectedActions?: string[]
    observedActions?: string[]
    viewStateBehavior?: string
  }
): ProtocolDriftReport
