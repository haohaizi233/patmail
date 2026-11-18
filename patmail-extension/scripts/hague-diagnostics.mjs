import { sanitizeTraceEvent } from '../src/hague/diagnostics/schema.mjs'
import { createHash, randomUUID } from 'node:crypto'
export function safeHagueUrl(value) {
  try {
    const u = new URL(value)
    if (u.origin !== 'https://hague.wipo.int' || u.username || u.password) return null
    const path = /^\/(?:[a-z]{2}\/)?(?:eHague\/)?(?:application|summary|drafts|index|login|newApplication)\.xhtml$/i.test(u.pathname)
      || /^\/HagueEFilingWeb\/(?:protected\/(?:portfolioManager|page\/(?:application|summary))\.xhtml|DesignServlet)$/.test(u.pathname)
      ? u.pathname : /\/javax\.faces\.resource\//.test(u.pathname) ? '/HagueEFilingWeb/javax.faces.resource/[resource]' : '/[redacted]'
    return { origin: u.origin, path }
  } catch { return null }
}
const id = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(value)
export function deepCommandAllowed(method, params = {}) {
  const keys = Object.keys(params)
  if (['Debugger.enable', 'Debugger.disable'].includes(method)) return keys.length === 0
  if (method === 'Debugger.setSkipAllPauses') return keys.length === 1 && params.skip === true
  return method === 'Debugger.getScriptSource' && keys.length === 1 && id(params.scriptId)
}
export function networkMetadata(request, params = {}) {
  const status = Number.isInteger(request.status) && request.status >= 100 && request.status <= 599 ? request.status : null
  const error = String(params.errorText ?? '')
  return {httpStatus: status, httpCategory: status === null ? 'no_response' : status >= 500 ? 'server_error' : status >= 400 ? 'client_error' : status >= 300 ? 'redirect' : 'response',
    ...(error || params.canceled ? {failureCategory: params.canceled ? 'cancelled' : /TIMED_OUT|TIMEOUT/.test(error) ? 'timeout' : /DISCONNECTED|CONNECTION|NETWORK/.test(error) ? 'network' : 'other'} : {})}
}
export {correlateRequest} from '../src/hague/diagnostics/correlation/correlator.mjs'
export class HagueDeepDiagnostics {
  constructor(send, log, analyzer = null) { this.skipped=0; this.analyzer=analyzer; this.reserved=0; this.send=send; this.log=log; this.target=null; this.generation=0; this.count=0; this.bytes=0; this.seen=new Set(); this.state='off' }
  status() { return {enabled:!!this.target, state:this.state, scripts:this.count, bytes:this.bytes,skippedAnalyses:this.skipped} }
  command(method, params, sessionId) {
    if (!deepCommandAllowed(method,params)) throw Error('unsafe deep command')
    return this.send(method,params,sessionId)
  }
  async enable(target) {
    const activation=this.generation+1
    await this.disable()
    if (activation !== this.generation) return this.status()
    if (!target || !id(target.targetId) || !id(target.sessionId) || !safeHagueUrl(target.url)) throw Error('invalid authorized Hague target')
    this.target={...target}; const generation=this.generation; this.state='enabling'
    try {
      await this.command('Debugger.setSkipAllPauses',{skip:true},target.sessionId)
      if (generation !== this.generation) return this.status()
      await this.command('Debugger.enable',{},target.sessionId)
      if (generation !== this.generation) return this.status()
      this.state='enabled'
    } catch { if (generation === this.generation) { await this.disable();this.state='unsupported';this.log('hague.deep.unsupported',{source:'hague'}) } }
    return this.status()
  }
  async disable() {
    this.analyzer?.clear(); this.reserved=0; this.clearAnalysisCache?.(); this.clearAnalysisCache=null
    const target=this.target;this.target=null;this.generation++;this.seen.clear();this.count=0;this.bytes=0;this.skipped=0;this.state='off'
    if (target) await this.command('Debugger.disable',{},target.sessionId).catch(()=>{})
    return this.status()
  }
  async script(target, params) {
    if (!this.target || target.sessionId !== this.target.sessionId || target.targetId !== this.target.targetId || !safeHagueUrl(target.url) || !safeHagueUrl(params.url) || !id(params.scriptId) || this.seen.has(params.scriptId)) return
    if(this.count >= 32 || this.bytes + this.reserved + 128*1024 > 2*1024*1024 || !(params.length >= 0 && params.length <= 128*1024)){
      this.skipped++;this.log('hague.script.analysis',sanitizeTraceEvent({version:1,eventId:randomUUID(),source:'cdp',phase:'analysis.skipped',timestamp:new Date().toISOString(),analysisKind:'ast',skipReason:'source_limit',targetId:target.targetId,sessionId:target.sessionId,stats:{skippedAnalyses:this.skipped},businessStatus:'unknown',certainty:'unknown'}));return
    }
    this.seen.add(params.scriptId);this.count++; this.reserved+=128*1024; const generation=this.generation
    try {
      let {scriptSource:source}=await this.command('Debugger.getScriptSource',{scriptId:params.scriptId},target.sessionId)
      if (generation !== this.generation || typeof source !== 'string') return
      if(Buffer.byteLength(source)>128*1024){source=null;this.skipped++;this.log('hague.script.analysis',sanitizeTraceEvent({version:1,eventId:randomUUID(),source:'cdp',phase:'analysis.skipped',timestamp:new Date().toISOString(),analysisKind:'ast',skipReason:'source_limit',stats:{skippedAnalyses:this.skipped}}));return}
      this.bytes+=Buffer.byteLength(source)
      const {analyzeJavaScript,clearAstCache}=await import('../src/hague/diagnostics/ast/analyzer.mjs')
      if (generation !== this.generation) return
      this.clearAnalysisCache=clearAstCache
      const result=this.analyzer ? await this.analyzer.analyze('ast',source,{sessionId:target.sessionId,targetId:target.targetId,scriptId:params.scriptId,startLine:params.startLine??0,startColumn:params.startColumn??0,urlPath:safeHagueUrl(params.url).path,generation}) : analyzeJavaScript(source);const hash=createHash('sha256').update(source).digest('hex');source=null
      if (generation !== this.generation) return
      // Never persist arbitrary AST strings or static parameter values.
      this.log('hague.script.analysis',{source:'hague',scriptHash:hash,callCount:Array.isArray(result.calls)?result.calls.length:0,unresolvedCount:Array.isArray(result.unresolved)?result.unresolved.length:0,origin:'https://hague.wipo.int',path:safeHagueUrl(params.url).path,evidence:'static_analysis'})
      for (const call of (Array.isArray(result.calls)?result.calls:[]).slice(0,200)) {
        const trace = sanitizeTraceEvent({version:1,eventId:randomUUID(),source:'cdp',phase:'protocol.analyzed',timestamp:new Date().toISOString(),operation:'protocol',
          sourceComponent:call.source,form:call.form,process:call.process,update:call.update,event:call.event,parameterNames:call.parameterNames,
          astCallType:call.kind,astConfidence:call.confidence==='static'?'static':'unresolved',sourceLocation:{scriptId:params.scriptId,scriptHash:hash,urlPath:safeHagueUrl(params.url).path,line:Number.isInteger(call.location?.line)?call.location.line+(params.startLine??0):undefined,column:Number.isInteger(call.location?.column)?call.location.column+(call.location?.line===1?(params.startColumn??0):0):undefined},
          correlationConfidence:'unmatched',protocolStatus:'not_observed',businessStatus:'unknown',certainty:'unknown',evidenceCodes:['PROTOCOL_STATIC']})
        if(trace) this.log('hague.script.analysis',trace)
      }

    } catch { this.log('hague.script.unavailable',{source:'hague'}) } finally { if(generation===this.generation)this.reserved-=128*1024 }
  }
}
export function safeHagueSnapshotText(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  if (/失败|错误|异常|中断|error|failed/i.test(value)) return 'error'
  if (/待核对|等待|uncertain/i.test(value)) return 'unconfirmed'
  if (/完成|成功|已保存|complete|saved/i.test(value)) return 'completed'
  if (/生成|正在|运行|上传|处理|progress/i.test(value)) return 'running'
  return 'notice'
}
export function safeDraftTextSummary(values) {
  const texts = Array.isArray(values) ? values.filter(v=>typeof v==='string'&&v.trim()).slice(0,6) : []
  return {count:texts.length,categories:[...new Set(texts.map(safeHagueSnapshotText))]}
}
export { observerEventsToTraces } from '../src/hague/diagnostics/observer-adapter.mjs'
