import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { launchExtensionContext, extensionWorker } from '../tests/e2e/support/browser.mjs'
import { distDir, testResultsDir, resultPath } from '../tests/e2e/support/paths.mjs'

// 研究专用：隔离浏览器、小样本，只读当前账号可下载的文件；不接入产品按钮。
// 报告只含时序、大小和摘要，不记录凭据、条件、文件标识、名称或正文。
assert.equal(process.env.PATMAIL_LIVE_PIPELINE_RESEARCH, '1', 'Explicit live research flag required')
assert(process.env.PATMAIL_AUDIT_USER && process.env.PATMAIL_AUDIT_PASSWORD && process.env.PATMAIL_AUDIT_HAR)
const origin = 'http://183.36.43.66:88'
const har = JSON.parse(await readFile(process.env.PATMAIL_AUDIT_HAR, 'utf8'))
const readParams = entry => {
  const data = entry.request.postData ?? {}
  return data.text ? new URLSearchParams(data.text) : new URLSearchParams((data.params ?? []).map(item => [item.name, item.value]))
}
const search = har.log.entries.map(readParams).find(params => params.get('Call') === 'GetSearchFiles')
assert(search, 'Captured search request required')
search.set('pageIndex', '1')
search.set('pageSize', '6')
search.set('_t', String(Date.now()))
const context = await launchExtensionContext(distDir)
try {
  const page = await context.newPage()
  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  await page.locator('#chk_password').uncheck()
  await page.locator('#txtUser').fill(process.env.PATMAIL_AUDIT_USER)
  await page.locator('#txtPwd').fill(process.env.PATMAIL_AUDIT_PASSWORD)
  await page.locator('#btnLogin').click()
  await page.waitForFunction(async () => {
    try {
      const response = await fetch('/AjaxServers/Login.ashx', { method: 'POST', body: new URLSearchParams({ Call: 'GetUserModel' }) }).then(value => value.json())
      return response.ClientInfo?.IsLogin === true && Boolean(response.UserModel?.user_id)
    } catch { return false }
  }, undefined, { timeout: 45000, polling: 1000 })
  const files = await page.evaluate(async body => {
    const response = await fetch('/AjaxServers/CaseInfo.ashx', { method: 'POST', body: new URLSearchParams(body) }).then(value => value.json())
    if (response.ClientInfo?.IsLogin !== true || response.ClientInfo?.Status !== true || !Array.isArray(response.TableRows)) throw new Error('Search unavailable')
    return response.TableRows.slice(0, 6).map(row => ({ fileId: row.file_id, fileNo: row.file_no }))
  }, search.toString())
  assert(files.length >= 2 && files.every(file => file.fileId && file.fileNo), 'Insufficient sample')
  console.log(JSON.stringify({ stage: 'sample-ready', count: files.length }))
  const worker = await extensionWorker(context)
  const app = await context.newPage()
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`)
  const report = await app.evaluate(async ({ origin, files }) => {
    const start = performance.now()
    const events = []
    const record = (stage, index, extra = {}) => events.push({ stage, index, elapsedMs: Math.round(performance.now() - start), ...extra })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 180000)
    let changed
    const wake = () => { const resolve = changed; changed = undefined; resolve?.() }
    const wait = () => new Promise(resolve => { changed = resolve })
    const queue = []
    let next = 0, completedNames = 0, activeNames = 0, peakNames = 0, peakQueue = 0, transferredBytes = 0
    let firstPayloadMs = null, namingFinishedMs = null, firstDownLoadMs = null, failure = null
    const maxQueue = 5
    const abort = () => { failure ??= new Error('Research cancelled'); wake() }
    controller.signal.addEventListener('abort', abort)
    const fail = error => { failure ??= error; controller.abort(); wake() }
    const post = async (handler, params) => {
      const response = await fetch(`${origin}/AjaxServers/${handler}.ashx`, {
        method: 'POST', credentials: 'include', body: new URLSearchParams(params), signal: controller.signal
      })
      if (!response.ok) throw new Error('HTTP failure')
      const data = await response.json()
      if (data.ClientInfo?.IsLogin === false || data.ClientInfo?.Status === false) throw new Error('Business failure')
      return data
    }
    // 研究批量为1，便于观察6个小样本的流水重叠；产品仍每批40个、最多5路。
    const produce = async () => {
      try {
        while (!failure && next < files.length) {
          const index = next++
          activeNames++; peakNames = Math.max(peakNames, activeNames)
          record('naming-start', index)
          const data = await post('CaseInfo', { Call: 'GetFileName', file_ids: files[index].fileId,
            new_filename: 'file_name', file_name_type: 'colname', childpath: '', zip_name: '', zip_file_name_type: '', log_pagename: 'FileSearch.aspx' })
          activeNames--
          const name = data.file_names
          if (typeof name !== 'string' || !name.trim() || name.includes(';')) throw new Error('Invalid name count')
          completedNames++
          if (completedNames === files.length) namingFinishedMs = Math.round(performance.now() - start)
          record('naming-complete', index)
          while (!failure && queue.length >= maxQueue) await new Promise(resolve => setTimeout(resolve, 25))
          if (failure) break
          queue.push({ index, name })
          peakQueue = Math.max(peakQueue, queue.length)
          wake()
        }
      } catch (error) { fail(error) }
    }
    const consume = async () => {
      try {
        for (let done = 0; done < files.length; done++) {
          while (!failure && !queue.length) await wait()
          if (failure) throw failure
          const { index, name } = queue.shift()
          firstDownLoadMs ??= Math.round(performance.now() - start)
          record('download-prepare-start', index, { namesCompleted: completedNames })
          const data = await post('BaseInfo', { Call: 'DownLoad', file_no: files[index].fileNo, file_name: name,
            zip_name: '', zip_pwd: '', down_type: '', model: 'FILE', childpath: '', log_pagename: 'FileSearch.aspx' })
          const failed = /共(\d+)个文件下载失败/.exec(data.error_message ?? '')
          if (!data.file_guid || (failed && Number(failed[1]) > 0)) throw new Error('File preparation failed')
          record('download-prepare-complete', index)
          const response = await fetch(`${origin}/AjaxServers/FileHandler.ashx?guid=${encodeURIComponent(data.file_guid)}`, { credentials: 'include', signal: controller.signal })
          if (!response.ok || !response.body) throw new Error('File stream unavailable')
          if (/text\/html/i.test(response.headers.get('content-type') ?? '')) throw new Error('Unexpected HTML')
          const reader = response.body.getReader()
          let bytes = 0, chunks = 0, maxChunk = 0, prefix
          try {
            for (;;) {
              const item = await reader.read()
              if (item.done) break
              firstPayloadMs ??= Math.round(performance.now() - start)
              prefix ??= [...item.value.slice(0, 4)].map(value => value.toString(16).padStart(2, '0')).join('')
              bytes += item.value.byteLength; transferredBytes += item.value.byteLength
              chunks++; maxChunk = Math.max(maxChunk, item.value.byteLength)
              if (bytes > 32 * 1024 * 1024 || transferredBytes > 64 * 1024 * 1024) throw new Error('Research byte limit reached')
              // 研究只消费流并计数；前次OPFS原型已独立验证ZIP写入，本脚本不保存业务正文。
            }
          } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
          const length = response.headers.get('content-length')
          if (!bytes || (length !== null && Number(length) !== bytes)) throw new Error('Incomplete stream')
          record('download-stream-complete', index, { bytes, chunks, maxChunk, prefix, contentLength: length === null ? null : Number(length) })
        }
      } catch (error) { fail(error) }
    }
    try {
      await Promise.all([...Array.from({ length: Math.min(5, files.length) }, produce), consume()])
      return { checkedAt: new Date().toISOString(), productionFeature: false, count: files.length, namingBatch: 1,
        peakNames, peakQueue, maxQueue, downLoadConcurrency: 1, firstDownLoadMs, namingFinishedMs, firstPayloadMs, transferredBytes,
        elapsedMs: Math.round(performance.now() - start), completed: events.filter(event => event.stage === 'download-stream-complete').length,
        overlapped: firstDownLoadMs !== null && namingFinishedMs !== null && firstDownLoadMs < namingFinishedMs,
        failed: Boolean(failure), error: failure?.message ?? null, events }
    } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', abort) }
  }, { origin, files })
  await mkdir(testResultsDir, { recursive: true })
  await writeFile(resultPath('name-download-pipeline-research.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  assert.equal(report.failed, false)
  assert.equal(report.completed, files.length)
  assert.equal(report.peakNames, Math.min(5, files.length))
  assert(report.peakQueue <= report.maxQueue)
} finally { await context.close() }
