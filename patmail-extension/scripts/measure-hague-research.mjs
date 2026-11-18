import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import os from 'node:os'
import {performance} from 'node:perf_hooks'
import {HagueDeepDiagnostics} from './hague-diagnostics.mjs'
import {HagueResearchDiagnostics} from './hague-research.mjs'
import {AnalysisWorker} from './hague-research-broker.mjs'

// Synthetic lifecycle throughput, real analysis Worker. No browser, server or CDP socket.
const url='https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml'
const target={targetId:'benchmark-target',sessionId:'benchmark-session',url}
const source="function fixture(){PrimeFaces.ab({s:'ApplicantForm:save',p:'@this',u:'ApplicantForm'})}"
const body='<partial-response><changes><update id="ApplicantForm"><![CDATA[<p>'+ 'PRIVATE_FIXTURE '.repeat(2048)+'</p>]]></update><update id="javax.faces.ViewState">PRIVATE_STATE</update></changes></partial-response>'
const requestData='javax.faces.partial.ajax=true&javax.faces.source=ApplicantForm%3Asave&javax.faces.partial.render=ApplicantForm&private=PRIVATE_REQUEST'
async function run(mode){
 const worker=new AnalysisWorker({timeoutMs:5000});let reads=0;const logs=[]
 const send=async(method,params)=>{
  await Promise.resolve()
  if(method==='Debugger.getScriptSource')return {scriptSource:source}
  if(method==='Network.getResponseBody'){assert.ok(research.bodyCommandAllowed(params,target.sessionId));reads++;return {body,base64Encoded:false}}
  return {}
 }
 const log=(kind,fields)=>logs.push({kind,...fields}),deep=new HagueDeepDiagnostics(send,log,worker)
 const research=new HagueResearchDiagnostics(deep,send,log,{worker})
 let peakRss=process.memoryUsage().rss,peakWorkerHeap=0,peakQueue=0,peakBodyBytes=0
 const sample=()=>{const status=research.status();peakRss=Math.max(peakRss,process.memoryUsage().rss);peakWorkerHeap=Math.max(peakWorkerHeap,status.stats.workerHeapBytes??0);peakQueue=Math.max(peakQueue,status.stats.queuedAnalyses);peakBodyBytes=Math.max(peakBodyBytes,status.bodyBytes)}
 const start=performance.now(),cpu=process.cpuUsage(),rssBefore=process.memoryUsage().rss,timer=setInterval(sample,5)
 try{
  if(mode==='research'){await research.enable(target);await deep.script(target,{scriptId:'fixture-script',url,length:source.length,startLine:0,startColumn:0})}
  for(let batch=0;batch<8;batch++){
   const finished=[]
   for(let j=0;j<8;j++){
    const requestId=`request-${batch*8+j}`
    research.request(target,target.sessionId,{requestId,type:'Fetch',frameId:'frame',loaderId:'loader',request:{url,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},postData:requestData},initiator:{stack:{callFrames:[{scriptId:'fixture-script',lineNumber:0,columnNumber:19}]}}})
    research.response(target.sessionId,{requestId,response:{status:200,mimeType:'application/xml'}})
    finished.push(research.finished(target.sessionId,{requestId,encodedDataLength:Buffer.byteLength(body)}))
   }
   sample();await Promise.all(finished);sample()
  }
  while(worker.pending.size)await new Promise(resolve=>setTimeout(resolve,1))
  sample();const usage=process.cpuUsage(cpu),status=research.status()
  assert.equal(reads,mode==='research'?64:0);assert.equal(status.stats.parsedResponses,mode==='research'?64:0)
  assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_/);assert.ok(logs.every(e=>e.businessStatus!=='completed'))
  const result={mode,requests:64,batchSize:8,wallMs:performance.now()-start,cpuUserMs:usage.user/1000,cpuSystemMs:usage.system/1000,rssBeforeBytes:rssBefore,peakRssBytes:peakRss,peakWorkerHeapBytes:peakWorkerHeap,peakObservedQueue:peakQueue,peakObservedBodyBytes:peakBodyBytes,bodyReads:reads,stats:status.stats,bodyOutcomes:{available:status.available,unavailable:status.unavailable,tooLarge:status.tooLarge,parseFailed:status.parseFailed}}
  await research.disable();assert.equal(worker.worker,null);assert.equal(research.queue.length,0);assert.equal(research.requests.size,0)
  return result
 }finally{clearInterval(timer);await research.disable()}
}
const output={label:'synthetic benchmark; not live user workflow',timestamp:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem()},input:{requests:64,batchSize:8,responseBytes:Buffer.byteLength(body),sourceBytes:Buffer.byteLength(source),requestBytes:Buffer.byteLength(requestData)},runs:[]}
output.runs.push(await run('basic'));output.runs.push(await run('research'))
await mkdir('test-results',{recursive:true});await writeFile('test-results/hague-research-performance.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output))

