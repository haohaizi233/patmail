/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- CDP fixture mocks deliberately exercise malformed and deferred protocol inputs. */
import { it, expect } from 'vitest'
import { deepCommandAllowed, safeHagueUrl, networkMetadata, correlateRequest, HagueDeepDiagnostics } from '../../../scripts/hague/diagnostics/hague-diagnostics.mjs'
it('denies unsafe commands, foreign origins and sensitive paths',()=>{
 expect(deepCommandAllowed('Runtime.evaluate',{})).toBe(false)
 expect(deepCommandAllowed('Debugger.setSkipAllPauses',{skip:false})).toBe(false)
 expect(safeHagueUrl('https://evil.wipo.int/secret')).toBe(null)
 expect(JSON.stringify(safeHagueUrl('https://hague.wipo.int/private/NAME@example.com.pdf'))).not.toContain('NAME')
})
it('preserves absent HTTP status and concurrency ambiguity',()=>{
 expect(networkMetadata({}, {errorText:'net::ERR_TIMED_OUT'})).toMatchObject({httpStatus:null,failureCategory:'timeout'})
 const r={targetId:'t',frameId:'f',httpMethod:'POST',urlPath:'/application.xhtml',timestamp:1000}
 expect(correlateRequest(r,Array.from({length:6},(_,i)=>({...r,traceId:String(i)}))).correlationConfidence).toBe('ambiguous')
 expect(correlateRequest(r,[{...r,traceId:'one'}]).correlationConfidence).toBe('probable')
})
it('configures non-pausing debugger and disables cleanly',async()=>{
 const calls:[string,Record<string,unknown>][]=[];const c=new HagueDeepDiagnostics(async(m:string,p:Record<string,unknown>)=>{calls.push([m,p]);return {}},()=>{})
 await c.enable({targetId:'t',sessionId:'s',url:'https://hague.wipo.int/application.xhtml'})
 expect(calls.slice(0,2)).toEqual([['Debugger.setSkipAllPauses',{skip:true}],['Debugger.enable',{}]])
 await c.disable();expect(c.status().enabled).toBe(false);expect(calls.at(-1)?.[0]).toBe('Debugger.disable')
})
it('rejects every mutating deep family and extra command parameters',()=>{
 for(const m of ['Debugger.pause','Debugger.setBreakpoint','Debugger.setScriptSource','Fetch.enable','Network.setCookie','Browser.setDownloadBehavior','Page.setDownloadBehavior','Runtime.evaluate']) expect(deepCommandAllowed(m,{})).toBe(false)
 expect(deepCommandAllowed('Debugger.setBreakpointsActive',{active:false})).toBe(false)
 expect(deepCommandAllowed('Debugger.enable',{maxScriptsCacheSize:100})).toBe(false)
 expect(deepCommandAllowed('Debugger.getScriptSource',{scriptId:'1',expression:'secret'})).toBe(false)
})
it('unsupported debugger degrades closed without arbitrary execution',async()=>{
 const c=new HagueDeepDiagnostics(async()=>{throw Error('unsupported')},()=>{})
 expect(await c.enable({targetId:'t',sessionId:'s',url:'https://hague.wipo.int/application.xhtml'})).toMatchObject({enabled:false,state:'unsupported'})
})
it('bounds source reads and discards returned raw source from persisted metadata',async()=>{
 const calls:[string,Record<string,unknown>][]=[];const logs:[string,Record<string,unknown>][]=[]
 const c=new HagueDeepDiagnostics(async(m:string,p:Record<string,unknown>)=>{calls.push([m,p]);return {scriptSource:'PrimeFaces.ab({s:"ApplicantForm:confirmBtn"}); // PRIVATE_SECRET'}},(k:string,v:Record<string,unknown>)=>logs.push([k,v]))
 const target={targetId:'t',sessionId:'s',url:'https://hague.wipo.int/application.xhtml'}
 await c.enable(target)
 await c.script(target,{scriptId:'1',url:'https://evil.example/secret.js',length:100})
 await c.script(target,{scriptId:'2',url:'https://hague.wipo.int/secret.js',length:200_000})
 expect(calls.filter(v=>v[0]==='Debugger.getScriptSource')).toHaveLength(0)
 await c.script(target,{scriptId:'3',url:'https://hague.wipo.int/script.js',length:80})
 await c.script(target,{scriptId:'3',url:'https://hague.wipo.int/script.js',length:80})
 expect(calls.filter(v=>v[0]==='Debugger.getScriptSource')).toHaveLength(1)
 expect(JSON.stringify(logs)).not.toContain('PRIVATE_SECRET')
 expect(logs.find(v=>v[1].phase==='protocol.analyzed')?.[1]).toMatchObject({source:'cdp',phase:'protocol.analyzed',astCallType:'PrimeFaces.ab',sourceComponent:'ApplicantForm:confirmBtn'})
 expect(JSON.stringify(logs)).not.toContain('PrimeFaces.ab({')
 await c.disable()
 await c.script(target,{scriptId:'4',url:'https://hague.wipo.int/script.js',length:80})
 expect(calls.filter(v=>v[0]==='Debugger.getScriptSource')).toHaveLength(1)
})
it('keeps draft alerts structural and Hague UI text category-only',async()=>{
 const {safeHagueSnapshotText,safeDraftTextSummary}=await import('../../../scripts/hague/diagnostics/hague-diagnostics.mjs')
 const secret='Applicant Alice Example WIPO123456789 alice@example.com 123 Private Road secret.pdf'
 expect(JSON.stringify(safeDraftTextSummary([secret,'草稿保存失败 '+secret]))).not.toContain('Alice')
 expect(safeDraftTextSummary([secret,'草稿保存失败 '+secret])).toMatchObject({count:2})
 for(const v of [secret,'正在生成PDF '+secret,'接口失败 '+secret]) expect(safeHagueSnapshotText(v)).not.toContain('Example')
 expect(safeHagueSnapshotText('接口失败 '+secret)).toBe('error')
})
it('source in-flight after disable never persists any analysis',async()=>{
 let release:(value:unknown)=>void=()=>{throw Error('source not requested')};const logs:[string,Record<string,unknown>][]=[]
 const c=new HagueDeepDiagnostics(async(m:string)=>m==='Debugger.getScriptSource'?await new Promise(resolve=>release=resolve):{},(k:string,v:Record<string,unknown>)=>logs.push([k,v]))
 const t={targetId:'t',sessionId:'s',url:'https://hague.wipo.int/application.xhtml'}
 await c.enable(t);const pending=c.script(t,{scriptId:'1',url:'https://hague.wipo.int/script.js',length:80})
 await c.disable();release({scriptSource:'PrimeFaces.ab({s:"SECRET"})'});await pending
 expect(logs).toEqual([]);expect(c.status()).toMatchObject({enabled:false,scripts:0,bytes:0})
})
it('time-only evidence cannot become exact even with a unique candidate',()=>{
 const r={targetId:'t',frameId:'f',httpMethod:'POST',urlPath:'/application.xhtml',timestamp:1000}
 expect(correlateRequest(r,[{...r,traceId:'one'}]).correlationConfidence).toBe('probable')
 expect(correlateRequest({...r,cdpRequestId:'1',sessionId:'s'},[{...r,cdpRequestId:'1',sessionId:'other',traceId:'one'}]).correlationConfidence).toBe('unmatched')
 expect(correlateRequest({...r,cdpRequestId:'1',sessionId:'s'},[{...r,cdpRequestId:'1',sessionId:'s',traceId:'one'}]).correlationConfidence).toBe('exact')
})
it('adapts only safe observer evidence into offline TraceEvents',async()=>{
 const {observerEventsToTraces}=await import('../../../scripts/hague/diagnostics/hague-diagnostics.mjs')
 const result=observerEventsToTraces([{ts:'2026-11-13T00:00:00Z',kind:'network.response',source:'hague',requestId:'41.2',origin:'https://hague.wipo.int',path:'/HagueEFilingWeb/protected/page/application.xhtml',status:503,mime:'text/xml',body:'PRIVATE_SECRET'}, {ts:'2026-11-14T00:00:00Z',kind:'network.failure',source:'hague',requestId:'42.1',httpStatus:null,failureCategory:'timeout'}, {kind:'app.snapshot',draftTexts:['PRIVATE_SECRET']}])
 expect(result).toHaveLength(2);expect(result[0]).toMatchObject({version:1,source:'cdp',phase:'http.response',httpStatus:503,cdpRequestId:'41.2',errorCode:'HTTP_503',errorStage:'http'})
 expect(JSON.stringify(result)).not.toContain('PRIVATE_SECRET');expect(result[1].httpStatus).toBe(null)
})
it('offline network exports preserve proven candidate tree links and keep ambiguity unowned',async()=>{
 const {observerEventsToTraces}=await import('../../../scripts/hague/diagnostics/hague-diagnostics.mjs')
 const raw={ts:'2026-11-14T00:00:00Z',kind:'network.response',source:'hague',requestId:'41.2',applicationRequestId:'req-one',traceId:'trace-one',caseRunId:'case-one',operation:'applicant',stepIndex:2,transportMode:'http',correlationConfidence:'exact',status:200}
 const result=observerEventsToTraces([raw,{...raw,correlationConfidence:'ambiguous'},{...raw,correlationConfidence:'probable'}])
 expect(result[0]).toMatchObject({traceId:'trace-one',caseRunId:'case-one',requestId:'req-one',cdpRequestId:'41.2',stepIndex:2,operation:'applicant',correlationConfidence:'exact'})
 expect(result[1].traceId).toBeUndefined();expect(result[1].caseRunId).toBeUndefined();expect(result[1].requestId).toBeUndefined();expect(result[1].correlationConfidence).toBe('ambiguous');expect(result[2]).toMatchObject({correlationConfidence:'probable'});expect(result[2].traceId).toBeUndefined();expect(result[2].requestId).toBeUndefined()
})
it('passes script offsets to worker and emits absolute CDP positions with script identity',async()=>{
 const logs:any[]=[];let options:any
 const analyzer={clear(){},async analyze(_kind:string,_source:string,metadata:any){options=metadata;return {calls:[{kind:'PrimeFaces.ab',confidence:'static',source:'form:save',location:{line:1,column:2}},{kind:'PrimeFaces.ab',confidence:'static',source:'form:save',location:{line:2,column:3}}]}}}
 const c=new HagueDeepDiagnostics(async()=>({scriptSource:'fixture'}),(_kind:string,event:any)=>logs.push(event),analyzer)
 const t={targetId:'t',sessionId:'s',url:'https://hague.wipo.int/application.xhtml'};await c.enable(t);await c.script(t,{scriptId:'123',url:t.url,length:7,startLine:40,startColumn:9})
 expect(options).toMatchObject({startLine:40,startColumn:9,scriptId:'123'})
 const traces=logs.filter(e=>e.version===1);expect(traces.map(e=>e.sourceLocation)).toMatchObject([{line:41,column:11,scriptId:'123'},{line:42,column:3,scriptId:'123'}]);expect(traces.every(e=>e.eventId)).toBe(true)
 await c.disable()
})

it('reports authorized source limit skips while ignoring foreign sessions',async()=>{
 const logs:any[]=[];const c=new HagueDeepDiagnostics(async()=>({}),(_kind:string,event:any)=>logs.push(event));const t={targetId:'1',sessionId:'2',url:'https://hague.wipo.int/application.xhtml'};await c.enable(t)
 await c.script({...t,sessionId:'foreign'},{scriptId:'3',url:t.url,length:200000});expect(logs).toHaveLength(0)
 await c.script(t,{scriptId:'3',url:t.url,length:200000});expect(logs).toHaveLength(1);expect(logs[0]).toMatchObject({phase:'analysis.skipped',analysisKind:'ast',skipReason:'source_limit',stats:{skippedAnalyses:1}});expect(c.skipped).toBe(1);await c.disable()
})
it('rejects Unicode source exceeding UTF8 byte budget before worker parsing',async()=>{
 let parsed=0;const logs:any[]=[];const analyzer={clear(){},async analyze(){parsed++;return {calls:[]}}}
 const c=new HagueDeepDiagnostics(async()=>({scriptSource:'//'+ '密'.repeat(64000)}),(_kind:string,event:any)=>logs.push(event),analyzer);const t={targetId:'1',sessionId:'2',url:'https://hague.wipo.int/application.xhtml'};await c.enable(t)
 await c.script(t,{scriptId:'3',url:t.url,length:64002});expect(parsed).toBe(0);expect(c.status().bytes).toBe(0);expect(logs.some(e=>e.phase==='analysis.skipped'&&e.skipReason==='source_limit')).toBe(true);expect(JSON.stringify(logs)).not.toContain('密');await c.disable()
})
