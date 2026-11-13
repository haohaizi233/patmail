import { safePath, sanitizeTraceEvent } from '../schema.mjs'

const scopeKeys = ['sessionId','targetId','frameId','traceId','caseRunId','requestId','cdpRequestId','stepIndex']
const conflict = (a,b) => scopeKeys.some(k => a[k] !== undefined && b[k] !== undefined && a[k] !== b[k])
const timestamp = e => typeof e.timestamp === 'number' ? e.timestamp : Date.parse(e.timestamp)

/** Direct identifiers outrank clocks. Conflicting ownership always fails closed. */
export function correlateRequest(request, candidates = []) {
  const compatible = candidates.filter(c => !conflict(request,c))
  const direct = compatible.filter(c =>
    (request.cdpRequestId && c.cdpRequestId === request.cdpRequestId && request.sessionId && c.sessionId === request.sessionId) ||
    (request.requestId && request.requestId === c.requestId && request.caseRunId && request.caseRunId === c.caseRunId && request.traceId && request.traceId === c.traceId))
  const identity = c => JSON.stringify(['sessionId','targetId','frameId','traceId','caseRunId','requestId','stepIndex'].map(k=>c[k]??null))
  const unique = [...new Map(direct.map(c=>[identity(c),c])).values()]
  const possible = compatible.filter(c => ['targetId','frameId','httpMethod','urlPath'].every(k=>request[k] && c[k]===request[k]) && Number.isFinite(timestamp(c)) && Math.abs(timestamp(c)-timestamp(request))<=1500)
  const confidence = unique.length===1 ? 'exact' : unique.length>1 ? 'ambiguous' : possible.length===1 ? 'probable' : possible.length>1 ? 'ambiguous' : 'unmatched'
  const out = {correlationConfidence:confidence,candidateCount:unique.length || possible.length}
  // Probable attribution must never lend a different case's business evidence.
  if (confidence==='exact') {
    const c=unique[0]
    for(const k of ['traceId','caseRunId','stepIndex','operation','transportMode']) if(c[k]!==undefined)out[k]=c[k]
    if(c.requestId)out.applicationRequestId=c.requestId
  }
  return out
}

/** Ephemeral source metadata only. No source text or executable action is retained. */
export function createSourceIndex(options = {}) {
  const scripts = new Map()
  const maxScripts = Math.min(32,Math.max(1,options.maxScripts ?? 32))
  const maxCalls = Math.min(512,Math.max(1,options.maxCalls ?? 512))
  let generation=0
  const key = s=>JSON.stringify([s.sessionId,s.targetId,s.scriptId,s.scriptHash])
  const count = ()=>[...scripts.values()].reduce((n,s)=>n+s.calls.length,0)
  function addScript(script) {
    if(script.generation!==undefined && script.generation!==generation)return false
    if(!['sessionId','targetId','scriptId'].every(k=>typeof script[k]==='string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(script[k])) || !/^[a-f0-9]{8,64}$/.test(script.scriptHash??''))return false
    const startLine=script.startLine??0,startColumn=script.startColumn??0
    if(![startLine,startColumn].every(n=>Number.isSafeInteger(n) && n>=0 && n<=1e9))return false
    const calls=(script.calls??[]).slice(0,maxCalls).map(c=>{
      // Babel lines are one-based relative to source. CDP script offsets are
      // zero-based in the containing document; only its first line is indented.
      const local=c.location??{}
      const location=Number.isSafeInteger(local.line) && local.line>=1 && Number.isSafeInteger(local.column) && local.column>=0
        ? {line:local.line+startLine,column:local.column+(local.line===1?startColumn:0)} : {}
      const locationAnchors=(Array.isArray(c.locationAnchors)?c.locationAnchors:[]).slice(0,3).filter(p=>Number.isSafeInteger(p?.line) && p.line>=1 && p.line<=1e9 && Number.isSafeInteger(p.column) && p.column>=0 && p.column<=1e9).map(p=>({line:p.line+startLine,column:p.column+(p.line===1?startColumn:0)}))
      const safe=sanitizeTraceEvent({version:1,timestamp:'1970-01-01T00:00:00Z',source:'cdp',phase:'protocol.analyzed',astCallType:c.kind,astConfidence:c.confidence,sourceComponent:c.source,form:c.form,process:c.process,update:c.update,event:c.event,parameterNames:c.parameterNames,unresolvedReasons:c.unresolvedReasons,sourceLocation:{...location,scriptId:script.scriptId,scriptHash:script.scriptHash}})
      return {kind:safe?.astCallType,confidence:safe?.astConfidence??'unresolved',source:safe?.sourceComponent,form:safe?.form,process:safe?.process,update:safe?.update,event:safe?.event,parameterNames:safe?.parameterNames,location:safe?.sourceLocation,locationAnchors,sourceLayer:c.sourceLayer??0}
    }).filter(c=>c.location && Number.isInteger(c.location.line) && Number.isInteger(c.location.column))
    scripts.delete(key(script))
    scripts.set(key(script),{sessionId:script.sessionId,targetId:script.targetId,scriptId:script.scriptId,scriptHash:script.scriptHash,urlPath:safePath(script.urlPath),calls})
    while(scripts.size>maxScripts || count()>maxCalls)scripts.delete(scripts.keys().next().value)
    return true
  }
  function lookup(request) {
    const location=request.sourceLocation??request.initiator??{}
    const path=safePath(location.urlPath??location.url)
    const candidates=[...scripts.values()].filter(s=>request.sessionId && s.sessionId===request.sessionId && request.targetId && s.targetId===request.targetId &&
      (!location.scriptId || s.scriptId===location.scriptId) && (!location.scriptHash || s.scriptHash===location.scriptHash) &&
      (location.scriptId || location.scriptHash || path && path===s.urlPath))
    const matches=candidates.flatMap(s=>s.calls.filter(c=>[c.location,...c.locationAnchors].some(p=>p.line===location.line && p.column===location.column)).map(c=>({...c,scriptId:s.scriptId,scriptHash:s.scriptHash})))
    const verified=!!(location.scriptId || location.scriptHash)
    const astConfidence=matches.length>1?'ambiguous':matches.length===0?'unmatched':matches[0].sourceLayer>0 || matches[0].confidence!=='static'?'unresolved':verified?'exact':'probable'
    return {astConfidence:matches.length===1?matches[0].confidence:'unresolved',astCorrelationConfidence:astConfidence==='unresolved'?'unmatched':astConfidence,correlationConfidence:'unmatched',matches,reasons:astConfidence==='exact'?[]:[matches.length>1?'multiple_calls':!matches.length?'source_location_missing':!verified?'script_identity_missing':'dynamic_or_decoded_call']}
  }
  return {addScript,lookup,clear(){scripts.clear();generation++},status(){return {generation,scripts:scripts.size,calls:count()}}}
}

