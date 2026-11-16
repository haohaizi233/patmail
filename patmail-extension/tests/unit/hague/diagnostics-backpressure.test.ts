import {afterEach,expect,it,vi} from 'vitest'
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
it('coalesces an event flood into four UI snapshots per second without losing events',async()=>{
 vi.useFakeTimers();vi.resetModules()
 const store=await import('../../../src/hague/diagnostics/store'),listener=vi.fn()
 const stop=store.subscribeDiagnostics(listener)
 const event={version:1,source:'application',phase:'http.response',traceId:'trace-flood',caseRunId:'case-flood',timestamp:new Date().toISOString(),httpStatus:200}
 for(let i=0;i<400;i++)store.collectTraceEvent(event)
 expect(store.getDiagnosticEvents()).toHaveLength(400);expect(listener).not.toHaveBeenCalled()
 await vi.advanceTimersByTimeAsync(250);expect(listener).toHaveBeenCalledOnce();expect(listener.mock.calls[0][0]).toHaveLength(400)
 for(let i=0;i<400;i++)store.collectTraceEvent(event)
 await vi.advanceTimersByTimeAsync(250);expect(listener).toHaveBeenCalledTimes(2);expect(listener.mock.calls[1][0]).toHaveLength(800)
 stop()
})
it('keeps only the latest pending storage snapshot while a write is slow',async()=>{
 vi.useFakeTimers();vi.resetModules();let release!:()=>void
 const set=vi.fn<(value:Record<string,unknown[]>)=>Promise<void>>().mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve})).mockResolvedValue(undefined)
 vi.stubGlobal('chrome',{storage:{local:{set}}})
 const store=await import('../../../src/hague/diagnostics/store')
 const emit=()=>store.collectTraceEvent({version:1,source:'application',phase:'http.response',traceId:'trace-slow',caseRunId:'case-slow',timestamp:new Date().toISOString(),httpStatus:200})
 emit();await vi.advanceTimersByTimeAsync(3000);expect(set).toHaveBeenCalledOnce()
 emit();await vi.advanceTimersByTimeAsync(3000);emit();await vi.advanceTimersByTimeAsync(3000)
 expect(set).toHaveBeenCalledOnce()
 release();await vi.advanceTimersByTimeAsync(0)
 expect(set).toHaveBeenCalledTimes(2)
 expect(set.mock.calls[1][0]['hague.diagnostics.v1']).toHaveLength(3)
})
