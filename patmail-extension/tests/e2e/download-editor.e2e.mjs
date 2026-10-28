import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
import { launchExtensionContext, extensionWorker, waitForContentScript } from './support/browser.mjs'
import { installEasyMock, easyFixtureUrl } from './support/easy-mock.mjs'
import { distDir, testResultsDir, resultPath } from './support/paths.mjs'
import { ensureStreamBridge } from './support/stream-bridge.mjs'

const templateId = 'd9896997-1e83-4c7d-9a49-da69ba56e7aa'
const recipe = { new_filename: 'app_no;-;case_name;-;file_desc', file_name_type: 'colname;txt;colname;txt;colname' }
const context = await launchExtensionContext(distDir, { viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
const calls = []
let completeDownloads = false
const pdf = Buffer.from('%PDF-1.4\nRepeat download fixture\n%%EOF')
const info = { IsLogin: true, Status: true, Result: true }
const stopBridge = await ensureStreamBridge()
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
      body = { file_names: `配方${params.get('new_filename').split(';')[1]}验收.pdf` }
    }
    if (call === 'DownLoad') body = completeDownloads ? { file_guid: templateId, file_size: pdf.length }
      : { ClientInfo: { ...info, Status: false, Result: false, Message: '配方回归在打包处停止' } }
    if (new URL(route.request().url()).pathname.endsWith('FileHandler.ashx')) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf })
    }
    if (body) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ClientInfo: info, ...body }) })
    return route.fallback()
  })
  await context.route(/^https?:\/\//, route => ['http://183.36.43.66:88', 'http://127.0.0.1:42843'].includes(new URL(route.request().url()).origin)
    ? route.fallback() : route.fulfill({ status: 404, body: '' }))
  await context.addCookies([{ name: 'pm_fixture_session', value: 'active', url: easyFixtureUrl, httpOnly: true, sameSite: 'Lax' }])
  const worker = await extensionWorker(context)
  const easy = await context.newPage()
  await easy.goto(easyFixtureUrl)
  await waitForContentScript(worker, easy)
  const app = await context.newPage()
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`)
  const downloadPath = await mkdtemp(join(testResultsDir, 'repeat-download-'))
  const cdp = await context.newCDPSession(app)
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath, eventsEnabled: true })
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
  completeDownloads = true
  const verifiedDownloads = []
  for (const separator of ['-', '再次']) {
    await row.locator('.download-part-text').first().fill(separator)
    await app.getByRole('button', { name: '下载已选', exact: true }).click()
    await app.getByText('浏览器下载完成', { exact: false }).waitFor({ timeout: 30000 })
    const downloads = await worker.evaluate(() => chrome.downloads.search({}).then(items => items.filter(item => item.state === 'complete')))
    assert.equal(downloads.length, verifiedDownloads.length + 1)
    const latest = downloads.find(item => !verifiedDownloads.some(prior => prior.id === item.id))
    const reader = new ZipReader(new Uint8ArrayReader(await readFile(latest.filename)))
    try {
      const entries = await reader.getEntries()
      assert.deepEqual(entries.map(entry => entry.filename), [`配方${separator}验收.pdf`])
      assert.deepEqual(Buffer.from(await entries[0].getData(new Uint8ArrayWriter(), { checkSignature: true })), pdf)
    } finally { await reader.close() }
    verifiedDownloads.push({ id: latest.id, entry: `配方${separator}验收.pdf` })
    assert.equal((await app.locator('.check-rainbow').getAttribute('aria-valuetext')).includes('生成下载名称'), true)
  }
  assert.deepEqual(calls.slice(1), [
    { newFilename: recipe.new_filename, fileNameType: recipe.file_name_type },
    { newFilename: 'app_no;再次;case_name;-;file_desc', fileNameType: recipe.file_name_type }
  ])
  await template.scrollIntoViewIfNeeded()
  await mkdir(testResultsDir, { recursive: true })
  await row.screenshot({ path: resultPath('download-name-editor.png') })
  await writeFile(resultPath('download-name-editor.json'), JSON.stringify({ parts: 5, invalidBlocked: true, sameTemplateRestored: true, calls, verifiedDownloads, passed: true }, null, 2))
  console.log('Dynamic download editor passed: query once, change naming recipe, download twice, verify ZIP entries and CRC')
} finally { await context.close(); stopBridge() }
