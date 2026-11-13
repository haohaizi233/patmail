import {readFile,writeFile,stat} from 'node:fs/promises'
import {observerEventsToTraces} from '../src/hague/diagnostics/observer-adapter.mjs'
const [input,output]=process.argv.slice(2)
if(!input||!output)throw Error('Usage: node scripts/hague-diagnostics-export.mjs <observer.jsonl> <safe-trace.jsonl>')
if((await stat(input)).size>32_000_000)throw Error('Offline input exceeds 32MB limit')
const text=await readFile(input,'utf8')
if(text.length>32_000_000)throw Error('Offline input exceeds 32MB limit')
const records=text.split(/\r?\n/).filter(Boolean).slice(0,20000).map(line=>{try{return JSON.parse(line)}catch{return null}})
const traces=observerEventsToTraces(records)
await writeFile(output,traces.map(v=>JSON.stringify(v)).join('\n')+'\n','utf8')
console.log(JSON.stringify({events:traces.length,source:'offline_observer_export',businessRequests:0}))
