export interface AstOptions {scriptId?:string;maxSourceBytes?:number;maxNodes?:number;maxDepth?:number;maxTimeMs?:number;maxDecodeDepth?:number;elementId?:string;formId?:string;definitions?:string}
export interface AstCall {kind:string;sourceLayer?:number;widgetType?:string;paginator?:{rows?:number;rowCount?:number;page?:number};source?:string;form?:string;process?:string;update?:string;event?:string;componentId?:string;parameterNames:string[];locationAnchors?:{line:number;column:number}[];location:{line:number;column:number};functionName?:string;confidence:string;unresolvedReasons:string[]}
export interface AstAnalysis {calls:AstCall[];scriptHash:string;unresolved:string[];fingerprint:string;stats:{nodes:number;durationMs:number}}
export interface StaticAction {source:string;form?:string;process?:string;update?:string;event?:string;full?:boolean;params?:Record<string,string>;_kind:string;_line:number;_column:number}
export function analyzeJavaScript(source:string,options?:AstOptions):AstAnalysis
export interface JsfCallIR {
  callType: string
  sourceLocation: { line?: number; column?: number }
  sourceComponent?: string
  form?: string
  process?: string[]
  update?: string[]
  event?: string
  parameterNames?: string[]
  staticConfidence: 'static' | 'partial' | 'unresolved'
  unresolvedReasons: string[]
}
export function extractJsfCallIR(source: string, options?: AstOptions): JsfCallIR[]
export function extractStaticActions(source:string,options?:AstOptions):StaticAction[]

export function clearAstCache():void

export function isStaticUiHandler(source:string):boolean

export function selectRemoteDefinition(sources:readonly string[],name:string):string|undefined
