import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'

// Fresh isolated browser, synthetic diagnostic records, no business executor calls.
const output = path.resolve('test-results/hague-diagnostics-ui')
await mkdir(output, { recursive: true })
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const browser = await chromium.launch({ executablePath: process.env.HAGUE_TEST_CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
const external = []
await context.route(/^https?:/, route => {
  if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue()
  external.push(route.request().url()); return route.abort()
})
try {
  const page = await context.newPage()
  await page.addInitScript(() => {
    const storage = {}
    Object.assign(window.chrome ?? (window.chrome = {}), {
      runtime: { id: 'isolated-fixture', onMessage: { addListener() {}, removeListener() {} }, sendMessage(_message, callback) { callback?.({ ok: true, tabs: [] }) } },
      storage: { local: { get: key => Promise.resolve({ [key]: storage[key] }), set: value => Promise.resolve(Object.assign(storage, value)) } },
    })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/e2e/hague-harness.html`)
  const panel = page.locator('.hague-diagnostics')
  await panel.waitFor()
  assert.equal(await panel.evaluate(node => node.open), false)
  await panel.locator(':scope > summary').click()
  await panel.getByRole('status').filter({ hasText: 'CDP 数据缺失' }).waitFor()
  assert.match(await panel.innerText(), /不会开启 CDP 深度脚本读取/)
  await panel.getByRole('checkbox').check()
  await page.evaluate(async()=>{
    const {replayDiagnostics}=await import('/src/hague/diagnostics/replay.ts')
    replayDiagnostics(JSON.stringify({version:1,kind:'html',content:'<form id="ApplicantForm"><input value="SECRET_HTML"></form><img src="https://hague.wipo.int/never-load.png"><iframe src="https://hague.wipo.int/never-load.xhtml"></iframe><link rel="stylesheet" href="https://hague.wipo.int/never-load.css"><style>body{background:url(https://hague.wipo.int/never-load-bg.png)}</style><script>fetch("https://hague.wipo.int/never-execute")</script>'}))
    replayDiagnostics(JSON.stringify({version:1,kind:'xml',content:'<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="https://hague.wipo.int/never-load.xsl"?><partial-response><changes/></partial-response>'}))
  })
  await page.evaluate(async () => {
    const { collectTraceEvent } = await import('/src/hague/diagnostics/store.ts')
    const base = { version: 1, source: 'application', traceId: 'trace-isolated', caseRunId: 'case-isolated', stepIndex: 3, operation: 'saveDraft', timestamp: new Date().toISOString() }
    collectTraceEvent({ ...base, phase: 'request.prepared', requestId: 'req-isolated', httpMethod: 'POST', urlPath: '/HagueEFilingWeb/protected/page/application.xhtml', body: 'SECRET_BODY', reference: 'SECRET_REFERENCE' })
    collectTraceEvent({ ...base, phase: 'http.response', requestId: 'req-isolated', httpStatus: 200, transportStatus: 'completed', responseType: 'xml', protocolStatus: 'jsf_validation_failed', businessStatus: 'rejected', certainty: 'rejected', headers: { Cookie: 'SECRET_COOKIE' } })
    collectTraceEvent({ ...base, phase: 'step.uncertain', businessStatus: 'unknown', certainty: 'unknown', sideEffectMayHaveOccurred: true })
  })
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('patmail-hague-cdp-trace',{detail:{version:1,source:'cdp',phase:'http.response',timestamp:new Date().toISOString(),traceId:'trace-isolated',caseRunId:'case-isolated',stepIndex:3,operation:'saveDraft',requestId:'req-isolated',cdpRequestId:'1234.1',httpStatus:200,correlationConfidence:'probable',businessStatus:'unknown',body:'SECRET_CDP_BODY'}})))
  await panel.locator('tbody tr').nth(3).waitFor()
  assert.match(await panel.innerText(), /存在 CDP 观测记录/)
  assert.match(await panel.innerText(), /probable/)
  assert.match(await panel.innerText(), /案件 1/)
  assert.match(await panel.innerText(), /jsf_validation_failed/)
  assert.doesNotMatch(await panel.innerText(), /SECRET_/)
  await panel.locator('tbody tr').nth(1).getByRole('button').click()
  assert.match(await panel.locator('pre').first().innerText(), /"httpStatus": 200/)
  await panel.screenshot({ path: path.join(output, 'panel-desktop.png') })
  for (const [format, extension] of [['jsonl', 'jsonl'], ['json', 'json'], ['markdown', 'md']]) {
    const downloadPromise = page.waitForEvent('download')
    await panel.getByRole('button', { name: `导出 ${format}`, exact: true }).click()
    const download = await downloadPromise
    assert.equal(download.suggestedFilename(), `hague-diagnostics.${extension}`)
    const target = path.join(output, download.suggestedFilename())
    await download.saveAs(target)
    const text = await readFile(target, 'utf8')
    assert.doesNotMatch(text, /SECRET_/)
    assert.match(text, /http.response/)
  }
  await panel.getByLabel('离线回放', { exact: false }).setInputFiles(path.join(output, 'hague-diagnostics.jsonl'))
  await page.getByRole('status').filter({ hasText: '离线回放' }).waitFor()
  await panel.getByRole('button', { name: '返回当前观测' }).click()
  await page.setViewportSize({ width: 860, height: 1000 })
  await panel.screenshot({ path: path.join(output, 'panel-narrow.png') })
  const box = await panel.boundingBox()
  assert.ok(box.width <= 860 && box.x >= 0, 'diagnostics panel must fit the narrow viewport')
  assert.ok(await panel.locator('.diagnostic-scroll').evaluate(node => node.scrollWidth > node.clientWidth), 'narrow timeline keeps legible columns in its own scroll container')
  await panel.getByRole('button', { name: '清空应用记录' }).click()
  await panel.locator('tbody tr').first().waitFor({ state: 'detached' })
  assert.deepEqual(external, [], 'fixture must not attempt external network calls')
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, externalRequests: external.length, viewportWidths: [1440, 860], syntheticOnly: true }, null, 2))
  console.log('Hague diagnostics isolated UI: passed (desktop/narrow, details, export, replay, clear, privacy).')
} finally {
  await context.close(); await browser.close(); await server.close()
}
