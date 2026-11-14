import { expect, it } from 'vitest'
import {clearDiagnosticEvents,setDiagnosticMode,makeTraceContext,getDiagnosticEvents} from '../../../src/hague/diagnostics/store'
import { HagueHttpContext } from '../../../src/hague/http-context'

const html=(state:string,reference:string)=>`<html><head><title>WIPO reference ${reference}</title></head><body><form id="form" action="/HagueEFilingWeb/protected/page/application.xhtml"><input name="form" value="form" type="hidden"><input name="javax.faces.ViewState" value="${state}" type="hidden"><input id="form:name" name="form:name"><button type="button" id="form:save">Save</button></form></body></html>`
const response=(body:string)=>new Response(body,{status:200})
it('caps shared HTTP requests at six without sharing chain state',async()=>{
 let active=0,max=0
 const jobs=Array.from({length:10},(_,i)=>{
  const c=new HagueHttpContext(`chain${i}`,async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;return response('<partial-response><changes/></partial-response>')})
  c.load(html(`state${i}`,String(i+1)),'/HagueEFilingWeb/protected/page/application.xhtml')
  return c.post({source:'form:save'})
 })
 await Promise.all(jobs);expect(max).toBe(6)
})
it('keeps interleaved chains and their view states separate while serializing each chain',async()=>{
 const posted:Array<{state:string;name:string}>=[]
 const fetcher=async(_url:string,init?:RequestInit)=>{
  const body=new URLSearchParams((typeof init?.body==='string'?init.body:''));posted.push({state:body.get('javax.faces.ViewState')!,name:body.get('form:name')!})
  await new Promise(r=>setTimeout(r,2))
  return response(`<partial-response><changes><update id="j_id1:javax.faces.ViewState:0"><![CDATA[${body.get('javax.faces.ViewState')}-next]]></update></changes></partial-response>`)
 }
 const a=new HagueHttpContext('a',fetcher),b=new HagueHttpContext('b',fetcher)
 a.load(html('A','111'),'/HagueEFilingWeb/protected/page/application.xhtml');b.load(html('B','222'),'/HagueEFilingWeb/protected/page/application.xhtml')
 a.set('form:name','Alice');b.set('form:name','Bob')
 await Promise.all([a.post({source:'form:save',process:'form'}),b.post({source:'form:save',process:'form'})])
 await Promise.all([b.post({source:'form:save',process:'form'}),a.post({source:'form:save',process:'form'})])
 expect(posted).toEqual([{state:'A',name:'Alice'},{state:'B',name:'Bob'},{state:'B-next',name:'Bob'},{state:'A-next',name:'Alice'}])
 expect(a.reference).toBe('111');expect(b.reference).toBe('222')
})
it('applies partial HTML only to the owning detached document and never executes response scripts',async()=>{
 const a=new HagueHttpContext('a',async()=>response('<partial-response><changes><update id="form"><![CDATA[<form id="form"><input id="form:name" value="NEW"><script>window.BAD=true</script></form>]]></update></changes></partial-response>'))
 const b=new HagueHttpContext('b',async()=>response(''))
 a.load(html('A','111'),'/HagueEFilingWeb/protected/page/application.xhtml');b.load(html('B','222'),'/HagueEFilingWeb/protected/page/application.xhtml')
 await a.post({source:'form:save'})
 expect(a.document.getElementById('form:name')).toHaveProperty('value','NEW');expect(b.document.getElementById('form:name')).toHaveProperty('value','')
 expect((window as unknown as {BAD?:boolean}).BAD).toBeUndefined()
})
it('reinjects the owning ViewState after JSF replaces a form without its hidden state input',async()=>{
 const states:Array<string|null>=[]
 const c=new HagueHttpContext('owner',async(_url,init)=>{
  states.push(new URLSearchParams((typeof init?.body==='string'?init.body:'')).get('javax.faces.ViewState'))
  return response('<partial-response><changes><update id="form"><![CDATA[<form id="form"><input name="form" value="form"><button id="form:save">Save</button></form>]]></update><update id="j_id1:javax.faces.ViewState:0"><![CDATA[A-next]]></update></changes></partial-response>')
 })
 c.load(html('A','111'),'/HagueEFilingWeb/protected/page/application.xhtml')
 await c.post({source:'form:save'});await c.post({source:'form:save'})
 expect(states).toEqual(['A','A-next'])
})
it('poisons a chain after an uncertain request, rejects foreign navigation and forbids a changed WIPO reference',async()=>{
 let calls=0;const a=new HagueHttpContext('a',async()=>{calls++;throw new Error('network lost')})
 a.load(html('A','111'),'/HagueEFilingWeb/protected/page/application.xhtml')
 await expect(a.post({source:'form:save'})).rejects.toMatchObject({diagnostic:{errorCode:'NETWORK_FAILED',httpStatus:null}})
 await expect(a.post({source:'form:save'})).rejects.toThrow(/待核对/);expect(calls).toBe(1)
 expect(()=>a.load(html('B','222'),'/HagueEFilingWeb/protected/page/application.xhtml')).toThrow(/reference/)
 const b=new HagueHttpContext('b',async()=>response(''))
 expect(()=>b.load(html('B','222'),'https://evil.test/')).toThrow(/官方/)
})
it('sends multipart with the owning state and source-named file part without fixing a boundary',async()=>{
 let observed=false
 const c=new HagueHttpContext('upload-a',async(_url,init)=>{
  expect(init?.body).toBeInstanceOf(FormData)
  const body=init!.body as FormData
  expect(body.get('javax.faces.ViewState')).toBe('A')
  expect(body.get('javax.faces.partial.execute')).toBe('form:upload form:input')
  expect(body.get('form:upload')).toBeInstanceOf(File)
  expect((init?.headers as Record<string,string>)['Content-Type']).toBeUndefined()
  observed=true;return response('<partial-response><changes/></partial-response>')
 })
 c.load(html('A','111'),'/HagueEFilingWeb/protected/page/application.xhtml')
 await c.post({source:'form:upload',form:'form',process:'form:upload form:input'},{field:'form:upload',file:new File(['jpg'],'1.1.jpg',{type:'image/jpeg'})})
 expect(observed).toBe(true)
})
it('uses PrimeFaces default @all processing for an action without an explicit process',async()=>{
 const c=new HagueHttpContext('save',async(_url,init)=>{
  expect(new URLSearchParams((typeof init?.body==='string'?init.body:'')).get('javax.faces.partial.execute')).toBe('@all')
  return response('<partial-response><changes/></partial-response>')
 })
 c.load(html('A','111'),'/HagueEFilingWeb/protected/page/application.xhtml')
 await c.post({source:'form:save'})
})

it('accepts a saved applicant while an inactive designation output panel is absent',async()=>{
 setDiagnosticMode(true);clearDiagnosticEvents()
 const c=new HagueHttpContext('inactive-output',async()=>response(`<partial-response><changes><update id="ApplicantForm"><![CDATA[<form id="ApplicantForm"><input name="javax.faces.ViewState" value="A"><button id="ApplicantForm:applicantViewPanel:0:editApp">Edit</button></form>]]></update><update id="Designationform:j_idt779"><![CDATA[<div id="Designationform:j_idt779" class="ui-outputpanel ui-widget"><span>Review designation information.</span></div>]]></update><update id="javax.faces.ViewState"><![CDATA[B]]></update></changes></partial-response>`))
 c.load('<form id="ApplicantForm"><input name="javax.faces.ViewState" value="A"><button id="ApplicantForm:saveAppBtn">Save</button></form>','/HagueEFilingWeb/protected/page/application.xhtml')
 c.setTrace(makeTraceContext('case-inactive-output',2,'applicant','http'))
 await expect(c.post({source:'ApplicantForm:saveAppBtn'})).resolves.toBeUndefined()
 expect(c.document.querySelectorAll('button[id$=":editApp"]')).toHaveLength(1)
 expect(c.document.getElementById('Designationform')).toBeNull()
 expect(c.document.getElementById('Designationform:j_idt779')).toBeNull()
 expect(c.document.querySelector<HTMLInputElement>('[name="javax.faces.ViewState"]')?.value).toBe('B')
 expect(getDiagnosticEvents().find(e=>e.phase==='dom.updated')).toMatchObject({inactiveUpdateCount:1,unknownComponentCount:0,domEvidenceSource:'application_model'})
 clearDiagnosticEvents();setDiagnosticMode(false)
})
it.each(['active','interactive','mismatched-root','designation-present','unknown-section','event-handler','script'] as const)('still rejects a missing %s component',async kind=>{
 const id=kind==='active'?'ApplicantForm:missing':kind==='unknown-section'?'OtherForm:panel':'Designationform:panel'
 const inner=kind==='interactive'?'<input name="required">':kind==='event-handler'?'<span onclick="unknown()">Information</span>':kind==='script'?'<script>unknown()</script>':'<span>Information</span>'
 const c=new HagueHttpContext('missing-output',async()=>response(`<partial-response><changes><update id="${id}"><![CDATA[<div id="${kind==='mismatched-root'?'wrong':id}" class="ui-outputpanel">${inner}</div>]]></update></changes></partial-response>`))
 c.load(`<form id="ApplicantForm"><input name="javax.faces.ViewState" value="A"><button id="ApplicantForm:saveAppBtn">Save</button></form>${kind==='designation-present'?'<form id="Designationform"></form>':''}`,'/HagueEFilingWeb/protected/page/application.xhtml')
 await expect(c.post({source:'ApplicantForm:saveAppBtn'})).rejects.toMatchObject({diagnostic:{errorCode:'DOM_TARGET_MISSING'}})
})
