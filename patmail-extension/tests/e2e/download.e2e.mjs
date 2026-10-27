import http from 'node:http'
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { distDir, testResultsDir, resultPath } from './support/paths.mjs'

// Every browser request terminates at this local proxy; never forward to EASY.
// 222.har 的响应结构，使用虚构身份和 GUID，不依赖本地 HAR 或真实会话。
const session = {
  UserModel: { user_id: '11111111-1111-4111-8111-111111111111', user_name: 'fixture', Name: '测试员' },
  ClientInfo: { IsLogin: true, Status: true, Result: false }
}
const packed = {
  error: true, error_message: '文件不存在或权限不足,您共0个文件下载失败！',
  ClientInfo: { IsLogin: true, Url: null, Status: true, Message: null, OtherInfo: {}, IsNewWindow: false,
    WebPath: 'http://183.36.43.66:88', Result: true, ErrorCode: false, Asyn: false },
  file_guid: '85ebabc1-cf99-490e-b5f7-298a77742012'
}
const calls = []
const files = Array.from({ length: 141 }, (_, index) => ({
  fileId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  fileNo: `A${index + 1}`, fileName: `original-${index + 1}.pdf`
}))
const positions = new Map(files.map((file, index) => [file.fileId, index + 1]))
let activeNames = 0
let peakNames = 0
let downloadParams
const zip = Buffer.from('504b0506000000000000000000000000000000000000', 'hex')
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://183.36.43.66:88')
  let body = ''
  for await (const chunk of req) body += chunk
  const call = new URLSearchParams(body).get('Call')
  calls.push({ method: req.method, path: url.pathname, call })
  if (url.pathname.endsWith('Login.ashx')) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(JSON.stringify(session))
  } else if (call === 'GetFileName') {
    const params = new URLSearchParams(body)
    const ids = params.get('file_ids').split(';')
    activeNames++
    peakNames = Math.max(peakNames, activeNames)
    // 让后面的批次先返回，不能只验证按序完成的情况。
    await new Promise(resolve => setTimeout(resolve, 180 - positions.get(ids[0])))
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(JSON.stringify({ ClientInfo: { IsLogin: true, Status: true, Result: false }, file_names: ids.map(id => `file-${positions.get(id)}.pdf`).join(';') }))
    activeNames--
  } else if (call === 'DownLoad') {
    downloadParams = new URLSearchParams(body)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    // 分块发送打包 JSON：块间留时间，验证插件按真实字节流式上报，不等整包才报一次。
    const json = JSON.stringify({ ...packed, pad: 'p'.repeat(6000) })
    for (const [start, end] of [[0, 800], [800, 2400], [2400, 4800], [4800, Infinity]]) {
      res.write(json.slice(start, end))
      if (end !== Infinity) await new Promise(resolve => setTimeout(resolve, 700))
    }
    res.end()
  } else if (url.pathname.endsWith('FileHandler.ashx')) {
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename="fixture.zip"')
    res.end(zip)
  } else if (url.pathname === '/fixture') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end('<!doctype html><title>Download diagnostic fixture</title><body>Local fixture</body>')
  } else { res.writeHead(404); res.end() }
})
server.on('connect', (_, socket) => socket.destroy())
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let context
try {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, acceptDownloads: true,
    proxy: { server: `http://127.0.0.1:${server.address().port}`, bypass: '<-loopback>' },
    args: [`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`]
  })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const errors = []
  worker.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://183.36.43.66:88/fixture')
  assert.deepEqual(await page.evaluate(() => ({ secure: isSecureContext, uuid: typeof crypto.randomUUID })),
    { secure: false, uuid: 'undefined' }, '必须在真实 HTTP 非安全上下文复现，不能用 localhost 或 HTTPS 掩盖缺陷')
  const app = await context.newPage()
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`)
  const progressId = '11111111-1111-4111-8111-111111111111'
  await app.evaluate(id => {
    globalThis.__downloadAudit = []
    globalThis.__downloadResult = null
    chrome.runtime.onMessage.addListener(message => {
      if (message.channel === 'patmail-download-progress' && message.id === id) globalThis.__downloadAudit.push(message.progress)
      if (message.channel === 'patmail-download-result' && message.id === id) globalThis.__downloadResult = message.body
    })
  }, progressId)
  let tab
  for (let i = 0; i < 30; i++) {
    tab = (await worker.evaluate(() => chrome.tabs.query({}))).find(t => t.url?.endsWith('/fixture'))
    try {
      const result = await worker.evaluate(id => chrome.tabs.sendMessage(id, { type: 'PING' }), tab.id)
      if (result?.type === 'PONG') break
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  let timeout
  const accepted = await Promise.race([
    worker.evaluate(({ id, files, progressId }) => chrome.tabs.sendMessage(id, {
      type: 'DOWNLOAD_FILES', payload: {
        items: files,
        selection: { newFilename: 'file_desc', fileNameType: 'colname' }, stripAppNoDot: true, progressId, detached: true
      }
    }), { id: tab.id, files, progressId }),
    new Promise(resolve => { timeout = setTimeout(() => resolve({ diagnosticTimeout: true }), 40000) })
  ])
  clearTimeout(timeout)
  assert.equal(accepted.type, 'DOWNLOAD_FILES_ACCEPTED', '长任务必须先短暂受理，不能一直占住后台转发')
  await app.waitForFunction(() => globalThis.__downloadResult !== null, undefined, { timeout: 40000 })
  const result = await app.evaluate(() => globalThis.__downloadResult)
  let downloads = []
  for (let attempt = 0; attempt < 50; attempt++) {
    downloads = await worker.evaluate(() => chrome.downloads.search({}).then(items => items.map(({ id, state, error, bytesReceived, totalBytes, filename }) => ({ id, state, error, bytesReceived, totalBytes, filename }))))
    if (downloads.some(item => item.state === 'complete' || item.state === 'interrupted')) break
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  const progress = await app.evaluate(() => globalThis.__downloadAudit)
  const report = { accepted, result, downloads, calls, errors, peakNames, progress }
  await mkdir(testResultsDir, { recursive: true })
  await writeFile(resultPath('download-e2e.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  assert.equal(result.type, 'DOWNLOAD_FILES_RESULT')
  assert.equal(result.payload.ok, true)
  assert.equal(result.payload.data.fileCount, 141)
  // 最终结果要带浏览器下载终态：压缩包保存完成才算完成，不能只报「已交给浏览器」。
  assert.match(result.payload.data.notice, /浏览器下载完成/, '最终结果要回报浏览器下载完成')
  assert(!/另存走了浏览器直接下载/.test(result.payload.data.notice), '后台应直接接住下载，不能靠 iframe 假成功')
  assert.equal(calls.filter(call => call.call === 'DownLoad').length, 1)
  // 命名一批 100 个：141 个文件是 2 批（100 + 41）。
  assert.equal(calls.filter(call => call.call === 'GetFileName').length, 2)
  assert.equal(peakNames, 2)
  assert.equal(downloadParams.get('file_no'), files.map(file => file.fileNo).join(';'))
  assert.equal(downloadParams.get('file_name'), files.map((_, index) => `file-${index + 1}.pdf`).join(';'))
  const naming = progress.filter(item => item.phase === 'naming')
  assert.equal(naming[0].done, 0)
  assert.equal(naming.at(-1).done, 141)
  assert.equal(naming.every((item, index) => index === 0 || item.done > naming[index - 1].done), true)
  assert(progress.some(item => item.phase === 'packing'))
  const received = progress.filter(item => item.phase === 'packing' && item.receivedBytes > 0).map(item => item.receivedBytes)
  assert(received.length >= 2 && received.at(-1) > received[0], '真实流式响应字节要逐步上报')
  assert(progress.some(item => item.phase === 'saving'))
  // 浏览器下载阶段的流式输出：至少要报出下载终态，长传输时还有 inProgress 字节进度。
  const transfer = progress.filter(item => item.phase === 'downloading')
  assert(transfer.some(item => item.state === 'complete'), '下载阶段要流式回报并给出完成终态')
  assert.equal(transfer.filter(item => item.state === 'complete' || item.state === 'interrupted').length, 1, '终态只能报一次')
  assert.equal(calls.filter(call => call.path.endsWith('FileHandler.ashx')).length, 1)
  assert.equal(downloads.length, 1)
  assert.equal(downloads[0].state, 'complete')
  assert.equal(downloads[0].bytesReceived, zip.length)
  assert.deepEqual(await readFile(downloads[0].filename), zip, '下载记录对应的磁盘文件必须完整')
  console.log('HTTP download regression passed: pack → background message → browser download → verified disk bytes')
} finally {
  await context?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
