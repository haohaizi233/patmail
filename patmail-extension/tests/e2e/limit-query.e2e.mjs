import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { distDir, fixturePagePath } from './support/paths.mjs'
import { easyFixtureUrl, installEasyMock } from './support/easy-mock.mjs'
import { extensionWorker, launchExtensionContext, waitForContentScript } from './support/browser.mjs'
import { createReporter } from './support/report.mjs'

const dist = distDir
const fixture = await readFile(fixturePagePath)
const easyUrl = easyFixtureUrl
const caseTypeId = '31D1A147-2931-43B5-94AE-B72B1525BA8A'
const report = createReporter()

let context
// eslint-disable-next-line no-useless-catch -- 存量豁免：保留 try/catch 以固定错误上报形态
try {
  context = await launchExtensionContext(dist)
} catch (error) {
  throw error
}

// Intercept the complete EASY origin so this test never contacts the live service.
const mock = await installEasyMock(context, { fixtureHtml: fixture, profile: 'limit-query' })
const apiCalls = mock.apiCalls
const errors = []
const requestFailures = []
const watch = page => {
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (/responded with a status of 503/.test(message.text())) return
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('requestfailed', request => {
    if (request.url().includes('/AjaxServers/')) requestFailures.push({ url: request.url(), failure: request.failure()?.errorText })
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
  await app.goto(`chrome-extension://${extensionId}/app.html#/limits`)
  await app.getByText('测试员', { exact: true }).waitFor({ timeout: 15_000 })
  await app.getByRole('heading', { name: '期限监控', exact: true }).waitFor()
  await app.getByText('当前账号还没有期限监控模板。', { exact: true }).waitFor({ timeout: 15_000 })

  const customer = app.getByLabel('客户名称', { exact: true })
  await customer.fill('广汽丰田')
  const queryButton = app.getByRole('button', { name: '查询', exact: true })
  assert.equal(await queryButton.isEnabled(), true)
  const requestPromise = easyPage.waitForRequest(request => {
    if (request.url() !== `${new URL(easyUrl).origin}/AjaxServers/Report.ashx`) return false
    const params = new URLSearchParams(request.postData() ?? '')
    return params.get('Call') === 'GetLimitMonitorCaseList' && params.get('customer_name') === '广汽丰田'
  }, { timeout: 15_000 })
  await queryButton.click()
  const request = await requestPromise
  const params = new URLSearchParams(request.postData() ?? '')
  assert.equal(request.method(), 'POST')
  assert.equal(params.get('Call'), 'GetLimitMonitorCaseList')
  assert.equal(params.get('customer_name'), '广汽丰田')
  assert.equal(params.get('is_first'), 'false')
  assert.equal(params.get('pageIndex'), '1')
  assert.equal(params.get('pageSize'), '10')
  assert.equal(params.get('case_type'), caseTypeId)
  assert.equal(params.get('type'), 'all')
  assert.equal(params.get('log_pagename'), 'LimitMonitor.aspx')
  // The documented 115 field order includes one extra business_type_other field
  // used by the current page script, so the current request has 116 keys.
  assert.equal([...params.keys()].length, 116)
  for (const field of ['country', 'case_volume', 'case_volume_customer', 'app_no', 'ctrl_proc', 'customer_code', 'colsel', '_t']) {
    assert.equal(params.has(field), true, `missing GetLimitMonitorCaseList field: ${field}`)
  }
  await app.getByText('广汽丰田案件', { exact: true }).waitFor({ timeout: 15_000 })
  await app.getByText('广汽丰田', { exact: true }).last().waitFor()
  // 计数标签自 b347745 起就是「期限共 N 条」（src/shell/pages/LimitPage.vue），这里锁定当前真实文案。
  await app.getByText('期限共 1 条', { exact: true }).waitFor()
  report.pass('limits query sends Report.ashx/GetLimitMonitorCaseList and renders the returned row')

  mock.setLimitMode('expired')
  await customer.fill('会话失效')
  const expiredRequest = easyPage.waitForRequest(request => {
    if (request.url() !== `${new URL(easyUrl).origin}/AjaxServers/Report.ashx`) return false
    const params = new URLSearchParams(request.postData() ?? '')
    return params.get('Call') === 'GetLimitMonitorCaseList' && params.get('customer_name') === '会话失效'
  }, { timeout: 15_000 })
  await queryButton.click()
  await expiredRequest
  await app.getByText('EASY 登录已失效，请在原网站重新登录后检测。', { exact: true }).waitFor({ timeout: 15_000 })
  report.pass('limits query surfaces a direct session-expiry response')

  mock.setLimitMode('http-error')
  await customer.fill('网关错误')
  const errorRequest = easyPage.waitForRequest(request => {
    if (request.url() !== `${new URL(easyUrl).origin}/AjaxServers/Report.ashx`) return false
    const params = new URLSearchParams(request.postData() ?? '')
    return params.get('Call') === 'GetLimitMonitorCaseList' && params.get('customer_name') === '网关错误'
  }, { timeout: 15_000 })
  await queryButton.click()
  await errorRequest
  await app.getByText('EASY 暂时没有返回列表，可以再查一次。', { exact: true }).waitFor({ timeout: 15_000 })
  assert.equal(apiCalls.filter(call => call.path === '/AjaxServers/Report.ashx' && call.params.get('Call') === 'GetLimitMonitorCaseList' && call.params.get('customer_name') === '网关错误').length, 3)
  report.pass('limits query surfaces a direct HTTP error response after read-only retries')

  assert(apiCalls.some(call => call.path === '/AjaxServers/Login.ashx' && call.params.get('Call') === 'GetUserModel' && call.authenticated))
  assert.equal(requestFailures.length, 0, `unexpected EASY request failures: ${JSON.stringify(requestFailures)}`)
  assert.deepEqual(errors, [], `browser errors: ${errors.join('\n')}`)
  console.log('limit-query e2e passed; all EASY requests were fixture-intercepted')
} finally {
  context.off('page', watch)
  await mock.dispose()
  await context.close()
}
