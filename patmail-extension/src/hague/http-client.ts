import {emitTrace,isDiagnosticModeEnabled} from './diagnostics/store'
import type {TraceContext,DiagnosticErrorData} from './diagnostics/trace'
import {HagueDiagnosticError,normalizeDiagnosticError} from './diagnostics/errors'
import { PermitPool } from '../utils/permit-pool'
import { downloadDocuments } from '../utils/download-documents'
import type { DocumentExportFormat } from '../utils/document-export'
import { HagueHttpDriver } from './http-driver'
import type { HagueFetch } from './http-context'
import type { DraftCommand,DraftReceipt,DraftCheckpoint,DraftRecovery } from './draft-contract'
import type { DraftPlan } from './draft-plan'
import { draftSteps } from './draft-runner'
import { sanitizeSummaryCss } from './summary-css'
import { HAGUE_HTTP_CHANNEL,type HttpRequest } from '../background/hague-http'

const base64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s)}
export function hagueHttpFetch(tabId:number):HagueFetch {
 return async(url,init,trace,requestId)=>{
  const request:HttpRequest={url,method:init?.method==='POST'?'POST':'GET',diagnosticsEnabled:isDiagnosticModeEnabled(),...(trace?{trace}:{}),...(requestId?{requestId}:{})}
  if(init?.headers)request.headers=Object.fromEntries(new Headers(init.headers))
  if(init?.body instanceof FormData){
   request.params=[]
   for(const[k,v]of init.body){if(typeof v==='string')request.params.push([k,v]);else request.file={field:k,name:v.name,mime:v.type,base64:base64(new Uint8Array(await v.arrayBuffer()))}}
  }else if(typeof init?.body==='string'||init?.body instanceof URLSearchParams)request.params=[...new URLSearchParams(init.body)]
  else if(init?.body)throw new Error('接口请求正文格式不支持。')
  const reply=await chrome.runtime.sendMessage<unknown,{ok:boolean;error?:string;diagnosticError?:DiagnosticErrorData;status:number;url:string;mime:string;base64:string}>({channel:HAGUE_HTTP_CHANNEL,tabId,request}).catch((error:unknown)=>{throw normalizeDiagnosticError(error,{errorCode:'RPC_FAILED',errorStage:'rpc',httpStatus:null,transportStatus:'rpc_error'},trace)})
  if(!reply?.ok)throw reply?.diagnosticError?new HagueDiagnosticError({...reply.diagnosticError,traceId:trace?.traceId}):new HagueDiagnosticError({errorCode:'RPC_FAILED',errorStage:'rpc',transportStatus:'rpc_error',httpStatus:null,traceId:trace?.traceId})
  const response=new Response(Uint8Array.from(atob(reply.base64),c=>c.charCodeAt(0)),{status:reply.status,headers:{'content-type':reply.mime}})
  Object.defineProperty(response,'url',{value:reply.url});return response
 }
}
export function httpRestoreCommands(plan:DraftPlan,next:number):DraftCommand[]{
 const steps=draftSteps(plan),op=steps[next]?.command.op
 if(op==='print'||op==='backToApplication')return[{op:'summary'}]
 if(op&&['upload','legend','closeDesign'].includes(op)){
  const design=steps.slice(0,next+1).map(s=>s.command).reverse().find(c=>c.op==='design')
  if(design?.op==='design')return[{op:'openDesign',index:design.index}]
 }
 return[]
}
// Only the allocation and initial-save handshake is serialized; later case work remains concurrent.
const creationPool=new PermitPool(1)
export function createHttpChain(tabId:number,id:string,reference?:string,restore:DraftCommand[]=[],exportFormat:DocumentExportFormat='pdf',signal?:AbortSignal){
 const fetcher=hagueHttpFetch(tabId),driver=new HagueHttpDriver(id,fetcher);let ready=false
 const recover=async(command:DraftCommand,checkpoint:DraftCheckpoint,trace?:TraceContext):Promise<DraftRecovery>=>{
  driver.state.setTrace(trace)
  const result=await driver.recoverStep(command,checkpoint)
  if(result.outcome!=='unknown')ready=true
  return {...result,receipt:result.receipt?{...result.receipt,documentId:id}:undefined}
 }
 const call=async(command:DraftCommand,trace?:TraceContext):Promise<DraftReceipt>=>{
  driver.state.setTrace(trace)
  try{
   // New-case preflight does not mutate a shared server New view outside the allocation slot.
   // Login has been verified by the workspace; the actual GET and prepare run together with create.
   if(!ready&&!reference&&(command.op==='inspect'||command.op==='prepare'))return{ok:true,page:'portfolio',documentId:id}
   if(!ready){
    if(reference){await driver.resume(reference);for(const step of restore){const restored=await driver.call(step,reference);if(!restored.ok)throw new Error(restored.error??'检查点页面恢复失败。')}}
    else if(command.op!=='create')await driver.initialize()
    ready=true
   }
   if(command.op==='create'&&!reference){
    // The queued chain may hold an obsolete New view. Prepare again only after owning the slot.
    await driver.initialize()
    const prepared=await driver.call({op:'prepare'})
    if(!prepared.ok)throw new Error(prepared.error??'创建前未确认新申请表单。')
   }
   if(command.op==='print'){
    const pdf=await renderSummary(driver,fetcher,command.caseVolume)
    const exported=await downloadDocuments(exportFormat,[{name:pdf.name,open:()=>Promise.resolve(pdf.bytes)}],pdf.name.replace(/\.pdf$/i,'.'+exportFormat))
    return{ok:true,page:'summary',reference:driver.state.reference,documentId:id,downloadId:exported.downloadId}
   }
   const result=await driver.call(command,driver.state.reference??reference)
   if(result.ok&&command.op==='create'){
    // Persist a recoverable draft before filling. Never depend on an unsaved server view.
    const saved=await driver.call({op:'saveDraft'},driver.state.reference)
    if(!saved.ok||!saved.draftSaved)throw new Error('新草稿编号已分配，但初始保存未确认。')
    await driver.resume(driver.state.reference!)
    return await driver.call({op:'inspect'},driver.state.reference)
   }
   return !result.ok&&!result.diagnosticError?{...result,diagnosticError:normalizeDiagnosticError(new Error(),{...driver.state.diagnosticState(),errorCode:'BUSINESS_UNCONFIRMED',errorStage:'business',businessStatus:'unconfirmed'},trace).diagnostic}:result
  }catch(e){const failure=normalizeDiagnosticError(e,{...driver.state.diagnosticState(),errorCode:'BUSINESS_UNCONFIRMED',errorStage:'business',businessStatus:'unconfirmed'},trace);return{ok:false,reference:driver.state.reference,documentId:id,error:e instanceof Error?e.message:failure.message,diagnosticError:failure.diagnostic}}
 }
 return{driver,recover,call:(command:DraftCommand,trace?:TraceContext)=>(command.op==='create'?creationPool.run(()=>call(command,trace),signal):call(command,trace)).then(result=>({...result,diagnosticState:driver.state.diagnosticState()}))}
}

async function renderSummary(driver:HagueHttpDriver,transport:HagueFetch,caseVolume:string){
    const fetcher:HagueFetch=async(url,init)=>{
     const trace=driver.state.trace,requestId='req-'+crypto.randomUUID(),started=performance.now()
     emitTrace(trace,'request.prepared',{requestId,httpMethod:'GET',urlPath:url})
     emitTrace(trace,'request.dispatched',{requestId,httpMethod:'GET',urlPath:url,httpStatus:null,transportStatus:'dispatched',businessStatus:'unknown'})
     const response=await transport(url,init,trace,requestId)
     emitTrace(trace,'http.response',{requestId,httpMethod:'GET',urlPath:url,httpStatus:response.status,transportStatus:'completed',businessStatus:'unknown',durationMs:performance.now()-started})
     if(!response.ok)throw new HagueDiagnosticError({errorCode:`HTTP_${response.status}`,errorStage:'http',httpStatus:response.status,traceId:trace?.traceId})
     return response
    }
    if(!driver.state.reference||!driver.state.location.pathname.endsWith('/summary.xhtml'))throw new Error('未确认本链 Summary 页面。')
    const doc=new DOMParser().parseFromString(driver.state.document.documentElement.outerHTML,'text/html')
    for(const node of doc.querySelectorAll('script,iframe,object,embed,base'))node.remove()
    for(const node of doc.querySelectorAll('*'))for(const attr of [...node.attributes])if(/^on/i.test(attr.name)||attr.name==='href'&&node.tagName!=='LINK')node.removeAttribute(attr.name)
    for(const style of doc.querySelectorAll('style'))style.textContent=sanitizeSummaryCss(style.textContent??'')
    for(const node of doc.querySelectorAll<HTMLElement>('[style]'))node.setAttribute('style',sanitizeSummaryCss(node.getAttribute('style')??''))
    for(const link of doc.querySelectorAll('link')){
     if(link.getAttribute('rel')!=='stylesheet'){link.remove();continue}
     const url=new URL(link.getAttribute('href')??'',driver.state.url);if(url.origin!=='https://hague.wipo.int'){link.remove();continue}
     const style=doc.createElement('style');style.textContent=sanitizeSummaryCss(await(await fetcher(url.href)).text());link.replaceWith(style)
    }
    for(const img of doc.querySelectorAll<HTMLImageElement>('img[src]')){const url=new URL(img.getAttribute('src')??'',driver.state.url);if(url.protocol==='data:')continue;if(url.origin!=='https://hague.wipo.int'){img.remove();continue}const response=await fetcher(url.href);if(!response.ok)throw new Error('Summary 原图读取失败。');img.src=`data:${response.headers.get('content-type')??'image/jpeg'};base64,${base64(new Uint8Array(await response.arrayBuffer()))}`}
    const reply=await chrome.runtime.sendMessage<unknown,{ok:boolean;base64?:string;fileName?:string;error?:string}>({channel:HAGUE_HTTP_CHANNEL,action:'print',delivery:'artifact',html:'<!doctype html>'+doc.documentElement.outerHTML,caseVolume,reference:driver.state.reference})
    if(!reply.ok||!reply.base64||!reply.fileName)throw new Error(reply.error??'Summary PDF 未确认。')

 return {name:reply.fileName,bytes:Uint8Array.from(atob(reply.base64),c=>c.charCodeAt(0))}
}
export async function renderSavedSummary(tabId:number,caseVolume:string,reference:string){
 const fetcher=hagueHttpFetch(tabId),driver=new HagueHttpDriver(`export-${crypto.randomUUID()}`,fetcher)
 await driver.resume(reference)
 const summary=await driver.call({op:'summary'},reference)
 if(!summary.ok)throw new Error(summary.error??'无法读取已保存草稿的 Summary。')
 return renderSummary(driver,fetcher,caseVolume)
}
