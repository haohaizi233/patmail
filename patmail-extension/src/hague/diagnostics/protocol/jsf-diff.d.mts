export interface ProtocolBaseline {
  httpMethod?: string
  urlPath?: string
  facesNamespace?: string
  sourceComponent?: string
  process?: string
  update?: string
  event?: string
  actionTypes?: string[]
  actions?: (string | { action: string; target?: string })[]
  expectedActions?: string[]
  observedActions?: string[]
  viewStateBehavior?: string
  observationStatus?: string
  version?: number | string
  scenarioId?: string
  [key: string]: unknown
}

export interface ProtocolFingerprintInput {
  httpMethod?: string
  urlPath?: string
  facesNamespace?: string
  sourceComponent?: string
  process?: string
  update?: string
  event?: string
  actionTypes?: string[]
  actions?: (string | { action: string })[]
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
  driftStatus: 'no_drift' | 'drift_detected' | 'baseline_missing' | 'unresolved'
  severity: 'low' | 'medium' | 'high'
  baselineVersion?: string
  protocolFingerprint?: string
  changes: ProtocolDriftChange[]
  confidence: 'exact' | 'probable' | 'unresolved'
  unresolvedReasons: string[]
}

export function computeProtocolFingerprint(req?: ProtocolFingerprintInput): string
export function computeScenarioFingerprint(steps?: ScenarioStepInput[]): string
export interface ProtocolObservation extends ProtocolFingerprintInput {
  httpMethod: string
  actionTypes: string[]
  observationStatus?: 'observed' | 'missing' | 'parse_failed' | 'unsupported'
  viewStateBehavior?: 'present' | 'missing' | 'unknown'
}
export function normalizeProtocolObservation(input: unknown): (ProtocolBaseline & { actionTypes: string[] }) | null
export function detectProtocolDrift(
  baseline?: ProtocolBaseline | null,
  observed?: ProtocolBaseline | null
): ProtocolDriftReport
