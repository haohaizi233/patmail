import http from 'node:http'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { ZipReader, ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
import { distDir, testResultsDir, resultPath } from './support/paths.mjs'
import { extensionWorker, waitForContentScript, waitForPageCondition } from './support/browser.mjs'

assert.equal(existsSync(join(distDir, 'local-download')), false, '交付目录不能依赖Python桥接')
const files = Array.from({ length: 8 }, (_, index) => ({ fileId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, fileNo: `B${index}`, fileName: `old-${index}.pdf` }))
const sourceZip = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false })
await sourceZip.add('original.pdf', new Uint8ArrayReader(Buffer.from('%PDF original wrapped source')))
await sourceZip.add('data.xml', new Uint8ArrayReader(Buffer.from('<data>original metadata</data>')))
const wrappedSource = Buffer.from(await sourceZip.close())
const missingSource = Buffer.from([80, 75, 5, 6, ...Array(18).fill(0)])
const missingNotice = '文件不存在或权限不足,您共1个文件缺失附件.pdf下载失败'
const templateId = 'd9896997-1e83-4c7d-9a49-da69ba56e7aa'
const info = { IsLogin: true, Status: true, Result: true }
const source = index => { if (index === 6) return wrappedSource; if (index === 7) return missingSource; const bytes = Buffer.alloc(512 * 1024, index); bytes.write('%PDF pure TS fixture'); return bytes }
let names = 0, failed = false, gatewayRetried = false, releaseFailure, releaseSix
let activeBodies = 0, peakBodies = 0
const failureGate = new Promise(resolve => { releaseFailure = resolve })
const sixGate = new Promise(resolve => { releaseSix = resolve })
const fetches = [], ranges = []
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://183.36.43.66:88')
  if (url.hostname !== '183.36.43.66') { res.writeHead(404); return res.end() }
  let body = ''; for await (const chunk of req) body += chunk
  const params = new URLSearchParams(body), call = params.get('Call')
  if (['GetFileName', 'DownLoad', 'GetSearchFiles'].includes(call)) console.log('fixture request', call)
  const json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ClientInfo: info, ...data })) }
  if (call === 'GetUserModel') return json({ UserModel: { user_id: '11111111-1111-1111-1111-111111111111', user_name: 'fixture', Name: 'Fixture' } })
  if (call === 'GetApplyTags') return json({ ApplyTags: null })
  if (call === 'GetFileTempNameList') return json({ TempNameList: [{ id: templateId, temp_name: '纯TS验收', new_filename: 'file_name', file_name_type: 'colname' }] })
  if (call === 'GetFlowdirection') return json({ DownLoadFileName: [{ value: 'file_name', text_zh_cn: '附件名称' }] })
  if (call === 'GetSearchFiles') return json({ TableRowsCount: '8', TableRows: files.map(file => ({ file_id: file.fileId, file_no: file.fileNo, file_name: file.fileName, case_volume: 'AUDIT' })) })
  if (call === 'GetFileName') { names++; return json({ file_names: params.get('file_ids').split(';').map(id => `202610026334.9-${files.findIndex(file => file.fileId === id)}.pdf`).join(';') }) }
  if (call === 'DownLoad') {
    if (params.get('file_no') === 'B4' && !gatewayRetried) { gatewayRetried = true; res.writeHead(502); return res.end('temporary gateway failure') }
    const file = files.find(file => file.fileNo === params.get('file_no')), index = files.indexOf(file)
    return json({ file_guid: file.fileId, file_size: source(index).length, error_message: missingNotice })
  }
  if (url.pathname.endsWith('FileHandler.ashx')) {
    const index = files.findIndex(file => file.fileId === url.searchParams.get('guid'))
    fetches.push(index)
    console.log('fixture body', index)
    const bytes = source(index), range = req.headers.range
    const offset = range ? Number(/^bytes=(\d+)-/.exec(range)?.[1]) : 0
    if (range) ranges.push({ index, offset })
    activeBodies++; peakBodies = Math.max(peakBodies, activeBodies)
    if (activeBodies === 6) releaseSix()
    let counted = true
    res.on('close', () => { if (counted) { counted = false; activeBodies-- } })
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('ETag', `"browser-${index}-v1"`)
    res.setHeader('Content-Length', bytes.length - offset)
    if (range) { res.statusCode = 206; res.setHeader('Content-Range', `bytes ${offset}-${bytes.length - 1}/${bytes.length}`) }
    await sixGate
    if (index === 1 && !failed) {
      failed = true; res.write(bytes.subarray(0, 256 * 1024)); await failureGate; res.destroy(); return
    }
    res.end(bytes.subarray(offset)); return
  }
  if (url.pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><title>纯TS下载验收</title>') }
  json({})
})
server.on('connect', (_, socket) => socket.destroy())
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const profile = await mkdtemp(join(testResultsDir, 'browser-download-profile-'))
let context, app
let downloads = []
const violations = []
const warmResume = process.env.PATMAIL_PIPELINE_WARM === '1'
const recoveryScope = JSON.stringify(['http://183.36.43.66:88', '11111111-1111-1111-1111-111111111111', 'workspace-files'])
async function launch() {
  console.log('stage: launch browser')
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, acceptDownloads: true, downloadsPath: join(profile, 'downloads'),
    ...(process.env.PATMAIL_TEST_CHROMIUM ? { executablePath: process.env.PATMAIL_TEST_CHROMIUM } : {}),
    proxy: { server: `http://127.0.0.1:${server.address().port}`, bypass: '127.0.0.1' },
    args: [`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`] })
  console.log('stage: Chromium started')
  context.on('request', request => { if (/127\.0\.0\.1:42843/.test(request.url())) violations.push(request.url()) })
  context.on('close', () => console.log('event: context closed'))
  context.browser()?.on('disconnected', () => console.log('event: browser disconnected'))
  context.on('page', page => { page.on('pageerror', error => console.error('fixture page error', String(error))); page.on('download', download => downloads.push(download)) })
  await context.addInitScript(() => {
    window.__pickerCalls = 0; window.__legacyCalls = 0
    window.showSaveFilePicker = async () => {
      window.__pickerCalls++
      throw new Error('原生下载不允许调用文件选择器')
    }
    if (location.protocol === 'chrome-extension:' && globalThis.chrome?.runtime) chrome.runtime.onMessage.addListener(message => {
      if (message?.type === 'STREAM_DOWNLOAD') window.__legacyCalls++
    })
  })
  const worker = await extensionWorker(context)
  console.log('stage: service worker ready', worker.url())
  const easy = await context.newPage()
  console.log('stage: opening fixture')
  await easy.goto('http://183.36.43.66:88/fixture')
  console.log('stage: fixture loaded')
  await waitForContentScript(worker, easy)
  console.log('stage: content script ready')
  app = await context.newPage(); await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`)
  const cdp = await context.newCDPSession(app)
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: join(profile, 'native-files'), eventsEnabled: true })
  app.on('close', () => console.log('event: app closed'))
  app.on('crash', () => console.log('event: app crashed'))
  console.log('stage: workbench ready')
  return worker
}
try {
  let worker = await launch()
  await app.getByText('当前账号未配置专利标签', { exact: true }).waitFor()
  await app.locator('.download-template-select [role="combobox"]').click()
  await app.getByRole('option', { name: '纯TS验收', exact: true }).click()
  await app.getByLabel('我方文号', { exact: true }).first().fill('AUDIT')
  await app.getByRole('button', { name: '查询文件', exact: true }).click()
  await app.getByText('old-0.pdf', { exact: true }).waitFor()
  await app.getByRole('button', { name: '全选本页', exact: true }).click()
  await app.getByRole('button', { name: '下载已选', exact: true }).click()
  console.log('stage: download clicked')
  await waitForPageCondition(app, async () => (await chrome.downloads.search({})).some(item => item.state === 'in_progress' && item.bytesReceived >= 512 * 1024), null, { timeout: 60000 })
  releaseFailure()
  console.log('stage: source interrupted')
  await app.getByRole('button', { name: '继续下载', exact: true }).waitFor()
  await waitForPageCondition(app, async scope => {
    const button = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === '继续下载')
    if (!button || button.disabled) return false
    const reply = await chrome.runtime.sendMessage({ type: 'PATMAIL_RECOVERY_RPC', request: { op: 'get', slot: 'file-query', scope } })
    return reply.ok && reply.value.payload?.activeTask?.status === 'paused'
  }, recoveryScope, { timeout: 30000 })
  const exportPanel = app.getByRole('region', { name: '文件导出', exact: true })
  assert.equal(await app.getByRole('region', { name: '查询结果', exact: true }).locator('.file-export').count(), 1)
  assert.equal(await exportPanel.getByRole('button', { name: '继续下载', exact: true }).isEnabled(), true)
  assert(Number(await app.locator('.check-rainbow').getAttribute('aria-valuenow')) < 100, '中断不能报导出完成')
  await app.getByRole('region', { name: '查询结果', exact: true }).screenshot({ path: resultPath('file-export-six-paused.png') })
  assert.equal(await app.evaluate(() => window.__pickerCalls), 0, '原生下载不调用文件选择器')
  assert.equal(peakBodies, 6)
  for (const download of downloads) await download.failure()
  if (!warmResume) {
    await context.close(); context = null
    downloads = []
    console.log('stage: browser closed for recovery')
    worker = await launch()
    await app.getByText('已恢复本地查询与选择', { exact: false }).waitFor()
    await app.getByRole('button', { name: '刷新', exact: true }).click()
    await app.waitForFunction(() => !document.body.textContent.includes('已恢复本地查询与选择'))
  }
  await app.getByRole('button', { name: '继续下载', exact: true }).click()
  console.log('stage: resume clicked')
  await waitForPageCondition(app, async scope => {
    const reply = await chrome.runtime.sendMessage({ type: 'PATMAIL_RECOVERY_RPC', request: { op: 'get', slot: 'file-query', scope } })
    return reply.ok && reply.value.payload?.activeTask?.status === 'done'
  }, recoveryScope, { timeout: 120000 })
  console.log('stage: final file and ledger committed')
  const completePanel = app.getByRole('region', { name: '文件导出', exact: true })
  assert.equal(await app.locator('.check-rainbow').getAttribute('aria-valuenow'), '100')
  assert.equal(await completePanel.getByText('导出完成', { exact: true }).count(), 0, '完成状态只在顶栏显示，底部不重复')
  await app.getByRole('region', { name: '查询结果', exact: true }).screenshot({ path: resultPath('file-export-six-complete.png') })
  const completedItems = await worker.evaluate(() => chrome.downloads.search({ state: 'complete' }))
  const completedItem = completedItems.find(item => item.bytesReceived > 3 * 1024 * 1024)
  assert(completedItem?.exists, 'Chrome must confirm a real saved file')
  const output = resultPath('native-pipeline-fault-recovered.zip')
  const saved = await app.evaluate(() => ({ legacyCalls: window.__legacyCalls }))
  const archive = await readFile(completedItem.filename)
  await writeFile(output, archive)
  const reader = new ZipReader(new Uint8ArrayReader(archive), { useWebWorkers: false })
  try {
    const entries = await reader.getEntries()
    assert.deepEqual(entries.map(entry => entry.filename), [...files.slice(0, 6).map((_, index) => `2026100263349-${index}.pdf`), '2026100263349-6.zip', '下载失败清单.txt'])
    for (const [index, entry] of entries.slice(0, 7).entries()) assert.deepEqual(Buffer.from(await entry.getData(new Uint8ArrayWriter(), { checkSignature: true, useWebWorkers: false })), source(index))
    const note = Buffer.from(await entries[7].getData(new Uint8ArrayWriter(), { checkSignature: true, useWebWorkers: false })).toString('utf8')
    assert(note.includes('成功 7 个；跳过 1 个'))
    assert(note.includes('2026100263349-7.pdf'))
    assert(note.includes('2026100263349-6.zip'))
  } finally { await reader.close() }
  assert.equal(names, 1)
  assert.equal(gatewayRetried, true, '单附件准备必须从临时502恢复')
  assert.equal(fetches.filter(index => index === 0).length, 1)
  assert(ranges.some(item => item.index === 1 && item.offset === 262144))
  assert.equal(saved.legacyCalls, 0)
  await app.getByText('成功 7 个，跳过 1 个不可用附件', { exact: false }).waitFor()
  await app.screenshot({ path: resultPath('native-pipeline-compact-ui.png') })
  assert.equal(violations.length, 0)
  const nativeDownloads = await worker.evaluate(() => chrome.downloads.search({}))
  assert(nativeDownloads.some(item => item.state === 'complete' && item.bytesReceived === archive.length), '原生下载必须确认完整字节')
  const report = { passed: true, pureBrowser: true, coldRestarted: !warmResume, gatewayRetried, peakBodies, sourceFetches: fetches, ranges, names, bytes: archive.length, crc: true, nativeDownloads: nativeDownloads.map(item => ({ state: item.state, receivedBytes: item.bytesReceived })), loopbackRequests: 0 }
  Object.assign(report, { preservedOriginalZip: true, skippedUnavailable: 1, goodSourceFiles: 7 })
  await writeFile(resultPath('native-pipeline-fault.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} catch (error) {
  console.error(JSON.stringify({ error: String(error), appClosed: app?.isClosed(), connected: context?.browser()?.isConnected(), pages: context?.pages().map(page => page.url()), fetches, ranges, names, peakBodies, body: await app?.locator('body').innerText().catch(() => '') }))
  throw error
} finally { releaseFailure(); releaseSix(); await context?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
