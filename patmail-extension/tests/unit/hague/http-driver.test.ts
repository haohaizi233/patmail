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

it('saves the allocated draft with one network action despite a local dialog hide call',async()=>{
 const sent:string[]=[]
 const driver=new HagueHttpDriver('initial-save',async(_url,init)=>{
  if(init?.method==='POST'){
   const params=new URLSearchParams(typeof init.body==='string'?init.body:'');sent.push(params.get('javax.faces.source')??'')
   return new Response('<partial-response><redirect url="/HagueEFilingWeb/protected/portfolioManager.xhtml"/></partial-response>')
  }
  const response=new Response('<form id="quickSearchPanel"><button class="filtered">Draft(s)</button></form><form id="portfolio"><input name="javax.faces.ViewState" value="B"><table><tbody><tr><td>WIPO123</td></tr></tbody></table></form>')
  Object.defineProperty(response,'url',{value:'https://hague.wipo.int/HagueEFilingWeb/protected/portfolioManager.xhtml'});return response
 })
 driver.state.load(`<html><head><title>WIPO reference 123</title></head><body><form id="headerForm"><input name="javax.faces.ViewState" value="A"><button type="button" id="headerForm:backApp" onclick="PF('saveDialog').show();return false;">Close</button><div class="ui-dialog">Draft(s)<button type="button" id="headerForm:yes" onclick="PrimeFaces.ab({s:'headerForm:yes',f:'headerForm'});PF('saveDialog').hide();return false;">Yes</button></div></form></body></html>`,'/HagueEFilingWeb/protected/page/application.xhtml')
 expect(await driver.call({op:'inspect'})).toMatchObject({reference:'123',page:'application'});
 const result=await driver.call({op:'saveDraft'},'123');expect(result.error).toBeUndefined();expect(result).toMatchObject({ok:true,page:'portfolio',draftSaved:true});expect(driver.state.reference).toBe('123')
 expect(sent).toEqual(['headerForm:yes'])
})
