import { expect, it } from 'vitest'
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
