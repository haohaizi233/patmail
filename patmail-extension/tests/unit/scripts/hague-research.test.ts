/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- CDP fixture mocks deliberately exercise malformed and deferred protocol inputs. */
import { describe,it,expect } from 'vitest'
import { HagueResearchDiagnostics } from '../../../scripts/hague-research.mjs'
import { HagueDeepDiagnostics } from '../../../scripts/hague-diagnostics.mjs'
const target={targetId:'target',sessionId:'session',url:'https://hague.wipo.int/HagueEFilingWeb/protected/portfolioManager.xhtml'}
it('does not resurrect the real debugger when disabled before deep activation',async()=>{
 const commands:string[]=[]
 const deep=new HagueDeepDiagnostics(async(method:string)=>{commands.push(method);return {}},()=>{})
 const worker:any={clear(){},async analyze(){return {}}}
 const research=new HagueResearchDiagnostics(deep,async()=>({}),()=>{},{worker})
 const pending=research.enable(target,'research')
 await Promise.resolve();await Promise.resolve();await research.disable();await pending
 expect(research.status().mode).toBe('basic');expect(deep.target).toBeNull();expect(deep.state).toBe('off')
 expect(commands).not.toContain('Debugger.enable');expect(commands).not.toContain('Network.enable')
})
function setup(){const commands:any[]=[];const events:any[]=[];const deep:any={target:null,status(){return {enabled:!!this.target,state:this.state??(this.target?'enabled':'off')}},async enable(t:any){this.target=t;this.state='enabled'},async disable(){this.target=null;this.state='off'}};const worker:any={clear(){},async analyze(kind:string){return kind==='lookup'?{astCorrelationConfidence:'unmatched'}:{bodyStatus:'body_available',expectedUpdates:['form:panel']}}};const research=new HagueResearchDiagnostics(deep,async(method:any,params:any,session:any)=>{commands.push({method,params,session});return {body:'<partial-response/>',base64Encoded:false}},(_k:any,e:any)=>events.push(e),{worker});return {research,commands,events}}
const request={requestId:'r',frameId:'f',loaderId:'l',type:'XHR',request:{url:target.url,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},postData:'javax.faces.partial.ajax=true&javax.faces.source=form%3Asave&password=secret'}}
describe('research admission',()=>{
 it('requires explicit enable and active matching session for body permission',async()=>{const {research,commands}=setup();research.request(target,'session',request);expect(research.requests.size).toBe(0);await research.enable(target);research.request(target,'other',request);expect(research.requests.size).toBe(0);expect(research.bodyCommandAllowed({requestId:'r'},'session')).toBe(false);expect(commands.map(c=>c.method)).toEqual(['Network.enable'])})
 it('reads only after response and completion; emits safe metadata',async()=>{const {research,commands,events}=setup();await research.enable(target);research.request(target,'session',request);research.response('session',{requestId:'r',response:{status:200,mimeType:'text/xml'}});await research.finished('session',{requestId:'r',encodedDataLength:20});expect(commands.filter(c=>c.method==='Network.getResponseBody')).toHaveLength(1);expect(events.some(e=>e.phase==='jsf.parsed')).toBe(true);expect(JSON.stringify(events)).not.toContain('secret');expect(JSON.stringify(events)).not.toContain('<partial-response');expect(research.bodyCommandAllowed({requestId:'r'},'session')).toBe(false)})
 it('rejects attachment and oversized and expired bodies without CDP reads',async()=>{const {research,commands}=setup();await research.enable(target);for(const response of [{status:200,mimeType:'text/xml',headers:{'Content-Disposition':'attachment'}},{status:200,mimeType:'application/octet-stream'}]){research.request(target,'session',request);research.response('session',{requestId:'r',response});await research.finished('session',{requestId:'r'})}expect(commands.some(c=>c.method==='Network.getResponseBody')).toBe(false);await research.disable();expect(research.status().mode).toBe('basic');expect(research.requests.size).toBe(0)})
})

it('drains six requests FIFO with at most two active body reads',async()=>{
 const {research,events}=setup();await research.enable(target)
 let active=0,peak=0;const releases:(()=>void)[]=[];const order:string[]=[]
 research.send=async(method:string,p:any)=>{if(method!=='Network.getResponseBody')return {};active++;peak=Math.max(peak,active);order.push(p.requestId);await new Promise<void>(resolve=>releases.push(resolve));active--;return {body:'<partial-response/>',base64Encoded:false}}
 const done:Promise<void>[]=[]
 for(let i=0;i<6;i++){const requestId=`r${i}`;research.request(target,'session',{...request,requestId});research.response('session',{requestId,response:{status:200,mimeType:'text/xml'}});done.push(research.finished('session',{requestId}))}
 expect(research.queue).toHaveLength(4)
 for(let i=0;i<6;i++){while(!releases.length)await new Promise(resolve=>setTimeout(resolve,0));releases.shift()!();await new Promise(resolve=>setTimeout(resolve,0))}
 await Promise.all(done);expect(peak).toBe(2);expect(order).toEqual(['r0','r1','r2','r3','r4','r5']);expect(events.filter(e=>e.phase==='jsf.parsed')).toHaveLength(6);expect(research.status().stats.bodyReads).toBe(6)
})
it('cancels queued metadata on teardown without future CDP reads',async()=>{
 const {research}=setup();await research.enable(target);const releases:(()=>void)[]=[];let reads=0
 research.send=async()=>{reads++;await new Promise<void>(r=>releases.push(r));return {body:'<partial-response/>'}}
 const done=[];for(let i=0;i<6;i++){const requestId=`r${i}`;research.request(target,'session',{...request,requestId});research.response('session',{requestId,response:{status:200,mimeType:'text/xml'}});done.push(research.finished('session',{requestId}))}
 await research.disable();releases.forEach(r=>r());await Promise.all(done);expect(reads).toBe(2);expect(research.queue).toHaveLength(0);expect(research.status().stats.activeReads).toBe(0)
})
import {pathToFileURL} from 'node:url'
import {AnalysisWorker} from '../../../scripts/hague-research-broker.mjs'
it('terminates a real stalled analysis worker on a hard deadline',async()=>{
 const worker=new AnalysisWorker({timeoutMs:60,workerUrl:pathToFileURL(process.cwd()+'/tests/fixtures/hague-stalled-worker.mjs')})
 const start=Date.now();await expect(worker.analyze('xml','fixture')).rejects.toThrow('cancelled');expect(Date.now()-start).toBeLessThan(1500);expect(worker.stats.timeouts).toBe(1);expect(worker.pending.size).toBe(0);worker.clear()
})
it('releases a lease when TTL expires between drain and readBody',async()=>{
 const {research}=setup();const r:any=research;let now=0;r.now=()=>now;await research.enable(target)
 research.request(target,'session',request);research.response('session',{requestId:'r',response:{status:200,mimeType:'text/xml'}})
 const read=r.readBody.bind(r);r.readBody=(...args:any[])=>{now=60001;return read(...args)}
 await research.finished('session',{requestId:'r'});expect(research.status().stats.activeReads).toBe(0);expect(r.active.size).toBe(0);expect(research.requests.size).toBe(0)
})
it('rejects MIME substrings and reports timeout as unavailable without JSF failure',async()=>{
 const {research,commands,events}=setup();await research.enable(target)
 research.request(target,'session',request);research.response('session',{requestId:'r',response:{status:200,mimeType:'application/notxml'}});await research.finished('session',{requestId:'r'});expect(commands.some(c=>c.method==='Network.getResponseBody')).toBe(false)
 const r:any=research;r.worker.analyze=async(kind:string)=>{if(kind==='lookup')return {astCorrelationConfidence:'unmatched'};throw Object.assign(Error('timeout'),{code:'time_limit'})}
 research.request(target,'session',request);research.response('session',{requestId:'r',response:{status:200,mimeType:'text/xml; charset=utf-8'}});await research.finished('session',{requestId:'r'})
 expect(events.some(e=>e.phase==='analysis.skipped'&&e.skipReason==='time_limit')).toBe(true);expect(events.at(-1).bodyStatus).toBe('body_unavailable');expect(events.some(e=>e.phase==='jsf.parsed')).toBe(false);expect(events.some(e=>e.bodyStatus==='body_parse_failed'||e.jsfError)).toBe(false)
})
import {createViewStateStateMachine} from '../../../src/hague/diagnostics/protocol/jsf-state-machine.mjs'
it('tracks ViewState causal transitions across sequential requests in the same document scope',async()=>{
 const {research,events}=setup();const sm=createViewStateStateMachine();const r:any=research
 r.worker.signal=(action:string,payload:any)=>{
  if(action==='begin_request')sm.beginRequest(payload.scope,payload.requestId)
  if(action==='forget_request')sm.forgetRequest(payload.scope,payload.requestId)
  if(action==='clear')sm.clear()
 }
 r.worker.analyze=async(kind:string,body:any,options:any)=>{
  if(kind==='lookup')return {astCorrelationConfidence:'unmatched'}
  const match=body.match(/<update id="javax\.faces\.ViewState">[\s\S]*?<!\[CDATA\[([\s\S]*?)\]\]>[\s\S]*?<\/update>/)
  const raw=match?match[1]:undefined
  const transitionRes=await sm.recordResponseViewState(options.scope,options.requestId,raw)
  return {
   bodyStatus:'body_available',
   viewStatePresent:!!raw,
   viewStateChanged:transitionRes.transition==='STATE_CHANGED',
   viewStateTransition:transitionRes.transition,
   viewStateStatus:transitionRes.status
  }
 }
 await research.enable(target);r.send=async(_method:string,p:any)=>({body:`<partial-response><changes><update id="javax.faces.ViewState"><![CDATA[private-token-${p.requestId}]]></update></changes></partial-response>`,base64Encoded:false})
 const done=[];for(let i=0;i<6;i++){const requestId=`chain${i}`;research.request(target,'session',{...request,requestId});research.response('session',{requestId,response:{status:200,mimeType:'text/xml'}});done.push(research.finished('session',{requestId}))}
 await Promise.all(done);const parsed=events.filter(e=>e.phase==='jsf.parsed');expect(parsed).toHaveLength(6);expect(parsed.every(e=>e.viewStatePresent===true)).toBe(true)
 expect(parsed[0].viewStateTransition).toBe('INITIAL_OBSERVED');expect(parsed[0].viewStateChanged).toBe(false)
 for(let i=1;i<6;i++){expect(parsed[i].viewStateTransition).toBe('STATE_CHANGED');expect(parsed[i].viewStateChanged).toBe(true)}
 expect(JSON.stringify(events)).not.toContain('private-token')
})
it('counts all selected-target observations and resets session stats on enable',async()=>{
 const {research,events}=setup();const r:any=research;r.observerStateProvider=()=> 'connected';await research.enable(target)
 research.request(target,'session',{...request,type:'Document'});research.request(target,'session',request);research.request(target,'foreign',request)
 expect(research.status().stats.observedRequests).toBe(2);expect(research.status().admitted).toBe(1);research.emit('research.status',{});expect(events.at(-1)).toMatchObject({researchState:'enabled',observerState:'connected',targetId:'target',sessionId:'session',statsScope:'current_session'})
 await research.disable();expect(research.status().statsScope).toBe('last_session');await research.enable(target);expect(research.status().stats.observedRequests).toBe(0)
})
it('rolls back research when bounded Network enable is unavailable',async()=>{
 const {research,events}=setup();research.send=async()=>{throw Error('unsupported buffer budget')}
 const status=await research.enable(target);expect(status).toMatchObject({enabled:false,state:'unsupported',mode:'basic'});research.request(target,'session',request);expect(research.requests.size).toBe(0);expect(research.bodyCommandAllowed({requestId:'r'},'session')).toBe(false);expect(events.at(-1)).toMatchObject({researchState:'unsupported',mode:'basic'})
})
it('invalidates an active reused request ID and admits it only after lease cleanup',async()=>{
 const {research,events}=setup();await research.enable(target);let release:(v:any)=>void=()=>{};let reads=0;research.send=async()=>{reads++;return await new Promise(resolve=>release=resolve)}
 research.request(target,'session',request);research.response('session',{requestId:'r',response:{status:200,mimeType:'text/xml'}});const old=research.finished('session',{requestId:'r'})
 research.request(target,'session',request);research.response('session',{requestId:'r',response:{status:200,mimeType:'text/xml'}});await research.finished('session',{requestId:'r'});expect(reads).toBe(1);expect(research.requests.size).toBe(0)
 release({body:'<partial-response/>',base64Encoded:false});await old;expect(events.some(e=>e.phase==='jsf.parsed')).toBe(false);expect(events.some(e=>e.skipReason==='request_reused')).toBe(true);expect(research.status().stats.activeReads).toBe(0)
 research.request(target,'session',request);expect(research.requests.size).toBe(1)
})
it('admits standard Faces-Request header with omitted large form metadata, never multipart',async()=>{
 const {research}=setup();await research.enable(target)
 const headerOnly={...request,request:{...request.request,postData:undefined,headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','Faces-Request':'partial/ajax'}}}
 research.request(target,'session',headerOnly);expect(research.requests.get('session:r').request).toEqual({eligibleAjax:true,requestMetadataStatus:'unsupported',parameterNames:[]})
 research.request(target,'session',{...headerOnly,requestId:'multipart',request:{...headerOnly.request,headers:{'Content-Type':'multipart/form-data','Faces-Request':'partial/ajax'}}});expect(research.requests.has('session:multipart')).toBe(false)
})
it('prunes expired unfinished request metadata before admitting fresh requests',async()=>{
 const {research}=setup();const r:any=research;let now=0;r.now=()=>now;await research.enable(target);research.request(target,'session',request);now=60001;research.request(target,'session',{...request,requestId:'fresh'});expect(research.requests.has('session:r')).toBe(false);expect(research.requests.has('session:fresh')).toBe(true);expect(research.status().stats.droppedDiagnostics).toBe(1)
})
it('rejects worker creation failures asynchronously without breaking the collector',async()=>{
 const worker=new AnalysisWorker({workerUrl:new URL('https://example.invalid/worker.mjs')});let pending:Promise<unknown>|undefined
 expect(()=>{pending=worker.analyze('lookup',{})}).not.toThrow();await expect(pending).rejects.toMatchObject({code:'analysis_error'});expect(worker.pending.size).toBe(0)
 const {research}=setup();const r:any=research;r.worker=worker;await research.enable(target);expect(()=>research.request(target,'session',request)).not.toThrow();await new Promise(resolve=>setTimeout(resolve,0));await research.disable();expect(research.status().mode).toBe('basic')
})
it('removes pending timer and request when worker postMessage cannot clone input',async()=>{
 const worker=new AnalysisWorker({workerUrl:pathToFileURL(process.cwd()+'/tests/fixtures/hague-stalled-worker.mjs')});await expect(worker.analyze('lookup',{cannotClone(){}})).rejects.toMatchObject({code:'analysis_error'});expect(worker.pending.size).toBe(0);expect(worker.stats.timeouts).toBe(0);worker.clear()
})
it('publishes only standard request protocol metadata and safe indexed AST fields',async()=>{
 const {research,events}=setup();const r:any=research;r.worker.analyze=async()=>({astConfidence:'static',astCorrelationConfidence:'probable',matches:[{kind:'PrimeFaces.ab',source:'ApplicantForm:confirmBtn',form:'ApplicantForm',process:'@form',update:'ApplicantForm',event:'click',parameterNames:['javax.faces.source'],location:{line:1,column:0,scriptId:'3'}}]})
 await research.enable(target);research.request(target,'session',{...request,request:{...request.request,postData:'javax.faces.partial.ajax=true&javax.faces.source=ApplicantForm%3AconfirmBtn&javax.faces.partial.execute=%40form&javax.faces.partial.render=ApplicantForm&applicantEmail=private%40example.com&secretFieldName=private-secret-value'}})
 await new Promise(resolve=>setTimeout(resolve,0));const dispatched=events.find(e=>e.phase==='request.dispatched');expect(dispatched).toMatchObject({sourceComponent:'ApplicantForm:confirmBtn',form:'ApplicantForm',process:'@form',update:'ApplicantForm',eligibleAjax:true,isUpload:false,requestMetadataStatus:'parsed',sessionId:'session',targetId:'target',frameId:'f',loaderId:'l',cdpRequestId:'r',httpMethod:'POST',urlPath:'/HagueEFilingWeb/protected/portfolioManager.xhtml'})
 const edge=events.find(e=>e.phase==='correlation.resolved');expect(edge).toMatchObject({astCallType:'PrimeFaces.ab',sourceComponent:'ApplicantForm:confirmBtn',form:'ApplicantForm',process:'@form',event:'click',astCorrelationConfidence:'probable'});expect(edge.traceId).toBeUndefined();expect(edge.caseRunId).toBeUndefined();expect(edge.stepIndex).toBeUndefined();for(const secret of ['private@example.com','private-secret-value','applicantEmail','secretFieldName','postData'])expect(JSON.stringify(events)).not.toContain(secret)
})
it('does not restore older research intent after a newer deep enable on the same target',async()=>{
 const {research,commands}=setup();const r:any=research;let release:()=>void=()=>{};let entered:()=>void=()=>{};const reached=new Promise<void>(resolve=>entered=resolve);let calls=0;const original=r.deep.enable.bind(r.deep)
 r.deep.enable=async(t:any)=>{calls++;if(calls===1){entered();await new Promise<void>(resolve=>release=resolve)}await original(t)}
 const old=research.enable(target,'research');await reached;await research.enable(target,'deep');expect(research.status().mode).toBe('deep');release();await old
 expect(research.status().mode).toBe('deep');expect(commands.some(c=>c.method==='Network.enable')).toBe(false);expect(research.bodyCommandAllowed({requestId:'r'},'session')).toBe(false)
})
it('revokes an enable paused before deep activation when public disable arrives',async()=>{
 const {research,commands}=setup();const r:any=research;let release:()=>void=()=>{};let entered:()=>void=()=>{};const reached=new Promise<void>(resolve=>entered=resolve);const original=r.deep.enable.bind(r.deep)
 r.deep.enable=async(t:any)=>{entered();await new Promise<void>(resolve=>release=resolve);await original(t)}
 const old=research.enable(target,'research');await reached;await research.disable();release();await old;expect(research.status().mode).toBe('basic');expect(commands.some(c=>c.method==='Network.enable')).toBe(false)
})
