import {normalizeDiagnosticError} from '../hague/diagnostics/errors'
import type {TraceContext} from '../hague/diagnostics/trace'
import { HAGUE_DRAFT_CHANNEL, type DraftCommand, type DraftReceipt } from '../hague/draft-contract'
import { executeDraftPage } from '../hague/draft-page'
import { printHagueSummary } from './hague-pdf'
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const text=(v:unknown,max=10000):v is string=>typeof v==='string'&&v.length<=max
const index=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<10000
const browserTabId=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0
export function isDraftCommand(v:unknown):v is DraftCommand {
 if(!record(v)||typeof v.op!=='string')return false
 const applicant=(a:unknown)=>record(a)&&['name','address','city','region','postalCode','country'].every(k=>text(a[k],2000))
 switch(v.op){
  case 'inspect':case 'prepare':case 'create':case 'closeDesign':case 'summary':case 'backToApplication':case 'saveDraft':return Object.keys(v).length===1
  case 'print':return typeof v.caseVolume==='string'&&/^P[A-Z0-9-]*HAGUE$/i.test(v.caseVolume)&&v.caseVolume.length<=80
  case 'applicant':return applicant(v.data)&&index(v.index)&&text(v.email,254)
  case 'representative':return applicant(v.data)&&record(v.data)&&text(v.data.email,254)
  case 'parties':return Array.isArray(v.codes)&&v.codes.length>0&&v.codes.length<100&&v.codes.every(c=>typeof c==='string'&&/^[A-Z]{2}$/.test(c))
  case 'locarno':return typeof v.value==='string'&&/^\d{1,2}$/.test(v.value)
  case 'design':return index(v.index)&&text(v.subclass,10)&&text(v.product,2000)
  case 'openDesign':return index(v.index)
  case 'upload':return text(v.name,150)&&/^\d+\.\d+\.(?:jpe?g|tiff?)$/i.test(v.name)&&text(v.base64,2800000)&&/^[A-Za-z0-9+/]*={0,2}$/.test(v.base64)&&['image/jpeg','image/tiff'].includes(String(v.mime))&&index(v.count)
  case 'legend':return text(v.name,150)&&text(v.label,300)
  case 'description':return text(v.text,90000)
  case 'creator':return index(v.index)&&text(v.givenName,300)&&text(v.familyName,300)&&applicant(v.address)
  case 'priority':return index(v.index)&&record(v.data)&&['number','date','country','das'].every(k=>text((v.data as Record<string,unknown>)[k],300))
  case 'publication':return Number.isInteger(v.months)&&Number(v.months)>=0&&Number(v.months)<=30
  case 'signature':return text(v.reference,80)&&text(v.representative,300)
  default:return false
 }
}
interface Host { extensionId:string; getTab(id:number):Promise<{url?:string}>;getDocumentId(id:number):Promise<string|undefined>;run(tabId:number,documentId:string,command:DraftCommand,reference?:string):Promise<{documentId?:string;result?:unknown}> }
export function createHagueDraftHandler(host:Host) {
 const active=new Set<number>()
 return async(message:unknown,sender:chrome.runtime.MessageSender):Promise<DraftReceipt>=>{
  let tabId:number|undefined
  let locked=false
  try {
   const senderUrl=new URL(sender.url??'')
   if(sender.id!==host.extensionId||senderUrl.protocol!=='chrome-extension:'||senderUrl.hostname!==host.extensionId||senderUrl.pathname!=='/app.html')throw new Error('草稿操作仅允许从扩展工作台发起。')
   if(!record(message)||message.channel!==HAGUE_DRAFT_CHANNEL||!browserTabId(message.tabId)||!isDraftCommand(message.command))throw new Error('草稿操作参数无效。')
   tabId=message.tabId
   if(active.has(tabId))throw new Error('本标签页仍有操作未结束，请等待回执。')
   active.add(tabId)
   locked=true
   const url=new URL((await host.getTab(tabId)).url??'')
   if(url.origin!=='https://hague.wipo.int'||!url.pathname.startsWith('/HagueEFilingWeb/protected/'))throw new Error('所选页面不是已登录的 eHague 编辑器。')
   const documentId=await host.getDocumentId(tabId)
   if(!documentId||message.command.op!=='inspect'&&message.documentId!==documentId)throw new Error('目标页面已变化，请重新检查当前草稿。')
   const result=await host.run(tabId,documentId,message.command,typeof message.reference==='string'?message.reference:undefined)
   if(!record(result.result)||typeof result.result.ok!=='boolean')throw new Error('原站没有返回操作回执；请检查草稿，勿重试当前写入。')
   return {...result.result,documentId:result.documentId??documentId} as DraftReceipt
  } catch(error){const trace=record(message)&&record(message.trace)?message.trace as unknown as TraceContext:undefined;return {ok:false,error:error instanceof Error?error.message:'草稿操作结果不确定，请检查原站。',diagnosticError:normalizeDiagnosticError(error,{errorCode:'RPC_FAILED',errorStage:'rpc',transportStatus:'rpc_error',httpStatus:null},trace).diagnostic}}
  finally{if(locked&&tabId!==undefined)active.delete(tabId)}
 }
}
const handler=createHagueDraftHandler({
 extensionId:typeof chrome==='undefined'?'':chrome.runtime?.id??'',
 getTab:id=>chrome.tabs.get(id),getDocumentId:async tabId=>(await chrome.webNavigation.getFrame({tabId,frameId:0}))?.documentId,
 run:async(tabId,documentId,command,reference)=>{
  if(command.op==='print'){
   if(!reference)throw new Error('只能打印当前案件的 Summary。')
   const checked=(await chrome.scripting.executeScript({target:{tabId,documentIds:[documentId]},world:'MAIN',func:executeDraftPage,args:[{op:'inspect'},reference]}))[0]
   if(!checked?.result?.ok||checked.result.page!=='summary'||!reference)throw new Error('只能打印当前案件的 Summary。')
   const downloadId=await printHagueSummary(tabId,documentId,reference,command.caseVolume)
   return {documentId,result:{...checked.result,downloadId}}
  }
  // Chrome's ScriptInjection args reject undefined, unlike JSON.stringify(array).
  const args:[DraftCommand]|[DraftCommand,string]=reference===undefined?[command]:[command,reference]
  return (await chrome.scripting.executeScript({target:{tabId,documentIds:[documentId]},world:'MAIN',func:executeDraftPage,args}))[0]??{}
 }
})
export const handleHagueDraftMessage=handler
