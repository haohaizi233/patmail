import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchExtensionContext, extensionWorker, waitForPageCondition } from './support/browser.mjs'
import { distDir, reportsDir } from './support/paths.mjs'

// Isolated Chromium and synthetic OPFS files only. Never attach to the user's Chrome or VPN.
const resultDir = join(reportsDir, 'jihua-upload')
await mkdir(resultDir, { recursive: true })
const report = {
  passed: false,
  isolated: true,
  realCustomerFiles: false,
  uploadRequests: 0,
  updates: 0,
  peakUploads: 0,
  liveRequeue: { passed: false },
  cancellation: { passed: false },
  automaticRecovery: { passed: false },
}
const numbers = Array.from({ length: 9 }, (_, index) => `20211000000${String(index).padStart(2, '0')}`)
const recoveryNumbers = Array.from({ length: 7 }, (_, index) => `2021100777${String(index).padStart(3, '0')}`)
const cancellationNumber = '2021100888888'
const isolationNumber = '2021100666666'
const isolationFilenames = ['A有效文件', 'B无效文件', 'C有效文件'].map(
  name => `${isolationNumber}-${name}-首次检索报告文件.pdf`,
)
const unknownSiblingNumber = '2021100555555'
const unknownSiblingFilenames = ['A历史未知回执', 'B有效文件', 'C有效文件'].map(
  name => `${unknownSiblingNumber}-${name}-首次检索报告文件.pdf`,
)
const cancellationFilename = `${cancellationNumber}-取消后恢复-递交合并档.pdf`
const liveRequeueFilename = `${numbers[7]}-测试-递交合并档.pdf`
const recoveryFilenames = recoveryNumbers.map(number => `${number}-测试-递交合并档.pdf`)
// The importer presents and dispatches these application numbers in descending order.
// Make the first visible row fail so five other uploads and the seventh queued row remain behind it.
const recoveryFailNumber = recoveryNumbers.at(-1)
const recoveryFailFilename = recoveryFilenames.at(-1)
const recoveryLastFilename = recoveryFilenames[0]
const records = new Map(
  numbers.map(number => [
    number,
    { ID: number, PATENT_NO: number, PATENT_NAME: '测试案件', IS_HAVE_GER: 'TRUE', KEEP: 'unchanged', attachments: {} },
  ]),
)
for (const number of recoveryNumbers)
  records.set(number, {
    ID: number,
    PATENT_NO: number,
    PATENT_NAME: '自动恢复回归案件',
    IS_HAVE_GER: 'TRUE',
    KEEP: 'unchanged',
    attachments: {},
  })
records.set(cancellationNumber, {
  ID: cancellationNumber,
  PATENT_NO: cancellationNumber,
  PATENT_NAME: '取消回归案件',
  IS_HAVE_GER: 'TRUE',
  KEEP: 'unchanged',
  attachments: {},
})
records.set(isolationNumber, {
  ID: isolationNumber,
  PATENT_NO: isolationNumber,
  PATENT_NAME: '本地错误隔离案件',
  IS_HAVE_GER: 'TRUE',
  KEEP: 'unchanged',
  attachments: {},
})
records.set(unknownSiblingNumber, {
  ID: unknownSiblingNumber,
  PATENT_NO: unknownSiblingNumber,
  PATENT_NAME: '历史回执隔离案件',
  IS_HAVE_GER: 'TRUE',
  KEEP: 'unchanged',
  attachments: {},
})
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
const heldUploadGate = new Promise(resolve => {
  releaseHeldUpload = resolve
})
const heldUploadReached = new Promise(resolve => {
  resolveHeldUploadReached = resolve
})
const heldUploadFinished = new Promise(resolve => {
  resolveHeldUploadFinished = resolve
})
let heldUploadActive = false
let releaseLiveRequeueUpload
let resolveLiveRequeueUploadReached
let resolveLiveRequeueUploadFinished
let resolveSecondFailedAssociation
const liveRequeueUploadGate = new Promise(resolve => {
  releaseLiveRequeueUpload = resolve
})
const liveRequeueUploadReached = new Promise(resolve => {
  resolveLiveRequeueUploadReached = resolve
})
const liveRequeueUploadFinished = new Promise(resolve => {
  resolveLiveRequeueUploadFinished = resolve
})
const secondFailedAssociation = new Promise(resolve => {
  resolveSecondFailedAssociation = resolve
})
let liveRequeueGateUsed = false
let liveRequeueUploadActive = false
let failAssociationAttempts = 0
let recoveryScenarioActive = false
let recoveryUploadStarts = 0
let recoveryPeakUploads = 0
let recovery524Responses = 0
let recovery524ResponseAt = 0
let recoveryLastUploadStartedAt = 0
const recoveryInitialBatchFiles = []
const recoveryProbeTimes = []
let resolveRecoveryFirstSixUploads
let resolveRecovery524Response
const recoveryFirstSixUploads = new Promise(resolve => {
  resolveRecoveryFirstSixUploads = resolve
})
const recovery524Response = new Promise(resolve => {
  resolveRecovery524Response = resolve
})
const uploadedNames = []
const updates = []
const filenames = numbers.map(number => `${number}-测试-递交合并档.pdf`)
const signedNoticeFilename = `${numbers[2]}-测试-专利申请受理通知书(签章).pdf`
const combinedNoticeFilename = `${numbers[3]}-测试-发明专利申请公布及进入实质审查阶段通知书.pdf`
filenames[2] = signedNoticeFilename
filenames[3] = combinedNoticeFilename
filenames.push(
  `${numbers[1]}-名称-含连字符-新申请文档.pdf`,
  `${numbers[1]}-测试-没有对应的材料.pdf`,
  `${missingNumber}-未查到-递交合并档.pdf`,
)

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

try {
  context = await launchExtensionContext(distDir, { acceptDownloads: true, viewport: { width: 1440, height: 1000 } })
  await context.addCookies([
    { name: 'Admin-Token', value: 'isolated-e2e-session', domain: 'oa.jihualab.net', path: '/', secure: true },
  ])
  await context.route('https://oa.jihualab.net/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (!url.pathname.startsWith('/prod-api/'))
      return route.fulfill({
        status: 200,
        contentType: 'text/html;charset=utf-8',
        body: '<title>季华测试平台</title><main>isolated OA fixture</main>',
      })
    assert.equal(request.headers().authorization, 'Bearer isolated-e2e-session')
    const path = url.pathname.slice('/prod-api'.length)
    if (path === '/getInfo') return json({ code: 200, user: { userId: 'fixture-user' } })
    if (path === '/conow/file/upload' || path === '/conow/file/uploadAndOfc') {
      report.uploadRequests++
      report.peakUploads = Math.max(report.peakUploads, ++activeUploads)
      if (recoveryScenarioActive) recoveryPeakUploads = Math.max(recoveryPeakUploads, activeUploads)
      const body = request.postDataBuffer().toString('utf8')
      const name = /filename="([^"]+)"/.exec(body)?.[1]
      assert.ok(name)
      assert.ok(body.includes('PAT_PATENT_PARAMETER'))
      assert.ok(body.includes('%PDF-1.7'))
      uploadedNames.push(name)
      if (recoveryScenarioActive) {
        recoveryUploadStarts++
        if (recoveryUploadStarts <= 6) recoveryInitialBatchFiles.push(name)
        if (recoveryUploadStarts === 6) resolveRecoveryFirstSixUploads()
        if (name === recoveryLastFilename) recoveryLastUploadStartedAt = Date.now()
      }
      const held = name === cancellationFilename
      const liveRequeueHeld = name === liveRequeueFilename && !liveRequeueGateUsed
      if (liveRequeueHeld) liveRequeueGateUsed = true
      try {
        if (held) {
          heldUploadActive = true
          resolveHeldUploadReached()
          await heldUploadGate
        } else if (liveRequeueHeld) {
          liveRequeueUploadActive = true
          resolveLiveRequeueUploadReached()
          await liveRequeueUploadGate
        } else if (recoveryScenarioActive && name === recoveryFailFilename) {
          await withTimeout(recoveryFirstSixUploads, 15000, 'The first six synthetic recovery uploads did not overlap')
          recovery524Responses++
          recovery524ResponseAt = Date.now()
          resolveRecovery524Response(recovery524ResponseAt)
          return await route.fulfill({
            status: 524,
            contentType: 'text/html;charset=utf-8',
            body: '<html><title>fixture 524</title><body>fixture gateway timeout</body></html>',
          })
        } else {
          // Hold a complete upload window so source-page staging jitter cannot hide the six lanes.
          await new Promise(resolve => setTimeout(resolve, 1200))
        }
        const appendix = { ID: `attachment-${++sequence}`, APPENDIX_NAME: name, APPENDIX_URL: `/fixture/${sequence}` }
        return await json({
          code: 200,
          data: path.endsWith('AndOfc') ? { appendixList: [appendix], IS_OFC_SUCCESS: false } : [appendix],
        })
      } finally {
        activeUploads--
        if (held) {
          heldUploadActive = false
          resolveHeldUploadFinished()
        }
        if (liveRequeueHeld) {
          liveRequeueUploadActive = false
          resolveLiveRequeueUploadFinished()
        }
      }
    }
    if (path === '/conow/pat/parameter/patent/update') {
      const body = request.postDataJSON()
      report.updates++
      updates.push(body)
      const record = records.get(body.patentParameter.ID)
      assert.equal(body.patentParameter.KEEP, 'unchanged')
      if (body.patentParameter.ID === failNumber) {
        failAssociationAttempts++
        if (failAssociationAttempts === 2) resolveSecondFailedAssociation()
      }
      if (body.patentParameter.ID === failNumber && failUpdate)
        return json({ code: 500, msg: 'fixture association rejected' })
      for (const [key, ids] of Object.entries(body))
        if (key.endsWith('AppendixList')) record.attachments[key] = ids.map(ID => ({ ID }))
      return json({ code: 200 })
    }
    if (/^\/conow\/pat\/parameter\/(INVENTION|UTILITY)$/.test(path)) {
      const number = url.searchParams.get('PATENT_NUM')
      assert.ok(number, 'Search must use PATENT_NUM')
      if (recoveryScenarioActive && number === recoveryFailNumber) recoveryProbeTimes.push(Date.now())
      const record = records.get(number)
      return json({
        code: 200,
        total: record ? 1 : 0,
        rows: record ? [{ ID: record.ID, PATENT_NO: record.PATENT_NO }] : [],
      })
    }
    if (/^\/conow\/pat\/parameter\/(INVENTION|UTILITY)\//.test(path)) {
      const record = records.get(decodeURIComponent(path.split('/').at(-1)))
      const { attachments, ...patentParameter } = record
      return json({
        code: 200,
        data: {
          patentParameter,
          ...Object.fromEntries(Object.entries(attachments).map(([key, list]) => [`${key}Obj`, list])),
        },
      })
    }
    throw new Error(`Unexpected OA route: ${path}`)
  })
  const oa = await context.newPage()
  await oa.goto('https://oa.jihualab.net/patentParameter/invention')
  const worker = await extensionWorker(context)
  const extensionId = new URL(worker.url()).host
  app = await context.newPage()
  await app.goto(`chrome-extension://${extensionId}/app.html#/workflow`)
  await app.locator('.jihua-upload-card .sea-open').click()
  await app.getByRole('tab', { name: '流程说明', exact: true }).waitFor()
  assert.equal(await app.getByRole('tab', { name: '流程说明', exact: true }).getAttribute('aria-selected'), 'true')
  const guideSource = await readFile(new URL('../../docs/workflows/季华实验室-文件导入.md', import.meta.url), 'utf8')
  const guideDiagrams = (guideSource.match(/^```mermaid$/gm) ?? []).length
  await app.waitForFunction(
    count => document.querySelectorAll('.workflow-guide .mermaid-content > svg').length === count,
    guideDiagrams,
  )
  assert.ok(guideDiagrams >= 3)
  assert.equal(await app.locator('.workflow-guide .mermaid-error').count(), 0)
  assert.equal(
    await app.getByRole('heading', { name: '季华实验室-文件导入', exact: true }).count(),
    1,
    'One shared page title must own both views',
  )
  await app.screenshot({ path: join(resultDir, 'workflow-guide.png') })
  await app.getByRole('tab', { name: '开始使用', exact: true }).click()
  assert.equal(new URL(app.url()).hash, '#/workflow', 'The importer belongs to the workflow view')
  await app.getByRole('button', { name: '添加文件夹', exact: true }).waitFor()
  await waitForPageCondition(
    app,
    () => ![...document.querySelectorAll('button')].find(node => node.textContent === '添加文件夹')?.disabled,
  )
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
      const writer = await handle.createWritable()
      await writer.write('excluded')
      await writer.close()
    }
    window.showDirectoryPicker = () => Promise.resolve(fixture)
    window.__fixtureReads = 0
    const original = FileSystemFileHandle.prototype.getFile
    FileSystemFileHandle.prototype.getFile = function () {
      window.__fixtureReads++
      return original.call(this)
    }
  }, filenames)
  await app.getByRole('button', { name: '添加文件夹', exact: true }).click()
  await app.getByText(`已选 0 / ${filenames.length} 行`, { exact: true }).waitFor()
  assert.equal(await app.evaluate(() => window.__fixtureReads), 0, 'Inventory must never call getFile')
  report.inventory = { rows: filenames.length, ignoredExtensions: 3, fileReadsDuringScan: 0, nestedDirectories: true }
  await app.getByRole('button', { name: '全选筛选结果', exact: true }).click()
  await app.getByRole('tab', { name: '流程说明', exact: true }).click()
  await app.getByRole('tab', { name: '开始使用', exact: true }).click()
  await app.getByText(`已选 ${filenames.length} / ${filenames.length} 行`, { exact: true }).waitFor()
  assert.equal(
    await app.evaluate(() => window.__fixtureReads),
    0,
    'Switching views must preserve inventory without reading files',
  )
  await app.getByRole('button', { name: '回到工作流', exact: true }).click()
  await app.locator('.jihua-upload-card').getByRole('button', { name: '开始使用', exact: true }).click()
  await app.getByText(`已选 ${filenames.length} / ${filenames.length} 行`, { exact: true }).waitFor()
  assert.equal(
    await app.evaluate(() => window.__fixtureReads),
    0,
    'Returning to the workflow retains inventory without file reads',
  )
  await app.getByRole('button', { name: '连接并检测登录', exact: true }).click()
  await app.locator('.jh-session-state.session-connected').waitFor()
  await app.getByRole('button', { name: '开始上传', exact: true }).click()
  await withTimeout(
    liveRequeueUploadReached,
    30000,
    'The first multipart for the live-requeue fixture did not reach its held route',
  )
  const failRow = app.locator('.jh-file-row').filter({ hasText: failNumber })
  await failRow.locator('.jh-badge[data-status="failed"]').waitFor({ timeout: 30000 })
  assert.equal(liveRequeueUploadActive, true, 'A different upload lane must remain in flight before manual requeue')
  await app.getByRole('tab', { name: '流程说明', exact: true }).click()
  assert.equal(liveRequeueUploadActive, true, 'Guide view must not cancel an active upload')
  await app.getByRole('tab', { name: '开始使用', exact: true }).click()
  report.workflowViews = { passed: true, guideDiagrams, sharedTitle: true, preservesSelectionAndActiveUpload: true }
  assert.equal(
    await app.getByRole('button', { name: '暂停上传', exact: true }).count(),
    1,
    'The original pipeline must still be running when the failed row is requeued',
  )
  assert.equal(failAssociationAttempts, 1, 'The target row must have failed its first association attempt')
  assert.equal(
    uploadedNames.filter(name => name === `${failNumber}-测试-递交合并档.pdf`).length,
    1,
    'The target row must already have exactly one multipart upload',
  )
  await failRow.locator('button.jh-row-requeue').click()
  await app.getByText(/已将 1 行重新入队/).waitFor({ timeout: 30000 })
  await withTimeout(
    secondFailedAssociation,
    30000,
    'Requeued row did not attempt its second association while the pipeline was active',
  )
  await waitForPageCondition(
    app,
    number => {
      const row = [...document.querySelectorAll('.jh-file-row')].find(node => node.textContent?.includes(number))
      return row?.querySelector('.jh-badge[data-status="failed"]')
    },
    failNumber,
    { timeout: 30000 },
  )
  assert.equal(liveRequeueUploadActive, true, 'The independent upload must still be held after the row requeue')
  assert.equal(failAssociationAttempts, 2, 'Manual requeue must retry the association once')
  assert.equal(
    uploadedNames.filter(name => name === `${failNumber}-测试-递交合并档.pdf`).length,
    1,
    'Manual requeue must reuse the existing uploaded attachment ID without another multipart upload',
  )
  const failedRowUpdates = updates.filter(body => body.patentParameter?.ID === failNumber)
  const attachmentLists = body =>
    Object.fromEntries(
      Object.entries(body)
        .filter(([key, value]) => key.endsWith('AppendixList') && Array.isArray(value))
        .map(([key, value]) => [key, [...value]]),
    )
  assert.equal(
    failedRowUpdates.length,
    2,
    'The target record must have exactly two failed association attempts before release',
  )
  assert.ok(
    Object.values(attachmentLists(failedRowUpdates[0])).some(ids => ids.length > 0),
    'The first failed association must carry the uploaded attachment ID',
  )
  assert.deepEqual(
    attachmentLists(failedRowUpdates[1]),
    attachmentLists(failedRowUpdates[0]),
    'Manual requeue must reuse the same uploaded attachment ID',
  )
  const pipelineStillRunning = (await app.getByRole('button', { name: '暂停上传', exact: true }).count()) === 1
  assert.ok(pipelineStillRunning, 'The pipeline must remain running after the live requeue')
  report.liveRequeue = {
    whilePipelineRunning: true,
    independentUploadHeld: liveRequeueUploadActive,
    failedRow: failNumber,
    associationAttempts: failAssociationAttempts,
    multipartUploadsForRow: uploadedNames.filter(name => name === `${failNumber}-测试-递交合并档.pdf`).length,
    pipelineStillRunning,
    sameAttachmentIdsReused: true,
    passed: true,
  }
  releaseLiveRequeueUpload()
  await withTimeout(liveRequeueUploadFinished, 15000, 'Held live-requeue upload did not finish after release')
  await waitForPageCondition(
    app,
    () =>
      document.querySelectorAll('.jh-badge[data-status="failed"]').length === 1 &&
      ![...document.querySelectorAll('button')].some(node => node.textContent === '暂停上传'),
    null,
    { timeout: 90000 },
  )
  assert.equal(report.peakUploads, 6)
  assert.equal(await app.locator('.jh-badge[data-status="success"]').count(), 8)
  assert.ok(!uploadedNames.some(name => name.startsWith(numbers[0])), 'Existing category must be skipped')
  assert.equal(await app.locator('.jh-badge[data-status="already"]').count(), 1)
  assert.equal(await app.locator('.jh-badge[data-status="unmatched"]').count(), 2)
  assert.equal(
    records.get(numbers[2]).attachments.acptNoticeAppendixList.length,
    1,
    'Signed receipt notice must use the acceptance field',
  )
  assert.equal(
    records.get(numbers[3]).attachments.exaStageNoticeAppendixList.length,
    1,
    'Combined notice must use the user-selected examination-stage field',
  )
  assert.equal(
    records.get(numbers[3]).attachments.subExamPhaseNoticeAppendixList?.length ?? 0,
    0,
    'Combined notice must not also enter the publication field',
  )
  report.noticeAliases = { signedAcceptance: true, combinedExaminationStage: true, combinedPublicationFieldEmpty: true }
  const firstUploads = report.uploadRequests
  report.initialResults = {
    success: await app.locator('.jh-badge[data-status="success"]').count(),
    already: 1,
    unmatched: 2,
    failed: 1,
  }
  await app.screenshot({ path: join(resultDir, 'initial-results.png'), fullPage: true })
  // Reload proves real IndexedDB FileSystemHandles and uploaded IDs survive workbench refresh.
  await app.reload()
  await app.locator('.jihua-upload-card').getByRole('button', { name: '开始使用', exact: true }).click()
  await app.getByRole('button', { name: '连接并检测登录', exact: true }).click()
  await app.locator('.jh-session-state.session-connected').waitFor()
  failUpdate = false
  await app.getByRole('button', { name: /继续上传|开始上传/ }).click()
  await waitForPageCondition(
    app,
    () =>
      !document.querySelector('.jh-badge[data-status="failed"]') &&
      document.querySelectorAll('.jh-badge[data-status="success"]').length === 9,
    null,
    { timeout: 90000 },
  )
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
  assert.ok(
    updates.every(body => Array.isArray(body.fastCheckReqFixAppendixList)),
    'Preserve unrendered attachment field',
  )
  report.resume = { afterReload: true, extraUploads: report.uploadRequests - firstUploads, success: 9 }
  report.export = { file: 'results.csv', rowCount: filenames.length }
  await app.screenshot({ path: join(resultDir, 'final-results.png'), fullPage: true })
  await app.locator('.jh-file-table').scrollIntoViewIfNeeded()
  await app.screenshot({ path: join(resultDir, 'file-results.png'), fullPage: true })

  // Check the whole page at both target widths while the original result table is still present.
  const layoutEvidence = {}
  for (const width of [1440, 1100]) {
    await app.setViewportSize({ width, height: 1000 })
    await app.locator('.workspace').evaluate(node => {
      node.scrollTop = 0
    })
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
        statusVisibleWithoutHorizontalScroll: Boolean(
          state && tableBounds && state.left >= tableBounds.left && state.right <= tableBounds.right,
        ),
      }
    })
    assert.ok(
      dimensions.pageScrollWidth <= dimensions.viewportWidth,
      `Page root must not overflow horizontally at ${width}px: ${JSON.stringify(dimensions)}`,
    )
    assert.ok(
      dimensions.tableScrollWidth > dimensions.tableClientWidth,
      `The wide results table should retain its own local scroll area at ${width}px: ${JSON.stringify(dimensions)}`,
    )
    assert.ok(
      dimensions.workspaceScrollWidth <= dimensions.workspaceClientWidth,
      `Workspace must not overflow horizontally at ${width}px: ${JSON.stringify(dimensions)}`,
    )
    assert.ok(
      dimensions.tableClientHeight <= 600 && dimensions.tableScrollHeight > dimensions.tableClientHeight,
      'Long results should scroll inside the table and keep task controls above it',
    )
    assert.ok(
      dimensions.statusVisibleWithoutHorizontalScroll,
      'Row status must be visible beside the application number',
    )
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
  await waitForPageCondition(
    app,
    () => document.querySelector('.jh-board .jh-task-status')?.textContent?.includes('已取消，记录已保留'),
    null,
    { timeout: 15000 },
  )
  await waitForPageCondition(
    app,
    () =>
      ['新建任务', '添加文件夹'].every(label =>
        [...document.querySelectorAll('button')].some(node => node.textContent?.trim() === label && !node.disabled),
      ),
    null,
    { timeout: 15000 },
  )
  const cancelLatencyMs = Date.now() - cancelStartedAt
  assert.ok(cancelLatencyMs < 15000, `Cancel should settle while multipart is still held; took ${cancelLatencyMs}ms`)
  assert.equal(heldUploadActive, true, 'The synthetic multipart route must still be pending after cancellation')
  const controlsAvailable =
    (await app.getByRole('button', { name: '新建任务', exact: true }).isEnabled()) &&
    (await app.getByRole('button', { name: '添加文件夹', exact: true }).isEnabled())
  assert.ok(controlsAvailable, 'Task controls should be available promptly after cancellation')
  report.cancellation = {
    routeHeldThroughCancel: heldUploadActive,
    cancelLatencyMs,
    controlsAvailable,
    uploadsBefore: uploadsBeforeCancellation,
    uploadsAfterCancel: report.uploadRequests,
  }

  await app.getByRole('button', { name: '新建任务', exact: true }).click()
  await app.getByRole('dialog').getByRole('button', { name: '保留并新建', exact: true }).click()
  await app.getByText('已选 0 / 0 行', { exact: true }).waitFor()
  releaseHeldUpload()
  await withTimeout(heldUploadFinished, 15000, 'Synthetic cancellation multipart did not finish after release')
  await app.waitForTimeout(250)
  const blankTaskAfterLateUpload =
    (await app.locator('.jh-file-row').count()) === 0 &&
    (await app.getByText('已选 0 / 0 行', { exact: true }).count()) === 1
  assert.ok(blankTaskAfterLateUpload, 'A late original upload must not populate or replace the current blank task')

  const readsBeforeRescan = await app.evaluate(() => window.__fixtureReads)
  await app.getByRole('button', { name: '添加文件夹', exact: true }).click()
  await app.getByText('已选 0 / 1 行', { exact: true }).waitFor()
  assert.ok(
    (await app.locator('.jh-file-row').innerText()).includes('回执待确认'),
    'A new task scanning the same directory must inherit the original sent intent',
  )
  assert.equal(
    await app.locator('.jh-file-row .theme-select-trigger').isDisabled(),
    true,
    'The inherited sent material must remain locked until its receipt is reconciled',
  )
  assert.equal(
    await app.evaluate(() => window.__fixtureReads),
    readsBeforeRescan,
    'Cross-task upload-state recovery must not read file contents',
  )
  report.cancellation.sameFolderIntentRetained = true

  await app.locator('.jh-history-select .theme-select-trigger').click()
  await app.getByRole('option', { name: /1 个文件.*已取消/ }).click()
  await app.getByRole('button', { name: '恢复任务', exact: true }).click()
  await app.locator('.jh-file-row').first().waitFor()
  assert.equal(
    await app.locator('.jh-file-row').count(),
    1,
    'History should restore the original one-row canceled task',
  )
  assert.ok(
    await app
      .locator('.jh-file-row')
      .innerText()
      .then(value => value.includes(cancellationNumber)),
  )
  await app.getByRole('button', { name: '连接并检测登录', exact: true }).click()
  await app.locator('.jh-session-state.session-connected').waitFor()
  const uploadsBeforeReceiptResume = report.uploadRequests
  const updatesBeforeReceiptResume = report.updates
  await app.getByRole('button', { name: '继续上传', exact: true }).click()
  await waitForPageCondition(
    app,
    () => document.querySelectorAll('.jh-badge[data-status="success"]').length === 1,
    null,
    { timeout: 90000 },
  )
  assert.equal(
    report.uploadRequests,
    uploadsBeforeReceiptResume,
    'Resume must consume the retained MAIN receipt without another multipart upload',
  )
  const cancellationUpdates = updates
    .slice(updatesBeforeReceiptResume)
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
    associated,
  }
  report.cancellation.passed = true
  await waitForPageCondition(
    app,
    () => {
      const status = document.querySelector('.jh-board .jh-task-status')?.textContent ?? ''
      return (
        status.includes('处理结束') &&
        ![...document.querySelectorAll('button')].some(node => node.textContent?.trim() === '暂停上传')
      )
    },
    null,
    { timeout: 15000 },
  )

  // A synthetic 524 should trigger safe recovery, then drain the seventh queued application automatically.
  await app.getByRole('button', { name: '新建任务', exact: true }).click()
  await app.getByRole('dialog').getByRole('button', { name: '保留并新建', exact: true }).click()
  await app.getByText('已选 0 / 0 行', { exact: true }).waitFor()
  await app.evaluate(async names => {
    const root = await navigator.storage.getDirectory()
    const folder = await root.getDirectoryHandle('季华自动恢复回归目录', { create: true })
    for (const name of names) {
      const handle = await folder.getFileHandle(name, { create: true })
      const writer = await handle.createWritable()
      await writer.write('%PDF-1.7\nfixture automatic recovery content\n%%EOF')
      await writer.close()
    }
    window.showDirectoryPicker = () => Promise.resolve(folder)
  }, recoveryFilenames)
  await app.getByRole('button', { name: '添加文件夹', exact: true }).click()
  await app.getByText(`已选 0 / ${recoveryFilenames.length} 行`, { exact: true }).waitFor()
  await app.getByRole('button', { name: '全选筛选结果', exact: true }).click()
  await app.getByText(`已选 ${recoveryFilenames.length} / ${recoveryFilenames.length} 行`, { exact: true }).waitFor()
  await app.getByRole('button', { name: '连接并检测登录', exact: true }).click()
  await app.locator('.jh-session-state.session-connected').waitFor()
  assert.equal(activeUploads, 0, 'Automatic recovery fixture must start with no uploads from the previous task')
  recoveryScenarioActive = true
  await app.getByRole('button', { name: '开始上传', exact: true }).click()
  await withTimeout(recoveryFirstSixUploads, 30000, 'The first six automatic-recovery uploads did not start')
  assert.equal(recoveryUploadStarts, 6, 'Exactly six application uploads should start before the seventh is dispatched')
  assert.equal(recoveryInitialBatchFiles.length, 6)
  assert.equal(
    new Set(recoveryInitialBatchFiles).size,
    6,
    'The initial six upload lanes must each handle a distinct application',
  )
  assert.ok(
    recoveryInitialBatchFiles.includes(recoveryFailFilename),
    'The 524 row must be part of the initial six-lane batch',
  )
  assert.equal(recoveryPeakUploads, 6, 'The isolated upload pipeline should reach six active lanes')
  await withTimeout(recovery524Response, 15000, 'The isolated upload fixture did not return its synthetic HTTP 524')
  assert.equal(recovery524Responses, 1)
  assert.equal(recoveryUploadStarts, 6, 'The seventh upload must wait during 524 recovery backoff')
  await app.getByText('正在自动恢复', { exact: false }).waitFor({ state: 'visible', timeout: 15000 })
  const cancelEnabledDuringRecovery = await app.getByRole('button', { name: '取消任务', exact: true }).isEnabled()
  assert.ok(cancelEnabledDuringRecovery, 'Cancellation must remain available during automatic recovery')

  const unknownUploadRow = app.locator('.jh-file-row').filter({ hasText: recoveryFailNumber })
  await waitForPageCondition(
    app,
    failureNumber => {
      const row = [...document.querySelectorAll('.jh-file-row')].find(node => node.textContent?.includes(failureNumber))
      return row?.querySelector('.jh-badge[data-status="verifying"]')
    },
    recoveryFailNumber,
    { timeout: 90000 },
  )
  await waitForPageCondition(
    app,
    () => {
      const taskStatus = document.querySelector('.jh-task-status')?.textContent ?? ''
      const successRows = document.querySelectorAll('.jh-badge[data-status="success"]').length
      const continueButton = [...document.querySelectorAll('button')].some(
        node => node.textContent?.trim() === '继续上传',
      )
      return (
        successRows === 6 &&
        taskStatus.includes('有上传失败') &&
        continueButton &&
        ![...document.querySelectorAll('button')].some(node => node.textContent?.trim() === '暂停上传')
      )
    },
    null,
    { timeout: 90000 },
  )
  await unknownUploadRow.locator('.jh-badge[data-status="verifying"]').waitFor()
  assert.ok(
    (await unknownUploadRow.innerText()).includes('回执待确认'),
    'The sent 524 request must remain an unknown receipt for manual review',
  )
  assert.equal(
    await app.getByRole('button', { name: '上传失败 1 行', exact: true }).count(),
    1,
    'The uncertain sent row must remain failed after automatic recovery',
  )
  const recoveredLastRow = app.locator('.jh-file-row').filter({ hasText: recoveryLastFilename })
  await recoveredLastRow.locator('.jh-badge[data-status="success"]').waitFor({ timeout: 90000 })
  const safeProbesAfter524 = recoveryProbeTimes.filter(timestamp => timestamp > recovery524ResponseAt)
  assert.ok(
    safeProbesAfter524.length >= 1,
    'Automatic recovery must perform a real safe PATENT_NUM GET probe after the HTTP 524',
  )
  assert.ok(
    recoveryLastUploadStartedAt > safeProbesAfter524[0],
    'The seventh queued application must start only after the safe GET probe succeeds',
  )
  assert.ok(
    recoveryLastUploadStartedAt - recovery524ResponseAt >= 2500,
    'The seventh queued application must wait through the automatic recovery backoff',
  )
  assert.equal(recoveryUploadStarts, 7, 'Automatic recovery should dispatch the one queued seventh application')
  assert.equal(
    uploadedNames.filter(name => name === recoveryFailFilename).length,
    1,
    'The HTTP 524 multipart request must not be replayed automatically',
  )
  assert.equal(recoveryPeakUploads, 6, 'Automatic recovery must preserve the six-upload concurrency limit')
  assert.equal(report.peakUploads, 6)
  report.automaticRecovery = {
    passed: true,
    syntheticHttp524HtmlResponses: recovery524Responses,
    initialConcurrentUploads: recoveryInitialBatchFiles.length,
    safeGetProbesAfter524: safeProbesAfter524.length,
    seventhUploadDelayMs: recoveryLastUploadStartedAt - recovery524ResponseAt,
    seventhStartedAfterProbe: true,
    totalUploadStarts: recoveryUploadStarts,
    failedFilenameMultipartCount: uploadedNames.filter(name => name === recoveryFailFilename).length,
    successRows: 6,
    failedUnknownRows: 1,
    lastQueuedRowSucceeded: true,
    maxConcurrentUploads: recoveryPeakUploads,
    cancelEnabledDuringRecovery,
    continuedWithoutManualResume: true,
  }
  recoveryScenarioActive = false
  // One malformed source file must not fail valid siblings in the same material group.
  await app.getByRole('button', { name: '新建任务', exact: true }).click()
  await app.getByRole('dialog').getByRole('button', { name: '保留并新建', exact: true }).click()
  await app.getByText('已选 0 / 0 行', { exact: true }).waitFor()
  await app.evaluate(async names => {
    const root = await navigator.storage.getDirectory()
    const folder = await root.getDirectoryHandle('季华本地错误隔离回归目录', { create: true })
    for (const [index, name] of names.entries()) {
      const handle = await folder.getFileHandle(name, { create: true })
      const writer = await handle.createWritable()
      await writer.write(index === 1 ? 'invalid PDF fixture' : '%PDF-1.7\nfixture local isolation content\n%%EOF')
      await writer.close()
    }
    window.showDirectoryPicker = () => Promise.resolve(folder)
  }, isolationFilenames)
  await app.getByRole('button', { name: '添加文件夹', exact: true }).click()
  await app.getByText('已选 0 / 3 行', { exact: true }).waitFor()
  await app.getByRole('button', { name: '全选筛选结果', exact: true }).click()
  await app.getByText('已选 3 / 3 行', { exact: true }).waitFor()
  await app.getByRole('button', { name: '连接并检测登录', exact: true }).click()
  await app.locator('.jh-session-state.session-connected').waitFor()
  const uploadsBeforeIsolation = report.uploadRequests
  const updatesBeforeIsolation = report.updates
  await app.getByRole('button', { name: '开始上传', exact: true }).click()
  await waitForPageCondition(
    app,
    () => {
      const status = document.querySelector('.jh-task-status')?.textContent ?? ''
      return (
        document.querySelectorAll('.jh-badge[data-status="success"]').length === 2 &&
        document.querySelectorAll('.jh-badge[data-status="failed"]').length === 1 &&
        status.includes('有上传失败')
      )
    },
    null,
    { timeout: 60000 },
  )
  const invalidSourceRow = app.locator('.jh-file-row').filter({ hasText: isolationFilenames[1] })
  assert.ok(
    (await invalidSourceRow.innerText()).includes('PDF'),
    'Only the malformed source row should report a PDF validation failure',
  )
  assert.equal(
    report.uploadRequests - uploadsBeforeIsolation,
    2,
    'Only the two valid siblings should produce multipart requests',
  )
  assert.equal(
    uploadedNames.includes(isolationFilenames[1]),
    false,
    'The malformed source must never reach the upload API',
  )
  const isolationUpdates = updates
    .slice(updatesBeforeIsolation)
    .filter(body => body.patentParameter.ID === isolationNumber)
  assert.equal(isolationUpdates.length, 1, 'The two valid sibling receipts should be associated in one update')
  assert.equal(records.get(isolationNumber).attachments.firstResultAppendixList.length, 2)
  assert.equal(
    new Set(isolationUpdates[0].firstResultAppendixList).size,
    2,
    'Association must contain two distinct valid attachment IDs',
  )
  report.localFailureIsolation = {
    passed: true,
    successRows: 2,
    failedSourceRows: 1,
    multipartRequests: report.uploadRequests - uploadsBeforeIsolation,
    associationUpdates: isolationUpdates.length,
    associatedAttachmentIds: 2,
    malformedSourceSent: false,
  }
  // A historical sent request with no surviving document must not block unsent siblings.
  await app.getByRole('button', { name: '新建任务', exact: true }).click()
  await app.getByRole('dialog').getByRole('button', { name: '保留并新建', exact: true }).click()
  await app.getByText('已选 0 / 0 行', { exact: true }).waitFor()
  await app.evaluate(async names => {
    const root = await navigator.storage.getDirectory()
    const folder = await root.getDirectoryHandle('季华历史回执隔离回归目录', { create: true })
    for (const name of names) {
      const handle = await folder.getFileHandle(name, { create: true })
      const writer = await handle.createWritable()
      await writer.write('%PDF-1.7\nfixture unknown sibling content\n%%EOF')
      await writer.close()
    }
    window.showDirectoryPicker = () => Promise.resolve(folder)
  }, unknownSiblingFilenames)
  await app.getByRole('button', { name: '添加文件夹', exact: true }).click()
  await app.getByText('已选 0 / 3 行', { exact: true }).waitFor()
  await app.getByRole('button', { name: '全选筛选结果', exact: true }).click()
  await app.getByRole('button', { name: '连接并检测登录', exact: true }).click()
  await app.locator('.jh-session-state.session-connected').waitFor()
  await app.evaluate(async filename => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('patmail-jihua-inventory')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('tasks', 'readwrite')
        const store = tx.objectStore('tasks')
        const request = store.get('latest')
        request.onsuccess = () => {
          const task = request.result
          const row = task.rows.find(item => item.fileName === filename)
          row.intent = {
            requestId: crypto.randomUUID(),
            sessionKey: task.session.key,
            tabId: task.session.tabId,
            documentId: 'fixture-previous-document',
            sent: true,
            materialKey: row.materialKey,
            applicationNo: row.applicationNo,
          }
          store.put(task, 'latest')
        }
        tx.oncomplete = resolve
        tx.onabort = () => reject(tx.error)
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }, unknownSiblingFilenames[0])
  const uploadsBeforeUnknownSibling = report.uploadRequests
  await app.getByRole('button', { name: '开始上传', exact: true }).click()
  await waitForPageCondition(
    app,
    () =>
      document.querySelectorAll('.jh-badge[data-status="success"]').length === 2 &&
      document.querySelectorAll('.jh-badge[data-status="verifying"]').length === 1 &&
      (document.querySelector('.jh-task-status')?.textContent ?? '').includes('有上传失败'),
    null,
    { timeout: 60000 },
  )
  const historicalUnknownRow = app.locator('.jh-file-row').filter({ hasText: unknownSiblingFilenames[0] })
  assert.ok((await historicalUnknownRow.innerText()).includes('原页面回执不可用'))
  assert.equal(report.uploadRequests - uploadsBeforeUnknownSibling, 2)
  assert.equal(
    uploadedNames.includes(unknownSiblingFilenames[0]),
    false,
    'An unknown historical upload must never be replayed',
  )
  assert.equal(records.get(unknownSiblingNumber).attachments.firstResultAppendixList.length, 2)
  report.unknownReceiptIsolation = {
    passed: true,
    successRows: 2,
    failedUnknownRows: 1,
    multipartRequests: 2,
    associatedAttachmentIds: 2,
    unknownRequestReplayed: false,
  }
  report.passed = true
} catch (error) {
  report.error = error.stack ?? String(error)
  if (app) await app.screenshot({ path: join(resultDir, 'failure.png'), fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  recoveryScenarioActive = false
  releaseHeldUpload?.()
  if (heldUploadActive)
    await withTimeout(heldUploadFinished, 3000, 'Releasing the held upload during cleanup timed out').catch(() => {})
  releaseLiveRequeueUpload?.()
  if (liveRequeueUploadActive)
    await withTimeout(
      liveRequeueUploadFinished,
      3000,
      'Releasing the held live-requeue upload during cleanup timed out',
    ).catch(() => {})
  if (context) await context.close()
  await writeFile(join(resultDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
