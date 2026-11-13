import { sanitizeTraceEvent } from '../src/hague/diagnostics/schema.mjs'
import { createHash } from 'node:crypto'
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
export function correlateRequest(request, candidates) {
  const matches = candidates.filter(c => ['targetId','frameId','httpMethod','urlPath'].every(k => request[k] && c[k] === request[k]) && Number.isFinite(c.timestamp) && Math.abs(c.timestamp-request.timestamp) <= 1500)
  // Direct IDs must be supplied by the application instrumentation, never inferred.
  const direct = matches.filter(c => request.cdpRequestId && c.cdpRequestId === request.cdpRequestId && c.sessionId === request.sessionId)
  const exact = direct.length === 1
  const confidence = exact ? 'exact' : matches.length === 1 ? 'probable' : matches.length > 1 ? 'ambiguous' : 'unmatched'
  const candidate = exact ? direct[0] : matches.length === 1 ? matches[0] : null
  const ownership = {}
  if (candidate) {
    for (const key of ['traceId','caseRunId','stepIndex','operation','transportMode']) if (candidate[key] !== undefined) ownership[key] = candidate[key]
    if (candidate.requestId) ownership.applicationRequestId = candidate.requestId
  }
  return {correlationConfidence: confidence, candidateCount: matches.length, ...ownership}
}
export class HagueDeepDiagnostics {
  constructor(send, log) { this.send=send; this.log=log; this.target=null; this.generation=0; this.count=0; this.bytes=0; this.seen=new Set(); this.state='off' }
  status() { return {enabled:!!this.target, state:this.state, scripts:this.count, bytes:this.bytes} }
  command(method, params, sessionId) {
    if (!deepCommandAllowed(method,params)) throw Error('unsafe deep command')
    return this.send(method,params,sessionId)
  }
  async enable(target) {
    await this.disable()
    if (!target || !id(target.targetId) || !id(target.sessionId) || !safeHagueUrl(target.url)) throw Error('invalid authorized Hague target')
    this.target={...target}; const generation=this.generation; this.state='enabling'
    try {
      await this.command('Debugger.setSkipAllPauses',{skip:true},target.sessionId)
      if (generation !== this.generation) return this.status()
      await this.command('Debugger.enable',{},target.sessionId)
      if (generation !== this.generation) return this.status()
      this.state='enabled'
    } catch { await this.disable();this.state='unsupported';this.log('hague.deep.unsupported',{source:'hague'}) }
    return this.status()
  }
  async disable() {
    this.clearAnalysisCache?.(); this.clearAnalysisCache=null
    const target=this.target;this.target=null;this.generation++;this.seen.clear();this.count=0;this.bytes=0;this.state='off'
    if (target) await this.command('Debugger.disable',{},target.sessionId).catch(()=>{})
    return this.status()
  }
  async script(target, params) {
    if (!this.target || target.sessionId !== this.target.sessionId || !safeHagueUrl(target.url) || !safeHagueUrl(params.url) || !id(params.scriptId) || this.seen.has(params.scriptId) || this.count >= 32 || this.bytes >= 2_000_000 || !(params.length >= 0 && params.length <= 128_000)) return
    this.seen.add(params.scriptId);this.count++; const generation=this.generation
    try {
      let {scriptSource:source}=await this.command('Debugger.getScriptSource',{scriptId:params.scriptId},target.sessionId)
      if (generation !== this.generation || typeof source !== 'string' || source.length>128_000) return
      this.bytes+=source.length
      const {analyzeJavaScript,clearAstCache}=await import('../src/hague/diagnostics/ast/analyzer.mjs')
      if (generation !== this.generation) return
      this.clearAnalysisCache=clearAstCache
      const result=analyzeJavaScript(source);const hash=createHash('sha256').update(source).digest('hex');source=null
      if (generation !== this.generation) return
      // Never persist arbitrary AST strings or static parameter values.
      this.log('hague.script.analysis',{source:'hague',scriptHash:hash,callCount:Array.isArray(result.calls)?result.calls.length:0,unresolvedCount:Array.isArray(result.unresolved)?result.unresolved.length:0,origin:'https://hague.wipo.int',path:safeHagueUrl(params.url).path,evidence:'static_analysis'})
      for (const call of (Array.isArray(result.calls)?result.calls:[]).slice(0,200)) {
        const trace = sanitizeTraceEvent({version:1,source:'cdp',phase:'protocol.analyzed',timestamp:new Date().toISOString(),operation:'protocol',
          sourceComponent:call.source,form:call.form,process:call.process,update:call.update,event:call.event,parameterNames:call.parameterNames,
          astCallType:call.kind,astConfidence:call.confidence==='static'?'static':'unresolved',sourceLocation:{scriptHash:hash,urlPath:safeHagueUrl(params.url).path,line:call.location?.line,column:call.location?.column},
          correlationConfidence:'unmatched',protocolStatus:'not_observed',businessStatus:'unknown',certainty:'unknown',evidenceCodes:['PROTOCOL_STATIC']})
        if(trace) this.log('hague.script.analysis',trace)
      }

    } catch { this.log('hague.script.unavailable',{source:'hague'}) }
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
