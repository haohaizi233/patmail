import {it,expect} from 'vitest'
import {runInNewContext} from 'node:vm'
import {buildCdpUiBridgeExpression,allowedCdpUiBridgeCommand,CdpUiBridge} from '../../../scripts/hague-diagnostics-bridge.mjs'
const trace={version:1,source:'cdp',phase:'http.response',httpStatus:200,timestamp:'2026-11-13T00:00:00Z'}
const target={source:'app',type:'page',sessionId:'session',url:'chrome-extension://ieobhddlnmlopeagjkgbjfolpfhncikd/app.html'}
it('fixed bridge expression never executes payload strings and only dispatches safe records',()=>{
 const expression=buildCdpUiBridgeExpression([{...trace,message:'"});globalThis.PWNED=true;//',body:'PRIVATE_SECRET'}]);const events:unknown[]=[]
 const context={__patmailHagueTraceReceiverVersion:1,dispatchEvent:(event:unknown)=>events.push(event),CustomEvent:class{constructor(public type:string,public options:unknown){}}}
 expect(runInNewContext(expression,{...context,__patmailHagueTraceReceiverVersion:undefined})).toBe(false)
 expect(events).toHaveLength(0)
 runInNewContext(expression,context)
 expect(events).toHaveLength(1);expect(expression).not.toContain('PRIVATE_SECRET');expect(expression).not.toContain('PWNED')
 const command={method:'Runtime.evaluate',sessionId:'session',params:{expression,returnByValue:true,awaitPromise:false}}
 expect(allowedCdpUiBridgeCommand(target,command)).toBe(true)
 expect(allowedCdpUiBridgeCommand({...target,source:'hague',url:'https://hague.wipo.int/app.html'},command)).toBe(false)
 expect(allowedCdpUiBridgeCommand(target,{...command,params:{...command.params,expression:'globalThis.PWNED=true'}})).toBe(false)
})
it('drops bridge failures without retrying business work or allowing WIPO delivery',async()=>{
 let attempts=0
 const bridge=new CdpUiBridge(async()=>{attempts++;throw Error('disconnected')},()=>[target])
 bridge.enqueue(trace);await bridge.flush();await bridge.flush();expect(attempts).toBe(1);expect(bridge.state).toBe('unavailable');bridge.clear()
 const blocked=new CdpUiBridge(async()=>{attempts++;return{}},()=>[{...target,source:'hague'}]);blocked.enqueue(trace);await blocked.flush();blocked.clear();expect(attempts).toBe(1)
})
it('marks bridge available only after confirmed fixed dispatcher result and rejects mutated expressions',async()=>{
 const bridge=new CdpUiBridge(async()=>({result:{type:'boolean',value:true}}),()=>[target]);bridge.enqueue(trace);await bridge.flush();expect(bridge.state).toBe('available');bridge.clear()
 const expression=buildCdpUiBridgeExpression([trace])
 const command={method:'Runtime.evaluate',sessionId:'session',params:{expression:expression+';globalThis.PWNED=true',returnByValue:true,awaitPromise:false}}
 expect(allowedCdpUiBridgeCommand(target,command)).toBe(false)
 expect(allowedCdpUiBridgeCommand({...target,sessionId:'wrong'}, {...command,params:{...command.params,expression}})).toBe(false)
})
