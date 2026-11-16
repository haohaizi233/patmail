import { expect,it,vi } from 'vitest'
import { draftSteps,runDraftPlan,draftPlanKey,upgradeLegacyDraftCheckpoint } from '../../../src/hague/draft-runner'
import type { DraftPlan } from '../../../src/hague/draft-plan'
import type { DraftCommand,DraftCheckpoint,DraftReceipt,DraftRecovery } from '../../../src/hague/draft-contract'
import {HagueDiagnosticError} from '../../../src/hague/diagnostics/errors'
const plan:DraftPlan={reference:'PO1HAGUE',applicants:[],creators:[],parties:['EM'],publicationMonths:6,priorities:[],locarno:'28',description:'',designs:[]}
const checkpoint=(next=3):DraftCheckpoint=>({transport:'http',tabId:7,reference:'123',planKey:draftPlanKey(plan),next,total:draftSteps(plan).length,status:'stopped',stage:''})
const receipt:DraftReceipt={ok:true,reference:'123',page:'application'}
it('resumes a verified legacy plan when only a later creator field changed, without changing the current operation',async()=>{
 const applicant={name:'Example',address:'Street',city:'City',region:'Region',country:'CN',postalCode:'1'}
 const original={...plan,creators:[{givenName:'Anwen',familyName:'AN',address:applicant}]}
 const next=draftSteps(original).findIndex(s=>s.command.op==='locarno')
 const checkpoint:DraftCheckpoint={tabId:7,transport:'http',reference:'123',next,total:draftSteps(original).length,status:'uncertain',stage:'locarno',planKey:draftPlanKey(original)}
 const migrated=await upgradeLegacyDraftCheckpoint(checkpoint,original)
 const current={...original,creators:[{...original.creators[0],givenName:'An'}]},controller=new AbortController()
 const recover=vi.fn(async()=>({outcome:'completed' as const,receipt}))
 const result=await runDraftPlan(current,7,{recover,call:async()=>{controller.abort();return receipt},save:async()=>{}},controller.signal,migrated)
 expect(recover).toHaveBeenCalledOnce();expect(result.next).toBe(next+1);expect(result.reference).toBe('123')
 expect(result.warnings?.join()).toContain('尚未执行')
 expect(result.planKey).toBe(draftPlanKey(current))
 const changedCurrent={...current,locarno:'12'}
 await expect(runDraftPlan(changedCurrent,7,{recover,call:async()=>receipt,save:async()=>{}},undefined,migrated)).rejects.toThrow('已执行或结果待核对')
 expect(recover).toHaveBeenCalledOnce()
})
it('refuses a legacy migration without a complete matching original plan witness',async()=>{
 await expect(upgradeLegacyDraftCheckpoint(checkpoint(),{...plan,publicationMonths:0})).rejects.toThrow('旧指纹不匹配')
})
it.each(['AUTH_REDIRECT','RPC_FAILED','NETWORK_ABORTED'] as const)('coordinates a shared session refresh before canonical recovery after %s',async code=>{
 const controller=new AbortController();let writes=0
 const refreshAuthentication=vi.fn(async()=>{expect(writes).toBe(1);return true})
 const recover=vi.fn(async():Promise<DraftRecovery>=>{expect(refreshAuthentication).toHaveBeenCalledOnce();return{outcome:'retry',receipt}})
 const result=await runDraftPlan(plan,7,{refreshAuthentication,recover,save:async()=>{},call:async c=>{if(c.op==='inspect')return receipt;if(++writes===1)return{ok:false,diagnosticError:new HagueDiagnosticError({errorCode:code,errorStage:'http'}).diagnostic};controller.abort();return receipt}},controller.signal,checkpoint())
 expect(result.next).toBe(4);expect(writes).toBe(2);expect(refreshAuthentication).toHaveBeenCalledOnce()
})
it.each([true,false])('requires the persisted Summary digest before allowing one final close retry (%s)',async matching=>{
 const state={...checkpoint(draftSteps(plan).length-1),summaryKey:'sha256:verified'};let closes=0
 const job=runDraftPlan(plan,7,{save:async()=>{},refreshAuthentication:async()=>true,recover:async()=>({outcome:'retry',receipt:{...receipt,summaryKey:matching?state.summaryKey:'different'}}),call:async c=>{if(c.op==='saveDraft'){closes++;return closes===1?{ok:false,diagnosticError:new HagueDiagnosticError({errorCode:'AUTH_REDIRECT',errorStage:'http'}).diagnostic}:{ok:true,page:'portfolio',reference:'123'}}return closes>1?{ok:true,page:'portfolio',reference:'123',draftSaved:true}:receipt}},undefined,state)
 if(matching){expect((await job).status).toBe('saved');expect(closes).toBe(2)}else{await expect(job).rejects.toThrow();expect(closes).toBe(1)}
})
it('retries only network-failed receipt inspection and never replays an already completed write',async()=>{
 vi.useFakeTimers();const controller=new AbortController();let reads=0,writes=0
 const work=runDraftPlan(plan,7,{save:async()=>{},recover:async()=>++reads===1?{outcome:'unknown',diagnosticError:new HagueDiagnosticError({errorCode:'NETWORK_FAILED',errorStage:'transport'}).diagnostic}:{outcome:'completed',receipt},call:async()=>{writes++;controller.abort();return receipt}},controller.signal,{...checkpoint(),status:'uncertain'})
 try{await vi.runAllTimersAsync();expect(await work).toMatchObject({next:4});expect(reads).toBe(2);expect(writes).toBe(1)}finally{vi.useRealTimers()}
})
it('reads back an uncertain boundary and advances without repeating a completed operation',async()=>{
 const controller=new AbortController(),writes:DraftCommand[]=[]
 const recover=vi.fn(async():Promise<DraftRecovery>=>({outcome:'completed',receipt}))
 const result=await runDraftPlan(plan,7,{recover,save:async()=>{},call:async c=>{if(c.op==='inspect'){controller.abort();return receipt}writes.push(c);return receipt}},controller.signal,{...checkpoint(),status:'uncertain'})
 expect(result.next).toBe(4);expect(writes).toHaveLength(0);expect(recover).toHaveBeenCalledOnce()
})
it('retries a supported operation once using a verified fresh receipt and persists the budget',async()=>{
 const controller=new AbortController();let writes=0
 const recover=vi.fn(async():Promise<DraftRecovery>=>({outcome:'retry',receipt}))
 const result=await runDraftPlan(plan,7,{recover,save:async()=>{},call:async c=>{if(c.op==='inspect')return receipt;writes++;if(writes===1)return{ok:false,error:'transient'};controller.abort();return receipt}},controller.signal,checkpoint())
 expect(writes).toBe(2);expect(recover).toHaveBeenCalledOnce();expect(result.recoveryAttempts?.['3']).toBe(1);expect(result.next).toBe(4)
})
it.each(['wrong-reference','exhausted','unsupported','cancelled'] as const)('never retries when recovery is %s',async kind=>{
 const controller=new AbortController(),state=checkpoint(kind==='unsupported'?0:3)
 if(kind==='exhausted'){state.recoveryAttempts={'3':1};state.recoveryRetries={'3':1}}
 let writes=0
 const recover=vi.fn(async():Promise<DraftRecovery>=>{if(kind==='cancelled')controller.abort();return{outcome:'retry',receipt:{...receipt,reference:kind==='wrong-reference'?'999':'123'}}})
 await expect(runDraftPlan(plan,7,{recover,save:async()=>{},call:async c=>{if(c.op==='inspect')return receipt;writes++;return{ok:false,error:'unconfirmed'}}},controller.signal,state)).rejects.toThrow()
 expect(writes).toBe(1)
 if(kind==='unsupported')expect(recover).not.toHaveBeenCalled();if(kind==='exhausted')expect(recover).toHaveBeenCalledOnce()
})
it('finishes a save with a persisted successful portfolio acknowledgement and a matching list readback',async()=>{
 const total=draftSteps(plan).length,state=checkpoint(total-1)
 const recover=vi.fn(async():Promise<DraftRecovery>=>({outcome:'completed',receipt:{ok:true,reference:'123',page:'portfolio',draftSaved:true}}))
 let saved=0
 const result=await runDraftPlan(plan,7,{recover,save:async()=>{},call:async c=>{
  if(c.op==='saveDraft'){saved++;return{ok:true,reference:'123',page:'portfolio'}}
  return saved?{ok:true,page:'portfolio',draftSaved:false}:receipt
 }},undefined,state)
 expect(result.status).toBe('saved');expect(saved).toBe(1);expect(recover).toHaveBeenCalledOnce()
})
it('keeps the durable recovery budget on reload and rejects changed plans before readback',async()=>{
 const recover=vi.fn(async():Promise<DraftRecovery>=>({outcome:'retry',receipt}))
 const call=vi.fn(async()=>receipt)
 await expect(runDraftPlan(plan,7,{recover,call,save:async()=>{}},undefined,{...checkpoint(),status:'uncertain',recoveryAttempts:{'3':1},recoveryRetries:{'3':1}})).rejects.toThrow(/核对/)
 await expect(runDraftPlan(plan,7,{recover,call:async()=>receipt,save:async()=>{}},undefined,{...checkpoint(),status:'uncertain',planKey:'changed'})).rejects.toThrow(/变化/)
 expect(recover).toHaveBeenCalledOnce();expect(call).not.toHaveBeenCalled()
})
it('atomically persists completed recovery and the advanced step even if the process stops during save',async()=>{
 let stored:DraftCheckpoint|undefined
 await expect(runDraftPlan(plan,7,{call:async()=>receipt,recover:async()=>({outcome:'completed',receipt}),save:async value=>{stored=structuredClone(value);if(value.status==='stopped')throw new Error('power loss')}},undefined,{...checkpoint(),status:'uncertain'})).rejects.toThrow('power loss')
 expect(stored).toMatchObject({status:'stopped',next:4})
})
it('does not resend a retry authorization after a crash or recover an unfingerprinted legacy checkpoint',async()=>{
 let stored:DraftCheckpoint|undefined
 await expect(runDraftPlan(plan,7,{call:async c=>c.op==='inspect'?receipt:{ok:false,error:'lost'},recover:async()=>({outcome:'retry',receipt}),save:async value=>{stored=structuredClone(value);if(value.recoveryDecision)throw new Error('power loss')}},undefined,checkpoint())).rejects.toThrow('power loss')
 expect(stored).toMatchObject({next:3,status:'uncertain',recoveryDecision:{next:3,outcome:'retry'}})
 const call=vi.fn(async():Promise<DraftReceipt>=>{throw new Error('unexpected read/write')}),recover=vi.fn(async():Promise<DraftRecovery>=>({outcome:'retry',receipt}))
 await expect(runDraftPlan(plan,7,{call,recover,save:async()=>{}},undefined,{...stored!,status:'running'})).rejects.toThrow(/核对/)
 await expect(runDraftPlan(plan,7,{call,recover,save:async()=>{}},undefined,{...checkpoint(),status:'uncertain',planKey:undefined})).rejects.toThrow(/指纹/)
 expect(call).not.toHaveBeenCalled();expect(recover).not.toHaveBeenCalled()
})

it('never accepts a retry authorization for an allocated create step',async()=>{
 let creates=0
 const recover=vi.fn(async():Promise<DraftRecovery>=>({outcome:'retry',receipt}))
 await expect(runDraftPlan(plan,7,{recover,save:async()=>{},call:async c=>{if(c.op==='inspect')return receipt;if(c.op==='create')creates++;return{ok:false,error:'unconfirmed'}}},undefined,checkpoint(1))).rejects.toThrow()
 expect(creates).toBe(1);expect(recover).toHaveBeenCalledOnce()
})
