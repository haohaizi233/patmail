import {expect,it,vi} from 'vitest'
import {createHagueSessionHandler,type HagueSessionHost} from '../../../src/background/hague-session'
import {HAGUE_SESSION_CHANNEL as channel,HAGUE_HOME} from '../../../src/hague/session-contract'
const sender={id:'test',url:'chrome-extension://test/app.html'}
const request={channel,action:'recover',tabId:9}
function fixture(probes:Array<{authenticated:boolean;reason?:string}>){
 const current={id:9,title:'WIPO',url:HAGUE_HOME};let doc='one'
 const navigate=vi.fn(async(_id:number,url:string)=>{current.url=url;doc+='x'})
 const idle=vi.fn(async()=>{}),delay=vi.fn(async()=>{})
 const execute=vi.fn(async()=>[{documentId:doc,result:probes.shift()??{authenticated:false,reason:'unavailable'}}])
 const host:HagueSessionHost={extensionId:'test',queryTabs:async()=>[current],getTab:async()=>({...current}),getDocumentId:async()=>doc,createTab:async()=>{},navigateTab:navigate,waitReady:async()=>{},waitIdle:idle,delay,executeScript:execute}
 return{host,execute,current,navigate,idle,delay,handle:createHagueSessionHandler(host)}
}
it('waits for predecessor RPCs, retries transient login failure, then verifies the new document',async()=>{
 const f=fixture([{authenticated:false,reason:'unauthenticated'},{authenticated:false,reason:'unavailable'},{authenticated:true}])
 let release!:()=>void;f.idle.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 const work=f.handle(request,sender)
 await vi.waitFor(()=>expect(f.idle).toHaveBeenCalledOnce())
 expect(f.execute).not.toHaveBeenCalled();expect(f.navigate).not.toHaveBeenCalled()
 release();expect(await work).toMatchObject({ok:true,session:{tabId:9,documentId:'onexx'}})
 expect(f.navigate).toHaveBeenCalledTimes(2);expect(f.delay).toHaveBeenCalledOnce()
 expect(f.navigate).toHaveBeenCalledWith(9,'https://hague.wipo.int/HagueEFilingWeb/protected/portfolioManager.xhtml')
})
it('coalesces concurrent recovery requests and never navigates through a login challenge',async()=>{
 const f=fixture([{authenticated:false,reason:'unauthenticated'},{authenticated:false,reason:'login_required'}])
 let release!:()=>void;f.idle.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 const one=f.handle(request,sender),two=f.handle(request,sender)
 await vi.waitFor(()=>expect(f.idle).toHaveBeenCalledOnce());release()
 expect(await one).toMatchObject({ok:false,code:'login_required'});expect(await two).toMatchObject({ok:false,code:'login_required'})
 expect(f.navigate).toHaveBeenCalledOnce()
})
it('rejects a user-changed target before touching the new page',async()=>{
 const f=fixture([{authenticated:true}])
 f.idle.mockImplementationOnce(async()=>{f.current.url='https://example.test/'})
 expect(await f.handle(request,sender)).toMatchObject({ok:false,code:'target_changed'})
 expect(f.execute).not.toHaveBeenCalled();expect(f.navigate).not.toHaveBeenCalled()
})
it('bounds persistent HTTP500 recovery and never switches to another tab',async()=>{
 const f=fixture([{authenticated:false,reason:'unauthenticated'}])
 expect(await f.handle(request,sender)).toMatchObject({ok:false,code:'unavailable'})
 expect(f.navigate).toHaveBeenCalledTimes(3)
 expect(f.navigate.mock.calls.every(([id])=>id===9)).toBe(true)
})
it('observes only the exact trusted SSO origin after an approved redirect',async()=>{
 const f=fixture([{authenticated:false,reason:'unauthenticated'},{authenticated:false,reason:'login_required'}])
 f.navigate.mockImplementationOnce(async()=>{f.current.url='https://www3.wipo.int/authpage/signin.xhtml'})
 expect(await f.handle(request,sender)).toMatchObject({ok:false,code:'login_required'})
 const other=fixture([{authenticated:false,reason:'unauthenticated'}])
 other.navigate.mockImplementationOnce(async()=>{other.current.url='https://www3.wipo.int.evil.test/authpage/signin.xhtml'})
 expect(await other.handle(request,sender)).toMatchObject({ok:false,code:'target_changed'})
 expect(other.execute).toHaveBeenCalledOnce()
})
