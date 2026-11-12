import http from 'node:http'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { distDir, tmpPath, resultPath } from './support/paths.mjs'

// 独立协议验证：初次未知长度chunked，中断后同一downloadId以非零Range续传。
const bytes = Buffer.alloc(3 * 1024 * 1024)
for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251
let sealed = false
const ranges = []
const server = http.createServer((req, res) => {
  res.setHeader('ETag', '"stable-fixture-v1"')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Type', 'application/zip')
  const range = req.headers.range
  if (range) {
    if (!sealed) {
      res.writeHead(503, { 'Retry-After': '1' })
      return res.end()
    }
    const offset = Number(/^bytes=(\d+)-/.exec(range)?.[1])
    ranges.push(offset)
    assert(Number.isSafeInteger(offset) && offset > 0 && offset < bytes.length)
    res.writeHead(206, {
      'Content-Length': bytes.length - offset,
      'Content-Range': `bytes ${offset}-${bytes.length - 1}/${bytes.length}`,
    })
    return res.end(bytes.subarray(offset))
  }
  res.writeHead(200, { 'Transfer-Encoding': 'chunked' })
  res.write(bytes.subarray(0, 1024 * 1024))
  setTimeout(() => res.destroy(), 150)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let context
try {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    acceptDownloads: true,
    args: [`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`],
  })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const page = await context.newPage()
  const destination = await mkdtemp(tmpPath('range-protocol-'))
  await (
    await context.newCDPSession(page)
  ).send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: destination, eventsEnabled: true })
  const id = await worker.evaluate(
    url => chrome.downloads.download({ url, filename: 'range-protocol.zip', saveAs: false }),
    `http://127.0.0.1:${server.address().port}/download`,
  )
  let interrupted
  for (let attempt = 0; attempt < 100; attempt++) {
    interrupted = await worker.evaluate(id => chrome.downloads.search({ id }).then(items => items[0]), id)
    if (interrupted.state === 'interrupted') break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(interrupted.state, 'interrupted')
  assert.equal(interrupted.canResume, true, JSON.stringify(interrupted))
  assert(interrupted.bytesReceived > 0)
  sealed = true
  await worker.evaluate(id => chrome.downloads.resume(id), id)
  let complete
  for (let attempt = 0; attempt < 100; attempt++) {
    complete = await worker.evaluate(id => chrome.downloads.search({ id }).then(items => items[0]), id)
    if (complete.state === 'complete') break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(complete.state, 'complete', JSON.stringify(complete))
  assert(ranges.some(offset => offset > 0))
  assert((await readFile(complete.filename)).equals(bytes))
  const report = {
    passed: true,
    sameDownloadId: id,
    canResume: interrupted.canResume,
    interruptedBytes: interrupted.bytesReceived,
    ranges,
    finalBytes: bytes.length,
  }
  await writeFile(resultPath('resume-protocol.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await context?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
