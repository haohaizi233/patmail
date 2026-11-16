import type {TraceContext,TraceEvent,TracePhase} from './trace'
import {sanitizeTraceEvent} from './schema.mjs'
const key='hague.diagnostics.v1',maxEvents=5000,maxBytes=4_000_000,maxAge=86400000
let researchStatus:TraceEvent|null=null,droppedEvents=0
let restored=false,enabled=true,events:TraceEvent[]=[],bytes=0,notifyTimer:ReturnType<typeof setTimeout>|undefined,saveTimer:ReturnType<typeof setTimeout>|undefined,pendingSnapshot:TraceEvent[]|undefined,writing=false
const listeners=new Set<(events:readonly TraceEvent[])=>void>()
function publish(){if(notifyTimer)return;notifyTimer=setTimeout(()=>{notifyTimer=undefined;const snapshot=events.slice();for(const listener of listeners)try{listener(snapshot)}catch{/* Diagnostics cannot affect execution. */}},250)}
function persist(){if(typeof chrome==='undefined'||!chrome.storage?.local)return;saveTimer??=setTimeout(flushPersist,3000)}
function flushPersist(){
 if(saveTimer)clearTimeout(saveTimer);saveTimer=undefined
 if(typeof chrome==='undefined'||!chrome.storage?.local)return
 pendingSnapshot=events.slice()
 if(writing)return
 writing=true
 void(async()=>{try{while(pendingSnapshot){const snapshot=pendingSnapshot;pendingSnapshot=undefined;await chrome.storage.local.set({[key]:snapshot})}}catch{/* Optional diagnostic snapshots never block business. */}finally{writing=false}})()
}
export function setDiagnosticMode(value:boolean):void {enabled=value===true;publish()}
export function isDiagnosticModeEnabled():boolean{return enabled}
export function getResearchStatus():TraceEvent|null{return researchStatus?sanitizeTraceEvent(researchStatus):null}
export function getCollectorStats(){return{events:events.length,bytes,droppedEvents}}
export function receiveCdpTrace(raw:unknown):void{try{const e=sanitizeTraceEvent(raw);if(!e||e.source!=='cdp')return;if(e.phase==='research.status'){researchStatus=e;publish()}collectTraceEvent(e)}catch{/* Read-only bridge faults are isolated. */}}
export function getDiagnosticEvents():TraceEvent[]{return events.map(e=>sanitizeTraceEvent(e)!).filter(Boolean)}
export function subscribeDiagnostics(fn:(events:readonly TraceEvent[])=>void):()=>void{listeners.add(fn);return()=>listeners.delete(fn)}
export function clearDiagnosticEvents():void{events=[];bytes=0;droppedEvents=0;publish();persist()}
export function collectTraceEvent(raw:unknown):void{if(!enabled)return;try{const e=sanitizeTraceEvent(raw);if(!e)return;const size=JSON.stringify(e).length;if(size>32000){droppedEvents++;publish();return}if(!e.eventId)e.eventId='event-'+crypto.randomUUID();events.push(e);bytes+=size;while(events.length&&(events.length>maxEvents||bytes>maxBytes||Date.parse(events[0].timestamp)<Date.now()-maxAge)){bytes-=JSON.stringify(events.shift()).length;droppedEvents++}publish();persist()}catch{/* Never retry or fail a business operation for diagnostics. */}}
export function makeTraceContext(caseRunId:string,stepIndex:number,operation:string,transportMode:'http'|'page',tabId?:number):TraceContext{return{traceId:'trace-'+crypto.randomUUID(),caseRunId,stepIndex,operation,transportMode,...(tabId===undefined?{}:{tabId})}}
export function emitTrace(context:TraceContext|undefined,phase:TracePhase,fields:Partial<TraceEvent>={}):void{if(!context||!enabled)return;try{const e=sanitizeTraceEvent({...context,...fields,eventId:'event-'+crypto.randomUUID(),version:1,source:'application',phase,timestamp:new Date().toISOString()});if(!e)return;collectTraceEvent(e);if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('patmail:hague-diagnostic',{detail:e}))}catch{/* Observer/UI faults never change business behavior. */}}
if(typeof window!=='undefined')try{Object.defineProperty(window,'__patmailHagueTraceReceiverVersion',{value:1,configurable:true})}catch{/* Receiver marker is optional. */}
if(typeof window!=='undefined')window.addEventListener('patmail-hague-cdp-trace',((e:CustomEvent)=>{receiveCdpTrace({...e.detail,source:'cdp'})}) as EventListener)
if(typeof window!=='undefined')window.addEventListener('pagehide',flushPersist)
export async function restoreDiagnosticEvents():Promise<void>{if(restored)return;restored=true;try{if(typeof chrome==='undefined'||!chrome.storage?.local)return;const data=await chrome.storage.local.get(key);const stored=data[key];if(!Array.isArray(stored))return;for(const raw of stored.slice(-maxEvents)){const e=sanitizeTraceEvent(raw);if(e&&Date.parse(e.timestamp)>=Date.now()-maxAge)events.push(e)}events=events.slice(-maxEvents);bytes=events.reduce((n,e)=>n+JSON.stringify(e).length,0);while(bytes>maxBytes&&events.length)bytes-=JSON.stringify(events.shift()).length;publish()}catch{/* Optional history. */}}
