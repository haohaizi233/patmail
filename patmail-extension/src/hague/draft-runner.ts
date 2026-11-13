import type {TraceContext} from './diagnostics/trace'
import {emitTrace,makeTraceContext} from './diagnostics/store'
import {HagueDiagnosticError,normalizeDiagnosticError} from './diagnostics/errors'
import { DRAFT_CONTACTS, type DraftPlan } from './draft-plan'
import { HAGUE_DRAFT_CHANNEL, type DraftCheckpoint, type DraftCommand, type DraftReceipt,type DraftRecovery } from './draft-contract'
import { recoverableDraftCommand } from './draft-recovery'
interface Step { label:string;command:DraftCommand;file?:File }
export function draftSteps(plan:DraftPlan):Step[] {
 const steps:Step[]=[{label:'设置英文新申请',command:{op:'prepare'}},{label:'创建新草稿',command:{op:'create'}}]
 plan.applicants.forEach((data,index)=>steps.push({label:`申请人 ${index+1}`,command:{op:'applicant',data,index,email:DRAFT_CONTACTS.applicantEmail}}))
 steps.push({label:'代理机构',command:{op:'representative',data:DRAFT_CONTACTS.representative}},{label:'指定缔约方',command:{op:'parties',codes:plan.parties}},{label:'Locarno 大类',command:{op:'locarno',value:plan.locarno}})
 plan.designs.forEach((design,index)=>{
  steps.push({label:`设计 ${design.number}`,command:{op:'design',index,subclass:design.subclass,product:design.product}})
  design.images.forEach((image,count)=>{
   steps.push({label:`上传图纸 ${image.number}`,command:{op:'upload',name:image.file.name,base64:'',mime:/\.tiff?$/i.test(image.file.name)?'image/tiff':'image/jpeg',count},file:image.file})
   steps.push({label:`核对视图 ${image.number}`,command:{op:'legend',name:image.file.name,label:image.legend}})
  })
  steps.push({label:`保存设计 ${design.number}`,command:{op:'closeDesign'}})
 })
 if(plan.description.trim())steps.push({label:'设计说明',command:{op:'description',text:plan.description}})
 plan.creators.forEach((c,index)=>steps.push({label:`设计人 ${index+1}`,command:{op:'creator',index,...c}}))
 plan.priorities.forEach((data,index)=>steps.push({label:`优先权 ${index+1}${data.generated?'（草稿占位）':''}`,command:{op:'priority',index,data}}))
 steps.push({label:'公开时间',command:{op:'publication',months:plan.publicationMonths}},{label:'签名和我方文号',command:{op:'signature',reference:plan.reference,representative:DRAFT_CONTACTS.representative.name}},{label:'生成 Summary',command:{op:'summary'}},{label:'生成打印文件',command:{op:'print',caseVolume:plan.reference}},{label:'返回草稿编辑器',command:{op:'backToApplication'}},{label:'保存为草稿',command:{op:'saveDraft'}})
 return steps
}
interface Host {transport?:'http'|'page';call(command:DraftCommand,documentId?:string,reference?:string,trace?:TraceContext):Promise<DraftReceipt>;save(value:DraftCheckpoint):Promise<void>;update?(value:DraftCheckpoint):void;recover?(command:DraftCommand,checkpoint:DraftCheckpoint,trace?:TraceContext):Promise<DraftRecovery>}
export function draftPlanKey(plan:DraftPlan):string {
 const body=JSON.stringify({...plan,designs:plan.designs.map(d=>({...d,images:d.images.map(i=>({number:i.number,legend:i.legend,file:{name:i.file.name,size:i.file.size,lastModified:i.file.lastModified}}))}))})
 let hash=2166136261
 for(let i=0;i<body.length;i++)hash=Math.imul(hash^body.charCodeAt(i),16777619)
 return `${body.length}-${(hash>>>0).toString(16)}`
}
export async function runDraftPlan(plan:DraftPlan,tabId:number,host:Host,signal?:AbortSignal,checkpoint?:DraftCheckpoint):Promise<DraftCheckpoint> {
 if(checkpoint?.generatedPriorities)plan={...plan,priorities:plan.priorities.map(p=>p.generated?checkpoint.generatedPriorities!.find(old=>old.generated&&old.originalNumber===p.originalNumber&&old.date===p.date&&old.country===p.country&&old.das===p.das)??p:p)}
 const steps=draftSteps(plan)
 const state:DraftCheckpoint=checkpoint?{...checkpoint,recoveryAttempts:{...checkpoint.recoveryAttempts},total:steps.length}:{tabId,next:0,total:steps.length,status:'running',stage:'检查目标页面'}
 state.transport=host.transport??state.transport??'http'
 state.caseRunId=state.caseRunId??'case-'+crypto.randomUUID()
 let trace=makeTraceContext(state.caseRunId,state.next,'inspect',state.transport??'http',tabId)
 const planKey=draftPlanKey(plan)
 if(checkpoint&&(checkpoint.status==='uncertain'||checkpoint.recoveryDecision)&&!checkpoint.planKey)throw new Error('旧检查点缺少材料指纹，请先核对原草稿，未自动恢复。')
 if(state.planKey&&state.planKey!==planKey)throw new Error('材料或字段在存档后已变化，请先核对原站草稿，不能按旧检查点继续写入。')
 state.planKey=planKey
 state.generatedPriorities=plan.priorities.filter(p=>p.generated).map(p=>({...p}))
 const persist=async()=>{await host.save({...state});host.update?.({...state});emitTrace(trace,'checkpoint.persisted',{businessStatus:state.status==='saved'?'confirmed':state.status==='uncertain'?'unknown':'pending',evidenceCodes:state.status==='uncertain'?['CHECKPOINT_BEFORE_SEND']:[]})}
 const recover=async(command:DraftCommand):Promise<'completed'|'retry'|'unknown'>=>{
  const key=String(state.next)
  if(!host.recover||!state.reference||!recoverableDraftCommand(command)||signal?.aborted||(state.recoveryAttempts?.[key]??0)>=1)return'unknown'
  state.recoveryAttempts={...state.recoveryAttempts,[key]:1};state.stage='读取原站回执，核对是否可恢复';await persist()
  emitTrace(trace,'recovery.started',{businessStatus:'unknown'})
  let result:DraftRecovery
  try{result=await host.recover(command,{...state},trace)}catch{return'unknown'}
  emitTrace(trace,'recovery.decision',{recoveryDecision:result.outcome,businessStatus:result.outcome==='completed'?'confirmed':'unknown'})
  if(signal?.aborted||result.outcome==='unknown'||!result.receipt?.ok||result.receipt.reference!==state.reference)return'unknown'
  if(command.op==='saveDraft'&&(result.outcome!=='completed'||!result.receipt.draftSaved||state.acknowledged?.next!==state.next||state.acknowledged.op!=='saveDraft'||state.acknowledged.page!=='portfolio'))return'unknown'
  state.documentId=result.receipt.documentId??state.documentId;state.error=undefined
  state.warnings=[...new Set([...(state.warnings??[]),`步骤“${steps[state.next]?.label}”已自动核对原站回执并${result.outcome==='completed'?'确认完成':'恢复一次'}。`])]
  if(result.outcome==='completed'){
   state.next++;state.status='stopped';state.recoveryDecision=undefined
  }else{
   state.status='uncertain';state.recoveryDecision={next:state.next,reference:state.reference,outcome:'retry'}
  }
  await persist();return result.outcome
 }
 if(state.tabId!==tabId)throw new Error('目标标签页已变化，请先核对原草稿。')
 if(state.recoveryDecision)state.status='uncertain'
 if(state.status==='uncertain'){
  const command=steps[state.next]?.command
  const outcome=command?await recover(command):'unknown'
  if(outcome==='unknown')throw new Error('操作结果仍待核对，未自动重试。请在原站核对后再继续。')
 }
 let receipt=await host.call({op:'inspect'},undefined,state.reference,trace)
 if(!receipt.ok)throw receipt.diagnosticError?new HagueDiagnosticError(receipt.diagnosticError):new Error(receipt.error||'目标页面无法检查')
 if(state.reference&&receipt.reference&&receipt.reference!==state.reference)throw new Error('原站回执编号与检查点不同，已停止。')
 if(!checkpoint&&receipt.page!=='portfolio')throw new Error('请先回到 eHague New 页面；现有草稿不会被自动覆盖。')
 state.documentId=receipt.documentId;state.reference=receipt.reference??state.reference
 if(state.next>=steps.length){if(receipt.page!=='portfolio'||!receipt.draftSaved)throw new Error('未在 Draft(s) 列表核对到本案草稿，请先在原站确认保存。');state.status='saved';state.stage='草稿已保存，已核对列表回执';await persist();return state}
 for(let i=state.next;i<steps.length;i++){
  if(signal?.aborted){state.status='stopped';state.stage='已停止，当前草稿已保留';await persist();return state}
  const started=performance.now()
  const step=steps[i];trace=makeTraceContext(state.caseRunId,i,step.command.op,state.transport??'http',tabId);state.lastTraceId=trace.traceId;state.diagnosticError=undefined;emitTrace(trace,'step.started',{businessStatus:'pending',httpStatus:null,evidenceCodes:trace.transportMode==='page'?['PAGE_RECEIPT_ONLY']:[]});state.stage=step.label;state.status='running';state.error=undefined;await persist()
  try {
   const observedBefore=receipt
   let command=step.command
   if(command.op==='upload'&&step.file){const bytes=new Uint8Array(await step.file.arrayBuffer());let binary='';for(let p=0;p<bytes.length;p+=32768)binary+=String.fromCharCode(...bytes.subarray(p,p+32768));command={...command,base64:btoa(binary)}}
   // Persist before sending: after a reload this step must be checked rather than repeated.
   state.status='uncertain';state.acknowledged=undefined;state.recoveryDecision=undefined;await persist()
   receipt=await host.call(command,state.documentId,state.reference,trace)
   if(state.reference&&receipt.reference&&receipt.reference!==state.reference)throw new Error('原站回执编号与检查点不同，已停止。')
   state.reference=receipt.reference??state.reference
   state.documentId=receipt.documentId??state.documentId
   if(!receipt.ok)throw receipt.diagnosticError?new HagueDiagnosticError(receipt.diagnosticError):new Error(receipt.error||'原站未确认操作结果')
   state.acknowledged={next:i,op:command.op,page:receipt.page};await persist()
   if(receipt.downloadId!==undefined)state.downloadId=receipt.downloadId
   state.warnings=[...new Set([...(state.warnings??[]),...(receipt.warnings??[])])]
   if(['create','summary','backToApplication','saveDraft'].includes(command.op)){
    const page=command.op==='create'||command.op==='backToApplication'?'application':command.op==='summary'?'summary':'portfolio'
    const end=Date.now()+20000
    do{await new Promise(r=>setTimeout(r,250));receipt=await host.call({op:'inspect'},undefined,command.op==='create'||command.op==='saveDraft'?undefined:state.reference,trace);if(receipt.ok&&receipt.page===page)break}while(Date.now()<end)
    if(!receipt.ok||receipt.page!==page)throw new Error('页面跳转尚未确认，请检查原站，勿重复创建。')
    if(command.op==='saveDraft'){
     receipt=await host.call({op:'inspect'},undefined,state.reference,trace)
     if(!receipt.ok||!receipt.draftSaved)throw new Error('已返回列表，但本案草稿记录尚未确认，请在 Draft(s) 核对。')
    }
   }
   state.reference=receipt.reference??state.reference;state.documentId=receipt.documentId;state.next=i+1;state.status='running';
   if(trace.transportMode==='page'&&observedBefore.documentId&&observedBefore.documentId===receipt.documentId){
    const before:Record<string,number>={},after:Record<string,number>={}
    for(const key of ['applicants','creators','priorities','designs','reproductions'] as const)if(typeof observedBefore[key]==='number'&&typeof receipt[key]==='number'){before[key]=observedBefore[key];after[key]=receipt[key]}
    if(Object.keys(before).length)emitTrace(trace,'dom.observed',{documentId:receipt.documentId,domEvidenceSource:'page_receipt',domStatus:Object.keys(before).some(key=>before[key]!==after[key])?'observed_changed':'observed_unchanged',domPreviousCounts:before,domCounts:after,evidenceCodes:['BROWSER_DOM_OBSERVED']})
   }
   emitTrace(trace,'business.validated',{sideEffectMayHaveOccurred:!['prepare','summary','print','backToApplication'].includes(command.op),businessStatus:'confirmed',certainty:'confirmed',evidenceCodes:command.op==='saveDraft'?['DRAFT_LIST_MATCHED','BUSINESS_RECEIPT_VERIFIED']:['BUSINESS_RECEIPT_VERIFIED',...(state.reference?['REFERENCE_MATCHED']:[])]});emitTrace(trace,'step.completed',{durationMs:performance.now()-started,businessStatus:'completed',certainty:'confirmed'});await persist()
  }catch(error){
   const failure=normalizeDiagnosticError(error,{httpStatus:null,...receipt.diagnosticState,errorCode:'BUSINESS_UNCONFIRMED',errorStage:'business',businessStatus:'unconfirmed'},trace);state.diagnosticError=failure.diagnostic;emitTrace(trace,'step.uncertain',{...failure.diagnostic});state.status='uncertain';state.error=error instanceof Error?error.message:'操作结果不确定';await persist()
   const outcome=await recover(step.command)
   if(outcome==='completed')continue
   if(outcome==='retry'){i--;continue}
   state.status='uncertain';await persist();throw failure
  }
 }
 state.status='saved';state.stage='草稿已保存，等待人工审核';await persist();return state
}
export async function callDraftPage(tabId:number,command:DraftCommand,documentId?:string,reference?:string,trace?:TraceContext):Promise<DraftReceipt>{
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new HagueDiagnosticError({errorCode:'NETWORK_TIMEOUT',errorStage:'rpc',transportStatus:'timeout',httpStatus:null,traceId:trace?.traceId})),75000)
  chrome.runtime.sendMessage({channel:HAGUE_DRAFT_CHANNEL,tabId,documentId,reference,command,trace},(result:unknown)=>{
   clearTimeout(timer)
   if(chrome.runtime.lastError){reject(new HagueDiagnosticError({errorCode:'RPC_FAILED',errorStage:'rpc',transportStatus:'rpc_error',httpStatus:null,traceId:trace?.traceId}));return}
   if(!result||typeof result!=='object'||!('ok'in result)||typeof result.ok!=='boolean'){reject(new Error('原站回执格式无效'));return}
   resolve(result as DraftReceipt)
  })
 })
}
