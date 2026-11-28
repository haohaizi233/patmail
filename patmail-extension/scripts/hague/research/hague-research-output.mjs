import {sanitizeTraceEvent,safePath} from '../../../src/hague/diagnostics/schema.mjs'

/** A separate bounded allowance for new analysis output; never throttles the basic observer. */
export class ResearchOutputBudget {
 constructor({maxPerMinute=1000,maxPending=128,maxBytes=32768,now=Date.now}={}){Object.assign(this,{maxPerMinute:Math.min(1000,maxPerMinute),maxPending:Math.min(128,maxPending),maxBytes:Math.min(32768,maxBytes),now});this.started=now();this.written=0;this.pending=0;this.peakPending=0;this.dropped=0}
 submit(kind,event,write){
  const time=this.now();if(time-this.started>=60000||time<this.started){this.started=time;this.written=0}
  let size;try{size=Buffer.byteLength(JSON.stringify(event))}catch{this.dropped++;return false}
  if(size>this.maxBytes||this.pending>=this.maxPending||(event.phase!=='research.status'&&this.written>=this.maxPerMinute)){this.dropped++;return false}
  this.pending++;this.peakPending=Math.max(this.peakPending,this.pending);this.written++
  try{void Promise.resolve(write(kind,event)).catch(()=>{this.dropped++}).finally(()=>{this.pending--})}catch{this.pending--;this.dropped++;return false}
  return true
 }
}

export function safeAnalysisOutput(raw){
 if(raw?.version===1)return sanitizeTraceEvent(raw)
 if(!raw||raw.source!=='hague')return null
 const out={source:'hague'}
 if(typeof raw.scriptHash==='string'&&/^[a-f0-9]{64}$/.test(raw.scriptHash))out.scriptHash=raw.scriptHash
 for(const key of ['callCount','unresolvedCount'])if(Number.isSafeInteger(raw[key])&&raw[key]>=0&&raw[key]<=30000)out[key]=raw[key]
 if(raw.origin==='https://hague.wipo.int')out.origin=raw.origin
 const path=safePath(raw.path);if(path)out.path=path
 if(raw.evidence==='static_analysis')out.evidence=raw.evidence
 return out
}
