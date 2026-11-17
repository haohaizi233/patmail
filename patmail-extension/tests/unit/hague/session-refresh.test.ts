import { afterEach,expect,it,vi } from 'vitest'
import {createApp,h,nextTick} from 'vue'
import {useOaSession} from '../../../src/app/composables/useOaSession'
let unmount=()=>{}
afterEach(()=>{unmount();vi.useRealTimers();vi.unstubAllGlobals()})
function mountSession(options?:{deferPolling?:()=>boolean;recoveringNavigation?:()=>boolean;autoVerify?:boolean;requestTimeoutMs?:number},single=false){
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-13T00:00:00Z'))
 const listeners:{changed?:(tabId:number,info:{status?:string;url?:string})=>void}={}
 vi.stubGlobal('chrome',{tabs:{onUpdated:{addListener:(fn:typeof listeners.changed)=>{listeners.changed=fn},removeListener(){}},onRemoved:{addListener(){},removeListener(){}}}})
 const verify=vi.fn((tabId:number)=>Promise.resolve({tabId,title:'WIPO',documentId:'doc',verifiedAt:Date.now(),expiresAt:Date.now()+300000}))
 const client={listTabs:()=>Promise.resolve(single?[{id:7,title:'WIPO'}]:[{id:7,title:'WIPO'},{id:8,title:'Other'}]),verify,isTransientError:(error:unknown)=>error instanceof Error&&error.name==='ProbeUnavailable',open:()=>Promise.resolve()}
 let oa!:ReturnType<typeof useOaSession>
 const app=createApp({setup(){oa=useOaSession(client,options);return()=>h('div')}}),root=document.createElement('div')
 app.mount(root);unmount=()=>app.unmount()
 return {oa,verify,listeners}
}
it('permits only an explicitly coordinated authentication navigation to await a new document verification',async()=>{
 let recovering=true
 const {oa,verify,listeners}=mountSession({deferPolling:()=>true,recoveringNavigation:()=>recovering})
 await nextTick();oa.selected.value=7;await oa.verify()
 listeners.changed?.(7,{status:'loading'});expect(oa.verified.value).toBe(false);expect(oa.checking.value).toBe(true)
 expect(verify).toHaveBeenCalledOnce()
 verify.mockResolvedValueOnce({tabId:7,title:'WIPO',documentId:'new-document',verifiedAt:Date.now(),expiresAt:Date.now()+300000})
 expect(await oa.verify(true)).toBe(true);expect(oa.verified.value).toBe(true)
 recovering=false;listeners.changed?.(7,{status:'loading'});expect(oa.verified.value).toBe(false);expect(oa.checking.value).toBe(true)
})
it('accepts only the fresh recovery result across its own navigation while keeping the old document unverified',async()=>{
 const {oa,verify,listeners}=mountSession({deferPolling:()=>true,recoveringNavigation:()=>true})
 await nextTick();oa.selected.value=7
 let resolve!:(value:Awaited<ReturnType<typeof verify>>)=>void
 verify.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 const work=oa.recover()
 listeners.changed?.(7,{status:'loading'});listeners.changed?.(7,{status:'complete'})
 expect(oa.verified.value).toBe(false);expect(oa.checking.value).toBe(true)
 resolve({tabId:7,title:'WIPO',documentId:'fresh-after-SSO',verifiedAt:Date.now(),expiresAt:Date.now()+300000})
 expect(await work).toBe(true);expect(oa.verified.value).toBe(true);expect(verify).toHaveBeenCalledOnce()
})
it('silently refreshes an explicitly verified session before the five-minute expiry',async()=>{
 const {oa,verify}=mountSession();await nextTick();oa.selected.value=7;await oa.verify()
 await vi.advanceTimersByTimeAsync(360000)
 expect(verify).toHaveBeenCalledTimes(7)
 expect(oa.verified.value).toBe(true)
 expect(oa.state.value).toBe('verified')
})
it('preserves the verified state during a slow refresh and joins an explicit freshness check',async()=>{
 const {oa,verify}=mountSession();await nextTick();oa.selected.value=7;await oa.verify()
 let resolve!:(value:Awaited<ReturnType<typeof verify>>)=>void
 verify.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 await vi.advanceTimersByTimeAsync(60000)
 expect(verify).toHaveBeenCalledTimes(2)
 expect(oa.verified.value).toBe(true);expect(oa.checking.value).toBe(false)
 const fresh=oa.ensureFresh()
 expect(verify).toHaveBeenCalledTimes(2)
 resolve({tabId:7,title:'WIPO',documentId:'doc',verifiedAt:Date.now(),expiresAt:Date.now()+300000})
 await expect(fresh).resolves.toBe(true)
})
it('invalidates on real probe failure; does not auto-verify an unapproved tab',async()=>{
 const {oa,verify}=mountSession();await nextTick();oa.selected.value=7
 await vi.advanceTimersByTimeAsync(60000);expect(verify).not.toHaveBeenCalled()
 await oa.verify();verify.mockRejectedValueOnce(new Error('原站登录已失效'))
 await vi.advanceTimersByTimeAsync(60000)
 expect(oa.verified.value).toBe(false);expect(oa.message.value).toBe('原站登录已失效')
})
it('discards a silent refresh from the previous selection',async()=>{
 const {oa,verify}=mountSession();await nextTick();oa.selected.value=7;await oa.verify()
 let resolve!:(value:Awaited<ReturnType<typeof verify>>)=>void
 verify.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 await vi.advanceTimersByTimeAsync(60000);oa.selected.value=8
 resolve({tabId:7,title:'WIPO',documentId:'doc',verifiedAt:Date.now(),expiresAt:Date.now()+300000});await nextTick();await nextTick()
 expect(oa.verified.value).toBe(false);expect(oa.selected.value).toBe(8)
})

it('revalidates an already approved tab after navigation completes',async()=>{
 const {oa,verify,listeners}=mountSession();await nextTick();oa.selected.value=7;await oa.verify()
 listeners.changed!(7,{status:'loading'})
 expect(oa.verified.value).toBe(false)
 listeners.changed!(7,{status:'complete'})
 await vi.advanceTimersByTimeAsync(0)
 expect(verify).toHaveBeenCalledTimes(2);expect(oa.verified.value).toBe(true)
})
it('keeps retrying a previously approved tab after a transient probe failure',async()=>{
 const {oa,verify}=mountSession();await nextTick();oa.selected.value=7;await oa.verify()
 verify.mockRejectedValueOnce(new Error('temporary network failure'))
 await vi.advanceTimersByTimeAsync(60000);expect(oa.verified.value).toBe(false)
 await vi.advanceTimersByTimeAsync(60000);expect(oa.verified.value).toBe(true)
 expect(verify).toHaveBeenCalledTimes(3)
})

it('preserves unexpired verification during a transient keepalive failure without extending its TTL',async()=>{
 const {oa,verify}=mountSession();await nextTick();oa.selected.value=7;await oa.verify()
 verify.mockImplementation(()=>Promise.reject(Object.assign(new Error('probe timeout'),{name:'ProbeUnavailable'})))
 await vi.advanceTimersByTimeAsync(60000)
 expect(oa.verified.value).toBe(true)
 await vi.advanceTimersByTimeAsync(240000)
 expect(oa.verified.value).toBe(false)
})

it('remains checking throughout approved navigation until the replacement document probe settles',async()=>{
 const {oa,verify,listeners}=mountSession();await nextTick();oa.selected.value=7;await oa.verify()
 let resolve!:(value:Awaited<ReturnType<typeof verify>>)=>void
 verify.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 listeners.changed!(7,{status:'loading'})
 expect(oa.verified.value).toBe(false);expect(oa.checking.value).toBe(true)
 listeners.changed!(7,{status:'complete'})
 expect(oa.verified.value).toBe(false);expect(oa.checking.value).toBe(true)
 resolve({tabId:7,title:'WIPO',documentId:'replacement',verifiedAt:Date.now(),expiresAt:Date.now()+300000});await vi.advanceTimersByTimeAsync(0)
 expect(oa.verified.value).toBe(true);expect(oa.checking.value).toBe(false)
})


it('uses authenticated business activity during a batch without firing portfolio keepalive GETs',async()=>{
 let busy=true;const {oa,verify}=mountSession({deferPolling:()=>busy});await nextTick();oa.selected.value=7;await oa.verify()
 for(let i=0;i<8;i++){await vi.advanceTimersByTimeAsync(60000);oa.noteAuthenticatedActivity(7)}
 expect(verify).toHaveBeenCalledTimes(1);expect(oa.verified.value).toBe(true)
 busy=false;await vi.advanceTimersByTimeAsync(1000);expect(verify).toHaveBeenCalledTimes(2)
})
it('does not let unrelated business activity revive an expired verification',async()=>{
 const {oa,verify}=mountSession({deferPolling:()=>true});await nextTick();oa.selected.value=7;await oa.verify()
 await vi.advanceTimersByTimeAsync(299000);oa.noteAuthenticatedActivity(8);await vi.advanceTimersByTimeAsync(2000)
 expect(oa.verified.value).toBe(false);oa.noteAuthenticatedActivity(7);expect(oa.verified.value).toBe(false);expect(verify).toHaveBeenCalledTimes(1)
})

it('automatically verifies the only Hague tab on mount without a manual click',async()=>{
 const {oa,verify}=mountSession({autoVerify:true},true);await vi.advanceTimersByTimeAsync(0)
 expect(oa.selected.value).toBe(7);expect(verify).toHaveBeenCalledOnce();expect(oa.verified.value).toBe(true)
})
it('requires selection with multiple tabs and automatically verifies the chosen tab',async()=>{
 const {oa,verify}=mountSession({autoVerify:true});await vi.advanceTimersByTimeAsync(0);expect(verify).not.toHaveBeenCalled()
 oa.selected.value=8;await vi.advanceTimersByTimeAsync(0);expect(verify).toHaveBeenCalledWith(8);expect(oa.verified.value).toBe(true)
})
it('defers automatic probes during business work then verifies without refreshing the page',async()=>{
 let busy=true;const {oa,verify}=mountSession({autoVerify:true,deferPolling:()=>busy},true);await vi.advanceTimersByTimeAsync(1000);expect(verify).not.toHaveBeenCalled()
 busy=false;await vi.advanceTimersByTimeAsync(1000);expect(verify).toHaveBeenCalledOnce();expect(oa.verified.value).toBe(true)
})
it('releases a hung verification and rejects its late reply without overwriting a new successful attempt',async()=>{
 const {oa,verify}=mountSession({requestTimeoutMs:1000});await nextTick();oa.selected.value=7
 let release!:(value:Awaited<ReturnType<typeof verify>>)=>void;verify.mockImplementationOnce(()=>new Promise(r=>{release=r}))
 const first=oa.verify();await vi.advanceTimersByTimeAsync(1000);expect(await first).toBe(false);expect(oa.checking.value).toBe(false)
 expect(await oa.verify()).toBe(true);release({tabId:7,title:'Late',documentId:'old',verifiedAt:0,expiresAt:1});await nextTick();expect(oa.verified.value).toBe(true)
})

it('allows fresh work to use retained unexpired proof when a background probe is deferred as busy',async()=>{
 const {oa,verify}=mountSession();await nextTick();oa.selected.value=7;await oa.verify()
 const unavailable=new Error('busy');unavailable.name='ProbeUnavailable';verify.mockRejectedValueOnce(unavailable)
 expect(await oa.verify(true)).toBe(true);expect(oa.verified.value).toBe(true)
})
