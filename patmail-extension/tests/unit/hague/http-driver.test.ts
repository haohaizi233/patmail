import { expect,it } from 'vitest'
import { HagueHttpDriver } from '../../../src/hague/http-driver'
it('preserves radio preactivation when serializing a detached JSF click',async()=>{
 let legal:string|null=null
 const c=new HagueHttpDriver('a',async(_url,init)=>{legal=new URLSearchParams(String(init?.body)).get('form:legal');return new Response('<partial-response><changes/></partial-response>')})
 c.state.load('<html><head><title>WIPO reference 111</title></head><body><form id="form"><input name="javax.faces.ViewState" value="A" type="hidden"><input id="form:legal:0" name="form:legal" type="radio" value="true" onclick="PrimeFaces.ab({s:this,e:\'click\',p:\'form:legal\',u:\'form\'});"><input name="form:legal" type="radio" value="false" checked></form></body></html>','/HagueEFilingWeb/protected/page/application.xhtml')
 ;(c.state.document.getElementById('form:legal:0') as HTMLInputElement).click()
 await c.state.settle();expect(legal).toBe('true')
})
