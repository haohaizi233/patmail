import { sanitizeTraceEvent } from '../schema.mjs'

const identityKeys=['sessionId','targetId','frameId','documentId','traceId','caseRunId','requestId','cdpRequestId','stepIndex']
const conflict=(a,b)=>identityKeys.some(k=>a[k]!==undefined && b[k]!==undefined && a[k]!==b[k])
const countKeys=['applicants','creators','priorities','designs','reproductions']

function sameRequest(a,b) {
  if(conflict(a,b))return false
  if((a.source==='cdp' && b.source==='application') || (b.source==='cdp' && a.source==='application')) {
    const native=a.source==='cdp'?a:b,app=a.source==='application'?a:b
    // Legacy logs may contain application ownership guessed from timestamps.
    // Never promote that guess into a business receipt edge during replay.
    if(native.correlationConfidence!=='exact' || !native.sessionId || app.sessionId!==native.sessionId)return false
    const directNative=native.cdpRequestId && app.cdpRequestId===native.cdpRequestId
    const directApp=(native.applicationRequestId??native.requestId) && (native.applicationRequestId??native.requestId)===app.requestId && native.traceId && native.traceId===app.traceId && native.caseRunId && native.caseRunId===app.caseRunId
    return !!(directNative || directApp)
  }
  if(a.cdpRequestId && a.cdpRequestId===b.cdpRequestId && a.sessionId && a.sessionId===b.sessionId)return true
  return !!(a.requestId && a.requestId===b.requestId && a.traceId && a.traceId===b.traceId && a.caseRunId && a.caseRunId===b.caseRunId)
}

/** Pure structural reducer. Input is sanitized again at the trust boundary. */
export function analyzeEvidence(input = [], selector) {
  const originals=new Map()
  let events=input.map(raw=>{const safe=sanitizeTraceEvent(raw);if(safe)originals.set(safe,raw);return safe}).filter(Boolean)
  // Stable anchoring also makes out-of-order delivery deterministic.
  events.sort((a,b)=>JSON.stringify(identityKeys.map(k=>a[k]??null)).localeCompare(JSON.stringify(identityKeys.map(k=>b[k]??null))) || a.phase.localeCompare(b.phase))
  const requests=events.filter(e=>['request.dispatched','request.prepared','request.finished','request.failed','http.response'].includes(e.phase))
  // A CDP request selector stripped of provenance cannot claim an exact edge.
  const anchor=selector?.cdpRequestId && !selector.source ? {...selector,source:'cdp',correlationConfidence:undefined} : selector??requests[0]??events[0]
  if(anchor)events=events.filter(e=>e===anchor || sameRequest(anchor,e) ||
    // Case/step summaries may stand alone; request-scoped reports require an explicit request edge.
    (!anchor.requestId && !anchor.cdpRequestId && e.source!=='cdp' && anchor.source!=='cdp' && !conflict(anchor,e) && anchor.traceId && e.traceId===anchor.traceId && anchor.caseRunId && e.caseRunId===anchor.caseRunId && anchor.stepIndex!==undefined && e.stepIndex===anchor.stepIndex))
  const dispatched=events.some(e=>e.phase==='request.dispatched')
  const finished=events.some(e=>e.phase==='request.finished')
  const http=events.filter(e=>e.phase==='http.response')
  const failed=events.some(e=>e.phase==='request.failed' || ['network_error','timeout','aborted','rpc_error'].includes(e.transportStatus))
  const protocol=events.filter(e=>e.phase==='jsf.parsed')
  const protocolFailure=protocol.some(e=>['invalid_xml','jsf_error','jsf_validation_failed','invalid_mime','html','empty'].includes(e.protocolStatus) || e.jsfError || e.validationFailed)
  const valid=protocol.some(e=>e.protocolStatus==='valid')
  const redirect=protocol.some(e=>e.protocolStatus==='redirect')
  const expected=protocol.some(e=>e.updateCount>0 || e.updatedComponents?.length || e.expectedUpdates?.length)
  const dom=events.filter(e=>['dom.updated','dom.observed'].includes(e.phase))
  // The sanitizer fills omitted counters with zero; require counters explicitly present in raw input too.
  const observations=dom.flatMap(e=>{
    const raw=originals.get(e)
    if(!['browser_observed','page_receipt'].includes(e.domEvidenceSource) || !e.documentId || raw.documentId!==e.documentId)return []
    const before=raw.before??raw.domPreviousCounts,after=raw.after??raw.domCounts
    const counts=countKeys.filter(k=>Number.isSafeInteger(before?.[k]) && before[k]>=0 && Number.isSafeInteger(after?.[k]) && after[k]>=0)
    return counts.length ? [{changed:counts.some(k=>before[k]!==after[k])}] : []
  })
  const observed=observations.length>0
  const validated=events.some(e=>e.source==='application' && e.phase==='business.validated' && ['confirmed','completed'].includes(e.businessStatus) && e.evidenceCodes?.some(c=>['BUSINESS_RECEIPT_VERIFIED','DRAFT_LIST_MATCHED'].includes(c)))
  const rejected=events.some(e=>e.phase==='business.validated' && e.businessStatus==='rejected')
  const layers={REQUEST:failed?'failed':finished?'finished':dispatched?'dispatched':'not_observed',HTTP:http.some(e=>e.httpStatus>=400)?'failed':http.some(e=>e.httpStatus>=200 && e.httpStatus<300)?'completed':http.length?'observed':'not_observed',JSF_PROTOCOL:protocolFailure?'failed':redirect?'redirect':valid?'valid':protocol.length?'unrecognized':'not_observed',DOM:observed?(observations.some(o=>o.changed)?'observed_changed':'observed_unchanged'):dom.some(e=>e.domEvidenceSource==='application_model')?'application_model':expected?'expected_only':'not_observed',BUSINESS:rejected?'rejected':validated?'completed':'unconfirmed',CERTAINTY:rejected?'rejected':validated?'confirmed':'unknown'}
  const missingEvidence=[]
  if(!dispatched)missingEvidence.push('请求派发证据缺失')
  if(!http.length)missingEvidence.push('HTTP 响应证据缺失')
  if(!valid)missingEvidence.push('有效 JSF 协议证据缺失')
  if(!observed)missingEvidence.push('同文档真实 DOM 前后变化证据缺失')
  if(!validated)missingEvidence.push('权威业务回执证据缺失')
  const codes=[...new Set(http.flatMap(e=>Number.isInteger(e.httpStatus)?[e.httpStatus]:[]))].sort((a,b)=>a-b)
  const updateCounts=[...new Set(protocol.flatMap(e=>Number.isInteger(e.updateCount)?[e.updateCount]:[]))].sort((a,b)=>a-b)
  const ast=[...new Set(events.filter(e=>e.astCallType || e.astCorrelationConfidence).map(e=>`${e.astCallType??'调用类型未采集'} / ${e.astCorrelationConfidence??'源码关联置信度未采集'}`))].sort()
  const facts=[codes.length?`HTTP 状态码：${codes.join('、')}。`:'',updateCounts.length?`JSF update 数量：${updateCounts.join('、')}。`:'',ast.length?`AST：${ast.join('；')}。`:''].join('')
  const explanation=`请求：${layers.REQUEST}；HTTP：${layers.HTTP}；JSF 协议：${layers.JSF_PROTOCOL}；DOM：${layers.DOM}；业务：${layers.BUSINESS}；确定性：${layers.CERTAINTY}。${facts}${observed?'DOM 结论仅覆盖已明确观测的数值字段。':''}${missingEvidence.length?missingEvidence.join('；')+'。':'权威业务回执已验证。'}`
  return {layers,...layers,missingEvidence,explanation,eventCount:events.length}
}
export const buildRequestEvidence=analyzeEvidence
