export interface JsfActionSummary {
  action: 'update' | 'insert' | 'delete' | 'attributes' | 'eval' | 'extension' | 'error' | 'redirect'
  id?: string
  isViewState?: boolean
  isViewRoot?: boolean
  ln?: string
  type?: string
  urlPath?: string
}

export interface JsfProtocolResult {
  recognized: boolean
  namespace: 'javax' | 'jakarta' | 'mixed' | 'unknown'
  kind: 'partial_response' | 'full_html' | 'redirect' | 'empty' | 'malformed' | 'unsupported'
  actions: JsfActionSummary[]
  viewState: {
    present: boolean
    length: number
    namespace: 'javax' | 'jakarta' | 'mixed' | 'unknown'
    count: number
  }
  viewStatePresent?: boolean
  viewStateLength?: number
  validation: {
    failed: boolean
    evidenceSource: 'extension_args' | 'none'
  }
  redirect?: {
    detected: boolean
    urlPath?: string
  }
  protocolErrors: {
    errorName: string
    category: string
  }[]
  protocolStatus: 'valid' | 'invalid_xml' | 'jsf_error' | 'jsf_validation_failed' | 'redirect' | 'unsupported' | 'empty' | 'html'
  errorCode?: string
  xmlParsed: boolean
  parserError: boolean
  jsfError: boolean
  validationFailed: boolean
  redirectDetected: boolean
  bodyStatus: 'body_available' | 'body_unavailable' | 'body_too_large' | 'body_unsupported' | 'body_parse_failed'
  updateCount: number
  insertCount: number
  deleteCount: number
  attributeCount: number
  evalCount: number
  extensionCount: number
  unknownNodeCount: number
  updatedComponents: string[]
  expectedUpdates: string[]
  unresolvedReasons: string[]
  stats: {
    updateCount: number
    insertCount: number
    deleteCount: number
    attributeCount: number
    evalCount: number
    extensionCount: number
    unknownNodeCount: number
    nodes: number
  }
}

export function parseJsfProtocol(
  body: string | Uint8Array,
  options?: {
    mime?: string
    maxBytes?: number
    maxNodes?: number
    maxDepth?: number
  }
): JsfProtocolResult

export function safeErrorCategory(name?: string, message?: string): string

export function compareJsfDualParsers(xmlText: string): {
  consistent: boolean
  saxResult: JsfProtocolResult
  domResult: {
    updateCount: number
    viewStatePresent: boolean
    validationFailed: boolean
    jsfError: boolean
  }
}
