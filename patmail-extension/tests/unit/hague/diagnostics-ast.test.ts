import {jsfAction} from '../../../src/hague/http-driver'
import {expect,it} from 'vitest'
import {analyzeJavaScript,extractStaticActions} from '../../../src/hague/diagnostics/ast/analyzer.mjs'
it('resolves constants, aliases and wrapper parameters without executing source',()=>{
 const src=`const id='designForm'+':save';const send=PrimeFaces.ab;function wrap(s){send({s,p:'@this',u:'designForm'})}wrap(id);`
 expect(extractStaticActions(src).some(a=>a.source==='designForm:save')).toBe(true)
 expect(analyzeJavaScript(src).calls.some(a=>a.kind==='PrimeFaces.ab')).toBe(true)
})
it('extracts remote arguments privately and rejects dynamic required fields',()=>{
 const definitions=`selectOffice=function(){PrimeFaces.ab({s:'Designationform:remote',pa:arguments[0]})}`
 expect(extractStaticActions(`selectOffice([{name:'param',value:'US'}])`,{definitions})[0]?.params).toEqual({param:'US'})
 expect(extractStaticActions(`PrimeFaces.ab({s:runtimeSource})`)).toEqual([])
 expect(JSON.stringify(analyzeJavaScript(`PrimeFaces.ab({s:'designForm:save',pa:[{name:'param',value:'PRIVATE_PERSON'}]})`))).not.toContain('PRIVATE_PERSON')
})
it('reports dynamic code and bounds nested decoding, source and nodes',()=>{
 const r=analyzeJavaScript(`eval(atob('UHJpbWVGYWNlcy5hYih7czo nZGVzaWduRm9ybTpzYXZlJ30p'.replace(' ','')));new Function(runtime);setTimeout('PrimeFaces.ab({s:"designForm:x"})',0)`)
 expect(r.calls.some(a=>a.kind==='setTimeout')).toBe(true)
 expect(r.unresolved.length).toBeGreaterThan(0)
 expect(analyzeJavaScript('x'.repeat(100),{maxSourceBytes:10}).unresolved).toContain('source_limit')
 expect(analyzeJavaScript('a();b();c()',{maxNodes:2}).unresolved).toContain('node_limit')
})
it('supports native JSF families and widget structural metadata',()=>{
 const r=analyzeJavaScript(`mojarra.ab(this,event,'change','designForm:a','designForm:b');jsf.ajax.request('designForm:x',event,{execute:'@this',render:'designForm'});mojarra.jsfcljs(document.forms[0],{'headerForm:sum':'headerForm:sum'},'');PrimeFaces.cw('FileUpload','uploadW',{id:'designForm:upload',process:'@this',update:'designForm'});`)
 expect(r.calls.map(c=>c.kind)).toEqual(expect.arrayContaining(['mojarra.ab','jsf.ajax.request','mojarra.jsfcljs','PrimeFaces.cw']))
})
it('fails closed on conditional and multi-action handlers',async()=>{
 const {jsfAction}=await import('../../../src/hague/http-driver')
 const el=document.createElement('button');el.id='designForm:save'
 expect(()=>jsfAction(`if(runtime)PrimeFaces.ab({s:'designForm:save'})`,el,document)).toThrow()
 expect(()=>jsfAction(`PrimeFaces.ab({s:'designForm:a'});PrimeFaces.ab({s:'designForm:b'})`,el,document)).toThrow()
})
it('decodes literal base64 and character code without running eval',()=>{
 const src=`eval(atob('UHJpbWVGYWNlcy5hYih7czo iZGVzaWduRm9ybTpzYXZlIn0p'.replace(' ','')))`
 const encoded=btoa(`PrimeFaces.ab({s:'designForm:save'})`)
 expect(analyzeJavaScript(`eval(atob('${encoded}'))`).calls.some(c=>c.source==='designForm:save')).toBe(true)
 expect(extractStaticActions(src)).toEqual([])
})
it('rejects decoded writes, mutable state, side effects and alias reassignment',()=>{
 const encoded=btoa(`PrimeFaces.ab({s:'designForm:save'})`)
 for(const src of [`eval(atob('${encoded}'))`,`let s='designForm:save';PrimeFaces.ab({s})`,`const send=PrimeFaces.ab;send=other;send({s:'designForm:save'})`,`sendOther();PrimeFaces.ab({s:'designForm:save'})`])expect(extractStaticActions(src)).toEqual([])
})
it('rejects object mutations and shadowed decoding globals for writes',()=>{
 expect(extractStaticActions(`const cfg={s:'designForm:save'};cfg.s=runtime;PrimeFaces.ab(cfg)`)).toEqual([])
 expect(analyzeJavaScript(`const atob=runtime;eval(atob('UHJpbWVGYWNlcy5hYih7czoiZGVzaWduRm9ybTpzYXZlIn0p'))`).calls.some(c=>c.kind==='PrimeFaces.ab')).toBe(false)
})
it('does not resolve shadowed aliases or protocol globals',()=>{
 expect(extractStaticActions(`const send=PrimeFaces.ab;function wrap(send){send({s:'designForm:save'})}wrap(runtime)`)).toEqual([])
 expect(extractStaticActions(`const PrimeFaces=runtime;PrimeFaces.ab({s:'designForm:save'})`)).toEqual([])
})
it('summarizes upload and pagination configuration without arbitrary strings',()=>{
 const calls=analyzeJavaScript(`PrimeFaces.cw('DataTable','w',{id:'designForm:reproDT',paginator:{rows:10,rowCount:25,page:1}});PrimeFaces.cw('FileUpload','x',{id:'designForm:upload',process:'@this',update:'designForm',label:'PRIVATE'})`).calls
 expect(calls[0]).toMatchObject({widgetType:'DataTable',paginator:{rows:10,rowCount:25,page:1}})
 expect(calls[1]).toMatchObject({widgetType:'FileUpload'})
 expect(JSON.stringify(calls)).not.toContain('PRIVATE')
})
it('rejects malformed known protocol fields',()=>{
 expect(extractStaticActions(`PrimeFaces.ab({s:'designForm:save',u:42})`)).toEqual([])
})
it('does not promote mutable bindings to static diagnostic evidence',()=>{
 const call=analyzeJavaScript(`let source='designForm:save';PrimeFaces.ab({s:source})`).calls.find(c=>c.kind==='PrimeFaces.ab')
 expect(call?.confidence).toBe('unresolved')
})
it('does not leak constants out of uninvoked function scope',()=>{
 expect(extractStaticActions(`function helper(){const source='designForm:save'}PrimeFaces.ab({s:source})`)).toEqual([])
})
it('reads table pagination from AST constants and fails closed on runtime row counts',async()=>{
 const {HagueHttpDriver}=await import('../../../src/hague/http-driver')
 for(const dynamic of [false,true]){
  let writes=0
  const d=new HagueHttpDriver('widgets',async()=>{writes++;return new Response('<partial-response><changes/></partial-response>')})
  d.state.load(`<html><body><form id="portfolio"><div class="ui-datatable" id="portfolio:enCours"><table><tbody id="portfolio:enCours_data"></tbody></table></div></form><script>const component='portfolio'+':enCours';PrimeFaces.cw('DataTable','table',{id:component,paginator:{rows:1,rowCount:${dynamic?'runtime':'1'}}})</script></body></html>`,'/HagueEFilingWeb/protected/portfolioManager.xhtml')
  const locate=(d as unknown as {locateDraft:(reference:string)=>Promise<unknown>}).locateDraft.bind(d)
  if(dynamic){await expect(locate('123')).rejects.toMatchObject({diagnostic:{errorCode:'PROTOCOL_UNSUPPORTED',errorStage:'ast',sideEffectMayHaveOccurred:false}});expect(writes).toBe(0)}
  else{await locate('123');expect(writes).toBe(1)}
 }
})
it('reads reproduction count from AST widget config and rejects a dynamic count',async()=>{
 const {HagueHttpDriver}=await import('../../../src/hague/http-driver')
 const d=new HagueHttpDriver('widgets')
 const count=()=> (d as unknown as {reproCount:()=>number}).reproCount()
 d.state.load(`<script>const n=3;PrimeFaces.cw('DataTable','reproDTW',{id:'designForm:reproDT',paginator:{rowCount:n,rows:10}})</script>`,'/HagueEFilingWeb/protected/page/application.xhtml')
 expect(count()).toBe(3)
 d.state.load(`<script>PrimeFaces.cw('DataTable','reproDTW',{id:'designForm:reproDT',paginator:{rowCount:runtime,rows:10}})</script>`,'/HagueEFilingWeb/protected/page/application.xhtml')
 expect(count).toThrow()
})
it('rejects unknown JSF source with structured pre-dispatch error',async()=>{
 const {jsfAction}=await import('../../../src/hague/http-driver')
 let error:unknown;try{jsfAction(`PrimeFaces.ab({s:runtime})`,document.createElement('button'),document)}catch(e){error=e}
 expect(error).toMatchObject({diagnostic:{errorCode:'PROTOCOL_UNSUPPORTED',errorStage:'ast',sideEffectMayHaveOccurred:false,transportStatus:'not_dispatched'}})
})
it('builds upload execution from AST widget metadata and carries remote analysis',async()=>{
 const {HagueHttpDriver}=await import('../../../src/hague/http-driver')
 const {clearDiagnosticEvents,getDiagnosticEvents,makeTraceContext,setDiagnosticMode}=await import('../../../src/hague/diagnostics/store')
 const markup=(count:number,process='"@this"')=>`<form id="designForm"><input name="javax.faces.ViewState" value="A"><input type="file" id="designForm:fileuploader:fileupload_input"><script>const target='designForm';PrimeFaces.cw('FileUpload','upload',{id:'designForm:fileuploader:fileupload',process:${process},update:target});PrimeFaces.cw('DataTable','reproDTW',{id:'designForm:reproDT',paginator:{rows:10,rowCount:${count}}});processFile=function(){PrimeFaces.ab({s:'designForm:processFile',f:'designForm',pa:arguments[0]})}</script></form>`
 const bodies:BodyInit[]=[]
 const d=new HagueHttpDriver('upload-ast',async(_url,init)=>{bodies.push(init!.body!);return new Response(bodies.length===1?'<partial-response><changes/></partial-response>':`<partial-response><changes><update id="designForm"><![CDATA[${markup(1)}]]></update></changes></partial-response>`)})
 d.state.load(markup(0),'/HagueEFilingWeb/protected/page/application.xhtml')
 d.state.setTrace(makeTraceContext('case-widget',0,'upload','http'));clearDiagnosticEvents();setDiagnosticMode(true)
 try{
  await (d as unknown as {upload:(command:unknown)=>Promise<void>}).upload({op:'upload',count:0,name:'1.1.jpg',mime:'image/jpeg',base64:btoa('jpeg')})
  expect(bodies[0]).toBeInstanceOf(FormData)
  expect((bodies[0] as FormData).get('javax.faces.partial.execute')).toBe('designForm:fileuploader:fileupload @this')
  expect((bodies[0] as FormData).get('javax.faces.partial.render')).toBe('designForm')
  expect(new URLSearchParams(bodies[1] as string).get('dtId')).toBe('designForm:reproDT')
  expect(getDiagnosticEvents().some(e=>e.phase==='protocol.analyzed'&&e.astCallType==='PrimeFaces.ab')).toBe(true)
 }finally{setDiagnosticMode(false);clearDiagnosticEvents()}
 const invalid=new HagueHttpDriver('upload-invalid',async()=>{throw new Error('must not send')})
 invalid.state.load(markup(0,'runtime'),'/HagueEFilingWeb/protected/page/application.xhtml')
 await expect((invalid as unknown as {upload:(command:unknown)=>Promise<void>}).upload({op:'upload',count:0,name:'1.1.jpg',mime:'image/jpeg',base64:btoa('jpeg')})).rejects.toMatchObject({diagnostic:{errorCode:'PROTOCOL_UNSUPPORTED',sideEffectMayHaveOccurred:false}})
})
it('does not treat an unresolved widget identity as an empty reproduction table',async()=>{
 const {HagueHttpDriver}=await import('../../../src/hague/http-driver')
 const d=new HagueHttpDriver('unknown-widget')
 d.state.load(`<script>PrimeFaces.cw('DataTable','reproDTW',{id:runtime,paginator:{rowCount:5}})</script>`,'/HagueEFilingWeb/protected/page/application.xhtml')
 expect(()=>(d as unknown as {reproCount:()=>number}).reproCount()).toThrow()
})
it('never turns uninvoked declarations or statements after return into writes',()=>{
 for(const source of [
  `function unused(){PrimeFaces.ab({s:'ApplicantForm:save'})}`,
  `return false;PrimeFaces.ab({s:'ApplicantForm:save'})`,
  `function remote(){return false;PrimeFaces.ab({s:'ApplicantForm:save'})}remote()`,
  `const remote=()=>{PrimeFaces.ab({s:'ApplicantForm:save'})}`,
 ])expect(extractStaticActions(source)).toEqual([])
 expect(extractStaticActions(`function remote(){return PrimeFaces.ab({s:'ApplicantForm:save'})}remote()`)).toHaveLength(1)
})
it('rejects throwing and unsupported control flow before a possible write',()=>{
 for(const source of [`throw runtime;PrimeFaces.ab({s:'ApplicantForm:save'})`,`label:{PrimeFaces.ab({s:'ApplicantForm:save'})}`,`for(const x of runtime)PrimeFaces.ab({s:'ApplicantForm:save'})`])expect(extractStaticActions(source)).toEqual([])
})
it('does not traverse uninvoked object or class methods as execution paths',()=>{
 for(const source of [`const obj={save(){PrimeFaces.ab({s:'ApplicantForm:save'})}}`,`class X{save(){PrimeFaces.ab({s:'ApplicantForm:save'})}}`,`const obj={get save(){PrimeFaces.ab({s:'ApplicantForm:save'})}}`])expect(extractStaticActions(source)).toEqual([])
 expect(extractStaticActions(`{return false;}PrimeFaces.ab({s:'ApplicantForm:save'})`)).toEqual([])
})
it('does not treat generator creation as invocation of its body',()=>{
 expect(extractStaticActions(`function* remote(){PrimeFaces.ab({s:'ApplicantForm:save'})}remote()`)).toEqual([])
})
it('does not hoist assignment wrappers or guess duplicate binding mutations',()=>{
 for(const source of [
  `f();f=function(){PrimeFaces.ab({s:'ApplicantForm:save'})}`,
  `function f(){PrimeFaces.ab({s:'ApplicantForm:save'})}f();function f(){}`,
  `f=function(){PrimeFaces.ab({s:'ApplicantForm:save'})};{f=function(){}}f()`,
 ])expect(extractStaticActions(source)).toEqual([])
 expect(extractStaticActions(`f=function(){PrimeFaces.ab({s:'ApplicantForm:save'})};f()`)).toHaveLength(1)
})

it('reports an unresolved action fingerprint without dispatching and isolates diagnostic callback failures',()=>{
 const doc=new DOMParser().parseFromString('<form id="ApplicantForm"><button id="ApplicantForm:save"></button></form>','text/html'),button=doc.querySelector('button')!,seen:string[]=[]
 expect(()=>jsfAction('PrimeFaces.ab({s:runtime})',button,doc,report=>{seen.push(report.fingerprint)})).toThrow()
 expect(seen).toHaveLength(1);expect(seen[0]).toMatch(/^[a-f0-9]{8}$/)
 expect(jsfAction("PrimeFaces.ab({s:'ApplicantForm:save'})",button,doc,()=>{throw new Error('diagnostic failed')})).toMatchObject({source:'ApplicantForm:save'})
})

it('invalidates per-chain widget analysis when an existing script node changes',async()=>{
 const {HagueHttpDriver}=await import('../../../src/hague/http-driver')
 const driver=new HagueHttpDriver('cache-fixture')
 driver.state.load(`<script>PrimeFaces.cw('DataTable','reproDTW',{id:'designForm:reproDT',paginator:{rowCount:0}})</script>`,'/HagueEFilingWeb/protected/page/application.xhtml')
 const count=()=> (driver as unknown as {reproCount:()=>number}).reproCount()
 expect(count()).toBe(0);expect(count()).toBe(0)
 driver.state.document.scripts[0].textContent="PrimeFaces.cw('DataTable','reproDTW',{id:'designForm:reproDT',paginator:{rowCount:1}})"
 expect(count()).toBe(1)
})
