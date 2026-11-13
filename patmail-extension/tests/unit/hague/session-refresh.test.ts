import { afterEach,expect,it,vi } from 'vitest'
import {createApp,h,nextTick} from 'vue'
import {useOaSession} from '../../../src/app/composables/useOaSession'
let unmount=()=>{}
afterEach(()=>{unmount();vi.useRealTimers();vi.unstubAllGlobals()})
function mountSession(){
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-13T00:00:00Z'))
 const listeners:{changed?:(tabId:number,info:{status?:string;url?:string})=>void}={}
 vi.stubGlobal('chrome',{tabs:{onUpdated:{addListener:(fn:typeof listeners.changed)=>{listeners.changed=fn},removeListener(){}},onRemoved:{addListener(){},removeListener(){}}}})
 const verify=vi.fn((tabId:number)=>Promise.resolve({tabId,title:'WIPO',documentId:'doc',verifiedAt:Date.now(),expiresAt:Date.now()+300000}))
 const client={listTabs:()=>Promise.resolve([{id:7,title:'WIPO'},{id:8,title:'Other'}]),verify,isTransientError:(error:unknown)=>error instanceof Error&&error.name==='ProbeUnavailable',open:()=>Promise.resolve()}
 let oa!:ReturnType<typeof useOaSession>
 const app=createApp({setup(){oa=useOaSession(client);return()=>h('div')}}),root=document.createElement('div')
 app.mount(root);unmount=()=>app.unmount()
 return {oa,verify,listeners}
}
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
