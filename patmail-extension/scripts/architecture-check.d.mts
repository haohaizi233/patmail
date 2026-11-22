export interface ArchitectureEdge {
  from: string
  to: string | null
  specifier: string
  kind: 'static-import' | 're-export' | 'dynamic-import' | 'require' | 'import-type' | 'sfc-script'
  isTypeOnly: boolean
  line: number
  external: boolean
}

export interface ArchitectureSignal {
  from: string
  type: 'vite-glob' | 'message-type' | 'chrome-api' | 'dom-api'
  detail: string
  line: number
}

export interface ArchitectureViolation {
  id: string
  rule: string
  severity: 'error' | 'ratchet'
  from: string
  to: string
  line: number
  reason: string
}

export interface UnresolvedInternalImport {
  from: string
  specifier: string
  kind: ArchitectureEdge['kind']
  line: number
}

export interface ProjectInventory {
  scannedAt: string
  srcRoot: string
  fileCount: number
  files: Array<{ file: string; layer: string; module: string }>
  summary: {
    totalEdges: number
    runtimeInternalEdges: number
    typeOnlyEdges: number
    externalImports: string[]
    cycleCount: number
    unresolvedImportCount: number
  }
  cycles: string[][]
  unresolvedImports?: UnresolvedInternalImport[]
  matrix: Record<string, Record<string, number>>
  edges: ArchitectureEdge[]
  runtimeSignals: ArchitectureSignal[]
}

export interface ArchitectureReport {
  generatedAt: string
  fileCount: number
  runtimeInternalEdges: number
  typeOnlyEdges: number
  cycleCount: number
  baselineCycleCount: number
  cycleRegression: boolean
  hardErrors: ArchitectureViolation[]
  newRatchetViolations: ArchitectureViolation[]
  remainingRatchetViolations: ArchitectureViolation[]
  staleBaselineIds: string[]
  passed: boolean
}

export const COMPOSITION_ROOTS: ReadonlyMap<string, ReadonlySet<string>>

export function scanProjectDependencies(extensionRoot?: string): ProjectInventory
export function evaluateArchitecture(inventory: ProjectInventory): ArchitectureViolation[]
export function checkArchitecture(options?: {
  writeBaseline?: boolean
  writeDocs?: boolean
  extensionRoot?: string
}): ArchitectureReport
