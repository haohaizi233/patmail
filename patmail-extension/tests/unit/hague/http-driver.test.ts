import { expect,it } from 'vitest'
import { HagueHttpDriver,jsfAction } from '../../../src/hague/http-driver'
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
