import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchExtensionContext, extensionWorker, waitForPageCondition } from './support/browser.mjs'
import { distDir, testResultsDir } from './support/paths.mjs'

// Isolated Chromium and synthetic OPFS files only. Never attach to the user's Chrome or VPN.
const resultDir = join(testResultsDir, 'jihua-upload')
await mkdir(resultDir, { recursive: true })
const report = { passed: false, isolated: true, realCustomerFiles: false, uploadRequests: 0, updates: 0, peakUploads: 0, cancellation: { passed: false } }
const numbers = Array.from({ length: 9 }, (_, index) => `20211000000${String(index).padStart(2, '0')}`)
const cancellationNumber = '2021100888888'
const cancellationFilename = `${cancellationNumber}-取消后恢复-递交合并档.pdf`
const records = new Map(numbers.map(number => [number, { ID: number, PATENT_NO: number, PATENT_NAME: '测试案件', IS_HAVE_GER: 'TRUE', KEEP: 'unchanged', attachments: {} }]))
records.set(cancellationNumber, { ID: cancellationNumber, PATENT_NO: cancellationNumber, PATENT_NAME: '取消回归案件', IS_HAVE_GER: 'TRUE', KEEP: 'unchanged', attachments: {} })
records.get(numbers[0]).attachments.patentRequestAppendixList = [{ ID: 'existing', APPENDIX_NAME: 'existing.pdf' }]
const missingNumber = '2021100999999'
const failNumber = numbers[8]
let failUpdate = true
let activeUploads = 0
let sequence = 0
let context
let app
let releaseHeldUpload
let resolveHeldUploadReached
let resolveHeldUploadFinished
const heldUploadGate = new Promise(resolve => { releaseHeldUpload = resolve })
const heldUploadReached = new Promise(resolve => { resolveHeldUploadReached = resolve })
const heldUploadFinished = new Promise(resolve => { resolveHeldUploadFinished = resolve })
let heldUploadActive = false
const uploadedNames = []
const updates = []
const filenames = numbers.map(number => `${number}-测试-递交合并档.pdf`)
filenames.push(`${numbers[1]}-名称-含连字符-新申请文档.pdf`, `${numbers[1]}-测试-没有对应的材料.pdf`, `${missingNumber}-未查到-递交合并档.pdf`)

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}

try {
  context = await launchExtensionContext(distDir, { acceptDownloads: true, viewport: { width: 1440, height: 1000 } })
  await context.addCookies([{ name: 'Admin-Token', value: 'isolated-e2e-session', domain: 'oa.jihualab.net', path: '/', secure: true }])
  await context.route('https://oa.jihualab.net/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (!url.pathname.startsWith('/prod-api/')) return route.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: '<title>季华测试平台</title><main>isolated OA fixture</main>' })
    assert.equal(request.headers().authorization, 'Bearer isolated-e2e-session')
    const path = url.pathname.slice('/prod-api'.length)
    if (path === '/getInfo') return json({ code: 200, user: { userId: 'fixture-user' } })
    if (path === '/conow/file/upload' || path === '/conow/file/uploadAndOfc') {
      report.uploadRequests++
      report.peakUploads = Math.max(report.peakUploads, ++activeUploads)
      const body = request.postDataBuffer().toString('utf8')
      const name = /filename="([^"]+)"/.exec(body)?.[1]
      assert.ok(name)
      assert.ok(body.includes('PAT_PATENT_PARAMETER'))
      assert.ok(body.includes('%PDF-1.7'))
      uploadedNames.push(name)
      const held = name === cancellationFilename
      try {
        if (held) {
          heldUploadActive = true
          resolveHeldUploadReached()
          await heldUploadGate
        } else {
          // Hold a complete upload window so source-page staging jitter cannot hide the six lanes.
          await new Promise(resolve => setTimeout(resolve, 1200))
        }
        const appendix = { ID: `attachment-${++sequence}`, APPENDIX_NAME: name, APPENDIX_URL: `/fixture/${sequence}` }
        return await json({ code: 200, data: path.endsWith('AndOfc') ? { appendixList: [appendix], IS_OFC_SUCCESS: false } : [appendix] })
      } finally {
        activeUploads--
        if (held) {
          heldUploadActive = false
          resolveHeldUploadFinished()
        }
      }
    }
    if (path === '/conow/pat/parameter/patent/update') {
      const body = request.postDataJSON()
      report.updates++
      updates.push(body)
      const record = records.get(body.patentParameter.ID)
      assert.equal(body.patentParameter.KEEP, 'unchanged')
      if (body.patentParameter.ID === failNumber && failUpdate) return json({ code: 500, msg: 'fixture association rejected' })
      for (const [key, ids] of Object.entries(body)) if (key.endsWith('AppendixList')) record.attachments[key] = ids.map(ID => ({ ID }))
      return json({ code: 200 })
    }
    if (/^\/conow\/pat\/parameter\/(INVENTION|UTILITY)$/.test(path)) {
      const number = url.searchParams.get('PATENT_NUM')
      assert.ok(number, 'Search must use PATENT_NUM')
      const record = records.get(number)
      return json({ code: 200, total: record ? 1 : 0, rows: record ? [{ ID: record.ID, PATENT_NO: record.PATENT_NO }] : [] })
    }
    if (/^\/conow\/pat\/parameter\/(INVENTION|UTILITY)\//.test(path)) {
      const record = records.get(decodeURIComponent(path.split('/').at(-1)))
      const { attachments, ...patentParameter } = record
      return json({ code: 200, data: { patentParameter, ...Object.fromEntries(Object.entries(attachments).map(([key, list]) => [`${key}Obj`, list])) } })
    }
    throw new Error(`Unexpected OA route: ${path}`)
  })
  const oa = await context.newPage()
  await oa.goto('https://oa.jihualab.net/patentParameter/invention')
  const worker = await extensionWorker(context)
  const extensionId = new URL(worker.url()).host
  app = await context.newPage()
  await app.goto(`chrome-extension://${extensionId}/app.html#/workflow`)
  await app.getByRole('button', { name: /计划实验室-文件导入/ }).click()
  assert.equal(new URL(app.url()).hash, '#/workflow', 'The importer belongs to the workflow view')
  await app.getByRole('button', { name: '添加文件夹', exact: true }).waitFor()
  await waitForPageCondition(app, () => ![...document.querySelectorAll('button')].find(node => node.textContent === '添加文件夹')?.disabled)
  await app.evaluate(async names => {
    const root = await navigator.storage.getDirectory()
    const fixture = await root.getDirectoryHandle('季华测试目录', { create: true })
    const child = await fixture.getDirectoryHandle('嵌套', { create: true })
    for (let index = 0; index < names.length; index++) {
      const handle = await (index % 2 ? child : fixture).getFileHandle(names[index], { create: true })
      const writer = await handle.createWritable()
      await writer.write('%PDF-1.7\nfixture content\n%%EOF')
      await writer.close()
    }
    for (const name of ['excluded.zip', 'excluded.xml', 'excluded.mal']) {
      const handle = await fixture.getFileHandle(name, { create: true })
      const writer = await handle.createWritable(); await writer.write('excluded'); await writer.close()
    }
    window.showDirectoryPicker = () => Promise.resolve(fixture)
    window.__fixtureReads = 0
    const original = FileSystemFileHandle.prototype.getFile
    FileSystemFileHandle.prototype.getFile = function () { window.__fixtureReads++; return original.call(this) }
  }, filenames)
  await app.getByRole('button', { name: '添加文件夹', exact: true }).click()
  await app.getByText(`已选 0 / ${filenames.length} 行`, { exact: true }).waitFor()
  assert.equal(await app.evaluate(() => window.__fixtureReads), 0, 'Inventory must never call getFile')
  report.inventory = { rows: filenames.length, ignoredExtensions: 3, fileReadsDuringScan: 0, nestedDirectories: true }
  await app.getByRole('button', { name: '全选筛选结果', exact: true }).click()
  await app.getByRole('button', { name: '回到工作流', exact: true }).click()
  await app.getByRole('button', { name: /计划实验室-文件导入/ }).click()
  await app.getByText(`已选 ${filenames.length} / ${filenames.length} 行`, { exact: true }).waitFor()
  assert.equal(await app.evaluate(() => window.__fixtureReads), 0, 'Returning to the workflow retains inventory without file reads')
  await app.getByRole('button', { name: '连接并检测登录', exact: true }).click()
  await app.locator('.jh-session-state.session-connected').waitFor()
  await app.getByRole('button', { name: '开始上传', exact: true }).click()
  await waitForPageCondition(app, () => document.querySelectorAll('.jh-badge[data-status="failed"]').length === 1 && ![...document.querySelectorAll('button')].some(node => node.textContent === '暂停上传'), null, { timeout: 90000 })
  assert.equal(report.peakUploads, 6)
  assert.ok(!uploadedNames.some(name => name.startsWith(numbers[0])), 'Existing category must be skipped')
  assert.equal(await app.locator('.jh-badge[data-status="already"]').count(), 1)
  assert.equal(await app.locator('.jh-badge[data-status="unmatched"]').count(), 2)
  const firstUploads = report.uploadRequests
  report.initialResults = { success: await app.locator('.jh-badge[data-status="success"]').count(), already: 1, unmatched: 2, failed: 1 }
  await app.screenshot({ path: join(resultDir, 'initial-results.png'), fullPage: true })
  // Reload proves real IndexedDB FileSystemHandles and uploaded IDs survive workbench refresh.
  await app.reload()
  await app.getByRole('button', { name: /计划实验室-文件导入/ }).click()
  await app.getByRole('button', { name: '连接并检测登录', exact: true }).click()
  await app.locator('.jh-session-state.session-connected').waitFor()
  failUpdate = false
  await app.getByRole('button', { name: /继续上传|开始上传/ }).click()
  await waitForPageCondition(app, () => !document.querySelector('.jh-badge[data-status="failed"]') && document.querySelectorAll('.jh-badge[data-status="success"]').length === 9, null, { timeout: 90000 })
  assert.equal(report.uploadRequests, firstUploads, 'Resume must reuse uploaded IDs without new multipart')
  const downloadEvent = app.waitForEvent('download')
  await app.getByRole('button', { name: '导出 CSV', exact: true }).click()
  const download = await downloadEvent
  const exportPath = join(resultDir, 'results.csv')
  await download.saveAs(exportPath)
  const csv = await readFile(exportPath, 'utf8')
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('fixture association rejected') === false, 'Successful retry clears obsolete errors')
  assert.ok(csv.includes('上传成功') && csv.includes('已经传过') && csv.includes('没匹配到'))
  assert.ok(updates.every(body => Array.isArray(body.fastCheckReqFixAppendixList)), 'Preserve unrendered attachment field')
  report.resume = { afterReload: true, extraUploads: report.uploadRequests - firstUploads, success: 9 }
  report.export = { file: 'results.csv', rowCount: filenames.length }
  await app.screenshot({ path: join(resultDir, 'final-results.png'), fullPage: true })
  await app.locator('.jh-file-table').scrollIntoViewIfNeeded()
  await app.screenshot({ path: join(resultDir, 'file-results.png'), fullPage: true })

  // Check the whole page at both target widths while the original result table is still present.
  const layoutEvidence = {}
  for (const width of [1440, 1100]) {
    await app.setViewportSize({ width, height: 1000 })
    await app.locator('.workspace').evaluate(node => { node.scrollTop = 0 })
    await app.waitForTimeout(100)
    const dimensions = await app.evaluate(() => {
      const root = document.documentElement
      const body = document.body
      const table = document.querySelector('.jh-table-wrap')
      const workspace = document.querySelector('.workspace')
      const state = document.querySelector('.jh-file-row .jh-badge')?.getBoundingClientRect()
      const tableBounds = table?.getBoundingClientRect()
      return {
        viewportWidth: root.clientWidth,
        pageScrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
        tableClientWidth: table?.clientWidth ?? 0,
        tableScrollWidth: table?.scrollWidth ?? 0,
        workspaceClientWidth: workspace?.clientWidth ?? 0,
        workspaceScrollWidth: workspace?.scrollWidth ?? 0,
        tableClientHeight: table?.clientHeight ?? 0,
        tableScrollHeight: table?.scrollHeight ?? 0,
        statusVisibleWithoutHorizontalScroll: Boolean(state && tableBounds && state.left >= tableBounds.left && state.right <= tableBounds.right)
      }
    })
    assert.ok(dimensions.pageScrollWidth <= dimensions.viewportWidth,
      `Page root must not overflow horizontally at ${width}px: ${JSON.stringify(dimensions)}`)
    assert.ok(dimensions.tableScrollWidth > dimensions.tableClientWidth,
      `The wide results table should retain its own local scroll area at ${width}px: ${JSON.stringify(dimensions)}`)
    assert.ok(dimensions.workspaceScrollWidth <= dimensions.workspaceClientWidth,
      `Workspace must not overflow horizontally at ${width}px: ${JSON.stringify(dimensions)}`)
    assert.ok(dimensions.tableClientHeight <= 600 && dimensions.tableScrollHeight > dimensions.tableClientHeight,
      'Long results should scroll inside the table and keep task controls above it')
    assert.ok(dimensions.statusVisibleWithoutHorizontalScroll, 'Row status must be visible beside the application number')
    layoutEvidence[width] = dimensions
    await app.screenshot({ path: join(resultDir, `layout-${width}.png`), fullPage: true })
  }
  report.layout = layoutEvidence
  await app.setViewportSize({ width: 1440, height: 1000 })

  // Keep the multipart route pending across cancellation, archiving, and blank-task creation.
  const uploadsBeforeCancellation = report.uploadRequests
  await app.getByRole('button', { name: '新建任务', exact: true }).click()
  const archiveDialog = app.getByRole('dialog')
  await archiveDialog.getByRole('button', { name: '保留并新建', exact: true }).click()
  await app.getByText('已选 0 / 0 行', { exact: true }).waitFor()
  await app.evaluate(async filename => {
    const root = await navigator.storage.getDirectory()
    const folder = await root.getDirectoryHandle('季华取消回归目录', { create: true })
    const handle = await folder.getFileHandle(filename, { create: true })
    const writer = await handle.createWritable()
    await writer.write('%PDF-1.7\nfixture cancellation content\n%%EOF')
    await writer.close()
    window.showDirectoryPicker = () => Promise.resolve(folder)
  }, cancellationFilename)
  await app.getByRole('button', { name: '添加文件夹', exact: true }).click()
  await app.getByText('已选 0 / 1 行', { exact: true }).waitFor()
  await app.getByRole('button', { name: '全选筛选结果', exact: true }).click()
  await app.getByText('已选 1 / 1 行', { exact: true }).waitFor()
  await app.getByRole('button', { name: '连接并检测登录', exact: true }).click()
  await app.locator('.jh-session-state.session-connected').waitFor()
  await app.getByRole('button', { name: '开始上传', exact: true }).click()
  await withTimeout(heldUploadReached, 30000, 'Synthetic cancellation multipart did not reach the held route')
  assert.equal(report.uploadRequests, uploadsBeforeCancellation + 1)

  const cancelStartedAt = Date.now()
  await app.getByRole('button', { name: '取消任务', exact: true }).click()
  await waitForPageCondition(app, () => document.querySelector('.jh-board .jh-task-status')?.textContent?.includes('已取消，记录已保留'), null, { timeout: 15000 })
  const cancelLatencyMs = Date.now() - cancelStartedAt
  assert.ok(cancelLatencyMs < 15000, `Cancel should settle while multipart is still held; took ${cancelLatencyMs}ms`)
  assert.equal(heldUploadActive, true, 'The synthetic multipart route must still be pending after cancellation')
  const controlsAvailable = await app.getByRole('button', { name: '新建任务', exact: true }).isEnabled()
    && await app.getByRole('button', { name: '添加文件夹', exact: true }).isEnabled()
  assert.ok(controlsAvailable, 'Task controls should be available promptly after cancellation')
  report.cancellation = {
    routeHeldThroughCancel: heldUploadActive,
    cancelLatencyMs,
    controlsAvailable,
    uploadsBefore: uploadsBeforeCancellation,
    uploadsAfterCancel: report.uploadRequests
  }

  await app.getByRole('button', { name: '新建任务', exact: true }).click()
  await app.getByRole('dialog').getByRole('button', { name: '保留并新建', exact: true }).click()
  await app.getByText('已选 0 / 0 行', { exact: true }).waitFor()
  releaseHeldUpload()
  await withTimeout(heldUploadFinished, 15000, 'Synthetic cancellation multipart did not finish after release')
  await app.waitForTimeout(250)
  const blankTaskAfterLateUpload = await app.locator('.jh-file-row').count() === 0
    && await app.getByText('已选 0 / 0 行', { exact: true }).count() === 1
  assert.ok(blankTaskAfterLateUpload, 'A late original upload must not populate or replace the current blank task')

  await app.locator('.jh-history-select .theme-select-trigger').click()
  await app.getByRole('option', { name: /1 个文件.*已取消/ }).click()
  await app.getByRole('button', { name: '恢复任务', exact: true }).click()
  await app.locator('.jh-file-row').first().waitFor()
  assert.equal(await app.locator('.jh-file-row').count(), 1, 'History should restore the original one-row canceled task')
  assert.ok(await app.locator('.jh-file-row').innerText().then(value => value.includes(cancellationNumber)))
  await app.getByRole('button', { name: '连接并检测登录', exact: true }).click()
  await app.locator('.jh-session-state.session-connected').waitFor()
  const uploadsBeforeReceiptResume = report.uploadRequests
  const updatesBeforeReceiptResume = report.updates
  await app.getByRole('button', { name: '继续上传', exact: true }).click()
  await waitForPageCondition(app, () => document.querySelectorAll('.jh-badge[data-status="success"]').length === 1, null, { timeout: 90000 })
  assert.equal(report.uploadRequests, uploadsBeforeReceiptResume, 'Resume must consume the retained MAIN receipt without another multipart upload')
  const cancellationUpdates = updates.slice(updatesBeforeReceiptResume)
    .filter(body => body.patentParameter?.ID === cancellationNumber)
  assert.equal(cancellationUpdates.length, 1, 'The retained receipt should be associated exactly once')
  const associated = Object.values(records.get(cancellationNumber).attachments).some(items => items.length > 0)
  assert.ok(associated, 'The canceled task receipt should be attached to the synthetic patent record')
  report.cancellation = {
    ...report.cancellation,
    blankTaskAfterLateUpload,
    routeReleasedAfterNewTask: true,
    restoredRows: 1,
    resumedMultipartDelta: report.uploadRequests - uploadsBeforeReceiptResume,
    associationUpdates: cancellationUpdates.length,
    associated
  }
  report.cancellation.passed = true
  report.passed = true
} catch (error) {
  report.error = error.stack ?? String(error)
  if (app) await app.screenshot({ path: join(resultDir, 'failure.png'), fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  releaseHeldUpload?.()
  if (heldUploadActive) await withTimeout(heldUploadFinished, 3000, 'Releasing the held upload during cleanup timed out').catch(() => {})
  if (context) await context.close()
  await writeFile(join(resultDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
