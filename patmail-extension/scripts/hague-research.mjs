import { randomUUID } from 'node:crypto'
import { parseJsfRequest } from '../src/hague/diagnostics/protocol/jsf-partial-response.mjs'
import { AnalysisWorker } from './hague-research-broker.mjs'
const MAX=256*1024
export class HagueResearchDiagnostics {
 constructor(deep,send,log,{worker=new AnalysisWorker(),now=Date.now}={}) {Object.assign(this,{deep,send,log,worker,now});this.mode='basic';this.intent=0;this.generation=0;this.requests=new Map();this.queue=[];this.peakQueuedBodies=0;this.dropped=0;this.observedRequests=0;this.bodyReads=0;this.correlations={exactCorrelations:0,probableCorrelations:0,ambiguousCorrelations:0,unmatchedEvents:0};this.peakAnalyses=0;this.worker.onCapacity=()=>this.drain();this.active=new Set();this.busy=0;this.bytes=0;this.counts={admitted:0,available:0,unavailable:0,tooLarge:0,unsupported:0,parseFailed:0}}
 status(){this.peakAnalyses=Math.max(this.peakAnalyses,(this.worker.pending?.size??0)+this.queue.length);return {...this.deep.status(),stats:{...this.worker.sample?.(),...this.correlations,observedRequests:this.observedRequests,bodyReads:this.bodyReads,activeReads:this.busy,queuedAnalyses:(this.worker.pending?.size??0)+this.queue.length,peakQueuedAnalyses:Math.max(this.peakAnalyses,this.worker.stats?.peakQueuedAnalyses??0),skippedAnalyses:this.deep.skipped??0,pendingOutputs:this.outputStatusProvider?.().pending,peakPendingOutputs:this.outputStatusProvider?.().peak,droppedDiagnostics:Math.max(0,(this.outputStatusProvider?.().dropped??0)-(this.outputDroppedAtStart??0))+this.dropped+(this.deep.skipped??0)+(this.worker.stats?.droppedDiagnostics??0)},mode:this.mode,statsScope:this.deep.target?'current_session':'last_session',pendingBodies:this.requests.size,activeBodies:this.busy,bodyBytes:this.bytes,...this.counts}}
 async enable(target,mode='research'){
  const intent=++this.intent
  if(!['research','deep'].includes(mode))throw Error('invalid mode')
  await this.stop();if(intent!==this.intent)return this.status()
  this.resetCounters();await this.deep.enable(target)
  if(intent!==this.intent)return this.status()
  const generation=this.generation
  if(this.deep.target?.sessionId===target.sessionId&&this.deep.target?.targetId===target.targetId){
   try{if(mode==='research')await this.send('Network.enable',{maxTotalBufferSize:1024*1024,maxResourceBufferSize:MAX,maxPostDataSize:4096},target.sessionId)
    if(intent===this.intent&&generation===this.generation&&this.deep.target?.sessionId===target.sessionId&&this.deep.target?.targetId===target.targetId)this.mode=mode
   }catch{if(intent===this.intent&&generation===this.generation){await this.stop();if(intent===this.intent)this.deep.state='unsupported'}}
  }
  if(intent===this.intent)this.emit('research.status',{});return this.status()
 }
 resetCounters(){this.outputDroppedAtStart=this.outputStatusProvider?.().dropped??0;this.observedRequests=0;this.bodyReads=0;this.dropped=0;this.peakAnalyses=0;this.peakQueuedBodies=0;for(const key of Object.keys(this.counts))this.counts[key]=0;for(const key of Object.keys(this.correlations))this.correlations[key]=0;this.worker.resetMetrics?.()}
 disable(){this.intent++;return this.stop()}
 async stop(){this.mode='basic';this.generation++;this.requests.clear();for(const item of this.queue)item.resolve();this.queue=[];this.active.clear();this.busy=0;this.bytes=0;this.worker.clear();await this.deep.disable();this.emit('research.status',{});return this.status()}
 emit(phase,fields){if(phase==='research.status')fields={...fields,researchState:this.deep.state??this.deep.status().state,observerState:this.observerStateProvider?.(),targetId:this.deep.target?.targetId,sessionId:this.deep.target?.sessionId,statsScope:this.deep.target?'current_session':'last_session',stats:this.status().stats};this.log('hague.research',{version:1,eventId:randomUUID(),source:'cdp',phase,timestamp:new Date().toISOString(),operation:'protocol',mode:this.mode,protocolStatus:'not_observed',businessStatus:'unknown',certainty:'unknown',...fields})}
 request(target,sessionId,p){
  if(this.mode==='research'&&this.deep.target?.sessionId===sessionId&&target.targetId===this.deep.target.targetId)this.observedRequests++
  this.prune()
  const key=`${sessionId}:${p.requestId}`;this.requests.delete(key)
  if(this.active.has(key)){this.dropped++;this.emit('analysis.skipped',{analysisKind:'xml',skipReason:'request_reused',bodyStatus:'body_unavailable',sessionId,cdpRequestId:p.requestId});return}
  if(this.mode!=='research'||this.deep.target?.sessionId!==sessionId||target.targetId!==this.deep.target.targetId||this.requests.size>=2048||!p.frameId||!p.loaderId||!['XHR','Fetch'].includes(p.type)||p.request?.method!=='POST'||p.redirectResponse)return
  let url;try{url=new URL(p.request.url)}catch{return}
  if(url.origin!=='https://hague.wipo.int'||url.username||url.password||!/^\/HagueEFilingWeb\/protected\/(?:portfolioManager|page\/(?:application|summary))\.xhtml$/.test(url.pathname))return
  const headers=p.request.headers??{};const mime=Object.entries(headers).find(([k])=>k.toLowerCase()==='content-type')?.[1]??''
  if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(String(mime)))return
  const boundedPost=typeof p.request.postData==='string'&&Buffer.byteLength(p.request.postData)<=4096
  const facesAjax=Object.entries(headers).some(([key,value])=>key.toLowerCase()==='faces-request'&&value==='partial/ajax')
  const parsed=boundedPost?parseJsfRequest({contentType:mime,postData:p.request.postData}):facesAjax?{eligibleAjax:true,requestMetadataStatus:'unsupported',parameterNames:[]}:null
  if(!parsed?.eligibleAjax)return
  this.requests.set(key,{requestId:p.requestId,sessionId,targetId:target.targetId,frameId:p.frameId,loaderId:p.loaderId,at:this.now(),generation:this.generation,urlPath:url.pathname,request:parsed});this.counts.admitted++
  const sourceLocations=(p.initiator?.stack?.callFrames??[]).slice(0,20).filter(frame=>typeof frame.scriptId==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(frame.scriptId)&&Number.isInteger(frame.lineNumber)&&frame.lineNumber>=0&&Number.isInteger(frame.columnNumber)&&frame.columnNumber>=0).map(frame=>({scriptId:frame.scriptId,line:frame.lineNumber+1,column:frame.columnNumber,functionName:typeof frame.functionName==='string'?frame.functionName.slice(0,160):undefined}))
  this.emit('request.dispatched',{sourceComponent:parsed.sourceComponent,form:parsed.form,process:parsed.process,update:parsed.update,parameterNames:parsed.parameterNames,eligibleAjax:parsed.eligibleAjax,isUpload:parsed.isUpload??false,requestMetadataStatus:parsed.requestMetadataStatus,sessionId,targetId:target.targetId,frameId:p.frameId,loaderId:p.loaderId,cdpRequestId:p.requestId,httpMethod:'POST',urlPath:url.pathname,transportStatus:'dispatched'})
  const admitted=this.requests.get(key);void this.worker.analyze('lookup',{sessionId,targetId:target.targetId,frameId:p.frameId,sourceLocations}).then(edge=>{const name={exact:'exactCorrelations',probable:'probableCorrelations',ambiguous:'ambiguousCorrelations',unmatched:'unmatchedEvents'}[edge.astCorrelationConfidence];if(this.valid(admitted)&&name)this.correlations[name]++;if(this.valid(admitted))this.emit('correlation.resolved',{...(edge.matches?.length===1?{astCallType:edge.matches[0].kind,sourceComponent:edge.matches[0].source,form:edge.matches[0].form,process:edge.matches[0].process,update:edge.matches[0].update,event:edge.matches[0].event,parameterNames:edge.matches[0].parameterNames}:{}),astCorrelationConfidence:edge.astCorrelationConfidence,astConfidence:edge.astConfidence,unresolvedReasons:edge.reasons?.map(reason=>({multiple_calls:'multiple_candidates',script_identity_missing:'missing_initiator',dynamic_or_decoded_call:'dynamic_code'}[reason]??reason)),sourceLocation:edge.matches?.length===1?{...edge.matches[0].location,functionName:edge.functionName}:undefined,sessionId,targetId:target.targetId,cdpRequestId:p.requestId})}).catch(()=>{})
 }
 response(sessionId,p){const r=this.requests.get(`${sessionId}:${p.requestId}`);if(!r)return;const response=p.response??{};r.status=response.status;r.mime=String(response.mimeType??'');r.unsupported=!!Object.entries(response.headers??{}).find(([k,v])=>k.toLowerCase()==='content-disposition'&&/attachment/i.test(String(v)));}
 forget(sessionId,p){this.requests.delete(`${sessionId}:${p.requestId}`)}
 bodyCommandAllowed(params,sessionId){const key=`${sessionId}:${params?.requestId}`;const r=this.requests.get(key);return Object.keys(params??{}).length===1&&this.active.has(key)&&this.valid(r)&&r.finished===true}
 valid(r){return !!r&&this.requests.get(`${r.sessionId}:${r.requestId}`)===r&&this.mode==='research'&&this.deep.target?.sessionId===r.sessionId&&this.deep.target?.targetId===r.targetId&&r.generation===this.generation&&this.now()-r.at>=0&&this.now()-r.at<=60000}
 finished(sessionId,p){
  const key=`${sessionId}:${p.requestId}`,r=this.requests.get(key)
  if(!this.valid(r)||r.finished)return Promise.resolve()
  r.finished=true;r.encodedDataLength=p.encodedDataLength
  if(this.queue.length>=64){this.dropped++;this.requests.delete(key);this.emit('analysis.skipped',{skipReason:'queue_limit',analysisKind:'xml',bodyStatus:'body_unavailable',sessionId,cdpRequestId:p.requestId});return Promise.resolve()}
  return new Promise(resolve=>{this.queue.push({key,r,resolve});this.peakAnalyses=Math.max(this.peakAnalyses,(this.worker.pending?.size??0)+this.queue.length);this.peakQueuedBodies=Math.max(this.peakQueuedBodies,this.queue.length);this.drain()})
 }
 prune(){
  const now=this.now();for(const [key,r] of this.requests)if(r.generation!==this.generation||now-r.at<0||now-r.at>60000){this.requests.delete(key);this.dropped++}
  this.queue=this.queue.filter(item=>{if(this.requests.get(item.key)===item.r)return true;item.resolve();return false})
 }
 drain(){
  this.prune()
  while(this.busy<2&&this.queue.length&&(this.worker.capacity?.()??64)>this.busy){
   const item=this.queue.shift()
   if(!this.valid(item.r)){if(this.requests.get(item.key)===item.r)this.requests.delete(item.key);item.resolve();continue}
   if(this.worker.reserve&&!this.worker.reserve()){this.queue.unshift(item);break}
   item.r.reserved=!!this.worker.reserve
   this.busy++;this.active.add(item.key)
   void this.readBody(item.r.sessionId,{requestId:item.r.requestId,encodedDataLength:item.r.encodedDataLength}).finally(()=>{if(item.r.generation===this.generation){if(item.r.reserved){this.worker.release();item.r.reserved=false}if(this.active.delete(item.key))this.busy--;if(this.requests.get(item.key)===item.r)this.requests.delete(item.key)}item.resolve();this.drain()})
  }
 }
 async readBody(sessionId,p){
  const key=`${sessionId}:${p.requestId}`,r=this.requests.get(key);if(!r)return
  if(!this.valid(r)){this.requests.delete(key);return}
  let bodyStatus='body_unavailable';r.finished=true
  try {
   if(r.unsupported||!Number.isInteger(r.status)||!['text/xml','application/xml','application/xhtml+xml','text/plain','text/html'].includes(r.mime.split(';',1)[0].trim().toLowerCase())){bodyStatus='body_unsupported';return}
   if(p.encodedDataLength>MAX){bodyStatus='body_too_large';return}
   this.bodyReads++
   let result=await this.send('Network.getResponseBody',{requestId:r.requestId},sessionId)
   if(!this.valid(r))return
   let body=result?.body;const base64=result?.base64Encoded;result=null
   if(typeof body!=='string')return
   if(base64){if(body.length>Math.ceil(MAX/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body)) {bodyStatus='body_too_large';return};const buf=Buffer.from(body,'base64');try{body=new TextDecoder('utf-8',{fatal:true}).decode(buf)}catch{bodyStatus='body_unsupported';return}}
   const size=Buffer.byteLength(body);if(size>MAX||this.bytes+size>1024*1024){bodyStatus='body_too_large';return};this.bytes+=size
   bodyStatus='body_available'
   let parsed;try{if(r.reserved){this.worker.release();r.reserved=false}parsed=await this.worker.analyze('xml',body,{contextKey:`${r.sessionId}:${r.frameId}:${r.loaderId}:${r.requestId}`,mime:r.mime,httpStatus:r.status})}catch(error){bodyStatus='body_unavailable';if(this.valid(r))this.emit('analysis.skipped',{skipReason:['time_limit','queue_limit'].includes(error?.code)?error.code:'analysis_error',analysisKind:'xml',bodyStatus,sessionId:r.sessionId,targetId:r.targetId,cdpRequestId:r.requestId})}finally{body=null;if(r.generation===this.generation)this.bytes-=size}
   if(parsed?.bodyStatus)bodyStatus=parsed.bodyStatus
   if(parsed&&this.valid(r))this.emit('jsf.parsed',{...parsed,errorStage:parsed.errorCode?'protocol':undefined,domEvidenceSource:'expected_protocol',sessionId:r.sessionId,targetId:r.targetId,cdpRequestId:r.requestId,httpStatus:r.status,domStatus:'expected_only'})
  }catch{bodyStatus='body_unavailable'}finally{if(this.valid(r)){const counter={body_available:'available',body_unavailable:'unavailable',body_too_large:'tooLarge',body_unsupported:'unsupported',body_parse_failed:'parseFailed'}[bodyStatus];this.counts[counter]++;this.emit('body.observed',{bodyStatus,sessionId:r.sessionId,targetId:r.targetId,cdpRequestId:r.requestId})}}
 }
}

