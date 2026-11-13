import type {TraceContext,TraceEvent,TracePhase} from './trace'
import {sanitizeTraceEvent} from './schema.mjs'
const key='hague.diagnostics.v1',maxEvents=5000,maxBytes=4_000_000,maxAge=86400000
let restored=false,enabled=false,events:TraceEvent[]=[],bytes=0,notifyQueued=false,saveTimer:ReturnType<typeof setTimeout>|undefined
const listeners=new Set<(events:readonly TraceEvent[])=>void>()
function publish(){if(notifyQueued)return;notifyQueued=true;queueMicrotask(()=>{notifyQueued=false;for(const listener of listeners)try{listener(getDiagnosticEvents())}catch{/* Diagnostics cannot affect execution. */}})}
function persist(){if(saveTimer||typeof chrome==='undefined'||!chrome.storage?.local)return;saveTimer=setTimeout(()=>{saveTimer=undefined;try{void chrome.storage.local.set({[key]:events}).catch(()=>{})}catch{/* Optional persistence. */}},750)}
export function setDiagnosticMode(value:boolean):void {enabled=value===true;publish()}
export function isDiagnosticModeEnabled():boolean{return enabled}
export function getDiagnosticEvents():TraceEvent[]{return events.map(e=>sanitizeTraceEvent(e)!).filter(Boolean)}
export function subscribeDiagnostics(fn:(events:readonly TraceEvent[])=>void):()=>void{listeners.add(fn);return()=>listeners.delete(fn)}
export function clearDiagnosticEvents():void{events=[];bytes=0;publish();persist()}
export function collectTraceEvent(raw:unknown):void{if(!enabled)return;try{const e=sanitizeTraceEvent(raw);if(!e)return;const size=JSON.stringify(e).length;if(size>32000)return;events.push(e);bytes+=size;while(events.length&&(events.length>maxEvents||bytes>maxBytes||Date.parse(events[0].timestamp)<Date.now()-maxAge)){bytes-=JSON.stringify(events.shift()).length}publish();persist()}catch{/* Never retry or fail a business operation for diagnostics. */}}
export function makeTraceContext(caseRunId:string,stepIndex:number,operation:string,transportMode:'http'|'page',tabId?:number):TraceContext{return{traceId:'trace-'+crypto.randomUUID(),caseRunId,stepIndex,operation,transportMode,...(tabId===undefined?{}:{tabId})}}
export function emitTrace(context:TraceContext|undefined,phase:TracePhase,fields:Partial<TraceEvent>={}):void{if(!context||!enabled)return;try{const e=sanitizeTraceEvent({...context,...fields,version:1,source:'application',phase,timestamp:new Date().toISOString()});if(!e)return;collectTraceEvent(e);if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('patmail:hague-diagnostic',{detail:e}))}catch{/* Observer/UI faults never change business behavior. */}}
if(typeof window!=='undefined')try{Object.defineProperty(window,'__patmailHagueTraceReceiverVersion',{value:1,configurable:true})}catch{/* Receiver marker is optional. */}
if(typeof window!=='undefined')window.addEventListener('patmail-hague-cdp-trace',((e:CustomEvent)=>{collectTraceEvent({...e.detail,source:'cdp'})}) as EventListener)
export async function restoreDiagnosticEvents():Promise<void>{if(restored)return;restored=true;try{if(typeof chrome==='undefined'||!chrome.storage?.local)return;const data=await chrome.storage.local.get(key);const stored=data[key];if(!Array.isArray(stored))return;for(const raw of stored.slice(-maxEvents)){const e=sanitizeTraceEvent(raw);if(e&&Date.parse(e.timestamp)>=Date.now()-maxAge)events.push(e)}events=events.slice(-maxEvents);bytes=events.reduce((n,e)=>n+JSON.stringify(e).length,0);while(bytes>maxBytes&&events.length)bytes-=JSON.stringify(events.shift()).length;publish()}catch{/* Optional history. */}}
