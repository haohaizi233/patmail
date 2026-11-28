import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {HagueDeepDiagnostics} from '../../scripts/hague/diagnostics/hague-diagnostics.mjs'
import {HagueResearchDiagnostics} from '../../scripts/hague/research/hague-research.mjs'
import {AnalysisWorker} from '../../scripts/hague/research/hague-research-broker.mjs'

// Fresh browser; every HTTP destination is fulfilled or denied before network I/O.
const url='https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml'
const xml='<partial-response><changes><update id="ApplicantForm"><![CDATA[<p>PRIVATE_RESPONSE</p>]]></update><update id="javax.faces.ViewState">PRIVATE_STATE</update><eval>PRIVATE_EVAL</eval></changes></partial-response>'
const script=`window.PrimeFaces={ab:function(){return fetch(location.href,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'javax.faces.partial.ajax=true&javax.faces.source=ApplicantForm%3Asave&javax.faces.partial.execute=%40this&javax.faces.partial.render=ApplicantForm&private=PRIVATE_REQUEST'}).then(r=>r.text())}};function fixtureAction(){return PrimeFaces.ab({s:'ApplicantForm:save',p:'@this',u:'ApplicantForm'})};`
const browser=await chromium.launch({executablePath:process.env.HAGUE_TEST_CHROME,headless:true})
const context=await browser.newContext({serviceWorkers:'block'}),logs=[],inflight=new Set()
let external=0,paused=0,bodyReads=0,session,research,deep
await context.route(/^https?:/,route=>{
 const req=route.request()
 if(req.url()!==url){external++;return route.abort()}
 return route.fulfill(req.method()==='POST'?{contentType:'application/xml',body:xml}:{contentType:'text/html',body:`<script>${script}</script><p>Offline research fixture</p>`})
})
try{
 const page=await context.newPage();session=await context.newCDPSession(page)
 const target={targetId:'isolated-target',sessionId:'isolated-session',url},worker=new AnalysisWorker({timeoutMs:5000})
 const send=(method,params)=>{
  if(method==='Network.getResponseBody'){assert.ok(research.bodyCommandAllowed(params,target.sessionId),'actual body reads require active admission');assert.equal(research.mode,'research');bodyReads++}
  return session.send(method,params)
 }
 const log=(kind,fields)=>logs.push({kind,...fields})
 deep=new HagueDeepDiagnostics(send,log,worker);research=new HagueResearchDiagnostics(deep,send,log,{worker})
 const track=p=>{inflight.add(p);void p.finally(()=>inflight.delete(p))}
 session.on('Debugger.paused',()=>{paused++})
 session.on('Debugger.scriptParsed',p=>track(deep.script(target,p)))
 session.on('Network.requestWillBeSent',p=>research.request(target,target.sessionId,p))
 session.on('Network.responseReceived',p=>research.response(target.sessionId,p))
 session.on('Network.loadingFinished',p=>track(research.finished(target.sessionId,p)))
 session.on('Network.loadingFailed',p=>research.forget(target.sessionId,p))
 await session.send('Network.enable');await page.goto(url)
 await page.evaluate(()=>window.fixtureAction());await Promise.all([...inflight]);assert.equal(bodyReads,0,'basic mode never reads bodies')
 await research.enable(target);assert.equal(research.mode,'research')
 await page.evaluate(()=>window.fixtureAction())
 const deadline=Date.now()+10000
 while(Date.now()<deadline&&!logs.some(e=>e.phase==='jsf.parsed'))await new Promise(resolve=>setTimeout(resolve,20))
 await Promise.all([...inflight])
 const parsed=logs.find(e=>e.phase==='jsf.parsed');assert.ok(parsed,'real CDP response body reached worker XML parser')
 assert.equal(parsed.xmlParsed,true);assert.equal(parsed.domStatus,'expected_only');assert.equal(parsed.updateCount,2)
 assert.equal(parsed.viewStatePresent,true);assert.equal(bodyReads,1)
 assert.ok(logs.some(e=>e.phase==='protocol.analyzed'&&e.astCallType==='PrimeFaces.ab'),'own script source is analyzed through real CDP')
 assert.ok(logs.some(e=>e.phase==='correlation.resolved'),'correlation evidence is explicit')
 assert.ok(logs.some(e=>e.phase==='correlation.resolved'&&e.astCorrelationConfidence==='exact'&&e.astCallType==='PrimeFaces.ab'),'actual fixture member-property initiator has a unique exact AST edge')
 for(const event of logs){assert.notEqual(event.businessStatus,'completed');if(event.phase==='correlation.resolved')assert.ok(['exact','probable','ambiguous','unmatched'].includes(event.astCorrelationConfidence))}
 assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_/)
 assert.equal(paused,0);assert.equal(external,0)
 const before=bodyReads;await research.disable();await page.evaluate(()=>window.fixtureAction());await Promise.all([...inflight]);assert.equal(bodyReads,before)
 assert.equal(worker.worker,null);assert.equal(worker.pending.size,0);assert.equal(research.requests.size,0);assert.equal(research.queue.length,0);assert.equal(research.bytes,0);assert.equal(deep.seen.size,0)
 console.log(JSON.stringify({test:'isolated CDP research',passed:true,bodyReads,parsedResponses:1,paused,externalRequests:external,astEvidence:logs.filter(e=>e.phase==='protocol.analyzed').length,correlations:logs.filter(e=>e.phase==='correlation.resolved').map(e=>e.astCorrelationConfidence)}))
}finally{await research?.disable();await session?.detach().catch(()=>{});await context.close();await browser.close()}


