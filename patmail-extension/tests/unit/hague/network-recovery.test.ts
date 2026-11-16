import {expect,it,vi} from 'vitest'
import {HagueHttpDriver} from '../../../src/hague/http-driver'
const checkpoint={tabId:7,reference:'123',next:20,total:31,status:'uncertain' as const,stage:'',planKey:'same-material'}
const creator={op:'creator' as const,index:0,givenName:'San',familyName:'ZHANG',address:{name:'Company',address:'One Road',city:'City',region:'Region',postalCode:'12345',country:'CN'}}
function driver(body:string){
 const d=new HagueHttpDriver('network-recovery',async()=>{throw Error('unexpected network')})
 d.resume=async()=>d.state.load('<title>WIPO reference 123</title>'+body,'/HagueEFilingWeb/protected/page/application.xhtml')
 ;(d as unknown as {remote:(name:string)=>Promise<void>}).remote=async()=>{}
 return d
}
it('can retry an applicant only after finding its slot absent in the saved canonical list',async()=>{
 const d=driver('<form id="ApplicantForm"><button type="button" id="ApplicantForm:showApplicantForm">Add</button></form>')
 expect(await d.recoverStep({op:'applicant',index:0,data:creator.address,email:'draft@example.test'},{...checkpoint,next:2})).toMatchObject({outcome:'retry',receipt:{applicants:0}})
 expect(await d.recoverStep({op:'applicant',index:1,data:creator.address,email:'draft@example.test'},{...checkpoint,next:3})).toMatchObject({outcome:'unknown'})
})
it('only authorizes an absent creator when the canonical list has the expected preceding count',async()=>{
 const d=driver('<form id="CreatorForm"><button id="CreatorForm:addCreator">Add</button></form>')
 expect(await d.recoverStep(creator,checkpoint)).toMatchObject({outcome:'retry',receipt:{creators:0,reference:'123'}})
 expect(await d.recoverStep({...creator,index:2},checkpoint)).toMatchObject({outcome:'unknown'})
})
it.each([false,true])('reads every saved creator field and design association before accepting it (mismatch=%s)',async mismatch=>{
 const d=driver('<form id="CreatorForm"><button type="button" title="Open/edit">Edit</button></form>')
 const resume=d.resume.bind(d);d.resume=async ref=>{await resume(ref);d.state.document.querySelector('button')!.addEventListener('click',()=>{
  const fields={name:'San',lastname:mismatch?'LI':'ZHANG',address:'One Road',cp:'12345',city:'City',state:'Region',country:'CN - China'}
  d.state.document.getElementById('CreatorForm')!.innerHTML=Object.entries(fields).map(([k,v])=>`<input id="CreatorForm:${k}:input" value="${v}">`).join('')+'<input type="checkbox" checked><button type="button">Cancel</button>'
  d.state.document.querySelector('button')!.addEventListener('click',()=>{d.state.document.getElementById('CreatorForm')!.innerHTML='<button type="button" title="Open/edit">Edit</button>'})
 })}
 expect(await d.recoverStep(creator,checkpoint)).toMatchObject({outcome:mismatch?'unknown':'completed'})
 expect(d.state.document.getElementById('CreatorForm:name:input')).toBeNull()
})
it('only reopens the exact uniquely named reproduction for an idempotent legend replacement',async()=>{
 const d=driver('<form id="designForm"></form>')
 const call=vi.spyOn(d,'call').mockImplementation(async command=>{expect(command).toEqual({op:'openDesign',index:0});d.state.document.getElementById('designForm')!.innerHTML='<table><tbody id="designForm:reproDT_data"><tr data-ri="0"><td>1</td><td></td><td>1.1.jpg</td></tr></tbody></table>';return{ok:true,page:'application',reference:'123'}})
 expect(await d.recoverStep({op:'legend',name:'1.1.jpg',label:'Front'},checkpoint)).toMatchObject({outcome:'retry',receipt:{reference:'123'}})
 expect(call).toHaveBeenCalledOnce()
 expect(await d.recoverStep({op:'legend',name:'1.2.jpg',label:'Back'},checkpoint)).toMatchObject({outcome:'unknown'})
})

