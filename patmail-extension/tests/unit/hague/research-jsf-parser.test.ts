import {expect,it} from 'vitest'
import {parseJsfPartialResponse as parse,createJsfProtocolAnalyzer,parseJsfRequest} from '../../../src/hague/diagnostics/protocol/jsf-partial-response.mjs'
const wrap=(s:string)=>`<partial-response><changes>${s}</changes></partial-response>`
it('recognizes namespace XML, CDATA, operations and only safe component identifiers',()=>{
 const r=parse(wrap('<update id="designForm"><![CDATA[<b>SECRET</b>]]></update><insert><after id="designForm">SECRET</after></insert><delete id="designForm"/><attributes id="designForm"><attribute name="value" value="SECRET"/></attributes><eval>throw SECRET</eval><extension>{}</extension><unknown>SECRET</unknown>'))
 expect(r).toMatchObject({xmlParsed:true,protocolStatus:'valid',updateCount:1,insertCount:1,deleteCount:1,attributeCount:1,evalCount:1,extensionCount:1,unknownNodeCount:1})
 expect(JSON.stringify(r)).not.toContain('SECRET')
 expect(parse('<p:partial-response xmlns:p="urn:jsf"><p:changes><p:update id="designForm"/></p:changes></p:partial-response>').updateCount).toBe(1)
 expect(parse(wrap('<update id="designForm"/><update id="designForm"/>')).updateCount).toBe(2)
})
it.each([
 ['<partial-response><error><error-message>SECRET</error-message></error></partial-response>','jsf_error'],
 [wrap('<extension>{"validationFailed":true}</extension>'),'jsf_validation_failed'],
 ['<partial-response><redirect url="SECRET"/></partial-response>','redirect'],
 ['<partial-response>','invalid_xml'],['<partial-response><changes></partial-response>','invalid_xml'],['','empty'],
 ['<html><form>SECRET</form></html>','html'],['{"SECRET":true}','unsupported'],['<other/>','unsupported'],
 ['<!DOCTYPE foo SYSTEM "file:///secret"><partial-response/>','invalid_xml'],
 ['<!DOCTYPE foo [<!ENTITY x "SECRET">]><partial-response>&x;</partial-response>','invalid_xml'],
 ['<partial-response>\u0000</partial-response>','invalid_xml'],
])('classifies %s independently of HTTP 200',(body,status)=>{const r=parse(body,{httpStatus:200});expect(r.protocolStatus).toBe(status);expect(JSON.stringify(r)).not.toContain('SECRET');expect(r).not.toHaveProperty('businessStatus')})
it('rejects MIME mismatch and enforces byte/node/depth limits',()=>{
 expect(parse(wrap(''),{mime:'application/json'}).protocolStatus).toBe('unsupported')
 expect(parse('x'.repeat(262145)).bodyStatus).toBe('body_too_large')
 expect(parse(wrap('<delete/>'.repeat(5)),{maxNodes:3}).parserError).toBe(true)
 expect(parse(wrap('<x><y/></x>'),{maxDepth:3}).parserError).toBe(true)
 expect(parse(new Uint8Array([0xff])) .parserError).toBe(true)
})
it('keeps ViewState comparison internal, per context, bounded and resettable',async()=>{
 const a=createJsfProtocolAnalyzer(),xml=(s:string)=>wrap(`<update id="javax.faces.ViewState"><![CDATA[${s}]]></update>`)
 expect(await a.analyze(xml('SECRET'),{contextKey:'one'})).toMatchObject({viewStatePresent:true,viewStateLength:6})
 expect((await a.analyze(xml('SECRET'),{contextKey:'one'})).viewStateChanged).toBe(false)
 expect((await a.analyze(xml('NEW_SECRET'),{contextKey:'one'})).viewStateChanged).toBe(true)
 expect((await a.analyze(xml('SECRET'),{contextKey:'two'})).viewStateChanged).toBeUndefined()
 expect(JSON.stringify(await a.analyze(xml('SECRET'),{contextKey:'one'}))).not.toContain('SECRET')
 a.clear();expect((await a.analyze(xml('SECRET'),{contextKey:'one'})).viewStateChanged).toBeUndefined()
 expect(parse(wrap('<update id="jakarta.faces.ViewState">x</update>')).viewStatePresent).toBe(true)
})
it('reads bounded standard JSF request fields without leaking input values or unknown names',()=>{
 const r=parseJsfRequest({mime:'application/x-www-form-urlencoded',postData:'javax.faces.partial.ajax=true&javax.faces.source=designForm&javax.faces.partial.execute=%40this&javax.faces.partial.render=designForm&SECRET=SECRET&javax.faces.ViewState=SECRET'})
 expect(r).toMatchObject({eligibleAjax:true,sourceComponent:'designForm',process:'@this',update:'designForm',requestMetadataStatus:'parsed'})
 expect(JSON.stringify(r)).not.toContain('SECRET')
 expect(parseJsfRequest({mime:'multipart/form-data',get postData():string{throw Error('must not read')}})).toMatchObject({isUpload:true,eligibleAjax:false})
 expect(parseJsfRequest({postData:'x'.repeat(262145)}).requestMetadataStatus).toBe('too_large')
 expect(parseJsfRequest({postData:'jakarta.faces.partial.ajax=true&jakarta.faces.source=designForm'}).eligibleAjax).toBe(true)
})

it('evicts comparison contexts and invalid responses cannot change comparison state',async()=>{
 const a=createJsfProtocolAnalyzer(),xml=wrap('<update id="javax.faces.ViewState">secret</update>')
 await a.analyze(xml,{contextKey:'old'})
 for(let i=0;i<128;i++)await a.analyze(xml,{contextKey:`context-${i}`})
 expect((await a.analyze(xml,{contextKey:'old'})).viewStateChanged).toBeUndefined()
 await a.analyze('<partial-response>',{contextKey:'old'})
 expect((await a.analyze(xml,{contextKey:'old'})).viewStateChanged).toBe(false)
 const pending=a.analyze(xml,{contextKey:'cancelled'});a.clear();await pending
 expect((await a.analyze(xml,{contextKey:'cancelled'})).viewStateChanged).toBeUndefined()
})
it('never exposes sensitive IDs, attributes, URLs, error text, eval source or extension data',()=>{
 const secret='PRIVATE_PERSON_123@example.test'
 const r=parse(wrap(`<update id="${secret}">${secret}</update><eval>${secret}</eval><extension>{"secret":"${secret}"}</extension><attributes id="${secret}"><attribute name="${secret}" value="${secret}"/></attributes>`))
 expect(JSON.stringify(r)).not.toContain(secret)
 expect(r.updatedComponents[0]).toMatch(/^component-[a-f0-9]{8}$/)
 expect(parse('<partial-response><extension>{"validationFailed":false}</extension></partial-response>').validationFailed).toBe(false)
 expect(parse('<partial-response><extension>{"nested":{"validationFailed":true}}</extension></partial-response>').validationFailed).toBe(false)
})


it('bounds request parameter allocation before URLSearchParams parsing',()=>{
 expect(parseJsfRequest({postData:'a=&'.repeat(256)+'javax.faces.partial.ajax=true'}).requestMetadataStatus).toBe('too_large')
 expect(parseJsfRequest({postData:'a=&'.repeat(254)+'javax.faces.partial.ajax=true'}).eligibleAjax).toBe(true)
})
it('allows DTD-looking text in CDATA and comments while rejecting actual declarations',()=>{
 expect(parse(wrap('<update id="designForm"><![CDATA[<!DOCTYPE html><html>PRIVATE</html>]]></update>'))).toMatchObject({xmlParsed:true,protocolStatus:'valid',updateCount:1})
 expect(parse('<!-- <!DOCTYPE partial-response> <!ENTITY secret "PRIVATE"> -->'+wrap('<update id="designForm"/>')).protocolStatus).toBe('valid')
 expect(parse('<!DOCTYPE partial-response><partial-response/>').protocolStatus).toBe('invalid_xml')
 expect(parse('<!ENTITY secret "PRIVATE"><partial-response/>').protocolStatus).toBe('invalid_xml')
})
it('classifies HTML without inventing authentication evidence',()=>{
 const r=parse('<html><body>Service unavailable</body></html>',{mime:'text/html',httpStatus:503})
 expect(r).toMatchObject({protocolStatus:'html',errorCode:'PROTOCOL_UNSUPPORTED'})
 expect(r).not.toHaveProperty('businessStatus')
 expect(parse(wrap('<update id="designForm"/>'),{mime:'text/html'})).toMatchObject({protocolStatus:'unsupported',errorCode:'INVALID_MIME'})
})
it.each(['javax','jakarta'])('recognizes bounded prefixed %s ViewState without DOM targets',async family=>{
 const a=createJsfProtocolAnalyzer(),xml=(value:string)=>wrap(`<update id="j_id1:${family}.faces.ViewState:0">${value}</update>`)
 const first=await a.analyze(xml('PRIVATE_FIRST'),{contextKey:'prefixed'})
 expect(first).toMatchObject({viewStatePresent:true,viewStateLength:13,updatedComponents:[],expectedUpdates:[]})
 const second=await a.analyze(xml('PRIVATE_SECOND'),{contextKey:'prefixed'})
 expect(second.viewStateChanged).toBe(true)
 expect(JSON.stringify([first,second])).not.toContain('PRIVATE_')
 expect(parse(wrap(`<update id="j_id1:${family}.faces.ViewStateUnexpected:0">PRIVATE</update>`)).viewStatePresent).toBe(false)
})
