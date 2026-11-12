import {beforeEach,expect,it,vi} from 'vitest'
const calls=vi.hoisted(()=>[] as string[])
vi.mock('../../../src/hague/http-driver',()=>({HagueHttpDriver:class{
 state={reference:undefined as string|undefined,location:{pathname:'/portfolioManager.xhtml'}}
 initialize(){calls.push('initialize');return Promise.resolve()}
 resume(ref:string){calls.push(`resume:${ref}`);this.state.reference=ref;this.state.location.pathname='/application.xhtml';return Promise.resolve()}
 call(command:{op:string}){calls.push(command.op);if(command.op==='create'){this.state.reference='123';this.state.location.pathname='/application.xhtml'}if(command.op==='saveDraft')this.state.location.pathname='/portfolioManager.xhtml';if(command.op==='summary')this.state.location.pathname='/summary.xhtml';return Promise.resolve({ok:true,reference:this.state.reference,page:this.state.location.pathname.includes('summary')?'summary':'application',draftSaved:command.op==='saveDraft'})}
}}))
import {createHttpChain} from '../../../src/hague/http-client'
beforeEach(()=>{calls.length=0})
it('saves and reopens a newly allocated draft before accepting creation as complete',async()=>{
 const chain=createHttpChain(7,'a')
 expect(await chain.call({op:'create'})).toMatchObject({ok:true,reference:'123',page:'application'})
 expect(calls).toEqual(['initialize','create','saveDraft','resume:123','inspect'])
})
it('rebuilds the stage-specific context once after reopening a checkpoint',async()=>{
 const chain=createHttpChain(7,'b','123',[{op:'summary'}])
 expect(await chain.call({op:'inspect'})).toMatchObject({page:'summary',reference:'123'})
 await chain.call({op:'inspect'})
 expect(calls).toEqual(['resume:123','summary','inspect','inspect'])
})
