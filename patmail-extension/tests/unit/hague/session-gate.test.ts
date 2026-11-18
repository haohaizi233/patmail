import {expect,it,vi} from 'vitest'
import {HagueSessionGate} from '../../../src/hague/session-gate'
it('admits six independent commands and queues exclusive navigation ahead of later commands',async()=>{
 const gate=new HagueSessionGate(),order:string[]=[];let releaseFields!:()=>void,releaseNavigation!:()=>void
 const fieldsReady=new Promise<void>(r=>{releaseFields=r}),navigationReady=new Promise<void>(r=>{releaseNavigation=r})
 const fields=Array.from({length:6},(_,i)=>gate.run(async()=>{order.push('field'+i);await fieldsReady},false))
 await vi.waitFor(()=>expect(order).toHaveLength(6))
 const navigation=gate.run(async()=>{order.push('navigation');await navigationReady})
 const later=gate.run(async()=>{order.push('later')},false)
 await Promise.resolve();expect(order).toHaveLength(6)
 releaseFields();await Promise.all(fields);await vi.waitFor(()=>expect(order.at(-1)).toBe('navigation'))
 expect(order).not.toContain('later');releaseNavigation();await Promise.all([navigation,later]);expect(order.at(-1)).toBe('later')
})
it('removes an aborted navigation from the queue without blocking unrelated case work',async()=>{
 const gate=new HagueSessionGate();let release!:()=>void
 const field=gate.run(()=>new Promise<void>(r=>{release=r}),false);await vi.waitFor(()=>expect(release).toBeTypeOf('function'))
 const controller=new AbortController(),write=vi.fn(async()=>{})
 const navigation=gate.run(write,true,controller.signal);const cancelled=expect(navigation).rejects.toThrow(/停止/)
 const later=vi.fn(async()=>{}),next=gate.run(later,false);controller.abort();await cancelled;await next
 expect(write).not.toHaveBeenCalled();expect(later).toHaveBeenCalledOnce();release();await field
 expect(await gate.run(async()=>'free')).toBe('free')
})
