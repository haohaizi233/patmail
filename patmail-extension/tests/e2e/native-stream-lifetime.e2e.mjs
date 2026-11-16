/* global target: readonly */
// target 是扩展 Service Worker 暴露的下载目标句柄，仅在 worker.evaluate 回调内使用。
import { chromium } from 'playwright'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpPath, testResultsDir } from './support/paths.mjs'
import { observeDownload, waitForControllingWorker } from './support/download-wait.mjs'
const root = await mkdtemp(tmpPath('native-lifetime-')),
  ext = path.join(root, 'extension')
const chunkCount = 72,
  chunkBytes = 16384,
  delayMs = 5000
await mkdir(ext)
const source = await readFile('src/background/native-download-target.ts', 'utf8')
const js = ts
  .transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
  .outputText.replace(
    /import \{ BROWSER_FILE_CHANNEL \} from [^;]+;/,
    'const BROWSER_FILE_CHANNEL="PATMAIL_BROWSER_FILE";',
  )
await writeFile(path.join(ext, 'target.js'), js)
await writeFile(
  path.join(ext, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'Production native module isolated probe',
    version: '1.0',
    permissions: ['downloads'],
    background: { service_worker: 'worker.js', type: 'module' },
  }),
)
await writeFile(
  path.join(ext, 'worker.js'),
  `import {createNativeDownloadTarget} from './target.js'; globalThis.target=createNativeDownloadTarget({openNavigation:async(url)=>{if(self.clients?.claim)await self.clients.claim();await chrome.runtime.sendMessage({channel:'NAV',url})},resolveFileName:()=> '纯TS验证.zip',attachTimeoutMs:15000,finishTimeoutMs:8000});self.addEventListener('activate',e=>e.waitUntil(clients.claim()));self.addEventListener('fetch',e=>target.handleFetch(e));`,
)
await writeFile(path.join(ext, 'app.html'), '<!doctype html><script src="app.js"></script>')
await writeFile(
  path.join(ext, 'app.js'),
  `chrome.runtime.onMessage.addListener((message,sender,reply)=>{if(message.channel!=='NAV')return false;const f=document.createElement('iframe');f.src=message.url;document.body.append(f);reply({ok:true});return false;});`,
)
const report = { root, samples: [], errors: [] }
const context = await chromium.launchPersistentContext(path.join(root, 'profile'), {
  channel: 'chromium',
  headless: true,
  acceptDownloads: true,
  downloadsPath: path.join(root, 'downloads'),
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
})
const started = Date.now()
const deadline = setTimeout(() => {
  report.deadline = true
  void context.close()
}, 420000)
try {
  report.stage = 'worker'
  console.log('stage worker')
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 10000 }))
  const base = worker.url().replace('/worker.js', ''),
    app = await context.newPage()
  app.on('pageerror', e => report.errors.push(String(e)))
  app.on('requestfailed', request => {
    if (request.isNavigationRequest()) {
      report.navigationFailures ??= []
      report.navigationFailures.push(request.failure()?.errorText ?? 'unknown')
    }
  })
  worker.on('console', m => report.errors.push(m.text()))
  await app.goto(base + '/app.html')
  await worker.evaluate(async () => {
    if (self.clients?.claim) await self.clients.claim()
  })
  await app.reload()
  await worker.evaluate(async () => {
    if (self.clients?.claim) await self.clients.claim()
  })
  console.log('stage app')
  report.stage = 'page-control'
  report.controller = await app.evaluate(() => !!navigator.serviceWorker?.controller)
  await waitForControllingWorker(app, worker.url())
  report.controller = await app.evaluate(() => !!navigator.serviceWorker.controller)
  assert.equal(report.controller, true, 'the fixture worker must control the download navigation')
  const download = observeDownload(app, error => { report.downloadError = String(error) })
  // eslint-disable-next-line require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
  async function call(action, extra = {}) {
    return worker.evaluate(request => target.host(request), {
      channel: 'PATMAIL_BROWSER_FILE',
      taskId: 'task',
      targetId: 'native',
      owner: 'owner',
      action,
      ...extra,
    })
  }
  report.stage = 'open'
  const opened = await call('open')
  assert.deepEqual(opened, { ok: true })
  report.opened = opened
  console.log('stage open')
  report.stage = 'stream'
  for (let i = 0; i < chunkCount; i++) {
    if (i % 12 === 0) console.log('stage elapsed', Date.now() - started)
    assert.deepEqual(
      await call('write', { offset: i * chunkBytes, data: Buffer.alloc(chunkBytes, i + 1).toString('base64') }),
      { ok: true },
    )
    await new Promise(resolve => setTimeout(resolve, delayMs))
    report.samples.push(await worker.evaluate(() => target.status('native')))
  }
  assert(report.samples.some(s => s.receivedBytes > 0 && s.state === 'inProgress'))
  report.stage = 'finish'
  report.finished = await call('finish')
  assert.deepEqual(report.finished, { ok: true })
  const d = await download,
    file = path.join(root, 'native-output.zip')
  await d.saveAs(file)
  const bytes = await readFile(file)
  report.stage = 'verify'
  assert.equal(bytes.length, chunkCount * chunkBytes)
  assert(bytes.every((v, i) => v === Math.floor(i / chunkBytes) + 1))
  report.elapsedMs = Date.now() - started
  assert(report.elapsedMs > 300000, 'must exercise a single download across the five minute boundary')
  report.file = {
    path: file,
    size: bytes.length,
    suggestedName: d.suggestedFilename(),
    verified: true,
    failure: await d.failure(),
  }
  report.items = await worker.evaluate(() => chrome.downloads.search({}))
  report.finalStatus = await worker.evaluate(() => target.status('native'))
  report.stage = 'complete'
} catch (e) {
  report.error = String(e)
  throw e
} finally {
  clearTimeout(deadline)
  await context.close().catch(error => { report.closeError = String(error) })
  await writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2))
  const ciReportDir = path.join(testResultsDir, 'ci')
  await mkdir(ciReportDir, { recursive: true })
  await writeFile(path.join(ciReportDir, 'native-stream-lifetime.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
}
