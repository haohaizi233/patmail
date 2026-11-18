import {mkdirSync,writeFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {analyzeJavaScript} from '../../../src/hague/diagnostics/ast/analyzer.mjs'
import {clearDiagnosticEvents,emitTrace,getDiagnosticEvents,makeTraceContext,setDiagnosticMode} from '../../../src/hague/diagnostics/store'
it('measures bounded collection and AST cache overhead without network or business writes',()=>{
 const context=makeTraceContext('case-perf',1,'upload','http'),iterations=10000
 const measure=(fn:()=>void)=>{const start=performance.now();fn();return performance.now()-start}
 clearDiagnosticEvents();setDiagnosticMode(false)
 const disabledMs=measure(()=>{for(let i=0;i<iterations;i++)emitTrace(context,'http.response',{httpStatus:200,businessStatus:'unknown'})})
 expect(getDiagnosticEvents()).toHaveLength(0)
 setDiagnosticMode(true)
 const enabledMs=measure(()=>{for(let i=0;i<iterations;i++)emitTrace(context,'http.response',{httpStatus:200,businessStatus:'unknown'})})
 expect(getDiagnosticEvents()).toHaveLength(5000)
 const script="const form='ApplicantForm';PrimeFaces.ab({s:form+':save',f:form,p:'@form',u:form});"
 const coldMs=measure(()=>analyzeJavaScript(script)),cachedMs=measure(()=>{for(let i=0;i<1000;i++)analyzeJavaScript(script)})
 mkdirSync('test-results',{recursive:true});writeFileSync('test-results/hague-diagnostics-perf.json',JSON.stringify({measuredAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform},scope:'Synthetic collector and bounded AST only; excludes browser rendering, WIPO/network and full workflow',iterations,disabledMs,enabledMs,additionalMicrosecondsPerEvent:(enabledMs-disabledMs)*1000/iterations,ast:{coldMs,cached1000Ms:cachedMs},bounds:{events:5000,bytes:4000000,ageHours:24}},null,2))
 clearDiagnosticEvents();setDiagnosticMode(false)
})
