import {analyzeJavaScript} from './ast/analyzer.mjs'
import {sanitizeTraceEvent} from './schema.mjs'
import {parseJsfPartialResponse} from './protocol/jsf-partial-response.mjs'
import {structuralSnapshot} from './protocol'
import type {TraceEvent} from './trace'

/** Offline analysis only: detached documents and static AST. No executor or network imports. */
export function analyzeOfflineFixture(input:{version:1;kind:'html'|'xml'|'javascript'|'receipt';content:string}):TraceEvent[]{
 if(input.version!==1||typeof input.content!=='string'||input.content.length>262144)throw new Error('FIXTURE_LIMIT')
 const base={version:1,source:'fixture',timestamp:new Date().toISOString(),correlationConfidence:'unmatched'}
 let records:unknown[]=[]
 if(input.kind==='html'){
  // Template contents stay inert, including img/iframe/style resource loads.
  const template=document.createElement('template');template.innerHTML=input.content
  records=[{...base,phase:'dom.updated',after:structuralSnapshot(template.content,'',false),businessStatus:'unknown'}]
 }else if(input.kind==='xml'){
  const e=parseJsfPartialResponse(input.content,{mime:'text/xml'})
  records=[{...base,phase:'jsf.parsed',...e,domStatus:'expected_only',domEvidenceSource:'expected_protocol',businessStatus:'unknown'}]
 }else if(input.kind==='javascript'){
  const result=analyzeJavaScript(input.content)
  records=result.calls.map(call=>({...base,phase:'protocol.analyzed',astCallType:call.kind,sourceComponent:call.source,form:call.form,process:call.process,update:call.update,event:call.event,parameterNames:call.parameterNames,astConfidence:call.confidence,protocolFingerprint:result.fingerprint,sourceLocation:{scriptHash:result.scriptHash,line:call.location.line,column:call.location.column},evidenceCodes:['PROTOCOL_STATIC']}))
  if(!records.length)records=[{...base,phase:'protocol.analyzed',protocolFingerprint:result.fingerprint,astConfidence:'unresolved',evidenceCodes:['PROTOCOL_UNRESOLVED']}]
 }else if(input.kind==='receipt'){
  const value:unknown=JSON.parse(input.content)
  if(!value||typeof value!=='object'||!('ok'in value)||typeof value.ok!=='boolean')throw new Error('INVALID_RECEIPT')
  records=[{...base,phase:'business.validated',businessStatus:value.ok?'unknown':'rejected',certainty:value.ok?'unknown':'rejected',evidenceCodes:['PAGE_RECEIPT_ONLY']}]
 }else throw new Error('UNSUPPORTED_FIXTURE')
 return records.flatMap(raw=>{const event=sanitizeTraceEvent(raw);return event?[event]:[]})
}
