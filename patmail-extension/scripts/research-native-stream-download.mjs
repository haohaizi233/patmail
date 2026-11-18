// eslint-disable-next-line no-unused-vars -- 存量豁免：保留解构占位与接口形态
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { tmpPath, resultPath } from '../tests/e2e/support/paths.mjs'

// 完全离线的独立扩展夹具；不使用业务账号，不修改生产扩展。
const fixture = tmpPath('native-stream-fixture')
await mkdir(fixture, { recursive: true })
await writeFile(
  join(fixture, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'Local streaming research',
    version: '0.0.1',
    permissions: ['downloads'],
    background: { service_worker: 'worker.js' },
    web_accessible_resources: [{ resources: ['generated-stream.bin'], matches: ['<all_urls>'] }],
  }),
)
await writeFile(join(fixture, 'app.html'), '<!doctype html><title>Local streaming research</title>')
await writeFile(join(fixture, 'generated-stream.bin'), 'static-control')
await writeFile(
  join(fixture, 'worker.js'),
  `
globalThis.streamEvents = [];
self.addEventListener('fetch', event => {
  if (!event.request.url.includes('/generated-stream.bin')) return;
  streamEvents.push({url:event.request.url, at:Date.now()});
  let index = 0;
  const stream = new ReadableStream({async pull(controller) {
    await new Promise(resolve => setTimeout(resolve, 200));
    if (index === 8) { controller.close(); return; }
    controller.enqueue(new Uint8Array(65536).fill(index++));
  }});
  event.respondWith(new Response(stream, {headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename=generated-stream.bin'}}));
});
chrome.runtime.onMessage.addListener((_message,_sender,respond) => respond({ready:true}));
`,
)
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  acceptDownloads: true,
  downloadsPath: tmpPath('native-stream-downloads'),
  args: [`--disable-extensions-except=${fixture}`, `--load-extension=${fixture}`],
})
const report = { fetch: null, native: null, events: [], observations: [] }
try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const origin =
    new URL(worker.url()).origin === 'null' ? worker.url().replace(/\/worker\.js$/, '') : new URL(worker.url()).origin
  const app = await context.newPage()
  await app.goto(`${origin}/app.html`)
  report.fetch = await app.evaluate(async () => {
    try {
      const response = await fetch(globalThis.chrome.runtime.getURL('generated-stream.bin?mode=fetch'))
      const data = await response.arrayBuffer()
      return { status: response.status, bytes: data.byteLength }
    } catch (error) {
      return { error: error.message }
    }
  })
  try {
    const id = await worker.evaluate(() =>
      globalThis.chrome.downloads.download({
        url: globalThis.chrome.runtime.getURL('generated-stream.bin?mode=native'),
        filename: 'native-stream-research.bin',
        saveAs: false,
      }),
    )
    for (let index = 0; index < 40; index++) {
      const item = await worker.evaluate(
        id =>
          globalThis.chrome.downloads
            .search({ id })
            .then(
              items =>
                items.map(({ state, error, bytesReceived, totalBytes, filename }) => ({
                  state,
                  error,
                  bytesReceived,
                  totalBytes,
                  filename,
                }))[0],
            ),
        id,
      )
      report.observations.push(item)
      if (item?.state === 'complete' || item?.state === 'interrupted') {
        report.native = item
        break
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (report.native?.state === 'complete')
      report.verifiedDiskBytes = (await readFile(report.native.filename)).byteLength
  } catch (error) {
    report.native = { error: error.message }
  }
  report.events = await worker.evaluate(() => globalThis.streamEvents)
} finally {
  await writeFile(resultPath('native-stream-research.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  await context.close()
}
