import {afterEach,expect,it,vi} from 'vitest'
afterEach(()=>vi.useRealTimers())
it('joins a dispatched keepalive before the first business request and prevents another probe from crossing it',async()=>{
 vi.resetModules();const {withIdleHagueProbe,withHagueBusinessActivity}=await import('../../../src/background/hague-activity')
 let finish!:()=>void;const order:string[]=[]
 const probe=withIdleHagueProbe(()=>new Promise<void>(resolve=>{finish=()=>{order.push('probe');resolve()}}))
 const business=withHagueBusinessActivity(async()=>{order.push('business')})
 const second=vi.fn(async()=>{});await withIdleHagueProbe(second)
 expect(second).not.toHaveBeenCalled();expect(order).toEqual([])
 finish();await Promise.all([probe,business]);expect(order).toEqual(['probe','business'])
})
it('keeps portfolio probes quiet between batch commands and resumes after one idle minute',async()=>{
 vi.useFakeTimers();vi.setSystemTime(1000000);vi.resetModules()
 const {withIdleHagueProbe,withHagueBusinessActivity}=await import('../../../src/background/hague-activity')
 await withHagueBusinessActivity(async()=>{})
 const probe=vi.fn(async()=>{});vi.setSystemTime(1059999);await withIdleHagueProbe(probe);expect(probe).not.toHaveBeenCalled()
 vi.setSystemTime(1060000);await withIdleHagueProbe(probe);expect(probe).toHaveBeenCalledOnce()
})
