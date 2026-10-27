import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { launchExtensionContext, extensionWorker, waitForContentScript } from './support/browser.mjs'
import { installEasyMock, easyFixtureUrl } from './support/easy-mock.mjs'
import { distDir, testResultsDir, resultPath } from './support/paths.mjs'

const context = await launchExtensionContext(distDir)
const expectedPeak = Number(process.env.PATMAIL_AUDIT_EXPECT_PEAK ?? 6)
const total = 1597
const starts = []
let active = 0
let peak = 0
let collecting = false
try {
  await installEasyMock(context, { fixtureHtml: `<!doctype html><title>分页验收</title><table id="table_element">
    <tr><td class="tdtitle">案件类型</td><td><select id="case_type"><option value="">不限</option><option value="31D1A147-2931-43B5-94AE-B72B1525BA8A">专利</option></select></td></tr>
    <tr id="is_file"><td><a class="img_hide">文件条件</a></td></tr>
    <tr name="file" style="display:none"><td class="tdtitle">文件描述</td><td><input id="filetype" tree_id="Treefiletype"></td></tr>
    <tr name="file" style="display:none"><td class="tdtitle">文件来源</td><td><select id="fileclass"><option value="general">所有文件</option></select></td></tr>
    <tr name="file" style="display:none"><td class="tdtitle">附件名称</td><td><input id="file_name"></td></tr>
    <tr name="file" style="display:none"><td class="tdtitle">下载名称</td><td><select id="filetemp"><option value="">请选择</option><option value="11111111-1111-4111-8111-111111111111">测试模板</option></select></td></tr>
    </table>`, profile: 'extension' })
  await context.route('http://183.36.43.66:88/**', async route => {
    const params = new URLSearchParams(route.request().postData() ?? '')
    if (params.get('Call') !== 'GetSearchFiles') return route.fallback()
    const page = Number(params.get('pageIndex'))
    const size = Number(params.get('pageSize'))
    if (collecting) {
      active += 1
      peak = Math.max(peak, active)
      starts.push({ page, size, at: Date.now(), active })
    }
    await new Promise(resolve => setTimeout(resolve, 300))
    const first = (page - 1) * size
    const rows = Array.from({ length: Math.max(0, Math.min(size, total - first)) }, (_, offset) => {
      const index = first + offset + 1
      return { file_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        file_no: `AUDIT${index}`, file_name: `并发验收-${index}.pdf`, file_desc: '专利证书',
        case_volume: 'AUDIT-CASE', app_no: 'CN20260001', customer_name: '测试客户' }
    })
    await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: JSON.stringify({
      ClientInfo: { IsLogin: true, Status: true, Result: true }, TableRowsCount: String(total), TableRows: rows
    }) })
    if (collecting) active -= 1
  })
  // 非业务网络同样拦截，测试从不访问真实服务器。
  await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === 'http://183.36.43.66:88'
    ? route.fallback() : route.fulfill({ status: 404, body: '' }))
  await context.addCookies([{ name: 'pm_fixture_session', value: 'active', url: easyFixtureUrl, httpOnly: true, sameSite: 'Lax' }])
  const worker = await extensionWorker(context)
  const easy = await context.newPage()
  await easy.goto(easyFixtureUrl, { waitUntil: 'domcontentloaded' })
  await waitForContentScript(worker, easy)
  // 通过 CDP 记录内容脚本实际发出的请求，而非只调用分页池函数。
  const cdp = await context.newCDPSession(easy)
  await cdp.send('Network.enable')
  const network = []
  cdp.on('Network.requestWillBeSent', event => {
    if (collecting && new URLSearchParams(event.request.postData ?? '').get('Call') === 'GetSearchFiles') {
      network.push({ requestId: event.requestId, timestamp: event.timestamp,
        page: Number(new URLSearchParams(event.request.postData).get('pageIndex')) })
    }
  })
  const app = await context.newPage()
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`)
  await app.getByRole('button', { name: '查询文件', exact: true }).waitFor()
  await app.getByLabel('我方文号', { exact: true }).first().fill('AUDIT-CASE')
  await app.getByRole('button', { name: '查询文件', exact: true }).click()
  await app.getByText('并发验收-1.pdf', { exact: true }).waitFor()
  await app.getByRole('button', { name: '校对最新字段', exact: true }).click()
  await app.getByText(/^已打开原网站的文件查询页/).waitFor()
  for (const label of ['文件描述', '文件来源', '附件名称', '设置下载文件名称']) {
    assert.equal(await app.getByText(label, { exact: true }).first().isVisible(), true, `原站折叠的${label}在查询后仍可用`)
  }
  collecting = true
  const began = Date.now()
  await app.getByRole('button', { name: '全选所有', exact: true }).click()
  await app.getByRole('button', { name: '全选所有', exact: true }).waitFor({ timeout: 30000 })
  const elapsedMs = Date.now() - began
  const selected = await app.getByText(/^已选 1597 个文件/).count()
  const completionNotices = await app.getByText(/^已全选 /).allTextContents()
  await app.waitForTimeout(2500) // 有意跨过旧版2秒清除时间，验证完成进度保留。
  const progressRetained = await app.getByRole('progressbar').isVisible()
  const report = { expectedPeak, peak, elapsedMs, selected: selected > 0 ? total : null, completionNotices, progressRetained, starts, network }
  await mkdir(testResultsDir, { recursive: true })
  await writeFile(resultPath('file-pages-optimized.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  assert.equal(selected > 0, true, '全选必须收齐1597个不同文件')
  assert.equal(starts.length, 15, '复用首屏100条，只请求其余15页')
  assert.equal(network.length, 15)
  assert.equal(starts.every(item => item.size === 100), true)
  assert.deepEqual(completionNotices, ['已全选 1597 个文件。'])
  assert.equal(progressRetained, true)
  assert.equal(peak, expectedPeak, '实际内容脚本请求峰值必须与验收目标一致')
} finally { await context.close() }
