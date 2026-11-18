export interface SourceMetadata {sessionId:string;targetId:string;scriptId:string;scriptHash:string;urlPath?:string;generation?:number;startLine?:number;startColumn?:number;calls:ReadonlyArray<{kind:string;confidence:string;location:{line:number;column:number};locationAnchors?:{line:number;column:number}[];sourceLayer?:number;source?:string;form?:string;process?:string;update?:string;event?:string;parameterNames?:string[];unresolvedReasons?:string[]}>}
export interface SourceIndex {addScript(script:SourceMetadata):boolean;lookup(request:Record<string,unknown>):{astConfidence:string;astCorrelationConfidence:string;correlationConfidence:string;matches:Record<string,unknown>[];reasons:string[]};clear():void;status():{generation:number;scripts:number;calls:number}}
export function createSourceIndex(options?:{maxScripts?:number;maxCalls?:number}):SourceIndex
export function correlateRequest(request:Record<string,unknown>,candidates?:Record<string,unknown>[]):{correlationConfidence:string;candidateCount:number;traceId?:string;caseRunId?:string;stepIndex?:number;applicationRequestId?:string}


