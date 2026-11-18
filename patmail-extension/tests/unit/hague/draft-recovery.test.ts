import { expect,it } from 'vitest'
import { inspectPriorityRecovery } from '../../../src/hague/draft-recovery'
const command={op:'priority' as const,index:0,data:{country:'CN',number:'202630000001.1',date:'2026-10-01',das:''}}
function doc(body:string){return new DOMParser().parseFromString(`<form id="PriorityForm"><button id="PriorityForm:AddPriority">Add</button>${body}</form>`,'text/html')}
it('advances only for an exact saved priority number, date, country and record count',()=>{
 const html='<table><tr><td>CN - China</td><td>202630000001.1</td><td>01/10/2026</td><td><button title="Open/edit">Edit</button></td></tr></table>'
 expect(inspectPriorityRecovery(doc(html),command,'123').outcome).toBe('completed')
 expect(inspectPriorityRecovery(doc(html.replace('01/10/2026','02/10/2026')),command,'123').outcome).toBe('unknown')
 expect(inspectPriorityRecovery(doc(html.replace('CN - China','SG - Singapore')),command,'123').outcome).toBe('unknown')
 expect(inspectPriorityRecovery(doc(html.replace('CN - China','Hong Kong, China')),command,'123').outcome).toBe('unknown')
 expect(inspectPriorityRecovery(doc(html+html),command,'123').outcome).toBe('unknown')
})
it('retries only a confirmed absent next record in an intact canonical section',()=>{
 expect(inspectPriorityRecovery(doc(''),command,'123').outcome).toBe('retry')
 expect(inspectPriorityRecovery(doc(''),{...command,index:1},'123').outcome).toBe('unknown')
 expect(inspectPriorityRecovery(new DOMParser().parseFromString('','text/html'),command,'123').outcome).toBe('unknown')
})
