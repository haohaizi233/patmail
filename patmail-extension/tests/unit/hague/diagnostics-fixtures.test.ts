import {expect,it,vi} from 'vitest'
import {replayDiagnostics} from '../../../src/hague/diagnostics/replay'
import {analyzeOfflineFixture} from '../../../src/hague/diagnostics/fixtures'
import {exportDiagnostics} from '../../../src/hague/diagnostics/reports'
it('analyzes HTML XML JS and receipts offline without executing embedded code or leaking values',()=>{
 const network=vi.spyOn(globalThis,'fetch')
 const secret='PRIVATE_APPLICANT_ADDRESS_EMAIL_VIEWSTATE_TOKEN_FILENAME_BASE64'
 for(const [kind,content]of [
  ['html',`<form id="ApplicantForm"><input name="javax.faces.ViewState" value="${secret}"><span id="${secret}">${secret}</span><script>fetch('https://hague.wipo.int')</script></form>`],
  ['xml',`<partial-response><changes><update id="ApplicantForm"><![CDATA[${secret}]]></update></changes><extension>{"validationFailed":true}</extension></partial-response>`],
  ['javascript',`PrimeFaces.ab({s:'ApplicantForm:save',pa:[{name:'${secret}',value:'${secret}'}]});fetch('https://hague.wipo.int');`],
  ['receipt',JSON.stringify({ok:true,reference:secret,applicant:secret})]
 ]as const){
  const result=replayDiagnostics(JSON.stringify({version:1,kind,content}))
  expect(result.provenance).toBe('offline-replay');expect(result.report.summary.cdpMissing).toBe(true)
  expect(result.report.summary.confirmedSuccess).toBe(false)
  for(const format of ['json','jsonl','markdown']as const)expect(exportDiagnostics(result.report.events,format,'offline-replay')).not.toContain(secret)
 }
 expect(network).not.toHaveBeenCalled();network.mockRestore()
})
it('rejects incompatible fixtures and caps input',()=>{
 expect(()=>analyzeOfflineFixture({version:2 as 1,kind:'html',content:''})).toThrow('FIXTURE_LIMIT')
 expect(()=>analyzeOfflineFixture({version:1,kind:'html',content:'x'.repeat(262145)})).toThrow('FIXTURE_LIMIT')
})
