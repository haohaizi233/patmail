export interface JsfParseOptions {mime?:string;httpStatus?:number;maxBytes?:number;maxNodes?:number;maxDepth?:number;contextKey?:string}
export interface JsfProtocolSummary {protocolStatus:'valid'|'html'|'empty'|'invalid_xml'|'jsf_error'|'jsf_validation_failed'|'redirect'|'unsupported';errorCode?:string;xmlParsed:boolean;parserError:boolean;jsfError:boolean;validationFailed:boolean;redirectDetected:boolean;updateCount:number;insertCount:number;deleteCount:number;attributeCount:number;evalCount:number;extensionCount:number;unknownNodeCount:number;updatedComponents:string[];expectedUpdates:string[];viewStatePresent:boolean;viewStateLength:number;viewStateChanged?:boolean;bodyStatus:'body_available'|'body_unavailable'|'body_too_large'|'body_unsupported'|'body_parse_failed'}
export function parseJsfPartialResponse(body:string|Uint8Array,options?:JsfParseOptions):JsfProtocolSummary
export function createJsfProtocolAnalyzer():{analyze(body:string|Uint8Array,options?:JsfParseOptions):Promise<JsfProtocolSummary>;clear():void}
export interface JsfRequestSummary {
  eligibleAjax: boolean
  isUpload: boolean
  sourceComponent?: string
  form?: string
  process?: string
  update?: string
  parameterNames: string[]
  requestMetadataStatus: 'parsed' | 'unsupported' | 'too_large'
  method?: string
  urlPath?: string
  facesNamespace?: 'javax' | 'jakarta' | 'mixed' | 'unknown'
  requestFamily?: string
  executeComponents?: string[]
  renderComponents?: string[]
  behaviorEvent?: string
  ajaxMarkerPresent?: boolean
  viewStatePresent?: boolean
  duplicateParameterCount?: number
  unknownParameterCount?: number
  protocolConfidence?: 'exact' | 'partial' | 'unresolved'
  unresolvedReasons?: string[]
}
export function parseJsfRequest(request?: {
  mime?: string
  contentType?: string
  postData?: string
  isUpload?: boolean
  method?: string
  url?: string
  urlPath?: string
}): JsfRequestSummary
