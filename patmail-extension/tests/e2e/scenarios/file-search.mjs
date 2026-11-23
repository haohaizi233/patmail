import assert from 'node:assert/strict'

export async function runFileSearch(ctx) {
  // eslint-disable-next-line no-unused-vars -- 存量豁免：保留解构占位与接口形态
  const { report, context, worker, extensionId, page, panel, host, url, easyUrl, apiCalls, visible, tabFor, showPanel } = ctx
  const check = (name, action) => report.check(name, action)
  // eslint-disable-next-line no-unused-vars -- 存量豁免：保留解构占位与接口形态
  const note = (line) => report.note(line)
  await check('file search reuses same-origin browser session and supports pagination, refresh, empty, expiry', async () => {
    const easyPage = await context.newPage()
    await easyPage.setViewportSize({ width: 1200, height: 800 })
    await easyPage.goto(easyUrl)
    await tabFor(easyPage)
    assert.equal(await easyPage.locator('patmail-root').count(), 0)
    await showPanel(easyPage)
    const easyPanel = easyPage.locator('patmail-root').locator('.panel')
    await easyPanel.getByText('未登录', { exact: true }).waitFor()
    assert(apiCalls.some(call => call.path === '/AjaxServers/Login.ashx' && !call.authenticated))
    await context.addCookies([{ name: 'pm_fixture_session', value: 'active', url: easyUrl,
      httpOnly: true, sameSite: 'Lax' }])
    await easyPanel.getByRole('button', { name: '重新检测' }).click()
    await easyPanel.getByText('已登录', { exact: true }).waitFor()
    await easyPanel.getByText('测试员', { exact: true }).waitFor()
    assert(apiCalls.some(call => call.path === '/AjaxServers/Login.ashx' && call.authenticated))
    await easyPanel.getByLabel('我方文号', { exact: true }).fill('A+123')
    await easyPanel.getByRole('button', { name: '查询文件' }).click()
    await easyPanel.getByText('共 21 个文件').waitFor()
    await easyPanel.getByText('通知书-1.pdf').waitFor()
    await report.screenshot(easyPanel, 'patmail-file-search.png')
    const first = apiCalls.filter(call => call.path === '/AjaxServers/CaseInfo.ashx').at(-1)
    assert(first)
    assert.equal(first.method, 'POST')
    assert.equal(first.authenticated, true)
    assert.equal(first.params.get('case_volume'), 'A+123')
    assert.equal(first.params.get('Call'), 'GetSearchFiles')
    assert.equal(first.params.get('_doneCallback'), null)
    // API/04-文件查询.md 记录 117 项顺序（含旧前端回调产物 _doneCallback，现不发送），
    // 本所开启 JIAQUAN 后原站还会多提交 is_vip、specialtyid（见 file-search-params 单测），
    // 因此当前真实请求为 116 + 2 = 118 键，这里锁定真实契约。
    assert.equal([...first.params.keys()].length, 118)
    const pageSize = easyPage.locator('patmail-root').getByRole('combobox', { name: '每页数量' })
    await pageSize.click()
    assert.deepEqual(await easyPage.locator('patmail-root').getByRole('option').allTextContents(), ['20', '50', '100'])
    await easyPage.locator('patmail-root').getByRole('option', { name: '50', exact: true }).click()
    await easyPanel.getByRole('navigation', { name: '文件分页', exact: true }).getByText('第 1 / 1 页').waitFor()
    assert.equal(apiCalls.filter(call => call.path === '/AjaxServers/CaseInfo.ashx').at(-1)?.params.get('pageSize'), '50')
    await pageSize.click()
    await easyPage.locator('patmail-root').getByRole('option', { name: '20', exact: true }).click()
    await easyPanel.getByRole('navigation', { name: '文件分页', exact: true }).getByText('第 1 / 2 页').waitFor()
    await easyPanel.getByRole('navigation', { name: '文件分页', exact: true }).getByRole('button', { name: '下一页' }).click()
    await easyPanel.getByText('通知书-2.pdf').waitFor()
    assert.equal(apiCalls.filter(call => call.path === '/AjaxServers/CaseInfo.ashx').at(-1)?.params.get('pageIndex'), '2')
    await easyPanel.getByRole('button', { name: '刷新' }).click()
    await easyPanel.getByText('通知书-2.pdf').waitFor()
    await easyPanel.getByLabel('附件名称', { exact: true }).fill('error')
    await easyPanel.getByRole('button', { name: '查询文件' }).click()
    await easyPanel.getByText('模拟业务失败').waitFor()
    const countBeforeRetry = apiCalls.length
    await easyPanel.getByRole('button', { name: '刷新' }).click()
    await easyPanel.getByText('模拟业务失败').waitFor()
    assert.equal(apiCalls.length, countBeforeRetry + 1)
    assert.equal(apiCalls.at(-1)?.params.get('file_name'), 'error')
    await easyPanel.getByLabel('我方文号', { exact: true }).fill('')
    await easyPanel.getByLabel('附件名称', { exact: true }).fill('empty')
    await easyPanel.getByRole('button', { name: '查询文件' }).click()
    await easyPanel.getByText('没有符合条件的文件。').waitFor()
    await easyPanel.getByLabel('附件名称', { exact: true }).fill('')
    const countBeforeBlank = apiCalls.length
    // 2026-10-27 起产品有意改为「空条件直接禁用查询按钮并说明缺什么」（QueryTemplateSection
    // 的 canSubmit/submitHint），不再走提交后报「请输入查询条件。」的旧路径（该文案仍保留在
    // file-search-params 的 API 层契约与单测里）。这里按现行契约断言：按钮禁用、提示可见、零请求。
    const submit = easyPanel.getByRole('button', { name: '查询文件' })
    await submit.waitFor()
    assert.equal(await submit.isDisabled(), true, '空条件时查询按钮应禁用')
    await easyPanel.getByText('还缺一项能定位的查询条件', { exact: false }).waitFor()
    assert.equal(apiCalls.length, countBeforeBlank)
    await context.clearCookies()
    await easyPanel.getByLabel('我方文号', { exact: true }).fill('A-123')
    await easyPanel.getByRole('button', { name: '查询文件' }).click()
    // 掉登录先在查询结果区报「EASY 登录已失效…」，并且这次请求确实没带登录态。
    await easyPanel.getByText('EASY 登录已失效，请在原网站重新登录后检测。').waitFor()
    assert.equal(apiCalls.at(-1)?.authenticated, false)
    // 会话卡片按「最近一次检测」口径更新（SessionService 记住登录过，掉线后检测结论才是
    // expired 而不是 unauthenticated），产品提示也要求「重新登录后检测」，所以按同一条路径
    // 点「重新检测」断言状态从「已登录」转到「登录已失效」。
    await easyPanel.getByRole('button', { name: '重新检测' }).click()
    await easyPanel.getByText('登录已失效', { exact: true }).waitFor()
    await easyPanel.getByRole('button', { name: '页面扫描' }).click()
    await easyPanel.getByRole('button', { name: '扫描页面' }).click()
    await easyPanel.getByLabel('扫描结果').waitFor()
    await easyPage.close()
  })
}
