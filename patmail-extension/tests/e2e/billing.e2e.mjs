import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { distDir, fixturePagePath } from './support/paths.mjs'
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

const context = await launchExtensionContext(dist, { viewport: { width: 1440, height: 1000 } })
const mock = await installEasyMock(context, { fixtureHtml: fixture, profile: 'extension' })
await context.route('**/AjaxServers/Report.ashx*', async route => {
  const request = route.request()
  const call = new URLSearchParams(request.postData() ?? '').get('Call') ?? new URL(request.url()).searchParams.get('Call')
  const client = { IsLogin: true, Status: true, Result: true }
  const body = call === 'FeeSearch' ? {
    ClientInfo: client,
    total: 3,
    rows: [
      { fee_id: 'pct-test', case_volume: 'PA123PCT', business_type_name: 'PCT国际阶段', fee_class: 'O',
        fee_name: '国际申请费', currency_id: 'CNY', amount: 100, request_status: '未请款' },
      { fee_id: 'pct-requested', case_volume: 'PA124PCT', fee_class: 'O',
        fee_name: '国际申请费', currency_id: 'CNY', amount: 300, request_status: '审核中' },
      { fee_id: 'foreign-test', case_volume: 'PA123-EP', fee_class: 'O',
        fee_name: '申请费', currency_id: 'CNY', amount: 200, request_status: '未请款' }
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
  await app.getByText('测试员', { exact: true }).waitFor({ timeout: 15_000 })

  // 工作台卡片「请款」→ 请款工作流（默认通用涉外模板 + 步骤 1）
  await app.locator('.billing-workflow-card .sea-open').click()
  await app.locator('.billing-workflow-page').waitFor({ timeout: 15_000 })
  report.pass('billing workflow opens from the workflow catalogue card')

  for (const label of ['通用涉外请款单', '美的涉外费用清单', '美的 PCT 费用清单']) {
    await app.locator('.template-preset-bar').getByText(label, { exact: true }).waitFor({ timeout: 15_000 })
  }
  const selectedTitle = app.locator('.template-radio-item.selected .tpl-title-line b')
  assert.equal(await selectedTitle.innerText(), '通用涉外请款单', '默认选中通用涉外模板')
  const presetBadge = app.locator('.template-preset-bar .preset-badge')
  assert.ok((await presetBadge.innerText()).includes('第三方费用'), '涉外模板预填第三方费用')
  assert.ok((await app.locator('.flow-steps-bar .step-title').first().innerText()).includes('文件管理（账单抓取）'))
  report.pass('billing template picker lists three presets with general-foreign default')

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

  await app.locator('.step-2-section').getByRole('button', { name: '查询', exact: true }).click()
  await app.getByRole('button', { name: /进入请款单导出.*已选 1 笔/ }).waitFor()
  await app.getByRole('row').filter({ hasText: 'PA124PCT' }).getByRole('checkbox').check()
  await feeResultNext.click()
  const bottomExport = app.locator('.export-execute-card').getByRole('button', { name: /导出 Excel 请款表/ })
  const topExport = navigation.getByRole('button', { name: '导出 Excel 请款表', exact: true })
  await bottomExport.waitFor()
  assert.equal(await topExport.isDisabled(), true)
  assert.equal(await bottomExport.isDisabled(), true)
  await app.getByRole('checkbox', { name: /已核对并确认导出/ }).check()
  const pendingDownload = app.waitForEvent('download', { timeout: 10_000 })
  await topExport.click()
  const download = await pendingDownload
  assert.match(download.suggestedFilename(), /^美的PCT费用清单-\d{8}\.xlsx$/)
  assert.equal(await download.failure(), null)
  const workbook = await readFile(await download.path())
  assert.equal(workbook.subarray(0, 4).toString('hex'), '504b0304')
  await app.locator('.template-preset-bar').getByText('通用涉外请款单', { exact: true }).click()
  await app.getByRole('button', { name: /进入请款单导出.*已选 0 笔/ }).waitFor()
  assert.equal(await step2Next.isDisabled(), true)
  report.pass('PCT filters the fixture, downloads a workbook and invalidates selection on template change')

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
