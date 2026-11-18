import {afterEach,expect,it} from 'vitest'
import {collectTraceEvent,getDiagnosticEvents,setDiagnosticMode,clearDiagnosticEvents,emitTrace,makeTraceContext} from '../../../src/hague/diagnostics/store'
import {sanitizeTraceEvent} from '../../../src/hague/diagnostics/schema.mjs'
import {HagueDiagnosticError,normalizeDiagnosticError} from '../../../src/hague/diagnostics/errors'
afterEach(()=>{clearDiagnosticEvents();setDiagnosticMode(false)})
it('honors explicit disabling and does not leak secrets through errors or traces',()=>{
 setDiagnosticMode(false)
 const ctx=makeTraceContext('case-1',1,'upload','http',7)
 emitTrace(ctx,'request.dispatched');expect(getDiagnosticEvents()).toHaveLength(0)
 setDiagnosticMode(true)
 const secret='PRIVATE_APPLICANT_188029_Bearer_secret@example.test'
 collectTraceEvent({...ctx,version:1,source:'application',phase:'http.response',timestamp:new Date().toISOString(),httpStatus:200,urlPath:'/HagueEFilingWeb/protected/page/application.xhtml?token='+secret,headers:{Cookie:secret},body:secret,reference:secret,applicant:secret,fileName:secret,viewState:secret,sourceComponent:secret,stepLabel:secret})
 const text=JSON.stringify(getDiagnosticEvents())
 expect(text).not.toContain(secret);expect(text).toContain('application.xhtml');expect(text).not.toContain('?token')
 const error=normalizeDiagnosticError(new Error(secret),{errorCode:'NETWORK_TIMEOUT',errorStage:'transport',httpStatus:null},ctx)
 expect(JSON.stringify(error)).not.toContain(secret);expect(error.diagnostic.httpStatus).toBeNull()
})
it('does not confuse HTTP 200 with business success and bounds the collector',()=>{
 setDiagnosticMode(true);const ctx=makeTraceContext('case-2',1,'create','http')
 emitTrace(ctx,'http.response',{httpStatus:200,businessStatus:'unconfirmed',certainty:'unknown'})
 expect(getDiagnosticEvents()[0]).toMatchObject({httpStatus:200,businessStatus:'unconfirmed',certainty:'unknown'})
 for(let i=0;i<5100;i++)emitTrace(ctx,'request.prepared')
 expect(getDiagnosticEvents()).toHaveLength(5000)
})
it('does not accept malformed records or poison raw diagnostic errors',()=>{
 expect(sanitizeTraceEvent({version:2,phase:'http.response'})).toBeNull()
 const e=new HagueDiagnosticError({errorCode:'Cookie=secret',message:'Bearer secret',httpStatus:0,autoRecoverable:true})
 expect(e.diagnostic).toMatchObject({errorCode:'UNEXPECTED_ERROR',httpStatus:null,autoRecoverable:false})
 expect(JSON.stringify(e)).not.toContain('secret')
})
