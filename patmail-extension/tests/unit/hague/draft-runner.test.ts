import { expect,it,vi } from 'vitest'
import { draftSteps,runDraftPlan } from '../../../src/hague/draft-runner'
import type { DraftPlan } from '../../../src/hague/draft-plan'
const plan:DraftPlan={reference:'PO1HAGUE',applicants:[],creators:[],parties:['EM'],publicationMonths:6,priorities:[],locarno:'28',description:'text',designs:[]}
it('stops on an uncertain write, preserving the WIPO reference and never retrying or printing',async()=>{
 const call=vi.fn(async(c:{op:string})=>{if(c.op==='inspect')return {ok:true,page:'application' as const,reference:'123',documentId:'doc'};throw new Error('network lost')})
 const save=vi.fn(async(_value:unknown)=>{})
 await expect(runDraftPlan(plan,7,{call,save},undefined,{tabId:7,reference:'123',documentId:'doc',next:2,total:draftSteps(plan).length,status:'stopped',stage:''})).rejects.toMatchObject({diagnostic:{errorCode:'BUSINESS_UNCONFIRMED',httpStatus:null}})
 expect(call.mock.calls.filter(([c])=>c.op!=='inspect')).toHaveLength(1)
 expect(save.mock.calls.at(-1)?.[0]).toMatchObject({reference:'123',next:2,status:'uncertain'})
})
it('orders summary and print before saving the draft and never includes payment or filing',()=>{
 const ops=draftSteps(plan).map(s=>s.command.op)
 expect(ops.slice(-4)).toEqual(['summary','print','backToApplication','saveDraft'])
 expect(ops).not.toContain('pay');expect(ops).not.toContain('submit')
})
it('skips the optional description form when the material has no Description',()=>{
 expect(draftSteps({...plan,description:''}).some(s=>s.command.op==='description')).toBe(false)
})
it('adds every applicant independently and completes each image group before adding the next design',()=>{
 const applicant={name:'First Ltd.',address:'No. 1, Nanshan District',city:'Shenzhen',region:'Guangdong',postalCode:'518000',country:'China'}
 const image=(number:string)=>({number,legend:'Front',file:new File(['jpg'],`${number}.jpg`)})
 const steps=draftSteps({...plan,applicants:[applicant,{...applicant,name:'Second Ltd.'}],designs:[{number:'1',subclass:'3',product:'First product',images:[image('1.1'),image('1.2')]},{number:'2',subclass:'3',product:'Second product',images:[image('2.1'),image('2.2')]}]})
 expect(steps.filter(s=>s.command.op==='applicant').map(s=>s.command)).toEqual([{op:'applicant',data:applicant,index:0,email:'hccx2005@126.com'},{op:'applicant',data:{...applicant,name:'Second Ltd.'},index:1,email:'hccx2005@126.com'}])
 const grouped=steps.filter(s=>['design','upload','legend','closeDesign'].includes(s.command.op)).map(s=>s.command)
 expect(grouped).toEqual([
  {op:'design',index:0,subclass:'3',product:'First product'},
  {op:'upload',name:'1.1.jpg',base64:'',mime:'image/jpeg',count:0},{op:'legend',name:'1.1.jpg',label:'Front'},
  {op:'upload',name:'1.2.jpg',base64:'',mime:'image/jpeg',count:1},{op:'legend',name:'1.2.jpg',label:'Front'},{op:'closeDesign'},
  {op:'design',index:1,subclass:'3',product:'Second product'},
  {op:'upload',name:'2.1.jpg',base64:'',mime:'image/jpeg',count:0},{op:'legend',name:'2.1.jpg',label:'Front'},
  {op:'upload',name:'2.2.jpg',base64:'',mime:'image/jpeg',count:1},{op:'legend',name:'2.2.jpg',label:'Front'},{op:'closeDesign'}
 ])
})
it('recovers a completed final save using the exact draft-list receipt without another write',async()=>{
 const total=draftSteps(plan).length
 const call=vi.fn(async()=>({ok:true,page:'portfolio' as const,draftSaved:true,documentId:'list-doc'}))
 const result=await runDraftPlan(plan,7,{call,save:async()=>{}},undefined,{tabId:7,reference:'123',next:total,total,status:'stopped',stage:'已由用户核对本步完成'})
 expect(result.status).toBe('saved');expect(call).toHaveBeenCalledOnce()
})
it('resumes a confirmed running boundary at its recorded next step without skipping it',async()=>{
 const call=vi.fn(async(c:{op:string})=>{if(c.op==='inspect')return {ok:true,page:'application' as const,reference:'123',documentId:'doc'};throw new Error('stop at first write')})
 await expect(runDraftPlan(plan,7,{call,save:async()=>{}},undefined,{tabId:7,reference:'123',next:2,total:draftSteps(plan).length,status:'running',stage:'创建新草稿'})).rejects.toMatchObject({diagnostic:{errorCode:'BUSINESS_UNCONFIRMED',httpStatus:null}})
 expect(call.mock.calls[1]?.[0].op).toBe(draftSteps(plan)[2].command.op)
})
