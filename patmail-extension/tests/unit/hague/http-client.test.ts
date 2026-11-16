import {beforeEach,expect,it,vi} from 'vitest'
const calls=vi.hoisted(()=>[] as string[])
const control=vi.hoisted(()=>({resume:null as Promise<void>|null, requireFresh:false, latestPrepared:''}))
vi.mock('../../../src/hague/http-driver',()=>({HagueHttpDriver:class{
 constructor(private id:string){}
 state={document:new DOMParser().parseFromString('<html><head><link rel="stylesheet" href="https://hague.wipo.int/HagueEFilingWeb/javax.faces.resource/main.css"></head><body></body></html>','text/html'),url:'https://hague.wipo.int/HagueEFilingWeb/protected/page/summary.xhtml',setTrace:vi.fn(),diagnosticState:()=>({httpStatus:200,protocolStatus:'valid'}),reference:undefined as string|undefined,location:{pathname:'/portfolioManager.xhtml'}}
 initialize(){calls.push('initialize');return Promise.resolve()}
 async resume(ref:string){calls.push(`resume:${ref}`);this.state.reference=ref;this.state.location.pathname='/application.xhtml';await control.resume}
 call(command:{op:string}){calls.push(command.op);if(command.op==='prepare')control.latestPrepared=this.id;if(command.op==='create'&&control.requireFresh&&control.latestPrepared!==this.id)throw new Error('stale prepared view');if(command.op==='create'){this.state.reference='123';this.state.location.pathname='/application.xhtml'}if(command.op==='saveDraft')this.state.location.pathname='/portfolioManager.xhtml';if(command.op==='summary')this.state.location.pathname='/summary.xhtml';return Promise.resolve({ok:true,reference:this.state.reference,page:this.state.location.pathname.includes('summary')?'summary':this.state.location.pathname.includes('portfolio')?'portfolio':'application',draftSaved:command.op==='saveDraft'})}
}}))
import {createHttpChain,renderSavedSummary} from '../../../src/hague/http-client'
beforeEach(()=>{calls.length=0;control.resume=null;control.requireFresh=false;control.latestPrepared=''})
it('saves and reopens a newly allocated draft before accepting creation as complete',async()=>{
 const chain=createHttpChain(7,'a')
 expect(await chain.call({op:'create'})).toMatchObject({ok:true,reference:'123',page:'application'})
 expect(calls).toEqual(['initialize','prepare','create','saveDraft','resume:123','inspect'])
})
it('rebuilds the stage-specific context once after reopening a checkpoint',async()=>{
 const chain=createHttpChain(7,'b','123',[{op:'summary'}])
 expect(await chain.call({op:'inspect'})).toMatchObject({page:'summary',reference:'123'})
 await chain.call({op:'inspect'})
 expect(calls).toEqual(['resume:123','summary','inspect','inspect'])
})

it('serializes creation through initial save and reopen while keeping independent chains',async()=>{
 let release!:()=>void
 control.resume=new Promise<void>(resolve=>{release=resolve})
 const first=createHttpChain(7,'first').call({op:'create'})
 await vi.waitFor(()=>expect(calls).toContain('resume:123'))
 const second=createHttpChain(7,'second').call({op:'create'})
 try {
  await new Promise(resolve=>setTimeout(resolve,20))
  expect(calls.filter(op=>op==='create')).toHaveLength(1)
 } finally {release();await Promise.all([first,second])}
 expect(calls.filter(op=>op==='create')).toHaveLength(2)
})

it('cancels a queued creation without sending it and releases the creation slot',async()=>{
 let release!:()=>void
 control.resume=new Promise<void>(resolve=>{release=resolve})
 const first=createHttpChain(7,'first').call({op:'create'})
 await vi.waitFor(()=>expect(calls).toContain('resume:123'))
 const controller=new AbortController()
 const second=createHttpChain(7,'cancelled',undefined,[],'pdf',controller.signal).call({op:'create'})
 controller.abort()
 await expect(second).rejects.toMatchObject({diagnostic:{errorCode:'NETWORK_ABORTED',transportStatus:'not_dispatched',sideEffectMayHaveOccurred:false}})
 release();await first
 expect(calls.filter(op=>op==='create')).toHaveLength(1)
 control.resume=null
 expect(await createHttpChain(7,'after').call({op:'create'})).toMatchObject({ok:true})
})

it('refreshes and prepares inside the creation slot instead of reusing a view prepared before waiting',async()=>{
 control.requireFresh=true
 const first=createHttpChain(7,'first'),second=createHttpChain(7,'second')
 await first.call({op:'prepare'});await second.call({op:'prepare'})
 expect(await first.call({op:'create'})).toMatchObject({ok:true})
 expect(await second.call({op:'create'})).toMatchObject({ok:true})
})

it('defers all new-form navigation and preparation until the creation slot is owned',async()=>{
 const chain=createHttpChain(7,'queued')
 expect(await chain.call({op:'inspect'})).toMatchObject({ok:true,page:'portfolio'})
 expect(await chain.call({op:'prepare'})).toMatchObject({ok:true,page:'portfolio'})
 expect(calls).toEqual([])
 expect(await chain.call({op:'create'})).toMatchObject({ok:true})
 expect(calls).toEqual(['initialize','prepare','create','saveDraft','resume:123','inspect'])
})

it('preserves Summary stylesheet HTTP failures and does not print an error page',async()=>{
 const sendMessage=vi.fn(()=>Promise.resolve({ok:true,status:503,url:'https://hague.wipo.int/HagueEFilingWeb/javax.faces.resource/main.css',mime:'text/plain',base64:btoa('unavailable')}))
 vi.stubGlobal('chrome',{runtime:{sendMessage}})
 try{
  await expect(renderSavedSummary(7,'PO1HAGUE','123')).rejects.toMatchObject({diagnostic:{errorCode:'HTTP_503',httpStatus:503}})
  expect(sendMessage).toHaveBeenCalledOnce()
 }finally{vi.unstubAllGlobals()}
})

it('does not change the shared portfolio view while another chain is reopening a draft',async()=>{
 let release!:()=>void;control.resume=new Promise<void>(resolve=>{release=resolve})
 const existing=createHttpChain(7,'existing','999').call({op:'inspect'})
 await vi.waitFor(()=>expect(calls).toContain('resume:999'))
 const allocation=createHttpChain(7,'allocation').call({op:'create'})
 try{await new Promise(r=>setTimeout(r,10));expect(calls).not.toContain('create')}finally{release();await Promise.all([existing,allocation])}
})

it('keeps a whole field command exclusive from new application allocation',async()=>{
 const existing=createHttpChain(7,'existing-field','999');await existing.call({op:'inspect'})
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve}),original=existing.driver.call.bind(existing.driver)
 existing.driver.call=async(command,...args)=>{if(command.op==='applicant'){calls.push('field-start');await pending}return original(command,...args)}
 const field=existing.call({op:'applicant',index:0,email:'a@example.test',data:{name:'A Ltd.',address:'Road',city:'City',region:'Region',postalCode:'12345',country:'CN'}})
 await vi.waitFor(()=>expect(calls).toContain('field-start'))
 const allocation=createHttpChain(7,'allocation-during-field').call({op:'create'})
 try{await new Promise(r=>setTimeout(r,10));expect(calls).not.toContain('create')}finally{release();await Promise.all([field,allocation])}
})
it('runs independent case field commands concurrently while keeping allocation behind them',async()=>{
 const chains=Array.from({length:3},(_,i)=>createHttpChain(7,`parallel-${i}`,String(900+i)))
 await Promise.all(chains.map(chain=>chain.call({op:'inspect'})))
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve})
 chains.forEach((chain,i)=>{const original=chain.driver.call.bind(chain.driver);chain.driver.call=async(command,...args)=>{if(command.op==='locarno'){calls.push(`field-${i}`);await pending}return original(command,...args)}})
 const fields=chains.map(chain=>chain.call({op:'locarno',value:'14'}))
 try{await vi.waitFor(()=>expect(calls.filter(c=>c.startsWith('field-'))).toHaveLength(3))}finally{release();await Promise.all(fields)}
})
