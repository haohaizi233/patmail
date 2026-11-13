import { sanitizeTraceEvent } from './schema.mjs'
/** Offline-only adapter. Does not execute business operations or infer case ownership. */
export function observerEventsToTraces(records) {
 const result=[]
 for(const r of (Array.isArray(records)?records:[]).slice(0,20000)) {
  if(!r||typeof r!=='object')continue
  if(r.version===1){const safe=sanitizeTraceEvent(r);if(safe)result.push(safe);continue}
  if(r.kind==='hague.trace'){const safe=sanitizeTraceEvent(r);if(safe)result.push(safe);continue}
  if(r.source!=='hague'||!['network.request','network.response','network.finished','network.failure'].includes(r.kind))continue
  const failed=r.kind==='network.failure',response=r.kind==='network.response',finished=r.kind==='network.finished'
  const mime=String(r.mime??'')
  const associated = ['exact','probable'].includes(r.correlationConfidence) && r.traceId && r.caseRunId && r.applicationRequestId
  const ownership = associated ? {traceId:r.traceId,caseRunId:r.caseRunId,stepIndex:r.stepIndex,operation:r.operation,transportMode:r.transportMode,requestId:r.applicationRequestId} : {}
  const event=sanitizeTraceEvent({version:1,source:'cdp',phase:response?'http.response':'request.dispatched',timestamp:r.ts,
   ...ownership,cdpRequestId:r.requestId,targetId:r.targetId,sessionId:r.sessionId,frameId:r.frameId,httpMethod:r.httpMethod,urlPath:r.origin==='https://hague.wipo.int'?r.path:undefined,
   httpStatus:response||finished||failed?(r.httpStatus??r.status??null):undefined,
   transportStatus:failed?(r.failureCategory==='timeout'?'timeout':r.failureCategory==='cancelled'?'aborted':'network_error'):response||finished?'completed':'dispatched',
   responseType:/xml/.test(mime)?'xml':/html/.test(mime)?'html':/json/.test(mime)?'json':'unknown',
   durationMs:r.elapsedMs,encodedBytes:r.bytes,redirectCount:Array.isArray(r.redirects)?r.redirects.length:0,
   redirectPaths:Array.isArray(r.redirects)?r.redirects.filter(v=>v?.origin==='https://hague.wipo.int').map(v=>v.path):[],
   correlationConfidence:associated?r.correlationConfidence:r.correlationConfidence==='ambiguous'?'ambiguous':'unmatched',sourceLocation:r.sourceLocation,protocolStatus:'not_observed',businessStatus:'unknown',certainty:'unknown',
   ...(failed?{errorCode:r.failureCategory==='timeout'?'NETWORK_TIMEOUT':r.failureCategory==='cancelled'?'NETWORK_ABORTED':'NETWORK_FAILED',errorStage:'transport'}:{})})
  if(event)result.push(event)
 }
 return result
}
