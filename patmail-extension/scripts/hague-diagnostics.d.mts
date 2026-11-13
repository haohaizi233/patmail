export function safeHagueUrl(value: unknown): {origin:string;path:string}|null
export function deepCommandAllowed(method:string,params?:Record<string,unknown>):boolean
export function networkMetadata(request:Record<string,unknown>,params?:Record<string,unknown>):Record<string,unknown>
export function correlateRequest(request:Record<string,unknown>,candidates:Record<string,unknown>[]):{correlationConfidence:string;candidateCount:number;traceId?:unknown}
export class HagueDeepDiagnostics {
 constructor(send:(method:string,params:Record<string,unknown>,sessionId?:string)=>Promise<unknown>,log:(kind:string,fields:Record<string,unknown>)=>void)
 target: {targetId:string;sessionId:string;url:string}|null
 status():{enabled:boolean;state:string;scripts:number;bytes:number}
 enable(target:{targetId:string;sessionId:string;url:string}):Promise<ReturnType<HagueDeepDiagnostics['status']>>
 disable():Promise<ReturnType<HagueDeepDiagnostics['status']>>
 script(target:{targetId:string;sessionId:string;url:string},params:Record<string,unknown>):Promise<void>
}
export function safeHagueSnapshotText(value:unknown):string
export function safeDraftTextSummary(values:unknown):{count:number;categories:string[]}
export { observerEventsToTraces } from '../src/hague/diagnostics/observer-adapter.mjs'
