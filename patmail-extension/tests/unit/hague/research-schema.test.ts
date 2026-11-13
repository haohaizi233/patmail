import {expect,it} from 'vitest'
import {sanitizeTraceEvent} from '../../../src/hague/diagnostics/schema.mjs'
it('preserves additive research evidence and all AST kinds without leaking raw values',()=>{
 const raw={version:1,source:'cdp',phase:'research.status',timestamp:'2026-11-14T00:00:00Z',eventId:'event-12345678',mode:'research',researchState:'enabled',observerState:'connected',stats:{observedRequests:2,parsedResponses:1,queuedAnalyses:0,secret:'PRIVATE'},bodyStatus:'body_available',domStatus:'expected_only',domEvidenceSource:'expected_protocol',expectedUpdates:['ApplicantForm:save'],attributeCount:1,evalCount:2,extensionCount:1,unknownNodeCount:0,viewStatePresent:true,viewStateTag:'PRIVATE',body:'PRIVATE',loaderId:'12345678'}
 const safe=sanitizeTraceEvent(raw)
 expect(safe).toMatchObject({eventId:'event-12345678',mode:'research',researchState:'enabled',stats:{observedRequests:2,parsedResponses:1,queuedAnalyses:0},bodyStatus:'body_available',domStatus:'expected_only',attributeCount:1,evalCount:2,viewStatePresent:true})
 expect(JSON.stringify(safe)).not.toContain('PRIVATE')
 for(const astCallType of ['PrimeFaces.ab','PrimeFaces.cw','mojarra.ab','mojarra.jsfcljs','jsf.ajax.request','remoteCommand','widget','fileUpload','dataTable'])expect(sanitizeTraceEvent({...raw,phase:'protocol.analyzed',astCallType})?.astCallType).toBe(astCallType)
 expect(sanitizeTraceEvent({...raw,timestamp:undefined})).toBeNull()
})
it('separates application-model DOM from real observations and keeps scoped secrets out',()=>{
 const safe=sanitizeTraceEvent({version:1,source:'application',phase:'dom.observed',timestamp:new Date().toISOString(),traceId:'trace-12345678',caseRunId:'case-12345678',domEvidenceSource:'application_model',domStatus:'model_changed',domCounts:{applicants:2,address:'PRIVATE'},domPreviousCounts:{applicants:1},evidenceCodes:['BUSINESS_RECEIPT_VERIFIED','PRIVATE'],scopedViewStateDigest:'PRIVATE',stateKey:'PRIVATE'})
 expect(safe).toMatchObject({domStatus:'model_changed',domEvidenceSource:'application_model',domCounts:{applicants:2},domPreviousCounts:{applicants:1},evidenceCodes:['BUSINESS_RECEIPT_VERIFIED']})
 expect(JSON.stringify(safe)).not.toContain('PRIVATE')
})
