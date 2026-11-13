import type {TraceContext,DiagnosticErrorData} from '../hague/diagnostics/trace'
import {normalizeDiagnosticError} from '../hague/diagnostics/errors'
import { PermitPool } from '../utils/permit-pool'
import { printOfflineHague } from './hague-offline-pdf'
const network=new PermitPool(6)
export const HAGUE_HTTP_CHANNEL='PATMAIL_HAGUE_HTTP'
export interface HttpRequest {diagnosticsEnabled?:boolean;trace?:TraceContext;requestId?:string;url:string;method:'GET'|'POST';params?:[string,string][];headers?:Record<string,string>;file?:{field:string;name:string;mime:string;base64:string}}
/** Executed only on the bound official tab, in an isolated world. No UI manipulation. */
export async function fetchHague(request:HttpRequest):Promise<{status:number|null;url:string;mime:string;base64:string;diagnosticError?:DiagnosticErrorData}>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000)
 let observedStatus:number|null=null
 try{
  let body:BodyInit|undefined
  if(request.method==='POST'){
   if(request.file){const form=new FormData();for(const[k,v]of request.params??[])form.append(k,v);const f=request.file;form.append(f.field,new File([Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0))],f.name,{type:f.mime}),f.name);body=form}
   else body=new URLSearchParams(request.params)
  }
  // Fixed, optional observer binding. No source execution, values or request bodies are reported.
  if(request.diagnosticsEnabled&&request.trace)try{
   const binding=(globalThis as unknown as Record<string,unknown>).__patmailCdpObserver
   if(typeof binding==='function'){
    const t=request.trace,u=new URL(request.url),path=/^\/HagueEFilingWeb\/protected\/(?:portfolioManager|page\/(?:application|summary))\.xhtml$/.test(u.pathname)?u.pathname:undefined
    if(path)(binding as (payload:string)=>void)(JSON.stringify({kind:'hague-trace',event:{version:1,source:'application',phase:'request.dispatched',timestamp:new Date().toISOString(),traceId:t.traceId,caseRunId:t.caseRunId,stepIndex:t.stepIndex,operation:t.operation,transportMode:t.transportMode,tabId:t.tabId,requestId:request.requestId,httpMethod:request.method,urlPath:path,httpStatus:null,transportStatus:'dispatched',businessStatus:'unknown'}}))
   }
  }catch{/* Optional observer cannot alter or retry fetch. */}
  const response=await fetch(request.url,{method:request.method,credentials:'include',cache:'no-store',headers:request.headers,body,signal:controller.signal})
  observedStatus=response.status
  if(new URL(response.url).origin!=='https://hague.wipo.int'||/login|sessionTimedOut/i.test(response.url))return{status:response.status,url:response.url,mime:'',base64:'',diagnosticError:{version:1,errorCode:'AUTH_REDIRECT',errorStage:'http',timestamp:new Date().toISOString(),traceId:request.trace?.traceId,httpStatus:response.status,transportStatus:'completed',protocolStatus:'not_observed',businessStatus:'unknown',certainty:'unknown',sideEffectMayHaveOccurred:request.method==='POST',autoRecoverable:false,message:'海牙请求返回登录页面，请重新验证登录。'}}
  const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768))
  return{status:response.status,url:response.url,mime:response.headers.get('content-type')??'',base64:btoa(binary)}
 }catch(error){const aborted=error instanceof DOMException&&error.name==='AbortError';return{status:observedStatus,url:'',mime:'',base64:'',diagnosticError:{version:1,errorCode:controller.signal.aborted?'NETWORK_TIMEOUT':aborted?'NETWORK_ABORTED':'NETWORK_FAILED',errorStage:'transport',timestamp:new Date().toISOString(),traceId:request.trace?.traceId,httpStatus:observedStatus,transportStatus:controller.signal.aborted?'timeout':aborted?'aborted':'network_error',protocolStatus:'not_observed',businessStatus:'unknown',certainty:'unknown',sideEffectMayHaveOccurred:request.method==='POST',autoRecoverable:false,message:controller.signal.aborted?'海牙请求超时，业务结果待核对。':aborted?'海牙请求被取消，业务结果待核对。':'海牙网络请求失败，业务结果待核对。'}}}finally{clearTimeout(timer)}
}
export async function handleHagueHttp(message:unknown,sender:chrome.runtime.MessageSender):Promise<unknown>{
 try{
  const senderUrl=new URL(sender.url??'')
  if(sender.id!==chrome.runtime.id||senderUrl.pathname!=='/app.html'||senderUrl.protocol!=='chrome-extension:'||senderUrl.hostname!==chrome.runtime.id)throw new Error('接口调用方无效。')
  const print=message as {action?:string;html?:string;caseVolume?:string;reference?:string;delivery?:'artifact'}
  if(print.action==='print'&&typeof print.html==='string'&&typeof print.caseVolume==='string'&&typeof print.reference==='string'){const result=await printOfflineHague(print.html,print.caseVolume,print.reference,print.delivery==='artifact'?'artifact':'download');return typeof result==='number'?{ok:true,downloadId:result}:{ok:true,...result}}
  const m=message as {tabId?:number;request?:HttpRequest},r=m.request
  if(!Number.isSafeInteger(m.tabId)||Number(m.tabId)<0||!r||!['GET','POST'].includes(r.method))throw new Error('接口参数无效。')
  const url=new URL(r.url)
  if(url.origin!=='https://hague.wipo.int'||!/^\/HagueEFilingWeb\/(?:protected\/(?:portfolioManager|page\/(?:application|summary))\.xhtml|DesignServlet|javax\.faces\.resource\/|resources\/)/.test(url.pathname))throw new Error('接口地址不在海牙白名单。')
  if(r.params&&(!Array.isArray(r.params)||r.params.length>600||r.params.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='string'))))throw new Error('表单参数无效。')
  const summaryBack=url.pathname==='/HagueEFilingWeb/protected/page/summary.xhtml'&&new URLSearchParams(r.params).get('javax.faces.source')==='headerForm:back'
  if(r.method==='POST'&&!/\/(?:portfolioManager|application)\.xhtml$/.test(url.pathname)&&!summaryBack)throw new Error('该接口不允许写入。')
  if(JSON.stringify(r).length>4000000||r.file&&(!/^\d+\.\d+\.(?:jpe?g|tiff?)$/i.test(r.file.name)||!['image/jpeg','image/tiff'].includes(r.file.mime)))throw new Error('上传内容无效。')
  for(const key of Object.keys(r.headers??{}))if(!['content-type','faces-request','x-requested-with'].includes(key.toLowerCase()))throw new Error('不允许设置认证或任意请求头。')
  const tabId=Number(m.tabId),tab=await chrome.tabs.get(tabId)
  if(new URL(tab.url??'').origin!==url.origin)throw new Error('绑定的 eHague 标签页已变化。')
  return await network.run(async()=>{
   const frame=await chrome.webNavigation.getFrame({tabId,frameId:0});if(!frame?.documentId)throw new Error('无法确认接口宿主文档。')
   const result=(await chrome.scripting.executeScript({target:{tabId,documentIds:[frame.documentId]},world:'ISOLATED',func:fetchHague,args:[r]}))[0]?.result
   if(!result)throw new Error('接口未返回回执，结果待核对。')
   if(result.diagnosticError)return{ok:false,error:result.diagnosticError.message,diagnosticError:result.diagnosticError}
   return{ok:true,...result}
  })
 }catch(e){const diagnosticError=normalizeDiagnosticError(e,{errorCode:'RPC_FAILED',errorStage:'rpc',transportStatus:'rpc_error',httpStatus:null}).diagnostic;return{ok:false,error:e instanceof Error?e.message:diagnosticError.message,diagnosticError}}
}
