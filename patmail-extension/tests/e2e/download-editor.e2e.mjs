import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { launchExtensionContext, extensionWorker, waitForContentScript } from './support/browser.mjs'
import { installEasyMock, easyFixtureUrl } from './support/easy-mock.mjs'
import { distDir, testResultsDir, resultPath } from './support/paths.mjs'

const templateId = 'd9896997-1e83-4c7d-9a49-da69ba56e7aa'
const recipe = { new_filename: 'app_no;-;case_name;-;file_desc', file_name_type: 'colname;txt;colname;txt;colname' }
const context = await launchExtensionContext(distDir, { viewport: { width: 1600, height: 1000 } })
const calls = []
const info = { IsLogin: true, Status: true, Result: true }
try {
  await installEasyMock(context, { fixtureHtml: '<!doctype html><title>下载名称回归</title>', profile: 'extension' })
  await context.route('http://183.36.43.66:88/**', async route => {
    const params = new URLSearchParams(route.request().postData() ?? '')
    const call = params.get('Call')
    let body
    if (call === 'GetFileTempNameList') body = { TempNameList: [{ id: templateId, temp_name: '华峰官文', ...recipe }] }
    if (call === 'GetFlowdirection') body = { DownLoadFileName: [
      { value: 'app_no', text_zh_cn: '申请号' },
      { value: 'case_name', text_zh_cn: '案件名称' },
      { value: 'file_desc', text_zh_cn: '文件描述' },
      { value: 'fixtxt', text_zh_cn: '固定字符' }
    ] }
    if (call === 'GetSearchFiles') body = { TableRowsCount: '1', TableRows: [{
      file_id: templateId, file_no: 'EDITOR001', file_name: '配方验收.pdf', file_desc: '专利证书', case_volume: 'AUDIT'
    }] }
    if (call === 'GetFileName') {
      calls.push({ newFilename: params.get('new_filename'), fileNameType: params.get('file_name_type') })
      body = { file_names: '配方验收.pdf' }
    }
    // 校验界面配方确实进入真实桥接链路；不在这份UI回归里另外取包。
    if (call === 'DownLoad') body = { ClientInfo: { ...info, Status: false, Result: false, Message: '配方回归在打包处停止' } }
    if (body) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ClientInfo: info, ...body }) })
    return route.fallback()
  })
  await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === 'http://183.36.43.66:88'
    ? route.fallback() : route.fulfill({ status: 404, body: '' }))
  await context.addCookies([{ name: 'pm_fixture_session', value: 'active', url: easyFixtureUrl, httpOnly: true, sameSite: 'Lax' }])
  const worker = await extensionWorker(context)
  const easy = await context.newPage()
  await easy.goto(easyFixtureUrl)
  await waitForContentScript(worker, easy)
  const app = await context.newPage()
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`)
  const row = app.locator('.download-name-row')
  const template = row.locator('.download-template-select [role="combobox"]')
  await template.click()
  await app.getByRole('option', { name: '华峰官文', exact: true }).click()
  await row.locator('.download-name-part').last().waitFor()
  assert.equal(await row.locator('.download-name-part').count(), 5)
  assert.deepEqual(await row.locator('.download-part-text').evaluateAll(inputs => inputs.map(node => node.value)), ['-', '-'])
  await row.locator('.download-part-text').first().fill('_')
  await app.getByLabel('我方文号', { exact: true }).first().fill('AUDIT')
  await app.getByRole('button', { name: '查询文件', exact: true }).click()
  await app.getByText('配方验收.pdf', { exact: true }).waitFor()
  await app.getByRole('button', { name: '全选本页', exact: true }).click()
  await row.locator('.download-part-text').first().fill('')
  await app.getByRole('button', { name: '下载已选', exact: true }).click()
  await app.locator('.download-name-error').getByText('第2段固定字符不能为空。', { exact: true }).waitFor()
  assert.equal(calls.length, 0, '无效配方不能请求命名或退回原名')
  await row.locator('.download-part-text').first().fill('_')
  await app.getByRole('button', { name: '下载已选', exact: true }).click()
  await app.getByText('配方回归在打包处停止', { exact: false }).waitFor()
  assert.deepEqual(calls, [{ newFilename: 'app_no;_;case_name;-;file_desc', fileNameType: recipe.file_name_type }])
  await template.click()
  await app.getByRole('option', { name: '华峰官文', exact: true }).click()
  assert.equal(await row.locator('.download-part-text').first().inputValue(), '-', '同一模板重选也要恢复原配方')
  await template.scrollIntoViewIfNeeded()
  await mkdir(testResultsDir, { recursive: true })
  await row.screenshot({ path: resultPath('download-name-editor.png') })
  await writeFile(resultPath('download-name-editor.json'), JSON.stringify({ parts: 5, invalidBlocked: true, sameTemplateRestored: true, calls, passed: true }, null, 2))
  console.log('Dynamic download editor passed: 5 parts, fixed text, UI edit → query → download IPC → GetFileName recipe')
} finally { await context.close() }
