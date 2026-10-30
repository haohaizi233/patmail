import http from 'node:http'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, join } from 'node:path'
import { chromium } from 'playwright'
import { distDir, resultPath, testResultsDir } from './support/paths.mjs'
import { ensureStreamBridge, streamBridgeBase } from './support/stream-bridge.mjs'

// EASY全部由本地代理响应；127.0.0.1桥接走真实HTTP，Chrome负责原生下载与落盘。
const count = 81
const files = Array.from({ length: count }, (_, index) => ({
  fileId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, fileNo: `S${index}`, fileName: `old-${index}.pdf`
}))
const info = { IsLogin: true, Status: true, Result: true }
const bodyFor = index => { const body = Buffer.alloc(256 * 1024, index); body.write('%PDF sample'); return body }
let namesCompleted = 0, allNamedAt = null, firstPrepareAt = null
let prepares = 0, streams = 0
let activeRequests = 0, peakRequests = 0, activeBodies = 0, peakBodies = 0
const requestTrace = []
let slowTransfer = false
let proveSix = false, releaseSix
const sixBodies = new Promise(resolve => { releaseSix = resolve })
let releaseLastNames
let releasedLastNames = false
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://183.36.43.66:88')
  let body = ''; for await (const chunk of req) body += chunk
  const params = new URLSearchParams(body), call = params.get('Call')
  const isBody = url.pathname.endsWith('FileHandler.ashx')
  let finishRequest = () => {}
  if (isBody || call === 'GetFileName' || call === 'DownLoad') {
    activeRequests++; peakRequests = Math.max(peakRequests, activeRequests)
    if (isBody) { activeBodies++; peakBodies = Math.max(peakBodies, activeBodies) }
    requestTrace.push({ at: Date.now(), activeRequests, activeBodies })
    let counted = true
    finishRequest = () => { if (counted) { counted = false; activeRequests--; if (isBody) activeBodies-- } }
    res.once('close', finishRequest)
  }
  const json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ClientInfo: info, ...data })); finishRequest() }
  if (call === 'GetUserModel') return json({ UserModel: { user_id: '11111111-1111-4111-8111-111111111111', user_name: 'fixture', Name: 'Fixture' } })
  if (call === 'GetFileName') {
    const ids = params.get('file_ids').split(';')
    const first = files.findIndex(file => file.fileId === ids[0])
    // 以原生真实字节增长作为最后一批命名的门闩，避免机器负载改变固定毫秒窗口。
    if (first === 80) await new Promise(resolve => { releaseLastNames = resolve })
    else await new Promise(resolve => setTimeout(resolve, first === 40 ? 1500 : 100))
    namesCompleted += ids.length
    if (namesCompleted === count) allNamedAt = Date.now()
    return json({ file_names: ids.map(id => `202610026334.9-file-${files.findIndex(file => file.fileId === id)}.pdf`).join(';') })
  }
  if (call === 'DownLoad') {
    firstPrepareAt ??= Date.now(); prepares++
    assert.equal(params.get('file_no').includes(';'), false)
    const index = files.findIndex(file => file.fileNo === params.get('file_no'))
    assert.equal(params.get('file_name'), slowTransfer || proveSix ? `old-${index}.pdf` : `2026100263349-file-${index}.pdf`)
    return json({ file_guid: files[index].fileId, ClientInfo: { ...info, Result: false }, error: true,
      error_message: '文件不存在或权限不足,您共1个文件下载失败！' })
  }
  if (url.pathname.endsWith('FileHandler.ashx')) {
    streams++
    const index = files.findIndex(file => file.fileId === url.searchParams.get('guid'))
    const payload = bodyFor(index)
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Length', payload.length)
    if (proveSix) {
      res.flushHeaders()
      if (activeBodies === 6) releaseSix()
      await sixBodies
    }
    for (let offset = 0; offset < payload.length; offset += 65536) {
      if (res.destroyed) return
      res.write(payload.subarray(offset, offset + 65536))
      // 正文窗口要足够长，才能在真实浏览器/本机IPC负载下观察网络重叠。
      if (offset + 65536 < payload.length) await new Promise(resolve => setTimeout(resolve, slowTransfer ? 700 : 40))
    }
    res.end(); finishRequest(); return
  }
  if (url.pathname === '/fixture') {
    if (url.searchParams.has('metadata-frame')) await new Promise(resolve => setTimeout(resolve, 2500))
    res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><title>stream fixture</title>')
  }
  json({})
})
server.on('connect', (_, socket) => socket.destroy())
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const observations = []
const stopBridge = await ensureStreamBridge()
let context
try {
  const health = await fetch(streamBridgeBase + '/health').then(response => response.json())
  assert.equal(health.protocol, 'patmail-stream-v1', '先启动scripts/start-stream-download.ps1')
  context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, acceptDownloads: true,
    proxy: { server: `http://127.0.0.1:${server.address().port}`, bypass: '127.0.0.1' },
    args: [`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`]
  })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const easy = await context.newPage(); await easy.goto('http://183.36.43.66:88/fixture')
  const app = await context.newPage(); await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`)
  // Playwright默认allowAndName会把磁盘名强制改成GUID；此处恢复Chrome真实目标文件命名。
  const downloadsPath = await mkdtemp(join(testResultsDir, 'stream-native-'))
  const cdp = await context.newCDPSession(app)
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadsPath, eventsEnabled: true })
  await app.evaluate(() => {
    window.__results = {}; window.__progress = []
    chrome.runtime.onMessage.addListener(message => {
      if (message.channel === 'patmail-download-result') window.__results[message.id] = message.body
      if (message.channel === 'patmail-download-progress') window.__progress.push(message.progress)
    })
  })
  let tab
  for (let index = 0; index < 40; index++) {
    tab = (await worker.evaluate(() => chrome.tabs.query({}))).find(tab => tab.url?.endsWith('/fixture'))
    try { if ((await worker.evaluate(id => chrome.tabs.sendMessage(id, { type: 'PING' }), tab.id))?.type === 'PONG') break } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const id = '11111111-1111-4111-8111-111111111111'
  const accepted = await worker.evaluate(({ tabId, files, id }) => chrome.tabs.sendMessage(tabId, { type: 'DOWNLOAD_FILES', payload: {
    items: files, selection: { newFilename: 'file_name', fileNameType: 'colname' }, stripAppNoDot: true,
    archiveName: '华峰官文查询.zip', stream: true, progressId: id, detached: true
  } }), { tabId: tab.id, files, id })
  assert.equal(accepted.type, 'DOWNLOAD_FILES_ACCEPTED')
  const started = Date.now()
  let iframeLoaded = false
  let result
  while (Date.now() - started < 120000) {
    const downloads = await worker.evaluate(() => chrome.downloads.search({}).then(items => items.map(({ id, state, bytesReceived, totalBytes, error, filename }) => ({ id, state, bytesReceived, totalBytes, error, filename }))))
    observations.push({ at: Date.now(), namesCompleted, downloads })
    if (!iframeLoaded && downloads[0]?.state === 'in_progress') {
      iframeLoaded = true
      await easy.evaluate(() => { const frame = document.createElement('iframe'); frame.src = '/fixture?metadata-frame=1'; document.body.appendChild(frame) })
    }
    const firstBytes = observations.find(item => item.downloads[0]?.bytesReceived > 0)?.downloads[0].bytesReceived
    if (!releasedLastNames && releaseLastNames && firstBytes > 0 && downloads[0]?.bytesReceived > firstBytes) {
      releasedLastNames = true
      setTimeout(() => releaseLastNames(), 100)
    }
    result = await app.evaluate(id => window.__results[id], id)
    if (result) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(result?.payload?.ok, true, JSON.stringify(result))
  const downloads = observations.at(-1).downloads
  await writeFile(resultPath('stream-download-e2e-pending.json'), JSON.stringify({ result, downloads, observations, allNamedAt, firstPrepareAt, peakRequests, peakBodies, requestTrace }, null, 2))
  assert.equal(downloads.length, 1)
  assert.equal(downloads[0].state, 'complete')
  assert.equal(basename(downloads[0].filename), '华峰官文查询.zip')
  assert(peakRequests <= 6, '业务请求不能超过六个额度')
  assert(peakBodies > 1, '正文必须实际并行传输')
  assert(firstPrepareAt < allNamedAt, 'DownLoad必须早于全部命名完成')
  const early = observations.filter(item => item.at < allNamedAt && item.downloads[0]?.state === 'in_progress' && item.downloads[0].bytesReceived > 0)
  assert(early.length >= 2, '全部命名结束前，必须真实看到原生下载在途且字节增长')
  assert(early.at(-1).downloads[0].bytesReceived > early[0].downloads[0].bytesReceived)
  const validation = 'import zipfile,json,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert len(z.infolist())==81\n assert z.testzip() is None\n assert z.namelist()==[f"2026100263349-file-{i}.pdf" for i in range(81)]\n assert all(len(z.read(i))==262144 for i in z.namelist())\n print(json.dumps({"passed":True,"entries":81,"crc":True}))'
  const { stdout } = await promisify(execFile)('python', ['-c', validation, downloads[0].filename], { windowsHide: true })
  const progress = await app.evaluate(() => window.__progress)
  assert(progress.some(item => item.phase === 'downloading' && item.state === 'inProgress' && item.receivedBytes > 0))
  const report = { passed: true, fileCount: count, archiveName: basename(downloads[0].filename), prepares, streams,
    peakRequests, peakBodies, requestTrace, elapsedMs: Date.now() - started,
    archiveBytes: (await readFile(downloads[0].filename)).length, firstPrepareAt, allNamedAt,
    earlyNativeBytes: [early[0].downloads[0].bytesReceived, early.at(-1).downloads[0].bytesReceived],
    nativeDownloads: downloads.length, metadataIframePreserved: iframeLoaded, validation: JSON.parse(stdout), observations }
  // 六份正文先各自挂起首块：第六条连接到达才放行，排除短响应的采样误差。
  proveSix = true
  const sixId = '33333333-3333-4333-8333-333333333333'
  await worker.evaluate(({ tabId, items, id }) => chrome.tabs.sendMessage(tabId, { type: 'DOWNLOAD_FILES', payload: {
    items, selection: null, stripAppNoDot: false, archiveName: '六路连接验收.zip', stream: true, progressId: id, detached: true
  } }), { tabId: tab.id, items: files.slice(0, 6), id: sixId })
  await app.waitForFunction(id => Boolean(window.__results[id]), sixId, { timeout: 30000 })
  const sixResult = await app.evaluate(id => window.__results[id], sixId)
  assert.equal(sixResult.payload.ok, true, JSON.stringify(sixResult))
  assert.equal(peakRequests, 6)
  assert.equal(peakBodies, 6)
  const sixDownload = await worker.evaluate(firstId => chrome.downloads.search({}).then(items => items.find(item => item.id !== firstId && item.state === 'complete')), downloads[0].id)
  report.sixConnectionCheck = { passed: true, peakRequests, peakBodies, complete: true }
  // 排除已完成的第二个下载，后续中断用例仍只选正在传输的任务。
  assert(sixDownload)
  proveSix = false
  slowTransfer = true
  const cancelId = '22222222-2222-4222-8222-222222222222'
  await worker.evaluate(({ tabId, items, id }) => chrome.tabs.sendMessage(tabId, { type: 'DOWNLOAD_FILES', payload: {
    items, selection: null, stripAppNoDot: false, archiveName: '取消验收.zip', stream: true, progressId: id, detached: true
  } }), { tabId: tab.id, items: files.slice(0, 3), id: cancelId })
  let cancellation
  let cancelResult
  for (let index = 0; index < 100; index++) {
    const item = await worker.evaluate(firstId => chrome.downloads.search({}).then(items => items.find(item => item.id !== firstId && item.state === 'in_progress' && item.bytesReceived > 0)), downloads[0].id)
    if (item) {
      await worker.evaluate(id => chrome.downloads.cancel(id), item.id)
      cancellation = item.id
      break
    }
    cancelResult = await app.evaluate(id => window.__results[id], cancelId)
    if (cancelResult) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.notEqual(cancellation, undefined, '取消用例必须在真正传输中操作' + (cancelResult ? '，任务却提前结束了：' + JSON.stringify(cancelResult) : ''))
  await app.waitForFunction(id => Boolean(window.__results[id]), cancelId, { timeout: 20000 })
  const cancelled = await app.evaluate(id => window.__results[id], cancelId)
  assert.equal(cancelled.payload.ok, false, '用户取消必须失败，不能完成残缺包')
  assert.equal(await worker.evaluate(id => chrome.downloads.search({ id }).then(items => items[0].state), cancellation), 'interrupted')
  report.cancellation = { passed: true, successReported: false, interrupted: true }
  const navigationId = '44444444-4444-4444-8444-444444444444'
  await worker.evaluate(({ tabId, items, id }) => chrome.tabs.sendMessage(tabId, { type: 'DOWNLOAD_FILES', payload: {
    items, selection: null, stripAppNoDot: false, archiveName: '导航中断验收.zip', stream: true, progressId: id, detached: true
  } }), { tabId: tab.id, items: files.slice(0, 3), id: navigationId })
  let navigationDownload
  let navigationResult
  for (let index = 0; index < 100; index++) {
    navigationDownload = await worker.evaluate(ids => chrome.downloads.search({}).then(items => items.find(item => !ids.includes(item.id) && item.state === 'in_progress' && item.bytesReceived > 0)), [downloads[0].id, cancellation])
    if (navigationDownload) break
    navigationResult = await app.evaluate(id => window.__results[id], navigationId)
    if (navigationResult) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert(navigationDownload, '导航回归必须在实际流水传输中操作' + (navigationResult ? '，任务却提前结束了：' + JSON.stringify(navigationResult) : ''))
  await easy.goto('http://183.36.43.66:88/fixture?top-navigation=1')
  let navigatedState
  for (let index = 0; index < 50; index++) {
    navigatedState = await worker.evaluate(id => chrome.downloads.search({ id }).then(items => items[0].state), navigationDownload.id)
    if (navigatedState === 'interrupted') break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(navigatedState, 'interrupted', '顶层离开来源文档必须中断原生流')
  report.topNavigation = { passed: true, interrupted: true }
  await writeFile(resultPath('stream-download-e2e.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, observations: observations.length }, null, 2))
} finally {
  await context?.close()
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  stopBridge()
}
