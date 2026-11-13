import { createHash } from 'node:crypto'
import { createSourceIndex } from '../src/hague/diagnostics/correlation/correlator.mjs'
import { parentPort } from 'node:worker_threads'
import { analyzeJavaScript } from '../src/hague/diagnostics/ast/analyzer.mjs'
import { createJsfProtocolAnalyzer } from '../src/hague/diagnostics/protocol/jsf-partial-response.mjs'
const protocol=createJsfProtocolAnalyzer()
const index=createSourceIndex()
parentPort.on('message',async ({id,kind,value,options})=>{const started=performance.now();try{let result;if(kind==='ast'){result=analyzeJavaScript(value);index.addScript({...options,generation:undefined,scriptHash:createHash('sha256').update(value).digest('hex'),calls:result.calls})}else if(kind==='lookup'){
 const locations=Array.isArray(value.sourceLocations)?value.sourceLocations.slice(0,20):[value.sourceLocation]
 const matches=new Map();let ambiguous=false
 for(const sourceLocation of locations){const edge=index.lookup({...value,sourceLocation});if(edge.astCorrelationConfidence==='ambiguous')ambiguous=true;for(const match of edge.matches??[]){const key=JSON.stringify([match.scriptId,match.scriptHash,match.location?.line,match.location?.column]);matches.set(key,{match,edge,functionName:sourceLocation?.functionName})}}
 if(!ambiguous&&matches.size===1){const selected=[...matches.values()][0];result={...selected.edge,matches:[selected.match],functionName:selected.functionName}}
 else result={astConfidence:'unresolved',astCorrelationConfidence:ambiguous||matches.size>1?'ambiguous':'unmatched',correlationConfidence:'unmatched',matches:[],reasons:[ambiguous||matches.size>1?'multiple_calls':'source_location_missing']}
 }else result=await protocol.analyze(value,options);parentPort.postMessage({id,result,metrics:{durationMs:performance.now()-started,heapBytes:process.memoryUsage().heapUsed}})}catch{parentPort.postMessage({id,error:true})}})
