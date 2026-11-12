import { downloadDocuments } from '../utils/download-documents'
import type { DocumentExportFormat } from '../utils/document-export'
import { HagueHttpDriver } from './http-driver'
import type { HagueFetch } from './http-context'
import type { DraftCommand,DraftReceipt } from './draft-contract'
import type { DraftPlan } from './draft-plan'
import { draftSteps } from './draft-runner'
import { HAGUE_HTTP_CHANNEL,type HttpRequest } from '../background/hague-http'

const base64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s)}
export function hagueHttpFetch(tabId:number):HagueFetch {
 return async(url,init)=>{
  const request:HttpRequest={url,method:init?.method==='POST'?'POST':'GET'}
  if(init?.headers)request.headers=Object.fromEntries(new Headers(init.headers))
  if(init?.body instanceof FormData){
   request.params=[]
   for(const[k,v]of init.body){if(typeof v==='string')request.params.push([k,v]);else request.file={field:k,name:v.name,mime:v.type,base64:base64(new Uint8Array(await v.arrayBuffer()))}}
  }else if(typeof init?.body==='string'||init?.body instanceof URLSearchParams)request.params=[...new URLSearchParams(init.body)]
  else if(init?.body)throw new Error('接口请求正文格式不支持。')
  const reply=await chrome.runtime.sendMessage<unknown,{ok:boolean;error?:string;status:number;url:string;mime:string;base64:string}>({channel:HAGUE_HTTP_CHANNEL,tabId,request})
  if(!reply?.ok)throw new Error(reply?.error??'接口未返回，结果待核对。')
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
export function createHttpChain(tabId:number,id:string,reference?:string,restore:DraftCommand[]=[],exportFormat:DocumentExportFormat='pdf'){
 const fetcher=hagueHttpFetch(tabId),driver=new HagueHttpDriver(id,fetcher);let ready=false
 return{driver,async call(command:DraftCommand):Promise<DraftReceipt>{
  try{
   if(!ready){
    if(reference){await driver.resume(reference);for(const step of restore){const restored=await driver.call(step,reference);if(!restored.ok)throw new Error(restored.error??'检查点页面恢复失败。')}}
    else await driver.initialize()
    ready=true
   }
   if(command.op==='print'){
    const pdf=await renderSummary(driver,fetcher,command.caseVolume)
    const exported=await downloadDocuments(exportFormat,[{name:pdf.name,open:async()=>pdf.bytes}],pdf.name.replace(/\.pdf$/i,'.'+exportFormat))
    return{ok:true,page:'summary',reference:driver.state.reference,documentId:id,downloadId:exported.downloadId}
   }
   const result=await driver.call(command,driver.state.reference)
   if(result.ok&&command.op==='create'){
    // Persist a recoverable draft before filling. Never depend on an unsaved server view.
    const saved=await driver.call({op:'saveDraft'},driver.state.reference)
    if(!saved.ok||!saved.draftSaved)throw new Error('新草稿编号已分配，但初始保存未确认。')
    await driver.resume(driver.state.reference!)
    return await driver.call({op:'inspect'},driver.state.reference)
   }
   return result
  }catch(e){return{ok:false,reference:driver.state.reference,documentId:id,error:e instanceof Error?e.message:'接口链失败，结果待核对。'}}
 }}
}

async function renderSummary(driver:HagueHttpDriver,fetcher:HagueFetch,caseVolume:string){
    if(!driver.state.reference||!driver.state.location.pathname.endsWith('/summary.xhtml'))throw new Error('未确认本链 Summary 页面。')
    const doc=new DOMParser().parseFromString(driver.state.document.documentElement.outerHTML,'text/html')
    for(const node of doc.querySelectorAll('script,iframe,object,embed,base'))node.remove()
    for(const node of doc.querySelectorAll('*'))for(const attr of [...node.attributes])if(/^on/i.test(attr.name)||attr.name==='href'&&node.tagName!=='LINK')node.removeAttribute(attr.name)
    for(const link of doc.querySelectorAll('link')){
     if(link.getAttribute('rel')!=='stylesheet'){link.remove();continue}
     const url=new URL(link.getAttribute('href')??'',driver.state.url);if(url.origin!=='https://hague.wipo.int'){link.remove();continue}
     const style=doc.createElement('style');style.textContent=(await(await fetcher(url.href)).text()).replace(/@import[^;]+;/gi,'').replace(/url\(([^)]+)\)/gi,(_m,s:string)=>s.replace(/["']/g,'').trim().startsWith('data:')?`url(${s})`:'none');link.replaceWith(style)
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
