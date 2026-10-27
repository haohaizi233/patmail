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
  } else if (call === 'DownLoad') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(JSON.stringify(packed))
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
  const result = await Promise.race([
    worker.evaluate(id => chrome.tabs.sendMessage(id, {
      type: 'DOWNLOAD_FILES', payload: {
        items: [{ fileId: '603ca943-a07a-4894-9461-29dff2d60c4b', fileNo: 'A00111119448', fileName: 'test.pdf' }],
        selection: null, stripAppNoDot: true
      }
    }), tab.id),
    new Promise(resolve => { timeout = setTimeout(() => resolve({ diagnosticTimeout: true }), 40000) })
  ])
  clearTimeout(timeout)
  let downloads = []
  for (let attempt = 0; attempt < 50; attempt++) {
    downloads = await worker.evaluate(() => chrome.downloads.search({}).then(items => items.map(({ id, state, error, bytesReceived, totalBytes, filename }) => ({ id, state, error, bytesReceived, totalBytes, filename }))))
    if (downloads.some(item => item.state === 'complete' || item.state === 'interrupted')) break
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  const report = { result, downloads, calls, errors }
  await mkdir(testResultsDir, { recursive: true })
  await writeFile(resultPath('download-e2e.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  assert.equal(result.type, 'DOWNLOAD_FILES_RESULT')
  assert.equal(result.payload.ok, true)
  assert.equal(result.payload.data.notice, '', '后台应直接接住下载，不能靠 iframe 假成功')
  assert.equal(calls.filter(call => call.call === 'DownLoad').length, 1)
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
