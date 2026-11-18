import {expect,it} from 'vitest'
import {ResearchOutputBudget,safeAnalysisOutput} from '../../../scripts/hague-research-output.mjs'
it('caps analysis rate and backlog without retrying failed writes or blocking status',async()=>{
 let clock=0,writes=0,release:()=>void=()=>{}
 const budget=new ResearchOutputBudget({maxPerMinute:2,maxPending:2,now:()=>clock})
 const blocked=()=>{writes++;return new Promise<void>(resolve=>{release=resolve})}
 expect(budget.submit('hague.research',{},blocked)).toBe(true)
 expect(budget.submit('hague.research',{},()=>{writes++;return Promise.resolve()})).toBe(true)
 expect(budget.submit('hague.research',{},blocked)).toBe(false)
 await Promise.resolve();await Promise.resolve();await Promise.resolve()
 expect(budget.submit('hague.research',{},blocked)).toBe(false)
 expect(budget.submit('hague.research',{phase:'research.status'},()=>Promise.resolve())).toBe(true)
 release();await Promise.resolve();await Promise.resolve();await Promise.resolve()
 clock=60000;expect(budget.submit('hague.research',{},()=>{writes++;throw new Error('disk unavailable')})).toBe(false)
 expect(writes).toBe(3);expect(budget.dropped).toBe(3);expect(budget.peakPending).toBeLessThanOrEqual(2)
})
it('sanitizes before output admission and never hashes secret values into durable fields',()=>{
 expect(JSON.stringify(safeAnalysisOutput({source:'hague',scriptHash:'a'.repeat(64),callCount:2,path:'/private/SECRET',body:'SECRET',headers:{Cookie:'SECRET'}}))).not.toContain('SECRET')
 const budget=new ResearchOutputBudget({maxBytes:4});let calls=0
 expect(budget.submit('hague.research',{count:1000},()=>{calls++})).toBe(false);expect(calls).toBe(0)
})
