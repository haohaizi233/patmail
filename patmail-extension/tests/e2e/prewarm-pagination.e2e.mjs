import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  launchExtensionContext,
  extensionWorker,
  waitForContentScript,
  waitForPageCondition,
} from './support/browser.mjs'
import { installEasyMock, easyFixtureUrl } from './support/easy-mock.mjs'
import { distDir, reportsDir } from './support/paths.mjs'

const resultDir = join(reportsDir, 'prewarm-pagination')
await mkdir(resultDir, { recursive: true })

const total = 120
const pageSize = 100
const templateId = 'd9896997-1e83-4c7d-9a49-da69ba56e7aa'
const recipe = { new_filename: 'file_name', file_name_type: 'colname' }
const info = { IsLogin: true, Status: true, Result: true }
const easyOrigin = new URL(easyFixtureUrl).origin
const fileId = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
const searchCalls = []
const nameCalls = []
const downloadCalls = []
const heldNameRoutes = []
const heldDownloadRoutes = []
let downloadClicked = false
let context
let app
let currentStage = 'script initialization'

function markStage(message) {
  currentStage = message
  console.log(`[prewarm-pagination] ${message}`)
}

const report = {
  scenario: 'prewarm-pagination',
  passed: false,
  isolation: { playwrightChromium: true, extensionContext: true, userBrowserConnected: false },
  total,
  pageSize,
  searchCalls: [],
  naming: {},
  download: {},
  paginationDuringDownload: {},
  progressSamples: [],
}

function jsonBody(data, clientInfo = info) {
  return JSON.stringify({ ClientInfo: clientInfo, ...data })
}

async function fulfillJson(route, data, clientInfo = info) {
  await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: jsonBody(data, clientInfo) })
}

function namesFor(ids) {
  return ids.map(id => `预热名称-${id.slice(-4)}.pdf`)
}

function namingResponse(ids) {
  return { file_names: namesFor(ids).join(';') }
}

function holdRoute(route, entries, record, response) {
  let resolveGate
  let released = false
  const gate = new Promise(resolve => {
    resolveGate = resolve
  })
  const held = {
    record,
    async release() {
      if (released) return
      released = true
      try {
        await route.fulfill(response)
        record.state = 'fulfilled'
      } catch {
        record.state = 'closed'
      } finally {
        resolveGate()
      }
    },
  }
  entries.push(held)
  return gate
}

async function waitForNodeCondition(condition, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (condition()) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`等待夹具状态超时：${label}`)
}

function duplicateRequestedIds() {
  const seen = new Set()
  const duplicate = new Set()
  for (const call of nameCalls) {
    for (const id of call.fileIds) {
      if (seen.has(id)) duplicate.add(id)
      else seen.add(id)
    }
  }
  return [...duplicate].sort()
}

function summarizeNameCalls() {
  return nameCalls.map(call => ({
    phase: call.phase,
    state: call.state,
    count: call.fileIds.length,
    firstId: call.fileIds[0] ?? null,
    lastId: call.fileIds.at(-1) ?? null,
  }))
}

function readNamedCount(progressText) {
  const match = /取名\s+(\d+)\/(\d+)/.exec(progressText ?? '')
  return match ? { done: Number(match[1]), total: Number(match[2]) } : null
}

async function releaseAll(entries) {
  await Promise.all(entries.map(entry => entry.release()))
}

async function writeFailureReport(error) {
  report.error = String(error)
  report.stage = currentStage
  report.searchCalls = searchCalls.map(({ pageIndex, pageSize: size }) => ({ pageIndex, pageSize: size }))
  report.naming = {
    ...report.naming,
    totalGetFileNameRequests: nameCalls.length,
    uniqueFileIds: new Set(nameCalls.flatMap(call => call.fileIds)).size,
    duplicateFileIds: duplicateRequestedIds(),
    requestGroups: summarizeNameCalls(),
  }
  report.download = {
    clicked: downloadClicked,
    heldAtDownLoad: downloadCalls.length > 0,
    downLoadRequests: downloadCalls.length,
  }
  await writeFile(join(resultDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

const hardTimeout = setTimeout(() => {
  void (async () => {
    console.error(
      `[prewarm-pagination] exceeded 180 seconds at "${currentStage}"; releasing mock requests and closing its isolated browser`,
    )
    await Promise.race([
      Promise.all([releaseAll(heldNameRoutes), releaseAll(heldDownloadRoutes)]),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ])
    await writeFailureReport(new Error(`Hard timeout after 180 seconds at ${currentStage}`)).catch(() => {})
    if (context) {
      await Promise.race([context.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 5000))])
    }
    process.exit(1)
  })()
}, 180_000)
hardTimeout.unref()

try {
  markStage('launch isolated Chromium context')
  context = await launchExtensionContext(distDir, {
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
  })
  await installEasyMock(context, {
    fixtureHtml: '<!doctype html><title>取名预热分页回归</title>',
    profile: 'extension',
  })
  markStage('install EASY login and source HTTP fixtures')

  // Source HTTP is fully synthetic. Other HTTP origins are blocked in this context.
  await context.route('http://183.36.43.66:88/**', async route => {
    const url = new URL(route.request().url())
    const params = new URLSearchParams(route.request().postData() ?? '')
    const call = params.get('Call')

    if (call === 'GetApplyTags') {
      await fulfillJson(route, { ApplyTags: null })
      return
    }
    if (call === 'GetFileTempNameList') {
      await fulfillJson(route, { TempNameList: [{ id: templateId, temp_name: '预热验收模板', ...recipe }] })
      return
    }
    if (call === 'GetFlowdirection') {
      await fulfillJson(route, { DownLoadFileName: [{ value: 'file_name', text_zh_cn: '附件名称' }] })
      return
    }
    if (call === 'GetSearchFiles') {
      const pageIndex = Number(params.get('pageIndex') || 1)
      const requestedPageSize = Number(params.get('pageSize') || pageSize)
      searchCalls.push({ pageIndex, pageSize: requestedPageSize, at: Date.now() })
      const first = (pageIndex - 1) * requestedPageSize
      const rows = Array.from({ length: Math.max(0, Math.min(requestedPageSize, total - first)) }, (_, offset) => {
        const index = first + offset + 1
        return {
          file_id: fileId(index),
          file_no: `PREWARM${String(index).padStart(3, '0')}`,
          file_name: `预热文件-${index}.pdf`,
          file_desc: '预热分页验收',
          case_volume: 'PREWARM-CASE',
          app_no: `CN2026${String(index).padStart(6, '0')}`,
          customer_name: '隔离测试客户',
          post_date: '2026-11-02',
        }
      })
      await fulfillJson(route, { TableRowsCount: String(total), TableRows: rows })
      return
    }
    if (call === 'GetFileName') {
      const ids = (params.get('file_ids') ?? '').split(';').filter(Boolean)
      const record = {
        phase: downloadClicked ? 'download' : 'prewarm',
        state: 'received',
        fileIds: ids,
        at: Date.now(),
      }
      nameCalls.push(record)
      if (!downloadClicked && nameCalls.length === 1) {
        await fulfillJson(route, namingResponse(ids))
        record.state = 'fulfilled'
        return
      }
      if (!downloadClicked) {
        record.state = 'pending'
        await holdRoute(route, heldNameRoutes, record, {
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          body: jsonBody(namingResponse(ids)),
        })
        return
      }
      await fulfillJson(route, namingResponse(ids))
      record.state = 'fulfilled'
      return
    }
    if (call === 'DownLoad') {
      const record = { fileNo: params.get('file_no') ?? '', state: 'pending', at: Date.now() }
      downloadCalls.push(record)
      await holdRoute(route, heldDownloadRoutes, record, {
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: jsonBody({}, { IsLogin: true, Status: false, Result: false, Message: '回归在打包入口暂停' }),
      })
      return
    }
    if (url.pathname.endsWith('/FileHandler.ashx')) {
      await route.fulfill({ status: 503, contentType: 'text/plain; charset=utf-8', body: '回归在 DownLoad 处停止' })
      return
    }
    await route.fallback()
  })
  await context.route(/^https?:\/\//, route =>
    new URL(route.request().url()).origin === easyOrigin
      ? route.fallback()
      : route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: 'isolated E2E fixture only' }),
  )
  await context.addCookies([
    { name: 'pm_fixture_session', value: 'active', url: easyFixtureUrl, httpOnly: true, sameSite: 'Lax' },
  ])

  markStage('open isolated EASY fixture and wait for content script')
  const worker = await extensionWorker(context)
  const easy = await context.newPage()
  easy.setDefaultTimeout(15000)
  easy.setDefaultNavigationTimeout(15000)
  await easy.goto(easyFixtureUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await waitForContentScript(worker, easy)
  markStage('open file workbench and choose naming template')
  app = await context.newPage()
  app.setDefaultTimeout(15000)
  app.setDefaultNavigationTimeout(15000)
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  })

  const exportRow = app.locator('.download-name-row')
  const template = exportRow.locator('.download-template-select [role="combobox"]')
  await app.getByText('当前账号未配置专利标签', { exact: true }).waitFor()
  await template.click()
  await app.getByRole('option', { name: '预热验收模板', exact: true }).click()

  markStage('query first 100 of 120 synthetic files')
  const pagination = app.getByRole('navigation', { name: '文件分页', exact: true })
  await app.getByLabel('我方文号', { exact: true }).first().fill('PREWARM-CASE')
  await app.getByRole('button', { name: '查询文件', exact: true }).click()
  await app.getByText('预热文件-1.pdf', { exact: true }).waitFor()
  await pagination.getByText('第 1 / 2 页', { exact: true }).waitFor()
  assert.deepEqual(
    searchCalls.map(call => [call.pageIndex, call.pageSize]),
    [[1, 100]],
    '初次查询应只读取第1页的100行',
  )

  markStage('select all files across both source pages')
  await app.getByRole('button', { name: '全选所有', exact: true }).click()
  await app.getByText('已全选 120 个文件。', { exact: true }).waitFor({ timeout: 30000 })
  markStage('wait for a partial prewarm response and outstanding requests')
  await waitForNodeCondition(() => {
    const asked = new Set(nameCalls.flatMap(call => call.fileIds))
    return asked.size === total && nameCalls.some(call => call.state === 'fulfilled') && heldNameRoutes.length > 0
  }, '全选后的预热请求已部分完成且仍有在途请求')

  const previewStatus = app.locator('p[role="status"]').filter({ hasText: /下载名称预览/ })
  const completedBeforeDownload = new Set(
    nameCalls.filter(call => call.state === 'fulfilled').flatMap(call => call.fileIds),
  )
  const pendingBeforeDownload = new Set(
    nameCalls.filter(call => call.state === 'pending').flatMap(call => call.fileIds),
  )
  const requestedBeforeDownload = new Set(nameCalls.flatMap(call => call.fileIds))
  assert.equal(requestedBeforeDownload.size, total, '静默预热必须已覆盖120个不同文件')
  assert.equal(duplicateRequestedIds().length, 0, '预热本身不能重复请求同一个文件名')
  assert.equal(completedBeforeDownload.size > 0 && completedBeforeDownload.size < total, true, '预热应有已完成部分')
  assert.equal(pendingBeforeDownload.size > 0, true, '预热应保留在途文件名请求')
  await previewStatus.getByText(`${completedBeforeDownload.size}/${total}`, { exact: false }).waitFor()

  report.searchCalls = searchCalls.map(({ pageIndex, pageSize: size }) => ({ pageIndex, pageSize: size }))
  report.selection = { selected: total, selectAllTraversedPages: [...new Set(searchCalls.map(call => call.pageIndex))] }
  report.naming = {
    completedBeforeDownload: completedBeforeDownload.size,
    pendingBeforeDownload: pendingBeforeDownload.size,
    requestedBeforeDownload: requestedBeforeDownload.size,
    prewarmRequestGroups: summarizeNameCalls(),
  }

  markStage(`prewarm partial ${completedBeforeDownload.size}/120; start download with requests in flight`)
  downloadClicked = true
  await app.getByRole('button', { name: '下载已选', exact: true }).click()
  await app.getByRole('button', { name: '导出中…', exact: true }).waitFor({ timeout: 15000 })
  await app.locator('.check-rainbow').waitFor({ state: 'visible', timeout: 15000 })
  await waitForPageCondition(
    app,
    () => {
      const text = document.querySelector('.check-rainbow')?.getAttribute('aria-valuetext') ?? ''
      return /取名\s+\d+\/120/.test(text)
    },
    null,
    { timeout: 15000 },
  )
  const whilePendingText = await app.locator('.check-rainbow').getAttribute('aria-valuetext')
  const whilePending = readNamedCount(whilePendingText)
  assert.ok(whilePending, `下载阶段应沿用预热取名进度：${whilePendingText}`)
  assert.equal(whilePending.done, completedBeforeDownload.size, '启动下载时不能把已完成的预热计数清零或重算')
  report.progressSamples.push({ phase: 'download-started-with-prewarm-in-flight', ...whilePending })

  const searchCountBeforeManualPaging = searchCalls.length
  markStage('release prewarm gates and wait for held DownLoad requests')
  await releaseAll(heldNameRoutes)
  await waitForNodeCondition(() => downloadCalls.length > 0, '下载已推进到 DownLoad HTTP 入口')
  await waitForPageCondition(
    app,
    () => {
      const text = document.querySelector('.check-rainbow')?.getAttribute('aria-valuetext') ?? ''
      const match = /取名\s+(\d+)\/120/.exec(text)
      return Boolean(match && Number(match[1]) === 120)
    },
    null,
    { timeout: 30000 },
  )
  const afterNamesText = await app.locator('.check-rainbow').getAttribute('aria-valuetext')
  const afterNames = readNamedCount(afterNamesText)
  assert.ok(afterNames, `完整预热后应保留取名进度：${afterNamesText}`)
  report.progressSamples.push({ phase: 'all-names-resolved-at-download-entry', ...afterNames })

  markStage('verify cached pagination while download is held at DownLoad')
  const next = pagination.getByRole('button', { name: '下一页', exact: true })
  assert.equal(await next.isEnabled(), true, '下载正在等待源站打包时仍允许翻页查看已缓存结果')
  await next.click()
  await pagination.getByText('第 2 / 2 页', { exact: true }).waitFor()
  await app.getByText('预热文件-101.pdf', { exact: true }).waitFor()
  assert.equal(await app.locator('.grid tbody tr').count(), 20, '第2页应显示最后20个结果')
  assert.equal(await app.getByText('预热文件-1.pdf', { exact: true }).count(), 0, '翻到第2页后不能残留第1页内容')
  assert.equal(await app.getByText('正在查询…', { exact: true }).count(), 0, '缓存翻页不能显示正在查询')
  assert.equal(searchCalls.length, searchCountBeforeManualPaging, '下载中的手动缓存翻页不能再次调用 GetSearchFiles')
  await app.screenshot({ path: join(resultDir, 'during-download-page-2.png') })
  const page2Text = await app.locator('.check-rainbow').getAttribute('aria-valuetext')
  const page2Progress = readNamedCount(page2Text)
  assert.ok(page2Progress)
  report.progressSamples.push({ phase: 'page-2-during-download', ...page2Progress })

  await pagination.getByRole('button', { name: '上一页', exact: true }).click()
  await pagination.getByText('第 1 / 2 页', { exact: true }).waitFor()
  await app.getByText('预热文件-1.pdf', { exact: true }).waitFor()
  assert.equal(await app.locator('.grid tbody tr').count(), 100, '返回第1页应恢复原100行')
  assert.equal(await app.getByText('预热文件-101.pdf', { exact: true }).count(), 0, '返回第1页后不能残留第2页内容')
  assert.equal(await app.getByText('正在查询…', { exact: true }).count(), 0)
  assert.equal(searchCalls.length, searchCountBeforeManualPaging, '来回查看分页仍不能增加 GetSearchFiles 调用')

  const finalNamedText = await app.locator('.check-rainbow').getAttribute('aria-valuetext')
  const finalNamed = readNamedCount(finalNamedText)
  assert.ok(finalNamed)
  report.progressSamples.push({ phase: 'page-1-during-download', ...finalNamed })
  const progressCounts = report.progressSamples.map(sample => sample.done)
  assert.deepEqual(
    progressCounts,
    [...progressCounts].sort((a, b) => a - b),
    '预热到下载的取名进度必须单调递增',
  )

  const duplicateIds = duplicateRequestedIds()
  assert.deepEqual(duplicateIds, [], '下载启动不能重取已完成或仍在途的 GetFileName 文件')
  assert.equal(new Set(nameCalls.flatMap(call => call.fileIds)).size, total, '取名请求最终应恰好覆盖120个不同文件')
  assert.equal(searchCalls.length, 2, '全选120条只需源站查询第1页和第2页各一次')
  assert.deepEqual(
    searchCalls.map(call => call.pageIndex),
    [1, 2],
  )

  report.searchCalls = searchCalls.map(({ pageIndex, pageSize: size }) => ({ pageIndex, pageSize: size }))
  report.naming = {
    ...report.naming,
    totalGetFileNameRequests: nameCalls.length,
    uniqueFileIds: new Set(nameCalls.flatMap(call => call.fileIds)).size,
    duplicateFileIds: duplicateIds,
    requestGroups: summarizeNameCalls(),
  }
  report.download = { clicked: true, heldAtDownLoad: true, downLoadRequests: downloadCalls.length }
  report.paginationDuringDownload = {
    pagesVisited: [2, 1],
    getSearchFilesBefore: searchCountBeforeManualPaging,
    getSearchFilesAfter: searchCalls.length,
    queryIndicatorVisible: false,
    page2Rows: 20,
    page1Rows: 100,
  }
  markStage('write pass report and screenshot')
  report.stage = currentStage
  report.passed = true
  await writeFile(join(resultDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(
    `prewarm-pagination passed: 120 files, 2 source pages, ${nameCalls.length} GetFileName calls, no duplicates`,
  )
} catch (error) {
  await writeFailureReport(error)
  if (app && !app.isClosed()) await app.screenshot({ path: join(resultDir, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await releaseAll(heldNameRoutes)
  await releaseAll(heldDownloadRoutes)
  await context?.close()
  clearTimeout(hardTimeout)
}
