import {describe,it,expect} from 'vitest'
import {createSourceIndex,correlateRequest} from '../../../src/hague/diagnostics/correlation/correlator.mjs'
import {analyzeEvidence} from '../../../src/hague/diagnostics/evidence/evidence-model.mjs'
import {analyzeJavaScript} from '../../../src/hague/diagnostics/ast/analyzer.mjs'
const scope={sessionId:'12345678',targetId:'23456789',frameId:'34567890',traceId:'trace-one',caseRunId:'case-one',requestId:'req-one',stepIndex:0}
const event=(phase:string,extra:Record<string,unknown>={})=>({version:1,source:'application',timestamp:'2026-11-14T00:00:00Z',phase,...scope,...extra})
describe('research source index',()=>{
 it('matches only explicit callee/property token anchors with inline offsets',()=>{
  const source="function action(){return PrimeFaces.ab({s:'designForm:save'})}"
  const analysis=analyzeJavaScript(source)
  const index=createSourceIndex()
  index.addScript({...scope,scriptId:'12',scriptHash:analysis.scriptHash,startColumn:8,calls:analysis.calls})
  const property=source.indexOf('.ab')+1+8
  const lookup=(column:number)=>index.lookup({...scope,sourceLocation:{scriptId:'12',line:1,column}})
  expect(lookup(property).astCorrelationConfidence).toBe('exact')
  expect(lookup(property+1).astCorrelationConfidence).toBe('unmatched')
  expect(lookup(property-1).astCorrelationConfidence).toBe('unmatched')
  index.addScript({...scope,scriptId:'12',scriptHash:analysis.scriptHash,startColumn:8,calls:[analysis.calls[0],analysis.calls[0]]})
  expect(lookup(property).astCorrelationConfidence).toBe('ambiguous')
 })
 it('retains only sanitized protocol metadata needed to explain an edge',()=>{
  const index=createSourceIndex()
  const script={...scope,scriptId:'12',scriptHash:'abcdef12',calls:[{kind:'PrimeFaces.ab',confidence:'static',location:{line:1,column:0},form:'designForm',process:'@this',update:'designForm:save',event:'click',parameterNames:['javax.faces.source'],parameterValues:['PRIVATE_VALUE'],body:'PRIVATE_BODY'}]}
  index.addScript(script)
  const result=index.lookup({...scope,sourceLocation:{scriptId:'12',line:1,column:0}})
  expect(result.matches[0]).toMatchObject({form:'designForm',process:'@this',update:'designForm:save',event:'click',parameterNames:['javax.faces.source']})
  expect(JSON.stringify(result)).not.toContain('PRIVATE_')
 })
 it('applies inline document offsets and never matches the wrong relative point',()=>{
  const index=createSourceIndex()
  const script={...scope,scriptId:'12',scriptHash:'abcdef12',startLine:100,startColumn:20,calls:[
   {kind:'PrimeFaces.ab',confidence:'static',source:'designForm:save',location:{line:1,column:8}},
   {kind:'PrimeFaces.ab',confidence:'static',source:'designForm:close',location:{line:101,column:8}}
  ]}
  expect(index.addScript(script)).toBe(true)
  const lookup=(line:number,column:number)=>index.lookup({...scope,sourceLocation:{scriptId:'12',line,column}})
  expect(lookup(101,28)).toMatchObject({astCorrelationConfidence:'exact',matches:[{source:'designForm:save'}]})
  expect(lookup(201,8)).toMatchObject({astCorrelationConfidence:'exact',matches:[{source:'designForm:close'}]})
  expect(lookup(101,8).astCorrelationConfidence).toBe('unmatched')
  expect(lookup(1,8).astCorrelationConfidence).toBe('unmatched')
  for(const offset of [-1,0.5,Infinity,NaN,1e9+1])expect(index.addScript({...script,startLine:offset})).toBe(false)
  expect(index.addScript({...script,startColumn:-1})).toBe(false)
 })
 it('separates source exactness from application ownership and clears generations',()=>{
  const index=createSourceIndex()
  const script={sessionId:scope.sessionId,targetId:scope.targetId,scriptId:'12',scriptHash:'abcdef12',calls:[{kind:'PrimeFaces.ab',confidence:'static',location:{line:1,column:8}}]}
  expect(index.addScript(script)).toBe(true)
  const request={...scope,sourceLocation:{scriptId:'12',line:1,column:8}}
  expect(index.lookup(request)).toMatchObject({astCorrelationConfidence:'exact',astConfidence:'static',correlationConfidence:'unmatched'})
  expect(index.lookup({...request,sessionId:'87654321'}).astCorrelationConfidence).toBe('unmatched')
  expect(index.lookup({...request,sourceLocation:{scriptId:'12',scriptHash:'bad',line:1,column:8}}).astCorrelationConfidence).toBe('unmatched')
  index.clear();expect(index.status().calls).toBe(0);expect(index.addScript({...script,generation:0})).toBe(false)
 })
 it('reports multiple calls and dynamic/decoded calls without claiming exact',()=>{
  const index=createSourceIndex()
  const script={sessionId:scope.sessionId,targetId:scope.targetId,scriptId:'12',scriptHash:'abcdef12'}
  const call={kind:'PrimeFaces.ab',confidence:'static',location:{line:1,column:8}}
  index.addScript({...script,calls:[call,call]})
  expect(index.lookup({...scope,sourceLocation:{scriptId:'12',line:1,column:8}}).astCorrelationConfidence).toBe('ambiguous')
  index.addScript({...script,calls:[{...call,confidence:'unresolved'}]})
  expect(index.lookup({...scope,sourceLocation:{scriptId:'12',line:1,column:8}}).astCorrelationConfidence).toBe('unmatched')
 })
 it('bounds scripts and calls',()=>{
  const index=createSourceIndex({maxScripts:2,maxCalls:2})
  for(let i=0;i<4;i++)index.addScript({...scope,scriptId:String(i),scriptHash:'abcdef12',calls:[{kind:'PrimeFaces.ab',confidence:'static',location:{line:1,column:0}}]})
  expect(index.status()).toMatchObject({scripts:2,calls:2})
 })
 it('rejects direct conflicts and never turns clock proximity into exact',()=>{
  const r={...scope,httpMethod:'POST',urlPath:'/HagueEFilingWeb/protected/page/application.xhtml',timestamp:1000}
  expect(correlateRequest(r,[{...r,caseRunId:'case-other'}]).correlationConfidence).toBe('unmatched')
  const {requestId:_requestId,...candidate}=r
  expect(correlateRequest(r,[candidate]).correlationConfidence).toBe('probable')
  expect(correlateRequest(r,[r]).correlationConfidence).toBe('exact')
 })
})
describe('research evidence boundaries',()=>{
 it('explains observed HTTP, update counts and AST edge without increasing certainty',()=>{
  const result=analyzeEvidence([event('http.response',{httpStatus:500}),event('jsf.parsed',{protocolStatus:'valid',updateCount:0}),event('correlation.resolved',{astCallType:'PrimeFaces.ab',astCorrelationConfidence:'probable'})],scope)
  expect(result.explanation).toContain('HTTP 状态码：500')
  expect(result.explanation).toContain('JSF update 数量：0')
  expect(result.explanation).toContain('PrimeFaces.ab / probable')
  expect(result.CERTAINTY).toBe('unknown')
  expect(analyzeEvidence([],scope).explanation).not.toContain('JSF update 数量')
 })
 it('keeps request completion independent from HTTP and business results',()=>{
  expect(analyzeEvidence([event('request.finished'),event('http.response',{httpStatus:500})],scope).layers).toMatchObject({REQUEST:'finished',HTTP:'failed',BUSINESS:'unconfirmed'})
  expect(analyzeEvidence([event('request.dispatched'),event('http.response',{httpStatus:200})],scope).REQUEST).toBe('dispatched')
  expect(analyzeEvidence([event('request.failed'),event('http.response',{httpStatus:200})],scope).layers).toMatchObject({REQUEST:'failed',HTTP:'completed'})
 })
 it('reports explicit same-count observations only within their observed fields',()=>{
  const real=event('dom.observed',{documentId:'45678901',domEvidenceSource:'page_receipt',domPreviousCounts:{designs:2},domCounts:{designs:2}})
  expect(analyzeEvidence([real],scope).DOM).toBe('observed_unchanged')
  expect(analyzeEvidence([real],scope).explanation).toContain('仅覆盖已明确观测的数值字段')
  expect(analyzeEvidence([{...real,domEvidenceSource:'application_model'}],scope).DOM).toBe('application_model')
  expect(analyzeEvidence([{...real,domPreviousCounts:{}}],scope).DOM).toBe('not_observed')
 })
 it('reports JSF protocol redirect without promoting business certainty',()=>{
  expect(analyzeEvidence([event('jsf.parsed',{protocolStatus:'redirect',redirectDetected:true})],scope).layers).toMatchObject({JSF_PROTOCOL:'redirect',BUSINESS:'unconfirmed',CERTAINTY:'unknown'})
 })
 it('never borrows application authority through probable or legacy CDP attribution',()=>{
  const app=event('business.validated',{businessStatus:'confirmed',evidenceCodes:['BUSINESS_RECEIPT_VERIFIED']})
  const native=event('request.dispatched',{source:'cdp',cdpRequestId:'123.1'})
  for(const correlationConfidence of ['probable','ambiguous','unmatched',undefined]) {
   const request={...native,correlationConfidence}
   expect(analyzeEvidence([request,app],request).BUSINESS).toBe('unconfirmed')
   expect(analyzeEvidence([request,app],{...request,requestId:undefined,cdpRequestId:undefined}).BUSINESS).toBe('unconfirmed')
  }
  const exact={...native,correlationConfidence:'exact'}
  expect(analyzeEvidence([exact,app],exact).BUSINESS).toBe('completed')
  expect(analyzeEvidence([exact,app],{...exact,source:undefined}).BUSINESS).toBe('unconfirmed')
  expect(analyzeEvidence([exact,{...app,sessionId:undefined}],exact).BUSINESS).toBe('unconfirmed')
  expect(analyzeEvidence([exact,{...app,sessionId:'87654321'}],exact).BUSINESS).toBe('unconfirmed')
  expect(analyzeEvidence([exact,{...app,caseRunId:'case-other'}],exact).BUSINESS).toBe('unconfirmed')
  expect(analyzeEvidence([app],{traceId:scope.traceId,caseRunId:scope.caseRunId,stepIndex:0}).BUSINESS).toBe('completed')
 })
 it('does not infer business success from HTTP200/XML/ViewState/legacy completion',()=>{
  const result=analyzeEvidence([event('request.dispatched'),event('http.response',{httpStatus:200}),event('jsf.parsed',{protocolStatus:'valid',updateCount:2,viewStateChanged:true}),event('step.completed',{businessStatus:'completed',certainty:'confirmed'})])
  expect(result.layers).toMatchObject({HTTP:'completed',JSF_PROTOCOL:'valid',DOM:'expected_only',BUSINESS:'unconfirmed',CERTAINTY:'unknown'})
 })
 it('is invariant under order and does not borrow another request or case',()=>{
  const events=[event('http.response',{httpStatus:200}),event('business.validated',{requestId:'req-other',businessStatus:'confirmed',evidenceCodes:['DRAFT_LIST_MATCHED']})]
  expect(analyzeEvidence(events,scope).BUSINESS).toBe('unconfirmed')
  expect(analyzeEvidence([...events].reverse(),scope)).toEqual(analyzeEvidence(events,scope))
  expect(analyzeEvidence([event('business.validated',{caseRunId:'case-other',businessStatus:'confirmed',evidenceCodes:['DRAFT_LIST_MATCHED']})],scope).BUSINESS).toBe('unconfirmed')
 })
 it('accepts only an explicit authoritative receipt',()=>{
  expect(analyzeEvidence([event('business.validated',{businessStatus:'confirmed',evidenceCodes:['DRAFT_LIST_MATCHED']})],scope).BUSINESS).toBe('completed')
  expect(analyzeEvidence([event('business.validated',{businessStatus:'confirmed',evidenceCodes:['REFERENCE_MATCHED']})],scope).BUSINESS).toBe('unconfirmed')
 })
 it('leaves absent observations unknown',()=>{
  expect(analyzeEvidence([]).layers).toMatchObject({REQUEST:'not_observed',HTTP:'not_observed',DOM:'not_observed',BUSINESS:'unconfirmed',CERTAINTY:'unknown'})
 })
 it('distinguishes model DOM, real counts, and missing counts',()=>{
  const change={documentId:'45678901',before:{designs:0},after:{designs:1}}
  expect(analyzeEvidence([event('dom.updated',{...change,domEvidenceSource:'application_model'})],scope).DOM).toBe('application_model')
  expect(analyzeEvidence([event('dom.observed',{...change,domEvidenceSource:'browser_observed'})],scope).DOM).toBe('observed_changed')
  expect(analyzeEvidence([event('dom.observed',{documentId:'45678901',after:{designs:1},domEvidenceSource:'browser_observed'})],scope).DOM).toBe('not_observed')
  expect(analyzeEvidence([event('dom.observed',{...change,domEvidenceSource:'browser_observed'})],{...scope,documentId:'56789012'}).DOM).toBe('not_observed')
 })
 it('does not borrow deferred JSF evidence from a different session or CDP request',()=>{
  const req=event('request.dispatched',{source:'cdp',traceId:undefined,caseRunId:undefined,requestId:undefined,cdpRequestId:'99'})
  const xml=event('jsf.parsed',{source:'cdp',traceId:undefined,caseRunId:undefined,requestId:undefined,cdpRequestId:'99',protocolStatus:'valid',updateCount:2})
  expect(analyzeEvidence([xml,req],req).JSF_PROTOCOL).toBe('valid')
  expect(analyzeEvidence([req,{...xml,sessionId:'87654321'}],req).JSF_PROTOCOL).toBe('not_observed')
  expect(analyzeEvidence([req,{...xml,cdpRequestId:'100'}],req).JSF_PROTOCOL).toBe('not_observed')
 })
})
