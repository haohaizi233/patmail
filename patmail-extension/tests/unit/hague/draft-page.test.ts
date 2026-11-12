import { expect,it,vi } from 'vitest'
import { executeDraftPage } from '../../../src/hague/draft-page'
it.each([[12,'Pub6',''],[0,'Immediat',''],[6,'Ajourn','6 months.']] as const)('selects the prescribed publication control for %i months',async(months,expectedRadio,expectedChosen)=>{
 vi.stubGlobal('location',{origin:'https://hague.wipo.int',pathname:'/HagueEFilingWeb/protected/page/application.xhtml'})
 document.body.innerHTML='<form id="PublicationForm"><button type="button">Edit</button><input type="radio" name="publication" value="Pub6"><input type="radio" name="publication" value="Immediat"><input type="radio" name="publication" value="Ajourn"><select id="PublicationForm:comboAjourn:input"><option value="">Choose</option><option value="6 months.">6 months.</option></select><button type="button" id="PublicationForm:savePublicationBtn">Save</button></form>'
 let savedRadio='',savedChosen=''
 document.getElementById('PublicationForm:savePublicationBtn')!.addEventListener('click',()=>{savedRadio=document.querySelector<HTMLInputElement>('#PublicationForm input:checked')?.value??'';savedChosen=(document.getElementById('PublicationForm:comboAjourn:input') as HTMLSelectElement).value})
 try{expect(await executeDraftPage({op:'publication',months})).toMatchObject({ok:true});expect(savedRadio).toBe(expectedRadio);expect(savedChosen).toBe(expectedChosen)}finally{vi.unstubAllGlobals();document.body.innerHTML=''}
})
it('does not add a later applicant if an earlier applicant receipt is missing',async()=>{
 vi.stubGlobal('location',{origin:'https://hague.wipo.int',pathname:'/HagueEFilingWeb/protected/page/application.xhtml'})
 document.body.innerHTML='<form id="ApplicantForm"><button type="button" id="ApplicantForm:showApplicantForm">Add Applicant</button></form>'
 const add=vi.fn();document.getElementById('ApplicantForm:showApplicantForm')!.addEventListener('click',add)
 try{const r=await executeDraftPage({op:'applicant',index:1,email:'test@example.com',data:{name:'Second Ltd.',address:'District',city:'Shenzhen',region:'Guangdong',postalCode:'518000',country:'China'}});expect(r.ok).toBe(false);expect(add).not.toHaveBeenCalled()}finally{vi.unstubAllGlobals();document.body.innerHTML=''}
})
it('clicks Add Applicant and Save separately for every applicant and retains both records',async()=>{
 vi.stubGlobal('location',{origin:'https://hague.wipo.int',pathname:'/HagueEFilingWeb/protected/page/application.xhtml'})
 document.body.innerHTML='<form id="ApplicantForm"><button type="button" id="ApplicantForm:showApplicantForm">Add Applicant</button><div id="savedApplicants"></div></form>'
 let added=0;const names:string[]=[]
 document.getElementById('ApplicantForm:showApplicantForm')!.addEventListener('click',()=>{
  added++
  const fields=['firstname','address','cp','city','state','email'].map(k=>`<input id="ApplicantForm:${k}:input">`).join('')
  const selects=['country','nationality','domicile','establishment','residence','acp'].map(k=>`<select id="ApplicantForm:${k}:input"><option value="CN">China</option></select>`).join('')
  document.getElementById('ApplicantForm')!.insertAdjacentHTML('beforeend',`<div id="applicantEditor"><input type="radio" value="true" checked>${fields}${selects}<button type="button" id="ApplicantForm:saveAppBtn">Save</button></div>`)
  document.getElementById('ApplicantForm:saveAppBtn')!.addEventListener('click',()=>{
   names.push((document.getElementById('ApplicantForm:firstname:input') as HTMLInputElement).value)
   document.getElementById('savedApplicants')!.insertAdjacentHTML('beforeend',`<button type="button" id="ApplicantForm:applicantViewPanel:${names.length-1}:editApp">Edit</button>`)
   document.getElementById('applicantEditor')!.remove()
  })
 })
 const applicant={name:'First Ltd.',address:'No. 1, Nanshan District',city:'Shenzhen',region:'Guangdong',postalCode:'518000',country:'China'}
 try{for(const [index,name]of ['First Ltd.','Second Ltd.'].entries()){const r=await executeDraftPage({op:'applicant',index,email:'test@example.com',data:{...applicant,name}});expect(r.ok).toBe(true);expect(r.applicants).toBe(index+1)}expect(added).toBe(2);expect(names).toEqual(['First Ltd.','Second Ltd.'])}finally{vi.unstubAllGlobals();document.body.innerHTML=''}
})
it('continues an already-open description editor without opening or duplicating another record',async()=>{
 vi.stubGlobal('location',{origin:'https://hague.wipo.int',pathname:'/HagueEFilingWeb/protected/page/application.xhtml'})
 document.body.innerHTML='<form id="DescriptionForm"><button type="button">Select all</button><textarea id="DescriptionForm:texto:input"></textarea><button type="button" id="DescriptionForm:save">Save</button></form>'
 let saved=''
 document.getElementById('DescriptionForm:save')!.addEventListener('click',()=>{saved=(document.getElementById('DescriptionForm:texto:input') as HTMLTextAreaElement).value;document.getElementById('DescriptionForm')!.innerHTML='saved'})
 try{expect(await executeDraftPage({op:'description',text:'Actual filing description'})).toMatchObject({ok:true});expect(saved).toBe('Actual filing description')}finally{vi.unstubAllGlobals();document.body.innerHTML=''}
})
it('refuses a different WIPO reference before changing the page',async()=>{
 vi.stubGlobal('location',{origin:'https://hague.wipo.int',pathname:'/HagueEFilingWeb/protected/page/application.xhtml'})
 document.body.innerHTML='<h1>WIPO reference 999</h1>';document.title='WIPO reference 999'
 try{const result=await executeDraftPage({op:'signature',reference:'PO1HAGUE',representative:'CENFO'},'123');expect(result.ok).toBe(false);expect(result.error).toContain('reference')}finally{vi.unstubAllGlobals();document.body.innerHTML=''}
})
it('fills priority values after Ajax selections and omits an invalid DAS with a review warning',async()=>{
 vi.stubGlobal('location',{origin:'https://hague.wipo.int',pathname:'/HagueEFilingWeb/protected/page/application.xhtml'})
 document.body.innerHTML='<form id="PriorityForm"><select id="PriorityForm:office"><option value="CN - China">CN - China</option></select><input id="PriorityForm:nbFiling:input"><input id="PriorityForm:date:input_input"><input id="PriorityForm:dascode:input"><button type="button">Select all</button><button type="button" id="PriorityForm:save">Save</button></form>'
 const number=()=>document.getElementById('PriorityForm:nbFiling:input') as HTMLInputElement
 document.querySelector('#PriorityForm select')!.addEventListener('change',()=>{number().value=''})
 document.querySelector('#PriorityForm button')!.addEventListener('click',()=>{number().value=''})
 let savedNumber='',savedDas=''
 document.getElementById('PriorityForm:save')!.addEventListener('click',()=>{savedNumber=number().value;savedDas=(document.getElementById('PriorityForm:dascode:input') as HTMLInputElement).value;document.getElementById('PriorityForm')!.innerHTML='saved'})
 try{const r=await executeDraftPage({op:'priority',index:0,data:{number:'202637387453.2',date:'2026-11-11',country:'CN',das:'111'}});expect(r.ok).toBe(true);expect(savedNumber).toBe('202637387453.2');expect(savedDas).toBe('');expect(r.warnings?.join()).toContain('四位格式')}finally{vi.unstubAllGlobals();document.body.innerHTML=''}
})
it('finds a reproduction beyond page ten by filename and maps its legend by name',async()=>{
 vi.stubGlobal('location',{origin:'https://hague.wipo.int',pathname:'/HagueEFilingWeb/protected/page/application.xhtml'})
 document.body.innerHTML='<form id="designForm"><table><tbody id="designForm:reproDT_data"><tr data-ri="0"><td></td><td>1</td><td>1.1.jpg</td></tr></tbody></table></form>'
 let page=-1,legend=''
 vi.stubGlobal('PrimeFaces',{ajax:{Queue:{isEmpty:()=>true}},widgets:{reproDTW:{cfg:{paginator:{rows:10,rowCount:11}},getPaginator:()=>({setPage:(value:number)=>{
  page=value;document.getElementById('designForm:reproDT_data')!.innerHTML='<tr data-ri="10"><td></td><td>11</td><td>1.11.jpg</td><td><button type="button" title="Open/edit">Edit</button></td></tr>'
  document.querySelector('#designForm button')!.addEventListener('click',()=>{
   document.getElementById('designForm')!.insertAdjacentHTML('beforeend','<select id="designForm:legend:input"><option value="12">Enlarged view</option></select><button type="button" id="saveLegend">Save</button>')
   document.getElementById('saveLegend')!.addEventListener('click',()=>{legend=(document.getElementById('designForm:legend:input') as HTMLSelectElement).value})
  })
 }})}}})
 try{const r=await executeDraftPage({op:'legend',name:'1.11.jpg',label:'Enlarged'});expect(r.ok).toBe(true);expect(page).toBe(1);expect(legend).toBe('12')}finally{vi.unstubAllGlobals();document.body.innerHTML=''}
})
