import {sanitizeTraceEvent} from '../src/hague/diagnostics/schema.mjs'
const prefix='(()=>{if(globalThis.__patmailHagueTraceReceiverVersion!==1)return false;const events='
const suffix=';for(const detail of events)globalThis.dispatchEvent(new CustomEvent("patmail-hague-cdp-trace",{detail}));return true})()'
export function buildCdpUiBridgeExpression(records){
 const safe=(Array.isArray(records)?records:[]).slice(0,16).map(sanitizeTraceEvent).filter(v=>v?.source==='cdp')
 if(!safe.length)throw Error('no safe CDP events')
 const expression=prefix+JSON.stringify(safe)+suffix
 if(expression.length>64000)throw Error('bridge batch too large')
 return expression
}
export function allowedCdpUiBridgeCommand(target,command){
 try{
  const url=new URL(target.url)
  if(target.source!=='app'||target.type!=='page'||!target.sessionId||url.protocol!=='chrome-extension:'||url.pathname!=='/app.html'||url.username||url.password)return false
  if(command.method!=='Runtime.evaluate'||command.sessionId!==target.sessionId||Object.keys(command.params).sort().join(',')!=='awaitPromise,expression,returnByValue'||command.params.returnByValue!==true||command.params.awaitPromise!==false)return false
  const expression=command.params.expression
  if(typeof expression!=='string'||!expression.startsWith(prefix)||!expression.endsWith(suffix))return false
  return buildCdpUiBridgeExpression(JSON.parse(expression.slice(prefix.length,-suffix.length)))===expression
 }catch{return false}
}
export class CdpUiBridge{
 constructor(send,targets){this.send=send;this.targets=targets;this.queue=[];this.timer=null;this.state='unavailable';this.generation=0;this.busy=false}
 enqueue(raw){const safe=sanitizeTraceEvent(raw);if(!safe||safe.source!=='cdp')return;this.queue.push(safe);if(this.queue.length>128)this.queue.shift();if(!this.timer&&!this.busy)this.timer=setTimeout(()=>{this.timer=null;void this.flush()},250)}
 async flush(){
  if(this.busy)return
  const batch=this.queue.splice(0,16);if(!batch.length)return
  this.busy=true
  const generation=this.generation
  for(const target of this.targets().slice(0,6)){
   let expression;try{expression=buildCdpUiBridgeExpression(batch)}catch{continue}
   const command={method:'Runtime.evaluate',sessionId:target.sessionId,params:{expression,returnByValue:true,awaitPromise:false}}
   if(!allowedCdpUiBridgeCommand(target,command))continue
   try{const result=await this.send(command);if(generation===this.generation)this.state=result?.result?.value===true&&!result?.exceptionDetails?'available':'unavailable'}catch{if(generation===this.generation)this.state='unavailable'}
  }
  this.busy=false
  if(this.queue.length&&!this.timer)this.timer=setTimeout(()=>{this.timer=null;void this.flush()},250)
 }
 clear(){this.generation++;if(this.timer)clearTimeout(this.timer);this.timer=null;this.queue=[];this.state='unavailable'}
}
