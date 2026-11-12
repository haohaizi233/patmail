import type { HagueRow } from './workflow'
import { buildDraftPlan, type DraftPlan } from './draft-plan'
import type { DraftCheckpoint } from './draft-contract'
import { draftSteps } from './draft-runner'

export interface DraftBatchProgress {
  cases:number; settled:number; succeeded:number; failed:number; skipped:number
  active:number; done:number; total:number; stopped:boolean
}
interface Host {
  transport?:'http'|'page'
  plan?(row:HagueRow):DraftPlan
  open():Promise<number>
  run(row:HagueRow,plan:DraftPlan,tabId:number,update:(value:DraftCheckpoint)=>void):Promise<DraftCheckpoint>
  save(row:HagueRow,value:DraftCheckpoint):Promise<void>
  error?(row:HagueRow,message:string,kind:'skipped'|'failed'):void
  update?(progress:DraftBatchProgress):void
}
/** One independent tab per active case. A slot is reused as soon as its case settles. */
export async function runDraftBatch(rows:readonly HagueRow[],concurrency:number,host:Host,signal?:AbortSignal):Promise<DraftBatchProgress> {
  const limit=Math.max(1,Math.min(6,Math.floor(concurrency)||1))
  const state:DraftBatchProgress={cases:rows.length,settled:0,succeeded:0,failed:0,skipped:0,active:0,done:0,total:0,stopped:false}
  const progress=new Map<HagueRow,number>(),claimed=new Set<number>()
  const refCounts=new Map<string,number>(),tabCounts=new Map<number,number>()
  for(const row of rows){const key=row.folder.caseVolume.trim().toUpperCase();refCounts.set(key,(refCounts.get(key)??0)+1);if(row.draft&&row.draft.status!=='saved')tabCounts.set(row.draft.tabId,(tabCounts.get(row.draft.tabId)??0)+1)}
  const jobs:Array<{row:HagueRow;plan:DraftPlan;total:number}>=[]
  const emit=()=>{state.done=[...progress.values()].reduce((a,b)=>a+b,0);host.update?.({...state})}
  for(const row of rows){
    try{
      if(row.draft?.status==='saved'){state.skipped++;continue}
      if(row.draft&&row.draft.next>0&&(row.draft.transport??'page')!==(host.transport??'page'))throw new Error('检查点执行模式不同，请使用原模式继续，未重复创建。')
      if((refCounts.get(row.folder.caseVolume.trim().toUpperCase())??0)>1)throw new Error('同文号存在多个材料版本，请选择唯一版本后填写，未并发创建重复草稿。')
      if(row.draft?.status==='uncertain')throw new Error('草稿步骤结果待核对，请先确认原站是否已执行，未自动重试。')
      if(host.transport!=='http'&&row.draft&&(tabCounts.get(row.draft.tabId)??0)>1)throw new Error('多个检查点指向同一标签页，请先核对目标草稿，未交错写入。')
      const plan=(host.plan??buildDraftPlan)(row),total=draftSteps(plan).length
      jobs.push({row,plan,total});state.total+=total;progress.set(row,Math.min(row.draft?.next??0,total))
    }catch(error){state.skipped++;host.error?.(row,error instanceof Error?error.message:'材料未就绪','skipped')}
  }
  state.settled=state.skipped;emit()
  const reserved=new Set(jobs.flatMap(j=>j.row.draft?[j.row.draft.tabId]:[]))
  let cursor=0,sessionLost=false
  await Promise.all(Array.from({length:Math.min(limit,jobs.length)},async()=>{
    let reusable:number|undefined
    while(cursor<jobs.length&&!signal?.aborted&&!sessionLost){
      const {row,plan,total}=jobs[cursor++];state.active++;emit()
      let tabId:number|undefined,owned=false
      try{
        tabId=row.draft?.tabId??reusable??await host.open()
        if(!Number.isSafeInteger(tabId)||tabId<0||host.transport!=='http'&&(claimed.has(tabId)||!row.draft&&reserved.has(tabId)))throw new Error('目标标签页已被其他案件占用，未交错写入。')
        if(host.transport!=='http'){claimed.add(tabId);owned=true}
        if(signal?.aborted){state.stopped=true;break}
        if(row.draft?.status==='running')row.draft={...row.draft,status:'stopped'}
        const result=await host.run(row,plan,tabId,value=>{progress.set(row,Math.max(progress.get(row)??0,Math.min(value.next,total)));emit()})
        await host.save(row,result)
        if(result.status==='saved'){reserved.delete(tabId);progress.set(row,total);state.succeeded++;state.settled++;reusable=tabId}
        else{state.stopped=true;reusable=undefined;break}
      }catch(error){
        reusable=undefined // Preserve a failed editor; never navigate it into another case.
        state.failed++;state.settled++
        const message=error instanceof Error?error.message:'草稿操作失败'
        host.error?.(row,message,'failed')
        if(/登录|login|session.*(?:expired|invalid)/i.test(message)){sessionLost=true;state.stopped=true}
      }finally{if(owned&&tabId!==undefined)claimed.delete(tabId);state.active--;emit()}
    }
  }))
  state.stopped ||= !!signal?.aborted
  emit();return {...state}
}
