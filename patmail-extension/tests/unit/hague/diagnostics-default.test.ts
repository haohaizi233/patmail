import {expect,it,vi} from 'vitest'

it('captures application step evidence by default and still honors explicit disabling',async()=>{
 vi.resetModules()
 const store=await import('../../../src/hague/diagnostics/store')
 const trace=store.makeTraceContext('case-default',0,'create','http')
 store.emitTrace(trace,'step.started',{businessStatus:'pending'})
 expect(store.getDiagnosticEvents()).toEqual([expect.objectContaining({phase:'step.started',caseRunId:'case-default'})])
 store.setDiagnosticMode(false)
 store.emitTrace(trace,'step.completed',{businessStatus:'completed'})
 expect(store.getDiagnosticEvents()).toHaveLength(1)
 store.clearDiagnosticEvents()
})
