import {afterEach,expect,it,vi} from 'vitest'
afterEach(()=>vi.useRealTimers())
it('refresh recovery waits for the old RPC and a quiet interval before permitting continuation',async()=>{
 vi.useFakeTimers();vi.resetModules()
 const {withHagueBusinessActivity,waitForHagueIdle}=await import('../../../src/background/hague-activity')
 let finish!:()=>void,settled=false
 const old=withHagueBusinessActivity(()=>new Promise<void>(resolve=>{finish=resolve}))
 await Promise.resolve()
 const waiting=waitForHagueIdle().then(()=>{settled=true})
 await vi.advanceTimersByTimeAsync(1000);expect(settled).toBe(false)
 finish();await old;await vi.advanceTimersByTimeAsync(499);expect(settled).toBe(false)
 await vi.advanceTimersByTimeAsync(1);await waiting;expect(settled).toBe(true)
})
it('a newly started predecessor request resets the quiet interval',async()=>{
 vi.useFakeTimers();vi.resetModules()
 const {withHagueBusinessActivity,waitForHagueIdle}=await import('../../../src/background/hague-activity')
 let settled=false,finish!:()=>void
 const waiting=waitForHagueIdle().then(()=>{settled=true})
 await vi.advanceTimersByTimeAsync(400)
 const old=withHagueBusinessActivity(()=>new Promise<void>(resolve=>{finish=resolve}));await Promise.resolve()
 await vi.advanceTimersByTimeAsync(200);expect(settled).toBe(false)
 finish();await old;await vi.advanceTimersByTimeAsync(500);await waiting
 expect(settled).toBe(true)
})
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

it('does not overlap independent automatic probes even while no business is running',async()=>{
 vi.resetModules();const {withIdleHagueProbe}=await import('../../../src/background/hague-activity');let finish!:()=>void
 const first=withIdleHagueProbe(()=>new Promise<void>(r=>{finish=r}));const second=vi.fn(async()=>{})
 expect(await withIdleHagueProbe(second)).toBeUndefined();expect(second).not.toHaveBeenCalled();finish();await first
})
