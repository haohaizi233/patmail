import {afterEach,beforeEach,expect,it} from 'vitest'
import {HagueHttpContext} from '../../../src/hague/http-context'
import {clearDiagnosticEvents,getDiagnosticEvents,makeTraceContext,setDiagnosticMode} from '../../../src/hague/diagnostics/store'
const path='/HagueEFilingWeb/protected/page/application.xhtml'
const initial=(state='SECRET_VIEWSTATE')=>`<html><body><form id="designForm"><input name="javax.faces.ViewState" value="${state}"><input name="person" value="PRIVATE_PERSON"><button id="designForm:save">Save</button></form></body></html>`
function context(body:string,status=200,mime='application/xml'){
 const c=new HagueHttpContext('test',async()=>new Response(body,{status,headers:{'content-type':mime}}))
 c.load(initial(),path);c.setTrace(makeTraceContext('case-protocol',1,'design','http'));return c
}
beforeEach(()=>{clearDiagnosticEvents();setDiagnosticMode(true)})
afterEach(()=>{setDiagnosticMode(false);clearDiagnosticEvents()})
it.each([
 ['unavailable','<html>PRIVATE_SERVER</html>',503,'text/html','HTTP_503','http','not_observed'],
 ['malformed','<partial-response><changes></partial-response>',200,'application/xml','INVALID_XML','protocol','invalid_xml'],
 ['jsf error','<partial-response><error><error-name>PRIVATE</error-name><error-message>PRIVATE_PERSON</error-message></error></partial-response>',200,'application/xml','JSF_ERROR','protocol','jsf_error'],
 ['validation','<partial-response><extension>{"validationFailed":true,"name":"PRIVATE_PERSON"}</extension></partial-response>',200,'application/xml','JSF_VALIDATION_FAILED','protocol','jsf_validation_failed'],
 ['missing DOM','<partial-response><changes><update id="designForm:absent"><![CDATA[PRIVATE_PERSON]]></update></changes></partial-response>',200,'application/xml','DOM_TARGET_MISSING','protocol','unsupported'],
 ['insert','<partial-response><changes><insert><after id="designForm"><![CDATA[PRIVATE_PERSON]]></after></insert></changes></partial-response>',200,'application/xml','PROTOCOL_UNSUPPORTED','protocol','unsupported'],
 ['delete','<partial-response><changes><delete id="designForm"/></changes></partial-response>',200,'application/xml','PROTOCOL_UNSUPPORTED','protocol','unsupported'],
 ['empty',' ',200,'application/xml','EMPTY_RESPONSE','protocol','empty'],
 ['mime','PRIVATE_PERSON',200,'application/octet-stream','INVALID_MIME','protocol','invalid_mime'],
] as const)('preserves actual HTTP status and distinct %s protocol failure',async(_label,body,status,mime,code,stage,protocol)=>{
 const c=context(body,status,mime)
 await expect(c.post({source:'designForm:save'})).rejects.toMatchObject({diagnostic:{httpStatus:status,errorCode:code,errorStage:stage,protocolStatus:protocol,certainty:code==='JSF_VALIDATION_FAILED'?'rejected':'unknown',autoRecoverable:false}})
 const events=getDiagnosticEvents();expect(events.filter(e=>e.phase==='http.response')).toHaveLength(1)
 expect(events.find(e=>e.phase==='http.response')).toMatchObject({httpStatus:status,transportStatus:'completed'})
 expect(events.some(e=>e.businessStatus==='confirmed')).toBe(false)
 expect(JSON.stringify(events)).not.toMatch(/PRIVATE_PERSON|PRIVATE_SERVER|SECRET_VIEWSTATE|error-message/)
 expect(c.document.getElementById('designForm')).not.toBeNull()
})
it('records ViewState change digest and length without storing either state or field values',async()=>{
 const next='NEXT_PRIVATE_VIEWSTATE'
 const c=context(`<partial-response><changes><update id="javax.faces.ViewState"><![CDATA[${next}]]></update></changes></partial-response>`)
 await c.post({source:'designForm:save'})
 expect(c.document.querySelector<HTMLInputElement>('[name="javax.faces.ViewState"]')?.value).toBe(next)
 const event=getDiagnosticEvents().find(e=>e.phase==='dom.updated')
 expect(event).toMatchObject({httpStatus:200,viewStateChanged:true,viewStateLength:next.length,domReplaced:true})
 expect(event?.viewStateDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
 expect(JSON.stringify(getDiagnosticEvents())).not.toMatch(/SECRET_VIEWSTATE|NEXT_PRIVATE_VIEWSTATE|PRIVATE_PERSON/)
})
it('keeps six concurrent traces, request IDs and private ViewStates independent',async()=>{
 const traces:string[]=[],seen:string[]=[],contexts=Array.from({length:6},(_,i)=>{
  const state=`STATE_SECRET_${i}`,trace=makeTraceContext(`case-protocol-${i}`,i,'design','http');traces.push(trace.traceId)
  const c=new HagueHttpContext(`chain-${i}`,async(_url,init,t,requestId)=>{
   expect(t?.traceId).toBe(trace.traceId);expect(requestId).toMatch(/^req-/)
   seen.push(new URLSearchParams(typeof init?.body==='string'?init.body:'').get('javax.faces.ViewState')!)
   await Promise.resolve();return new Response(`<partial-response><changes><update id="javax.faces.ViewState"><![CDATA[${state}_NEXT]]></update></changes></partial-response>`)
  });c.load(initial(state),path);c.setTrace(trace);return c
 })
 await Promise.all(contexts.map(c=>c.post({source:'designForm:save'})))
 expect(new Set(seen).size).toBe(6)
 const events=getDiagnosticEvents(),requests=events.filter(e=>e.phase==='http.response')
 expect(new Set(requests.map(e=>e.requestId)).size).toBe(6)
 for(let i=0;i<6;i++){
  expect(contexts[i].document.querySelector<HTMLInputElement>('[name="javax.faces.ViewState"]')?.value).toBe(`STATE_SECRET_${i}_NEXT`)
  const owned=events.filter(e=>e.traceId===traces[i]);expect(owned.filter(e=>e.phase==='http.response')).toHaveLength(1)
  expect(owned.every(e=>e.caseRunId===`case-protocol-${i}`)).toBe(true)
 }
 expect(JSON.stringify(events)).not.toMatch(/STATE_SECRET|PRIVATE_PERSON/)
})
it('never fabricates an HTTP status when transport rejects before a response',async()=>{
 const c=new HagueHttpContext('offline',async()=>{throw new TypeError('PRIVATE_PERSON connection failure')})
 c.load(initial(),path);c.setTrace(makeTraceContext('case-network',0,'design','http'))
 await expect(c.post({source:'designForm:save'})).rejects.toMatchObject({diagnostic:{httpStatus:null,errorCode:'NETWORK_FAILED',transportStatus:'network_error',sideEffectMayHaveOccurred:true}})
 expect(getDiagnosticEvents().some(e=>e.phase==='http.response')).toBe(false)
 expect(getDiagnosticEvents().find(e=>e.phase==='step.uncertain')).toMatchObject({httpStatus:null,transportStatus:'network_error'})
 expect(JSON.stringify(getDiagnosticEvents())).not.toContain('PRIVATE_PERSON')
})
