import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TextWriter, Uint8ArrayReader, ZipReader } from '@zip.js/zip.js'
import { distDir, fixturePagePath, tmpPath } from './support/paths.mjs'
import { easyFixtureUrl, installEasyMock } from './support/easy-mock.mjs'
import { extensionWorker, launchExtensionContext, waitForContentScript } from './support/browser.mjs'
import { createReporter } from './support/report.mjs'

const dist = distDir
const fixture = await readFile(fixturePagePath)
const easyUrl = easyFixtureUrl
const report = createReporter()
const guideSource = await readFile(new URL('../../docs/workflows/请款.md', import.meta.url), 'utf8')
const guideDiagrams = (guideSource.match(/^```mermaid$/gm) ?? []).length
assert.ok(guideDiagrams >= 1, '请款.md must contain at least one mermaid diagram')

const downloadPath = await mkdtemp(tmpPath('billing-download-'))
const profile = await mkdtemp(tmpPath('billing-profile-'))
await mkdir(join(profile, 'Default'))
await writeFile(join(profile, 'Default', 'Preferences'), JSON.stringify({
  download: { default_directory: downloadPath, prompt_for_download: false },
}))
const context = await launchExtensionContext(dist, { viewport: { width: 1440, height: 1000 }, userDataDir: profile })
const mock = await installEasyMock(context, { fixtureHtml: fixture, profile: 'extension' })
const goerCaseId = '7C842A11-A2E8-467D-9079-D3C766928198'
const goerFeeId = 'goer-translation'
let wordCountRequests = 0
let recoveredBillQueries = 0
let pbcRequests = 0
const pbcNow = new Date()
const pbcYear = pbcNow.getFullYear()
const pbcMonth = pbcNow.getMonth() + 1
const pbcDay = pbcNow.getDate()
const pbcDateIso = `${pbcYear}-${String(pbcMonth).padStart(2, '0')}-${String(pbcDay).padStart(2, '0')}`
const pbcFolderStamp = `${pbcYear}${String(pbcMonth).padStart(2, '0')}${String(pbcDay).padStart(2, '0')}09150000001`
await context.route('https://www.pbc.gov.cn/**', async route => {
  const url = route.request().url()
  if (url.includes(`/125925/${pbcFolderStamp}/index.html`)) {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<html><body><p>${pbcYear}年${pbcMonth}月${pbcDay}日银行间外汇市场人民币汇率中间价为：1美元对人民币7.1234元，1欧元对人民币7.7890元，100日元对人民币4.6500元，1港元对人民币0.9150元，1英镑对人民币9.0123元，1瑞士法郎对人民币8.0500元。</p></body></html>`,
    })
    return
  }
  pbcRequests++
  await route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: `<html><body><a href="/zhengcehuobisi/125207/125217/125925/${pbcFolderStamp}/index.html">${pbcYear}年${pbcMonth}月${pbcDay}日中国外汇交易中心受权公布人民币汇率中间价公告</a></body></html>`,
  })
})
await context.route('http://183.36.43.66:88/**', async route => {
  const params = new URLSearchParams(route.request().postData() ?? '')
  if (params.get('Call') !== 'GetSearchFiles') return route.fallback()
  recoveredBillQueries++
  await route.fulfill({ json: { ClientInfo: { IsLogin: true, Status: true, Result: true }, TableRowsCount: '0', TableRows: [] } })
})
await context.route('**/AjaxServers/CaseInfo.ashx*', async route => {
  const params = new URLSearchParams(route.request().postData() ?? '')
  if (params.get('Call') !== 'GetFeeListByCase') return route.fallback()
  assert.equal(params.get('case_id'), goerCaseId)
  assert.equal(params.get('fee_class'), 'A')
  wordCountRequests++
  await route.fulfill({ json: { ClientInfo: { IsLogin: true, Status: true }, TableRows: [
    { fee_id: 'other-translation', word_count: 9999 },
    { fee_id: goerFeeId, word_count: 4420 }
  ] } })
})
await context.route('**/AjaxServers/Report.ashx*', async route => {
  const request = route.request()
  const params = new URLSearchParams(request.postData() ?? '')
  const call = params.get('Call') ?? new URL(request.url()).searchParams.get('Call')
  const client = { IsLogin: true, Status: true, Result: true }
  const body = call === 'FeeSearch' && params.get('fee_class') === 'O,A,T' ? {
    ClientInfo: client, total: 2,
    rows: [
      { fee_id: goerFeeId, case_id: goerCaseId, case_volume: 'PA925-EP', fee_class: 'A',
        fee_name: '翻译费', currency_id: 'CNY', amount: 6630, request_status: '未请款', ctrl_proc: '指定国生效' },
      { fee_id: 'goer-internal', case_id: goerCaseId, case_volume: 'PA925-EP', fee_class: 'A',
        fee_name: '合同金额', currency_id: 'CNY', amount: 6500, request_status: '未请款', ctrl_proc: '指定国生效' }
    ]
  } : call === 'FeeSearch' ? {
    ClientInfo: client,
    total: 6,
    rows: [
      { fee_id: 'pct-test', case_volume: 'PA123PCT', business_type_name: 'PCT国际阶段', fee_class: 'O',
        fee_name: '国际申请费', currency_id: 'CNY', amount: 100, request_status: '未请款', customer_name: '美的小家电事业部', finish_date: '2026-11-16' },
      { fee_id: 'pct-requested', case_volume: 'PA124PCT', fee_class: 'O',
        fee_name: '国际申请费', currency_id: 'CNY', amount: 300, request_status: '审核中', customer_name: '美的小家电事业部', finish_date: '2026-11-18' },
      { fee_id: 'foreign-test', case_volume: 'PA123-EP', fee_class: 'O',
        fee_name: '申请费', currency_id: 'CNY', amount: 200, request_status: '未请款', customer_name: '美的小家电事业部' },
      { fee_id: 'another-customer', case_volume: 'PA125PCT', fee_class: 'A',
        fee_name: '代理费', currency_id: 'CNY', amount: 1000, request_status: '未请款', customer_name: '美的新能源事业部' },
      { fee_id: 'external-customer', case_volume: 'PA126PCT', fee_class: 'O',
        fee_name: '国际申请费', currency_id: 'CNY', amount: 9220, request_status: '未请款', customer_name: '云南电网' },
      { fee_id: 'unmapped-pct', case_volume: 'PA123PCT', fee_class: 'O',
        fee_name: '优先权文件传送费（PCT国际）', currency_id: 'CNY', amount: 150, request_status: '未请款', customer_name: '美的小家电事业部' }
    ]
  } : call === 'FeeSearchTotalAmount' ? { ClientInfo: client, FeeList: [] } : null
  if (!body) return route.fallback()
  await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: JSON.stringify(body) })
})
const errors = []
const watch = page => {
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() !== 'error') return
    // 允许 fixture 缺口带来的 404 资源噪声（如文件描述树等按需拉取），只拦 JS 运行时错误。
    if (/status of 404|Failed to load resource/.test(message.text())) return
    errors.push(message.text())
  })
}
context.on('page', watch)
for (const page of context.pages()) watch(page)
try {
  const worker = await extensionWorker(context)
  const extensionId = new URL(worker.url()).host
  assert.match(extensionId, /^[a-p]{32}$/)

  await context.addCookies([{ name: 'pm_fixture_session', value: 'active', url: easyUrl, httpOnly: true, sameSite: 'Lax' }])
  const easyPage = await context.newPage()
  await easyPage.goto(easyUrl)
  await waitForContentScript(worker, easyPage, { attempts: 30, intervalMs: 100 })

  const app = await context.newPage()
  await app.goto(`chrome-extension://${extensionId}/app.html#/workflow`)
  // The isolated Chromium normally uses Playwright's GUID naming policy.
  // Exercise Chrome's native filename and terminal receipt in a fixture-only directory.
  const cdp = await context.newCDPSession(app)
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true })
  const completedDownload = async (stem, collision = false) => {
    const notice = app.getByRole('status').filter({ hasText: '已导出并确认下载完成' })
    await notice.waitFor({ timeout: 10_000 })
    const items = await app.evaluate(() => chrome.downloads.search({ state: 'complete' }))
    const found = items.filter(item => item.filename.includes(stem))
    assert.equal(found.length, 1)
    const savedName = found[0].filename.split(/[\\/]/).at(-1)
    assert.match(savedName, new RegExp(`^${stem}-\\d{8}${collision ? ' \\(1\\)' : ''}\\.xlsx$`))
    assert.ok((await notice.innerText()).includes(savedName), 'UI must report the filename Chrome actually saved')
    return found[0]
  }
  const confirmPctExceptionDialog = async () => {
    const dialog = app.getByRole('dialog')
    await dialog.waitFor({ timeout: 5_000 })
    assert.match(await dialog.innerText(), /未请款 PCT 费用未纳入本次导出/)
    await dialog.getByRole('button', { name: '确认继续导出', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
  }
  await app.getByText('测试员', { exact: true }).waitFor({ timeout: 15_000 })

  // 工作台卡片「请款」→ 请款工作流（默认歌尔涉外模板 + 步骤 1）
  await app.locator('.billing-workflow-card .sea-open').click()
  await app.locator('.billing-workflow-page').waitFor({ timeout: 15_000 })
  report.pass('billing workflow opens from the workflow catalogue card')

  for (const label of ['歌尔涉外请款单', '美的涉外费用清单', '美的 PCT 费用清单']) {
    await app.locator('.template-preset-bar').getByText(label, { exact: true }).waitFor({ timeout: 15_000 })
  }
  const selectedTitle = app.locator('.template-radio-item.selected .tpl-title-line b')
  assert.equal(await selectedTitle.innerText(), '歌尔涉外请款单', '默认选中通用涉外模板')
  const presetBadge = app.locator('.template-preset-bar .preset-badge')
  assert.ok((await presetBadge.innerText()).includes('官费 + 代理费 + 第三方费用'), '歌尔模板预填全部三类费用')
  assert.ok((await app.locator('.flow-steps-bar .step-title').first().innerText()).includes('文件管理（账单抓取）'))
  report.pass('billing template picker lists three presets with general-foreign default')

  // 步骤 1 查询表：清空条件后仍可一键「恢复默认预填」
  const step1FiltersBar = app.locator('.step-1-section .active-filters-bar')
  await step1FiltersBar.waitFor({ timeout: 10_000 })
  assert.ok((await step1FiltersBar.locator('.filter-chip').count()) >= 1)
  await step1FiltersBar.getByRole('button', { name: '清空条件', exact: true }).click()
  assert.equal(await step1FiltersBar.locator('.filter-chip').count(), 0)
  await step1FiltersBar.getByRole('button', { name: '恢复默认预填', exact: true }).click()
  assert.equal(await step1FiltersBar.locator('.filter-chip').count(), 2)
  assert.match(await step1FiltersBar.innerText(), /案件流向：(从内到外|IO)/)
  assert.match(await step1FiltersBar.innerText(), /文件描述：付款INVOICE/)
  report.pass('step 1 file query form supports one-click default prefill restore')

  // 切到美的 PCT：步骤 1 变可选、预填切到官费 + 我方代理费
  await app.locator('.template-preset-bar').getByText('美的 PCT 费用清单', { exact: true }).click()
  await app.getByRole('button', { name: /跳过文件管理，直接查 PCT 费用/ }).waitFor({ timeout: 15_000 })
  assert.ok((await app.locator('.flow-steps-bar .step-title').first().innerText()).includes('文件管理（可选）'))
  assert.ok((await presetBadge.innerText()).includes('官费 + 我方代理费'))
  report.pass('PCT template makes the file step optional and switches the fee preset')

  // 快捷进入步骤 2：费用查询面板挂载，导出闸门在 0 行时禁用
  await app.getByRole('region', { name: '查询结果', exact: true })
    .getByRole('button', { name: /进入费用查询/ }).click()
  await app.locator('.step-2-section').waitFor({ state: 'visible', timeout: 15_000 })
  assert.equal(await app.locator('.step-1-section').isVisible(), false)
  const navigation = app.getByRole('navigation', { name: '请款流程导航' })
  const step2Next = navigation.getByRole('button', { name: /进入请款单导出/ })
  const feeResultNext = app.getByRole('region', { name: '费用查询结果' })
    .getByRole('button', { name: /进入请款单导出/ })
  await step2Next.waitFor({ timeout: 15_000 })
  assert.ok((await step2Next.innerText()).includes('已选 0 笔费用'))
  report.pass('quick action advances to the fee query step with the export gate disabled')

  // 步骤 3 闸门：未勾选费用时点击步骤导航被拦截并明确提示
  await app.locator('.flow-steps-bar .step-item').nth(2).click()
  const notice = app.locator('.step-notice-alert')
  await notice.waitFor({ timeout: 15_000 })
  assert.ok((await notice.innerText()).includes('还没有勾选费用'), '未勾选费用需给出明确提示')
  assert.equal(await app.locator('.step-3-section').isVisible(), false, '闸门拦截时不得进入步骤 3')
  assert.equal(await app.locator('.step-2-section').isVisible(), true)
  assert.equal(await step2Next.isDisabled(), true, '未勾选费用时导出前进按钮必须禁用')
  assert.equal(await feeResultNext.isDisabled(), true)
  await report.screenshot(app, 'billing-step-gate.png')
  report.pass('export step is gated behind fee selection with an explicit notice')

  // 步骤 2 查询表：重置后可一键「恢复默认预填」
  await app.locator('.step-2-section').getByRole('button', { name: '重置', exact: true }).click()
  await app.locator('.step-2-section').getByRole('button', { name: '恢复默认预填', exact: true }).click()
  report.pass('step 2 fee query form supports one-click default prefill restore')

  await app.locator('.step-2-section').getByRole('button', { name: '查询', exact: true }).click()
  await app.getByRole('button', { name: /进入请款单导出.*已选 2 笔/ }).waitFor()
  const feeResults = app.getByRole('region', { name: '费用查询结果' })
  const selectionNotice = feeResults.getByRole('status').filter({ hasText: '默认勾选' })
  assert.match(await selectionNotice.innerText(), /1 项有请款单号或状态并非明确未请款.*1 项不属于美的客户.*1 项模板没有对应的 PCT 官费列/)
  const pageSize = feeResults.getByRole('combobox', { name: '每页条数' })
  for (const width of [1440, 900]) {
    await app.setViewportSize({ width, height: 1000 })
    const toolbar = await feeResults.locator('.fee-results-toolbar').boundingBox()
    const picker = await pageSize.boundingBox()
    const noticeBox = await selectionNotice.boundingBox()
    assert.ok(toolbar && picker && noticeBox)
    assert.ok(picker.x + picker.width <= toolbar.x + toolbar.width + 1, `page-size control overflows at ${width}px`)
    assert.ok(noticeBox.y >= toolbar.y + toolbar.height, 'selection notice wraps below the toolbar')
  }
  await app.setViewportSize({ width: 1440, height: 1000 })
  await feeResultNext.click()
  const topBatchExport = navigation.getByRole('button', { name: '批量导出 2 份 Excel 请款表', exact: true })
  const bottomBatchExport = app.locator('.export-execute-card').getByRole('button', { name: /批量导出 2 份 Excel 请款表/ })
  await bottomBatchExport.waitFor()
  await topBatchExport.waitFor()
  const exceptionBox = app.getByRole('checkbox', { name: /以上费用另行处理/ })
  assert.equal(await exceptionBox.isChecked(), true, 'PCT 待核对费用确认项默认勾选')
  assert.equal(await bottomBatchExport.isEnabled(), true)
  assert.equal(await topBatchExport.isEnabled(), true)
  await app.locator('.pbc-rates-card').getByText(`公布日期：${pbcDateIso}`).waitFor({ timeout: 10_000 })
  await app.locator('.pbc-rates-card').getByText('¥ 7.1234').waitFor({ timeout: 10_000 })
  assert.ok(pbcRequests >= 1, 'entering Step 3 with CNY-only rows automatically scrapes PBC rates')

  const splitSwitchBtn = navigation.getByRole('button', { name: '按客户分表', exact: true })
  const mergeSwitchBtn = navigation.getByRole('button', { name: '合并单表', exact: true })
  const mixedCheckbox = app.getByRole('checkbox', { name: /允许不同客户合并进入同一张表/ })
  const switchBefore = await app.locator('.top-customer-mode-switch').boundingBox()
  assert.ok(switchBefore)
  assert.equal(await splitSwitchBtn.getAttribute('aria-pressed'), 'true')
  await mergeSwitchBtn.click()
  assert.equal(await mergeSwitchBtn.getAttribute('aria-pressed'), 'true')
  assert.equal(await mixedCheckbox.isChecked(), true)
  await navigation.getByRole('button', { name: '导出 Excel 请款表', exact: true }).waitFor()
  const switchAfter = await app.locator('.top-customer-mode-switch').boundingBox()
  assert.ok(switchAfter)
  assert.ok(Math.abs(switchAfter.x - switchBefore.x) <= 1, 'switch horizontal position stays stable after toggle')
  assert.ok(Math.abs(switchAfter.y - switchBefore.y) <= 1, 'switch vertical position stays stable after toggle')
  assert.ok(Math.abs(switchAfter.width - switchBefore.width) <= 1, 'switch width stays stable after toggle')
  await splitSwitchBtn.click()
  assert.equal(await splitSwitchBtn.getAttribute('aria-pressed'), 'true')
  assert.equal(await mixedCheckbox.isChecked(), false)
  await topBatchExport.waitFor()

  // 点击导出弹出 PCT 异常提示框，点击取消则不触发浏览器下载
  await topBatchExport.click()
  const warnDialog = app.getByRole('dialog')
  await warnDialog.waitFor({ timeout: 5_000 })
  assert.match(await warnDialog.innerText(), /优先权文件传送费（PCT国际）/)
  await warnDialog.getByRole('button', { name: '取消', exact: true }).click()
  await warnDialog.waitFor({ state: 'hidden' })
  assert.equal((await app.evaluate(() => chrome.downloads.search({}))).length, 0)

  // 手工取消勾选时仍禁用导出并展示定位提示
  await exceptionBox.uncheck()
  assert.equal(await bottomBatchExport.isDisabled(), true)
  assert.equal(await topBatchExport.isDisabled(), true)
  const disabledHint = app.locator('.export-disabled-hint')
  await disabledHint.waitFor()
  assert.match(await disabledHint.innerText(), /待在上方勾选确认/)
  await disabledHint.getByRole('button', { name: /去勾选确认/ }).click()
  await exceptionBox.check()

  await navigation.getByRole('button', { name: '返回费用查询调整' }).click()
  await feeResults.getByRole('button', { name: /只选 美的小家电事业部/ }).click()
  await navigation.getByRole('button', { name: /进入请款单导出.*已选 1 笔/ }).waitFor()
  await app.getByRole('row').filter({ hasText: 'PA124PCT' }).getByRole('checkbox').check()
  await feeResultNext.click()
  const bottomExport = app.locator('.export-execute-card').getByRole('button', { name: /导出 Excel 请款表/ })
  const topExport = navigation.getByRole('button', { name: '导出 Excel 请款表', exact: true })
  await bottomExport.waitFor()
  assert.equal(await topExport.isDisabled(), true)
  assert.equal(await bottomExport.isDisabled(), true)
  await app.getByRole('checkbox', { name: /已核对并确认导出/ }).check()
  assert.equal(await exceptionBox.isChecked(), true)
  assert.equal(await topExport.isEnabled(), true)
  await app.evaluate(() => {
    const original = window.fetch
    window.fetch = (resource, init) => {
      if (String(resource).includes('qingkuan-midea-pct.xlsx')) {
        window.fetch = original
        return Promise.resolve(new Response(null, { status: 503 }))
      }
      return original(resource, init)
    }
  })
  await topExport.click()
  await confirmPctExceptionDialog()
  await app.getByRole('status').filter({ hasText: '请款表模板读取失败（HTTP 503）' }).waitFor()
  assert.match(await app.locator('.export-execute-card .summary-line').innerText(), /待填入费用：2 笔/)
  assert.equal(await topExport.isEnabled(), true)
  await topExport.click()
  await confirmPctExceptionDialog()
  const download = await completedDownload('美的PCT费用清单')
  const workbook = await readFile(download.filename)
  await topExport.click()
  await confirmPctExceptionDialog()
  assert.equal((await completedDownload('美的PCT费用清单')).id, download.id, 'same export must reuse the browser download')
  assert.equal(workbook.subarray(0, 4).toString('hex'), '504b0304')
  const pctZip = new ZipReader(new Uint8ArrayReader(workbook))
  try {
    const entries = await pctZip.getEntries()
    const xml = name => entries.find(entry => entry.filename === name).getData(new TextWriter())
    const [summary, detail, strings, definition] = await Promise.all([
      xml('xl/worksheets/sheet1.xml'), xml('xl/worksheets/sheet2.xml'),
      xml('xl/sharedStrings.xml'), xml('xl/workbook.xml')
    ])
    assert.match(summary, /2026-11-16 至 2026-11-18/)
    assert.match(summary, /PCT费用明细'!I8/)
    assert.match(detail, /PA123PCT/)
    assert.match(detail, /PA124PCT/)
    assert.doesNotMatch(detail, /PA125PCT|PA126PCT|优先权文件传送费/)
    assert.doesNotMatch(strings, /PA2601250PCT|2026P1031798|XML递交/)
    assert.doesNotMatch(definition, /absPath|2026M7-9/)
  } finally {
    await pctZip.close()
  }

  // 多客户分表批量并发导出 E2E 验证（Stage 1 并发生成 + Stage 2 有序串行下载 + 明细列表）
  await navigation.getByRole('button', { name: '返回费用查询调整' }).click()
  await app.getByRole('row').filter({ hasText: 'PA125PCT' }).getByRole('checkbox').check()
  await navigation.getByRole('button', { name: /进入请款单导出.*已选 3 笔/ }).waitFor()
  await feeResultNext.click()
  await bottomBatchExport.waitFor()
  const requestedConfirm = app.getByRole('checkbox', { name: /已核对并确认导出/ })
  if (!(await requestedConfirm.isChecked())) await requestedConfirm.check()
  const exceptionConfirm = app.getByRole('checkbox', { name: /以上费用另行处理/ })
  assert.equal(await exceptionConfirm.isChecked(), true)
  assert.equal(await bottomBatchExport.isEnabled(), true)
  assert.equal(await topBatchExport.isEnabled(), true)
  await bottomBatchExport.click()
  await confirmPctExceptionDialog()
  await app.locator('.export-execute-card .export-notice-text')
    .filter({ hasText: /已按客户分表批量导出 2\/2 份/ })
    .waitFor({ timeout: 15_000 })
  const batchItems = app.locator('.batch-results-list .batch-result-item')
  assert.equal(await batchItems.count(), 2)
  const batchListText = await app.locator('.batch-results-list').innerText()
  assert.match(batchListText, /美的小家电事业部/)
  assert.match(batchListText, /美的新能源事业部/)
  const batchDownloads = await app.evaluate(() => chrome.downloads.search({ state: 'complete' }))
  for (const customer of ['美的小家电事业部', '美的新能源事业部']) {
    const item = batchDownloads.find(entry => entry.filename.includes(`美的PCT费用清单-${customer}-`))
    assert.ok(item, `expected completed download for ${customer}`)
    const bytes = await readFile(item.filename)
    assert.equal(bytes.subarray(0, 4).toString('hex'), '504b0304')
  }
  report.pass('2-stage streaming pipeline exports multi-customer split workbooks and renders per-customer receipts')

  await app.locator('.template-preset-bar').getByText('歌尔涉外请款单', { exact: true }).click()
  await app.getByRole('button', { name: /进入请款单导出.*已选 0 笔/ }).waitFor()
  assert.equal(await step2Next.isDisabled(), true)
  report.pass('PCT filters the fixture, downloads a workbook and invalidates selection on template change')

  await app.locator('.step-2-section').getByRole('button', { name: '查询', exact: true }).click()
  await navigation.getByRole('button', { name: /进入请款单导出.*已选 2 笔/ }).waitFor()
  assert.equal(wordCountRequests, 1)
  await feeResultNext.click()
  const todayStamp = await app.evaluate(() => {
    const date = new Date()
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(value => String(value).padStart(2, '0')).join('')
  })
  await writeFile(join(downloadPath, `歌尔涉外请款单-${todayStamp}.xlsx`), '', { flag: 'wx' })
  await topExport.click()
  const goer = await completedDownload('歌尔涉外请款单', true)
  assert.notEqual(goer.id, download.id)
  const zip = new ZipReader(new Uint8ArrayReader(await readFile(goer.filename)))
  try {
    const entries = await zip.getEntries()
    const sheet = await entries.find(entry => entry.filename === 'xl/worksheets/sheet1.xml').getData(new TextWriter())
    assert.match(sheet, /<c\b[^>]*\br="T5"[^>]*><v>6630<\/v><\/c>/)
    assert.match(sheet, /<c\b[^>]*\br="U5"[^>]*><v>4420<\/v><\/c>/)
    assert.match(sheet, /<c\b[^>]*\br="V5"[^>]*><v>6500<\/v><\/c>/)
  } finally {
    await zip.close()
  }
  report.pass('Goer reads translation word count by fee ID and fills T, U and V')

  const titleField = app.locator('.template-params-grid input').first()
  await titleField.fill('2026年11月歌尔请款恢复测试')
  await easyPage.bringToFront()
  await app.bringToFront()
  await app.evaluate(async () => {
    // Exercise the actual visibility-triggered workspace load, even when the
    // headless compositor keeps both tabs visible.
    const original = chrome.runtime.sendMessage
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('workspace refresh did not complete')), 5000)
      chrome.runtime.sendMessage = function (envelope, callback) {
        if (envelope?.message?.type !== 'WORKSPACE' || typeof callback !== 'function') {
          return original.apply(this, arguments)
        }
        return original.call(this, envelope, response => {
          callback(response)
          clearTimeout(deadline)
          setTimeout(resolve, 0)
        })
      }
      document.dispatchEvent(new Event('visibilitychange'))
    }).finally(() => { chrome.runtime.sendMessage = original })
  })
  assert.equal(await titleField.inputValue(), '2026年11月歌尔请款恢复测试')
  await app.evaluate(() => { location.hash = '#/settings' })
  await app.locator('.billing-workflow-page').waitFor({ state: 'hidden' })
  await app.evaluate(() => { location.hash = '#/workflow' })
  await app.locator('.step-3-section').waitFor({ state: 'visible' })
  await app.waitForFunction(async () => {
    const reply = await chrome.runtime.sendMessage({
      type: 'PATMAIL_RECOVERY_RPC', request: { op: 'latest', slot: 'billing-desk' }
    })
    const draft = reply?.value?.payload?.payload
    return draft?.step === 3 && draft.fees?.selectedIds?.length === 2 &&
      draft.headers?.title === '2026年11月歌尔请款恢复测试'
  })
  const pbcBeforeReload = pbcRequests
  await app.reload()
  await app.locator('.step-3-section').waitFor({ state: 'visible' })
  await app.locator('.pbc-rates-card').getByText(`公布日期：${pbcDateIso}`).waitFor({ timeout: 10_000 })
  await app.locator('.pbc-rates-card').getByText('¥ 7.1234').waitFor({ timeout: 10_000 })
  assert.ok(pbcRequests > pbcBeforeReload, 'restoring Step 3 from WAL automatically scrapes PBC rates again')
  assert.equal(await titleField.inputValue(), '2026年11月歌尔请款恢复测试')
  assert.match(await app.locator('.export-execute-card .summary-line').innerText(), /待填入费用：2 笔/)
  await navigation.getByRole('button', { name: '返回费用查询调整' }).click()
  assert.equal(await feeResults.getByRole('row').filter({ hasText: 'PA925-EP' }).count(), 2)
  await feeResultNext.click()
  await app.locator('.step-3-section').waitFor({ state: 'visible' })
  assert.equal(wordCountRequests, 1, 'restoring the draft does not repeat the fee query')
  report.pass('billing keeps step three and restores draft after tab switch, navigation and reload')

  const saved = await app.evaluate(async origin => {
    const owner = [origin, '11111111-1111-1111-1111-111111111111', 'billing-files:general-foreign']
    const scope = JSON.stringify(owner)
    const send = request => chrome.runtime.sendMessage({ type: 'PATMAIL_RECOVERY_RPC', request })
    const previous = await send({ op: 'get', slot: 'file-query', scope })
    return send({ op: 'put', slot: 'file-query', scope, expectedRevision: previous.value?.revision ?? 0, payload: {
      version: 1, owner, query: { caseVolume: 'BILL-RECOVERY', pageIndex: 1, pageSize: 100 }, result: null,
      selected: {}, form: null, downloadSelection: null, stripAppNoDot: true, pageSize: 100,
      templateName: '', readPages: [], activeTask: null,
    } })
  }, new URL(easyUrl).origin)
  assert.equal(saved.ok, true)
  await app.reload()
  await app.locator('.flow-steps-bar .step-item').first().click()
  const recoveredRefresh = app.getByRole('button', { name: '刷新验证账单', exact: true })
  await recoveredRefresh.waitFor()
  assert.equal(recoveredBillQueries, 0, 'restoring the saved query must not dispatch automatically')
  await recoveredRefresh.click()
  await app.locator('.recovered-bill-notice').waitFor({ state: 'hidden' })
  assert.equal(recoveredBillQueries, 1)
  report.pass('WAL-restored bill query can be verified from the top of step one')

  // 使用说明：请款.md 的 mermaid 图完整渲染且无错误
  await app.getByRole('tab', { name: '流程说明', exact: true }).click()
  await app.waitForFunction(
    count => document.querySelectorAll('.workflow-guide .mermaid-content > svg').length === count,
    guideDiagrams,
  )
  assert.equal(await app.locator('.workflow-guide .mermaid-error').count(), 0)
  await report.screenshot(app, 'billing-guide.png')
  report.pass('billing guide renders every mermaid diagram without errors')

  assert.deepEqual(errors, [], `browser errors: ${errors.join('\n')}`)
  console.log('billing e2e passed; workflow shell, template presets, steps and guide all verified')
} finally {
  context.off('page', watch)
  await mock.dispose()
  await context.close()
}
