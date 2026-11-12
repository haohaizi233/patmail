import { expect, it } from 'vitest'
import { runDraftBatch } from '../../../src/hague/draft-batch'
import type { HagueRow } from '../../../src/hague/workflow'
import type { DraftCheckpoint } from '../../../src/hague/draft-contract'
import type { DraftPlan } from '../../../src/hague/draft-plan'

const row=(n:number):HagueRow=>({folder:{caseVolume:`PO${n}HAGUE`,path:`case${n}`,documents:[],images:[],issues:[]},state:'review',confirmed:false,error:''})
const plan=(r:HagueRow)=>({reference:r.folder.caseVolume,applicants:[],creators:[],parties:['EM'],publicationMonths:6,priorities:[],locarno:'28',description:'',designs:[]}) as DraftPlan
const checkpoint=(tabId:number,status:DraftCheckpoint['status']='saved'):DraftCheckpoint=>({tabId,status,next:10,total:10,stage:'test'})

it('fills six independent lanes, replaces a finished job immediately and never shares active tabs',async()=>{
 let opened=0,active=0,max=0;const occupied=new Set<number>(),started:number[]=[];const releases:Array<()=>void>=[]
 const work=runDraftBatch(Array.from({length:8},(_,i)=>row(i+1)),6,{
  plan,open:async()=>++opened,
  run:async(r,_p,tabId,update)=>{expect(occupied.has(tabId)).toBe(false);occupied.add(tabId);active++;max=Math.max(max,active);started.push(Number(r.folder.caseVolume.match(/\d+/)![0]));await new Promise<void>(resolve=>releases.push(resolve));active--;occupied.delete(tabId);const c=checkpoint(tabId);update(c);return c},
  save:async(r,c)=>{r.draft=c}
 })
 await new Promise(r=>setTimeout(r,0));expect(started).toHaveLength(6)
 releases[0]();await new Promise(r=>setTimeout(r,0));expect(started).toHaveLength(7)
 for(let i=1;i<8;i++){releases[i]?.();await new Promise(r=>setTimeout(r,0))}
 const result=await work;expect(max).toBe(6);expect(opened).toBe(6);expect(result.succeeded).toBe(8);expect(result.active).toBe(0);expect(result.done).toBe(result.total)
})

it('keeps a failed tab for inspection and continues the next case in a fresh tab',async()=>{
 let opened=0;const tabs:number[]=[],kinds:string[]=[]
 const result=await runDraftBatch([row(1),row(2)],1,{plan,open:async()=>++opened,run:async(r,_p,tab)=>{tabs.push(tab);if(r.folder.caseVolume==='PO1HAGUE')throw new Error('uncertain write');return checkpoint(tab)},save:async()=>{},error:(_r,_message,kind)=>kinds.push(kind)})
 expect(tabs).toEqual([1,2]);expect(result.failed).toBe(1);expect(result.succeeded).toBe(1)
 expect(kinds).toEqual(['failed'])
})

it('resumes on the checkpoint tab, skips saved/uncertain/invalid cases and reports reasons',async()=>{
 const rows=[row(1),row(2),row(3),row(4)];rows[0].draft=checkpoint(9,'stopped');rows[1].draft=checkpoint(2);rows[2].draft=checkpoint(3,'uncertain')
 const errors:string[]=[],kinds:string[]=[];const tabs:number[]=[]
 const result=await runDraftBatch(rows,6,{plan:r=>{if(r===rows[3])throw new Error('邮编缺失');return plan(r)},open:async()=>{throw new Error('must not open')},run:async(_r,_p,tab)=>{tabs.push(tab);return checkpoint(tab)},save:async()=>{},error:(_r,message,kind)=>{errors.push(message);kinds.push(kind)}})
 expect(tabs).toEqual([9]);expect(result.succeeded).toBe(1);expect(result.skipped).toBe(3);expect(errors.join()).toMatch(/核对/);expect(errors.join()).toContain('邮编')
 expect(kinds).toEqual(['skipped','skipped'])
})

it('stops taking cases while allowing active steps to return and preserves actual progress',async()=>{
 const controller=new AbortController();let runs=0
 const result=await runDraftBatch([row(1),row(2),row(3)],1,{plan,open:async()=>1,run:async(_r,_p,tab,update)=>{runs++;controller.abort();const c={...checkpoint(tab,'stopped'),next:2};update(c);return c},save:async()=>{}},controller.signal)
 expect(runs).toBe(1);expect(result.succeeded).toBe(0);expect(result.stopped).toBe(true);expect(result.done).toBe(2);expect(result.settled).toBe(0)
})

it('rejects duplicate case references and shared resume tabs before writing',async()=>{
 const rows=[row(1),row(1),row(2),row(3)];rows[2].draft=checkpoint(9,'stopped');rows[3].draft=checkpoint(9,'stopped')
 let runs=0
 const result=await runDraftBatch(rows,6,{plan,open:async()=>1,run:async()=>{runs++;throw new Error('must not run')},save:async()=>{}})
 expect(runs).toBe(0);expect(result.skipped).toBe(4)
})
it('stops scheduling on login expiry and caps an excessive concurrency request at six',async()=>{
 let opened=0,runs=0
 const result=await runDraftBatch(Array.from({length:12},(_,i)=>row(i)),99,{plan,open:async()=>++opened,run:async()=>{runs++;throw new Error('eHague 登录已失效')},save:async()=>{}})
 expect(opened).toBe(6);expect(runs).toBe(6);expect(result.stopped).toBe(true);expect(result.settled).toBe(6)
})
it('reuses a resumed tab for a fresh case only after the resumed draft is saved',async()=>{
 const resumed=row(1);resumed.draft=checkpoint(9,'stopped');const tabs:number[]=[]
 const result=await runDraftBatch([resumed,row(2)],1,{plan,open:async()=>{throw new Error('should reuse saved tab')},run:async(_r,_p,tab)=>{tabs.push(tab);return checkpoint(tab)},save:async(r,c)=>{r.draft=c}})
 expect(result.succeeded).toBe(2);expect(result.failed).toBe(0);expect(tabs).toEqual([9,9])
})
