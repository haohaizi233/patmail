import http from 'node:http'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import { distDir, testResultsDir, resultPath } from './support/paths.mjs'
import { waitForContentScript } from './support/browser.mjs'
import { ensureStreamBridge } from './support/stream-bridge.mjs'

const files = Array.from({ length: 6 }, (_, index) => ({ fileId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, fileNo: `R${index}`, fileName: `old-${index}.pdf` }))
const info = { IsLogin: true, Status: true, Result: true }
const source = index => { const bytes = Buffer.alloc(512 * 1024, index); bytes.write('%PDF durable fixture'); return bytes }
let names = 0, failed = false, releaseFailure
const failureGate = new Promise(resolve => { releaseFailure = resolve })
const fetches = [], ranges = []
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://183.36.43.66:88')
  let body = ''; for await (const chunk of req) body += chunk
  const params = new URLSearchParams(body), call = params.get('Call')
  const json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ClientInfo: info, ...data })) }
  if (call === 'GetUserModel') return json({ UserModel: { user_id: '11111111-1111-4111-8111-111111111111', user_name: 'fixture', Name: 'Fixture' } })
  if (call === 'GetFileName') { names++; return json({ file_names: params.get('file_ids').split(';').map(id => `202610026334.9-${files.findIndex(file => file.fileId === id)}.pdf`).join(';') }) }
  if (call === 'DownLoad') return json({ file_guid: files.find(file => file.fileNo === params.get('file_no')).fileId, file_size: 512 * 1024 })
  if (url.pathname.endsWith('FileHandler.ashx')) {
    const index = files.findIndex(file => file.fileId === url.searchParams.get('guid'))
    fetches.push(index)
    const bytes = source(index), range = req.headers.range
    const offset = range ? Number(/^bytes=(\d+)-/.exec(range)?.[1]) : 0
    if (range) ranges.push({ index, offset })
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('ETag', `"source-${index}-v1"`)
    res.setHeader('Content-Length', bytes.length - offset)
    if (range) { res.statusCode = 206; res.setHeader('Content-Range', `bytes ${offset}-${bytes.length - 1}/${bytes.length}`) }
    if (index === 1 && !failed) {
      failed = true; res.write(bytes.subarray(0, 256 * 1024)); await failureGate; res.destroy(); return
    }
    return res.end(bytes.subarray(offset))
  }
  if (url.pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><title>durable fixture</title>') }
  json({})
})
server.on('connect', (_, socket) => socket.destroy())
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const stopBridge = await ensureStreamBridge()
let context
try {
  const netlog = resultPath('durable-download-netlog.json')
  context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, acceptDownloads: true,
    proxy: { server: `http://127.0.0.1:${server.address().port}`, bypass: '127.0.0.1' },
    args: [`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`, `--log-net-log=${netlog}`, '--net-log-capture-mode=IncludeSensitive'] })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const easy = await context.newPage(); await easy.goto('http://183.36.43.66:88/fixture')
  const app = await context.newPage(); await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`)
  const destination = await mkdtemp(join(testResultsDir, 'durable-download-'))
  await (await context.newCDPSession(app)).send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: destination, eventsEnabled: true })
  await app.evaluate(() => { window.__results = {}; chrome.runtime.onMessage.addListener(message => { if (message.channel === 'patmail-download-result') window.__results[message.id] = message.body }) })
  let tab
  for (let i = 0; i < 50; i++) {
    tab = (await worker.evaluate(() => chrome.tabs.query({}))).find(item => item.url?.endsWith('/fixture'))
    try { if ((await worker.evaluate(id => chrome.tabs.sendMessage(id, { type: 'PING' }), tab.id))?.type === 'PONG') break } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const taskId = crypto.randomUUID()
  const start = async progressId => worker.evaluate(({ tabId, files, taskId, progressId }) => chrome.tabs.sendMessage(tabId, {
    type: 'DOWNLOAD_FILES', payload: { items: files, selection: { newFilename: 'file_name', fileNameType: 'colname' },
      stripAppNoDot: true, archiveName: '续传验收.zip', stream: true, detached: true, taskId, progressId }
  }), { tabId: tab.id, files, taskId, progressId })
  const first = crypto.randomUUID()
  assert.equal((await start(first)).type, 'DOWNLOAD_FILES_ACCEPTED')
  let original
  for (let i = 0; i < 500; i++) {
    original = (await worker.evaluate(() => chrome.downloads.search({})))[0]
    if (original?.bytesReceived >= 512 * 1024) { releaseFailure(); break }
    const earlyError = await app.evaluate(id => window.__results[id], first)
    if (earlyError) throw new Error(JSON.stringify(earlyError))
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  releaseFailure()
  await app.waitForFunction(id => Boolean(window.__results[id]), first, { timeout: 60000 })
  const failedResult = await app.evaluate(id => window.__results[id], first)
  assert.equal(failedResult.payload.ok, false)
  assert(original?.bytesReceived > 0, '首轮必须留下非零浏览器前缀')
  await easy.reload()
  await waitForContentScript(worker, easy)
  const second = crypto.randomUUID()
  assert.equal((await start(second)).type, 'DOWNLOAD_FILES_ACCEPTED')
  await app.waitForFunction(id => Boolean(window.__results[id]), second, { timeout: 120000 })
  const resumed = await app.evaluate(id => window.__results[id], second)
  assert.equal(resumed.payload.ok, true, JSON.stringify(resumed))
  const downloads = await worker.evaluate(() => chrome.downloads.search({}))
  assert.equal(downloads.length, 1, '续传必须复用原下载记录')
  assert.equal(downloads[0].id, original.id)
  assert.equal(downloads[0].state, 'complete')
  assert.equal(names, 1, '已持久化的命名批次不能重跑')
  assert.equal(fetches.filter(index => index === 0).length, 1, '完整缓存的首个附件不能重下')
  assert(ranges.some(item => item.index === 1 && item.offset > 0), '未完成源附件必须按版本和偏移续取')
  const validation = 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n assert z.namelist()==[f"2026100263349-{i}.pdf" for i in range(6)]\n assert all(len(z.read(e))==524288 for e in z.namelist())\n print("CRC OK")'
  await promisify(execFile)('python', ['-c', validation, downloads[0].filename], { windowsHide: true })
  await context.close(); context = null
  const events = JSON.parse(await readFile(netlog, 'utf8')).events
  const headers = events.filter(event => String(event.params?.line ?? '').startsWith(`GET /download/${taskId} `))
    .flatMap(event => event.params?.headers ?? []).filter(value => typeof value === 'string')
  const nativeRanges = headers.filter(header => /^range:\s*bytes=[1-9]\d*-/i.test(header))
  assert(nativeRanges.length > 0, '真实浏览器必须发出非零Range请求')
  const report = { passed: true, sameDownloadId: original.id, originalBytes: original.bytesReceived, names, sourceFetches: fetches, sourceRanges: ranges,
    nativeRanges, finalBytes: downloads[0].bytesReceived, crc: true }
  await writeFile(resultPath('durable-download.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  releaseFailure(); await context?.close()
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); stopBridge()
}
