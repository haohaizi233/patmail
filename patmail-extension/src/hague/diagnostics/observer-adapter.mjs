import { sanitizeTraceEvent,stableHash } from './schema.mjs'
/** Offline-only adapter. Does not execute business operations or infer case ownership. */
export function observerEventsToTraces(records) {
 const result=[]
 for(const r of (Array.isArray(records)?records:[]).slice(0,20000)) {
  if(!r||typeof r!=='object')continue
  if(r.version===1){const safe=sanitizeTraceEvent(r);if(safe)result.push(safe);continue}
  if(r.kind==='hague.trace'){const safe=sanitizeTraceEvent(r);if(safe)result.push(safe);continue}
  if(r.source!=='hague'||!['network.request','network.response','network.finished','network.failure'].includes(r.kind))continue
  const failed=r.kind==='network.failure',response=r.kind==='network.response',finished=r.kind==='network.finished'
  const mime=String(r.mime??''),status=r.httpStatus??r.status
  const httpFailure=Number.isInteger(status)&&status>=400&&status<=599
  const associated = r.correlationConfidence==='exact' && r.traceId && r.caseRunId && r.applicationRequestId
  const ownership = associated ? {traceId:r.traceId,caseRunId:r.caseRunId,stepIndex:r.stepIndex,operation:r.operation,transportMode:r.transportMode,requestId:r.applicationRequestId} : {}
  const event=sanitizeTraceEvent({version:1,source:'cdp',phase:response?'http.response':finished?'request.finished':failed?'request.failed':'request.dispatched',timestamp:r.ts,
   ...ownership,cdpRequestId:r.requestId,targetId:r.targetId,sessionId:r.sessionId,frameId:r.frameId,httpMethod:r.httpMethod,urlPath:r.origin==='https://hague.wipo.int'?r.path:undefined,
   httpStatus:response||finished||failed?(r.httpStatus??r.status??null):undefined,
   transportStatus:failed?(r.failureCategory==='timeout'?'timeout':r.failureCategory==='cancelled'?'aborted':'network_error'):response||finished?'completed':'dispatched',
   responseType:/xml/.test(mime)?'xml':/html/.test(mime)?'html':/json/.test(mime)?'json':'unknown',
   durationMs:r.elapsedMs,encodedBytes:r.bytes,redirectCount:Array.isArray(r.redirects)?r.redirects.length:0,
   redirectPaths:Array.isArray(r.redirects)?r.redirects.filter(v=>v?.origin==='https://hague.wipo.int').map(v=>v.path):[],
   correlationConfidence:associated?'exact':['probable','ambiguous'].includes(r.correlationConfidence)?r.correlationConfidence:'unmatched',candidateCount:r.candidateCount,sourceLocation:r.sourceLocation,protocolStatus:'not_observed',businessStatus:'unknown',certainty:'unknown',
   ...(httpFailure&&!failed?{errorCode:`HTTP_${status}`,errorStage:'http'}:{}),
   ...(failed?{errorCode:r.failureCategory==='timeout'?'NETWORK_TIMEOUT':r.failureCategory==='cancelled'?'NETWORK_ABORTED':'NETWORK_FAILED',errorStage:'transport'}:{})})
  if(event){if(!event.eventId)event.eventId='event-'+stableHash(JSON.stringify(event));result.push(event)}
 }
 return result
}
