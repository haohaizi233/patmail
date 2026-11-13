import {beforeEach,expect,it,vi} from 'vitest'
const calls=vi.hoisted(()=>[] as string[])
const control=vi.hoisted(()=>({resume:null as Promise<void>|null, requireFresh:false, latestPrepared:''}))
vi.mock('../../../src/hague/http-driver',()=>({HagueHttpDriver:class{
 constructor(private id:string){}
 state={reference:undefined as string|undefined,location:{pathname:'/portfolioManager.xhtml'}}
 initialize(){calls.push('initialize');return Promise.resolve()}
 async resume(ref:string){calls.push(`resume:${ref}`);this.state.reference=ref;this.state.location.pathname='/application.xhtml';await control.resume}
 call(command:{op:string}){calls.push(command.op);if(command.op==='prepare')control.latestPrepared=this.id;if(command.op==='create'&&control.requireFresh&&control.latestPrepared!==this.id)throw new Error('stale prepared view');if(command.op==='create'){this.state.reference='123';this.state.location.pathname='/application.xhtml'}if(command.op==='saveDraft')this.state.location.pathname='/portfolioManager.xhtml';if(command.op==='summary')this.state.location.pathname='/summary.xhtml';return Promise.resolve({ok:true,reference:this.state.reference,page:this.state.location.pathname.includes('summary')?'summary':this.state.location.pathname.includes('portfolio')?'portfolio':'application',draftSaved:command.op==='saveDraft'})}
}}))
import {createHttpChain} from '../../../src/hague/http-client'
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
 await expect(second).rejects.toThrow('已停止')
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
