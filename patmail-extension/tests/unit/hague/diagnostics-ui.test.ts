import { createApp, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import HagueDiagnostics from '../../../src/app/components/HagueDiagnostics.vue'
import { clearDiagnosticEvents, collectTraceEvent, isDiagnosticModeEnabled, setDiagnosticMode } from '../../../src/hague/diagnostics/store'
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
})
