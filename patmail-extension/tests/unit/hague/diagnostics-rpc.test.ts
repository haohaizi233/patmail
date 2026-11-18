import {afterEach,expect,it,vi} from 'vitest'
import {fetchHague,handleHagueHttp} from '../../../src/background/hague-http'
import {hagueHttpFetch} from '../../../src/hague/http-client'
import {HagueHttpContext} from '../../../src/hague/http-context'
import {makeTraceContext,setDiagnosticMode,clearDiagnosticEvents,getDiagnosticEvents} from '../../../src/hague/diagnostics/store'
const url='https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml'
const trace=makeTraceContext('case-123',2,'applicant','http',7)
it('detects protected GET authentication redirects without following into a CORS failure',async()=>{
 const redirected=new Response('');Object.defineProperty(redirected,'type',{value:'opaqueredirect'})
 const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>redirected);vi.stubGlobal('fetch',fetcher)
 expect(await fetchHague({url,method:'GET',trace})).toMatchObject({diagnosticError:{errorCode:'AUTH_REDIRECT'}})
 expect(fetcher.mock.calls[0]?.[1]).toMatchObject({redirect:'manual'})
})
it('classifies CORS-hidden expired authentication with a read-only probe and never resends the POST',async()=>{
 const redirected=new Response('');Object.defineProperty(redirected,'type',{value:'opaqueredirect'})
 const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{if(init?.method==='POST')throw new TypeError('Failed to fetch');return redirected});vi.stubGlobal('fetch',fetcher)
 expect(await fetchHague({url,method:'POST',trace})).toMatchObject({diagnosticError:{errorCode:'AUTH_REDIRECT',sideEffectMayHaveOccurred:true}})
 expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
})
afterEach(()=>{vi.unstubAllGlobals();setDiagnosticMode(false);clearDiagnosticEvents()})
it('times out an unresponsive write RPC once without repeating the write',async()=>{
 const sendMessage=vi.fn(()=>new Promise<never>(()=>{}));vi.stubGlobal('chrome',{runtime:{sendMessage}})
 vi.useFakeTimers()
 try{
  const ctx=new HagueHttpContext('rpc-stall',hagueHttpFetch(7));ctx.setTrace(trace)
  ctx.load('<form id="form"><input name="javax.faces.ViewState" value="A"><button type="button" id="form:save">Save</button></form>',url)
  const check=expect(ctx.post({source:'form:save'})).rejects.toMatchObject({diagnostic:{errorCode:'NETWORK_TIMEOUT',transportStatus:'timeout',httpStatus:null}})
  await vi.advanceTimersByTimeAsync(60001);await check
  expect(sendMessage).toHaveBeenCalledOnce()
  const controller=new AbortController();controller.abort()
  await expect(hagueHttpFetch(7)(url,{signal:controller.signal},trace)).rejects.toMatchObject({name:'AbortError'})
  expect(sendMessage).toHaveBeenCalledOnce()
 }finally{vi.useRealTimers()}
})
it('reports only safe dispatch metadata to the optional fixed observer; observer failure never retries',async()=>{
 const response=new Response('body',{status:200});Object.defineProperty(response,'url',{value:url})
 const fetcher=vi.fn(()=>Promise.resolve(response)),binding=vi.fn(()=>{throw new Error('observer unavailable')})
 vi.stubGlobal('fetch',fetcher);vi.stubGlobal('__patmailCdpObserver',binding)
 expect((await fetchHague({url:url+'?token=PRIVATE',method:'POST',trace,requestId:'req-1',diagnosticsEnabled:true,params:[['secret','PRIVATE']]})).status).toBe(200)
 expect(fetcher).toHaveBeenCalledOnce();expect(binding).toHaveBeenCalledOnce()
 expect(binding.mock.calls[0]).not.toContain('PRIVATE')
 const payload:unknown=JSON.parse(String((binding.mock.calls as unknown[][])[0]?.[0]))
 expect(payload).toMatchObject({kind:'hague-trace',event:{traceId:trace.traceId,requestId:'req-1',urlPath:'/HagueEFilingWeb/protected/page/application.xhtml'}})
 expect(JSON.stringify(payload)).not.toContain('PRIVATE')
})
it('distinguishes abort, timer timeout and RPC disconnection without inventing HTTP codes',async()=>{
 vi.stubGlobal('fetch',vi.fn(()=>Promise.reject(new DOMException('private abort','AbortError'))))
 expect((await fetchHague({url,method:'POST',trace})).diagnosticError).toMatchObject({errorCode:'NETWORK_ABORTED',transportStatus:'aborted',httpStatus:null})
 vi.useFakeTimers()
 try{
  vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>init.signal?.addEventListener('abort',()=>reject(new DOMException('private','AbortError'))))))
  const job=fetchHague({url,method:'POST',trace});await vi.advanceTimersByTimeAsync(60001)
  expect((await job).diagnosticError).toMatchObject({errorCode:'NETWORK_TIMEOUT',transportStatus:'timeout',httpStatus:null})
 }finally{vi.useRealTimers()}
 vi.stubGlobal('chrome',{runtime:{sendMessage:()=>Promise.reject(new Error('private RPC context'))}})
 await expect(hagueHttpFetch(7)(url,undefined,trace)).rejects.toMatchObject({diagnostic:{errorCode:'RPC_FAILED',transportStatus:'rpc_error',httpStatus:null}})
})
it.each([302,400,401,403,404,429,500,502,503,504,524])('retains HTTP%s rather than assigning a synthetic status',async status=>{
 const ctx=new HagueHttpContext('matrix',()=>Promise.resolve(new Response('error',{status})));ctx.setTrace(trace)
 await expect(ctx.get(url)).rejects.toMatchObject({diagnostic:{httpStatus:status,errorCode:`HTTP_${status}`,certainty:'unknown'}})
})
it('preserves actual HTTP503 across injected fetch, background RPC, client and context',async()=>{
 const response=new Response('unavailable',{status:503,headers:{'content-type':'text/html'}});Object.defineProperty(response,'url',{value:url})
 vi.stubGlobal('fetch',vi.fn(()=>Promise.resolve(response)))
 const chromeMock={runtime:{id:'extension',sendMessage:vi.fn((m:unknown)=>handleHagueHttp(m,{id:'extension',url:'chrome-extension://extension/app.html'}))},tabs:{get:vi.fn(()=>Promise.resolve({url}))},webNavigation:{getFrame:vi.fn(()=>Promise.resolve({documentId:'document-1'}))},scripting:{executeScript:vi.fn(async({args}:{args:Parameters<typeof fetchHague>})=>[{result:await fetchHague(...args)}])}}
 vi.stubGlobal('chrome',chromeMock);setDiagnosticMode(true)
 const ctx=new HagueHttpContext('test',hagueHttpFetch(7));ctx.setTrace(trace)
 await expect(ctx.get(url)).rejects.toMatchObject({diagnostic:{httpStatus:503,errorCode:'HTTP_503',errorStage:'http',traceId:trace.traceId}})
 const sent=chromeMock.runtime.sendMessage.mock.calls[0]?.[0]
 expect(sent).toMatchObject({request:{trace:{traceId:trace.traceId},requestId:expect.stringMatching(/^req-/) as unknown}})
 expect(getDiagnosticEvents().find(e=>e.phase==='http.response')).toMatchObject({httpStatus:503,traceId:trace.traceId,businessStatus:'unknown'})
})
it('preserves null status for transport failure and real final200 for login redirect',async()=>{
 vi.stubGlobal('fetch',vi.fn(()=>Promise.reject(new Error('secret raw bearer'))))
 const failed=await fetchHague({url,method:'POST',trace})
 expect(failed).toMatchObject({status:null,diagnosticError:{httpStatus:null,errorCode:'NETWORK_FAILED',sideEffectMayHaveOccurred:true}})
 expect(JSON.stringify(failed)).not.toContain('secret')
 const login=new Response('secret form',{status:200});Object.defineProperty(login,'url',{value:'https://hague.wipo.int/login'})
 vi.stubGlobal('fetch',vi.fn(()=>Promise.resolve(login)))
 expect(await fetchHague({url,method:'GET',trace})).toMatchObject({status:200,diagnosticError:{errorCode:'AUTH_REDIRECT',httpStatus:200}})
})
it('preserves observed response status when reading the body fails',async()=>{
 vi.stubGlobal('fetch',vi.fn(()=>Promise.resolve({url,status:200,arrayBuffer:()=>Promise.reject(new Error('socket body secret'))})))
 const result=await fetchHague({url,method:'POST',trace})
 expect(result.diagnosticError).toMatchObject({httpStatus:200,transportStatus:'network_error',businessStatus:'unknown'})
 expect(JSON.stringify(result)).not.toContain('socket body secret')
})
