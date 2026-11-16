import { HAGUE_HOME, HAGUE_ORIGIN, HAGUE_SESSION_CHANNEL } from '../hague/session-contract'
import {hagueBusinessActive,withIdleHagueProbe,waitForHagueIdle} from './hague-activity'

interface LoginProbe {authenticated:boolean;message?:string;reason?:'unavailable'|'unauthenticated'|'target_changed'|'login_required'}
/** Self-contained, read-only probe. It never reads credential values. */
export async function probeHagueLogin():Promise<LoginProbe>{
 const auth=location.origin==='https://www3.wipo.int'&&location.pathname.startsWith('/authpage/')
 if(location.origin!=='https://hague.wipo.int'&&!auth)return{authenticated:false,reason:'target_changed',message:'所选页面不是 eHague 官方页面。'}
 const challenge='input[type="password"],input[autocomplete="one-time-code"],iframe[src*="captcha"]'
 if(document.querySelector(challenge))return{authenticated:false,reason:'login_required',message:'原站需要登录或二次验证，检查点已保留；完成后可继续原草稿。'}
 if(auth||location.pathname==='/HagueEFilingWeb/login')return{authenticated:false,reason:'unavailable',message:'原站认证页面暂不可用，等待有限恢复。'}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000)
 try{
  const response=await fetch('/HagueEFilingWeb/protected/portfolioManager.xhtml',{method:'GET',credentials:'include',cache:'no-store',redirect:'manual',signal:controller.signal})
  if(response.type==='opaqueredirect'||[301,302,303,307,308,401,403].includes(response.status))return{authenticated:false,reason:'unauthenticated',message:'原站认证发生重定向，需恢复会话后核对原草稿。'}
  if(!response.ok)return{authenticated:false,reason:'unavailable',message:`eHague 登录探测暂不可用（HTTP ${response.status}），稍后自动复核。`}
  if(new URL(response.url).origin!=='https://hague.wipo.int'||new URL(response.url).pathname!=='/HagueEFilingWeb/protected/portfolioManager.xhtml')return{authenticated:false,reason:'unauthenticated',message:'原站返回认证页面。'}
  const doc=new DOMParser().parseFromString(await response.text(),'text/html')
  if(doc.querySelector(challenge))return{authenticated:false,reason:'login_required',message:'原站要求登录或二次验证，检查点已保留。'}
  const authenticated=!!doc.querySelector('form#portfolio')&&!!doc.querySelector('form#quickSearchPanel')&&!!doc.querySelector('input[name="javax.faces.ViewState"]')
  return{authenticated,...(authenticated?{}:{reason:'unavailable' as const,message:'未读到有效案件列表，暂时无法确认登录态。'})}
 }catch{return{authenticated:false,reason:'unavailable',message:'eHague 登录探测超时或网络暂不可用，稍后自动复核。'}}
 finally{clearTimeout(timer)}
}
type Tab={id?:number;title?:string;url?:string}
export interface HagueSessionHost{
 extensionId:string;queryTabs():Promise<Tab[]>;getTab(id:number):Promise<Tab>;getDocumentId(id:number):Promise<string|undefined>;createTab(url:string):Promise<void>
 navigateTab?(id:number,url:string):Promise<void>;waitReady?(id:number,timeout:number):Promise<void>;waitIdle?():Promise<void>;delay?(ms:number):Promise<void>
 executeScript(injection:{target:chrome.scripting.InjectionTarget;world:'ISOLATED';func:typeof probeHagueLogin}):Promise<Array<{documentId?:string;result?:unknown}>>
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const isHague=(url?:string):boolean=>{try{return !!url&&new URL(url).origin===HAGUE_ORIGIN}catch{return false}}
const isAuth=(url?:string):boolean=>{try{const u=new URL(url??'');return u.origin==='https://www3.wipo.int'&&u.pathname.startsWith('/authpage/')}catch{return false}}
const allowed=(url?:string)=>isHague(url)||isAuth(url)
const protectedPortfolio=`${HAGUE_ORIGIN}/HagueEFilingWeb/protected/portfolioManager.xhtml`
interface SessionReply {ok:boolean;code?:string;error?:string;session?:{tabId:number;title:string;documentId:string;verifiedAt:number;expiresAt:number}}
const changed=():SessionReply=>({ok:false,code:'target_changed',error:'所选标签页已变化，未操作其他页面。'})
async function verifyTab(host:HagueSessionHost,tabId:number,tab:Tab):Promise<SessionReply>{
 if(isAuth(tab.url))return{ok:false,code:'login_required',error:'原站需要登录或二次验证，检查点已保留；完成后继续原草稿。'}
 const results=await host.executeScript({target:{tabId,frameIds:[0]},world:'ISOLATED',func:probeHagueLogin}),probe=results[0]?.result,documentId=results[0]?.documentId
 if(!record(probe)||probe.authenticated!==true||!documentId)return{ok:false,code:record(probe)&&typeof probe.reason==='string'?probe.reason:'unauthenticated',error:record(probe)&&typeof probe.message==='string'?probe.message:'eHague 登录态无法确认。'}
 const [after,currentDocument]=await Promise.all([host.getTab(tabId),host.getDocumentId(tabId)])
 if(!isHague(after.url)||after.url!==tab.url||currentDocument!==documentId)return changed()
 const verifiedAt=Date.now();return{ok:true,session:{tabId,title:tab.title||'WIPO eHague',documentId,verifiedAt,expiresAt:verifiedAt+300000}}
}
export function createHagueSessionHandler(host:HagueSessionHost){
 const recovering=new Map<number,Promise<SessionReply>>()
 return async(message:unknown,sender:chrome.runtime.MessageSender):Promise<unknown>=>{
  let trusted=false
  try{const url=new URL(sender.url??'');trusted=sender.id===host.extensionId&&url.protocol==='chrome-extension:'&&url.hostname===host.extensionId&&url.pathname==='/app.html'}catch{/* Untrusted sender. */}
  if(!trusted||!record(message)||message.channel!==HAGUE_SESSION_CHANNEL)return{ok:false,error:'eHague 会话调用方无效。'}
  try{
   if(message.action==='listTabs')return{ok:true,tabs:(await host.queryTabs()).filter(t=>Number.isSafeInteger(t.id)&&allowed(t.url)).map(t=>({id:t.id,title:t.title||'WIPO eHague'}))}
   if(message.action==='open'){await host.createTab(HAGUE_HOME);return{ok:true}}
   if(!['verify','recover'].includes(String(message.action))||!Number.isSafeInteger(message.tabId)||Number(message.tabId)<0)return{ok:false,error:'请选择 eHague 标签页。'}
   const tabId=Number(message.tabId),tab=await host.getTab(tabId)
   if(tab.id!==tabId||!allowed(tab.url))return changed()
   if(message.action==='verify')return await verifyTab(host,tabId,tab)
   const existing=recovering.get(tabId);if(existing)return await existing
   const job=(async():Promise<SessionReply>=>{
    await(host.waitIdle?.()??waitForHagueIdle())
    let expected=await host.getTab(tabId)
    if(expected.url!==tab.url||!allowed(expected.url))return changed()
    let checked=await verifyTab(host,tabId,expected)
    if(checked.ok||checked.code==='login_required'||checked.code==='target_changed')return checked
    if(!host.navigateTab)return checked
    for(let attempt=0;attempt<3;attempt++){
     const before=await host.getTab(tabId)
     if(!allowed(before.url)||before.url!==expected.url)return changed()
     try{
      await host.navigateTab(tabId,protectedPortfolio);await host.waitReady?.(tabId,20000)
      expected=await host.getTab(tabId)
      if(!allowed(expected.url))return changed()
      checked=await verifyTab(host,tabId,expected)
      if(checked.ok||checked.code==='login_required'||checked.code==='target_changed')return checked
     }catch{expected=await host.getTab(tabId);if(!allowed(expected.url))return changed()}
     if(attempt<2)await(host.delay?.([4000,15000][attempt])??new Promise(resolve=>setTimeout(resolve,[4000,15000][attempt])))
    }
    return{ok:false,code:'unavailable',error:'原站认证服务暂不可用（可能返回 5xx），有限恢复尚未成功；原草稿及检查点已保留。'}
   })().finally(()=>recovering.delete(tabId))
   recovering.set(tabId,job);return await job
  }catch{return{ok:false,code:'unavailable',error:'无法连接 eHague 标签页，请确认页面仍打开后重新检测。'}}
 }
}
async function navigateAndWait(tabId:number,url:string):Promise<void>{
 await new Promise<void>((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);chrome.tabs.onRemoved.removeListener(removed)}
  const listener=(id:number,info:chrome.tabs.OnUpdatedInfo)=>{if(id===tabId&&info.status==='complete'){cleanup();resolve()}}
  const removed=(id:number)=>{if(id===tabId){cleanup();reject(new Error('eHague tab closed'))}}
  const timer=setTimeout(()=>{cleanup();reject(new Error('eHague navigation timeout'))},20000)
  chrome.tabs.onUpdated.addListener(listener);chrome.tabs.onRemoved.addListener(removed)
  void chrome.tabs.update(tabId,{url}).catch((error:unknown)=>{cleanup();reject(error instanceof Error?error:new Error('eHague navigation failed',{cause:error}))})
 })
}
let productionHandler:ReturnType<typeof createHagueSessionHandler>|undefined
export function handleHagueSessionMessage(message:unknown,sender:chrome.runtime.MessageSender):Promise<unknown>{
 productionHandler??=createHagueSessionHandler({extensionId:chrome.runtime.id,queryTabs:()=>chrome.tabs.query({}),getTab:id=>chrome.tabs.get(id),getDocumentId:async tabId=>(await chrome.webNavigation.getFrame({tabId,frameId:0}))?.documentId,createTab:async url=>{await chrome.tabs.create({url})},navigateTab:navigateAndWait,executeScript:injection=>chrome.scripting.executeScript(injection)})
 return productionHandler(message,sender)
}

/** One read-only touch per minute while a protected eHague tab is open; never opens or logs in. */
export function createHagueKeepalive(host:Pick<HagueSessionHost,'queryTabs'|'executeScript'>,clock:()=>number=Date.now,defer:()=>boolean=()=>false){
  let running=false,lastStarted=Number.NEGATIVE_INFINITY
  return async():Promise<void>=>{
    const now=clock()
    if(running||defer()||now-lastStarted<60000)return
    running=true;lastStarted=now
    try{
      const tabs=await host.queryTabs()
      if(defer())return
      const tab=tabs.find(t=>Number.isSafeInteger(t.id)&&isHague(t.url)&&new URL(t.url!).pathname.startsWith('/HagueEFilingWeb/protected/'))
      if(tab)await host.executeScript({target:{tabId:tab.id!,frameIds:[0]},world:'ISOLATED',func:probeHagueLogin})
    }catch{ /* Closed tabs or an expired login do not trigger navigation or another login attempt. */ }
    finally{running=false}
  }
}
export const keepHagueSessionAlive=createHagueKeepalive({
  queryTabs:()=>chrome.tabs.query({url:`${HAGUE_ORIGIN}/*`}),
  executeScript:async injection=>await withIdleHagueProbe(()=>chrome.scripting.executeScript(injection))??[]
},Date.now,hagueBusinessActive)
