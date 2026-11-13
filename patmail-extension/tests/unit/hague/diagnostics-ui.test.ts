import { createApp, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import HagueDiagnostics from '../../../src/app/components/HagueDiagnostics.vue'
import { clearDiagnosticEvents, collectTraceEvent, isDiagnosticModeEnabled, receiveCdpTrace, setDiagnosticMode } from '../../../src/hague/diagnostics/store'
describe('Hague diagnostics panel', () => {
  it('starts collapsed and explains independent consent for CDP source reads', async () => {
    const host = document.createElement('div')
    const app = createApp(HagueDiagnostics)
    app.mount(host)
    await nextTick()
    expect(host.querySelector('details')?.open).toBe(false)
    expect(host.textContent).toContain('不会开启 CDP 深度脚本读取')
    expect(host.textContent).toContain('CDP 数据缺失')
    app.unmount()
  })
  it('collects safe live records after explicit toggle and reveals request details', async () => {
    clearDiagnosticEvents(); setDiagnosticMode(false)
    const host = document.createElement('div')
    const app = createApp(HagueDiagnostics); app.mount(host)
    const checkbox = host.querySelector('input[type=checkbox]') as HTMLInputElement
    checkbox.checked = true; checkbox.dispatchEvent(new Event('change'))
    expect(isDiagnosticModeEnabled()).toBe(true)
    collectTraceEvent({ version: 1, source: 'application', phase: 'http.response', timestamp: new Date().toISOString(), traceId: 'trace-one', caseRunId: 'case-one', httpStatus: 403, body: 'PRIVATE_BODY', caseVolume: 'PRIVATE_CASE', headers: { Cookie: 'PRIVATE_COOKIE' } })
    await new Promise<void>(resolve => queueMicrotask(resolve)); await nextTick()
    expect(host.textContent).toContain('403')
    const rowButton = host.querySelector('tbody button') as HTMLButtonElement
    rowButton.click(); await nextTick()
    expect(host.querySelector('pre')?.textContent).toContain('http.response')
    expect(host.textContent).not.toContain('PRIVATE_')
    expect(host.textContent).toContain('案件 1')
    app.unmount(); setDiagnosticMode(false); clearDiagnosticEvents()
  })
  it('bounds the timeline, filters safe fields and explains model evidence', async()=>{
    clearDiagnosticEvents();setDiagnosticMode(true)
    const timestamp=new Date().toISOString()
    for(let i=0;i<205;i++)collectTraceEvent({version:1,source:'application',traceId:'trace-one',caseRunId:'case-one',phase:'http.response',httpStatus:i===0?403:200,timestamp})
    collectTraceEvent({version:1,source:'application',traceId:'trace-one',caseRunId:'case-one',requestId:'req-model',phase:'dom.updated',domEvidenceSource:'application_model',timestamp,before:{designs:0},after:{designs:1}})
    const host=document.createElement('div');const app=createApp(HagueDiagnostics);app.mount(host);await nextTick()
    expect(host.querySelectorAll('tbody tr')).toHaveLength(200)
    const status=host.querySelector('[data-testid=research-status]')!
    expect(status.textContent).toContain('未采集')
    const filter=host.querySelector('select[aria-label="httpStatus"]') as HTMLSelectElement
    filter.value='403';filter.dispatchEvent(new Event('change'));await nextTick()
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    filter.value='';filter.dispatchEvent(new Event('change'));await nextTick()
    const phase=host.querySelector('select[aria-label="phase"]') as HTMLSelectElement
    phase.value='dom.updated';phase.dispatchEvent(new Event('change'));await nextTick()
    ;(host.querySelector('tbody button') as HTMLButtonElement).click();await nextTick()
    expect(host.textContent).toContain('DOM：application_model')
    expect(host.textContent).toContain('真实 DOM 变化须有同文档前后数值证据')
    app.unmount();setDiagnosticMode(false);clearDiagnosticEvents()
  })
  it('shows observed service status while application collection is off', async()=>{
    clearDiagnosticEvents();setDiagnosticMode(false)
    const host=document.createElement('div');const app=createApp(HagueDiagnostics);app.mount(host)
    receiveCdpTrace({version:1,source:'cdp',phase:'research.status',timestamp:new Date().toISOString(),mode:'research',researchState:'enabled',observerState:'connected',stats:{observedRequests:12,analyzedScripts:0}})
    await new Promise<void>(resolve=>queueMicrotask(resolve));await nextTick()
    expect(host.querySelector('[data-testid=research-status]')?.textContent).toContain('research')
    expect(host.textContent).toContain('已观测请求12')
    expect(host.textContent).toContain('已分析脚本0')
    expect(host.textContent).toContain('AST 调用未采集')
    expect(host.querySelectorAll('tbody tr')).toHaveLength(0)
    app.unmount()
  })
})
