import { expect,it } from 'vitest'
import { HagueHttpDriver,jsfAction } from '../../../src/hague/http-driver'
it('does not treat an initial saved draft as final save proof without a matching acknowledgement',async()=>{
 let reads=0;const d=new HagueHttpDriver('proof',async()=>{reads++;throw new Error('must not request')})
 const checkpoint={tabId:7,reference:'123',next:10,total:11,status:'uncertain' as const,stage:'保存为草稿'}
 expect(await d.recoverStep({op:'saveDraft'},checkpoint)).toMatchObject({outcome:'unknown'})
 expect(await d.recoverStep({op:'saveDraft'},{...checkpoint,acknowledged:{next:9,op:'saveDraft',page:'portfolio'}})).toMatchObject({outcome:'unknown'})
 expect(await d.recoverStep({op:'create'},checkpoint)).toMatchObject({outcome:'unknown'})
 expect(reads).toBe(0)
})
it('resumes the exact existing reference from a later Drafts table page',async()=>{
 const page=`<html><body><form id="quickSearchPanel"><input name="javax.faces.ViewState" value="A"><button id="quickSearchPanel:drafts" class="filtered" type="button" onclick='PrimeFaces.ab({s:"quickSearchPanel:drafts"});'>Draft(s)</button></form><form id="portfolio"><div id="portfolio:enCours" class="ui-datatable"><table><tbody id="portfolio:enCours_data"><tr><td>WIPO999</td></tr></tbody></table></div><script>PrimeFaces.cw("DataTable","widget_portfolio_enCours",{id:"portfolio:enCours",paginator:{rows:1,rowCount:2,page:0}})</script></form></body></html>`
 const requests:string[]=[]
 const c=new HagueHttpDriver('resume',async(_url,init)=>{
  if(init?.method==='GET')return new Response(page)
  const p=new URLSearchParams(typeof init?.body==='string'?init.body:'');requests.push(p.get('javax.faces.source')??'')
  if(p.get('portfolio:enCours_first')==='1')return new Response(`<partial-response><changes><update id="portfolio:enCours"><![CDATA[<tr><td>WIPO123</td><td><button type="button" id="portfolio:open" title="Open/edit" onclick='PrimeFaces.ab({s:"portfolio:open"});'>Open</button></td></tr>]]></update></changes></partial-response>`)
  if(p.get('javax.faces.source')==='portfolio:open')return new Response('<partial-response><redirect url="/HagueEFilingWeb/protected/page/application.xhtml"/></partial-response>')
  return new Response('<partial-response><changes/></partial-response>')
 })
 const fetcher=c.state as unknown as {get:(path?:string)=>Promise<void>}
 const original=fetcher.get.bind(fetcher)
 fetcher.get=async path=>{if(path?.endsWith('application.xhtml')){c.state.load('<html><head><title>WIPO reference 123</title></head><body></body></html>',path);return}await original(path)}
 await c.initialize()
 expect(await c.call({op:'inspect'},'123')).toMatchObject({ok:true,page:'portfolio',draftSaved:true})
 await c.resume('123')
 expect(c.state.reference).toBe('123');expect(requests).toContain('portfolio:enCours')
})
it('keeps designation selection across a remoteCommand form replacement',async()=>{
 const codes=['US','EM','GB','JP'],selected=new Set<string>()
 const form=()=>`<form id="Designationform"><input type="hidden" name="javax.faces.ViewState" value="A"><button id="Designationform:desPanel:changeDesignationsSelection" type="button" onclick='PrimeFaces.ab({s:"Designationform:desPanel:changeDesignationsSelection",u:"Designationform"});'>Change</button>${codes.map(c=>`<input type="checkbox" onclick="selectOffice([{name: 'param', value: '${c}'}]);" ${selected.has(c)?'checked="checked"':''}>`).join('')}<button type="button">Ok</button><script id="Designationform:remote">selectOffice = function() {PrimeFaces.ab({s:"Designationform:remote",f:"Designationform",u:"Designationform",onst:function(cfg){window.tempScrollTop = $(window).scrollTop();},onco:function(xhr,status,args){setTimeout(function() {$(window).scrollTop(tempScrollTop)}, 200);},pa:arguments[0]});}</script></form>`
 const c=new HagueHttpDriver('designation',async(_url,init)=>{const p=new URLSearchParams(typeof init?.body==='string'?init.body:'');const code=p.get('param');if(code){if(selected.has(code))selected.delete(code);else selected.add(code)}return new Response(`<partial-response><changes><update id="Designationform"><![CDATA[${form()}]]></update></changes></partial-response>`)})
 c.state.load(`<html><body>${form()}</body></html>`,'/HagueEFilingWeb/protected/page/application.xhtml')
 const checkbox=c.state.document.querySelector('input[type=checkbox]') as HTMLElement
 expect(jsfAction(checkbox.getAttribute('onclick')!,checkbox,c.state.document)?.params).toEqual({param:'US'})
 const receipt=await c.call({op:'parties',codes})
 expect([...selected]).toEqual(codes)
 expect(receipt.ok,receipt.error).toBe(true)
})
it('maps the native Mojarra subclass callback and mirrors the site autocomplete hidden value',()=>{
 const c=new HagueHttpDriver('fields')
 c.state.load('<html><body><input id="p:inputAutoComplete:input"><input id="p:inputHidden" type="hidden"></body></html>','/HagueEFilingWeb/protected/page/application.xhtml')
 const input=c.state.document.getElementById('p:inputAutoComplete:input') as HTMLInputElement
 input.value='Actual product';input.dispatchEvent(new Event('input',{bubbles:true}))
 expect(c.state.document.getElementById('p:inputHidden')).toHaveProperty('value','Actual product')
 expect(jsfAction("mojarra.ab(this,event,'change','designForm:selectSubClass','designForm:productIndication')",input,c.state.document)).toEqual({source:input.id,event:'change',process:'designForm:selectSubClass',update:'designForm:productIndication'})
})
it('preserves radio preactivation when serializing a detached JSF click',async()=>{
 let legal:string|null=null
 const c=new HagueHttpDriver('a',async(_url,init)=>{legal=new URLSearchParams((typeof init?.body==='string'?init.body:'')).get('form:legal');return new Response('<partial-response><changes/></partial-response>')})
 c.state.load('<html><head><title>WIPO reference 111</title></head><body><form id="form"><input name="javax.faces.ViewState" value="A" type="hidden"><input id="form:legal:0" name="form:legal" type="radio" value="true" onclick="PrimeFaces.ab({s:this,e:\'click\',p:\'form:legal\',u:\'form\'});"><input name="form:legal" type="radio" value="false" checked></form></body></html>','/HagueEFilingWeb/protected/page/application.xhtml')
 ;(c.state.document.getElementById('form:legal:0') as HTMLInputElement).click()
 await c.state.settle();expect(legal).toBe('true')
})

it('includes the returned create-page validation text when no editor is confirmed',async()=>{
 const d=new HagueHttpDriver('create-error',async()=>new Response('<partial-response><changes><update id="portfolio"><![CDATA[<form id="portfolio"><div class="ui-messages-error">Choose the filing language.</div></form>]]></update></changes></partial-response>'))
 d.state.load(`<html><body><form id="portfolio"><input type="hidden" name="javax.faces.ViewState" value="A"><button type="button" id="portfolio:create" onclick='PrimeFaces.ab({s:"portfolio:create",p:"portfolio",u:"portfolio"});'>Confirm</button></form></body></html>`,'/HagueEFilingWeb/protected/portfolioManager.xhtml')
 await expect(d.call({op:'create'})).rejects.toThrow(/Choose the filing language/)
})

it('extracts the sole save request when a confirmation handler also hides its dialog',()=>{
 const d=new HagueHttpDriver('save-dialog');d.state.load('<form id="headerForm"><input name="javax.faces.ViewState" value="A"><button id="headerForm:yes">Yes</button></form>','/HagueEFilingWeb/protected/page/application.xhtml')
 const button=d.state.document.getElementById('headerForm:yes')!
 expect(jsfAction(`PrimeFaces.ab({s:"headerForm:yes",f:"headerForm",p:"headerForm",u:"headerForm"});PF('saveDialog').hide();return false;`,button,d.state.document)).toMatchObject({source:'headerForm:yes',form:'headerForm',process:'headerForm',update:'headerForm'})
 for(const suffix of [`PF('saveDialog').deleteDraft();`,`PF(dynamicName).hide();`,`PF('saveDialog').hide(fetch('/write'));`,`var PF=custom;PF('saveDialog').hide();`,`new (PF('saveDialog').hide)();`])expect(()=>jsfAction(`PrimeFaces.ab({s:"headerForm:yes"});${suffix}`,button,d.state.document)).toThrow(/协议/)
})

it('saves the allocated draft once through the observed bcn loading and AJAX wrapper',async()=>{
 const sent:string[]=[]
 const driver=new HagueHttpDriver('initial-save',async(_url,init)=>{
  if(init?.method==='POST'){
   const params=new URLSearchParams(typeof init.body==='string'?init.body:'');sent.push(params.get('javax.faces.source')??'')
   return new Response('<partial-response><redirect url="/HagueEFilingWeb/protected/portfolioManager.xhtml"/></partial-response>')
  }
  const response=new Response('<form id="quickSearchPanel"><button class="filtered">Draft(s)</button></form><form id="portfolio"><input name="javax.faces.ViewState" value="B"><table><tbody><tr><td>WIPO123</td></tr></tbody></table></form>')
  Object.defineProperty(response,'url',{value:'https://hague.wipo.int/HagueEFilingWeb/protected/portfolioManager.xhtml'});return response
 })
 driver.state.load(`<html><head><title>WIPO reference 123</title></head><body><form id="headerForm"><input name="javax.faces.ViewState" value="A"><button type="button" id="headerForm:backApp" onclick="PF('saveDialog').show();return false;">Close</button><div class="ui-dialog">Draft(s)<button type="button" id="headerForm:yes" onclick="PrimeFaces.bcn(this,event,[function(event){showBlockUIOnSend('');},function(event){PrimeFaces.ab({s:'headerForm:yes',f:'headerForm',onco:function(xhr,status,args){PF('saveDialog').hide();}});return false;}]);">Yes</button></div></form></body></html>`,'/HagueEFilingWeb/protected/page/application.xhtml')
 expect(await driver.call({op:'inspect'})).toMatchObject({reference:'123',page:'application'});
 const result=await driver.call({op:'saveDraft'},'123');expect(result.error).toBeUndefined();expect(result).toMatchObject({ok:true,page:'portfolio',draftSaved:true});expect(driver.state.reference).toBe('123')
 expect(sent).toEqual(['headerForm:yes'])
})

it('extracts the live save-dialog bcn wrapper without executing its loading helper',()=>{
 const d=new HagueHttpDriver('live-wrapper');d.state.load('<form id="j_idt900"><input name="javax.faces.ViewState" value="A"><button id="j_idt900:yes">Yes</button></form>','/HagueEFilingWeb/protected/page/application.xhtml')
 const button=d.state.document.getElementById('j_idt900:yes')!
 const ajax=`PrimeFaces.ab({s:'j_idt900:yes',f:'j_idt900',onco:function(xhr,status,args){PF('saveDialog').hide();}});return false;`
 const handler=`PrimeFaces.bcn(this,event,[function(event){showBlockUIOnSend('');},function(event){${ajax}}]);`
 expect(jsfAction(handler,button,d.state.document)).toMatchObject({source:'j_idt900:yes',form:'j_idt900'})
 for(const prefix of ['return false;','return gate();','unknownHelper(this);','showBlockUIOnSend(fetch("/write"));']){
  expect(()=>jsfAction(`PrimeFaces.bcn(this,event,[function(event){${prefix}},function(event){${ajax}}]);`,button,d.state.document)).toThrow(/协议/)
 }
 expect(()=>jsfAction(`function showBlockUIOnSend(){fetch('/write')} ${handler}`,button,d.state.document)).toThrow(/协议/)
 expect(()=>jsfAction(`PrimeFaces.bcn(this,event,[function(event){showBlockUIOnSend('');},function(event){PrimeFaces.ab({s:'j_idt900:yes'});PrimeFaces.ab({s:'other'});return false;}]);`,button,d.state.document)).toThrow(/协议/)
})

it('recovers an allocated create step only by finding and opening its exact persisted draft',async()=>{
 for(const scenario of ['saved','missing','wrong-editor'] as const){
  const sources:string[]=[]
  const driver=new HagueHttpDriver('recover-allocation',async(url,init)=>{
   if(init?.method==='POST'){
    const p=new URLSearchParams(typeof init.body==='string'?init.body:'');const source=p.get('javax.faces.source')??'';sources.push(source)
    return new Response(source==='portfolio:open'?'<partial-response><redirect url="/HagueEFilingWeb/protected/page/application.xhtml"/></partial-response>':'<partial-response><changes/></partial-response>')
   }
   const html=url.endsWith('application.xhtml')?`<title>WIPO reference ${scenario==='wrong-editor'?'999':'123'}</title><input name="javax.faces.ViewState" value="B">`:`<form id="quickSearchPanel"><button type="button" class="filtered" id="quickSearchPanel:drafts" onclick="PrimeFaces.ab({s:'quickSearchPanel:drafts'});">Draft(s)</button></form><form id="portfolio"><input name="javax.faces.ViewState" value="A"><table><tbody>${scenario==='missing'?'':`<tr><td>WIPO123</td><td><button type="button" id="portfolio:open" title="Open/edit" onclick="PrimeFaces.ab({s:'portfolio:open'});">Open</button></td></tr>`}</tbody></table></form>`
   const response=new Response(html);Object.defineProperty(response,'url',{value:url});return response
  })
  const checkpoint={tabId:7,reference:'123',next:1,total:31,status:'uncertain' as const,stage:'创建新草稿',planKey:'verified-plan'}
  const result=await driver.recoverStep({op:'create'},checkpoint)
  expect(result.outcome).toBe(scenario==='saved'?'completed':'unknown')
  if(scenario==='saved')expect(result.receipt).toMatchObject({ok:true,reference:'123',page:'application'})
  expect(sources.every(source=>['quickSearchPanel:drafts','portfolio:open'].includes(source))).toBe(true)
  if(scenario==='missing')expect(sources).toEqual(['quickSearchPanel:drafts'])
 }
})

it('does not inspect a creation recovery with missing identity, fingerprint or the wrong boundary',async()=>{
 let reads=0;const driver=new HagueHttpDriver('allocation-guard',async()=>{reads++;throw Error('unexpected request')})
 const base={tabId:7,reference:'123',next:1,total:31,status:'uncertain' as const,stage:'创建新草稿',planKey:'verified-plan'}
 for(const change of [{reference:undefined},{planKey:undefined},{next:2},{status:'stopped' as const}])expect(await driver.recoverStep({op:'create'},{...base,...change})).toEqual({outcome:'unknown'})
 expect(reads).toBe(0)
})

it.each(['match','country-dropdown','normalized-punctuation','mismatch','extra-record','email-mismatch','qualification-mismatch','missing-cancel'] as const)('reads saved applicant fields without another save: %s',async scenario=>{
 const sources:string[]=[];const reference='123'
 const data={name:'Example Ltd.',address:scenario==='normalized-punctuation'?'One，Road':'One Road',city:'City',region:'Region',postalCode:'12345',country:'China'}
 const list='<form id="quickSearchPanel"><button type="button" class="filtered" id="quickSearchPanel:drafts" onclick="PrimeFaces.ab({s:this});">Draft(s)</button></form><form id="portfolio"><input name="javax.faces.ViewState" value="A"><table><tbody><tr><td>WIPO123</td><td><button type="button" id="portfolio:open" title="Open/edit" onclick="PrimeFaces.ab({s:this});">Open</button></td></tr></tbody></table></form>'
 const canonical=`<form id="ApplicantForm"><input name="javax.faces.ViewState" value="A"><button type="button" id="ApplicantForm:applicantViewPanel:0:editApp" onclick="PrimeFaces.ab({s:this});">Edit</button>${scenario==='extra-record'?'<button id="ApplicantForm:applicantViewPanel:1:editApp">Edit</button>':''}</form>`
 const fields={firstname:scenario==='mismatch'?'Other Ltd.':data.name,address:scenario==='normalized-punctuation'?'One,Road':data.address,cp:data.postalCode,city:data.city,state:data.region,country:scenario==='country-dropdown'?'CN - China':data.country,email:scenario==='email-mismatch'?'other@example.test':'draft@example.test',nationality:scenario==='qualification-mismatch'?'SG':'CN',domicile:'CN',establishment:'CN',residence:'CN',acp:'CN'}
 const edit=`<form id="ApplicantForm"><input name="javax.faces.ViewState" value="A"><input type="radio" value="true" checked>${Object.entries(fields).map(([k,v])=>`<input id="ApplicantForm:${k}:input" value="${v}">`).join('')}${scenario==='missing-cancel'?'':`<button type="button" id="ApplicantForm:cancelApp" onclick="PrimeFaces.ab({s:this});">Cancel</button>`}<button id="ApplicantForm:saveAppBtn">Save</button></form>`
 const driver=new HagueHttpDriver('applicant-recovery',async(url,init)=>{
  let body=''
  if(init?.method==='GET')body=url.endsWith('application.xhtml')?`<title>WIPO reference 123</title>${canonical}`:list
  else{const source=new URLSearchParams(typeof init?.body==='string'?init.body:'').get('javax.faces.source')??'';sources.push(source);body=source==='portfolio:open'?'<partial-response><redirect url="/HagueEFilingWeb/protected/page/application.xhtml"/></partial-response>':source.endsWith(':editApp')||source==='ApplicantForm:cancelApp'?`<partial-response><changes><update id="ApplicantForm"><![CDATA[${source.endsWith(':editApp')?edit:canonical}]]></update></changes></partial-response>`:'<partial-response><changes/></partial-response>'}
  const response=new Response(body);Object.defineProperty(response,'url',{value:url});return response
 })
 const result=await driver.recoverStep({op:'applicant',data,index:0,email:'draft@example.test'},{tabId:7,reference,next:2,total:31,status:'uncertain',stage:'申请人 1',planKey:'verified-plan'})
 expect(result.outcome).toBe(['match','country-dropdown','normalized-punctuation'].includes(scenario)?'completed':'unknown')
 if(['match','country-dropdown','normalized-punctuation'].includes(scenario))expect(result.receipt).toMatchObject({reference,applicants:1,page:'application'})
 expect(sources).not.toContain('ApplicantForm:saveAppBtn')
 expect(sources.every(s=>['quickSearchPanel:drafts','portfolio:open','ApplicantForm:applicantViewPanel:0:editApp','ApplicantForm:cancelApp'].includes(s))).toBe(true)
})

it('does not reject an absent optional reproduction table because an unrelated table is redacted',async()=>{
 const d=new HagueHttpDriver('unrelated-widget',async()=>{throw new Error('unexpected network')})
 d.state.load('<title>WIPO reference 123</title><form id="designForm"></form><script>PrimeFaces.cw("DataTable","other",{id:"unrelatedForm:table",paginator:{rows:10,rowCount:0}})</script>','/HagueEFilingWeb/protected/page/application.xhtml')
 expect(await d.call({op:'inspect'},'123')).toMatchObject({ok:true,reference:'123',reproductions:0})
})


it('recovers a Summary return by reopening the exact saved application without resending Back',async()=>{
 let requests=0;const d=new HagueHttpDriver('back-readback',async()=>{requests++;throw new Error('unexpected write')})
 d.resume=async reference=>{expect(reference).toBe('123');d.state.load('<title>WIPO reference 123</title><form id="ApplicantForm"></form>','/HagueEFilingWeb/protected/page/application.xhtml')}
 expect(await d.recoverStep({op:'backToApplication'},{tabId:7,reference:'123',next:20,total:22,status:'uncertain',stage:'Back',planKey:'same-plan'})).toMatchObject({outcome:'completed',receipt:{reference:'123',page:'application'}})
 expect(requests).toBe(0)
})
