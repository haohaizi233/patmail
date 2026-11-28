import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {HagueDeepDiagnostics} from '../../scripts/hague/diagnostics/hague-diagnostics.mjs'

// Entirely synthetic origin in a fresh browser. Every HTTP request is fulfilled or denied locally.
const browser=await chromium.launch({executablePath:process.env.HAGUE_TEST_CHROME,headless:true})
const context=await browser.newContext(),logs=[];let external=0,paused=0
const url='https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml'
await context.route(/^https?:/,route=>{
 if(route.request().url()===url)return route.fulfill({contentType:'text/html',body:`<script>function fixtureAction(){PrimeFaces.ab({s:'ApplicantForm:save',pa:[{name:'param',value:'PRIVATE_FIXTURE_VALUE'}]})}</script><p>Offline CDP fixture</p>`})
 external++;return route.abort()
})
let session,deep,evaluationTimer
try{
 const page=await context.newPage();await page.goto(url)
 session=await context.newCDPSession(page)
 const target={targetId:'fixture-target',sessionId:'fixture-session',url}
 deep=new HagueDeepDiagnostics((method,params)=>session.send(method,params),(kind,fields)=>logs.push({kind,...fields}))
 session.on('Debugger.paused',()=>{paused++})
 session.on('Debugger.scriptParsed',params=>{void deep.script(target,params)})
 await deep.enable(target);assert.equal(deep.status().state,'enabled','non-pausing guard must be supported before enabling')
 // eslint-disable-next-line no-debugger -- Own isolated fixture verifies that the guard suppresses pauses.
 await Promise.race([page.evaluate(()=>{debugger;return 1}),new Promise((_,reject)=>{evaluationTimer=setTimeout(()=>reject(Error('unexpected debugger pause')),5000)})]);clearTimeout(evaluationTimer)
 for(let i=0;i<100&&!logs.some(e=>e.kind==='hague.script.analysis');i++)await new Promise(resolve=>setTimeout(resolve,20))
 assert.ok(logs.some(e=>e.kind==='hague.script.analysis'),'real isolated CDP scriptParsed/getScriptSource must produce metadata')
 assert.ok(logs.some(e=>e.phase==='protocol.analyzed'&&e.astCallType==='PrimeFaces.ab'))
 assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_FIXTURE_VALUE/)
 assert.equal(paused,0);assert.equal(external,0)
 await deep.disable();assert.deepEqual(deep.status(),{enabled:false,state:'off',scripts:0,bytes:0})
 console.log('Hague isolated CDP: non-pausing guard, bounded script AST, privacy and cleanup passed; no external requests')
}finally{clearTimeout(evaluationTimer);await deep?.disable();await session?.detach().catch(()=>{});await context.close();await browser.close()}
