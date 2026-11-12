import http from 'node:http'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
import { distDir, tmpPath, resultPath } from './support/paths.mjs'
import { extensionWorker, waitForContentScript, waitForPageCondition } from './support/browser.mjs'

assert.equal(existsSync(join(distDir, 'local-download')), false, '交付目录不能依赖Python桥接')
const files = Array.from({ length: 6 }, (_, index) => ({
  fileId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  fileNo: `B${index}`,
  fileName: `old-${index}.pdf`,
}))
const templateId = 'd9896997-1e83-4c7d-9a49-da69ba56e7aa'
const info = { IsLogin: true, Status: true, Result: true }
const source = index => {
  const bytes = Buffer.alloc(512 * 1024, index)
  bytes.write('%PDF pure TS fixture')
  return bytes
}
let names = 0,
  failed = false,
  releaseFailure,
  releaseSix
let activeBodies = 0,
  peakBodies = 0
const failureGate = new Promise(resolve => {
  releaseFailure = resolve
})
const sixGate = new Promise(resolve => {
  releaseSix = resolve
})
const fetches = [],
  ranges = []
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://183.36.43.66:88')
  if (url.hostname !== '183.36.43.66') {
    res.writeHead(404)
    return res.end()
  }
  let body = ''
  for await (const chunk of req) body += chunk
  const params = new URLSearchParams(body),
    call = params.get('Call')
  if (['GetFileName', 'DownLoad', 'GetSearchFiles'].includes(call)) console.log('fixture request', call)
  const json = data => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ClientInfo: info, ...data }))
  }
  if (call === 'GetUserModel')
    return json({
      UserModel: { user_id: '11111111-1111-1111-1111-111111111111', user_name: 'fixture', Name: 'Fixture' },
    })
  if (call === 'GetApplyTags') return json({ ApplyTags: null })
  if (call === 'GetFileTempNameList')
    return json({
      TempNameList: [{ id: templateId, temp_name: '纯TS验收', new_filename: 'file_name', file_name_type: 'colname' }],
    })
  if (call === 'GetFlowdirection') return json({ DownLoadFileName: [{ value: 'file_name', text_zh_cn: '附件名称' }] })
  if (call === 'GetSearchFiles')
    return json({
      TableRowsCount: '6',
      TableRows: files.map(file => ({
        file_id: file.fileId,
        file_no: file.fileNo,
        file_name: file.fileName,
        case_volume: 'AUDIT',
      })),
    })
  if (call === 'GetFileName') {
    names++
    return json({
      file_names: params
        .get('file_ids')
        .split(';')
        .map(id => `202610026334.9-${files.findIndex(file => file.fileId === id)}.pdf`)
        .join(';'),
    })
  }
  if (call === 'DownLoad')
    return json({ file_guid: files.find(file => file.fileNo === params.get('file_no')).fileId, file_size: 524288 })
  if (url.pathname.endsWith('FileHandler.ashx')) {
    const index = files.findIndex(file => file.fileId === url.searchParams.get('guid'))
    fetches.push(index)
    console.log('fixture body', index)
    const bytes = source(index),
      range = req.headers.range
    const offset = range ? Number(/^bytes=(\d+)-/.exec(range)?.[1]) : 0
    if (range) ranges.push({ index, offset })
    activeBodies++
    peakBodies = Math.max(peakBodies, activeBodies)
    if (activeBodies === 6) releaseSix()
    let counted = true
    res.on('close', () => {
      if (counted) {
        counted = false
        activeBodies--
      }
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('ETag', `"browser-${index}-v1"`)
    res.setHeader('Content-Length', bytes.length - offset)
    if (range) {
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${offset}-${bytes.length - 1}/${bytes.length}`)
    }
    await sixGate
    if (index === 1 && !failed) {
      failed = true
      res.write(bytes.subarray(0, 256 * 1024))
      await failureGate
      res.destroy()
      return
    }
    res.end(bytes.subarray(offset))
    return
  }
  if (url.pathname === '/fixture') {
    res.setHeader('Content-Type', 'text/html')
    return res.end('<!doctype html><title>纯TS下载验收</title>')
  }
  json({})
})
server.on('connect', (_, socket) => socket.destroy())
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const profile = await mkdtemp(tmpPath('browser-download-profile-'))
let context, app
const violations = []
const recoveryScope = JSON.stringify([
  'http://183.36.43.66:88',
  '11111111-1111-1111-1111-111111111111',
  'workspace-files',
])
async function launch() {
  console.log('stage: launch browser')
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    proxy: { server: `http://127.0.0.1:${server.address().port}`, bypass: '127.0.0.1' },
    args: [`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`],
  })
  context.on('request', request => {
    if (/127\.0\.0\.1:42843/.test(request.url())) violations.push(request.url())
  })
  context.on('page', page => page.on('pageerror', error => console.error('fixture page error', String(error))))
  await context.addInitScript(() => {
    window.__pickerCalls = 0
    window.__savedBytes = 0
    window.__pickerGesture = false
    window.__legacyCalls = 0
    // 保存选择器由夹具提供真实OPFS句柄，所有write/close仍走Chrome文件系统实现。
    window.showSaveFilePicker = async () => {
      window.__pickerCalls++
      window.__pickerGesture = navigator.userActivation.isActive
      const directory = await navigator.storage.getDirectory()
      const handle = await directory.getFileHandle('direct-output.zip', { create: true })
      return {
        createWritable: async options => {
          const writer = await handle.createWritable(options)
          return {
            async write(bytes) {
              await writer.write(bytes)
              window.__savedBytes += bytes.length
            },
            async close() {
              await writer.close()
            },
            async abort(reason) {
              await writer.abort(reason)
            },
          }
        },
      }
    }
    if (location.protocol === 'chrome-extension:' && globalThis.chrome?.runtime)
      chrome.runtime.onMessage.addListener(message => {
        if (message?.type === 'STREAM_DOWNLOAD') window.__legacyCalls++
      })
  })
  const worker = await extensionWorker(context)
  const easy = await context.newPage()
  await easy.goto('http://183.36.43.66:88/fixture')
  await waitForContentScript(worker, easy)
  app = await context.newPage()
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`)
  console.log('stage: workbench ready')
  return worker
}
try {
  await launch()
  await app.getByText('当前账号未配置专利标签', { exact: true }).waitFor()
  await app.locator('.download-template-select [role="combobox"]').click()
  await app.getByRole('option', { name: '纯TS验收', exact: true }).click()
  await app.getByLabel('我方文号', { exact: true }).first().fill('AUDIT')
  await app.getByRole('button', { name: '查询文件', exact: true }).click()
  await app.getByText('old-0.pdf', { exact: true }).waitFor()
  await app.getByRole('button', { name: '全选本页', exact: true }).click()
  await app.getByRole('button', { name: '下载已选', exact: true }).click()
  console.log('stage: download clicked')
  await app.waitForFunction(() => window.__savedBytes >= 512 * 1024, null, { timeout: 60000 })
  releaseFailure()
  console.log('stage: source interrupted')
  await app.getByRole('button', { name: '继续下载', exact: true }).waitFor()
  await waitForPageCondition(
    app,
    async scope => {
      const button = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === '继续下载')
      if (!button || button.disabled) return false
      const reply = await chrome.runtime.sendMessage({
        type: 'PATMAIL_RECOVERY_RPC',
        request: { op: 'get', slot: 'file-query', scope },
      })
      return reply.ok && reply.value.payload?.activeTask?.status === 'paused'
    },
    recoveryScope,
    { timeout: 30000 },
  )
  assert.equal(await app.evaluate(() => window.__pickerGesture), true, '选择器须保留点击手势')
  assert.equal(peakBodies, 6)
  await context.close()
  context = null
  console.log('stage: browser closed for recovery')
  const worker = await launch()
  await app.getByText('已恢复本地查询与选择', { exact: false }).waitFor()
  await app.getByRole('button', { name: '刷新', exact: true }).click()
  await app.waitForFunction(() => !document.body.textContent.includes('已恢复本地查询与选择'))
  await app.getByRole('button', { name: '继续下载', exact: true }).click()
  console.log('stage: resume clicked')
  await waitForPageCondition(
    app,
    async scope => {
      const reply = await chrome.runtime.sendMessage({
        type: 'PATMAIL_RECOVERY_RPC',
        request: { op: 'get', slot: 'file-query', scope },
      })
      return reply.ok && reply.value.payload?.activeTask?.status === 'done' && window.__savedBytes >= 3145728
    },
    recoveryScope,
    { timeout: 120000 },
  )
  console.log('stage: final file and ledger committed')
  const saved = await app.evaluate(async () => {
    const file = await (await (await navigator.storage.getDirectory()).getFileHandle('direct-output.zip')).getFile()
    const bytes = new Uint8Array(await file.arrayBuffer())
    let text = ''
    for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192))
    return { data: btoa(text), legacyCalls: window.__legacyCalls }
  })
  const archive = Buffer.from(saved.data, 'base64')
  const reader = new ZipReader(new Uint8ArrayReader(archive), { useWebWorkers: false })
  try {
    const entries = await reader.getEntries()
    assert.deepEqual(
      entries.map(entry => entry.filename),
      files.map((_, index) => `2026100263349-${index}.pdf`),
    )
    for (const [index, entry] of entries.entries())
      assert.deepEqual(
        Buffer.from(await entry.getData(new Uint8ArrayWriter(), { checkSignature: true, useWebWorkers: false })),
        source(index),
      )
  } finally {
    await reader.close()
  }
  assert.equal(names, 1)
  assert.equal(fetches.filter(index => index === 0).length, 1)
  assert(ranges.some(item => item.index === 1 && item.offset === 262144))
  assert.equal(saved.legacyCalls, 0)
  assert.equal(violations.length, 0)
  const nativeDownloads = await worker.evaluate(() => chrome.downloads.search({}))
  assert.equal(nativeDownloads.length, 0, '直接文件写入不创建Chrome下载记录')
  const report = {
    passed: true,
    pureBrowser: true,
    coldRestarted: true,
    peakBodies,
    sourceFetches: fetches,
    ranges,
    names,
    bytes: archive.length,
    crc: true,
    nativeDownloads: 0,
    loopbackRequests: 0,
  }
  await writeFile(resultPath('browser-download.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} catch (error) {
  console.error(
    JSON.stringify({
      error: String(error),
      fetches,
      ranges,
      names,
      peakBodies,
      body: await app
        ?.locator('body')
        .innerText()
        .catch(() => ''),
    }),
  )
  throw error
} finally {
  releaseFailure()
  releaseSix()
  await context?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
